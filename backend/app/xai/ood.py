"""Out-Of-Distribution (OOD) Guardrail Pipeline.

Protects against classifying non-X-rays, color photos, blank slides, or extreme images.
Executes 5 sequential verification stages:
1. File format, decode, and dimension sanity.
2. Aspect ratio, blank/constant check, and color difference check.
3. Softmax confidence thresholding (< 0.70).
4. Penultimate feature space Mahalanobis distance against training distribution.
5. Rejection with friendly, distinct error messages.
"""

import io
import json
import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image
from typing import Dict, Optional, Tuple

from backend.app import config

class OODDetector:
    def __init__(self, ood_stats_file: Optional[str] = None):
        self.stats_file = ood_stats_file or (config.CHECKPOINTS_DIR / "ood_stats.json")
        self.stats = None
        self._load_stats()

    def _load_stats(self):
        if self.stats_file and self.stats_file.exists():
            try:
                with open(self.stats_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.stats = {
                        "mean_0": np.array(data["class_0_mean"]),
                        "mean_1": np.array(data["class_1_mean"]),
                        "inv_cov": np.array(data["inv_covariance"]),
                        "threshold": float(data["mahalanobis_threshold"]),
                    }
            except Exception:
                self.stats = None

    def preprocess_image(self, file_bytes: bytes) -> Tuple[bool, Optional[str], Optional[torch.Tensor], Optional[Image.Image]]:
        """Validates format, aspect ratio, color content, and converts to 28x28 grayscale tensor."""
        try:
            pil_img = Image.open(io.BytesIO(file_bytes))
        except Exception:
            return False, "File is not a valid decodable image file.", None, None

        w, h = pil_img.size
        # Aspect ratio check
        aspect = w / max(h, 1)
        if aspect < 0.4 or aspect > 2.5:
            return False, "Extreme aspect ratio detected. Image does not appear to be a chest X-ray.", None, None

        # Check for strongly colored images (non-radiological)
        if pil_img.mode in ("RGB", "RGBA"):
            rgb_arr = np.array(pil_img.convert("RGB")).astype(np.float32) / 255.0
            r, g, b = rgb_arr[:, :, 0], rgb_arr[:, :, 1], rgb_arr[:, :, 2]
            color_diff = (np.mean(np.abs(r - g)) + np.mean(np.abs(g - b)) + np.mean(np.abs(r - b))) / 3.0
            if color_diff > config.MAX_COLOR_DIFF:
                return False, "Image contains significant color saturation. Chest radiographs must be grayscale.", None, None

        # Convert to grayscale
        gray_img = pil_img.convert("L")
        arr = np.array(gray_img).astype(np.float32) / 255.0

        # Blank or low-contrast check
        if np.std(arr) < config.MIN_IMAGE_STD:
            return False, "Image is blank, constant, or has insufficient contrast to be a diagnostic X-ray.", None, None

        # Resize to 28x28 matching PneumoniaMNIST model input
        resized_pil = gray_img.resize((28, 28), Image.Resampling.BILINEAR)
        norm_arr = (np.array(resized_pil).astype(np.float32) / 255.0 - 0.5) / 0.5
        tensor = torch.from_numpy(norm_arr).unsqueeze(0).unsqueeze(0)  # (1, 1, 28, 28)

        return True, None, tensor, gray_img

    def check_ood(
        self,
        model: torch.nn.Module,
        tensor: torch.Tensor,
        confidence_threshold: float = config.CONFIDENCE_THRESHOLD,
    ) -> Tuple[bool, str, Dict]:
        """Runs model inference, softmax confidence check, and Mahalanobis feature distance check."""
        model.eval()
        with torch.no_grad():
            features = model.extract_features(tensor).cpu().numpy().squeeze()  # (64,)
            logits = model.fc2(model.dropout(torch.from_numpy(features).unsqueeze(0)))
            probs = F.softmax(logits, dim=1).cpu().numpy().squeeze()

        predicted_class = int(np.argmax(probs))
        confidence = float(probs[predicted_class])

        # Stage 1: Softmax confidence floor check
        if confidence < confidence_threshold:
            return False, "Image does not appear to be a chest X-ray. Please upload a valid X-ray image.", {
                "confidence": confidence,
                "reason": "Low prediction confidence (< 70%)",
            }

        # Stage 2: Feature-space Mahalanobis check
        if self.stats is None:
            self._load_stats()

        if self.stats is not None:
            inv_cov = self.stats["inv_cov"]
            # Distance to class 0 and class 1
            diff0 = features - self.stats["mean_0"]
            d0 = np.sqrt(diff0.dot(inv_cov).dot(diff0))

            diff1 = features - self.stats["mean_1"]
            d1 = np.sqrt(diff1.dot(inv_cov).dot(diff1))

            min_dist = min(d0, d1)
            # Rejection beyond the 99th percentile threshold (with 15% tolerance margin)
            max_allowed = self.stats["threshold"] * 1.15
            if min_dist > max_allowed:
                return False, "Image feature geometry falls outside chest X-ray distribution. Please upload a valid X-ray image.", {
                    "mahalanobis_distance": round(float(min_dist), 2),
                    "threshold": round(float(self.stats["threshold"]), 2),
                    "reason": "Feature space outlier",
                }

        return True, "Valid chest radiograph", {
            "predicted_class": predicted_class,
            "label": "Pneumonia" if predicted_class == 1 else "Normal",
            "confidence": round(confidence, 4),
            "probs": [round(float(p), 4) for p in probs],
            "features": features,
        }

ood_detector = OODDetector()

"""Scratch script for Sections D and E: Predict Pipeline, Parity, and OOD Tests."""

import sys
import io
import os
import shutil
import tempfile
from pathlib import Path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

import numpy as np
import torch
import json
from PIL import Image, ImageFilter, ImageDraw
from sklearn.metrics import confusion_matrix, classification_report

from backend.app import config
from backend.app.data.loader import load_medmnist_raw, MedMNISTDataset
from backend.app.main import _process_prediction, get_inference_model
from backend.app.xai.ood import ood_detector
from backend.app.fl.server import FLServer

def run_parity_and_samples():
    print("=== D: PARITY TEST ===")
    _, _, (test_imgs, test_lbls) = load_medmnist_raw()
    test_lbls = test_lbls.squeeze()
    
    normal_indices = np.where(test_lbls == 0)[0]
    pneumonia_indices = np.where(test_lbls == 1)[0]
    
    np.random.seed(42)
    selected_normal = np.random.choice(normal_indices, 100, replace=False)
    selected_pneumonia = np.random.choice(pneumonia_indices, 100, replace=False)
    
    test_200_indices = np.concatenate([selected_normal, selected_pneumonia])
    y_true = np.array([0]*100 + [1]*100)
    
    y_pred = []
    rejections = []
    
    # Run through real predict function by saving as PNG in memory
    for idx in test_200_indices:
        raw_img = test_imgs[idx] # (28, 28)
        pil_img = Image.fromarray(raw_img.astype(np.uint8), mode="L")
        buf = io.BytesIO()
        pil_img.save(buf, format="PNG")
        bytes_data = buf.getvalue()
        
        res = _process_prediction(bytes_data)
        if res.get("status") == "accepted":
            y_pred.append(res["predicted_class"])
        else:
            y_pred.append(-1)
            rejections.append((idx, res.get("reason"), res.get("error_type")))
            
    # Also evaluate direct model on these 200 in PyTorch without PNG roundtrip
    model = get_inference_model()
    model.eval()
    norm_200 = ((test_imgs[test_200_indices].astype(np.float32) / 255.0) - 0.5) / 0.5
    tensor_200 = torch.from_numpy(norm_200).unsqueeze(1)
    with torch.no_grad():
        logits_direct = model(tensor_200)
        y_direct = torch.argmax(logits_direct, dim=1).numpy()
        
    valid_mask = [p != -1 for p in y_pred]
    acc_pipeline = np.mean(np.array(y_pred)[valid_mask] == y_true[valid_mask]) if any(valid_mask) else 0.0
    acc_direct = np.mean(y_direct == y_true)
    
    cm_pipeline = confusion_matrix(y_true[valid_mask], np.array(y_pred)[valid_mask], labels=[0, 1]).tolist()
    cm_direct = confusion_matrix(y_true, y_direct, labels=[0, 1]).tolist()
    
    # Per-class recall
    rec_0 = cm_pipeline[0][0] / max(sum(cm_pipeline[0]), 1)
    rec_1 = cm_pipeline[1][1] / max(sum(cm_pipeline[1]), 1)
    
    # Predicted-class distribution over 200 random test images
    rand_200_indices = np.random.choice(len(test_imgs), 200, replace=False)
    rand_preds = []
    for idx in rand_200_indices:
        raw_img = test_imgs[idx]
        pil_img = Image.fromarray(raw_img.astype(np.uint8), mode="L")
        buf = io.BytesIO()
        pil_img.save(buf, format="PNG")
        res = _process_prediction(buf.getvalue())
        rand_preds.append(res.get("prediction", res.get("status")))
        
    from collections import Counter
    dist_200 = dict(Counter(rand_preds))
    
    print(f"Parity Test: Direct Acc={acc_direct:.4f}, Pipeline Acc={acc_pipeline:.4f}, Rejections={len(rejections)}")
    print(f"Direct CM:\n{cm_direct}")
    print(f"Pipeline CM:\n{cm_pipeline}")
    print(f"Recall: Class 0 (Normal)={rec_0:.4f}, Class 1 (Pneumonia)={rec_1:.4f}")
    print(f"Random 200 Distribution: {dist_200}")
    
    # Built-in samples check
    print("\n=== BUILT-IN SAMPLES ===")
    sample_dir = BASE_DIR / "sample_images"
    sample_files = ["normal_sample.png", "pneumonia_sample.png", "invalid_sample.png"]
    samples_res = {}
    for sf in sample_files:
        p = sample_dir / sf
        with open(p, "rb") as f:
            b = f.read()
        im = Image.open(io.BytesIO(b))
        res = _process_prediction(b)
        samples_res[sf] = {
            "size": im.size,
            "mode": im.mode,
            "status": res.get("status"),
            "is_ood": res.get("is_ood"),
            "error_type": res.get("error_type"),
            "reason": res.get("reason"),
            "prediction": res.get("prediction"),
            "probabilities": res.get("probabilities"),
            "explanation": res.get("explanation"),
        }
        print(f"\n--- {sf} ({im.size}, {im.mode}) ---")
        print("Status:", res.get("status"))
        print("Prediction:", res.get("prediction"))
        print("Probs:", res.get("probabilities"))
        if "explanation" in res:
            print("Clinical:", res["explanation"].get("clinical"))
            print("Plain:", res["explanation"].get("plain"))
            print("Zone Analysis:", res["explanation"].get("zone_analysis"))
            
    # Check if the two valid ones are identical in explanation or zone
    identical_explanations = False
    if "explanation" in samples_res["normal_sample.png"] and "explanation" in samples_res["pneumonia_sample.png"]:
        e1 = samples_res["normal_sample.png"]["explanation"]
        e2 = samples_res["pneumonia_sample.png"]["explanation"]
        identical_explanations = (e1 == e2)
    print("\nAre normal & pneumonia explanations identical?", identical_explanations)
    
    return {
        "parity": {
            "direct_acc": acc_direct,
            "pipeline_acc": acc_pipeline,
            "direct_cm": cm_direct,
            "pipeline_cm": cm_pipeline,
            "rejections": rejections,
            "rec_normal": rec_0,
            "rec_pneumonia": rec_1,
            "dist_200": dist_200
        },
        "samples": samples_res,
        "identical_explanations": identical_explanations
    }

def run_ood_suite():
    print("\n=== E: OOD TESTS ===")
    np.random.seed(42)
    _, _, (test_imgs, _) = load_medmnist_raw()
    sample_xray_np = test_imgs[0] # (28, 28) uint8
    base_xray_pil = Image.fromarray(sample_xray_np.astype(np.uint8), mode="L")
    
    ood_cases = {}
    
    # 1. Random RGB noise (100x100)
    rgb_noise = np.random.randint(0, 256, (100, 100, 3), dtype=np.uint8)
    im1 = Image.fromarray(rgb_noise, "RGB")
    b1 = io.BytesIO(); im1.save(b1, "PNG"); ood_cases["random_rgb_noise"] = b1.getvalue()
    
    # 2. Colourful synthetic flower-like image
    im2 = Image.new("RGB", (120, 120), (255, 255, 255))
    draw2 = ImageDraw.Draw(im2)
    draw2.ellipse([20, 20, 100, 100], fill=(255, 0, 128), outline=(0, 255, 0))
    draw2.ellipse([40, 40, 80, 80], fill=(255, 255, 0))
    b2 = io.BytesIO(); im2.save(b2, "PNG"); ood_cases["flower_image"] = b2.getvalue()
    
    # 3. Grayscale gradient (100x100)
    grad = np.tile(np.linspace(0, 255, 100, dtype=np.uint8), (100, 1))
    im3 = Image.fromarray(grad, "L")
    b3 = io.BytesIO(); im3.save(b3, "PNG"); ood_cases["grayscale_gradient"] = b3.getvalue()
    
    # 4. Grayscale noise (100x100)
    gray_noise = np.random.randint(0, 256, (100, 100), dtype=np.uint8)
    im4 = Image.fromarray(gray_noise, "L")
    b4 = io.BytesIO(); im4.save(b4, "PNG"); ood_cases["grayscale_noise"] = b4.getvalue()
    
    # 5. Test X-ray blurred radius 3
    im5 = base_xray_pil.filter(ImageFilter.GaussianBlur(radius=3))
    b5 = io.BytesIO(); im5.save(b5, "PNG"); ood_cases["blurred_radius_3"] = b5.getvalue()
    
    # 6. Test X-ray upscaled to 512x512 saved as JPEG
    im6 = base_xray_pil.resize((512, 512), Image.Resampling.BILINEAR)
    b6 = io.BytesIO(); im6.save(b6, "JPEG"); ood_cases["upscaled_512_jpeg"] = b6.getvalue()
    
    # 7. Inverted X-ray
    inv_np = 255 - sample_xray_np
    im7 = Image.fromarray(inv_np.astype(np.uint8), "L")
    b7 = io.BytesIO(); im7.save(b7, "PNG"); ood_cases["inverted_xray"] = b7.getvalue()
    
    # 8. X-ray as RGB PNG (3 equal channels)
    rgb_equal = np.stack([sample_xray_np]*3, axis=-1).astype(np.uint8)
    im8 = Image.fromarray(rgb_equal, "RGB")
    b8 = io.BytesIO(); im8.save(b8, "PNG"); ood_cases["xray_rgb_equal"] = b8.getvalue()
    
    # 9. As RGBA
    rgba_equal = np.stack([sample_xray_np]*3 + [np.full_like(sample_xray_np, 255)], axis=-1).astype(np.uint8)
    im9 = Image.fromarray(rgba_equal, "RGBA")
    b9 = io.BytesIO(); im9.save(b9, "PNG"); ood_cases["xray_rgba"] = b9.getvalue()
    
    # 10. As 16-bit grayscale
    im10_np = (sample_xray_np.astype(np.uint16) * 257) # Scale 0..255 to 0..65535
    im10 = Image.fromarray(im10_np, "I;16")
    b10 = io.BytesIO()
    try:
        im10.save(b10, "PNG")
        ood_cases["xray_16bit_grayscale"] = b10.getvalue()
    except Exception as e:
        print("Error saving 16-bit grayscale PNG:", e)
        ood_cases["xray_16bit_grayscale"] = None
        
    ood_results = {}
    for name, raw_bytes in ood_cases.items():
        if raw_bytes is None:
            ood_results[name] = {"error": "Failed to create"}
            continue
        try:
            res = _process_prediction(raw_bytes)
            ood_results[name] = {
                "status": res.get("status"),
                "is_ood": res.get("is_ood"),
                "error_type": res.get("error_type"),
                "reason": res.get("reason"),
                "details": res.get("details"),
                "prediction": res.get("prediction"),
                "confidence": res.get("confidence")
            }
        except Exception as e:
            import traceback
            ood_results[name] = {
                "status": "exception",
                "traceback": traceback.format_exc()
            }
        print(f"OOD Case {name}: {ood_results[name]}")
        
    # Fraction of VALIDATION images passing all OOD stages
    print("\n--- VALIDATION SET PASSING FRACTION ---")
    _, (val_imgs, val_lbls), _ = load_medmnist_raw()
    val_passed = 0
    val_rejection_reasons = []
    for i in range(len(val_imgs)):
        im_val = Image.fromarray(val_imgs[i].astype(np.uint8), "L")
        b_val = io.BytesIO(); im_val.save(b_val, "PNG")
        res = _process_prediction(b_val.getvalue())
        if res.get("status") == "accepted":
            val_passed += 1
        else:
            val_rejection_reasons.append(res.get("reason"))
            
    val_pass_fraction = val_passed / len(val_imgs)
    print(f"Validation Passing: {val_passed} / {len(val_imgs)} ({val_pass_fraction*100:.2f}%)")
    
    # Try loading OrganAMNIST or DermaMNIST to TEMP dir
    print("\n--- MEDMNIST OOD REJECTION RATE (DermaMNIST / OrganAMNIST) ---")
    temp_dir = tempfile.mkdtemp()
    other_ood_res = {}
    try:
        import medmnist
        for ds_name in ["dermamnist", "organamnist"]:
            try:
                print(f"Attempting download of {ds_name} to {temp_dir}...")
                info = medmnist.INFO[ds_name]
                DataClass = getattr(medmnist, info["python_class"])
                ds = DataClass(split="test", download=True, root=temp_dir, size=28)
                imgs = ds.imgs[:200]
                rejected_count = 0
                reasons = []
                for img_arr in imgs:
                    # Convert to PIL
                    if img_arr.ndim == 3 and img_arr.shape[-1] == 3:
                        im_other = Image.fromarray(img_arr.astype(np.uint8), "RGB")
                    else:
                        im_other = Image.fromarray(img_arr.squeeze().astype(np.uint8), "L")
                    b_other = io.BytesIO(); im_other.save(b_other, "PNG")
                    res = _process_prediction(b_other.getvalue())
                    if res.get("status") == "rejected":
                        rejected_count += 1
                        reasons.append(res.get("reason"))
                rate = rejected_count / len(imgs)
                other_ood_res[ds_name] = {
                    "total": len(imgs),
                    "rejected": rejected_count,
                    "rejection_rate": rate,
                    "sample_reasons": reasons[:5]
                }
                print(f"{ds_name}: Rejection Rate = {rejected_count}/{len(imgs)} ({rate*100:.1f}%)")
                break # 1 is enough as requested: "If OrganAMNIST or DermaMNIST can be loaded"
            except Exception as e:
                print(f"Could not evaluate {ds_name}: {e}")
                other_ood_res[ds_name] = str(e)
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
        
    return {
        "cases": ood_results,
        "val_pass_fraction": val_pass_fraction,
        "val_total": len(val_imgs),
        "val_passed": val_passed,
        "other_dataset_ood": other_ood_res
    }

if __name__ == "__main__":
    d_res = run_parity_and_samples()
    e_res = run_ood_suite()
    
    out = {
        "D": d_res,
        "E": e_res
    }
    def default_serializer(o):
        if isinstance(o, (np.integer, np.int64, np.int32)):
            return int(o)
        if isinstance(o, (np.floating, np.float32, np.float64)):
            return float(o)
        if isinstance(o, np.ndarray):
            return o.tolist()
        return str(o)

    with open(BASE_DIR / "_recon" / "d_e_results.json", "w") as f:
        json.dump(out, f, indent=2, default=default_serializer)
    print("Done! Saved to _recon/d_e_results.json")

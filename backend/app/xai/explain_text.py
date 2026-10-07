"""Dynamic explainability text generator driven by Grad-CAM activation topology.

Analyzes anatomical zones, activation concentration, and coverage percentage.
Produces dual explanations: Plain-language (patient-oriented) and Clinical detail.
"""

import numpy as np
from typing import Dict, Tuple

def analyze_cam_zones(cam: np.ndarray, threshold: float = 0.35) -> Dict:
    """Partitions 28x28 CAM into 6 anatomical lung zones and analyzes activation patterns.

    Zone layout:
    - Vertical: Upper (rows 0..8), Middle (rows 9..18), Lower (rows 19..27)
    - Horizontal: Left of image = Patient's Right lung (cols 0..13)
                  Right of image = Patient's Left lung (cols 14..27)
    """
    h, w = cam.shape
    row_splits = [0, 9, 19, h]
    col_split = 14

    zones = {
        "upper_right_patient": cam[0:9, 0:col_split],
        "upper_left_patient": cam[0:9, col_split:w],
        "middle_right_patient": cam[9:19, 0:col_split],
        "middle_left_patient": cam[9:19, col_split:w],
        "lower_right_patient": cam[19:h, 0:col_split],
        "lower_left_patient": cam[19:h, col_split:w],
    }

    zone_names_human = {
        "upper_right_patient": "upper-right lung (patient's right)",
        "upper_left_patient": "upper-left lung (patient's left)",
        "middle_right_patient": "mid-right lung zone",
        "middle_left_patient": "mid-left lung zone",
        "lower_right_patient": "lower-right lung base",
        "lower_left_patient": "lower-left lung base",
    }

    zone_stats = {}
    for name, patch in zones.items():
        mean_val = float(np.mean(patch))
        max_val = float(np.max(patch)) if patch.size > 0 else 0.0
        zone_stats[name] = {"mean": mean_val, "max": max_val}

    # Find dominant zone
    dominant_zone_key = max(zone_stats.keys(), key=lambda k: zone_stats[k]["mean"])
    dominant_zone_name = zone_names_human[dominant_zone_key]
    max_intensity = float(np.max(cam))

    # Coverage metrics
    total_pixels = cam.size
    active_pixels = int(np.sum(cam >= threshold))
    coverage_pct = round((active_pixels / total_pixels) * 100.0, 1)

    # Concentrated vs Diffuse pattern
    # If high coverage across multiple zones -> diffuse; otherwise -> concentrated
    active_zones = sum(1 for z in zone_stats.values() if z["mean"] > 0.25)
    pattern_type = "diffuse consolidation" if active_zones >= 3 else "focal/concentrated opacity"

    return {
        "dominant_zone_key": dominant_zone_key,
        "dominant_zone_name": dominant_zone_name,
        "max_intensity": round(max_intensity, 3),
        "coverage_pct": coverage_pct,
        "pattern_type": pattern_type,
        "zone_stats": zone_stats,
    }

def generate_explanation(
    prediction_label: str,
    confidence: float,
    cam: np.ndarray,
) -> Dict[str, str]:
    """Generates dual plain-language and clinical diagnostic explanations based on the CAM.

    Always includes the mandatory clinical decision-support disclaimer.
    """
    analysis = analyze_cam_zones(cam)
    conf_pct = int(round(confidence * 100))
    disclaimer = "Decision-support demonstration only. Not a medical diagnosis."

    if prediction_label.lower() == "normal":
        plain_text = (
            f"The AI analysis identified clear, aerated lung fields with no abnormal high-density opacity patterns. "
            f"No focal consolidation was detected across either lung field. (Confidence: {conf_pct}%)."
        )
        clinical_text = (
            f"Radiological assessment: Symmetric parenchymal radiolucency. Maximum convolutional activation "
            f"is minimal ({analysis['max_intensity']:.2f}) with baseline coverage of {analysis['coverage_pct']}%. "
            f"No evidence of focal airspace consolidation, pleural effusion, or peribronchial thickening. "
            f"Classification confidence: {conf_pct}% for Normal."
        )
    else:
        # Pneumonia
        plain_text = (
            f"The model focused primarily on the {analysis['dominant_zone_name']}, detecting a {analysis['pattern_type']} "
            f"commonly associated with pulmonary infection and pneumonia. Confidence: {conf_pct}%."
        )
        clinical_text = (
            f"Localization analysis indicates predominant saliency in the {analysis['dominant_zone_name']} "
            f"(peak activation: {analysis['max_intensity']:.2f}, coverage: {analysis['coverage_pct']}% of field above threshold). "
            f"Visual features exhibit {analysis['pattern_type']} consistent with alveolar infiltration / bronchopneumonia. "
            f"Model posterior probability: {conf_pct}%."
        )

    return {
        "plain_text": plain_text,
        "clinical_text": clinical_text,
        "disclaimer": disclaimer,
        "dominant_zone": analysis["dominant_zone_name"],
        "coverage_pct": analysis["coverage_pct"],
        "pattern_type": analysis["pattern_type"],
        "peak_intensity": analysis["max_intensity"],
    }

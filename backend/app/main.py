"""FastAPI Application Server for Federated Healthcare Security.

Exposes REST and WebSocket endpoints for:
- Orchestrating federated learning simulations (Start, Pause, Resume, Stop, Reset)
- Real-time event streaming via WebSocket (/ws)
- Poisoning attack detection & metric inspection
- Blockchain & Mock Ledger audit log queries, tamper demonstration, and integrity checks
- Clinical Chest X-ray inference with OOD rejection guardrails & Grad-CAM explainability
- Comparative scenario analytics (Clean vs. Attacked vs. Defended)
"""

import asyncio
import base64
import io
import json
import logging
import os
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import (
    FastAPI,
    WebSocket,
    WebSocketDisconnect,
    HTTPException,
    UploadFile,
    File,
    Query,
    BackgroundTasks,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from PIL import Image
import torch

from backend.app import config
from backend.app.config import RunConfig, SCENARIOS
from backend.app.state import training_state
from backend.app.orchestrator import orchestrator
from backend.app.fl.model import PneumoniaCNN
from backend.app.xai.ood import ood_detector
from backend.app.xai.gradcam import GradCAM
from backend.app.xai.explain_text import generate_explanation

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("api")

app = FastAPI(
    title="Federated Healthcare Security API",
    description="Zero-Trust Poisoning Defense & Blockchain Audit Logger for Healthcare Federated Learning",
    version="2.0.0",
)

# Enable CORS for Next.js and frontend dev servers
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Global Model Cache for Fast Clinical Inference
# ---------------------------------------------------------------------------
_inference_model: Optional[PneumoniaCNN] = None


def get_inference_model() -> PneumoniaCNN:
    """Loads the best defended model checkpoint into memory for inference."""
    global _inference_model
    best_path = config.CHECKPOINTS_DIR / "best_model.pth"

    if _inference_model is None:
        model = PneumoniaCNN(num_classes=config.NUM_CLASSES)
        if best_path.exists():
            try:
                state_dict = torch.load(best_path, map_location="cpu")
                model.load_state_dict(state_dict)
                logger.info(f"Loaded best model checkpoint from {best_path}")
            except Exception as e:
                logger.warning(f"Could not load checkpoint ({e}), using initialized weights.")
        else:
            logger.info("No checkpoint found at best_model.pth. Using freshly initialized model.")
        model.eval()
        _inference_model = model

    return _inference_model


def reload_inference_model():
    """Forces reloading checkpoint after a new training run."""
    global _inference_model
    _inference_model = None
    return get_inference_model()


# ---------------------------------------------------------------------------
# WebSocket Endpoint for Live Event Streaming
# ---------------------------------------------------------------------------
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Streams live federated training events, node statuses, detection verdicts, and blocks."""
    await training_state.connect_ws(websocket)
    # Send immediate initial status sync
    await websocket.send_json({
        "type": "init",
        "data": {
            "is_running": training_state.is_running,
            "is_paused": training_state.is_paused,
            "current_round": training_state.current_round,
            "total_rounds": training_state.total_rounds,
            "current_scenario": training_state.current_scenario,
            "blockchain_mode": orchestrator.blockchain.mode,
        },
    })
    try:
        while True:
            # Keep connection alive and accept incoming ping/commands
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                cmd = msg.get("command")
                if cmd == "pause":
                    training_state.pause()
                elif cmd == "resume":
                    training_state.resume()
                elif cmd == "stop":
                    training_state.stop()
            except Exception:
                pass
    except WebSocketDisconnect:
        training_state.disconnect_ws(websocket)
    except Exception as e:
        logger.warning(f"WebSocket error: {e}")
        training_state.disconnect_ws(websocket)


# ---------------------------------------------------------------------------
# Training Orchestration Endpoints
# ---------------------------------------------------------------------------
@app.post("/api/start")
async def start_training(run_cfg: RunConfig):
    """Starts a federated training simulation in the background."""
    if training_state.is_running:
        raise HTTPException(
            status_code=400,
            detail="A simulation run is already in progress. Stop or reset it first.",
        )

    # Launch background simulation task
    asyncio.create_task(orchestrator.run_simulation(run_cfg))
    return {
        "status": "started",
        "scenario": run_cfg.scenario,
        "rounds": run_cfg.rounds,
        "num_clients": run_cfg.num_clients,
        "detection": run_cfg.detection,
        "attack_type": run_cfg.attack_type,
    }


@app.post("/api/pause")
async def pause_training():
    """Pauses the currently running simulation."""
    if not training_state.is_running:
        raise HTTPException(status_code=400, detail="No simulation is running.")
    training_state.pause()
    return {"status": "paused", "current_round": training_state.current_round}


@app.post("/api/resume")
async def resume_training():
    """Resumes a paused simulation."""
    if not training_state.is_running:
        raise HTTPException(status_code=400, detail="No simulation is running.")
    training_state.resume()
    return {"status": "resumed", "current_round": training_state.current_round}


@app.post("/api/stop")
async def stop_training():
    """Stops the currently running simulation."""
    training_state.stop()
    return {"status": "stopped"}


@app.post("/api/reset")
async def reset_training():
    """Resets orchestrator state, detector history, and in-memory events."""
    training_state.reset()
    orchestrator.detector.reset()
    return {"status": "reset"}


@app.get("/api/status")
async def get_status():
    """Returns current runtime state of orchestrator and training."""
    best_meta_file = config.CHECKPOINTS_DIR / "best_model_meta.json"
    best_meta = {}
    if best_meta_file.exists():
        try:
            with open(best_meta_file, "r") as f:
                best_meta = json.load(f)
        except Exception:
            pass

    return {
        "is_running": training_state.is_running,
        "is_paused": training_state.is_paused,
        "current_round": training_state.current_round,
        "total_rounds": training_state.total_rounds,
        "current_scenario": training_state.current_scenario,
        "active_config": training_state.active_config,
        "active_ws_count": len(training_state.active_websockets),
        "blockchain_mode": orchestrator.blockchain.mode,
        "total_ledger_entries": len(orchestrator.blockchain.get_entries()),
        "best_model": best_meta,
    }


@app.get("/api/config")
async def get_config():
    """Returns preset scenarios and system hyperparameters."""
    return {
        "scenarios": SCENARIOS,
        "defaults": {
            "num_clients": config.NUM_CLIENTS,
            "rounds": config.NUM_ROUNDS,
            "batch_size": config.BATCH_SIZE,
            "learning_rate": config.LEARNING_RATE,
            "detection_threshold": config.DETECTION_THRESHOLD,
            "mad_threshold": config.MAD_THRESHOLD,
            "persistence_k": config.PERSISTENCE_K,
            "persistence_m": config.PERSISTENCE_M,
            "warmup_rounds": config.WARMUP_ROUNDS,
            "default_malicious_clients": config.DEFAULT_MALICIOUS_CLIENTS,
        },
    }


# ---------------------------------------------------------------------------
# Blockchain & Mock Ledger Endpoints
# ---------------------------------------------------------------------------
@app.get("/api/ledger")
async def get_ledger(limit: Optional[int] = Query(None, ge=1, le=1000)):
    """Returns audit log entries from the blockchain or cryptographic mock ledger."""
    entries = orchestrator.blockchain.get_entries(limit=limit)
    return {
        "mode": orchestrator.blockchain.mode,
        "total": len(entries),
        "entries": entries,
    }


@app.get("/api/ledger/verify")
async def verify_ledger():
    """Cryptographically verifies the entire SHA-256 block hash chain."""
    return orchestrator.blockchain.verify_integrity()


@app.post("/api/ledger/tamper")
async def tamper_ledger(index: int = Query(0, ge=0)):
    """Demonstrates tamper detection by forcibly altering a past block."""
    result = orchestrator.blockchain.tamper_attempt(index=index)
    return result


@app.post("/api/ledger/reset")
async def reset_ledger():
    """Clears all ledger entries from memory and disk."""
    orchestrator.blockchain.reset()
    return {"status": "ledger_reset"}


# ---------------------------------------------------------------------------
# Clinical Inference & XAI Endpoints
# ---------------------------------------------------------------------------
@app.get("/api/samples")
async def get_sample_images():
    """Returns preset sample images for one-click testing in the UI."""
    sample_defs = [
        {
            "id": "normal",
            "name": "Normal Radiograph",
            "description": "Clear lung fields, symmetric aeration, healthy parenchyma.",
            "expected": "Normal",
            "file": "normal_sample.png",
            "type": "valid",
        },
        {
            "id": "pneumonia",
            "name": "Pneumonia Infiltrate",
            "description": "Focal airspace consolidation with dense opacity.",
            "expected": "Pneumonia",
            "file": "pneumonia_sample.png",
            "type": "valid",
        },
        {
            "id": "invalid",
            "name": "Non-Radiological Object",
            "description": "Out-Of-Distribution image intended to trigger guardrail rejection.",
            "expected": "Rejected",
            "file": "invalid_sample.png",
            "type": "invalid",
        },
    ]

    results = []
    for s in sample_defs:
        img_path = config.SAMPLE_IMAGES_DIR / s["file"]
        data_url = None
        if img_path.exists():
            try:
                with open(img_path, "rb") as f:
                    b64 = base64.b64encode(f.read()).decode("utf-8")
                    data_url = f"data:image/png;base64,{b64}"
            except Exception:
                pass
        results.append({**s, "image_url": data_url})

    return results


@app.post("/api/predict")
async def predict_image(file: UploadFile = File(...)):
    """Runs 5-stage OOD guardrail filtering, PneumoniaCNN classification, and Grad-CAM generation."""
    contents = await file.read()
    return _process_prediction(contents)


@app.post("/api/predict/sample/{sample_id}")
async def predict_preset_sample(sample_id: str):
    """Runs inference directly on one of the built-in sample images."""
    file_map = {
        "normal": "normal_sample.png",
        "pneumonia": "pneumonia_sample.png",
        "invalid": "invalid_sample.png",
    }
    if sample_id not in file_map:
        raise HTTPException(status_code=404, detail="Sample not found.")

    target_path = config.SAMPLE_IMAGES_DIR / file_map[sample_id]
    if not target_path.exists():
        raise HTTPException(status_code=404, detail="Sample file missing on disk.")

    with open(target_path, "rb") as f:
        contents = f.read()

    return _process_prediction(contents)


def _process_prediction(image_bytes: bytes) -> Dict:
    """Core prediction pipeline with multi-stage OOD guardrail checks."""
    model = get_inference_model()

    # Preprocessing & format check
    is_valid_format, error_msg, tensor, pil_img = ood_detector.preprocess_image(image_bytes)
    if not is_valid_format:
        return {
            "status": "rejected",
            "is_ood": True,
            "error_type": "Format/Contrast Error",
            "reason": error_msg,
            "disclaimer": "Decision-support demonstration only. Not a medical diagnosis.",
        }

    # Softmax confidence & Mahalanobis distance check
    is_valid_xray, ood_msg, details = ood_detector.check_ood(model, tensor)
    if not is_valid_xray:
        return {
            "status": "rejected",
            "is_ood": True,
            "error_type": "Out-Of-Distribution Rejection",
            "reason": ood_msg,
            "details": details,
            "disclaimer": "Decision-support demonstration only. Not a medical diagnosis.",
        }

    # Generate Grad-CAM for predicted class
    pred_class = details["predicted_class"]
    gradcam = GradCAM(model, model.get_last_conv_layer())
    cam = gradcam.generate_cam(tensor, target_class=pred_class)
    heatmap_b64 = gradcam.overlay_heatmap(cam, pil_img, alpha=0.5)

    # Dynamic plain-language and clinical explanation
    explanations = generate_explanation(
        prediction_label=details["label"],
        confidence=details["confidence"],
        cam=cam,
    )

    return {
        "status": "accepted",
        "is_ood": False,
        "prediction": details["label"],
        "predicted_class": pred_class,
        "confidence": details["confidence"],
        "confidence_percentage": round(details["confidence"] * 100, 1),
        "probabilities": {
            "normal": details["probs"][0],
            "pneumonia": details["probs"][1],
        },
        "heatmap_data_url": f"data:image/png;base64,{heatmap_b64}",
        "explanation": explanations,
        "disclaimer": "Decision-support demonstration only. Not a medical diagnosis.",
    }


# ---------------------------------------------------------------------------
# Results & Comparative Analytics Endpoints
# ---------------------------------------------------------------------------
@app.get("/api/results")
async def get_results_summary():
    """Aggregates round metrics across Clean, Attacked, and Defended scenarios for comparison charts."""
    scenarios = ["clean", "attacked", "defended"]
    results_by_scenario = {}

    for sc in scenarios:
        sc_dir = config.RESULTS_DIR / sc
        metrics_file = sc_dir / "metrics.json"
        if metrics_file.exists():
            try:
                with open(metrics_file, "r") as f:
                    results_by_scenario[sc] = json.load(f)
            except Exception:
                results_by_scenario[sc] = None
        else:
            results_by_scenario[sc] = None

    return {
        "scenarios": results_by_scenario,
        "available_scenarios": [k for k, v in results_by_scenario.items() if v is not None],
    }


@app.get("/api/results/{scenario}/csv")
async def get_scenario_csv(scenario: str):
    """Downloads per-round metrics as a CSV file."""
    csv_file = config.RESULTS_DIR / scenario / "round_metrics.csv"
    if not csv_file.exists():
        raise HTTPException(status_code=404, detail="Metrics CSV not found for this scenario.")
    return FileResponse(
        csv_file,
        media_type="text/csv",
        filename=f"{scenario}_metrics.csv",
    )


@app.get("/api/results/{scenario}/replay")
async def get_scenario_replay(scenario: str):
    """Fetches full event sequence for frontend replay mode."""
    log_file = config.RESULTS_DIR / scenario / "event_log.json"
    if not log_file.exists():
        raise HTTPException(status_code=404, detail="Event log not found for this scenario.")
    with open(log_file, "r") as f:
        events = json.load(f)
    return {"scenario": scenario, "total_events": len(events), "events": events}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)

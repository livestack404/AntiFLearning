"""Scratch script for Sections B and C: Environment and Detector Evaluation."""

import sys
import time
from pathlib import Path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

import numpy as np
import torch
import json

from backend.app import config
from backend.app.fl.server import FLServer
from backend.app.fl.client import HospitalClient
from backend.app.data.partition import partition_data
from backend.app.data.loader import get_test_loader
from backend.app.detection.detector import PoisonDetector

def check_env():
    t_ver = torch.__version__
    cuda_avail = torch.cuda.is_available()
    gpu_name = torch.cuda.get_device_name(0) if cuda_avail else "None (CPU)"
    
    # Check client training device
    client_loaders, _ = partition_data(num_clients=8, batch_size=32, seed=42, size=28)
    client0 = HospitalClient(0, client_loaders[0])
    actual_device = str(client0.device)
    
    # Measure seconds per FL round at 28x28
    server = FLServer(conv1_channels=16, conv2_channels=32)
    clients = [HospitalClient(cid, client_loaders[cid]) for cid in range(8)]
    test_loader = get_test_loader(batch_size=32, size=28)
    
    t0 = time.time()
    global_w = server.get_global_weights()
    updates = {}
    samples = {}
    for c in clients:
        delta, num_s, _ = c.train(global_w, epochs=1, lr=0.001)
        updates[c.client_id] = delta
        samples[c.client_id] = num_s
    server.aggregate([(updates[i], samples[i]) for i in range(8)])
    metrics = server.evaluate(test_loader)
    round_sec = time.time() - t0
    
    env_info = {
        "torch_version": t_ver,
        "cuda_available": cuda_avail,
        "gpu_name": gpu_name,
        "client_device": actual_device,
        "seconds_per_round": round(round_sec, 3),
        "round_accuracy": metrics["accuracy"]
    }
    return env_info

def run_detector_experiment(attack_type="label_flip"):
    seed = 42
    rounds = 20
    malicious_ids = [3, 7]
    detection_enabled = True
    
    torch.manual_seed(seed)
    np.random.seed(seed)
    
    server = FLServer(conv1_channels=16, conv2_channels=32)
    detector = PoisonDetector(mad_threshold=2.50, persistence_k=2, persistence_m=3, warmup_rounds=2)
    client_loaders, _ = partition_data(num_clients=8, batch_size=32, seed=seed, size=28)
    clients = [HospitalClient(cid, client_loaders[cid]) for cid in range(8)]
    test_loader = get_test_loader(batch_size=32, size=28)
    
    round_summaries = []
    first_12_rounds_tables = []
    honest_flagged_events = []
    honest_excluded_events = []
    max_excluded = 0
    
    for r in range(1, rounds + 1):
        global_w = server.get_global_weights()
        client_updates = {}
        client_samples = {}
        for c in clients:
            cid = c.client_id
            is_mal = (cid in malicious_ids)
            delta, num_s, _ = c.train(
                global_w, epochs=1, lr=0.001,
                is_malicious=is_mal, attack_type=attack_type
            )
            client_updates[cid] = delta
            client_samples[cid] = num_s
            
        verdicts, trusted = detector.evaluate_round(r, client_updates, detection_enabled=True)
        
        excl_count = sum(1 for cid in range(8) if verdicts[cid]["is_excluded"])
        if excl_count > max_excluded:
            max_excluded = excl_count
            
        # Trusted aggregation
        trusted_tuples = [(client_updates[cid], client_samples[cid]) for cid in trusted]
        server.aggregate(trusted_tuples)
        metrics = server.evaluate(test_loader)
        
        round_summaries.append({
            "round": r,
            "excluded_count": excl_count,
            "accuracy": metrics["accuracy"],
            "loss": metrics["loss"],
            "trusted_count": len(trusted)
        })
        
        # Track honest client anomalies
        for cid in range(8):
            if cid not in malicious_ids:
                if verdicts[cid]["is_flagged"]:
                    honest_flagged_events.append((r, cid))
                if verdicts[cid]["is_excluded"]:
                    honest_excluded_events.append((r, cid))
                    
        # Table for first 12 rounds
        if r <= 12:
            table_rows = []
            for cid in range(8):
                v = verdicts[cid]
                table_rows.append({
                    "cid": cid,
                    "is_malicious": cid in malicious_ids,
                    "sim": v["similarity"],
                    "robust_z": v["robust_z"],
                    "flagged": "Y" if v["is_flagged"] else "N",
                    "status": v["status"],
                    "k_flags": v.get("k_flags", 0)
                })
            first_12_rounds_tables.append({
                "round": r,
                "rows": table_rows
            })
            
    return {
        "attack_type": attack_type,
        "round_summaries": round_summaries,
        "first_12_rounds_tables": first_12_rounds_tables,
        "honest_flagged_events": honest_flagged_events,
        "honest_excluded_events": honest_excluded_events,
        "max_excluded": max_excluded
    }

if __name__ == "__main__":
    print("=== ENVIRONMENT CHECK ===")
    env = check_env()
    print(json.dumps(env, indent=2))
    
    print("\n=== RUNNING DETECTOR: LABEL FLIP ===")
    res_lf = run_detector_experiment("label_flip")
    
    print("\n=== RUNNING DETECTOR: SIGN FLIP ===")
    res_sf = run_detector_experiment("sign_flip")
    
    out = {
        "env": env,
        "label_flip": res_lf,
        "sign_flip": res_sf
    }
    with open(BASE_DIR / "_recon" / "b_c_results.json", "w") as f:
        json.dump(out, f, indent=2)
    print("Done! Saved to _recon/b_c_results.json")

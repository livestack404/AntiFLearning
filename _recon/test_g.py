"""Scratch script for Section G: Ledger Tests."""

import sys
import time
from pathlib import Path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

import httpx
import json

def run_ledger_api_tests():
    client = httpx.Client(base_url="http://127.0.0.1:8000", timeout=60.0)
    
    # 1. Check /api/status for ganache
    status_init = client.get("/api/status").json()
    print("Initial status:", status_init)
    
    # 2. Trigger short defended run (2 rounds, speed_ms=0)
    start_payload = {
        "scenario": "defended",
        "num_clients": 8,
        "malicious_ids": [3, 7],
        "detection": True,
        "attack_type": "label_flip",
        "rounds": 2,
        "local_epochs": 1,
        "batch_size": 32,
        "learning_rate": 0.001,
        "speed_ms": 0,
        "seed": 42
    }
    start_resp = client.post("/api/start", json=start_payload).json()
    print("Start resp:", start_resp)
    
    # Wait for simulation to finish
    for _ in range(60):
        time.sleep(1)
        st = client.get("/api/status").json()
        if not st.get("is_running"):
            print("Simulation finished at round:", st.get("current_round"))
            break
            
    # 3. GET /api/ledger
    ledger_data = client.get("/api/ledger").json()
    entries = ledger_data.get("entries", [])
    has_run_id = all("run_id" in e for e in entries) if entries else False
    sample_entry_keys = list(entries[0].keys()) if entries else []
    
    print(f"Total ledger entries: {len(entries)}")
    print(f"Does each entry have a run_id? {has_run_id}")
    print(f"Entry keys: {sample_entry_keys}")
    
    # 4. Verify before tampering
    verify_before = client.get("/api/ledger/verify").json()
    print("Verify before tamper:", verify_before)
    
    # 5. Tamper index 2
    tamper_resp = client.post("/api/ledger/tamper?index=2").json()
    print("Tamper index 2 resp:", tamper_resp)
    
    # 6. Verify after tampering
    verify_after = client.get("/api/ledger/verify").json()
    print("Verify after tamper:", verify_after)
    
    results = {
        "ganache_running": status_init.get("blockchain_mode") == "ganache",
        "api_status_mode": status_init.get("blockchain_mode"),
        "total_entries": len(entries),
        "has_run_id": has_run_id,
        "sample_entry_keys": sample_entry_keys,
        "sample_entry": entries[0] if entries else None,
        "verify_before": verify_before,
        "tamper_resp": tamper_resp,
        "verify_after": verify_after
    }
    
    with open(BASE_DIR / "_recon" / "g_results.json", "w") as f:
        json.dump(results, f, indent=2)
    print("Done! Saved to _recon/g_results.json")

if __name__ == "__main__":
    run_ledger_api_tests()

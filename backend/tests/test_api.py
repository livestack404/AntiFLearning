"""Integration tests for FastAPI endpoints."""

import pytest
from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)

def test_api_status():
    response = client.get("/api/status")
    assert response.status_code == 200
    data = response.json()
    assert "is_running" in data
    assert "blockchain_mode" in data

def test_api_config():
    response = client.get("/api/config")
    assert response.status_code == 200
    data = response.json()
    assert "scenarios" in data
    assert "clean" in data["scenarios"]
    assert "attacked" in data["scenarios"]
    assert "defended" in data["scenarios"]

def test_api_samples():
    response = client.get("/api/samples")
    assert response.status_code == 200
    samples = response.json()
    assert len(samples) >= 3
    sample_ids = [s["id"] for s in samples]
    assert "normal" in sample_ids
    assert "pneumonia" in sample_ids
    assert "invalid" in sample_ids

def test_api_predict_sample_invalid():
    # Calling predict on invalid sample should return rejected status
    response = client.post("/api/predict/sample/invalid")
    assert response.status_code == 200
    res = response.json()
    assert res["status"] == "rejected"
    assert res["is_ood"] is True

def test_api_predict_sample_valid():
    response = client.post("/api/predict/sample/pneumonia")
    assert response.status_code == 200
    res = response.json()
    assert res["status"] in ["accepted", "rejected"]
    if res["status"] == "accepted":
        assert "heatmap_data_url" in res
        assert "explanation" in res

def test_api_ledger_flow():
    # Verify ledger query
    res = client.get("/api/ledger")
    assert res.status_code == 200
    assert "entries" in res.json()

    # Verify integrity endpoint
    verify_res = client.get("/api/ledger/verify")
    assert verify_res.status_code == 200
    assert "valid" in verify_res.json()

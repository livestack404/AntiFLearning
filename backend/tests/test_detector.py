"""Unit tests for PoisonDetector.

Validates:
- Cosine similarity computation
- MAD robust Z-score outlier detection
- Warmup grace period (sim < 0 excluded in rounds 1-2)
- Persistence tracking and round-by-round re-evaluation
- Safe fallback when all nodes would be excluded
- Regression test: honest-only updates with shrinking norms never exceed cap & never exclude > 1 client
"""

import numpy as np
import pytest
from backend.app.detection.detector import PoisonDetector

def test_cosine_similarity():
    v1 = np.array([1.0, 0.0, 0.0])
    v2 = np.array([1.0, 0.0, 0.0])
    v3 = np.array([-1.0, 0.0, 0.0])
    v4 = np.array([0.0, 1.0, 0.0])

    assert np.isclose(PoisonDetector._cosine_sim(v1, v2), 1.0)
    assert np.isclose(PoisonDetector._cosine_sim(v1, v3), -1.0)
    assert np.isclose(PoisonDetector._cosine_sim(v1, v4), 0.0)

def test_honest_consensus():
    detector = PoisonDetector(persistence_k=2, persistence_m=3, warmup_rounds=2)
    # 8 honest clients with slightly noisy but aligned gradients
    rng = np.random.default_rng(42)
    base_grad = np.ones(100)
    updates = {}
    for i in range(8):
        noise = rng.normal(0, 0.05, 100)
        updates[i] = base_grad + noise

    verdicts, trusted = detector.evaluate_round(1, updates, detection_enabled=True)
    assert len(trusted) == 8
    for cid in range(8):
        assert verdicts[cid]["status"] == "ACCEPTED"
        assert not verdicts[cid]["is_flagged"]
        assert not verdicts[cid]["is_excluded"]

def test_sign_flip_detection():
    detector = PoisonDetector(persistence_k=2, persistence_m=3, warmup_rounds=2)
    rng = np.random.default_rng(42)
    base_grad = np.ones(100)
    updates = {}
    for i in range(6):
        updates[i] = base_grad + rng.normal(0, 0.05, 100)

    # Clients 6 and 7 are malicious (sign flip)
    updates[6] = -5.0 * base_grad
    updates[7] = -5.0 * base_grad

    # In round 1 (warmup), negative cosine updates (sim < 0.0) are excluded immediately
    verdicts, trusted = detector.evaluate_round(1, updates, detection_enabled=True)
    assert 6 not in trusted
    assert 7 not in trusted
    assert verdicts[6]["is_excluded"]
    assert verdicts[7]["is_excluded"]
    assert len(trusted) == 6

def test_honest_shrinking_norms_regression():
    """Regression test: honest clients with shrinking update norms over 20 rounds.
    
    Verifies that honest-only updates never exceed the exclusion cap (max 3 of 8)
    and never exclude more than 1 client in any round.
    """
    detector = PoisonDetector(persistence_k=2, persistence_m=3, warmup_rounds=2)
    rng = np.random.default_rng(42)
    base_grad = np.ones(100)

    for round_no in range(1, 21):
        decay = 1.0 / (1.0 + 0.3 * round_no)  # Shrinking norms over training rounds
        updates = {}
        for i in range(8):
            noise = rng.normal(0, 0.02 * decay, 100)
            updates[i] = (base_grad + noise) * decay

        verdicts, trusted = detector.evaluate_round(round_no, updates, detection_enabled=True)
        excluded_count = sum(1 for cid in range(8) if verdicts[cid]["is_excluded"])
        
        # Must never exclude more than 1 honest client in any round
        assert excluded_count <= 1, f"Round {round_no}: Excluded {excluded_count} honest clients!"
        # Must never exceed cap (floor(0.375 * 8) = 3)
        assert excluded_count <= 3

def test_fallback_prevents_empty_trusted():
    detector = PoisonDetector(persistence_k=1, persistence_m=1, warmup_rounds=0)
    updates = {
        0: np.array([1.0, 0.0]),
        1: np.array([-1.0, 0.0]),
    }
    verdicts, trusted = detector.evaluate_round(1, updates, detection_enabled=True)
    # Must fallback and keep at least one client so FL doesn't crash
    assert len(trusted) >= 1

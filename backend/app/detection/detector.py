"""Poisoning attack detection engine using Median Cosine Similarity,
Robust Z-Score (MAD), Trust Scores, and Persistence Tracking.

Imports NOTHING from blockchain/ or fl/ to enforce strict separation of concerns.
The detector never receives ground-truth labels about which clients are malicious.
"""

import collections
import hashlib
import math
import numpy as np
from typing import Dict, List, Optional, Tuple


def compute_update_hash(update_vector: np.ndarray) -> str:
    """Computes deterministic SHA-256 hex digest of the model update array bytes."""
    data = update_vector.astype(np.float32).tobytes()
    return hashlib.sha256(data).hexdigest()


class PoisonDetector:
    """Detects and excludes adversarial updates in federated learning."""

    def __init__(
        self,
        similarity_threshold: Optional[float] = None,
        mad_threshold: float = 2.50,
        warmup_rounds: int = 2,
        persistence_k: int = 2,
        persistence_m: int = 3,
    ):
        self.similarity_threshold = similarity_threshold
        self.mad_threshold = mad_threshold
        self.warmup_rounds = warmup_rounds
        self.persistence_k = persistence_k
        self.persistence_m = persistence_m

        # Trust score: starts at 100
        self.trust_scores: Dict[int, int] = collections.defaultdict(lambda: 100)

        # Exclusion state: client_id -> bool
        self.is_excluded: Dict[int, bool] = collections.defaultdict(lambda: False)

        # Flag history over last 3 rounds: client_id -> deque of bools (maxlen 3)
        self.rejection_history: Dict[int, collections.deque] = collections.defaultdict(
            lambda: collections.deque(maxlen=3)
        )

        # Consecutive passing rounds for excluded clients: client_id -> count
        self.consecutive_pass_count: Dict[int, int] = collections.defaultdict(lambda: 0)

        self.verdicts_history: List[Dict[int, Dict]] = []

    def reset(self):
        """Reset internal history for a new run."""
        self.trust_scores.clear()
        self.is_excluded.clear()
        self.rejection_history.clear()
        self.consecutive_pass_count.clear()
        self.verdicts_history.clear()

    @staticmethod
    def _cosine_sim(v1: np.ndarray, v2: np.ndarray, eps: float = 1e-9) -> float:
        norm1 = np.linalg.norm(v1)
        norm2 = np.linalg.norm(v2)
        if norm1 < eps or norm2 < eps:
            return 0.0
        return float(np.clip(np.dot(v1, v2) / (norm1 * norm2), -1.0, 1.0))

    def evaluate_round(
        self,
        round_no: int,
        client_updates: Dict[int, np.ndarray],
        detection_enabled: bool = True,
        run_id: str = "demo",
    ) -> Tuple[Dict[int, Dict], List[int]]:
        """Evaluates client updates for poisoning anomalies per specs 4.1 & 4.2.

        Mathematical steps per round:
          delta_i = local_weights_i - global_weights (1D flattened update)
          median_delta = coordinate-wise median
          cos_i = cosine similarity of delta_i to median_delta
          norm_ratio_i = norm of delta_i / median norm (info only)
          robust_z_i = (cos_i - median(cos)) / (1.4826 * MAD(cos) + 1e-8)

        Rejection rules:
          - Warm-up (rounds 1 and 2): reject only if cos_i < 0
          - Round 3 onward: reject if cos_i < 0 OR (robust_z_i < -2.5 AND cos_i < median(cos) - 0.15)
          - Reject at most 3 hospitals per round (lowest cos first)

        Trust score & Exclusion:
          - Starts at 100
          - Rejected: -30; Accepted: +10 (cap 100)
          - Excluded when trust < 50 OR rejected in 2 of last 3 rounds
          - Excluded still scored, but updates never aggregated
          - Reinstated with trust 60 after 3 consecutive rounds that would pass
          - Quorum: fewer than 3 accepted updates means skip aggregation (empty trusted_ids)

        Returns:
            verdicts: Dict mapping client_id to decision record dictionary.
            trusted_client_ids: List of client IDs accepted for aggregation.
        """
        cids = sorted(list(client_updates.keys()))
        if not cids:
            return {}, []

        # If detection disabled (e.g. attacked scenario), accept all updates without penalty
        if not detection_enabled:
            verdicts = {}
            for cid in cids:
                u_vec = client_updates[cid]
                u_hash = compute_update_hash(u_vec)
                trust_before = self.trust_scores[cid]
                trust_after = min(100, trust_before + 10)
                self.trust_scores[cid] = trust_after
                verdicts[cid] = {
                    "run_id": run_id,
                    "round": round_no,
                    "hospital_id": f"H{cid+1}" if isinstance(cid, int) else str(cid),
                    "client_id": cid,
                    "status": "Accepted",
                    "reason_text": "Update consistent with the group.",
                    "cosine_similarity": 1.0,
                    "robust_z": 0.0,
                    "norm_ratio": 1.0,
                    "trust_before": trust_before,
                    "trust_after": trust_after,
                    "update_hash": u_hash,
                }
            return verdicts, cids

        # 1. Coordinate-wise median delta
        update_matrix = np.stack([client_updates[cid] for cid in cids], axis=0)
        median_delta = np.median(update_matrix, axis=0)

        # 2. Cosine similarity and norms
        norms = {cid: float(np.linalg.norm(client_updates[cid])) for cid in cids}
        median_norm = float(np.median(list(norms.values()))) + 1e-8

        similarities = {}
        norm_ratios = {}
        for cid in cids:
            sim = self._cosine_sim(client_updates[cid], median_delta)
            similarities[cid] = round(sim, 4)
            norm_ratios[cid] = round(norms[cid] / median_norm, 4)

        sim_values = np.array([similarities[cid] for cid in cids])

        # 3. Robust Z-score: (cos_i - median(cos)) / (1.4826 * MAD(cos) + 1e-8)
        median_cos = float(np.median(sim_values))
        abs_deviations = np.abs(sim_values - median_cos)
        mad_cos = float(np.median(abs_deviations))
        robust_z_denom = 1.4826 * mad_cos + 1e-8

        robust_z = {}
        anomalous_candidates = []
        for cid in cids:
            cos_i = similarities[cid]
            # robust_z_i = (cos_i - median(cos)) / (1.4826 * MAD(cos) + 1e-8)
            z_i = (cos_i - median_cos) / robust_z_denom
            robust_z[cid] = round(float(z_i), 3)

            # Rejection logic per section 4.1:
            # Warm-up (rounds 1 and 2): reject only if cos_i < 0
            # Round 3 onward: reject if cos_i < 0 OR (robust_z_i < -2.5 AND cos_i < median(cos) - 0.15)
            if round_no <= self.warmup_rounds:
                would_reject = bool(cos_i < 0.0)
            else:
                would_reject = bool(
                    (cos_i < 0.0)
                    or (z_i < -abs(self.mad_threshold) and cos_i < (median_cos - 0.15))
                )

            if would_reject:
                anomalous_candidates.append(cid)

        # Cap: Reject at most 3 hospitals per round (lowest cos first)
        anomalous_candidates.sort(key=lambda c: similarities[c])
        round_rejected_set = set(anomalous_candidates[:3])

        verdicts = {}
        accepted_candidates = []

        for cid in cids:
            trust_before = self.trust_scores[cid]
            already_excluded = self.is_excluded[cid]
            cos_i = similarities[cid]
            z_i = robust_z[cid]
            n_ratio = norm_ratios[cid]
            u_hash = compute_update_hash(client_updates[cid])
            hosp_str = f"H{cid+1}" if isinstance(cid, int) else str(cid)

            # Check if this round's update was flagged/rejected by detector math
            is_round_rejected = (cid in round_rejected_set)

            # Update 3-round rejection history
            self.rejection_history[cid].append(is_round_rejected)
            rejections_in_last_3 = sum(self.rejection_history[cid])

            # Reinstatement check for previously excluded hospital
            if already_excluded:
                if not is_round_rejected:
                    self.consecutive_pass_count[cid] += 1
                    if self.consecutive_pass_count[cid] >= 3:
                        # Reinstated with trust 60
                        self.is_excluded[cid] = False
                        already_excluded = False
                        self.trust_scores[cid] = 60
                        self.consecutive_pass_count[cid] = 0
                else:
                    self.consecutive_pass_count[cid] = 0

            if already_excluded:
                # Hospital remains Excluded
                trust_after = trust_before
                status = "Excluded"
                reason_text = f"Rejected repeatedly; trust score {trust_after} is below the limit. Updates are no longer used."
            elif not already_excluded and self.trust_scores[cid] == 60 and self.consecutive_pass_count[cid] == 0 and not is_round_rejected and trust_before < 50:
                # Just reinstated this round
                trust_after = 60
                status = "Accepted"
                reason_text = "Update consistent with the group."
                accepted_candidates.append(cid)
            elif is_round_rejected:
                # Rejected this round: trust -30
                trust_after = max(0, trust_before - 30)
                self.trust_scores[cid] = trust_after

                # Check if now becomes Excluded
                if trust_after < 50 or rejections_in_last_3 >= 2:
                    self.is_excluded[cid] = True
                    status = "Excluded"
                    reason_text = f"Rejected repeatedly; trust score {trust_after} is below the limit. Updates are no longer used."
                else:
                    status = "Rejected"
                    if cos_i < 0.0:
                        reason_text = f"Update pointed opposite to the group (similarity {cos_i:.2f})."
                    else:
                        reason_text = f"Update was far less similar to the group than other hospitals (similarity {cos_i:.2f} vs group median {median_cos:.2f})."
            else:
                # Accepted this round: trust +10 (cap 100)
                trust_after = min(100, trust_before + 10)
                self.trust_scores[cid] = trust_after
                status = "Accepted"
                reason_text = "Update consistent with the group."
                accepted_candidates.append(cid)

            verdicts[cid] = {
                "run_id": run_id,
                "round": round_no,
                "hospital_id": hosp_str,
                "client_id": cid,
                "status": status,
                "reason_text": reason_text,
                "cosine_similarity": cos_i,
                "robust_z": z_i,
                "norm_ratio": n_ratio,
                "trust_before": trust_before,
                "trust_after": trust_after,
                "update_hash": u_hash,
            }

        # Quorum rule: fewer than 3 accepted updates means skip aggregation
        if len(accepted_candidates) >= 3:
            trusted_ids = accepted_candidates
        else:
            # Skip aggregation, keep previous global model, record round as skipped
            trusted_ids = []

        self.verdicts_history.append(verdicts)
        return verdicts, trusted_ids

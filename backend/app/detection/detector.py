"""Poisoning attack detection engine using Median Cosine Similarity,
Robust Z-Score (MAD), and Persistence Tracking.

Imports NOTHING from blockchain/ or fl/ to enforce strict separation of concerns.
"""

import collections
import math
import numpy as np
from typing import Dict, List, Optional, Tuple

class PoisonDetector:
    """Detects and excludes adversarial updates in federated learning."""
    def __init__(
        self,
        similarity_threshold: Optional[float] = None,
        mad_threshold: float = 2.50,
        persistence_k: int = 2,
        persistence_m: int = 3,
        warmup_rounds: int = 2,
    ):
        self.similarity_threshold = similarity_threshold
        self.mad_threshold = mad_threshold
        self.persistence_k = persistence_k
        self.persistence_m = persistence_m
        self.warmup_rounds = warmup_rounds

        # Sliding window history: client_id -> deque of bools (flagged history)
        self.flag_history: Dict[int, collections.deque] = collections.defaultdict(
            lambda: collections.deque(maxlen=self.persistence_m)
        )
        self.verdicts_history: List[Dict[int, Dict]] = []

    def reset(self):
        """Reset internal history for a new run."""
        self.flag_history.clear()
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
    ) -> Tuple[Dict[int, Dict], List[int]]:
        """Evaluates client updates for poisoning anomalies.

        Args:
            round_no: Current FL round (1-indexed).
            client_updates: Dict mapping client_id -> 1D update numpy array.
            detection_enabled: If False, all updates are accepted without filtering.

        Returns:
            verdicts: Dict mapping client_id to verdict details.
            trusted_client_ids: List of client IDs accepted for aggregation.
        """
        cids = sorted(list(client_updates.keys()))
        if not cids:
            return {}, []

        if not detection_enabled:
            verdicts = {}
            for cid in cids:
                verdicts[cid] = {
                    "client_id": cid,
                    "round": round_no,
                    "similarity": 1.0,
                    "robust_z": 0.0,
                    "is_flagged": False,
                    "is_excluded": False,
                    "status": "ACCEPTED",
                }
            return verdicts, cids

        # Step 1: Compute coordinate-wise median update vector
        update_matrix = np.stack([client_updates[cid] for cid in cids], axis=0)
        median_update = np.median(update_matrix, axis=0)

        # Step 2: Compute cosine similarity against median vector
        similarities = {}
        for cid in cids:
            sim = self._cosine_sim(client_updates[cid], median_update)
            similarities[cid] = round(sim, 4)

        sim_values = np.array([similarities[cid] for cid in cids])

        # Step 3: Compute Robust Z-Score via MAD (scaled with lower bound 0.05)
        median_sim = float(np.median(sim_values))
        abs_deviations = np.abs(sim_values - median_sim)
        mad = float(np.median(abs_deviations))
        mad_scale = max(1.4826 * mad, 0.05)

        flagged_candidates = []
        raw_verdicts = {}

        for cid in cids:
            sim = similarities[cid]
            robust_z = round(float((median_sim - sim) / mad_scale), 3)

            # Warmup rounds 1-2: only sim < 0 rule applies
            if round_no <= self.warmup_rounds:
                is_anomalous = bool(sim < 0.0)
            else:
                is_anomalous = bool((robust_z > self.mad_threshold and sim < (median_sim - 0.15)) or sim < 0.0)

            # Record in sliding window history for persistence labeling
            self.flag_history[cid].append(is_anomalous)
            k_flags = sum(self.flag_history[cid])
            is_persistent = (k_flags >= self.persistence_k)

            if is_anomalous:
                flagged_candidates.append(cid)

            raw_verdicts[cid] = {
                "client_id": cid,
                "round": round_no,
                "similarity": sim,
                "robust_z": robust_z,
                "is_flagged": is_anomalous,
                "is_persistent": is_persistent,
                "k_flags": k_flags,
            }

        # Exclusion cap: exclude at most floor(0.375 * n) clients per round
        max_excluded = max(1, math.floor(0.375 * len(cids)))
        
        # Sort flagged candidates by similarity ascending (lowest similarity first)
        flagged_candidates.sort(key=lambda c: (similarities[c], raw_verdicts[c]["robust_z"]))
        excluded_ids = set(flagged_candidates[:max_excluded])

        verdicts = {}
        trusted_ids = []

        for cid in cids:
            v = raw_verdicts[cid]
            is_excluded = cid in excluded_ids
            is_anomalous = v["is_flagged"]
            is_persistent = v["is_persistent"]

            if is_excluded:
                status = "EXCLUDED" if (is_persistent or is_anomalous) else "EXCLUDED"
            elif is_anomalous:
                status = "FLAGGED"
            else:
                status = "ACCEPTED"

            verdicts[cid] = {
                "client_id": cid,
                "round": round_no,
                "similarity": v["similarity"],
                "robust_z": v["robust_z"],
                "is_flagged": is_anomalous,
                "is_excluded": is_excluded,
                "k_flags": v["k_flags"],
                "status": status,
            }

            if not is_excluded:
                trusted_ids.append(cid)

        # Fallback: ensure aggregation is never empty
        if not trusted_ids:
            best_cid = max(cids, key=lambda c: similarities[c])
            trusted_ids.append(best_cid)
            verdicts[best_cid]["status"] = "ACCEPTED"
            verdicts[best_cid]["is_excluded"] = False

        self.verdicts_history.append(verdicts)
        return verdicts, trusted_ids

"""Central Orchestrator for Federated Learning, Poisoning Attack Detection, and Blockchain Audit.

SEPARATION RULE ENFORCEMENT:
- fl/ knows only FL algorithms and models.
- detection/ imports nothing from blockchain/ or fl/.
- blockchain/ only records audit trails and never influences training.
- orchestrator.py is the ONLY file importing fl, detection, and blockchain modules.
"""

import asyncio
import csv
import json
import logging
import time
from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple
import numpy as np
import torch

from backend.app import config
from backend.app.state import training_state
from backend.app.data.loader import get_val_loader, get_test_loader, load_medmnist_raw, MedMNISTDataset
from backend.app.data.partition import partition_data
from backend.app.fl import (
    HospitalClient,
    FLServer,
    compute_update_hash,
)
from backend.app.detection import PoisonDetector
from backend.app.blockchain import BlockchainLogger

logger = logging.getLogger(__name__)

class FLOrchestrator:
    def __init__(self):
        self.blockchain = BlockchainLogger()
        self.detector = PoisonDetector(
            similarity_threshold=config.DETECTION_THRESHOLD,
            mad_threshold=config.MAD_THRESHOLD,
            persistence_k=config.PERSISTENCE_K,
            persistence_m=config.PERSISTENCE_M,
            warmup_rounds=config.WARMUP_ROUNDS,
        )

    def _save_ood_statistics(self, model: torch.nn.Module, target_dir: Path):
        """Computes and saves penultimate feature space class means & shared covariance for Mahalanobis OOD."""
        (train_imgs, train_lbls), _, _ = load_medmnist_raw()
        dataset = MedMNISTDataset(train_imgs, train_lbls)
        # Use subset for fast robust covariance estimate
        loader = torch.utils.data.DataLoader(dataset, batch_size=64, shuffle=False)
        
        model.eval()
        features_list = []
        labels_list = []

        with torch.no_grad():
            for imgs, lbls in loader:
                feats = model.extract_features(imgs)
                features_list.append(feats.cpu().numpy())
                labels_list.append(lbls.cpu().numpy())

        X = np.concatenate(features_list, axis=0)  # (N, 64)
        y = np.concatenate(labels_list, axis=0)   # (N,)

        class_means = {}
        for c in [0, 1]:
            class_means[c] = np.mean(X[y == c], axis=0)

        # Centered residuals for shared pooled covariance
        centered = np.zeros_like(X)
        for c in [0, 1]:
            mask = (y == c)
            centered[mask] = X[mask] - class_means[c]

        cov = np.cov(centered, rowvar=False) + np.eye(X.shape[1]) * 1e-4
        inv_cov = np.linalg.pinv(cov)

        # Compute empirical Mahalanobis distances on training samples to find 99th percentile threshold
        dists = []
        for i in range(len(X)):
            c = y[i]
            diff = X[i] - class_means[c]
            d = np.sqrt(diff.dot(inv_cov).dot(diff))
            dists.append(d)

        threshold_99 = float(np.percentile(dists, config.OOD_DISTANCE_PERCENTILE))

        ood_data = {
            "class_0_mean": class_means[0].tolist(),
            "class_1_mean": class_means[1].tolist(),
            "inv_covariance": inv_cov.tolist(),
            "mahalanobis_threshold": round(threshold_99, 4),
            "num_samples": len(X),
        }

        with open(target_dir / "ood_stats.json", "w", encoding="utf-8") as f:
            json.dump(ood_data, f, indent=2)
        logger.info(f"OOD statistics saved to {target_dir / 'ood_stats.json'} (threshold: {threshold_99:.3f})")

    async def run_simulation(
        self,
        run_config: config.RunConfig,
        progress_callback: Optional[Callable[[str, Dict], None]] = None,
    ) -> Dict:
        """Executes one end-to-end federated learning simulation run."""
        torch.manual_seed(run_config.seed)
        np.random.seed(run_config.seed)

        training_state.is_running = True
        training_state.is_paused = False
        training_state.should_stop = False
        training_state.current_round = 0
        training_state.total_rounds = run_config.rounds
        training_state.current_scenario = run_config.scenario
        training_state.active_config = run_config.model_dump()
        training_state.current_run_events.clear()

        # Reset detector and blockchain for fresh run
        self.detector.reset()
        self.blockchain.reset()

        # Output paths
        scenario_dir = config.RESULTS_DIR / run_config.scenario
        scenario_dir.mkdir(parents=True, exist_ok=True)

        server = FLServer()
        val_loader = get_val_loader(batch_size=config.BATCH_SIZE)
        test_loader = get_test_loader(batch_size=config.BATCH_SIZE)
        client_loaders, client_stats = partition_data(
            num_clients=run_config.num_clients,
            batch_size=run_config.batch_size,
            seed=run_config.seed,
        )

        clients = {
            cid: HospitalClient(cid, loader)
            for cid, loader in client_loaders.items()
        }

        round_records = []
        start_time = time.time()
        best_accuracy = 0.0

        # Read existing best accuracy if available
        best_model_meta_file = config.CHECKPOINTS_DIR / "best_model_meta.json"
        if best_model_meta_file.exists():
            try:
                with open(best_model_meta_file, "r") as f:
                    meta = json.load(f)
                    best_accuracy = meta.get("accuracy", 0.0)
            except Exception:
                best_accuracy = 0.0

        try:
            for round_no in range(1, run_config.rounds + 1):
                if training_state.should_stop:
                    logger.info("Simulation run stopped by user request.")
                    break

                while training_state.is_paused:
                    if training_state.should_stop:
                        break
                    await asyncio.sleep(0.2)

                training_state.current_round = round_no

                # Step 1: Start round
                await training_state.emit_event("round_start", {
                    "round": round_no,
                    "total_rounds": run_config.rounds,
                    "scenario": run_config.scenario,
                })

                # Server distributes global weights
                global_weights = server.get_global_weights()

                # Step 2 & 3: Hospitals train locally (malicious nodes poison)
                await training_state.emit_event("client_status_batch", {
                    "status": "Training",
                    "cids": list(clients.keys()),
                })

                client_updates = {}
                sample_counts = {}
                update_hashes = {}

                for cid, client in clients.items():
                    is_mal = (cid in run_config.malicious_ids)
                    delta, count, loss = client.train(
                        global_weights=global_weights,
                        epochs=run_config.local_epochs,
                        lr=run_config.learning_rate,
                        is_malicious=is_mal,
                        attack_type=run_config.attack_type,
                    )
                    client_updates[cid] = delta
                    sample_counts[cid] = count
                    update_hashes[cid] = compute_update_hash(delta)

                await training_state.emit_event("client_status_batch", {
                    "status": "Sent",
                    "cids": list(clients.keys()),
                })

                # Step 5: Detection (Cosine vs Median + MAD Robust Z + Persistence)
                verdicts, trusted_ids = self.detector.evaluate_round(
                    round_no=round_no,
                    client_updates=client_updates,
                    detection_enabled=run_config.detection,
                )

                # Emit similarity, flag, and exclude events
                for cid, v in verdicts.items():
                    await training_state.emit_event("similarity", {
                        "round": round_no,
                        "client_id": cid,
                        "similarity": v["similarity"],
                        "robust_z": v["robust_z"],
                        "status": v["status"],
                    })
                    if v["is_flagged"]:
                        await training_state.emit_event("flag", {
                            "round": round_no,
                            "client_id": cid,
                            "reason": f"Cosine similarity {v['similarity']:.3f} below consensus",
                        })
                    if v["is_excluded"]:
                        await training_state.emit_event("exclude", {
                            "round": round_no,
                            "client_id": cid,
                            "reason": f"Persistent anomaly ({v.get('k_flags', 0)} flags)",
                        })

                # Step 6: FedAvg aggregation over trusted updates only
                trusted_tuples = [
                    (client_updates[cid], sample_counts[cid])
                    for cid in trusted_ids
                ]
                server.aggregate(trusted_tuples)
                await training_state.emit_event("aggregate", {
                    "round": round_no,
                    "trusted_count": len(trusted_ids),
                    "excluded_count": len(client_updates) - len(trusted_ids),
                    "trusted_ids": trusted_ids,
                })

                # Step 7: Evaluate global model on validation set (no leakage)
                val_metrics = server.evaluate(val_loader)
                await training_state.emit_event("metrics", {
                    "round": round_no,
                    "metrics": val_metrics,
                })

                # Step 8: Log one blockchain entry per client per round
                chain_time_start = time.time()
                for cid in sorted(clients.keys()):
                    v = verdicts[cid]
                    block_entry = self.blockchain.log_entry(
                        round_no=round_no,
                        client_id=cid,
                        update_hash=update_hashes[cid],
                        status=v["status"],
                        similarity=v["similarity"],
                    )
                    await training_state.emit_event("chain_write", {
                        "entry": block_entry,
                        "mode": self.blockchain.mode,
                    })
                chain_ms = (time.time() - chain_time_start) * 1000.0

                # Assemble round record (per-round accuracy is validation accuracy)
                rec = {
                    "round": round_no,
                    "accuracy": val_metrics["accuracy"],
                    "loss": val_metrics["loss"],
                    "precision": val_metrics["precision"],
                    "recall": val_metrics["recall"],
                    "f1": val_metrics["f1"],
                    "trusted_clients": len(trusted_ids),
                    "excluded_clients": len(client_updates) - len(trusted_ids),
                    "blockchain_ms": round(chain_ms, 2),
                }
                round_records.append(rec)

                await training_state.emit_event("round_end", {
                    "round": round_no,
                    "record": rec,
                })

                # Checkpoint saving rule:
                # experiments/results/defended/best_model.pth is replaced ONLY by a Clean
                # or Protected run with validation accuracy >= the current best.
                if run_config.scenario in [config.SCENARIO_CLEAN, config.SCENARIO_DEFENDED]:
                    if val_metrics["accuracy"] >= best_accuracy:
                        best_accuracy = val_metrics["accuracy"]
                        best_path = config.CHECKPOINTS_DIR / "best_model.pth"
                        torch.save(server.global_model.state_dict(), best_path)
                        self._save_ood_statistics(server.global_model, config.CHECKPOINTS_DIR)
                        with open(best_model_meta_file, "w") as f:
                            json.dump({
                                "accuracy": best_accuracy,
                                "val_accuracy": best_accuracy,
                                "scenario": run_config.scenario,
                                "round": round_no,
                                "timestamp": time.time(),
                            }, f, indent=2)

                # Delay for live animation pacing
                if run_config.speed_ms > 0:
                    await asyncio.sleep(run_config.speed_ms / 1000.0)

        except Exception as e:
            logger.error(f"Error during FL simulation: {e}", exc_info=True)
            await training_state.emit_event("error", {"message": str(e)})
            raise
        finally:
            training_state.is_running = False
            training_state.is_paused = False

            # Evaluate final global model on test set ONCE at run end
            final_test_metrics = server.evaluate(test_loader)
            logger.info(f"Final test accuracy evaluated at run end: {final_test_metrics['accuracy']:.4f}")

            # Save per-round CSV and summary JSON
            self._save_results(scenario_dir, round_records, run_config, start_time, final_test_metrics=final_test_metrics)

            summary = {
                "scenario": run_config.scenario,
                "total_rounds": len(round_records),
                "final_accuracy": final_test_metrics["accuracy"],
                "final_val_accuracy": round_records[-1]["accuracy"] if round_records else 0.0,
                "best_val_accuracy": max((r["accuracy"] for r in round_records), default=0.0),
                "elapsed_seconds": round(time.time() - start_time, 2),
            }
            await training_state.emit_event("run_end", summary)
            return summary

    def _save_results(
        self,
        scenario_dir: Path,
        round_records: List[Dict],
        run_config: config.RunConfig,
        start_time: float,
        final_test_metrics: Optional[Dict] = None,
    ):
        """Saves per-round CSV, metrics JSON, and full event log."""
        if not round_records:
            return

        # 1. Round metrics CSV
        csv_path = scenario_dir / "round_metrics.csv"
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=list(round_records[0].keys()))
            writer.writeheader()
            writer.writerows(round_records)

        # 2. Metrics summary JSON
        summary_path = scenario_dir / "metrics.json"
        with open(summary_path, "w", encoding="utf-8") as f:
            json.dump({
                "scenario": run_config.scenario,
                "config": run_config.model_dump(),
                "rounds": round_records,
                "elapsed_seconds": round(time.time() - start_time, 2),
                "final_metrics": round_records[-1] if round_records else {},
                "final_test_metrics": final_test_metrics or {},
            }, f, indent=2)

        # 3. Event log JSON for Replay feature
        event_log_path = scenario_dir / "event_log.json"
        with open(event_log_path, "w", encoding="utf-8") as f:
            json.dump(training_state.current_run_events, f, indent=2)

orchestrator = FLOrchestrator()

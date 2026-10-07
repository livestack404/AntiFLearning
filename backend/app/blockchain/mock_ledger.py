"""Cryptographic Hash-Chained Mock Ledger.

Acts as a local fallback when Ganache is unavailable. Stores blocks persisted to disk,
linked cryptographically via SHA-256 (prev_hash -> block_hash).
Provides real tamper detection: altering a past entry breaks the hash chain.
"""

import hashlib
import json
import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from backend.app import config

class MockLedger:
    def __init__(self, storage_path: Path = config.MOCK_LEDGER_PATH):
        self.storage_path = storage_path
        self.entries: List[Dict] = []
        self._load()

    def _compute_hash(
        self,
        index: int,
        round_no: int,
        client_id: int,
        update_hash: str,
        status: str,
        similarity: float,
        timestamp: float,
        prev_hash: str,
    ) -> str:
        payload = f"{index}|{round_no}|{client_id}|{update_hash}|{status}|{similarity:.4f}|{timestamp:.4f}|{prev_hash}"
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    def _load(self):
        if self.storage_path.exists():
            try:
                with open(self.storage_path, "r", encoding="utf-8") as f:
                    self.entries = json.load(f)
            except Exception:
                self.entries = []
        else:
            self.entries = []

    def _save(self):
        with open(self.storage_path, "w", encoding="utf-8") as f:
            json.dump(self.entries, f, indent=2)

    def reset(self):
        """Clear ledger entries and erase disk file."""
        self.entries = []
        if self.storage_path.exists():
            self.storage_path.unlink()

    def add_entry(
        self,
        round_no: int,
        client_id: int,
        update_hash: str,
        status: str,
        similarity: float,
    ) -> Dict:
        """Appends a new cryptographically chained block to the ledger."""
        index = len(self.entries)
        prev_hash = self.entries[-1]["block_hash"] if self.entries else "0" * 64
        ts = time.time()

        block_hash = self._compute_hash(
            index, round_no, client_id, update_hash, status, similarity, ts, prev_hash
        )
        tx_hash = "0x" + hashlib.sha256(f"{index}:{block_hash}".encode()).hexdigest()

        entry = {
            "index": index,
            "round": round_no,
            "client_id": client_id,
            "update_hash": update_hash,
            "status": status,
            "similarity": round(float(similarity), 4),
            "timestamp": ts,
            "prev_hash": prev_hash,
            "block_hash": block_hash,
            "tx_hash": tx_hash,
        }
        self.entries.append(entry)
        self._save()
        return entry

    def get_entries(self, limit: Optional[int] = None) -> List[Dict]:
        """Returns entries, optionally capped at most recent `limit`."""
        if limit is not None and limit > 0:
            return self.entries[-limit:]
        return list(self.entries)

    def verify_integrity(self) -> Dict:
        """Walks the entire hash chain and verifies hash integrity."""
        if not self.entries:
            return {"valid": True, "message": "Ledger is empty", "total_entries": 0}

        for i, entry in enumerate(self.entries):
            # Verify previous hash link
            expected_prev = "0" * 64 if i == 0 else self.entries[i - 1]["block_hash"]
            if entry["prev_hash"] != expected_prev:
                return {
                    "valid": False,
                    "tampered_index": i,
                    "reason": "Previous hash link mismatch (chain severed)",
                    "expected_prev_hash": expected_prev,
                    "actual_prev_hash": entry["prev_hash"],
                    "total_entries": len(self.entries),
                }

            # Verify block data hash
            recomputed = self._compute_hash(
                entry["index"],
                entry["round"],
                entry["client_id"],
                entry["update_hash"],
                entry["status"],
                entry["similarity"],
                entry["timestamp"],
                entry["prev_hash"],
            )
            if entry["block_hash"] != recomputed:
                return {
                    "valid": False,
                    "tampered_index": i,
                    "reason": "Block content does not match cryptographic hash",
                    "expected_block_hash": recomputed,
                    "actual_block_hash": entry["block_hash"],
                    "total_entries": len(self.entries),
                }

        return {
            "valid": True,
            "message": "All cryptographic block hashes and chain links verified successfully",
            "total_entries": len(self.entries),
            "latest_block_hash": self.entries[-1]["block_hash"],
        }

    def tamper_entry(self, index: int, new_status: Optional[str] = None) -> Dict:
        """Simulates an unauthorized alteration of a past ledger entry."""
        if not self.entries:
            return {"success": False, "message": "Ledger is empty"}
        if index < 0 or index >= len(self.entries):
            index = max(0, len(self.entries) // 2)

        original_status = self.entries[index]["status"]
        if new_status is None:
            # Flip status to guarantee alteration
            new_status = "EXCLUDED" if original_status == "ACCEPTED" else "ACCEPTED"

        self.entries[index]["status"] = new_status
        self._save()
        return {
            "success": True,
            "tampered_index": index,
            "original_status": original_status,
            "tampered_status": new_status,
            "message": f"Entry #{index} status forcibly overwritten to '{new_status}' on disk without updating hashes.",
        }

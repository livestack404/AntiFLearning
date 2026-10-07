"""Unit tests for Blockchain and Mock Ledger.

Validates:
- SHA-256 block creation and chaining
- Cryptographic integrity verification
- Tamper detection when a past entry is altered
"""

from pathlib import Path
import tempfile
import pytest

from backend.app.blockchain.mock_ledger import MockLedger

def test_mock_ledger_chaining_and_integrity():
    with tempfile.TemporaryDirectory() as tmpdir:
        storage_path = Path(tmpdir) / "test_ledger.json"
        ledger = MockLedger(storage_path=storage_path)

        # Add 3 entries
        e1 = ledger.add_entry(round_no=1, client_id=0, update_hash="0xabc1", status="ACCEPTED", similarity=0.88)
        e2 = ledger.add_entry(round_no=1, client_id=1, update_hash="0xabc2", status="ACCEPTED", similarity=0.85)
        e3 = ledger.add_entry(round_no=1, client_id=2, update_hash="0xabc3", status="EXCLUDED", similarity=-0.50)

        assert e1["prev_hash"] == "0" * 64
        assert e2["prev_hash"] == e1["block_hash"]
        assert e3["prev_hash"] == e2["block_hash"]

        # Verify initial valid state
        verify_res = ledger.verify_integrity()
        assert verify_res["valid"] is True
        assert verify_res["total_entries"] == 3

def test_tamper_detection():
    with tempfile.TemporaryDirectory() as tmpdir:
        storage_path = Path(tmpdir) / "test_ledger.json"
        ledger = MockLedger(storage_path=storage_path)

        for i in range(5):
            ledger.add_entry(round_no=1, client_id=i, update_hash=f"0x{i}", status="ACCEPTED", similarity=0.9)

        # Forcibly tamper entry #2 on disk
        tamper_res = ledger.tamper_entry(2, new_status="EXCLUDED")
        assert tamper_res["success"] is True

        # Now verify integrity: must catch the tampering!
        verify_res = ledger.verify_integrity()
        assert verify_res["valid"] is False
        assert verify_res["tampered_index"] == 2

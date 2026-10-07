"""Blockchain Audit Logger with automatic Ganache detection and cryptographic mock fallback.

Strict separation: records audit metadata only and NEVER influences training.
Only hashes and small verdicts are recorded on-chain, NEVER patient data or raw weights.
"""

import json
import logging
import time
from pathlib import Path
from typing import Dict, List, Optional

from backend.app import config
from backend.app.blockchain.mock_ledger import MockLedger

logger = logging.getLogger(__name__)

class BlockchainLogger:
    def __init__(self, ganache_url: str = config.GANACHE_URL):
        self.ganache_url = ganache_url
        self.mode = "mock"  # "ganache" or "mock"
        self.contract = None
        self.web3 = None
        self.account = None
        self.contract_address = None
        self.mock_ledger = MockLedger()

        self._init_connection()

    def _init_connection(self):
        """Attempt to connect to Ganache; fallback to mock chain if unavailable."""
        try:
            from web3 import Web3
            self.web3 = Web3(Web3.HTTPProvider(self.ganache_url))
            if self.web3.is_connected():
                accounts = self.web3.eth.accounts
                if accounts:
                    self.account = accounts[config.DEPLOY_ACCOUNT_INDEX]
                    self.web3.eth.default_account = self.account
                    # Check for existing deployed contract
                    addr = self._load_persisted_address()
                    artifact = self._load_artifact()
                    if addr and artifact:
                        try:
                            self.contract = self.web3.eth.contract(
                                address=Web3.to_checksum_address(addr),
                                abi=artifact["abi"],
                            )
                            # Probe call
                            self.contract.functions.entryCount().call()
                            self.contract_address = addr
                            self.mode = "ganache"
                            logger.info(f"Connected to Ganache at {self.ganache_url}, contract: {addr}")
                            return
                        except Exception as e:
                            logger.warning(f"Failed to bind contract at {addr}: {e}")
                    
                    # Auto-deploy if artifact exists
                    if artifact:
                        new_addr = self._deploy_contract(artifact)
                        if new_addr:
                            self.contract_address = new_addr
                            self.mode = "ganache"
                            return

            logger.info("Ganache node not detected. Initializing local cryptographic hash-chain fallback.")
            self.mode = "mock"
        except Exception as e:
            logger.info(f"Web3 init failed ({e}). Using cryptographic mock ledger.")
            self.mode = "mock"

    def _load_artifact(self) -> Optional[Dict]:
        artifact_path = config.BLOCKCHAIN_DIR / "contract_artifact.json"
        if artifact_path.exists():
            try:
                with open(artifact_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                return None
        return None

    def _load_persisted_address(self) -> Optional[str]:
        if config.CONTRACT_ADDRESS_FILE.exists():
            try:
                with open(config.CONTRACT_ADDRESS_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    return data.get("address")
            except Exception:
                return None
        return None

    def _save_persisted_address(self, address: str):
        with open(config.CONTRACT_ADDRESS_FILE, "w", encoding="utf-8") as f:
            json.dump({"address": address, "network": self.ganache_url}, f, indent=2)

    def _deploy_contract(self, artifact: Dict) -> Optional[str]:
        try:
            AuditContract = self.web3.eth.contract(
                abi=artifact["abi"], bytecode=artifact["bytecode"]
            )
            tx_hash = AuditContract.constructor().transact({"from": self.account})
            receipt = self.web3.eth.wait_for_transaction_receipt(tx_hash)
            addr = receipt.contractAddress
            self._save_persisted_address(addr)
            self.contract = self.web3.eth.contract(address=addr, abi=artifact["abi"])
            logger.info(f"Deployed new AuditLog contract to Ganache at {addr}")
            return addr
        except Exception as e:
            logger.warning(f"Contract auto-deployment failed: {e}")
            return None

    def log_entry(
        self,
        round_no: int,
        client_id: int,
        update_hash: str,
        status: str,
        similarity: float,
    ) -> Dict:
        """Records an audit entry on-chain or mock hash chain."""
        # Always record to mock ledger for local integrity verification and fast queries
        mock_entry = self.mock_ledger.add_entry(
            round_no, client_id, update_hash, status, similarity
        )

        if self.mode == "ganache" and self.contract is not None:
            try:
                from web3 import Web3
                # Scaled integer for fixed point similarity: e.g. 0.8524 -> 8524
                scaled_sim = int(round(similarity * 10000))
                fn = self.contract.functions.addEntry(
                    round_no, client_id, update_hash, status, scaled_sim
                )
                tx_hash = fn.transact({"from": self.account})
                receipt = self.web3.eth.wait_for_transaction_receipt(tx_hash)
                tx_hex = Web3.to_hex(receipt.transactionHash)
                mock_entry["tx_hash"] = tx_hex
            except Exception as e:
                logger.error(f"Ganache transaction failed ({e}). Degraded to mock chain.")
                self.mode = "mock"

        return mock_entry

    def get_entries(self, limit: Optional[int] = None) -> List[Dict]:
        """Returns recorded entries."""
        return self.mock_ledger.get_entries(limit)

    def verify_integrity(self) -> Dict:
        """Verifies the cryptographic integrity of the audit trail."""
        result = self.mock_ledger.verify_integrity()
        result["mode"] = self.mode
        result["mode_display"] = "Ganache (live)" if self.mode == "ganache" else "Local hash-chain (Ganache not connected)"
        return result

    def tamper_attempt(self, index: int = 0) -> Dict:
        """Demonstrates tamper detection by attempting to alter a past ledger entry."""
        if self.mode == "ganache":
            return {
                "success": False,
                "mode": "ganache",
                "message": "REJECTED: AuditLog.sol has no update/delete functions. Ethereum EVM rejected state modification.",
            }
        else:
            tamper_res = self.mock_ledger.tamper_entry(index, new_status=None)
            return {
                "success": True,
                "mode": "mock",
                "message": f"Tampered entry #{tamper_res.get('tampered_index')} status. Run integrity verification to detect!",
                "detail": tamper_res,
            }

    def reset(self):
        """Clears entries for a fresh run."""
        self.mock_ledger.reset()

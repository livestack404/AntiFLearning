"""Central configuration for Federated Learning with Poisoning Attack Detection

Single source of truth. All hyperparameters, paths, and operational defaults
are defined here. No magic numbers elsewhere.
"""

import os
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Literal, Optional

# Root Directories
APP_DIR = Path(__file__).resolve().parent
BACKEND_DIR = APP_DIR.parent
BASE_DIR = BACKEND_DIR.parent

DATA_DIR = BASE_DIR / "data" / "medmnist"
RESULTS_DIR = BASE_DIR / "experiments" / "results"
CHECKPOINTS_DIR = BASE_DIR / "experiments" / "results" / "defended"
SAMPLE_IMAGES_DIR = BASE_DIR / "sample_images"
BLOCKCHAIN_DIR = APP_DIR / "blockchain"
CONTRACT_PATH = BLOCKCHAIN_DIR / "contracts" / "AuditLog.sol"
MOCK_LEDGER_PATH = BLOCKCHAIN_DIR / "mock_ledger.json"

MODELS_DIR = BASE_DIR / "models"
FINAL_MODEL_PATH = MODELS_DIR / "final_model_64.pth"

# Ensure all essential directories exist
for p in [DATA_DIR, RESULTS_DIR, CHECKPOINTS_DIR, SAMPLE_IMAGES_DIR, BLOCKCHAIN_DIR, MODELS_DIR]:
    p.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Default FL & Training Hyperparameters (Single Source of Truth)
# ---------------------------------------------------------------------------
NUM_CLIENTS: int = 8
NUM_ROUNDS: int = 10
LOCAL_EPOCHS: int = 1
BATCH_SIZE: int = 32
LEARNING_RATE: float = 0.001
SEED: int = 42

DATASET: str = "pneumoniamnist"
NUM_CLASSES: int = 2
IMAGE_SIZE: int = 28
INPUT_SHAPE: tuple = (1, 28, 28)
DIRICHLET_ALPHA: float = 2.0
MIN_CLIENT_SAMPLES: int = 200

# ---------------------------------------------------------------------------
# Attack & Detection Settings
# ---------------------------------------------------------------------------
ATTACK_TYPE: Literal["label_flip", "sign_flip"] = "label_flip"
DEFAULT_MALICIOUS_CLIENTS: List[int] = [3, 7]  # 2 of 8 clients compromised by default
SIGN_FLIP_SCALE: float = 5.0

# Detection thresholds & persistence parameters
DETECTION_THRESHOLD: float = 0.50   # Absolute cosine floor
MAD_THRESHOLD: float = 4.50         # Relative outlier threshold (Tuned on real runs: clean has zero Excluded)
PERSISTENCE_K: int = 2              # Must be flagged K times in last M rounds to exclude
PERSISTENCE_M: int = 3              # Sliding window size M
WARMUP_ROUNDS: int = 2              # Warmup rounds before exclusion triggers

# ---------------------------------------------------------------------------
# Inference & OOD Settings
# ---------------------------------------------------------------------------
CONFIDENCE_THRESHOLD: float = 0.70  # Min softmax probability required to accept diagnosis
MIN_IMAGE_STD: float = 0.05         # Low contrast/blank image rejection
MAX_COLOR_DIFF: float = 0.15        # Rejects color photos with high channel variance
OOD_DISTANCE_PERCENTILE: float = 99.0  # Mahalanobis distance rejection ceiling

# ---------------------------------------------------------------------------
# Blockchain Settings
# ---------------------------------------------------------------------------
BLOCKCHAIN_MODE: Literal["ganache", "mock", "disabled"] = "ganache"
GANACHE_URL: str = os.getenv("GANACHE_URL", "http://127.0.0.1:8545")
DEPLOY_ACCOUNT_INDEX: int = 0
CONTRACT_ADDRESS_FILE = BLOCKCHAIN_DIR / "contract_address.json"

# ---------------------------------------------------------------------------
# Pre-set Scenarios
# ---------------------------------------------------------------------------
SCENARIO_CLEAN = "clean"
SCENARIO_ATTACKED = "attacked"
SCENARIO_DEFENDED = "defended"

SCENARIOS = {
    SCENARIO_CLEAN: {
        "name": "Normal (Clean)",
        "description": "Baseline federated training with all honest hospital nodes and detection active.",
        "malicious_ids": [],
        "detection": True,
        "attack_type": "label_flip",
    },
    SCENARIO_ATTACKED: {
        "name": "Attacked (No Detection)",
        "description": "Poisoning attack active with detection disabled. Poisoned updates degrade global accuracy.",
        "malicious_ids": DEFAULT_MALICIOUS_CLIENTS,
        "detection": False,
        "attack_type": "label_flip",
    },
    SCENARIO_DEFENDED: {
        "name": "Protected (Attack + Detection)",
        "description": "Poisoning attack active with cosine MAD anomaly detection and persistence exclusion enabled.",
        "malicious_ids": DEFAULT_MALICIOUS_CLIENTS,
        "detection": True,
        "attack_type": "label_flip",
    },
}

# ---------------------------------------------------------------------------
# Dynamic Run Configuration Model (Settable via API / UI at runtime)
# ---------------------------------------------------------------------------
class RunConfig(BaseModel):
    scenario: Literal["clean", "attacked", "defended", "custom"] = "defended"
    num_clients: int = Field(default=NUM_CLIENTS, ge=2, le=16)
    malicious_ids: List[int] = Field(default_factory=lambda: list(DEFAULT_MALICIOUS_CLIENTS))
    detection: bool = True
    attack_type: Literal["label_flip", "sign_flip"] = ATTACK_TYPE
    rounds: int = Field(default=NUM_ROUNDS, ge=1, le=100)
    local_epochs: int = Field(default=LOCAL_EPOCHS, ge=1, le=10)
    batch_size: int = Field(default=BATCH_SIZE, ge=4, le=128)
    learning_rate: float = Field(default=LEARNING_RATE, gt=0, le=0.1)
    speed_ms: int = Field(default=100, ge=0, le=2000)  # Delay between rounds for animation
    seed: int = SEED

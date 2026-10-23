# AntiFLearning: Project Assumptions & Design Decisions

This document records the architectural assumptions, implementation interpretations, and design parameters established per the specification prompt.

---

### 1. Dataset & Resolution
- **Dataset**: MedMNIST v2 PneumoniaMNIST (pediatric chest radiographs, binary classification: Normal vs. Pneumonia).
- **Demo Resolution**: 28x28 grayscale images are used exclusively for the 10-round interactive live simulation to ensure near-instantaneous client training in the browser.
- **Production Models**: Higher-resolution models (64x64 and 128x128) and `scripts/train_final.py` are not yet trained; only demo resolution models currently exist.

---

### 2. Partitioning & Clients
- **Federated Hospitals**: 8 simulated clinical sites (H1 through H8).
- **Data Distribution**: Non-IID Dirichlet distribution with concentration parameter alpha = 2.0, ensuring each hospital receives a realistic class imbalance while maintaining a minimum of 200 training examples per node.

---

### 3. Threat Model & Detection
- **Adversarial Setup**: Hospitals H4 (client 3) and H8 (client 7) act as compromised nodes in attacked and defended scenarios.
- **Attack Vector**: Label-flipping is the primary active attack mode; sign-flipping updates are supported in configuration.
- **Detector Consensus**:
  - Distance metric: Coordinate-wise median delta vector as the honest consensus reference.
  - Anomaly scoring: Median cosine similarity paired with MAD-scaled robust Z-scores (Z < -2.5).
  - Warm-up: In rounds 1 and 2, updates are rejected only if cosine similarity is strictly negative.
  - Cap: At most 3 updates are rejected in any single round (prioritizing lowest cosine similarity).
  - Quorum: Aggregation requires at least 3 accepted hospital updates.
  - Ground Truth Isolation: The detector receives zero information regarding client identities or adversarial status during evaluation. Ground truth is used strictly for post-run reporting.

---

### 4. Persistence & Trust Scoring
- **Trust Parameters**: Initialized at 100 points for all hospitals.
- **Penalties & Rewards**: Rejection deducts 30 points; acceptance restores 10 points (capped at 100).
- **Exclusion Threshold**: A hospital is excluded if its trust drops below 50 OR if it was rejected in 2 of the last 3 rounds.
- **Reinstatement**: Excluded hospitals continue to be evaluated; after passing 3 consecutive rounds, they are reinstated with a trust score of 60.

---

### 5. Blockchain & Ledger Verification
- **Smart Contract**: AuditLog.sol deployed to a local Ganache instance (http://127.0.0.1:8545).
- **On-Chain Data**: Only canonical SHA-256 record hashes, round numbers, hospital identifiers, and status codes are stored on-chain. Model weights and raw medical images are never placed on-chain.
- **Fallback**: When Ganache is not running, the system automatically falls back to an internal cryptographic hash-chain ledger.
- **Tampering Demonstration**: The tamper endpoint modifies only the local client copy, causing cryptographic verification against the chain to fail until restored.

---

### 6. Clinical Inference & Guardrails
- **Model Loading**: If the trained checkpoint is missing, /api/predict returns HTTP 503 ("Model not loaded"). It never predicts using uninitialized or random weights.
- **OOD Guardrails**: Lightweight image sanity checks (minimum dimension >= 32px, aspect ratio 0.4 - 2.5, grayscale variance std >= 8, color divergence <= 20/255). Complex feature-space Mahalanobis checks are removed.
- **Confidence Alerts**: Soft warning banner ("Uncertain, interpret with caution") is displayed for predictions where maximum probability < 0.70.

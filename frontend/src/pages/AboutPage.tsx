import React from 'react';
import { 
  ShieldCheck, 
  Cpu, 
  Database, 
  Code2, 
  Layers, 
  Lock, 
  GitBranch, 
  CheckCircle2, 
  AlertCircle 
} from 'lucide-react';

export const AboutPage: React.FC = () => {
  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '1.5rem 2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Title */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <ShieldCheck size={24} color="var(--cyan-bright)" />
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.5rem', color: '#ffffff' }}>
            System Architecture & Zero-Trust Threat Model
          </h2>
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Detailed technical specifications of the architectural separation, statistical defense engine, and cryptographic audit mechanism.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem' }}>
        {/* Separation of Concerns Card */}
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--cyan-bright)' }}>
            <Layers size={20} />
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1.1rem' }}>
              Enforced Separation of Concerns
            </h3>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            The codebase strictly enforces modular isolation across four operational boundaries to guarantee integrity and prevent circular dependency leaks:
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.8rem' }}>
            <div style={{ padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
              <strong style={{ color: '#67e8f9' }}>1. fl/ (Federated Learning Core):</strong>
              <p style={{ color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Knows only model topology (PneumoniaCNN) and FedAvg aggregation. Has zero dependency on detection or blockchain.
              </p>
            </div>

            <div style={{ padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
              <strong style={{ color: '#34d399' }}>2. detection/ (Poisoning Defense Engine):</strong>
              <p style={{ color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Pure numerical statistical analysis. Imports nothing from fl/ or blockchain/. Operates solely on coordinate arrays.
              </p>
            </div>

            <div style={{ padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
              <strong style={{ color: '#c084fc' }}>3. blockchain/ (Immutable Audit Trail):</strong>
              <p style={{ color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Records cryptographic receipts (SHA-256 update hash and verdict). Strictly non-influencing: never impacts model aggregation.
              </p>
            </div>

            <div style={{ padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
              <strong style={{ color: '#fbbf24' }}>4. orchestrator.py (Central Pipeline):</strong>
              <p style={{ color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                The single authoritative conductor importing fl, detection, and blockchain, dispatching asynchronous WebSocket events.
              </p>
            </div>
          </div>
        </div>

        {/* Statistical Defense Card */}
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10b981' }}>
            <Cpu size={20} />
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1.1rem' }}>
              Cosine-MAD Anomaly Defense
            </h3>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            Protects against both coarse sign-flip and subtle targeted label-flip attacks via multi-tiered statistical consensus:
          </p>

          <div style={{ background: 'rgba(11, 18, 32, 0.9)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#e2e8f0', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>// 1. Coordinate-wise Median:</span>
              <div style={{ color: '#67e8f9' }}>V_med = median(Delta_1, ..., Delta_N)</div>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>// 2. Cosine Similarity vs Consensus:</span>
              <div style={{ color: '#67e8f9' }}>S_i = (Delta_i &middot; V_med) / (||Delta_i|| * ||V_med||)</div>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>// 3. Median Absolute Deviation (MAD):</span>
              <div style={{ color: '#67e8f9' }}>MAD = median(|S_i - median(S)|)</div>
              <div style={{ color: '#67e8f9' }}>Robust_Z = (median(S) - S_i) / (1.4826 * MAD)</div>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>// 4. Persistence Window:</span>
              <div style={{ color: '#34d399' }}>Exclude client iff Flagged &ge; K=2 of last M=3 rounds</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <CheckCircle2 size={16} color="#10b981" style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>
              <strong>Warmup Grace Period:</strong> Exclusions trigger only after round 2 to allow honest heterogeneous local gradients to stabilize without false exclusion.
            </span>
          </div>
        </div>

        {/* 5-Stage OOD Guardrails Card */}
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f59e0b' }}>
            <Lock size={20} />
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1.1rem' }}>
              Multi-Stage OOD Clinical Guardrails
            </h3>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            Prevents catastrophic misdiagnosis of non-radiological photos, blank slides, or corrupt files before model inference:
          </p>

          <ol style={{ paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <li>
              <strong>Aspect Ratio & Blank Check:</strong> Rejects extreme dimensions (aspect &lt; 0.4 or &gt; 2.5) and blank/low-contrast images (&sigma; &lt; 0.05).
            </li>
            <li>
              <strong>Color Saturation Filter:</strong> Computes inter-channel color variance; rejects non-grayscale images (&gt; 15% channel discrepancy).
            </li>
            <li>
              <strong>Softmax Floor Confidence:</strong> Enforces minimum 70% posterior confidence to accept diagnosis.
            </li>
            <li>
              <strong>Mahalanobis Distance Rejection:</strong> Projects penultimate 64-dim representation against training class centroids and pooled covariance matrix; rejects geometry beyond 99th percentile.
            </li>
            <li>
              <strong>Localized Grad-CAM Verification:</strong> Generates activation heatmaps across 6 anatomical lung zones for transparent clinical review.
            </li>
          </ol>
        </div>

        {/* Cryptographic Ledger Card */}
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#c084fc' }}>
            <Database size={20} />
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1.1rem' }}>
              Dual Blockchain &amp; Mock Hash-Chain
            </h3>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            Guarantees non-repudiation and tamper-evident audit logging for regulatory compliance (HIPAA / GDPR):
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.8rem' }}>
            <div style={{ padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
              <strong style={{ color: '#c084fc' }}>Ganache EVM Smart Contract:</strong>
              <p style={{ color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Deploys AuditLog.sol to local Ethereum node over JSON-RPC. Automatically detected when available.
              </p>
            </div>

            <div style={{ padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
              <strong style={{ color: '#67e8f9' }}>Cryptographic Hash-Chain (Fallback):</strong>
              <p style={{ color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Persisted to disk with SHA-256 block chaining (prev_hash &rarr; block_hash). Supports interactive tampering demonstration and automatic integrity verification.
              </p>
            </div>
          </div>
        </div>

        {/* Clinical Limitations Card */}
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f59e0b' }}>
            <AlertCircle size={20} />
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1.1rem' }}>
              Limitations
            </h3>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            The model is trained on a small pediatric dataset and misses some Normal X-rays (see specificity: 76.1%); results on sample images reflect this.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', background: 'var(--bg-secondary)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)', fontSize: '0.8rem' }}>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Dataset: </span>
              <strong style={{ color: '#ffffff' }}>MedMNIST PneumoniaMNIST (Pediatric Cohort)</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Test Specificity: </span>
              <strong style={{ color: '#f59e0b' }}>76.1% (178 / 234 Normal verified)</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Test Sensitivity: </span>
              <strong style={{ color: '#34d399' }}>97.4% (380 / 390 Pneumonia caught)</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

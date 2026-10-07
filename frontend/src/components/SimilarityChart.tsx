import React from 'react';
import { BarChart2, AlertCircle } from 'lucide-react';
import { ClientNodeState } from '../types';

interface SimilarityChartProps {
  clients: ClientNodeState[];
  threshold?: number;
}

export const SimilarityChart: React.FC<SimilarityChartProps> = ({ clients, threshold = 0.50 }) => {
  return (
    <div className="glass-panel" style={{ padding: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1rem', color: 'var(--text-main)' }}>
            Consensus Cosine Similarity & MAD Outlier Scoring
          </h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Coordinate-wise median direction comparison. Red threshold line at cosine = 0.50.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          <span style={{ width: '12px', height: '2px', background: '#ef4444' }} />
          <span>Cutoff Threshold: {threshold.toFixed(2)}</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {clients.map((c) => {
          // Normalize similarity: cosine range [-1.0 .. 1.0] -> bar width % [0 .. 100]
          // Map -0.5 to 0% and 1.0 to 100%
          const sim = c.similarity;
          const clampedSim = Math.max(-0.5, Math.min(1.0, sim));
          const pct = Math.max(0, Math.min(100, ((clampedSim + 0.5) / 1.5) * 100));

          const isExcluded = c.status === 'EXCLUDED';
          const isFlagged = c.status === 'FLAGGED';
          const barColor = isExcluded ? '#ef4444' : isFlagged ? '#f59e0b' : '#06b6d4';

          return (
            <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 90px 75px', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f1f5f9' }}>{c.name}</span>
                {c.isMalicious && (
                  <span title="Configured Adversarial Client" style={{ display: 'inline-flex' }}>
                    <AlertCircle size={12} color="#f59e0b" />
                  </span>
                )}
              </div>

              {/* Progress bar with threshold guide */}
              <div style={{ position: 'relative', width: '100%', height: '14px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                {/* 0.50 Threshold Marker (mapped to ~66.6% in [-0.5..1.0]) */}
                <div
                  style={{
                    position: 'absolute',
                    left: `${((0.50 + 0.5) / 1.5) * 100}%`,
                    top: 0,
                    bottom: 0,
                    width: '2px',
                    background: 'rgba(239, 68, 68, 0.7)',
                    zIndex: 2,
                  }}
                />
                {/* Value bar */}
                <div
                  style={{
                    width: `${pct}%`,
                    height: '100%',
                    background: barColor,
                    borderRadius: '4px',
                    transition: 'width 0.3s ease, background-color 0.3s ease',
                    boxShadow: isExcluded ? '0 0 10px rgba(239,68,68,0.5)' : 'none',
                  }}
                />
              </div>

              {/* Similarity score */}
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', textAlign: 'right', color: barColor, fontWeight: 600 }}>
                {sim.toFixed(4)}
              </div>

              {/* Verdict badge */}
              <div style={{ textAlign: 'right' }}>
                <span
                  className={isExcluded ? 'badge badge-red' : isFlagged ? 'badge badge-amber' : 'badge badge-green'}
                  style={{ fontSize: '0.625rem', padding: '0.15rem 0.45rem' }}
                >
                  {c.status}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

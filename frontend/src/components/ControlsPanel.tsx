import React, { useState } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Square, 
  ShieldCheck, 
  ShieldAlert, 
  Shield, 
  Sliders, 
  Zap, 
  Clock 
} from 'lucide-react';
import { RunConfig, ScenarioType, AttackType } from '../types';

interface ControlsPanelProps {
  config: RunConfig;
  onChangeConfig: (newCfg: RunConfig) => void;
  isRunning: boolean;
  isPaused: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onReset: () => void;
  currentRound: number;
  totalRounds: number;
}

export const ControlsPanel: React.FC<ControlsPanelProps> = ({
  config,
  onChangeConfig,
  isRunning,
  isPaused,
  onStart,
  onPause,
  onResume,
  onStop,
  onReset,
  currentRound,
  totalRounds,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const setScenario = (sc: ScenarioType) => {
    let malicious = [3, 7];
    let detection = true;
    let attackType: AttackType = 'label_flip';

    if (sc === 'clean') {
      malicious = [];
      detection = false;
    } else if (sc === 'attacked') {
      malicious = [3, 7];
      detection = false;
    } else if (sc === 'defended') {
      malicious = [3, 7];
      detection = true;
    }

    onChangeConfig({
      ...config,
      scenario: sc,
      malicious_ids: malicious,
      detection,
      attack_type: attackType,
    });
  };

  const progressPercentage = totalRounds > 0 ? (currentRound / totalRounds) * 100 : 0;

  return (
    <div className="glass-panel" style={{ padding: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1rem', color: 'var(--text-main)' }}>
            FL Simulation & Threat Scenarios
          </h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Choose an attack & defense profile or fine-tune parameters
          </p>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {!isRunning ? (
            <button className="btn-primary" onClick={onStart}>
              <Play size={16} fill="currentColor" />
              <span>Start Simulation</span>
            </button>
          ) : isPaused ? (
            <button className="btn-primary" onClick={onResume} style={{ background: '#10b981' }}>
              <Play size={16} fill="currentColor" />
              <span>Resume</span>
            </button>
          ) : (
            <button className="btn-secondary" onClick={onPause}>
              <Pause size={16} />
              <span>Pause</span>
            </button>
          )}

          {isRunning && (
            <button className="btn-danger" onClick={onStop}>
              <Square size={16} fill="currentColor" />
              <span>Stop</span>
            </button>
          )}

          <button className="btn-secondary" onClick={onReset} disabled={isRunning}>
            <RotateCcw size={15} />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Scenario Selection Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {/* Protected Scenario */}
        <div
          onClick={() => !isRunning && setScenario('defended')}
          style={{
            padding: '0.9rem',
            borderRadius: '10px',
            border: config.scenario === 'defended' ? '1.5px solid var(--cyan-primary)' : '1px solid var(--border-subtle)',
            background: config.scenario === 'defended' ? 'rgba(6, 182, 212, 0.12)' : 'var(--bg-secondary)',
            cursor: isRunning ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: config.scenario === 'defended' ? '0 0 15px -3px rgba(6, 182, 212, 0.3)' : 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, fontSize: '0.875rem', color: '#67e8f9' }}>
              <ShieldCheck size={18} color="var(--cyan-bright)" />
              Protected
            </span>
            <span className="badge badge-cyan" style={{ fontSize: '0.6rem' }}>RECOMMENDED</span>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Attack active with Cosine-MAD outlier detection & persistence exclusion.
          </p>
        </div>

        {/* Clean Scenario */}
        <div
          onClick={() => !isRunning && setScenario('clean')}
          style={{
            padding: '0.9rem',
            borderRadius: '10px',
            border: config.scenario === 'clean' ? '1.5px solid #10b981' : '1px solid var(--border-subtle)',
            background: config.scenario === 'clean' ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-secondary)',
            cursor: isRunning ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, fontSize: '0.875rem', color: '#6ee7b7' }}>
              <Shield size={18} color="#10b981" />
              Clean Baseline
            </span>
            <span className="badge badge-green" style={{ fontSize: '0.6rem' }}>HONEST</span>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Baseline federated learning with all 8 honest hospital nodes.
          </p>
        </div>

        {/* Attacked Scenario */}
        <div
          onClick={() => !isRunning && setScenario('attacked')}
          style={{
            padding: '0.9rem',
            borderRadius: '10px',
            border: config.scenario === 'attacked' ? '1.5px solid #ef4444' : '1px solid var(--border-subtle)',
            background: config.scenario === 'attacked' ? 'rgba(239, 68, 68, 0.12)' : 'var(--bg-secondary)',
            cursor: isRunning ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, fontSize: '0.875rem', color: '#fca5a5' }}>
              <ShieldAlert size={18} color="#ef4444" />
              Attacked Baseline
            </span>
            <span className="badge badge-red" style={{ fontSize: '0.6rem' }}>POISONED</span>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Adversaries poison updates with defense disabled (causes model collapse).
          </p>
        </div>
      </div>

      {/* Progress & Speed Controls */}
      <div style={{
        background: 'rgba(11, 18, 32, 0.7)',
        borderRadius: '10px',
        padding: '0.75rem 1rem',
        border: '1px solid var(--border-subtle)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <Clock size={15} color="var(--cyan-primary)" />
            <span>Round Progress: <strong style={{ color: '#ffffff' }}>{currentRound}</strong> / {totalRounds}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              <Zap size={14} color="#f59e0b" />
              <span>Delay: {config.speed_ms}ms</span>
              <input
                type="range"
                min="0"
                max="800"
                step="50"
                value={config.speed_ms}
                onChange={(e) => onChangeConfig({ ...config, speed_ms: Number(e.target.value) })}
                style={{ width: '80px', accentColor: 'var(--cyan-primary)', cursor: 'pointer' }}
              />
            </div>

            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--cyan-bright)',
                fontSize: '0.75rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
              }}
            >
              <Sliders size={13} />
              <span>{showAdvanced ? 'Hide Hyperparameters' : 'Tune Parameters'}</span>
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
          <div
            style={{
              width: `${progressPercentage}%`,
              height: '100%',
              background: 'linear-gradient(to right, #06b6d4, #10b981)',
              transition: 'width 0.3s ease',
              boxShadow: '0 0 8px rgba(6, 182, 212, 0.6)',
            }}
          />
        </div>
      </div>

      {/* Advanced Hyperparameter Accordion */}
      {showAdvanced && (
        <div style={{
          marginTop: '0.75rem',
          padding: '1rem',
          background: 'var(--bg-secondary)',
          borderRadius: '10px',
          border: '1px solid var(--border-subtle)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1rem',
        }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
              Rounds
            </label>
            <input
              type="number"
              min="1"
              max="100"
              value={config.rounds}
              disabled={isRunning}
              onChange={(e) => onChangeConfig({ ...config, rounds: Number(e.target.value) })}
              style={{
                width: '100%',
                padding: '0.4rem 0.6rem',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                color: '#ffffff',
                fontSize: '0.85rem',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
              Attack Type
            </label>
            <select
              value={config.attack_type}
              disabled={isRunning}
              onChange={(e) => onChangeConfig({ ...config, attack_type: e.target.value as AttackType })}
              style={{
                width: '100%',
                padding: '0.4rem 0.6rem',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                color: '#ffffff',
                fontSize: '0.85rem',
              }}
            >
              <option value="label_flip">Label Flip (0 &lt;-&gt; 1)</option>
              <option value="sign_flip">Sign Flip (-5x Update Direction)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
              Detection Engine
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.4rem' }}>
              <input
                type="checkbox"
                id="detToggle"
                checked={config.detection}
                disabled={isRunning}
                onChange={(e) => onChangeConfig({ ...config, detection: e.target.checked })}
                style={{ accentColor: 'var(--cyan-primary)', width: '16px', height: '16px' }}
              />
              <label htmlFor="detToggle" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                Cosine + Robust MAD
              </label>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
              Compromised Client IDs
            </label>
            <input
              type="text"
              value={config.malicious_ids.join(', ')}
              disabled={isRunning}
              onChange={(e) => {
                const ids = e.target.value
                  .split(',')
                  .map((s) => parseInt(s.trim()))
                  .filter((n) => !isNaN(n));
                onChangeConfig({ ...config, malicious_ids: ids });
              }}
              placeholder="e.g. 3, 7"
              style={{
                width: '100%',
                padding: '0.4rem 0.6rem',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                color: '#ffffff',
                fontSize: '0.85rem',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

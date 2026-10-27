import React, { useState, useEffect, useRef } from 'react';
import { Navbar } from './components/Navbar';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Dashboard } from './pages/Dashboard';
import { PredictPage } from './pages/PredictPage';
import { LedgerPage } from './pages/LedgerPage';
import { AboutPage } from './pages/AboutPage';
import { ClientNodeState, RoundMetrics, RunConfig, WSEvent } from './types';

const INITIAL_CLIENTS: ClientNodeState[] = [
  { id: 0, name: 'Metro General', isMalicious: false, status: 'Idle', similarity: 1.0, robustZ: 0.0, kFlags: 0 },
  { id: 1, name: 'St. Jude Health', isMalicious: false, status: 'Idle', similarity: 1.0, robustZ: 0.0, kFlags: 0 },
  { id: 2, name: 'Apex Medical', isMalicious: false, status: 'Idle', similarity: 1.0, robustZ: 0.0, kFlags: 0 },
  { id: 3, name: 'Rogue Node A', isMalicious: true, status: 'Idle', similarity: 0.0, robustZ: 0.0, kFlags: 0 },
  { id: 4, name: 'Bayview Clinic', isMalicious: false, status: 'Idle', similarity: 1.0, robustZ: 0.0, kFlags: 0 },
  { id: 5, name: 'Cedars Health', isMalicious: false, status: 'Idle', similarity: 1.0, robustZ: 0.0, kFlags: 0 },
  { id: 6, name: 'Highland Care', isMalicious: false, status: 'Idle', similarity: 1.0, robustZ: 0.0, kFlags: 0 },
  { id: 7, name: 'Rogue Node B', isMalicious: true, status: 'Idle', similarity: 0.0, robustZ: 0.0, kFlags: 0 },
];

const DEFAULT_CONFIG: RunConfig = {
  scenario: 'defended',
  num_clients: 8,
  malicious_ids: [3, 7],
  detection: true,
  attack_type: 'label_flip',
  rounds: 10,
  local_epochs: 1,
  batch_size: 32,
  learning_rate: 0.001,
  speed_ms: 100,
  seed: 42,
};

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [blockchainMode, setBlockchainMode] = useState<string>('mock');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [currentRound, setCurrentRound] = useState<number>(0);
  const [totalRounds, setTotalRounds] = useState<number>(10);
  const [clients, setClients] = useState<ClientNodeState[]>(INITIAL_CLIENTS);
  const [metrics, setMetrics] = useState<RoundMetrics | null>(null);
  const [config, setConfig] = useState<RunConfig>(DEFAULT_CONFIG);
  const [events, setEvents] = useState<any[]>([]);

  const wsRef = useRef<WebSocket | null>(null);

  // Update clients malicious flags whenever config changes
  useEffect(() => {
    setClients((prev) =>
      prev.map((c) => ({
        ...c,
        isMalicious: config.malicious_ids.includes(c.id),
      }))
    );
  }, [config.malicious_ids]);

  // Connect WebSocket with auto-reconnect
  useEffect(() => {
    let reconnectTimeout: any;

    const connectWebSocket = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
      };

      ws.onclose = () => {
        setIsConnected(false);
        reconnectTimeout = setTimeout(connectWebSocket, 2000);
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onmessage = (event) => {
        try {
          const payload: WSEvent = JSON.parse(event.data);
          handleWSEvent(payload);
        } catch (e) {
          console.error('Error parsing WS event', e);
        }
      };
    };

    connectWebSocket();

    // Also fetch initial status from API
    fetch('/api/status')
      .then((res) => res.json())
      .then((data) => {
        setIsRunning(data.is_running);
        setIsPaused(data.is_paused);
        setCurrentRound(data.current_round);
        setTotalRounds(data.total_rounds || 10);
        setBlockchainMode(data.blockchain_mode);
      })
      .catch((err) => console.error('Error fetching initial status', err));

    return () => {
      clearTimeout(reconnectTimeout);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const handleWSEvent = (event: WSEvent) => {
    const timestamp = new Date().toLocaleTimeString();
    setEvents((prev) => [...prev, { timestamp, type: event.type, data: event.data }]);

    switch (event.type) {
      // ── Legacy / compatibility names ──────────────────────────────────────
      case 'init':
        setIsRunning(event.data.is_running);
        setIsPaused(event.data.is_paused);
        setCurrentRound(event.data.current_round);
        setTotalRounds(event.data.total_rounds || 10);
        setBlockchainMode(event.data.blockchain_mode);
        break;

      // ── Backend canonical event names ─────────────────────────────────────
      // round_started / round_start (both supported)
      case 'round_started':
      case 'round_start':
        setIsRunning(true);
        setCurrentRound(event.data.round);
        setTotalRounds(event.data.total_rounds || totalRounds);
        // Reset all clients to Training state at the start of each round
        setClients((prev) =>
          prev.map((c) => ({
            ...c,
            status: 'Training' as const,
          }))
        );
        break;

      // global_model_broadcast: server distributes weights
      case 'global_model_broadcast':
        // No UI state change needed; event logged for EventStream
        break;

      // client_training: individual hospital starts training
      case 'client_training': {
        const cid = event.data.client_id;
        setClients((prev) =>
          prev.map((c) => (c.id === cid ? { ...c, status: 'Training' as const } : c))
        );
        break;
      }

      // client_update_sent: hospital finishes and sends update
      case 'client_update_sent': {
        const cid = event.data.client_id;
        setClients((prev) =>
          prev.map((c) => (c.id === cid ? { ...c, status: 'Sent' as const } : c))
        );
        break;
      }

      // detection_complete: detector verdicts for all clients in the round
      case 'detection_complete': {
        const records: Record<string, any> = event.data.records_by_client || {};
        setClients((prev) =>
          prev.map((c) => {
            const verdict = records[String(c.id)];
            if (!verdict) return c;
            const statusMap: Record<string, any> = {
              Accepted: 'ACCEPTED',
              Rejected: 'FLAGGED',
              Excluded: 'EXCLUDED',
            };
            return {
              ...c,
              similarity: verdict.cosine_similarity ?? c.similarity,
              robustZ: verdict.robust_z ?? c.robustZ,
              status: statusMap[verdict.status] ?? c.status,
              kFlags:
                verdict.status === 'Rejected'
                  ? c.kFlags + 1
                  : verdict.status === 'Excluded'
                  ? c.kFlags
                  : c.kFlags,
              reason: verdict.reason_text,
            };
          })
        );
        break;
      }

      // aggregation_complete: FedAvg done, new validation metrics available
      case 'aggregation_complete':
        setMetrics({
          round: event.data.round,
          accuracy: event.data.accuracy,
          loss: event.data.loss,
          precision: event.data.metrics?.precision ?? 0,
          recall: event.data.metrics?.recall ?? 0,
          f1: event.data.metrics?.f1 ?? 0,
          trusted_clients: event.data.trusted_count ?? 0,
          excluded_clients: event.data.excluded_count ?? 0,
          blockchain_ms: 0,
        });
        break;

      // ledger_written: blockchain block committed
      case 'ledger_written':
        setMetrics((prev) =>
          prev ? { ...prev, blockchain_ms: event.data.blockchain_ms ?? prev.blockchain_ms } : prev
        );
        break;

      // round_completed: full per-round record
      case 'round_completed':
      case 'round_end':
        if (event.data.record) {
          setMetrics(event.data.record);
        }
        break;

      // run_completed / run_end: simulation finished
      case 'run_completed':
      case 'run_end':
        setIsRunning(false);
        setIsPaused(false);
        break;

      // Legacy similarity / flag / exclude
      case 'similarity':
        setClients((prev) =>
          prev.map((c) =>
            c.id === event.data.client_id
              ? {
                  ...c,
                  similarity: event.data.similarity,
                  robustZ: event.data.robust_z,
                  status: event.data.status ?? c.status,
                }
              : c
          )
        );
        break;

      case 'flag':
        setClients((prev) =>
          prev.map((c) =>
            c.id === event.data.client_id
              ? { ...c, status: 'FLAGGED' as const, kFlags: c.kFlags + 1, reason: event.data.reason }
              : c
          )
        );
        break;

      case 'exclude':
        setClients((prev) =>
          prev.map((c) =>
            c.id === event.data.client_id
              ? { ...c, status: 'EXCLUDED' as const, reason: event.data.reason }
              : c
          )
        );
        break;

      case 'metrics':
        setMetrics((prev) => ({
          round: event.data.round,
          accuracy: event.data.metrics?.accuracy ?? event.data.accuracy,
          loss: event.data.metrics?.loss ?? event.data.loss,
          precision: event.data.metrics?.precision ?? 0,
          recall: event.data.metrics?.recall ?? 0,
          f1: event.data.metrics?.f1 ?? 0,
          trusted_clients: prev?.trusted_clients ?? 8,
          excluded_clients: prev?.excluded_clients ?? 0,
          blockchain_ms: prev?.blockchain_ms ?? 0,
        }));
        break;

      case 'error':
        setIsRunning(false);
        console.error('FL Orchestrator Error:', event.data.message);
        break;

      default:
        // Unknown event types are already logged to EventStream above
        break;
    }
  };

  // Actions
  const handleStart = async () => {
    try {
      const res = await fetch('/api/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        setIsRunning(true);
        setIsPaused(false);
        setTotalRounds(config.rounds);
        setEvents([]);
      } else {
        const err = await res.json();
        alert(err.detail || 'Could not start simulation');
      }
    } catch (e) {
      console.error('Failed to start simulation', e);
    }
  };

  const handlePause = async () => {
    try {
      await fetch('/api/pause', { method: 'POST' });
      setIsPaused(true);
    } catch (e) {
      console.error('Failed to pause', e);
    }
  };

  const handleResume = async () => {
    try {
      await fetch('/api/resume', { method: 'POST' });
      setIsPaused(false);
    } catch (e) {
      console.error('Failed to resume', e);
    }
  };

  const handleStop = async () => {
    try {
      await fetch('/api/stop', { method: 'POST' });
      setIsRunning(false);
      setIsPaused(false);
    } catch (e) {
      console.error('Failed to stop', e);
    }
  };

  const handleReset = async () => {
    try {
      await fetch('/api/reset', { method: 'POST' });
      setIsRunning(false);
      setIsPaused(false);
      setCurrentRound(0);
      setMetrics(null);
      setEvents([]);
      setClients(INITIAL_CLIENTS.map((c) => ({
        ...c,
        isMalicious: config.malicious_ids.includes(c.id),
      })));
    } catch (e) {
      console.error('Failed to reset', e);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isConnected={isConnected}
        blockchainMode={blockchainMode}
        isRunning={isRunning}
        currentRound={currentRound}
        totalRounds={totalRounds}
      />

      <main style={{ flex: 1 }}>
        {activeTab === 'dashboard' && (
          <ErrorBoundary label="Live Simulation">
            <Dashboard
              clients={clients}
              metrics={metrics}
              config={config}
              onChangeConfig={setConfig}
              isRunning={isRunning}
              isPaused={isPaused}
              onStart={handleStart}
              onPause={handlePause}
              onResume={handleResume}
              onStop={handleStop}
              onReset={handleReset}
              currentRound={currentRound}
              totalRounds={totalRounds}
              events={events}
            />
          </ErrorBoundary>
        )}

        {activeTab === 'predict' && (
          <ErrorBoundary label="Clinical Predict & XAI">
            <PredictPage />
          </ErrorBoundary>
        )}

        {activeTab === 'ledger' && (
          <ErrorBoundary label="Blockchain Audit Ledger">
            <LedgerPage />
          </ErrorBoundary>
        )}

        {activeTab === 'about' && (
          <ErrorBoundary label="Architecture & Zero-Trust">
            <AboutPage />
          </ErrorBoundary>
        )}
      </main>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid var(--border-subtle)',
        padding: '1.25rem 2rem',
        marginTop: '2rem',
        background: 'var(--bg-secondary)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.75rem',
        fontSize: '0.75rem',
        color: 'var(--text-muted)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <strong style={{ color: 'var(--text-secondary)' }}>AntiFLearning Architecture</strong>
          <span>&bull;</span>
          <span>Zero-Trust Poisoning Defense & Blockchain Audit Logger for Healthcare</span>
        </div>
        <div>
          <span>MedMNIST Pneumonia (4,708 Train / 624 Test) · {blockchainMode === 'ganache' ? 'Ganache EVM' : 'SHA-256 Hash-Chain'} · PyTorch Grad-CAM</span>
        </div>
      </footer>
    </div>
  );
};

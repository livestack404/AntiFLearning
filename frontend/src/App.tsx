import React, { useState, useEffect, useRef } from 'react';
import { Navbar } from './components/Navbar';
import { Dashboard } from './pages/Dashboard';
import { PredictPage } from './pages/PredictPage';
import { LedgerPage } from './pages/LedgerPage';
import { ResultsPage } from './pages/ResultsPage';
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
      case 'init':
        setIsRunning(event.data.is_running);
        setIsPaused(event.data.is_paused);
        setCurrentRound(event.data.current_round);
        setTotalRounds(event.data.total_rounds || 10);
        setBlockchainMode(event.data.blockchain_mode);
        break;

      case 'round_start':
        setIsRunning(true);
        setCurrentRound(event.data.round);
        setTotalRounds(event.data.total_rounds);
        setClients((prev) =>
          prev.map((c) => ({
            ...c,
            status: 'Training',
          }))
        );
        break;

      case 'client_status_batch':
        setClients((prev) =>
          prev.map((c) => ({
            ...c,
            status: event.data.status,
          }))
        );
        break;

      case 'similarity':
        setClients((prev) =>
          prev.map((c) =>
            c.id === event.data.client_id
              ? {
                  ...c,
                  similarity: event.data.similarity,
                  robustZ: event.data.robust_z,
                  status: event.data.status,
                }
              : c
          )
        );
        break;

      case 'flag':
        setClients((prev) =>
          prev.map((c) =>
            c.id === event.data.client_id
              ? {
                  ...c,
                  status: 'FLAGGED',
                  kFlags: c.kFlags + 1,
                  reason: event.data.reason,
                }
              : c
          )
        );
        break;

      case 'exclude':
        setClients((prev) =>
          prev.map((c) =>
            c.id === event.data.client_id
              ? {
                  ...c,
                  status: 'EXCLUDED',
                  reason: event.data.reason,
                }
              : c
          )
        );
        break;

      case 'metrics':
        setMetrics((prev) => ({
          round: event.data.round,
          accuracy: event.data.metrics.accuracy,
          loss: event.data.metrics.loss,
          precision: event.data.metrics.precision,
          recall: event.data.metrics.recall,
          f1: event.data.metrics.f1,
          trusted_clients: prev ? prev.trusted_clients : 8,
          excluded_clients: prev ? prev.excluded_clients : 0,
          blockchain_ms: prev ? prev.blockchain_ms : 0,
        }));
        break;

      case 'round_end':
        setMetrics(event.data.record);
        break;

      case 'run_end':
        setIsRunning(false);
        setIsPaused(false);
        break;

      case 'error':
        setIsRunning(false);
        console.error('FL Orchestrator Error:', event.data.message);
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
        )}

        {activeTab === 'predict' && <PredictPage />}

        {activeTab === 'ledger' && <LedgerPage />}

        {activeTab === 'results' && <ResultsPage />}

        {activeTab === 'about' && <AboutPage />}
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
          <strong style={{ color: 'var(--text-secondary)' }}>AegisFL Architecture</strong>
          <span>&bull;</span>
          <span>Zero-Trust Poisoning Defense & Blockchain Audit Logger for Healthcare</span>
        </div>
        <div>
          <span>MedMNIST Pneumonia (4,708 Train / 624 Holdout Test) &bull; Ganache EVM &bull; PyTorch Grad-CAM</span>
        </div>
      </footer>
    </div>
  );
};

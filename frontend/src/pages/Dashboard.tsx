import React, { useState } from 'react';
import { NetworkGraph } from '../components/NetworkGraph';
import { ControlsPanel } from '../components/ControlsPanel';
import { LiveMetricsCards } from '../components/LiveMetricsCards';
import { SimilarityChart } from '../components/SimilarityChart';
import { EventStream } from '../components/EventStream';
import { ClientNodeState, RoundMetrics, RunConfig } from '../types';

interface DashboardProps {
  clients: ClientNodeState[];
  metrics: RoundMetrics | null;
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
  events: any[];
}

export const Dashboard: React.FC<DashboardProps> = ({
  clients,
  metrics,
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
  events,
}) => {
  const [selectedClient, setSelectedClient] = useState<number | null>(null);

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '1.5rem 2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Top Controls Panel */}
      <ControlsPanel
        config={config}
        onChangeConfig={onChangeConfig}
        isRunning={isRunning}
        isPaused={isPaused}
        onStart={onStart}
        onPause={onPause}
        onResume={onResume}
        onStop={onStop}
        onReset={onReset}
        currentRound={currentRound}
        totalRounds={totalRounds}
      />

      {/* Real-time Global Evaluation Metrics */}
      <LiveMetricsCards metrics={metrics} totalClients={clients.length} />

      {/* Main Grid: Topology Graph + Consensus Chart */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '1.25rem' }}>
        <NetworkGraph
          clients={clients}
          isRunning={isRunning}
          currentRound={currentRound}
          selectedClient={selectedClient}
          onSelectClient={(id) => setSelectedClient(selectedClient === id ? null : id)}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <SimilarityChart clients={clients} threshold={0.50} />
          <EventStream events={events} />
        </div>
      </div>
    </div>
  );
};

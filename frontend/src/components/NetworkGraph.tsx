import React, { useState, useEffect } from 'react';
import { Server, Building2, AlertTriangle, ShieldAlert, CheckCircle2, XCircle } from 'lucide-react';
import { ClientNodeState } from '../types';

interface NetworkGraphProps {
  clients: ClientNodeState[];
  isRunning: boolean;
  currentRound: number;
  selectedClient: number | null;
  onSelectClient: (id: number) => void;
}

export const NetworkGraph: React.FC<NetworkGraphProps> = ({
  clients,
  isRunning,
  currentRound,
  selectedClient,
  onSelectClient,
}) => {
  const [animationTick, setAnimationTick] = useState(0);

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      setAnimationTick((t) => (t + 1) % 100);
    }, 40);
    return () => clearInterval(interval);
  }, [isRunning]);

  const centerX = 260;
  const centerY = 240;
  const radius = 170;

  // Calculate coordinates for 8 hospitals arranged in a circle
  const getNodeCoordinates = (index: number, total: number) => {
    const angle = (index * (2 * Math.PI) / total) - (Math.PI / 2);
    return {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  };

  const getStatusColor = (status: string, isMalicious: boolean) => {
    switch (status) {
      case 'EXCLUDED':
        return '#ef4444';
      case 'FLAGGED':
        return '#f59e0b';
      case 'ACCEPTED':
        return '#10b981';
      case 'Training':
        return '#06b6d4';
      case 'Sent':
        return '#3b82f6';
      default:
        return isMalicious ? '#ef4444' : '#64748b';
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '1.25rem', position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1rem', color: 'var(--text-main)' }}>
            Decentralized Healthcare Topology
          </h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Real-time weight transmission, poisoning flags, and dynamic consensus filtering
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', fontSize: '0.7rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#10b981' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} /> Accepted
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#f59e0b' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b' }} /> Flagged
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#ef4444' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }} /> Excluded
          </span>
        </div>
      </div>

      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
        <svg
          viewBox="0 0 520 480"
          style={{ width: '100%', maxWidth: '520px', height: 'auto', maxHeight: '420px' }}
        >
          <defs>
            <radialGradient id="serverGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.4" />
              <stop offset="70%" stopColor="#06b6d4" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="ringGlow" cx="50%" cy="50%" r="50%">
              <stop offset="60%" stopColor="#06b6d4" stopOpacity="0" />
              <stop offset="85%" stopColor="#06b6d4" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
            </radialGradient>
            <filter id="glowEffect" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Background Concentric Grid Rings */}
          <circle cx={centerX} cy={centerY} r={radius} fill="none" stroke="rgba(255, 255, 255, 0.05)" strokeDasharray="3,3" />
          <circle cx={centerX} cy={centerY} r={radius * 0.6} fill="none" stroke="rgba(255, 255, 255, 0.03)" />
          
          {/* Animated Central Pulse Ring */}
          <circle
            cx={centerX}
            cy={centerY}
            r={radius + 15}
            fill="none"
            stroke="#06b6d4"
            strokeOpacity={isRunning ? "0.3" : "0.08"}
            strokeWidth="1.5"
            strokeDasharray="6,6"
            className={isRunning ? "animate-spin-slow" : ""}
            style={{ transformOrigin: `${centerX}px ${centerY}px` }}
          />

          {/* Data Conduit Lines & Animated Packet Transmission */}
          {clients.map((client, i) => {
            const { x, y } = getNodeCoordinates(i, clients.length);
            const statusColor = getStatusColor(client.status, client.isMalicious);
            const isSelected = selectedClient === client.id;
            const isExcluded = client.status === 'EXCLUDED';

            // Calculate animated packet positions along conduit line
            // Phase 1: Upload from client to server (tick 0..50)
            // Phase 2: Broadcast from server to client (tick 50..100)
            const progress = (animationTick % 100) / 100;
            const packetX = isRunning && !isExcluded ? x + (centerX - x) * progress : x;
            const packetY = isRunning && !isExcluded ? y + (centerY - y) * progress : y;

            return (
              <g key={`conduit-${client.id}`}>
                {/* Conduit link */}
                <line
                  x1={centerX}
                  y1={centerY}
                  x2={x}
                  y2={y}
                  stroke={isSelected ? '#22d3ee' : isExcluded ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255, 255, 255, 0.12)'}
                  strokeWidth={isSelected ? 2 : 1}
                  strokeDasharray={isExcluded ? '3,3' : 'none'}
                />

                {/* Animated Data Energy Packet */}
                {isRunning && !isExcluded && (
                  <circle
                    cx={packetX}
                    cy={packetY}
                    r={3}
                    fill={client.isMalicious ? '#ef4444' : '#22d3ee'}
                    filter="url(#glowEffect)"
                  />
                )}
              </g>
            );
          })}

          {/* Central Aggregation Server */}
          <g>
            {/* Outer halo */}
            <circle cx={centerX} cy={centerY} r={46} fill="url(#serverGlow)" />
            <circle
              cx={centerX}
              cy={centerY}
              r={36}
              fill="#0d1527"
              stroke="#06b6d4"
              strokeWidth="2"
              filter="url(#glowEffect)"
            />
            {/* Server Core Icon */}
            <foreignObject x={centerX - 16} y={centerY - 18} width="32" height="32">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <Server size={22} color="#22d3ee" />
              </div>
            </foreignObject>
            <text
              x={centerX}
              y={centerY + 48}
              textAnchor="middle"
              fill="#e2e8f0"
              fontSize="9"
              fontFamily="var(--font-display)"
              fontWeight="600"
            >
              FEDERATED SERVER
            </text>
            <text
              x={centerX}
              y={centerY + 58}
              textAnchor="middle"
              fill="var(--cyan-bright)"
              fontSize="7.5"
              fontFamily="var(--font-mono)"
            >
              {isRunning ? `ROUND ${currentRound}` : 'AGGREGATOR IDLE'}
            </text>
          </g>

          {/* Hospital Client Nodes */}
          {clients.map((client, i) => {
            const { x, y } = getNodeCoordinates(i, clients.length);
            const statusColor = getStatusColor(client.status, client.isMalicious);
            const isSelected = selectedClient === client.id;
            const nodeRadius = 24;

            return (
              <g
                key={`node-${client.id}`}
                onClick={() => onSelectClient(client.id)}
                style={{ cursor: 'pointer' }}
              >
                {/* Node selection ring */}
                {isSelected && (
                  <circle
                    cx={x}
                    cy={y}
                    r={nodeRadius + 6}
                    fill="none"
                    stroke="#22d3ee"
                    strokeWidth="1.5"
                    strokeDasharray="4,4"
                  />
                )}

                {/* Node background circle */}
                <circle
                  cx={x}
                  cy={y}
                  r={nodeRadius}
                  fill="#0b1220"
                  stroke={statusColor}
                  strokeWidth={client.status === 'EXCLUDED' ? 2.5 : 1.5}
                  filter={client.status === 'EXCLUDED' || client.status === 'FLAGGED' ? 'url(#glowEffect)' : 'none'}
                />

                {/* Hospital Node Icon */}
                <foreignObject x={x - 12} y={y - 14} width="24" height="24">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                    {client.status === 'EXCLUDED' ? (
                      <XCircle size={16} color="#ef4444" />
                    ) : client.isMalicious ? (
                      <ShieldAlert size={16} color="#f59e0b" />
                    ) : (
                      <Building2 size={16} color={statusColor} />
                    )}
                  </div>
                </foreignObject>

                {/* Node Label */}
                <text
                  x={x}
                  y={y + 32}
                  textAnchor="middle"
                  fill="#f1f5f9"
                  fontSize="8.5"
                  fontFamily="var(--font-display)"
                  fontWeight="600"
                >
                  {client.name}
                </text>

                {/* Similarity / Status Subtext */}
                <text
                  x={x}
                  y={y + 42}
                  textAnchor="middle"
                  fill={statusColor}
                  fontSize="7"
                  fontFamily="var(--font-mono)"
                  fontWeight="500"
                >
                  {client.status !== 'Idle' && client.status !== 'Training' && client.status !== 'Sent'
                    ? `cos: ${client.similarity.toFixed(2)}`
                    : client.status}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Selected Client Diagnostic Drawer */}
      {selectedClient !== null && (
        <div style={{
          marginTop: '0.75rem',
          padding: '0.75rem 1rem',
          background: 'rgba(13, 21, 37, 0.85)',
          borderRadius: '10px',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}>
          {(() => {
            const sc = clients.find((c) => c.id === selectedClient);
            if (!sc) return null;
            return (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: getStatusColor(sc.status, sc.isMalicious) + '22',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: `1px solid ${getStatusColor(sc.status, sc.isMalicious)}`,
                  }}>
                    <Building2 size={18} color={getStatusColor(sc.status, sc.isMalicious)} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{sc.name} (Client #{sc.id})</span>
                      {sc.isMalicious && (
                        <span className="badge badge-red" style={{ fontSize: '0.65rem' }}>Compromised Node</span>
                      )}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Local Dataset: ~588 PneumoniaMNIST Chest X-rays
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.8rem' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>VERDICT</span>
                    <span style={{ fontWeight: 600, color: getStatusColor(sc.status, sc.isMalicious) }}>
                      {sc.status}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>COSINE SIM</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      {sc.similarity.toFixed(4)}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>ROBUST Z (MAD)</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      {sc.robustZ.toFixed(2)}σ
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>PERSISTENCE</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      {sc.kFlags} / 3 rounds
                    </span>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
};

import React, { useRef, useEffect } from 'react';
import { Terminal, Shield, AlertTriangle, XCircle, Database, Check } from 'lucide-react';

interface EventItem {
  timestamp: string;
  type: string;
  data: any;
}

interface EventStreamProps {
  events: EventItem[];
}

export const EventStream: React.FC<EventStreamProps> = ({ events }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  const getEventBadge = (type: string) => {
    switch (type) {
      case 'flag':
        return <span className="badge badge-amber" style={{ fontSize: '0.6rem' }}>FLAGGED</span>;
      case 'exclude':
        return <span className="badge badge-red" style={{ fontSize: '0.6rem' }}>EXCLUDED</span>;
      case 'chain_write':
        return <span className="badge badge-purple" style={{ fontSize: '0.6rem' }}>BLOCKCHAIN</span>;
      case 'aggregate':
        return <span className="badge badge-cyan" style={{ fontSize: '0.6rem' }}>FEDAVG</span>;
      case 'round_start':
        return <span className="badge badge-green" style={{ fontSize: '0.6rem' }}>ROUND START</span>;
      case 'metrics':
        return <span className="badge badge-green" style={{ fontSize: '0.6rem' }}>EVAL METRICS</span>;
      case 'error':
        return <span className="badge badge-red" style={{ fontSize: '0.6rem' }}>ERROR</span>;
      default:
        return <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{type}</span>;
    }
  };

  const formatEventMessage = (event: EventItem) => {
    const { type, data } = event;
    switch (type) {
      case 'round_start':
        return `Round ${data.round}/${data.total_rounds} initiated (${data.scenario.toUpperCase()} profile)`;
      case 'flag':
        return `Hospital #${data.client_id} flagged: ${data.reason}`;
      case 'exclude':
        return `Hospital #${data.client_id} excluded from aggregation: ${data.reason}`;
      case 'aggregate':
        return `FedAvg aggregated ${data.trusted_count} trusted updates (${data.excluded_count} quarantined)`;
      case 'metrics':
        return `Global Holdout: Acc ${(data.metrics.accuracy * 100).toFixed(1)}% | Loss ${data.metrics.loss.toFixed(4)} | F1 ${(data.metrics.f1 * 100).toFixed(1)}%`;
      case 'chain_write':
        return `Block #${data.entry.index} mined [Client ${data.entry.client_id} -> ${data.entry.status}] tx: ${data.entry.tx_hash.slice(0, 10)}...`;
      case 'round_end':
        return `Round ${data.round} completed in ${data.record.blockchain_ms}ms chain latency`;
      default:
        return JSON.stringify(data);
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '1.25rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Terminal size={16} color="var(--cyan-bright)" />
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-main)' }}>
            Live Security Audit & Event Stream
          </h3>
        </div>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          {events.length} events logged
        </span>
      </div>

      <div
        ref={scrollRef}
        style={{
          flex: 1,
          minHeight: '220px',
          maxHeight: '340px',
          overflowY: 'auto',
          background: 'rgba(9, 14, 24, 0.85)',
          borderRadius: '8px',
          padding: '0.75rem',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.75rem',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.45rem',
        }}
      >
        {events.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', margin: 'auto' }}>
            Awaiting simulation start... Start a run to observe live event telemetry.
          </div>
        ) : (
          events.slice(-60).map((e, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', lineHeight: '1.4' }}>
              <span style={{ color: '#475569', fontSize: '0.675rem', whiteSpace: 'nowrap' }}>
                {e.timestamp}
              </span>
              <div style={{ flexShrink: 0 }}>
                {getEventBadge(e.type)}
              </div>
              <span style={{ color: '#e2e8f0', wordBreak: 'break-word' }}>
                {formatEventMessage(e)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

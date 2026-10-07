import React, { useState, useEffect } from 'react';
import { 
  Database, 
  ShieldCheck, 
  ShieldAlert, 
  AlertTriangle, 
  RotateCcw, 
  CheckCircle2, 
  XCircle, 
  Lock, 
  Search, 
  ExternalLink,
  Copy,
  Check
} from 'lucide-react';
import { LedgerEntry, VerificationResult } from '../types';

export const LedgerPage: React.FC = () => {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [mode, setMode] = useState<string>('mock');
  const [tamperMessage, setTamperMessage] = useState<string | null>(null);

  const fetchLedger = async () => {
    try {
      const res = await fetch('/api/ledger');
      const data = await res.json();
      setEntries(data.entries || []);
      setMode(data.mode || 'mock');
    } catch (err) {
      console.error('Failed to fetch ledger', err);
    }
  };

  useEffect(() => {
    fetchLedger();
  }, []);

  const handleVerifyIntegrity = async () => {
    setIsLoading(true);
    setTamperMessage(null);
    try {
      const res = await fetch('/api/ledger/verify');
      const data = await res.json();
      setVerification(data);
    } catch (err) {
      console.error('Verification failed', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTamperDemonstration = async () => {
    if (entries.length === 0) return;
    setIsLoading(true);
    try {
      // Tamper mid-entry
      const targetIndex = Math.max(0, Math.floor(entries.length / 2));
      const res = await fetch(`/api/ledger/tamper?index=${targetIndex}`, { method: 'POST' });
      const data = await res.json();
      setTamperMessage(data.message);
      // Re-fetch to show modified entry
      await fetchLedger();
      // Prompt user to verify
      setVerification(null);
    } catch (err) {
      console.error('Tamper attempt failed', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetLedger = async () => {
    if (!confirm('Are you sure you want to clear all ledger audit entries?')) return;
    try {
      await fetch('/api/ledger/reset', { method: 'POST' });
      setEntries([]);
      setVerification(null);
      setTamperMessage(null);
    } catch (err) {
      console.error('Reset failed', err);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(text);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const filteredEntries = entries.filter((e) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      e.round.toString().includes(term) ||
      e.client_id.toString().includes(term) ||
      e.status.toLowerCase().includes(term) ||
      e.block_hash.toLowerCase().includes(term) ||
      e.tx_hash.toLowerCase().includes(term)
    );
  });

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '1.5rem 2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header & Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Database size={24} color="var(--cyan-bright)" />
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.5rem', color: '#ffffff' }}>
              Immutable Blockchain Audit Ledger
            </h2>
            <span className={mode === 'ganache' ? 'badge badge-green' : 'badge badge-purple'}>
              {mode === 'ganache' ? 'GANACHE EVM' : 'SHA-256 HASH-CHAIN'}
            </span>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Cryptographically sealed audit trail of model update hashes, cosine consensus scores, and exclusion verdicts.
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button className="btn-primary" onClick={handleVerifyIntegrity} disabled={isLoading || entries.length === 0}>
            <ShieldCheck size={16} />
            <span>Verify Ledger Integrity</span>
          </button>

          <button
            className="btn-danger"
            onClick={handleTamperDemonstration}
            disabled={isLoading || entries.length === 0}
            title="Simulates an adversary forcibly modifying a past ledger record on disk"
          >
            <AlertTriangle size={16} />
            <span>Tamper Past Block (Demo)</span>
          </button>

          <button className="btn-secondary" onClick={fetchLedger} disabled={isLoading}>
            <RotateCcw size={15} />
            <span>Refresh</span>
          </button>

          <button className="btn-secondary" onClick={handleResetLedger} disabled={isLoading || entries.length === 0}>
            <span>Clear Ledger</span>
          </button>
        </div>
      </div>

      {/* Tamper Notification Banner */}
      {tamperMessage && (
        <div style={{
          padding: '1rem',
          borderRadius: '10px',
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1.5px solid #ef4444',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: '#fca5a5',
          fontSize: '0.85rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <AlertTriangle size={20} color="#ef4444" />
            <span>{tamperMessage}</span>
          </div>
          <button
            className="btn-primary"
            onClick={handleVerifyIntegrity}
            style={{ fontSize: '0.75rem', padding: '0.4rem 0.8rem' }}
          >
            Run Integrity Check Now
          </button>
        </div>
      )}

      {/* Verification Result Banner */}
      {verification && (
        <div style={{
          padding: '1.25rem',
          borderRadius: '12px',
          background: verification.valid ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.15)',
          border: `1.5px solid ${verification.valid ? '#10b981' : '#ef4444'}`,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.6rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            {verification.valid ? (
              <CheckCircle2 size={24} color="#10b981" />
            ) : (
              <XCircle size={24} color="#ef4444" />
            )}
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem', color: verification.valid ? '#34d399' : '#f87171' }}>
              {verification.valid ? 'Cryptographic Integrity Verified' : 'Cryptographic Chain Severance Detected!'}
            </h3>
          </div>

          <p style={{ fontSize: '0.875rem', color: '#f8fafc', margin: 0 }}>
            {verification.message || verification.reason}
          </p>

          {!verification.valid && (
            <div style={{
              background: 'rgba(9, 14, 24, 0.9)',
              padding: '0.9rem',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.3rem',
            }}>
              <div>Tampered Block Index: <strong style={{ color: '#ef4444' }}>#{verification.tampered_index}</strong></div>
              <div>Violation Type: <strong style={{ color: '#f59e0b' }}>{verification.reason}</strong></div>
              {verification.expected_block_hash && (
                <div>Expected Hash: <span style={{ color: '#10b981' }}>{verification.expected_block_hash}</span></div>
              )}
              {verification.actual_block_hash && (
                <div>Actual Hash: <span style={{ color: '#ef4444' }}>{verification.actual_block_hash}</span></div>
              )}
            </div>
          )}

          {verification.valid && verification.latest_block_hash && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              Latest Verified Block Hash: <span style={{ color: '#67e8f9' }}>{verification.latest_block_hash}</span> ({verification.total_entries} blocks validated)
            </div>
          )}
        </div>
      )}

      {/* Search & Audit Table */}
      <div className="glass-panel" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ position: 'relative', width: '280px' }}>
            <Search size={15} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '10px' }} />
            <input
              type="text"
              placeholder="Search by Round, CID, Verdict, Hash..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '0.45rem 0.6rem 0.45rem 2.2rem',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                color: '#ffffff',
                fontSize: '0.8rem',
              }}
            />
          </div>

          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Showing {filteredEntries.length} of {entries.length} blockchain entries
          </span>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <th style={{ padding: '0.75rem 0.6rem' }}>Block #</th>
                <th style={{ padding: '0.75rem 0.6rem' }}>Round</th>
                <th style={{ padding: '0.75rem 0.6rem' }}>Hospital</th>
                <th style={{ padding: '0.75rem 0.6rem' }}>Model Update Hash</th>
                <th style={{ padding: '0.75rem 0.6rem' }}>Cosine Sim</th>
                <th style={{ padding: '0.75rem 0.6rem' }}>Verdict</th>
                <th style={{ padding: '0.75rem 0.6rem' }}>Block / TX Hash</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    No audit records found. Run a simulation to log federated updates to the blockchain.
                  </td>
                </tr>
              ) : (
                filteredEntries.map((e) => {
                  const isExcluded = e.status === 'EXCLUDED';
                  const isFlagged = e.status === 'FLAGGED';
                  return (
                    <tr
                      key={e.index}
                      style={{
                        borderBottom: '1px solid rgba(255,255,255,0.03)',
                        transition: 'background-color 0.15s ease',
                      }}
                      onMouseEnter={(ev) => (ev.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)')}
                      onMouseLeave={(ev) => (ev.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <td style={{ padding: '0.75rem 0.6rem', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--cyan-bright)' }}>
                        #{e.index}
                      </td>
                      <td style={{ padding: '0.75rem 0.6rem', fontWeight: 600, color: '#ffffff' }}>
                        Round {e.round}
                      </td>
                      <td style={{ padding: '0.75rem 0.6rem' }}>
                        Hospital #{e.client_id}
                      </td>
                      <td style={{ padding: '0.75rem 0.6rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                        <span title={e.update_hash}>
                          {e.update_hash ? `${e.update_hash.slice(0, 10)}...${e.update_hash.slice(-6)}` : 'N/A'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 0.6rem', fontFamily: 'var(--font-mono)', fontWeight: 600, color: isExcluded ? '#ef4444' : isFlagged ? '#f59e0b' : '#10b981' }}>
                        {e.similarity.toFixed(4)}
                      </td>
                      <td style={{ padding: '0.75rem 0.6rem' }}>
                        <span className={isExcluded ? 'badge badge-red' : isFlagged ? 'badge badge-amber' : 'badge badge-green'}>
                          {e.status}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 0.6rem', fontFamily: 'var(--font-mono)', color: '#94a3b8' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span>{e.tx_hash.slice(0, 14)}...</span>
                          <button
                            onClick={() => copyToClipboard(e.tx_hash)}
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                            title="Copy full transaction hash"
                          >
                            {copiedHash === e.tx_hash ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export type ScenarioType = 'clean' | 'attacked' | 'defended' | 'custom';
export type AttackType = 'label_flip' | 'sign_flip';
export type ClientStatus = 'Idle' | 'Training' | 'Sent' | 'ACCEPTED' | 'FLAGGED' | 'EXCLUDED';

export interface RunConfig {
  scenario: ScenarioType;
  num_clients: number;
  malicious_ids: number[];
  detection: boolean;
  attack_type: AttackType;
  rounds: number;
  local_epochs: number;
  batch_size: number;
  learning_rate: number;
  speed_ms: number;
  seed: number;
}

export interface ClientNodeState {
  id: number;
  name: string;
  isMalicious: boolean;
  status: ClientStatus;
  similarity: number;
  robustZ: number;
  kFlags: number;
  reason?: string;
  sampleCount?: number;
}

export interface RoundMetrics {
  round: number;
  accuracy: number;
  loss: number;
  precision: number;
  recall: number;
  f1: number;
  trusted_clients: number;
  excluded_clients: number;
  blockchain_ms: number;
}

export interface LedgerEntry {
  index: number;
  round: number;
  client_id: number;
  update_hash: string;
  status: 'ACCEPTED' | 'FLAGGED' | 'EXCLUDED';
  similarity: number;
  timestamp: number;
  prev_hash: string;
  block_hash: string;
  tx_hash: string;
}

export interface VerificationResult {
  valid: boolean;
  message?: string;
  reason?: string;
  tampered_index?: number;
  expected_prev_hash?: string;
  actual_prev_hash?: string;
  expected_block_hash?: string;
  actual_block_hash?: string;
  total_entries: number;
  latest_block_hash?: string;
  mode?: string;
  mode_display?: string;
}

export interface WSEvent {
  type:
    // Backend canonical event names (orchestrator.py)
    | 'init'
    | 'round_started'
    | 'global_model_broadcast'
    | 'client_training'
    | 'client_update_sent'
    | 'detection_complete'
    | 'aggregation_complete'
    | 'ledger_written'
    | 'round_completed'
    | 'run_completed'
    // Legacy / alternative names (kept for compatibility)
    | 'round_start'
    | 'client_status_batch'
    | 'similarity'
    | 'flag'
    | 'exclude'
    | 'aggregate'
    | 'metrics'
    | 'chain_write'
    | 'round_end'
    | 'run_end'
    | 'error';
  data: any;
}

export interface SampleImage {
  id: string;
  name: string;
  description: string;
  expected: string;
  file: string;
  type: 'valid' | 'invalid';
  image_url?: string;
}

export interface PredictionResult {
  status: 'accepted' | 'rejected';
  is_ood: boolean;
  error_type?: string;
  reason?: string;
  prediction?: 'Normal' | 'Pneumonia';
  predicted_class?: number;
  confidence?: number;
  confidence_percentage?: number;
  probabilities?: {
    normal: number;
    pneumonia: number;
  };
  heatmap_data_url?: string;
  explanation?: {
    plain_text: string;
    clinical_text: string;
    disclaimer: string;
    dominant_zone: string;
    coverage_pct: number;
    pattern_type: string;
    peak_intensity: number;
  };
  details?: any;
  disclaimer: string;
}

export interface ScenarioResultData {
  scenario: string;
  config: RunConfig;
  rounds: RoundMetrics[];
  elapsed_seconds: number;
  final_metrics: RoundMetrics;
}

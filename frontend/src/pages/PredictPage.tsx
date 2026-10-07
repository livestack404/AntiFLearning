import React, { useState, useEffect } from 'react';
import { 
  Upload, 
  AlertTriangle, 
  ShieldCheck, 
  ShieldAlert, 
  Sparkles, 
  Sliders, 
  CheckCircle2, 
  FileText, 
  User, 
  Stethoscope, 
  Layers, 
  Info 
} from 'lucide-react';
import { SampleImage, PredictionResult } from '../types';

export const PredictPage: React.FC = () => {
  const [samples, setSamples] = useState<SampleImage[]>([]);
  const [selectedSampleId, setSelectedSampleId] = useState<string | null>(null);
  const [uploadedImagePreview, setUploadedImagePreview] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [explanationMode, setExplanationMode] = useState<'plain' | 'clinical'>('clinical');
  const [heatmapAlpha, setHeatmapAlpha] = useState(0.5);

  useEffect(() => {
    fetch('/api/samples')
      .then((res) => res.json())
      .then((data) => setSamples(data))
      .catch((err) => console.error('Failed to load sample images', err));
  }, []);

  const handleSelectSample = async (sample: SampleImage) => {
    setSelectedSampleId(sample.id);
    setUploadedFile(null);
    setUploadedImagePreview(sample.image_url || null);
    setPrediction(null);
    setIsLoading(true);

    try {
      const res = await fetch(`/api/predict/sample/${sample.id}`, { method: 'POST' });
      const data = await res.json();
      setPrediction(data);
    } catch (err) {
      console.error('Inference error', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedSampleId(null);
    setUploadedFile(file);
    setPrediction(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      setUploadedImagePreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleAnalyzeUpload = async () => {
    if (!uploadedFile) return;
    setIsLoading(true);
    setPrediction(null);

    const formData = new FormData();
    formData.append('file', uploadedFile);

    try {
      const res = await fetch('/api/predict', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      setPrediction(data);
    } catch (err) {
      console.error('Upload analysis failed', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '1.5rem 2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Page Header */}
      <div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.5rem', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Sparkles size={24} color="var(--cyan-bright)" />
          Clinical Predict & Explainability Studio (XAI)
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Powered by the defended global model with 5-stage Out-Of-Distribution (OOD) guardrails & localized PyTorch Grad-CAM saliency.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem' }}>
        {/* Left Column: Sample Picker & Image Uploader */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Preset Samples */}
          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.75rem', color: '#ffffff' }}>
              Select Benchmark Sample (One-Click Verification)
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
              {samples.map((s) => {
                const isSelected = selectedSampleId === s.id;
                return (
                  <div
                    key={s.id}
                    onClick={() => handleSelectSample(s)}
                    style={{
                      background: isSelected ? 'rgba(6, 182, 212, 0.15)' : 'var(--bg-secondary)',
                      border: isSelected ? '1.5px solid var(--cyan-primary)' : '1px solid var(--border-subtle)',
                      borderRadius: '10px',
                      padding: '0.75rem',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      textAlign: 'center',
                      gap: '0.5rem',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <div style={{ width: '64px', height: '64px', borderRadius: '8px', overflow: 'hidden', background: '#000000', border: '1px solid var(--border-subtle)' }}>
                      {s.image_url ? (
                        <img src={s.image_url} alt={s.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>X-Ray</div>
                      )}
                    </div>
                    <div>
                      <span style={{ fontWeight: 600, fontSize: '0.8rem', display: 'block', color: '#ffffff' }}>{s.name}</span>
                      <span
                        className={s.type === 'invalid' ? 'badge badge-red' : 'badge badge-cyan'}
                        style={{ fontSize: '0.6rem', marginTop: '0.2rem' }}
                      >
                        {s.expected}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Custom Upload Card */}
          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.75rem', color: '#ffffff' }}>
              Or Upload Patient Radiograph
            </h3>
            <label
              style={{
                border: '2px dashed var(--border-subtle)',
                borderRadius: '10px',
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
                background: 'rgba(11, 18, 32, 0.5)',
                transition: 'border-color 0.2s ease',
              }}
            >
              <Upload size={24} color="var(--cyan-bright)" />
              <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-main)' }}>
                Drag & drop or click to browse
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Supports PNG, JPEG, DICOM-exported Grayscale
              </span>
              <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display: 'none' }} />
            </label>

            {uploadedFile && (
              <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Selected: <strong>{uploadedFile.name}</strong>
                </span>
                <button className="btn-primary" onClick={handleAnalyzeUpload} disabled={isLoading}>
                  {isLoading ? 'Analyzing...' : 'Run Analysis'}
                </button>
              </div>
            )}
          </div>

          {/* OOD Guardrail Specifications Banner */}
          <div className="glass-panel" style={{ padding: '1rem', background: 'rgba(13, 21, 37, 0.7)' }}>
            <h4 style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--cyan-bright)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <ShieldCheck size={16} />
              5-Stage Zero-Trust OOD Guardrails
            </h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              <li>✓ <strong>Format & Dimension:</strong> Non-corrupt decodable 28x28 normalized tensor.</li>
              <li>✓ <strong>Aspect Ratio & Blank:</strong> Aspect ratio &isin; [0.4, 2.5], Pixel STD &ge; 0.05.</li>
              <li>✓ <strong>Color Rejection:</strong> Channel variance &le; 0.15 (rejects color photos).</li>
              <li>✓ <strong>Softmax Floor:</strong> Probability &ge; 70% threshold.</li>
              <li>✓ <strong>Mahalanobis Distance:</strong> Feature geometry &le; 99th percentile training ceiling.</li>
            </ul>
          </div>
        </div>

        {/* Right Column: Diagnostic Output & Explainability */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {isLoading ? (
            <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--cyan-bright)' }}>
              <div style={{ width: '40px', height: '40px', border: '3px solid rgba(6,182,212,0.2)', borderTopColor: '#06b6d4', borderRadius: '50%', margin: '0 auto 1rem', animation: 'spin-slow 1s linear infinite' }} />
              <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Executing Diagnostic Pipeline...</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Running OOD verification & penultimate feature projection</p>
            </div>
          ) : !prediction ? (
            <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Layers size={36} color="var(--text-muted)" style={{ margin: '0 auto 0.75rem', opacity: 0.5 }} />
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>No Active Diagnosis</h3>
              <p style={{ fontSize: '0.8rem' }}>Select a preset sample on the left or upload an image to view Grad-CAM and clinical explanations.</p>
            </div>
          ) : prediction.status === 'rejected' ? (
            /* OOD Rejection Panel */
            <div className="glass-panel" style={{ padding: '1.5rem', border: '1.5px solid #ef4444', background: 'rgba(239, 68, 68, 0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ShieldAlert size={22} color="#ef4444" />
                </div>
                <div>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.15rem', color: '#fca5a5' }}>
                    Out-Of-Distribution Rejection
                  </h3>
                  <span className="badge badge-red" style={{ fontSize: '0.65rem' }}>{prediction.error_type || 'GUARDRAIL REJECTION'}</span>
                </div>
              </div>

              <p style={{ fontSize: '0.875rem', color: '#f8fafc', marginBottom: '1rem', lineHeight: '1.5' }}>
                {prediction.reason}
              </p>

              {prediction.details && (
                <div style={{ background: 'rgba(11, 18, 32, 0.8)', padding: '0.9rem', borderRadius: '8px', border: '1px solid var(--border-subtle)', marginBottom: '1rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>
                    DIAGNOSTIC TELEMETRY:
                  </span>
                  <pre style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#67e8f9', margin: 0 }}>
                    {JSON.stringify(prediction.details, null, 2)}
                  </pre>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <Info size={14} />
                <span>{prediction.disclaimer}</span>
              </div>
            </div>
          ) : (
            /* Accepted Diagnostic Panel */
            <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Verdict Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.5rem', color: prediction.prediction === 'Pneumonia' ? '#f87171' : '#34d399' }}>
                      {prediction.prediction?.toUpperCase()}
                    </h3>
                    <span className={prediction.prediction === 'Pneumonia' ? 'badge badge-red' : 'badge badge-green'}>
                      {prediction.prediction === 'Pneumonia' ? 'Infection Detected' : 'Clear Lung Fields'}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Softmax Posterior Confidence: <strong>{prediction.confidence_percentage}%</strong>
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '1rem', background: 'var(--bg-secondary)', padding: '0.5rem 0.9rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <div>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block' }}>P(NORMAL)</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '0.9rem', color: '#6ee7b7' }}>
                      {((prediction.probabilities?.normal || 0) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div style={{ borderLeft: '1px solid var(--border-subtle)', paddingLeft: '1rem' }}>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block' }}>P(PNEUMONIA)</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '0.9rem', color: '#f87171' }}>
                      {((prediction.probabilities?.pneumonia || 0) * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Side-by-Side Images: Original vs Grad-CAM Overlay */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                {/* Original */}
                <div style={{ background: '#000000', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.05)', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Input Radiograph
                  </div>
                  <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {uploadedImagePreview && (
                      <img src={uploadedImagePreview} alt="Original" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    )}
                  </div>
                </div>

                {/* Grad-CAM Heatmap */}
                <div style={{ background: '#000000', borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(6, 182, 212, 0.4)', display: 'flex', flexDirection: 'column', boxShadow: '0 0 20px -5px rgba(6, 182, 212, 0.3)' }}>
                  <div style={{ padding: '0.5rem 0.75rem', background: 'rgba(6, 182, 212, 0.1)', fontSize: '0.75rem', fontWeight: 600, color: 'var(--cyan-bright)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Grad-CAM Saliency Overlay</span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Conv2 Saliency</span>
                  </div>
                  <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {prediction.heatmap_data_url && (
                      <img src={prediction.heatmap_data_url} alt="Grad-CAM" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    )}
                  </div>
                </div>
              </div>

              {/* Anatomical Zone Analysis Chips */}
              {prediction.explanation && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.6rem' }}>
                  <div style={{ padding: '0.6rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block' }}>DOMINANT ZONE</span>
                    <strong style={{ fontSize: '0.8rem', color: '#ffffff' }}>{prediction.explanation.dominant_zone}</strong>
                  </div>
                  <div style={{ padding: '0.6rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block' }}>INFILTRATE PATTERN</span>
                    <strong style={{ fontSize: '0.8rem', color: '#ffffff' }}>{prediction.explanation.pattern_type}</strong>
                  </div>
                  <div style={{ padding: '0.6rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block' }}>COVERAGE AREA</span>
                    <strong style={{ fontSize: '0.8rem', color: '#ffffff' }}>{prediction.explanation.coverage_pct}% of field</strong>
                  </div>
                  <div style={{ padding: '0.6rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block' }}>PEAK SALIENCY</span>
                    <strong style={{ fontSize: '0.8rem', color: '#ffffff' }}>{prediction.explanation.peak_intensity}</strong>
                  </div>
                </div>
              )}

              {/* Dual Explanation Toggle */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', gap: '0.4rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.4rem' }}>
                  <button
                    onClick={() => setExplanationMode('clinical')}
                    style={{
                      background: explanationMode === 'clinical' ? 'rgba(6, 182, 212, 0.2)' : 'transparent',
                      border: 'none',
                      color: explanationMode === 'clinical' ? 'var(--cyan-bright)' : 'var(--text-muted)',
                      padding: '0.4rem 0.8rem',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                    }}
                  >
                    <Stethoscope size={15} />
                    <span>Clinical Diagnostic Report (Physician)</span>
                  </button>

                  <button
                    onClick={() => setExplanationMode('plain')}
                    style={{
                      background: explanationMode === 'plain' ? 'rgba(6, 182, 212, 0.2)' : 'transparent',
                      border: 'none',
                      color: explanationMode === 'plain' ? 'var(--cyan-bright)' : 'var(--text-muted)',
                      padding: '0.4rem 0.8rem',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                    }}
                  >
                    <User size={15} />
                    <span>Plain-Language Summary (Patient)</span>
                  </button>
                </div>

                <div style={{ padding: '1rem', background: 'rgba(9, 14, 24, 0.8)', borderRadius: '8px', border: '1px solid var(--border-subtle)', fontSize: '0.85rem', lineHeight: '1.6', color: '#f1f5f9' }}>
                  {explanationMode === 'clinical'
                    ? prediction.explanation?.clinical_text
                    : prediction.explanation?.plain_text}
                </div>
              </div>

              {/* Regulatory Disclaimer */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.75rem' }}>
                <Info size={14} />
                <span>{prediction.disclaimer}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

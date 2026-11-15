// AI suggestion card and badge (R32; design "Dashboard · Candidate review"). Wording always makes clear that
// the suggestion can be wrong and that the admin decides.
import { useCallback, useEffect, useState } from 'react';
import { AI_SUGGESTION_LABELS, confidenceLevel, isCheatingSuggestion, type AiSuggestion } from '@icu/core';
import { loadAnalysis, type AiAnalysis } from '../lib/data';
import { errorText, supabase } from '../supabase';
import { formatDateTime } from '../ui';

const label = (s: string | null) => (s ? AI_SUGGESTION_LABELS[s as AiSuggestion] ?? s : '');
const pct = (n: number | undefined) => `${Math.round((n ?? 0) * 100)}%`;

export function AiBadge({ analysis }: { analysis?: AiAnalysis }) {
  if (!analysis) return <>—</>;
  if (analysis.status === 'pending') return <span className="pill">Analyzing…</span>;
  if (analysis.status === 'failed' || !analysis.suggestion) return <span className="pill">Unavailable</span>;
  const cls = isCheatingSuggestion(analysis.suggestion) ? 'hi' : analysis.suggestion === 'needs_review' ? 'md' : 'lo';
  return (
    <span className={`pill ${cls}`} title="AI suggestion; the verdict is yours">
      {label(analysis.suggestion)} · {pct(analysis.probabilities?.[analysis.suggestion])}
    </span>
  );
}

export function AiSuggestionCard({ attemptId, canAnalyze }: { attemptId: string; canAnalyze: boolean }) {
  const [analysis, setAnalysis] = useState<AiAnalysis | null>();
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    try {
      setAnalysis(await loadAnalysis(attemptId));
    } catch (e) {
      setError(errorText(e as { message: string }));
    }
  }, [attemptId]);

  useEffect(() => void refresh(), [refresh]);
  // While pending, check every 3 s for up to 90 s.
  useEffect(() => {
    if (analysis?.status !== 'pending') return;
    const started = Date.now();
    const t = setInterval(() => {
      if (Date.now() - started > 90_000) clearInterval(t);
      else void refresh();
    }, 3000);
    return () => clearInterval(t);
  }, [analysis?.status, refresh]);

  const reanalyze = async () => {
    setError(undefined);
    const { error } = await supabase!.rpc('request_ai_analysis', { p_attempt_id: attemptId });
    if (error) return setError(errorText(error));
    await refresh();
  };

  const s = analysis?.suggestion ?? null;
  const done = analysis?.status === 'done' && s;
  const pending = analysis?.status === 'pending';
  return (
    <section className="card pc yellow" aria-labelledby="ai" aria-live="polite">
      <div className="cardhead">
        <h2 id="ai">AI suggestion</h2>
        {canAnalyze && (
          <button type="button" className="btn s sm" disabled={pending} onClick={() => void reanalyze()}>
            {pending ? 'Analyzing…' : analysis ? 'Re-analyze' : 'Analyze'}
          </button>
        )}
      </div>
      {analysis === undefined && <p className="hint" style={{ margin: 0 }}>Loading…</p>}
      {analysis === null && <p className="hint" style={{ margin: 0 }}>Not analyzed yet. Analysis runs automatically when the exam ends.</p>}
      {pending && <p className="hint" style={{ margin: 0 }}>Analyzing the activity timeline…</p>}
      {analysis?.status === 'failed' && <p className="hint" style={{ margin: 0 }}>AI analysis unavailable{analysis.error ? `: ${analysis.error}` : ''}. Use the timeline and risk score, or try again.</p>}
      {done && (
        <>
          <p style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.35, marginBottom: 14 }}>
            {label(s)}{' '}
            <span style={{ fontWeight: 400, color: 'var(--muted)' }}>
              · {pct(analysis.probabilities?.[s])}{analysis.confidence !== null && ` · confidence ${confidenceLevel(analysis.confidence).toLowerCase()}`}
            </span>
          </p>
          <div role="list" className="probbox" aria-label="Probability of each option">
            {Object.entries(AI_SUGGESTION_LABELS).map(([key, text]) => {
              const p = analysis.probabilities?.[key] ?? 0;
              return (
                <div key={key} role="listitem">
                  <div className="probrow"><span>{text}</span><b className="num">{pct(p)}</b></div>
                  <div className="bar"><i className={key === s ? '' : 'g'} style={{ width: `${Math.round(p * 100)}%` }} /></div>
                </div>
              );
            })}
          </div>
        </>
      )}
      <p className="hint" style={{ marginTop: 14 }}>
        {done && analysis.analyzed_at ? `Analyzed ${formatDateTime(analysis.analyzed_at)}. ` : ''}A suggestion only. It can be wrong; your verdict is the decision.
      </p>
      {error && <p className="err" role="alert">{error}</p>}
    </section>
  );
}

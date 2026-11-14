// AI suggestion card and badge (R32; DSD § Components "AI suggestion"). Wording always makes clear that
// the suggestion can be wrong and that the admin decides.
import { useCallback, useEffect, useState } from 'react';
import { AI_SUGGESTION_LABELS, confidenceLevel, isCheatingSuggestion, type AiSuggestion } from '@icu/core';
import { loadAnalysis, type AiAnalysis } from '../lib/data';
import { errorText, supabase } from '../supabase';
import { Alert, Button, formatDateTime } from '../ui';

const label = (s: string | null) => (s ? AI_SUGGESTION_LABELS[s as AiSuggestion] ?? s : '');
const pct = (n: number | undefined) => `${Math.round((n ?? 0) * 100)}%`;

export function AiBadge({ analysis }: { analysis?: AiAnalysis }) {
  if (!analysis) return <span className="text-xs text-muted">—</span>;
  if (analysis.status === 'pending') return <span className="text-xs text-muted">Analyzing…</span>;
  if (analysis.status === 'failed' || !analysis.suggestion) return <span className="text-xs text-muted">Unavailable</span>;
  const cheating = isCheatingSuggestion(analysis.suggestion);
  const cls = cheating ? 'bg-risk-high-bg text-risk-high-fg' : analysis.suggestion === 'needs_review' ? 'bg-risk-med-bg text-risk-med-fg' : 'bg-risk-low-bg text-risk-low-fg';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`} title="AI suggestion; the verdict is yours">
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
  return (
    <section className="rounded-md border border-border-strong p-4" aria-labelledby="ai-heading" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="ai-heading" className="text-lg font-semibold">AI suggestion</h2>
        {canAnalyze && (
          <Button variant="secondary" onClick={() => void reanalyze()} disabled={analysis?.status === 'pending'}>
            {analysis ? 'Re-analyze' : 'Analyze'}
          </Button>
        )}
      </div>
      {analysis === undefined && <p className="text-sm text-muted">Loading…</p>}
      {analysis === null && <p className="text-sm text-muted">Not analyzed yet. Analysis runs automatically when the exam ends.</p>}
      {analysis?.status === 'pending' && <p className="text-sm text-muted">Analyzing the activity timeline…</p>}
      {analysis?.status === 'failed' && <p className="text-sm text-muted">AI analysis unavailable{analysis.error ? `: ${analysis.error}` : ''}. Use the timeline and risk score, or try again.</p>}
      {done && (
        <div className="mt-2 flex flex-col gap-3">
          <p className="text-base">
            <span className="font-semibold">{label(s)}</span> · {pct(analysis.probabilities?.[s])}
            {analysis.confidence !== null && <span className="text-muted"> · confidence {confidenceLevel(analysis.confidence).toLowerCase()}</span>}
          </p>
          <ul className="flex flex-col gap-1" aria-label="Probability of each option">
            {Object.entries(AI_SUGGESTION_LABELS).map(([key, text]) => {
              const p = analysis.probabilities?.[key] ?? 0;
              return (
                <li key={key} className="grid grid-cols-[1fr_auto] items-center gap-x-3 text-xs">
                  <span>{text}</span>
                  <span className="w-10 text-right">{pct(p)}</span>
                  <span className="col-span-2 h-1.5 rounded-full bg-surface" aria-hidden>
                    <span className={`block h-1.5 rounded-full ${key === s ? 'bg-primary' : 'bg-border-strong'}`} style={{ width: `${Math.round(p * 100)}%` }} />
                  </span>
                </li>
              );
            })}
          </ul>
          {analysis.analyzed_at && <p className="text-xs text-muted">Analyzed {formatDateTime(analysis.analyzed_at)}</p>}
        </div>
      )}
      <p className="mt-2 text-xs text-muted">A suggestion only. It can be wrong; your verdict is the decision.</p>
      {error && <Alert>{error}</Alert>}
    </section>
  );
}

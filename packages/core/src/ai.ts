// AI suggestion labels for the dashboard (R32, DSD § Content and voice). The model-side question and
// option keys live in supabase/functions/_shared/analysis.ts; test/analysis.test.ts keeps keys in sync.

export const AI_SUGGESTION_LABELS = {
  cheating_ai_or_web: 'Likely cheating: used AI or the web',
  cheating_copy_paste: 'Likely cheating: pasted outside content',
  cheating_monitoring_off: 'Likely cheating: monitoring off or left the exam',
  needs_review: 'Needs review',
  likely_fine: 'Likely fine',
} as const;

export type AiSuggestion = keyof typeof AI_SUGGESTION_LABELS;

/** Plain-language confidence from the model's 0–1 confidence value. */
export function confidenceLevel(confidence: number): 'High' | 'Medium' | 'Low' {
  if (confidence >= 0.7) return 'High';
  if (confidence >= 0.4) return 'Medium';
  return 'Low';
}

export const isCheatingSuggestion = (s: string) => s.startsWith('cheating_');

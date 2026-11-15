// One load of the admin's sessions and every candidate summary, shared by Overview, Sessions, Needs review
// and the sidebar. Uses the same calls the pages made before: exam_sessions + session_attempt_summaries.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadSummaries, needsReview, SESSION_COLUMNS, type ReviewAttempt, type SessionRow } from './data';
import { errorText, supabase } from '../supabase';

interface AdminData {
  loading: boolean;
  error?: string;
  sessions: SessionRow[];
  attempts: ReviewAttempt[];
  needsReviewCount: number;
  reload: () => Promise<void>;
}

const Ctx = createContext<AdminData>({ loading: true, sessions: [], attempts: [], needsReviewCount: 0, reload: async () => {} });

export function AdminDataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ loading: boolean; error?: string; sessions: SessionRow[]; attempts: ReviewAttempt[] }>({ loading: true, sessions: [], attempts: [] });

  const reload = useCallback(async () => {
    try {
      const { data, error } = await supabase!.from('exam_sessions').select(SESSION_COLUMNS).order('starts_at', { ascending: false });
      if (error) throw error;
      const sessions = data as SessionRow[];
      const perSession = await Promise.all(sessions.map(async (s) => (await loadSummaries(s)).map((a): ReviewAttempt => ({ ...a, session: s }))));
      setState({ loading: false, sessions, attempts: perSession.flat() });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: errorText(e as { message: string }) }));
    }
  }, []);

  useEffect(() => void reload(), [reload]);

  const value = useMemo<AdminData>(
    () => ({ ...state, needsReviewCount: state.attempts.filter(needsReview).length, reload }),
    [state, reload],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAdminData = () => useContext(Ctx);

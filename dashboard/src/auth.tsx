// Session and profile state for the dashboard (R2, R3).
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Role } from '@ocm/core';
import { supabase } from './supabase';

export interface Profile {
  id: string;
  role: Role;
  full_name: string;
  email: string;
}

interface AuthValue {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
}

const AuthContext = createContext<AuthValue>({ loading: true, session: null, profile: null });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<AuthValue>({ loading: true, session: null, profile: null });

  useEffect(() => {
    if (!supabase) return setValue({ loading: false, session: null, profile: null });
    const client = supabase;
    const load = async (session: Session | null) => {
      if (!session) return setValue({ loading: false, session: null, profile: null });
      const { data } = await client.from('profiles').select('id, role, full_name, email').eq('id', session.user.id).single();
      setValue({ loading: false, session, profile: (data as Profile | null) ?? null });
    };
    void client.auth.getSession().then(({ data }) => load(data.session));
    const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
      // Defer the query out of the auth callback, as supabase-js recommends.
      setTimeout(() => void load(session), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

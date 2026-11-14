// Sign-up / sign-in in the service worker (R2). The role is stored at sign-up and fixed afterwards.
import type { AuthState, Role } from '@ocm/core';
import { isConfigured } from './env';
import { OcmError } from './errors';
import { loadAttempt } from './state';
import { getSupabase } from './supabase';

async function profileState(): Promise<AuthState> {
  const supabase = getSupabase();
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return { configured: true, signedIn: false };
  const { data: profile, error } = await supabase.from('profiles').select('role, full_name, email').eq('id', user.id).single();
  if (error || !profile) throw error ?? new OcmError('OCM_PROFILE_MISSING');
  return { configured: true, signedIn: true, role: profile.role as Role, full_name: profile.full_name, email: profile.email };
}

export async function authState(): Promise<AuthState> {
  if (!isConfigured()) return { configured: false, signedIn: false };
  return profileState();
}

export async function signUp(email: string, password: string, full_name: string, role: Role): Promise<AuthState & { needsConfirmation?: boolean }> {
  const { data, error } = await getSupabase().auth.signUp({ email, password, options: { data: { role, full_name } } });
  if (error) throw error;
  // Projects with email confirmation on return no session until the link is clicked.
  if (!data.session) return { configured: true, signedIn: false, needsConfirmation: true };
  return profileState();
}

export async function signIn(email: string, password: string): Promise<AuthState> {
  const { error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return profileState();
}

export async function signOut(): Promise<void> {
  if ((await loadAttempt())?.state === 'active') throw new OcmError('OCM_ATTEMPT_ACTIVE');
  await getSupabase().auth.signOut();
}

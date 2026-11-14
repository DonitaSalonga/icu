// The extension's only Supabase client. It lives in the service worker; other extension pages
// talk to it through runtime messages (SDD.md § Components, decision D3).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isConfigured, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './env';

// Supabase Auth session persisted in chrome.storage.local; service workers have no Web Storage (RESEARCH F8).
const chromeStorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    const got = await browser.storage.local.get(key);
    const value = got[key];
    return typeof value === 'string' ? value : null;
  },
  async setItem(key: string, value: string): Promise<void> {
    await browser.storage.local.set({ [key]: value });
  },
  async removeItem(key: string): Promise<void> {
    await browser.storage.local.remove(key);
  },
};

let client: SupabaseClient | undefined;

export class NotConfiguredError extends Error {
  constructor() {
    super('OCM_NOT_CONFIGURED');
  }
}

export function getSupabase(): SupabaseClient {
  if (!isConfigured()) throw new NotConfiguredError();
  client ??= createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: chromeStorageAdapter,
      storageKey: 'ocm-auth',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}

/** Content scripts must not read tokens from storage.local (RESEARCH F13). */
export async function restrictStorageToTrustedContexts(): Promise<void> {
  await browser.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
}

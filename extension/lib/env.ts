// Build-time configuration from the repository-root .env (see .env.example).
export const SUPABASE_URL: string = import.meta.env.WXT_SUPABASE_URL ?? '';
export const SUPABASE_PUBLISHABLE_KEY: string = import.meta.env.WXT_SUPABASE_PUBLISHABLE_KEY ?? '';
export const DASHBOARD_URL: string = import.meta.env.WXT_DASHBOARD_URL ?? 'http://localhost:5173';

export const isConfigured = (): boolean => SUPABASE_URL !== '' && SUPABASE_PUBLISHABLE_KEY !== '';

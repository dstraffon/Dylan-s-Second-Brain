/**
 * Where the synced copy lives: a Supabase project (see docs/sync-setup.md).
 *
 * Both values are safe to publish. The key is Supabase's public
 * "publishable" (or legacy "anon") key; what anyone can read or write is
 * decided by the row-level security rules in supabase/schema.sql, which
 * only let a signed-in person touch their own rows.
 *
 * They can come from the build (VITE_SUPABASE_URL / VITE_SUPABASE_KEY, set
 * as repository variables for the GitHub Pages workflow) or be filled in
 * here. With neither, the app runs exactly as before: this browser only.
 */
const env = import.meta.env as Record<string, string | undefined>

// Dylan's Supabase project. A build can point elsewhere with the env vars above.
export const SUPABASE_URL = env.VITE_SUPABASE_URL || 'https://rkiksyvrhcegoxnvxmwf.supabase.co'
export const SUPABASE_KEY = env.VITE_SUPABASE_KEY || 'sb_publishable_aQVcZvFpeVOQviMwpaj7Kw_IJFZLuYx'

export const syncConfigured = () => !!(SUPABASE_URL && SUPABASE_KEY)

/** Keys that stay on each device: view filters and tabs, and the weather cache. */
export const isDeviceOnly = (key: string) => key.startsWith('ui:') || key === 'weather-cache'

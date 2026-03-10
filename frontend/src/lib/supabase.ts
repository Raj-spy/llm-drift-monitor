/**
 * Supabase client helpers.
 * Two clients:
 *   - createBrowserClient() — for Client Components
 *   - createServerClient() — for Server Components / Route Handlers
 */
import { createBrowserClient as _createBrowserClient } from '@supabase/ssr'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/** Use in Client Components */
export function createBrowserClient() {
  return _createBrowserClient(SUPABASE_URL, SUPABASE_ANON)
}

/** Singleton for client-side usage */
let _client: ReturnType<typeof _createBrowserClient> | null = null
export function getSupabaseClient() {
  if (!_client) _client = createBrowserClient()
  return _client
}

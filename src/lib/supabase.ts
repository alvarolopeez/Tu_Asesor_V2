import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Deferred creation so module evaluation never throws during build-time prerender.
// At runtime, NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.
export const supabase: SupabaseClient = url && key
  ? createClient(url, key)
  : (null as unknown as SupabaseClient)

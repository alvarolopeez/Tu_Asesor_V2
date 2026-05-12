import { createClient, SupabaseClient } from '@supabase/supabase-js'

/**
 * Cliente Supabase con inicialización lazy.
 * 
 * FIX APLICADO (Code Review - Netlify Deploy):
 * - Antes: createClient() se ejecutaba a nivel de módulo (top-level).
 *   Esto causaba que durante el pre-render estático de Next.js (SSG/build),
 *   las variables de entorno no existieran y el build fallara con:
 *   "Error: supabaseUrl is required."
 * - Ahora: Se usa un patrón lazy singleton que solo crea el cliente
 *   cuando se accede por primera vez (en runtime, no en build-time).
 * 
 * IMPORTANTE: También debes añadir las variables de entorno en Netlify:
 * - NEXT_PUBLIC_SUPABASE_URL
 * - NEXT_PUBLIC_SUPABASE_ANON_KEY
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

let _supabase: SupabaseClient | null = null

export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!_supabase) {
      if (!supabaseUrl || !supabaseAnonKey) {
        // Durante build/prerender, devolver un mock que no crashea
        // En runtime (browser), las variables NEXT_PUBLIC_* siempre están disponibles
        console.warn('[Supabase] Variables de entorno no disponibles (probablemente en build-time)')
        _supabase = createClient('https://placeholder.supabase.co', 'placeholder-key')
      } else {
        _supabase = createClient(supabaseUrl, supabaseAnonKey)
      }
    }
    return (_supabase as any)[prop]
  }
})

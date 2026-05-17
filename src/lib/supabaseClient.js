import { createClient } from '@supabase/supabase-js'

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim()
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase environment variables are not set. Authentication will not work.')
}

export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        storageKey: 'hamming-auth',
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
        autoRefreshToken: true,
        detectSessionInUrl: true
      },
    })
  : null

/**
 * ============================================================
 *  ConnectWork — config.js
 *
 *  ⚠️  Este arquivo NÃO vai para o GitHub (.gitignore).
 *      Contém as credenciais reais do Supabase.
 * ============================================================
 */

const SUPABASE_URL      = 'https://zzbcbgbpapklxziwcswh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_XtrBNdOXGURSDYonAfZz3w_53YF-9oD';

window._sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession:     true,
    autoRefreshToken:   true,
    detectSessionInUrl: false,
  },
});

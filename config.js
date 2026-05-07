const SUPABASE_URL      = '';
const SUPABASE_ANON_KEY = '';
window._sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession:     true,
    autoRefreshToken:   true,
    detectSessionInUrl: false,
  },
});

/**
 * ============================================================
 *  ConnectWork — Exemplo de Configuração  (js/config.example.js)
 *
 *  ✅  Este arquivo É commitado no GitHub — sem credenciais reais.
 *
 *  Para usar:
 *    cp js/config.example.js js/config.js
 *    (depois edite config.js com seus dados reais)
 * ============================================================
 */

const SUPABASE_URL      = 'https://SEU_PROJETO.supabase.co';
const SUPABASE_ANON_KEY = 'SUA_CHAVE_ANONIMA_AQUI';

window._sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession:    true,
    autoRefreshToken:  true,
    detectSessionInUrl: false,
  },
});

/**
 * ============================================================
 *  ConnectWork — API Layer  (js/api.js)
 *
 *  Este arquivo é o ÚNICO ponto de contato com o Supabase.
 *  Não contém URL nem chave — essas vêm de js/config.js,
 *  que NUNCA é commitado no GitHub (está no .gitignore).
 *
 *  Todas as funções retornam: { data, error }
 *  O app.js consome apenas essas funções; nunca chama
 *  o Supabase diretamente.
 * ============================================================
 */

/* ── Supabase client (inicializado em config.js) ─────────── */
// window._sb é definido em js/config.js
const sb = () => window._sb;

/* ══════════════════════════════════════════════════════════
   HELPERS INTERNOS
══════════════════════════════════════════════════════════ */
function ok(data)          { return { data, error: null }; }
function fail(error)       { return { data: null, error }; }
function fmtError(e)       { return e?.message || e?.error_description || String(e); }

/* Converte File → Base64 (para upload de currículo) */
function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = e => res(e.target.result);
    r.onerror = () => rej(new Error('Erro ao ler arquivo'));
    r.readAsDataURL(file);
  });
}

/* ══════════════════════════════════════════════════════════
   AUTH — USUÁRIOS (PROFISSIONAIS)
══════════════════════════════════════════════════════════ */

/**
 * Cadastrar novo profissional
 * @param {Object} form  - { name, cpf, email, phone, city, birth, niche, skills[], password }
 * @param {File|null} cvFile - arquivo de currículo (opcional agora, obrigatório no fluxo)
 */
async function authRegisterUser(form, cvFile) {
  try {
    // 1. Criar conta no Supabase Auth
    const { data: authData, error: authErr } = await sb().auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { role: 'user', name: form.name } }
    });
    if (authErr) return fail(fmtError(authErr));

    const uid = authData.user.id;

    // 2. Upload do currículo para Supabase Storage (bucket: curriculos)
    let cvUrl = null, cvName = null, cvType = null;
    if (cvFile) {
      const ext   = cvFile.name.split('.').pop();
      const path  = `users/${uid}/curriculo.${ext}`;
      const { error: storErr } = await sb()
        .storage.from('curriculos')
        .upload(path, cvFile, { upsert: true, contentType: cvFile.type });
      if (storErr) return fail('Erro ao salvar currículo: ' + fmtError(storErr));

      const { data: urlData } = sb().storage.from('curriculos').getPublicUrl(path);
      cvUrl  = urlData?.publicUrl || null;
      cvName = cvFile.name;
      cvType = cvFile.type;
    }

    // 3. Salvar perfil na tabela `users`
    const { error: dbErr } = await sb().from('users').insert({
      id:       uid,
      name:     form.name,
      cpf:      form.cpf,
      email:    form.email,
      phone:    form.phone  || null,
      city:     form.city,
      birth:    form.birth  || null,
      niche:    form.niche,
      skills:   form.skills,           // text[]
      cv_url:   cvUrl,
      cv_name:  cvName,
      cv_type:  cvType,
    });
    if (dbErr) return fail(fmtError(dbErr));

    return ok({ id: uid, ...form, cv_url: cvUrl, cv_name: cvName, cv_type: cvType });

  } catch (e) { return fail(fmtError(e)); }
}

/**
 * Login de profissional
 */
async function authLoginUser(email, password) {
  try {
    const { data, error } = await sb().auth.signInWithPassword({ email, password });
    if (error) return fail(fmtError(error));

    const { data: profile, error: pErr } = await sb()
      .from('users').select('*').eq('id', data.user.id).single();
    if (pErr) return fail(fmtError(pErr));

    return ok({ ...profile, _authId: data.user.id });
  } catch (e) { return fail(fmtError(e)); }
}

/* ══════════════════════════════════════════════════════════
   AUTH — EMPRESAS
══════════════════════════════════════════════════════════ */

/**
 * Cadastrar nova empresa
 */
async function authRegisterCompany(form) {
  try {
    const { data: authData, error: authErr } = await sb().auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { role: 'company', name: form.name } }
    });
    if (authErr) return fail(fmtError(authErr));

    const uid = authData.user.id;

    const { error: dbErr } = await sb().from('companies').insert({
      id:    uid,
      name:  form.name,
      cnpj:  form.cnpj,
      email: form.email,
      phone: form.phone || null,
      city:  form.city,
      niche: form.niche,
      description: form.desc || null,
    });
    if (dbErr) return fail(fmtError(dbErr));

    return ok({ id: uid, ...form });
  } catch (e) { return fail(fmtError(e)); }
}

/**
 * Login de empresa
 */
async function authLoginCompany(email, password) {
  try {
    const { data, error } = await sb().auth.signInWithPassword({ email, password });
    if (error) return fail(fmtError(error));

    const { data: profile, error: pErr } = await sb()
      .from('companies').select('*').eq('id', data.user.id).single();
    if (pErr) return fail(fmtError(pErr));

    return ok({ ...profile, _authId: data.user.id });
  } catch (e) { return fail(fmtError(e)); }
}

/**
 * Logout (ambos os tipos)
 */
async function authLogout() {
  try {
    await sb().auth.signOut();
    return ok(true);
  } catch (e) { return fail(fmtError(e)); }
}

/**
 * Obter sessão atual do Supabase Auth
 */
async function authGetSession() {
  try {
    const { data, error } = await sb().auth.getSession();
    if (error) return fail(fmtError(error));
    return ok(data.session);
  } catch (e) { return fail(fmtError(e)); }
}

/* ══════════════════════════════════════════════════════════
   PERFIL — ATUALIZAR
══════════════════════════════════════════════════════════ */

/**
 * Atualizar perfil do profissional
 */
async function updateUserProfile(uid, fields, newCvFile = null) {
  try {
    let cvUrl = fields.cv_url, cvName = fields.cv_name, cvType = fields.cv_type;

    if (newCvFile) {
      const ext  = newCvFile.name.split('.').pop();
      const path = `users/${uid}/curriculo.${ext}`;
      const { error: storErr } = await sb()
        .storage.from('curriculos')
        .upload(path, newCvFile, { upsert: true, contentType: newCvFile.type });
      if (storErr) return fail('Erro ao salvar currículo: ' + fmtError(storErr));

      const { data: urlData } = sb().storage.from('curriculos').getPublicUrl(path);
      cvUrl  = urlData?.publicUrl || null;
      cvName = newCvFile.name;
      cvType = newCvFile.type;
    }

    const { error } = await sb().from('users').update({
      name:    fields.name,
      phone:   fields.phone   || null,
      city:    fields.city    || null,
      niche:   fields.niche   || null,
      skills:  fields.skills  || [],
      cv_url:  cvUrl,
      cv_name: cvName,
      cv_type: cvType,
    }).eq('id', uid);

    if (error) return fail(fmtError(error));
    return ok({ ...fields, cv_url: cvUrl, cv_name: cvName, cv_type: cvType });
  } catch (e) { return fail(fmtError(e)); }
}

/**
 * Atualizar perfil da empresa
 */
async function updateCompanyProfile(uid, fields) {
  try {
    const { error } = await sb().from('companies').update({
      name:        fields.name,
      phone:       fields.phone || null,
      city:        fields.city  || null,
      niche:       fields.niche || null,
      description: fields.desc  || null,
    }).eq('id', uid);

    if (error) return fail(fmtError(error));
    return ok(fields);
  } catch (e) { return fail(fmtError(e)); }
}

/* ══════════════════════════════════════════════════════════
   NICHOS
══════════════════════════════════════════════════════════ */

/** Listar todos os nichos */
async function getNiches() {
  try {
    const { data, error } = await sb()
      .from('niches').select('id, name, icon, skills')
      .order('name');
    if (error) return fail(fmtError(error));
    return ok(data);
  } catch (e) { return fail(fmtError(e)); }
}

/** Criar nicho personalizado */
async function createNiche(name, createdBy) {
  try {
    const { data, error } = await sb()
      .from('niches').insert({ name, icon: '⚡', skills: [], created_by: createdBy })
      .select().single();
    if (error) return fail(fmtError(error));
    return ok(data);
  } catch (e) { return fail(fmtError(e)); }
}

/* ══════════════════════════════════════════════════════════
   EVENTOS
══════════════════════════════════════════════════════════ */

/**
 * Listar eventos abertos (para profissional)
 * @param {string} nicheFilter - filtrar por nicho (opcional)
 * @param {string} search      - filtro de texto (opcional)
 */
async function getOpenEvents(nicheFilter = null, search = null) {
  try {
    let q = sb()
      .from('events')
      .select(`
        id, title, niche, local, start_date, end_date,
        workers, days, pay_per_worker, fee, total,
        status, description, created_at,
        company:companies(id, name)
      `)
      .eq('status', 'open')
      .order('created_at', { ascending: false });

    if (nicheFilter) q = q.eq('niche', nicheFilter);
    if (search)      q = q.or(`title.ilike.%${search}%,local.ilike.%${search}%`);

    const { data, error } = await q;
    if (error) return fail(fmtError(error));
    return ok(data);
  } catch (e) { return fail(fmtError(e)); }
}

/**
 * Listar eventos de uma empresa
 */
async function getCompanyEvents(companyId) {
  try {
    const { data, error } = await sb()
      .from('events')
      .select(`
        id, title, niche, local, start_date, end_date,
        workers, days, pay_per_worker, fee, total,
        status, description, created_at
      `)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) return fail(fmtError(error));
    return ok(data);
  } catch (e) { return fail(fmtError(e)); }
}

/**
 * Buscar evento por ID com candidatos
 */
async function getEventById(eventId) {
  try {
    const { data, error } = await sb()
      .from('events')
      .select(`
        *,
        company:companies(id, name),
        applications(
          id, status, applied_at,
          cv_url, cv_name, cv_type,
          user:users(id, name, email, phone, niche, skills, cv_url, cv_name, cv_type)
        )
      `)
      .eq('id', eventId)
      .single();

    if (error) return fail(fmtError(error));
    return ok(data);
  } catch (e) { return fail(fmtError(e)); }
}

/**
 * Criar novo evento (empresa)
 */
async function createEvent(companyId, form) {
  try {
    const workers  = parseInt(form.workers);
    const pay      = parseFloat(form.pay);
    const base     = workers * pay;
    const fee      = Math.round(base * 0.10);
    const total    = base + fee;

    const { data, error } = await sb()
      .from('events')
      .insert({
        company_id:       companyId,
        title:            form.title,
        niche:            form.niche   || null,
        local:            form.local   || null,
        start_date:       form.start,
        end_date:         form.end,
        workers,
        days:             parseInt(form.days),
        pay_per_worker:   pay,
        fee,
        total,
        status:           'open',
        description:      form.desc    || null,
      })
      .select().single();

    if (error) return fail(fmtError(error));
    return ok(data);
  } catch (e) { return fail(fmtError(e)); }
}

/**
 * Encerrar evento
 */
async function closeEvent(eventId, companyId) {
  try {
    const { error } = await sb()
      .from('events')
      .update({ status: 'done' })
      .eq('id', eventId)
      .eq('company_id', companyId);   // garante que só o dono encerra

    if (error) return fail(fmtError(error));
    return ok(true);
  } catch (e) { return fail(fmtError(e)); }
}

/* ══════════════════════════════════════════════════════════
   CANDIDATURAS
══════════════════════════════════════════════════════════ */

/**
 * Verificar se profissional já se candidatou a um evento
 */
async function hasApplied(eventId, userId) {
  try {
    const { count, error } = await sb()
      .from('applications')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('user_id', userId);

    if (error) return fail(fmtError(error));
    return ok(count > 0);
  } catch (e) { return fail(fmtError(e)); }
}

/**
 * Candidatar-se a um evento
 * Envia automaticamente os dados de currículo do perfil
 */
async function applyToEvent(eventId, userId, cvData) {
  try {
    const { data, error } = await sb()
      .from('applications')
      .insert({
        event_id:  eventId,
        user_id:   userId,
        status:    'pending',
        cv_url:    cvData?.cv_url   || null,
        cv_name:   cvData?.cv_name  || null,
        cv_type:   cvData?.cv_type  || null,
      })
      .select().single();

    if (error) return fail(fmtError(error));
    return ok(data);
  } catch (e) { return fail(fmtError(e)); }
}

/**
 * Listar candidaturas do profissional (com evento atrelado)
 */
async function getUserApplications(userId) {
  try {
    const { data, error } = await sb()
      .from('applications')
      .select(`
        id, status, applied_at, cv_name, cv_type,
        event:events(
          id, title, niche, local, start_date, end_date,
          pay_per_worker, status,
          company:companies(id, name)
        )
      `)
      .eq('user_id', userId)
      .order('applied_at', { ascending: false });

    if (error) return fail(fmtError(error));
    return ok(data);
  } catch (e) { return fail(fmtError(e)); }
}

/**
 * Atualizar status de candidatura (empresa: hired | rejected)
 */
async function updateApplicationStatus(applicationId, status, companyId) {
  try {
    // Valida que a empresa é dona do evento antes de atualizar
    const { data: app, error: fErr } = await sb()
      .from('applications')
      .select('id, event:events(company_id)')
      .eq('id', applicationId)
      .single();

    if (fErr) return fail(fmtError(fErr));
    if (app.event?.company_id !== companyId) return fail('Acesso negado.');

    const { error } = await sb()
      .from('applications')
      .update({ status })
      .eq('id', applicationId);

    if (error) return fail(fmtError(error));
    return ok(true);
  } catch (e) { return fail(fmtError(e)); }
}

/**
 * Baixar URL pré-assinada do currículo (tempo limitado, seguro)
 */
async function getCvSignedUrl(cvPath, expiresIn = 300) {
  try {
    const { data, error } = await sb()
      .storage.from('curriculos')
      .createSignedUrl(cvPath, expiresIn);

    if (error) return fail(fmtError(error));
    return ok(data.signedUrl);
  } catch (e) { return fail(fmtError(e)); }
}

/* ══════════════════════════════════════════════════════════
   EXPORTAR TUDO
══════════════════════════════════════════════════════════ */
window.API = {
  // auth
  authRegisterUser,
  authLoginUser,
  authRegisterCompany,
  authLoginCompany,
  authLogout,
  authGetSession,
  // perfil
  updateUserProfile,
  updateCompanyProfile,
  // nichos
  getNiches,
  createNiche,
  // eventos
  getOpenEvents,
  getCompanyEvents,
  getEventById,
  createEvent,
  closeEvent,
  // candidaturas
  hasApplied,
  applyToEvent,
  getUserApplications,
  updateApplicationStatus,
  getCvSignedUrl,
  // util
  fileToBase64,
};

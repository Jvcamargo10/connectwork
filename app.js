/**
 * ============================================================
 *  ConnectWork — app.js
 *
 *  Lógica da interface. Toda comunicação com o banco de dados
 *  passa exclusivamente por window.API (definido em js/api.js).
 *  Este arquivo NÃO contém credenciais nem dados de banco.
 * ============================================================
 */
'use strict';

/* ══ STATE ══════════════════════════════════════════════════ */
let APP      = { user: null, type: null };
let urCvData = null;   // File object do currículo no cadastro
let udNewCv  = null;   // File object do novo currículo no perfil
let udCalF   = 'all';
let cdCalF   = 'all';

/* Dados de nicho/habilidades carregados do banco em runtime */
let NICHES      = [];   // [{ id, name, icon, skills[] }]
let NICHE_MAP   = {};   // { name: { icon, skills[] } }

/* ══ FORMATTERS ═════════════════════════════════════════════ */
const uid    = () => 'id' + Math.random().toString(36).slice(2, 9) + Date.now();
const today  = () => new Date().toISOString().split('T')[0];
const fmtBRL = v  => 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate  = s => { if (!s) return '—'; const d = new Date(s + 'T12:00:00'); return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }); };
const fmtDateS = s => { if (!s) return '—'; const d = new Date(s + 'T12:00:00'); return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }); };
const dp     = s  => { const d = new Date(s + 'T12:00:00'); return { day: d.getDate(), mo: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') }; };
const fic    = t  => !t ? '📄' : t.includes('pdf') ? '📕' : (t.includes('word') || t.includes('doc')) ? '📘' : (t.includes('image') || t.includes('png') || t.includes('jpg')) ? '🖼️' : '📄';
const fsz    = b  => b < 1024 ? b + 'B' : b < 1048576 ? (b / 1024).toFixed(1) + 'KB' : (b / 1048576).toFixed(1) + 'MB';
const calcP  = (w, pay) => { const base = w * pay; const fee = Math.round(base * .1); return { base, fee, total: base + fee }; };

/* ══ PARTICLES ══════════════════════════════════════════════ */
function initParticles() {
  const c = document.getElementById('canvas-p'); if (!c) return;
  const ctx = c.getContext('2d'); let W, H, pts = [];
  const resize = () => { W = c.width = c.offsetWidth; H = c.height = c.offsetHeight; };
  resize(); window.addEventListener('resize', resize);
  for (let i = 0; i < 55; i++) pts.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .28, vy: (Math.random() - .5) * .28, r: Math.random() * 1.5 + .5, a: Math.random() * .6 + .2 });
  const draw = () => {
    ctx.clearRect(0, 0, W, H);
    pts.forEach(p => { p.x += p.vx; p.y += p.vy; if (p.x < 0 || p.x > W) p.vx *= -1; if (p.y < 0 || p.y > H) p.vy *= -1; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fillStyle = `rgba(29,184,115,${p.a * .4})`; ctx.fill(); });
    pts.forEach((a, i) => pts.slice(i + 1).forEach(b => { const d = Math.hypot(a.x - b.x, a.y - b.y); if (d < 110) { ctx.strokeStyle = `rgba(29,184,115,${.18 * (1 - d / 110)})`; ctx.lineWidth = .6; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); } }));
    requestAnimationFrame(draw);
  };
  draw();
}

/* ══ SESSION (localStorage via Supabase Auth) ═══════════════ */
function sSave() {
  try { localStorage.setItem('cw_meta', JSON.stringify({ type: APP.type })); } catch (e) {}
}
function sLoad() {
  try {
    const m = localStorage.getItem('cw_meta');
    if (m) { const p = JSON.parse(m); APP.type = p.type; }
  } catch (e) {}
}
function sClear() {
  try { localStorage.removeItem('cw_meta'); } catch (e) {}
}

/* ══ NAVIGATION ═════════════════════════════════════════════ */
function go(id) {
  const pb = document.getElementById('pb');
  pb.style.width = '30%'; setTimeout(() => pb.style.width = '75%', 80);
  setTimeout(() => {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('on'));
    const t = document.getElementById(id); if (t) { t.classList.add('on'); window.scrollTo(0, 0); }
    pb.style.width = '100%'; setTimeout(() => pb.style.width = '0', 300);
  }, 140);
  sbClose();
}

/* ══ SIDEBAR ════════════════════════════════════════════════ */
function sbToggle() { const sb = document.querySelector('.sb'); const bd = document.getElementById('sbd'); if (sb) sb.classList.toggle('open'); if (bd) bd.classList.toggle('open'); }
function sbClose()  { document.querySelectorAll('.sb').forEach(s => s.classList.remove('open')); const bd = document.getElementById('sbd'); if (bd) bd.classList.remove('open'); }

/* ══ TOAST ══════════════════════════════════════════════════ */
function toast(msg, type = 's', dur = 3400) {
  const tc = document.getElementById('tc');
  const icons = { s: '✅', e: '❌', i: 'ℹ️', w: '⚠️' };
  const el = document.createElement('div');
  el.className = `toast t${type}`;
  el.innerHTML = `<span>${icons[type]}</span><span style="flex:1">${msg}</span>`;
  tc.appendChild(el);
  setTimeout(() => { el.classList.add('bye'); setTimeout(() => el.remove(), 280); }, dur);
}

/* ══ MODAL ══════════════════════════════════════════════════ */
function mopen(html, wide = false) { document.getElementById('mc').innerHTML = html; document.getElementById('mbox').className = wide ? 'wide' : ''; document.getElementById('mov').classList.add('on'); }
function mclose() { document.getElementById('mov').classList.remove('on'); }

/* ══ ALERTS ═════════════════════════════════════════════════ */
function setAl(id, msg, type = 'e') { const el = document.getElementById(id); if (el) el.innerHTML = msg ? `<div class="al al-${type}">${msg}</div>` : ''; }
const clearAl = id => setAl(id, '');

/* ══ LOADING STATE ══════════════════════════════════════════ */
function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.dataset.origText = btn.dataset.origText || btn.innerHTML;
  btn.innerHTML = loading ? '<span class="spin" style="width:16px;height:16px;margin:0 auto"></span>' : btn.dataset.origText;
}

/* ══ MASKS ══════════════════════════════════════════════════ */
function maskCPF(el)   { let v = el.value.replace(/\D/g, '').slice(0, 11); v = v.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2'); el.value = v; }
function maskCNPJ(el)  { let v = el.value.replace(/\D/g, '').slice(0, 14); v = v.replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2'); el.value = v; }
function maskPhone(el) { let v = el.value.replace(/\D/g, '').slice(0, 11); v = v.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{4})$/, '$1-$2').replace(/(\d{4})(\d{4})$/, '$1-$2'); el.value = v; }

/* ══ NICHES (carregados do banco) ════════════════════════════ */
async function loadNiches() {
  const { data, error } = await API.getNiches();
  if (error || !data) {
    // fallback estático se o banco ainda não foi configurado
    NICHES = [
      { name: 'Eventos & Hospitalidade', icon: '🎉', skills: ['Atendimento ao cliente', 'Organização de eventos', 'Garçom/Garçonete', 'Barman/Bartender', 'Recepcionista', 'Mestre de cerimônias', 'Segurança', 'Buffet'] },
      { name: 'Construção Civil',        icon: '🏗️', skills: ['Pedreiro', 'Eletricista', 'Encanador', 'Carpinteiro', 'Pintor', 'Azulejista', 'Operador de máquinas'] },
      { name: 'Tecnologia',             icon: '💻', skills: ['Desenvolvimento web', 'Suporte técnico', 'Redes', 'UX/UI Design', 'Data Science', 'DevOps', 'QA/Testes'] },
      { name: 'Logística & Transporte', icon: '🚛', skills: ['Motorista', 'Auxiliar de carga', 'Operador de empilhadeira', 'Conferente'] },
      { name: 'Saúde & Bem-estar',      icon: '💊', skills: ['Enfermagem', 'Fisioterapia', 'Nutrição', 'Personal trainer', 'Cuidador'] },
      { name: 'Gastronomia',            icon: '🍳', skills: ['Cozinheiro', 'Confeiteiro', 'Barista', 'Sommelier', 'Auxiliar de cozinha'] },
      { name: 'Educação',               icon: '📚', skills: ['Professor', 'Monitor', 'Tutor', 'Educador infantil', 'Instrutor'] },
      { name: 'Marketing & Comunicação',icon: '📣', skills: ['Designer gráfico', 'Social media', 'Redator/Copywriter', 'Fotógrafo', 'Videomaker'] },
      { name: 'Administrativo',         icon: '📊', skills: ['Assistente administrativo', 'Recepcionista', 'Secretária', 'Aux. financeiro'] },
      { name: 'Segurança',              icon: '🔒', skills: ['Vigilante', 'Porteiro', 'Monitoramento', 'Escolta', 'Brigadista'] },
    ];
  } else {
    NICHES = data;
  }
  NICHE_MAP = Object.fromEntries(NICHES.map(n => [n.name, n]));
}

function initNichesScroll() {
  const el = document.getElementById('niches-scroll'); if (!el) return;
  el.innerHTML = NICHES.map(n => `<div class="np"><span>${n.icon || '⚡'}</span><span>${n.name}</span></div>`).join('');
}

function buildNicheSelect(sid, selected = '') {
  const s = document.getElementById(sid); if (!s) return;
  s.innerHTML = '<option value="">Selecione...</option>';
  [...NICHES.map(n => n.name), 'Outro'].forEach(name => {
    const o = document.createElement('option');
    o.value = name; o.textContent = name;
    if (name === selected) o.selected = true;
    s.appendChild(o);
  });
}

function buildSkillCards(cid, niche, selected = []) {
  const c = document.getElementById(cid); if (!c) return;
  const entry = NICHE_MAP[niche];
  const list  = entry?.skills || [];
  c.innerHTML = list.length
    ? list.map(s => `<div class="sk${selected.includes(s) ? ' sel' : ''}" data-sk="${s}" onclick="this.classList.toggle('sel')">${s}</div>`).join('')
    : '<p style="font-size:.78rem;color:var(--tx3)">Sem sugestões. Adicione abaixo.</p>';
}

function getSel(cid)         { return [...document.querySelectorAll(`#${cid} .sk.sel`)].map(e => e.dataset.sk); }
function addSkCard(cid, val) { if (!val.trim()) return; const c = document.getElementById(cid); const d = document.createElement('div'); d.className = 'sk sel'; d.dataset.sk = val.trim(); d.textContent = val.trim(); d.onclick = () => d.classList.toggle('sel'); c.appendChild(d); }

/* ══ CV HANDLER ═════════════════════════════════════════════ */
function handleCV(inpId, prevId, stVar) {
  const inp = document.getElementById(inpId);
  const prev = document.getElementById(prevId);
  const f = inp?.files?.[0]; if (!f) return;
  if (f.size > 5 * 1024 * 1024)  { toast('Arquivo muito grande. Máximo 5MB.', 'e'); return; }
  const ok = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg'];
  if (!ok.includes(f.type))       { toast('Formato não permitido. Use PDF, Word ou imagem.', 'e'); return; }
  // guarda o File object (não base64) — api.js faz o upload direto
  window[stVar] = f;
  if (prev) prev.innerHTML = `<div class="fp"><span class="fic">${fic(f.type)}</span><div class="fi"><div class="fn">${f.name}</div><div class="fs">${fsz(f.size)}</div></div><button class="rm" onclick="removeCV('${inpId}','${prevId}','${stVar}')">✕</button></div>`;
  toast('Currículo carregado! ✅');
}
function removeCV(inpId, prevId, stVar) {
  const i = document.getElementById(inpId); const p = document.getElementById(prevId);
  if (i) i.value = ''; if (p) p.innerHTML = ''; window[stVar] = null;
}

/* ══ NEWS (estáticas — podem vir do banco futuramente) ═══════ */
const NEWSDB = {
  'Eventos & Hospitalidade': [
    { tag: 'Mercado',    color: '#1db873', title: 'Demanda por profissionais de eventos cresce 34% em 2026',       body: 'Com a retomada do turismo e eventos presenciais, empresas do setor buscam profissionais qualificados.',                      date: '01/05/2026', time: '5 min' },
    { tag: 'Tendência',  color: '#e84393', title: 'Personalização é a palavra de ordem nos eventos corporativos',  body: 'Experiências únicas e imersivas são o foco para 2026. Soft skills diferenciadas ganham destaque.',                         date: '28/04/2026', time: '3 min' },
    { tag: 'Legislação', color: '#58a6ff', title: 'Novas regras para contratação temporária em eventos',           body: 'O Ministério do Trabalho publicou normativas que facilitam contratos temporários.',                                        date: '25/04/2026', time: '4 min' },
  ],
  'Tecnologia': [
    { tag: 'Mercado', color: '#58a6ff', title: 'Desenvolvedores freelancers batem recorde de contratações', body: 'Plataformas reportam crescimento de 48% na contratação de tech freelancers no 1º trimestre de 2026.', date: '30/04/2026', time: '4 min' },
    { tag: 'IA',      color: '#bc8cff', title: 'IA cria novas oportunidades para profissionais de tech',    body: 'A adoção de IA nas empresas brasileiras criou 2x mais postos do que eliminou no setor.',              date: '27/04/2026', time: '6 min' },
  ],
  'Gastronomia': [
    { tag: 'Tendência', color: '#f0a500', title: 'Festivais gastronômicos movimentam R$ 2 bilhões em 2026', body: 'O setor de food & beverage vive um dos melhores momentos da última década.', date: '30/04/2026', time: '4 min' },
  ],
  _default: [
    { tag: 'Mercado', color: '#1db873', title: 'Mercado de trabalho temporário cresce 22% no Brasil', body: 'Contratações temporárias atingem novo recorde impulsionadas por eventos, turismo e comércio.', date: '01/05/2026', time: '3 min' },
    { tag: 'Dicas',   color: '#f0a500', title: 'Como se destacar em processos seletivos rápidos',     body: 'Especialistas dão dicas para profissionais que buscam serviços de curta duração.',               date: '29/04/2026', time: '5 min' },
  ],
};
function renderNews(listId, niche) {
  const list = NEWSDB[niche] || NEWSDB._default;
  const el   = document.getElementById(listId); if (!el) return;
  el.innerHTML = list.map(n => `<div class="news-c"><span class="news-tag" style="background:${n.color}20;color:${n.color};border:1px solid ${n.color}30">${n.tag}</span><div class="news-title">${n.title}</div><div class="news-body">${n.body}</div><div class="news-meta"><span>📅 ${n.date}</span><span>🕐 ${n.time} de leitura</span></div></div>`).join('');
}

/* ══════════════════════════════════════════════════════════
   AUTH — USUÁRIO
══════════════════════════════════════════════════════════ */
async function ulLogin() {
  clearAl('ul-al');
  const email = document.getElementById('ul-email').value.trim();
  const pass  = document.getElementById('ul-pass').value;
  if (!email || !pass) { setAl('ul-al', '⚠️ Preencha todos os campos.'); return; }

  setLoading('ul-btn', true);
  const { data, error } = await API.authLoginUser(email, pass);
  setLoading('ul-btn', false);

  if (error) { setAl('ul-al', '❌ ' + error); return; }
  APP.user = data; APP.type = 'user'; sSave();
  toast(`Bem-vindo(a), ${data.name}! 👋`);
  await udInit(); go('S-user-dash');
}

function urNicheChange() {
  const v  = document.getElementById('ur-niche').value;
  const cw = document.getElementById('ur-niche-cw');
  const ss = document.getElementById('ur-skills-sec');
  if (v === 'Outro') { cw.style.display = 'block'; ss.style.display = 'none'; }
  else if (v)        { cw.style.display = 'none';  ss.style.display = 'block'; buildSkillCards('ur-sk', v, []); }
  else               { cw.style.display = 'none';  ss.style.display = 'none'; }
}
function urAddSkill() { const i = document.getElementById('ur-sk-x'); addSkCard('ur-sk', i.value); i.value = ''; }

async function urRegister() {
  clearAl('ur-al');
  const name  = document.getElementById('ur-name').value.trim();
  const cpf   = document.getElementById('ur-cpf').value.trim();
  const email = document.getElementById('ur-email').value.trim();
  const phone = document.getElementById('ur-phone').value;
  const city  = document.getElementById('ur-city').value.trim();
  const birth = document.getElementById('ur-birth').value;
  const pass  = document.getElementById('ur-pass').value;
  const pass2 = document.getElementById('ur-pass2').value;
  let   niche = document.getElementById('ur-niche').value;

  if (niche === 'Outro') {
    niche = document.getElementById('ur-niche-c').value.trim();
    if (!niche) { setAl('ur-al', '⚠️ Descreva seu nicho.'); return; }
    await API.createNiche(niche, null);
    await loadNiches();
  }
  if (!name || !cpf || !email || !city || !niche || !pass) { setAl('ur-al', '⚠️ Preencha todos os campos obrigatórios (*).'); return; }
  if (pass !== pass2)   { setAl('ur-al', '❌ As senhas não coincidem.'); return; }
  if (pass.length < 6)  { setAl('ur-al', '❌ Senha deve ter no mínimo 6 caracteres.'); return; }
  const skills = getSel('ur-sk');
  if (!skills.length)   { setAl('ur-al', '⚠️ Selecione pelo menos uma habilidade.'); return; }
  if (!urCvData)        { setAl('ur-al', '⚠️ Envie seu currículo para continuar.'); return; }

  setLoading('ur-btn', true);
  const { data, error } = await API.authRegisterUser(
    { name, cpf, email, phone, city, birth, niche, skills, password: pass },
    urCvData   // File object — api.js faz o upload
  );
  setLoading('ur-btn', false);

  if (error) { setAl('ur-al', '❌ ' + error); return; }
  APP.user = data; APP.type = 'user'; sSave();
  toast('Conta criada com sucesso! Bem-vindo(a) à ConnectWork! 🎉');
  await udInit(); go('S-user-dash');
}

/* ══ AUTH — EMPRESA ═════════════════════════════════════════ */
async function clLogin() {
  clearAl('cl-al');
  const email = document.getElementById('cl-email').value.trim();
  const pass  = document.getElementById('cl-pass').value;
  if (!email || !pass) { setAl('cl-al', '⚠️ Preencha todos os campos.'); return; }

  setLoading('cl-btn', true);
  const { data, error } = await API.authLoginCompany(email, pass);
  setLoading('cl-btn', false);

  if (error) { setAl('cl-al', '❌ ' + error); return; }
  APP.user = data; APP.type = 'company'; sSave();
  toast(`Bem-vinda, ${data.name}! 🏢`);
  await cdInit(); go('S-company-dash');
}

function crNicheChange() { document.getElementById('cr-niche-cw').style.display = document.getElementById('cr-niche').value === 'Outro' ? 'block' : 'none'; }

async function crRegister() {
  clearAl('cr-al');
  const name  = document.getElementById('cr-name').value.trim();
  const cnpj  = document.getElementById('cr-cnpj').value.trim();
  const email = document.getElementById('cr-email').value.trim();
  const phone = document.getElementById('cr-phone').value;
  const city  = document.getElementById('cr-city').value.trim();
  const desc  = document.getElementById('cr-desc').value;
  const pass  = document.getElementById('cr-pass').value;
  const pass2 = document.getElementById('cr-pass2').value;
  const terms = document.getElementById('cr-terms').checked;
  let   niche = document.getElementById('cr-niche').value;

  if (niche === 'Outro') {
    niche = document.getElementById('cr-niche-c').value.trim();
    if (!niche) { setAl('cr-al', '⚠️ Descreva o setor.'); return; }
    await API.createNiche(niche, null);
    await loadNiches();
  }
  if (!name || !cnpj || !email || !city || !niche || !pass) { setAl('cr-al', '⚠️ Preencha todos os campos obrigatórios (*).'); return; }
  if (!terms)          { setAl('cr-al', '⚠️ Aceite os termos e a taxa da plataforma para continuar.', 'w'); return; }
  if (pass !== pass2)  { setAl('cr-al', '❌ As senhas não coincidem.'); return; }
  if (pass.length < 6) { setAl('cr-al', '❌ Senha mínimo 6 caracteres.'); return; }

  setLoading('cr-btn', true);
  const { data, error } = await API.authRegisterCompany({ name, cnpj, email, phone, city, niche, desc, password: pass });
  setLoading('cr-btn', false);

  if (error) { setAl('cr-al', '❌ ' + error); return; }
  APP.user = data; APP.type = 'company'; sSave();
  toast('Empresa cadastrada! 🎉');
  await cdInit(); go('S-company-dash');
}

async function doLogout() {
  await API.authLogout();
  sClear(); APP.user = null; APP.type = null;
  toast('Até logo! 👋', 'i'); go('S-home');
}

/* ══════════════════════════════════════════════════════════
   USER DASHBOARD
══════════════════════════════════════════════════════════ */
async function udInit() {
  const u = APP.user;
  document.getElementById('ud-navname').textContent  = u.name;
  document.getElementById('ud-sb-av').textContent    = u.name[0];
  document.getElementById('ud-sb-name').textContent  = u.name;
  document.getElementById('ud-sb-email').textContent = u.email;
  document.getElementById('ud-sb-niche').textContent = u.niche || '—';
  // popula filtro de nicho com dados do banco
  const nf = document.getElementById('ud-nf');
  nf.innerHTML = '<option value="">Todos os nichos</option>';
  NICHES.forEach(n => { const o = document.createElement('option'); o.value = n.name; o.textContent = n.name; nf.appendChild(o); });
  await udRenderMetrics();
  await udRenderEvents();
}

function udNav(pg, el) {
  document.querySelectorAll('#ud-sb .ni').forEach(n => n.classList.remove('on')); el.classList.add('on');
  document.querySelectorAll('#S-user-dash .pg').forEach(p => p.classList.remove('on'));
  document.getElementById('ud-pg-' + pg).classList.add('on'); sbClose();
  if (pg === 'news')     udRenderNews();
  if (pg === 'calendar') udRenderCalendar();
  if (pg === 'profile')  udLoadProfile();
}

async function udRenderMetrics() {
  const { data: apps } = await API.getUserApplications(APP.user.id);
  const open = (await API.getOpenEvents()).data?.length || 0;
  const earn = (apps || []).filter(a => a.status === 'hired' && a.event?.status === 'done')
                           .reduce((s, a) => s + (a.event?.pay_per_worker || 0), 0);
  document.getElementById('ud-metrics').innerHTML = `
    <div class="mc">
      <div class="ml">🎯 Eventos abertos</div>
      <div class="mv" style="color:var(--g)">${open}</div>
      <div class="ms">disponíveis agora</div>
    </div>
    <div class="mc">
      <div class="ml">📨 Minhas candidaturas</div>
      <div class="mv">${(apps || []).length}</div>
      <div class="ms">enviadas</div>
    </div>
    <div class="mc">
      <div class="ml">💰 Ganhos confirmados</div>
      <div class="mv money" style="color:var(--g)">${fmtBRL(earn)}</div>
      <div class="ms">total recebido</div>
    </div>`;
}

async function udRenderEvents() {
  const q  = (document.getElementById('ud-search')?.value || '').toLowerCase();
  const nf = document.getElementById('ud-nf')?.value || null;
  const el = document.getElementById('ud-ev-list');
  el.innerHTML = '<div class="spin"></div>';
  const { data: evs, error } = await API.getOpenEvents(nf || null, q || null);
  if (error) { el.innerHTML = `<div class="empty"><div class="ei">⚠️</div><p>Erro ao carregar eventos: ${error}</p></div>`; return; }
  if (!evs?.length) { el.innerHTML = '<div class="empty"><div class="ei">📭</div><p>Nenhum evento disponível no momento.</p></div>'; return; }

  // hasApplied em batch para cada evento
  const applyChecks = await Promise.all(evs.map(ev => API.hasApplied(ev.id, APP.user.id)));

  el.innerHTML = evs.map((ev, i) => {
    const applied = applyChecks[i]?.data === true;
    const dL = Math.ceil((new Date(ev.start_date + 'T12:00:00') - new Date()) / 86400000);
    const urg = dL > 0 && dL <= 7 ? `<span class="pill pp" style="font-size:.68rem">⏰ ${dL} dias</span>` : '';
    const cname = ev.company?.name || '—';
    return `<div class="ev-card click" onclick="udOpenEv('${ev.id}')">
      <div class="ev-head"><div><div class="ev-title">${ev.title}</div><div class="ev-co">🏢 ${cname}</div></div>
      <div style="display:flex;flex-direction:column;gap:.3rem;align-items:flex-end"><span class="pill po"><span class="dot dg"></span>Aberto</span>${urg}</div></div>
      <div class="ev-chips"><span class="chip">📍 ${ev.local || '—'}</span><span class="chip">👥 ${ev.workers} vagas</span><span class="chip">📅 ${fmtDateS(ev.start_date)} → ${fmtDateS(ev.end_date)}</span><span class="chip">⚡ ${ev.niche}</span></div>
      <div class="ev-pay">${fmtBRL(ev.pay_per_worker)} <span>por profissional · ${ev.days} dias</span></div>
      <div class="ev-foot"><span style="font-size:.72rem;color:var(--tx3)">Publicado ${fmtDateS(ev.created_at)}</span>
      ${applied ? '<span class="pill pp">✓ Candidatura enviada</span>' : `<button class="btn btn-p btn-sm" onclick="event.stopPropagation();udApply('${ev.id}')">Candidatar-se →</button>`}</div>
    </div>`;
  }).join('');
}

async function udOpenEv(eid) {
  mopen('<div class="spin" style="margin:2rem auto"></div>');
  const { data: ev, error } = await API.getEventById(eid);
  if (error || !ev) { mclose(); toast('Erro ao carregar evento.', 'e'); return; }
  const { data: applied } = await API.hasApplied(eid, APP.user.id);
  const cname = ev.company?.name || '—';
  const action = ev.status === 'open'
    ? applied
      ? '<div class="al al-s" style="margin-top:.9rem">✅ Candidatura enviada. Aguarde o retorno da empresa.</div>'
      : `<button class="btn btn-p btn-fw btn-lg" style="margin-top:.9rem" onclick="mclose();udApply('${ev.id}')">Candidatar-se a este serviço →</button>`
    : '';
  mopen(`<div class="mh"><div><div style="margin-bottom:.45rem"><span class="pill po"><span class="dot dg"></span>Aberto</span></div><h3>${ev.title}</h3></div><button class="mclose" onclick="mclose()">✕</button></div>
    <div style="font-size:.83rem;color:var(--tx2);margin-bottom:1rem">🏢 ${cname} · 📍 ${ev.local || '—'} · ⚡ ${ev.niche}</div>
    <div class="det-sec" style="margin-top:0">Detalhes do serviço</div>
    <div class="det-grid" style="margin-bottom:1rem">
      <div class="det-stat"><div class="dl">Data início</div><div class="dv">${fmtDate(ev.start_date)}</div></div>
      <div class="det-stat"><div class="dl">Data término</div><div class="dv">${fmtDate(ev.end_date)}</div></div>
      <div class="det-stat"><div class="dl">Vagas</div><div class="dv">${ev.workers}</div></div>
      <div class="det-stat"><div class="dl">Duração</div><div class="dv">${ev.days} dias</div></div>
      <div class="det-stat"><div class="dl">Pagamento</div><div class="dv" style="color:var(--g)">${fmtBRL(ev.pay_per_worker)}</div></div>
      <div class="det-stat"><div class="dl">Valor/dia aprox.</div><div class="dv">${fmtBRL(ev.pay_per_worker / ev.days)}</div></div>
    </div>
    <div class="det-sec">Descrição e requisitos</div>
    <div style="font-size:.85rem;color:var(--tx2);line-height:1.75;background:var(--bg4);border-radius:var(--rs);padding:.85rem;margin-bottom:.5rem">${ev.description || '—'}</div>
    ${action}`);
}

async function udApply(eid) {
  const u = APP.user;
  if (!u.cv_url && !u.cv_name) {
    mopen(`<div class="mh"><h3>⚠️ Currículo necessário</h3><button class="mclose" onclick="mclose()">✕</button></div>
      <div class="al al-w">Para se candidatar você precisa ter um currículo cadastrado no seu perfil.</div>
      <p style="color:var(--tx2);font-size:.85rem;margin-bottom:1rem">Vá em <strong style="color:var(--tx)">Meu Perfil</strong> e faça o upload.</p>
      <button class="btn btn-p btn-fw" onclick="mclose();udNav('profile',document.getElementById('ni-pf'))">Ir para Meu Perfil →</button>`);
    return;
  }
  const { data: ev } = await API.getEventById(eid);
  mopen(`<div class="mh"><h3>Confirmar candidatura</h3><button class="mclose" onclick="mclose()">✕</button></div>
    <div class="al al-i">ℹ️ Seu currículo <strong>${u.cv_name || 'cadastrado'}</strong> será enviado à empresa para análise.</div>
    <div style="background:var(--bg4);border:1px solid var(--bd);border-radius:var(--rs);padding:.85rem;margin-bottom:1rem;font-size:.84rem">
      <div style="font-weight:700;margin-bottom:.45rem">📋 ${ev?.title || '—'}</div>
      <div style="color:var(--tx2)">🏢 ${ev?.company?.name || '—'} · 💰 ${fmtBRL(ev?.pay_per_worker || 0)} · 📅 ${fmtDateS(ev?.start_date)} → ${fmtDateS(ev?.end_date)}</div>
    </div>
    <p style="font-size:.83rem;color:var(--tx2);margin-bottom:1rem;line-height:1.65">A empresa avaliará seu currículo. Boa sorte! 🍀</p>
    <button class="btn btn-grad btn-fw btn-lg" id="apply-confirm-btn" onclick="udConfirmApply('${eid}')">✅ Confirmar e enviar currículo</button>`);
}

async function udConfirmApply(eid) {
  setLoading('apply-confirm-btn', true);
  const { data: alreadyApplied } = await API.hasApplied(eid, APP.user.id);
  if (alreadyApplied) { toast('Você já se candidatou a este serviço.', 'w'); mclose(); return; }
  const cvData = { cv_url: APP.user.cv_url, cv_name: APP.user.cv_name, cv_type: APP.user.cv_type };
  const { error } = await API.applyToEvent(eid, APP.user.id, cvData);
  if (error) { toast('Erro ao enviar candidatura: ' + error, 'e'); mclose(); return; }
  mclose();
  const { data: ev } = await API.getEventById(eid);
  toast(`Candidatura enviada para "${ev?.title}"! 🎉`);
  await udRenderEvents(); await udRenderMetrics();
}

function udLoadProfile() {
  const u = APP.user;
  document.getElementById('ud-pf-av').textContent    = u.name[0];
  document.getElementById('ud-pf-name').textContent  = u.name;
  document.getElementById('ud-pf-email').textContent = u.email;
  document.getElementById('ud-pf-tags').innerHTML    = (u.skills || []).map(s => `<span class="sk-tag">${s}</span>`).join('');
  document.getElementById('ud-pf-ni').value          = u.name;
  document.getElementById('ud-pf-ph').value          = u.phone || '';
  document.getElementById('ud-pf-city').value        = u.city  || '';
  buildNicheSelect('ud-pf-niche', u.niche);
  buildSkillCards('ud-pf-sk', u.niche || '', u.skills || []);
  const cv = document.getElementById('ud-pf-cv-cur');
  cv.innerHTML = u.cv_name
    ? `<div class="fp" style="margin-top:0"><span class="fic">${fic(u.cv_type)}</span><div class="fi"><div class="fn">${u.cv_name}</div><div class="fs">Currículo atual</div></div>${u.cv_url ? `<a href="${u.cv_url}" target="_blank" class="btn btn-o btn-sm">⬇ Baixar</a>` : ''}</div>`
    : '<span style="font-size:.8rem;color:var(--tx3)">Nenhum currículo cadastrado ainda</span>';
  udNewCv = null;
  const fi = document.getElementById('ud-pf-cvf'); if (fi) fi.value = '';
  const fp = document.getElementById('ud-pf-cvp'); if (fp) fp.innerHTML = '';
}

function udPfNicheChange() {
  const v = document.getElementById('ud-pf-niche').value;
  document.getElementById('ud-pf-ncw').style.display = v === 'Outro' ? 'block' : 'none';
  if (v && v !== 'Outro') buildSkillCards('ud-pf-sk', v, APP.user.skills || []);
}
function udPfAddSkill() { const i = document.getElementById('ud-pf-skx'); addSkCard('ud-pf-sk', i.value); i.value = ''; }

async function udSaveProfile() {
  let niche = document.getElementById('ud-pf-niche').value;
  if (niche === 'Outro') {
    niche = document.getElementById('ud-pf-nc').value.trim();
    if (!niche) { setAl('ud-pf-al', '⚠️ Descreva seu nicho.'); return; }
    await API.createNiche(niche, APP.user.id);
    await loadNiches();
  }
  const skills = getSel('ud-pf-sk');
  const fields = {
    name:    document.getElementById('ud-pf-ni').value.trim() || APP.user.name,
    phone:   document.getElementById('ud-pf-ph').value,
    niche:   niche || APP.user.niche,
    city:    document.getElementById('ud-pf-city').value,
    skills:  skills.length ? skills : APP.user.skills,
    cv_url:  APP.user.cv_url, cv_name: APP.user.cv_name, cv_type: APP.user.cv_type,
  };
  setLoading('ud-save-btn', true);
  const { data, error } = await API.updateUserProfile(APP.user.id, fields, udNewCv || null);
  setLoading('ud-save-btn', false);
  if (error) { setAl('ud-pf-al', '❌ ' + error); return; }
  Object.assign(APP.user, data); sSave();
  clearAl('ud-pf-al'); toast('Perfil atualizado! ✅');
  document.getElementById('ud-sb-name').textContent  = APP.user.name;
  document.getElementById('ud-sb-niche').textContent = APP.user.niche;
  document.getElementById('ud-sb-av').textContent    = APP.user.name[0];
  document.getElementById('ud-navname').textContent  = APP.user.name;
  document.getElementById('ud-pf-av').textContent    = APP.user.name[0];
  document.getElementById('ud-pf-name').textContent  = APP.user.name;
  document.getElementById('ud-pf-tags').innerHTML    = (APP.user.skills || []).map(s => `<span class="sk-tag">${s}</span>`).join('');
}

function udRenderNews() {
  document.getElementById('ud-news-sub').textContent = 'Novidades em: ' + (APP.user.niche || '—');
  renderNews('ud-news-list', APP.user.niche || '_default');
}

function udCalTab(f, btn) { udCalF = f; document.querySelectorAll('#ud-pg-calendar .stab').forEach(b => b.classList.remove('on')); btn.classList.add('on'); udRenderCalendar(); }

async function udRenderCalendar() {
  const el = document.getElementById('ud-cal');
  el.innerHTML = '<div class="spin"></div>';
  const { data: apps, error } = await API.getUserApplications(APP.user.id);
  if (error) { el.innerHTML = `<div class="empty"><div class="ei">⚠️</div><p>${error}</p></div>`; return; }
  const now  = today();
  let list   = (apps || []).filter(a => a.event);
  if (udCalF === 'upcoming') list = list.filter(a => a.event.start_date >= now && a.event.status !== 'done');
  if (udCalF === 'done')     list = list.filter(a => a.event.status === 'done');
  const pm = { hired: 'phi', done: 'pd', pending: 'pp', rejected: 'prd' };
  const lm = { hired: 'Contratado ✅', done: 'Concluído', pending: 'Aguardando', rejected: 'Recusado' };
  if (!list.length) { el.innerHTML = '<div class="empty"><div class="ei">📅</div><p>Nenhum serviço neste filtro.</p></div>'; return; }
  el.innerHTML = list.map(a => {
    const d  = dp(a.event.start_date);
    const st = a.status === 'hired' ? 'hired' : a.event.status === 'done' ? 'done' : 'pending';
    const cn = a.event.company?.name || '—';
    return `<div class="cal-item"><div class="cal-d"><div class="cal-day">${d.day}</div><div class="cal-mo">${d.mo}</div></div><div><div class="cal-title">${a.event.title}</div><div class="cal-sub">🏢 ${cn} · 📍 ${a.event.local || '—'}</div></div><div class="cal-r"><div class="cal-pay">${fmtBRL(a.event.pay_per_worker)}</div><span class="pill ${pm[st] || 'pp'}" style="margin-top:.3rem;display:inline-flex">${lm[st] || st}</span></div></div>`;
  }).join('');
}

/* ══════════════════════════════════════════════════════════
   COMPANY DASHBOARD
══════════════════════════════════════════════════════════ */
async function cdInit() {
  const c = APP.user;
  document.getElementById('cd-navname').textContent  = c.name;
  document.getElementById('cd-sb-av').textContent    = c.name[0];
  document.getElementById('cd-sb-name').textContent  = c.name;
  document.getElementById('cd-sb-email').textContent = c.email;
  document.getElementById('cd-sb-niche').textContent = c.niche || '—';
  buildNicheSelect('ce-niche', c.niche);
  const t = today();
  const cs = document.getElementById('ce-start'); const ce = document.getElementById('ce-end');
  if (cs) cs.value = t; if (ce) ce.value = t;
}

function cdNav(pg, el) {
  document.querySelectorAll('#cd-sb .ni').forEach(n => n.classList.remove('on')); el.classList.add('on');
  document.querySelectorAll('#S-company-dash .pg').forEach(p => p.classList.remove('on'));
  document.getElementById('cd-pg-' + pg).classList.add('on'); sbClose();
  if (pg === 'myevents') cdRenderEvents();
  if (pg === 'news')     cdRenderNews();
  if (pg === 'calendar') cdRenderCalendar();
  if (pg === 'profile')  cdLoadProfile();
}

function ceCalc() {
  const w   = parseInt(document.getElementById('ce-workers')?.value) || 0;
  const pay = parseFloat(document.getElementById('ce-pay')?.value)   || 0;
  const ce  = document.getElementById('ce-calc');
  const tw  = document.getElementById('ce-terms-wrap');
  if (!ce) return;
  if (w > 0 && pay > 0) {
    const { base, fee, total } = calcP(w, pay);
    ce.innerHTML = `<div class="pcalc"><div class="pcalc-t">Resumo financeiro</div>
      <div class="pr"><span>Total aos profissionais (${w} × ${fmtBRL(pay)})</span><span>${fmtBRL(base)}</span></div>
      <div class="pr"><span class="pfee">Taxa ConnectWork (10%)</span><span class="pfee">${fmtBRL(fee)}</span></div>
      <div class="pr tot"><span>Total cobrado da empresa</span><span class="phl">${fmtBRL(total)}</span></div>
      <div class="pcalc-hint">💡 Cada profissional receberá integralmente <strong style="color:var(--g)">${fmtBRL(pay)}</strong>.</div></div>`;
    tw.innerHTML = `<div class="terms-box" style="margin-top:.85rem"><strong>⚠️ Confirmação obrigatória</strong><br>Ao publicar, você confirma o pagamento de <strong>R$ ${fee.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong> de taxa à ConnectWork (10% sobre ${fmtBRL(base)}).</div>
      <label class="terms-ck"><input type="checkbox" id="ce-terms"> Estou ciente da taxa de <strong style="color:var(--acc);margin:0 .22rem">10%</strong> (${fmtBRL(fee)}) e autorizo sua cobrança ao final do serviço realizado.</label>`;
  } else { ce.innerHTML = ''; tw.innerHTML = ''; }
}

async function ceCreate() {
  clearAl('ce-al');
  const title   = document.getElementById('ce-title').value.trim();
  const niche   = document.getElementById('ce-niche').value;
  const local   = document.getElementById('ce-local').value.trim();
  const start   = document.getElementById('ce-start').value;
  const end     = document.getElementById('ce-end').value;
  const workers = parseInt(document.getElementById('ce-workers').value) || 0;
  const days    = parseInt(document.getElementById('ce-days').value)    || 0;
  const pay     = parseFloat(document.getElementById('ce-pay').value)   || 0;
  const desc    = document.getElementById('ce-desc').value.trim();
  const terms   = document.getElementById('ce-terms')?.checked;
  if (!title || !start || !end || !workers || !pay) { setAl('ce-al', '⚠️ Preencha todos os campos obrigatórios (*).', 'w'); return; }
  if (!terms)                                        { setAl('ce-al', '⚠️ Confirme a taxa da plataforma para publicar.', 'w'); return; }

  setLoading('ce-btn', true);
  const { data, error } = await API.createEvent(APP.user.id, { title, niche, local, start, end, workers, days, pay, desc });
  setLoading('ce-btn', false);

  if (error) { setAl('ce-al', '❌ ' + error); return; }
  const { fee } = calcP(workers, pay);
  toast(`Evento "${title}" publicado! Taxa: ${fmtBRL(fee)} 🎉`);
  ['ce-title', 'ce-local', 'ce-desc'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
  document.getElementById('ce-workers').value = 1; document.getElementById('ce-days').value = 1; document.getElementById('ce-pay').value = '';
  const cc = document.getElementById('ce-calc'); if (cc) cc.innerHTML = '';
  const tw = document.getElementById('ce-terms-wrap'); if (tw) tw.innerHTML = '';
  cdNav('myevents', document.getElementById('cni-my'));
}

async function cdRenderEvents() {
  const el = document.getElementById('cd-ev-list');
  el.innerHTML = '<div class="spin"></div>';
  const { data: evs, error } = await API.getCompanyEvents(APP.user.id);
  if (error) { el.innerHTML = `<div class="empty"><div class="ei">⚠️</div><p>${error}</p></div>`; return; }

  const active = (evs || []).filter(e => e.status === 'open').length;
  const invest = (evs || []).reduce((a, e) => a + (e.total || 0), 0);
  const { data: allApps } = await Promise.all((evs || []).map(e => API.getEventById(e.id)))
    .then(res => ({ data: res.reduce((s, r) => s + (r.data?.applications?.length || 0), 0) }));
  const cands = typeof allApps === 'number' ? allApps : 0;

  document.getElementById('cd-metrics').innerHTML = `
    <div class="mc">
      <div class="ml">📋 Eventos ativos</div>
      <div class="mv" style="color:var(--g)">${active}</div>
      <div class="ms">publicados</div>
    </div>
    <div class="mc">
      <div class="ml">💸 Total investido</div>
      <div class="mv money" style="color:var(--acc)">${fmtBRL(invest)}</div>
      <div class="ms">todos os eventos</div>
    </div>
    <div class="mc">
      <div class="ml">👥 Candidatos</div>
      <div class="mv">${cands}</div>
      <div class="ms">currículos recebidos</div>
    </div>`;

  if (!evs?.length) { el.innerHTML = '<div class="empty"><div class="ei">📋</div><p>Nenhum evento publicado ainda.</p><button class="btn btn-a" onclick="cdNav('create',document.getElementById('cni-cr'))">Criar primeiro evento →</button></div>'; return; }
  el.innerHTML = evs.map(ev => {
    const { fee } = calcP(ev.workers, ev.pay_per_worker);
    return `<div class="ev-card click" onclick="cdOpenEv('${ev.id}')">
      <div class="ev-head"><div><div class="ev-title">${ev.title}</div><div class="ev-co">👥 ${ev.workers} prof. · ${ev.days} dias · ${ev.niche}</div></div>
      <span class="pill ${ev.status === 'open' ? 'po' : 'pd'}">${ev.status === 'open' ? '<span class="dot dg"></span>Aberto' : 'Encerrado'}</span></div>
      <div class="ev-chips"><span class="chip">📍 ${ev.local || '—'}</span><span class="chip">📅 ${fmtDateS(ev.start_date)} → ${fmtDateS(ev.end_date)}</span></div>
      <div class="fin-row">
        <div class="fin-box"><div class="fl">Por profissional</div><div class="fv" style="color:var(--g)">${fmtBRL(ev.pay_per_worker)}</div></div>
        <div class="fin-box"><div class="fl">Taxa ConnectWork</div><div class="fv" style="color:var(--acc)">${fmtBRL(fee)}</div></div>
        <div class="fin-box"><div class="fl">Total da empresa</div><div class="fv">${fmtBRL(ev.total)}</div></div>
      </div>
      <div class="ev-foot"><span style="font-size:.72rem;color:var(--tx3)">Publicado ${fmtDate(ev.created_at)}</span>${ev.status === 'open' ? `<button class="btn btn-d btn-sm" onclick="event.stopPropagation();cdCloseModal('${ev.id}')">Encerrar</button>` : ''}</div>
    </div>`;
  }).join('');
}

async function cdOpenEv(eid) {
  mopen('<div class="spin" style="margin:2rem auto"></div>', true);
  const { data: ev, error } = await API.getEventById(eid);
  if (error || !ev) { mclose(); toast('Erro ao carregar evento.', 'e'); return; }
  const apps   = ev.applications || [];
  const { base, fee, total } = calcP(ev.workers, ev.pay_per_worker);
  const cname  = ev.company?.name || '—';
  const candsHtml = apps.length
    ? `<div style="margin-top:1.1rem"><div class="det-sec">Candidatos (${apps.length})</div><div class="cand-list">${apps.map(a => {
        const sp = a.status === 'hired' ? 'phi' : a.status === 'rejected' ? 'prd' : 'pp';
        const sl = a.status === 'hired' ? 'Contratado ✅' : a.status === 'rejected' ? 'Recusado' : 'Pendente';
        const uname = a.user?.name || 'Profissional';
        return `<div class="cand-item"><div class="cand-row"><div class="cav">${uname[0]}</div><div style="flex:1"><div class="cand-name">${uname}</div><div class="cand-meta">${fmtDate(a.applied_at)}${a.cv_name ? ' · 📄 ' + a.cv_name : ''}</div>
          <div class="cand-acts"><span class="pill ${sp}">${sl}</span>${a.cv_url ? `<a href="${a.cv_url}" target="_blank" class="btn btn-i btn-sm">👁 Ver currículo</a>` : ''}
          ${a.status === 'pending' ? `<button class="btn btn-p btn-sm" onclick="cdSetStatus('${a.id}','hired','${eid}')">✅ Contratar</button><button class="btn btn-d btn-sm" onclick="cdSetStatus('${a.id}','rejected','${eid}')">✕ Recusar</button>` : ''}</div></div></div></div>`;
      }).join('')}</div></div>`
    : '<div class="empty" style="padding:1.5rem 0"><div class="ei">📭</div><p>Nenhum candidato ainda.</p></div>';

  mopen(`<div class="mh"><div><span class="pill ${ev.status === 'open' ? 'po' : 'pd'}" style="margin-bottom:.4rem;display:inline-flex">${ev.status === 'open' ? '<span class="dot dg"></span>Aberto' : 'Encerrado'}</span><h3 style="margin-top:.4rem">${ev.title}</h3></div><button class="mclose" onclick="mclose()">✕</button></div>
    <div style="font-size:.83rem;color:var(--tx2);margin-bottom:1rem">📍 ${ev.local || '—'} · ⚡ ${ev.niche}</div>
    <div class="det-sec" style="margin-top:0">Detalhes</div>
    <div class="det-grid" style="margin-bottom:1rem">
      <div class="det-stat"><div class="dl">Início</div><div class="dv">${fmtDate(ev.start_date)}</div></div>
      <div class="det-stat"><div class="dl">Término</div><div class="dv">${fmtDate(ev.end_date)}</div></div>
      <div class="det-stat"><div class="dl">Profissionais</div><div class="dv">${ev.workers} vagas</div></div>
      <div class="det-stat"><div class="dl">Duração</div><div class="dv">${ev.days} dias</div></div>
    </div>
    <div class="det-sec">Financeiro</div>
    <div class="pcalc" style="margin-bottom:1rem">
      <div class="pr"><span>Total aos profissionais</span><span>${fmtBRL(base)}</span></div>
      <div class="pr"><span class="pfee">Taxa ConnectWork (10%)</span><span class="pfee">${fmtBRL(fee)}</span></div>
      <div class="pr tot"><span>Total da empresa</span><span class="phl">${fmtBRL(total)}</span></div>
    </div>
    <div class="det-sec">Descrição</div>
    <div style="font-size:.85rem;color:var(--tx2);line-height:1.75;background:var(--bg4);border-radius:var(--rs);padding:.85rem;margin-bottom:.5rem">${ev.description || '—'}</div>
    ${candsHtml}
    ${ev.status === 'open' ? `<button class="btn btn-d btn-fw" style="margin-top:1rem" onclick="mclose();cdCloseModal('${ev.id}')">Encerrar evento</button>` : ''}`, true);
}

function cdCloseModal(eid) {
  mopen(`<div class="mh"><h3>Encerrar evento</h3><button class="mclose" onclick="mclose()">✕</button></div>
    <div class="al al-w">⚠️ Após encerrado, nenhum candidato poderá se inscrever.</div>
    <p style="color:var(--tx2);font-size:.85rem;margin-bottom:1.1rem;line-height:1.65">Tem certeza? Esta ação não pode ser desfeita.</p>
    <div style="display:flex;gap:.75rem"><button class="btn btn-o" style="flex:1" onclick="mclose()">Cancelar</button><button class="btn btn-d" style="flex:1" onclick="cdConfirmClose('${eid}')">Sim, encerrar</button></div>`);
}
async function cdConfirmClose(eid) {
  const { error } = await API.closeEvent(eid, APP.user.id);
  if (error) { toast('Erro: ' + error, 'e'); return; }
  mclose(); toast('Evento encerrado.');
  await cdRenderEvents(); await cdRenderCalendar();
}
async function cdSetStatus(aid, status, eid) {
  const { error } = await API.updateApplicationStatus(aid, status, APP.user.id);
  if (error) { toast('Erro: ' + error, 'e'); return; }
  toast(status === 'hired' ? 'Profissional contratado! ✅' : 'Candidatura recusada.', 's');
  mclose(); await cdOpenEv(eid); await cdRenderEvents();
}

function cdLoadProfile() {
  const c = APP.user;
  document.getElementById('cd-pf-av').textContent      = c.name[0];
  document.getElementById('cd-pf-name').textContent    = c.name;
  document.getElementById('cd-pf-email').textContent   = c.email;
  document.getElementById('cd-pf-desc').textContent    = c.description || '';
  document.getElementById('cd-pf-ni').value            = c.name;
  document.getElementById('cd-pf-ph').value            = c.phone || '';
  document.getElementById('cd-pf-city').value          = c.city  || '';
  document.getElementById('cd-pf-desc-i').value        = c.description || '';
  buildNicheSelect('cd-pf-niche', c.niche);
}
function cdPfNicheChange() { document.getElementById('cd-pf-ncw').style.display = document.getElementById('cd-pf-niche').value === 'Outro' ? 'block' : 'none'; }

async function cdSaveProfile() {
  let niche = document.getElementById('cd-pf-niche').value;
  if (niche === 'Outro') {
    niche = document.getElementById('cd-pf-nc').value.trim();
    if (!niche) { setAl('cd-pf-al', '⚠️ Descreva o setor.'); return; }
    await API.createNiche(niche, APP.user.id);
    await loadNiches();
  }
  const fields = {
    name:  document.getElementById('cd-pf-ni').value.trim()   || APP.user.name,
    phone: document.getElementById('cd-pf-ph').value,
    niche: niche || APP.user.niche,
    city:  document.getElementById('cd-pf-city').value,
    desc:  document.getElementById('cd-pf-desc-i').value,
  };
  setLoading('cd-save-btn', true);
  const { data, error } = await API.updateCompanyProfile(APP.user.id, fields);
  setLoading('cd-save-btn', false);
  if (error) { setAl('cd-pf-al', '❌ ' + error); return; }
  Object.assign(APP.user, { ...data, description: data.desc }); sSave();
  clearAl('cd-pf-al'); toast('Perfil atualizado! ✅');
  document.getElementById('cd-sb-name').textContent  = APP.user.name;
  document.getElementById('cd-sb-niche').textContent = APP.user.niche;
  document.getElementById('cd-sb-av').textContent    = APP.user.name[0];
  document.getElementById('cd-navname').textContent  = APP.user.name;
  document.getElementById('cd-pf-name').textContent  = APP.user.name;
  document.getElementById('cd-pf-desc').textContent  = APP.user.description || '';
}

function cdRenderNews() {
  document.getElementById('cd-news-sub').textContent = 'Novidades em: ' + (APP.user.niche || '—');
  renderNews('cd-news-list', APP.user.niche || '_default');
}

function cdCalTab(f, btn) { cdCalF = f; document.querySelectorAll('#cd-pg-calendar .stab').forEach(b => b.classList.remove('on')); btn.classList.add('on'); cdRenderCalendar(); }

async function cdRenderCalendar() {
  const el = document.getElementById('cd-cal');
  el.innerHTML = '<div class="spin"></div>';
  const { data: evs, error } = await API.getCompanyEvents(APP.user.id);
  if (error) { el.innerHTML = `<div class="empty"><div class="ei">⚠️</div><p>${error}</p></div>`; return; }
  const now  = today();
  let list   = evs || [];
  if (cdCalF === 'upcoming') list = list.filter(e => e.start_date >= now && e.status !== 'done');
  if (cdCalF === 'done')     list = list.filter(e => e.status === 'done');
  if (!list.length) { el.innerHTML = '<div class="empty"><div class="ei">📅</div><p>Nenhum serviço neste filtro.</p></div>'; return; }
  el.innerHTML = list.map(ev => {
    const d = dp(ev.start_date);
    return `<div class="cal-item"><div class="cal-d"><div class="cal-day">${d.day}</div><div class="cal-mo">${d.mo}</div></div><div><div class="cal-title">${ev.title}</div><div class="cal-sub">👥 ${ev.workers} profissionais · 📍 ${ev.local || '—'}</div></div><div class="cal-r"><div class="cal-pay">${fmtBRL(ev.total)}</div><span class="pill ${ev.status === 'open' ? 'po' : 'pd'}" style="margin-top:.3rem;display:inline-flex">${ev.status === 'open' ? 'Ativo' : 'Encerrado'}</span></div></div>`;
  }).join('');
}

/* ══ INIT ═══════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  sLoad();
  // Carrega nichos do banco (com fallback estático)
  await loadNiches();

  // Popula selects de nicho nos formulários de cadastro
  ['ur-niche', 'cr-niche'].forEach(id => buildNicheSelect(id));

  // Partículas e scroll de nichos na home
  initParticles();
  initNichesScroll();

  // Drag & drop nos inputs de arquivo
  document.querySelectorAll('.fu').forEach(area => {
    area.addEventListener('dragover',  e => { e.preventDefault(); area.classList.add('drag'); });
    area.addEventListener('dragleave', ()  => area.classList.remove('drag'));
    area.addEventListener('drop', e => {
      e.preventDefault(); area.classList.remove('drag');
      const inp = area.querySelector('input[type=file]');
      if (inp && e.dataTransfer.files[0]) {
        try { const dt = new DataTransfer(); dt.items.add(e.dataTransfer.files[0]); inp.files = dt.files; } catch (x) {}
        inp.dispatchEvent(new Event('change'));
      }
    });
  });

  // Animação dos números na hero ao entrar na viewport
  const statsEl = document.querySelector('.stats-row');
  if (statsEl) {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { animateStats(); obs.disconnect(); } });
    }, { threshold: .4 });
    obs.observe(statsEl);
  }

  // Retomar sessão do Supabase Auth
  const { data: session } = await API.authGetSession();
  if (session && APP.type) {
    const role = session.user.user_metadata?.role;
    if (role === 'user') {
      // Recarrega perfil do banco
      const { data: profile } = await window._sb.from('users').select('*').eq('id', session.user.id).single();
      if (profile) { APP.user = profile; await udInit(); go('S-user-dash'); return; }
    }
    if (role === 'company') {
      const { data: profile } = await window._sb.from('companies').select('*').eq('id', session.user.id).single();
      if (profile) { APP.user = profile; await cdInit(); go('S-company-dash'); return; }
    }
  }
  // Nenhuma sessão ativa → home
});

function animateStats() {
  const targets = [
    { el: document.querySelector('.stats-row .stat:nth-child(1) .n'), end: 2000, fmt: v => Math.floor(v / 1000) + 'k+' },
    { el: document.querySelector('.stats-row .stat:nth-child(2) .n'), end: 380,  fmt: v => Math.floor(v)        + '+' },
    { el: document.querySelector('.stats-row .stat:nth-child(3) .n'), end: 8000, fmt: v => Math.floor(v / 1000) + 'k+' },
    { el: document.querySelector('.stats-row .stat:nth-child(4) .n'), end: 97,   fmt: v => Math.floor(v)        + '%' },
  ];
  targets.forEach(t => {
    if (!t.el) return; let cur = 0; const step = t.end / 50;
    const iv = setInterval(() => {
      cur = Math.min(cur + step, t.end);
      t.el.innerHTML = `<span class="suf">${t.fmt(cur)}</span>`;
      if (cur >= t.end) clearInterval(iv);
    }, 28);
  });
}

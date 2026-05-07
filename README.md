# ConnectWork — Plataforma de Serviços Profissionais

> Conecta empresas a profissionais qualificados para eventos e serviços. Totalmente hospedado no **GitHub Pages** com **Supabase** como backend.

---

## 📁 Estrutura do repositório

```
connectwork/
├── index.html              ← SPA principal (HTML + referências externas)
├── css/
│   └── style.css           ← Estilos globais (responsivo web + mobile)
├── js/
│   ├── api.js              ← Camada de API — único ponto de contato com o Supabase
│   ├── app.js              ← Lógica da interface (chama apenas window.API.*)
│   ├── config.example.js   ← Template de configuração (commitar ✅)
│   └── config.js           ← Credenciais reais          (NÃO commitar ❌)
├── docs/
│   └── schema.sql          ← Schema completo do banco Supabase
├── .gitignore              ← Protege config.js e arquivos sensíveis
└── README.md
```

### Responsabilidade de cada arquivo JS

| Arquivo | O que faz | Credenciais? |
|---|---|---|
| `config.js` | Inicializa o client Supabase com URL + chave | ✅ Sim — **nunca commitar** |
| `api.js` | Todas as chamadas ao banco (auth, storage, queries) | ❌ Não |
| `app.js` | Interface, navegação, renders — chama `window.API.*` | ❌ Não |

---

## 🚀 Deploy no GitHub Pages

### 1. Criar repositório

```bash
git init
git remote add origin https://github.com/seu-usuario/connectwork.git
```

### 2. Configurar o Supabase (antes de subir)

```bash
# Copie o template de configuração
cp js/config.example.js js/config.js
```

Edite `js/config.js` e preencha:

```js
const SUPABASE_URL      = 'https://SEU_PROJETO.supabase.co';
const SUPABASE_ANON_KEY = 'SUA_CHAVE_ANONIMA_AQUI';
```

**Onde encontrar:**
- Supabase Dashboard → **Project Settings** → **API**
- URL: campo `Project URL`
- Chave: campo `anon public`

> ⚠️ `js/config.js` está no `.gitignore` e **nunca será enviado ao GitHub**.

### 3. Configurar o banco

Execute o arquivo `docs/schema.sql` no Supabase:
- Dashboard → **SQL Editor** → **New query** → cole o conteúdo → **Run**

### 4. Criar o bucket de currículos

- Dashboard → **Storage** → **New bucket**
- Nome: `curriculos`
- **Public:** ❌ desligado (acesso controlado por políticas)
- Clique em **Create bucket**

As políticas de acesso são criadas automaticamente pelo `schema.sql`.

### 5. Commitar e publicar

```bash
# config.js já está ignorado pelo .gitignore
git add .
git commit -m "feat: initial deploy"
git push -u origin main
```

**Ativar GitHub Pages:**
- Repositório → **Settings** → **Pages**
- Source: `Deploy from a branch` → `main` → `/ (root)`
- Salvar → aguardar ~1 min
- Acessar: `https://seu-usuario.github.io/connectwork/`

---

## 🗄️ Banco de dados — Supabase

### Tabelas

| Tabela | Descrição |
|---|---|
| `niches` | Nichos de atuação (fixos + personalizados pelos usuários) |
| `users` | Perfis dos profissionais (complementa `auth.users`) |
| `companies` | Perfis das empresas (complementa `auth.users`) |
| `events` | Eventos/vagas publicados pelas empresas |
| `applications` | Candidaturas dos profissionais aos eventos |

### Storage

| Bucket | Conteúdo | Acesso |
|---|---|---|
| `curriculos` | Currículos dos profissionais (PDF/Word/imagem) | Autenticado (URL assinada) |

### Segurança

Todas as tabelas usam **Row Level Security (RLS)**:
- Profissional lê/edita apenas o próprio perfil e candidaturas
- Empresa lê/edita apenas seus eventos e vê candidatos dos seus eventos
- Eventos abertos são legíveis por qualquer usuário autenticado
- Credenciais nunca expostas no repositório

---

## 💰 Lógica de taxa da plataforma

A taxa é calculada **no frontend** (`app.js`) e salva no banco via `api.js`:

```
base  = número_de_profissionais × valor_por_profissional
fee   = round(base × 0.10)          ← 10% vai para a plataforma
total = base + fee                   ← cobrado da empresa
```

O profissional **sempre recebe o valor integral** (`pay_per_worker`).
A empresa paga `total`. A diferença (`fee`) fica com a plataforma.

**Exemplo:**
| Campo | Valor |
|---|---|
| Profissionais | 8 |
| Valor por profissional | R$ 1.400,00 |
| Total aos profissionais | R$ 11.200,00 |
| Taxa ConnectWork (10%) | R$ 1.120,00 |
| **Total cobrado da empresa** | **R$ 12.320,00** |

---

## 🔌 API Layer (`js/api.js`)

Todas as operações de banco passam por `window.API`:

```js
// Auth
API.authRegisterUser(form, cvFile)      // cadastro de profissional
API.authLoginUser(email, password)       // login de profissional
API.authRegisterCompany(form)           // cadastro de empresa
API.authLoginCompany(email, password)   // login de empresa
API.authLogout()                        // logout
API.authGetSession()                    // sessão atual

// Perfil
API.updateUserProfile(uid, fields, newCvFile)
API.updateCompanyProfile(uid, fields)

// Nichos
API.getNiches()                         // lista todos os nichos
API.createNiche(name, createdBy)        // cria nicho personalizado

// Eventos
API.getOpenEvents(nicheFilter, search)  // lista eventos abertos
API.getCompanyEvents(companyId)         // eventos de uma empresa
API.getEventById(eventId)              // evento com candidatos
API.createEvent(companyId, form)        // publica evento
API.closeEvent(eventId, companyId)      // encerra evento

// Candidaturas
API.hasApplied(eventId, userId)         // verificação de duplicata
API.applyToEvent(eventId, userId, cv)   // se candidatar
API.getUserApplications(userId)         // candidaturas do profissional
API.updateApplicationStatus(id, status, companyId)  // contratar/recusar
API.getCvSignedUrl(cvPath, expiresIn)   // URL segura para download
```

Todas retornam `{ data, error }` — nunca lançam exceção diretamente.

---

## 🔐 Contas de demonstração

Para testar localmente com dados de demonstração, execute no SQL Editor:

```sql
-- Inserir profissional demo (senha: demo123)
-- Use o Supabase Auth Dashboard → Users → Invite ou API

-- Ou rode o arquivo docs/seed.sql após o schema.sql
```

---

## 🛠️ Tecnologias

| Tech | Uso |
|---|---|
| HTML5 / CSS3 / JS Vanilla | Frontend SPA sem frameworks |
| [Supabase](https://supabase.com) | Auth, banco PostgreSQL, Storage |
| [GitHub Pages](https://pages.github.com) | Hospedagem gratuita |
| Google Fonts | Syne + DM Sans |

---

## 📝 Variáveis de configuração

| Variável | Onde configurar | Exemplo |
|---|---|---|
| `SUPABASE_URL` | `js/config.js` | `https://abc.supabase.co` |
| `SUPABASE_ANON_KEY` | `js/config.js` | `eyJhbGci...` |

> Nunca use a chave `service_role` no frontend.
> A chave `anon` é segura pois o RLS protege os dados.

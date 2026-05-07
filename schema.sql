-- ============================================================
--  ConnectWork — Schema Supabase  (docs/schema.sql)
--  Execute no SQL Editor do Supabase Dashboard
-- ============================================================

-- ── Extensões ───────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ════════════════════════════════════════════════════════════
--  TABELA: niches
--  Nichos cadastrados na plataforma (fixos + personalizados)
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS niches (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT UNIQUE NOT NULL,
  icon        TEXT DEFAULT '⚡',
  skills      TEXT[] DEFAULT '{}',        -- sugestões de habilidades
  created_by  UUID,                       -- NULL = pré-cadastrado
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Dados iniciais
INSERT INTO niches (name, icon, skills) VALUES
  ('Eventos & Hospitalidade', '🎉', ARRAY['Atendimento ao cliente','Organização de eventos','Garçom/Garçonete','Barman/Bartender','Recepcionista','Mestre de cerimônias','Segurança','Buffet','Protocolo e etiqueta','Limpeza']),
  ('Construção Civil',        '🏗️', ARRAY['Pedreiro','Eletricista','Encanador','Carpinteiro','Pintor','Azulejista','Operador de máquinas','Mestre de obras','Armador','Gesseiro']),
  ('Tecnologia',              '💻', ARRAY['Desenvolvimento web','Suporte técnico','Redes','UX/UI Design','Data Science','DevOps','Gestão de projetos','QA/Testes','Cibersegurança','Product Manager']),
  ('Logística & Transporte',  '🚛', ARRAY['Motorista','Auxiliar de carga','Operador de empilhadeira','Conferente','Roteirizador','Coordenador logístico']),
  ('Saúde & Bem-estar',       '💊', ARRAY['Enfermagem','Fisioterapia','Nutrição','Personal trainer','Cuidador','Técnico em saúde','Massagista']),
  ('Gastronomia',             '🍳', ARRAY['Cozinheiro','Confeiteiro','Barista','Sommelier','Auxiliar de cozinha','Pizzaiolo']),
  ('Educação',                '📚', ARRAY['Professor','Monitor','Tutor','Educador infantil','Instrutor','Pedagogo']),
  ('Marketing & Comunicação', '📣', ARRAY['Designer gráfico','Social media','Redator/Copywriter','Fotógrafo','Videomaker','Gestor de tráfego']),
  ('Administrativo',          '📊', ARRAY['Assistente administrativo','Recepcionista','Secretária','Aux. financeiro','Recursos humanos']),
  ('Segurança',               '🔒', ARRAY['Vigilante','Porteiro','Monitoramento','Escolta','Brigadista'])
ON CONFLICT (name) DO NOTHING;

-- ════════════════════════════════════════════════════════════
--  TABELA: users  (profissionais)
--  Complementa auth.users do Supabase Auth
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  cpf         TEXT,
  email       TEXT NOT NULL,
  phone       TEXT,
  city        TEXT,
  birth       DATE,
  niche       TEXT,
  skills      TEXT[] DEFAULT '{}',
  cv_url      TEXT,       -- URL pública ou assinada no Storage
  cv_name     TEXT,       -- nome original do arquivo
  cv_type     TEXT,       -- MIME type
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger: atualiza updated_at automaticamente
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ════════════════════════════════════════════════════════════
--  TABELA: companies  (empresas)
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS companies (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  cnpj        TEXT,
  email       TEXT NOT NULL,
  phone       TEXT,
  city        TEXT,
  niche       TEXT,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ════════════════════════════════════════════════════════════
--  TABELA: events  (serviços/vagas publicados pelas empresas)
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  niche           TEXT,
  local           TEXT,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  workers         INTEGER NOT NULL CHECK (workers > 0),
  days            INTEGER NOT NULL CHECK (days > 0),
  pay_per_worker  NUMERIC(12,2) NOT NULL CHECK (pay_per_worker > 0),
  fee             NUMERIC(12,2) NOT NULL,   -- 10% calculado pelo app
  total           NUMERIC(12,2) NOT NULL,   -- pay * workers + fee
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  description     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_company  ON events(company_id);
CREATE INDEX IF NOT EXISTS idx_events_status   ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_niche    ON events(niche);

-- ════════════════════════════════════════════════════════════
--  TABELA: applications  (candidaturas)
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS applications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id    UUID NOT NULL REFERENCES events(id)  ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','hired','rejected')),
  cv_url      TEXT,       -- snapshot do currículo no momento da candidatura
  cv_name     TEXT,
  cv_type     TEXT,
  applied_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, user_id)  -- um usuário só se candidata uma vez por evento
);

CREATE INDEX IF NOT EXISTS idx_apps_event   ON applications(event_id);
CREATE INDEX IF NOT EXISTS idx_apps_user    ON applications(user_id);
CREATE INDEX IF NOT EXISTS idx_apps_status  ON applications(status);

-- ════════════════════════════════════════════════════════════
--  STORAGE — bucket "curriculos"
--  Execute após criar o bucket no Dashboard:
--  Storage → New bucket → "curriculos" → Public: OFF
-- ════════════════════════════════════════════════════════════

-- Política: profissional faz upload do próprio currículo
CREATE POLICY "users upload own cv"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'curriculos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Política: empresa visualiza currículo via URL assinada (api.getCvSignedUrl)
-- (sem exposição pública; o acesso é controlado pelo backend)
CREATE POLICY "authenticated read cv"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'curriculos'
    AND auth.role() = 'authenticated'
  );

-- ════════════════════════════════════════════════════════════
--  ROW LEVEL SECURITY (RLS)
-- ════════════════════════════════════════════════════════════

-- users
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user reads own profile"    ON users FOR SELECT  USING (auth.uid() = id);
CREATE POLICY "user updates own profile"  ON users FOR UPDATE  USING (auth.uid() = id);
CREATE POLICY "user inserts own profile"  ON users FOR INSERT  WITH CHECK (auth.uid() = id);

-- companies
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company reads own profile"   ON companies FOR SELECT  USING (auth.uid() = id);
CREATE POLICY "company updates own profile" ON companies FOR UPDATE  USING (auth.uid() = id);
CREATE POLICY "company inserts own profile" ON companies FOR INSERT  WITH CHECK (auth.uid() = id);

-- events: empresa gerencia os seus; qualquer usuário autenticado lê os abertos
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read open events"
  ON events FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "company manages own events"
  ON events FOR ALL USING (auth.uid() = company_id);

-- applications: profissional gerencia as suas; empresa lê as do seu evento
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user manages own applications"
  ON applications FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "company reads event applications"
  ON applications FOR SELECT
  USING (
    event_id IN (SELECT id FROM events WHERE company_id = auth.uid())
  );
CREATE POLICY "company updates application status"
  ON applications FOR UPDATE
  USING (
    event_id IN (SELECT id FROM events WHERE company_id = auth.uid())
  );

-- niches: leitura pública; qualquer autenticado pode criar
ALTER TABLE niches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone reads niches"   ON niches FOR SELECT  USING (true);
CREATE POLICY "auth creates niches"   ON niches FOR INSERT  WITH CHECK (auth.role() = 'authenticated');

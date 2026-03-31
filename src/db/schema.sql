-- Danny's account (single user for now)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Clients Danny manages
CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  linkedin_access_token TEXT,          -- AES-256-GCM encrypted
  linkedin_token_expires_at TIMESTAMPTZ,
  linkedin_person_urn TEXT,            -- e.g. "urn:li:person:XXXXX"
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Posts Danny writes for clients
CREATE TABLE IF NOT EXISTS posts (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  status TEXT DEFAULT 'draft',         -- draft | pending | approved | rejected | posted
  linkedin_post_id TEXT,               -- set after posting
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Approval tokens (one per send)
CREATE TABLE IF NOT EXISTS approvals (
  id SERIAL PRIMARY KEY,
  post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,          -- UUID used in email link
  client_comment TEXT,
  response TEXT,                       -- approved | rejected | null
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,     -- 7 days from send
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update updated_at on posts
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS posts_updated_at ON posts;
CREATE TRIGGER posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

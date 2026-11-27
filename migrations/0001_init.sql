-- All money columns are integer VND. Dates are YYYY-MM-DD text chosen on the client.

CREATE TABLE members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  bank_code TEXT,          -- NAPAS BIN used to build the VietQR image URL
  account_no TEXT,
  account_name TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,     -- UUID generated in the Worker so session + attendees fit one batch
  date TEXT NOT NULL,
  payer_id INTEGER NOT NULL REFERENCES members(id),
  court_amount INTEGER NOT NULL CHECK (court_amount >= 0),
  drink_amount INTEGER NOT NULL DEFAULT 0 CHECK (drink_amount >= 0),
  note TEXT
);

CREATE TABLE session_attendees (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id),
  drank INTEGER NOT NULL DEFAULT 0,
  share INTEGER NOT NULL CHECK (share >= 0),  -- computed by the Worker at save time
  PRIMARY KEY (session_id, member_id)
);

CREATE TABLE transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  from_id INTEGER NOT NULL REFERENCES members(id),
  to_id INTEGER NOT NULL REFERENCES members(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  note TEXT,
  CHECK (from_id <> to_id)
);

CREATE INDEX idx_sessions_date ON sessions(date);

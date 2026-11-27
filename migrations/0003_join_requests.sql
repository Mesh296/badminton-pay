-- Someone who signed in with Google and asked to join. An admin approves the
-- request (it becomes a member linked to that email) or rejects it (deleted).
CREATE TABLE join_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,   -- lowercase; one open request per Google account
  name TEXT NOT NULL,
  bank_code TEXT,
  account_no TEXT,
  account_name TEXT
);

-- Google account that signs in as this member: lowercase, at most one member per account.
-- NULL means the member cannot sign in yet (a unique index allows many NULLs).
ALTER TABLE members ADD COLUMN email TEXT;
CREATE UNIQUE INDEX idx_members_email ON members(email);

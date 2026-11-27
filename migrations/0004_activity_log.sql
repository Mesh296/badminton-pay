-- Who changed what, and when: every write to sessions and transfers adds a row
-- here in the same batch as the change, so the two succeed or fail together.
-- The whole group sees it, and the snapshots let a deleted record be put back.
CREATE TABLE activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,          -- ISO 8601 UTC, set by the Worker
  actor_email TEXT NOT NULL, -- the signed-in Google account
  actor_member_id INTEGER,   -- null for an admin who is not a member
  action TEXT NOT NULL,      -- session.create | session.update | session.delete | transfer.create | transfer.delete
  before TEXT,               -- JSON snapshot before the change (update, delete)
  after TEXT                 -- JSON snapshot after the change (create, update)
);

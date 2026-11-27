-- A payer saying they sent money, waiting for the receiver to see it arrive.
-- It counts toward no balance: confirming turns it into a row in transfers,
-- turning it down deletes it.
CREATE TABLE transfer_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  from_id INTEGER NOT NULL REFERENCES members(id),
  to_id INTEGER NOT NULL REFERENCES members(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  note TEXT,
  CHECK (from_id <> to_id)
);

-- A member's profile photo: a small square JPEG (256×256, made on the phone),
-- base64 text so it travels the same way on D1 and on the SQLite server.
-- updated_at (ms) versions its address, so browsers may cache it for good.
CREATE TABLE member_avatars (
  member_id INTEGER PRIMARY KEY REFERENCES members(id),
  image TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Where and when a session was played, for its history. Both optional: sessions
-- entered before this have neither.
CREATE TABLE courts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);
INSERT INTO courts (name) VALUES
  ('Trung Nguyên'), ('Thuần Vân'), ('Thanh Nam'), ('Phong Hưng'),
  ('Minh Anh'), ('Tuấn Tú'), ('Lan Anh'), ('Linh');

ALTER TABLE sessions ADD COLUMN court_id INTEGER REFERENCES courts(id);
-- HH:MM on the half hour; the end is a whole number of hours after the start (validation.ts).
ALTER TABLE sessions ADD COLUMN start_time TEXT;
ALTER TABLE sessions ADD COLUMN end_time TEXT;

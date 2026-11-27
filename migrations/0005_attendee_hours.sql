-- Whole hours each attendee played. The court cost is split in proportion to
-- it; sessions saved before this column existed count everyone as 1 hour,
-- which is the equal split their stored shares already hold.
ALTER TABLE session_attendees ADD COLUMN hours INTEGER NOT NULL DEFAULT 1 CHECK (hours >= 1);

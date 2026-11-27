-- The app address each phone signed up through. The daily reminder runs on a
-- timer with no request to read it from, and push services want the sender's
-- address with every message.
ALTER TABLE push_subscriptions ADD COLUMN origin TEXT;

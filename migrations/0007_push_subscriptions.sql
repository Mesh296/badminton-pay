-- Phones (or browsers) that asked to be told when someone reports paying this
-- member. One row per device; the push service gives each its own endpoint.
CREATE TABLE push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id),
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL
);
CREATE INDEX idx_push_subscriptions_member ON push_subscriptions(member_id);

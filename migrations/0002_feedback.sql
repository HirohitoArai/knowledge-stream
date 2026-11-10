-- Anonymous feedback (SPEC section 5). The client hash is an HMAC of the
-- device-generated anonymous client id; the raw id is never stored.
-- UNIQUE (video_id, client_hash, type) enforces "one feedback of a type
-- per video per device" at the database level.

CREATE TABLE feedback (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL REFERENCES videos (id),
  client_hash TEXT NOT NULL,
  type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (video_id, client_hash, type)
);

CREATE INDEX idx_feedback_video ON feedback (video_id);

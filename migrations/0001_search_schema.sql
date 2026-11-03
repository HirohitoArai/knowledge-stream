-- Knowledge Stream initial schema for the SPEC section 2.4 search feature.
-- Data model follows SPEC section 7. `feedback` is intentionally not created
-- here: anonymous feedback is a separate feature outside the search scope.
-- Applied migrations are never rewritten (SPEC section 7); change the schema
-- only by adding a new migration file.

CREATE TABLE videos (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  external_video_id TEXT NOT NULL,
  label TEXT NOT NULL,
  search_keywords TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  availability_status TEXT NOT NULL DEFAULT 'active',
  last_checked_at TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (platform, external_video_id)
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE video_categories (
  video_id TEXT NOT NULL REFERENCES videos (id),
  category_id TEXT NOT NULL REFERENCES categories (id),
  PRIMARY KEY (video_id, category_id)
);

-- Search filters on enabled videos; keep that lookup cheap as data grows.
CREATE INDEX idx_videos_enabled ON videos (enabled);
CREATE INDEX idx_video_categories_category ON video_categories (category_id);

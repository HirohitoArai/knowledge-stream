-- Local development seed: the same three sample videos as src/videos.ts,
-- registered the way an admin would (SPEC section 4): own label,
-- search_keywords and one genre (category) each. Video ids reuse the UUIDs
-- from src/videos.ts so the feed and the search results refer to the same
-- videos. Labels are our own descriptions, not official YouTube titles.
--
-- Apply to the local D1 database after the migrations:
--   pnpm exec wrangler d1 execute knowledge-stream --local --file=seeds/0001_local_sample_videos.sql
-- This seed is for local development only; do not apply it to staging or
-- production databases.
--
-- The fourth video is a verification fixture with enabled = 0: search must
-- never return it (SPEC sections 2.4 and 9). Its external id is a dummy.

INSERT INTO categories (id, name, enabled, created_at, updated_at) VALUES
  ('a0000000-0000-4000-8000-000000000001', '数学', 1, '2026-10-15T00:00:00.000Z', '2026-10-15T00:00:00.000Z'),
  ('a0000000-0000-4000-8000-000000000002', 'ものづくり', 1, '2026-10-15T00:00:00.000Z', '2026-10-15T00:00:00.000Z'),
  ('a0000000-0000-4000-8000-000000000003', '物理', 1, '2026-10-15T00:00:00.000Z', '2026-10-15T00:00:00.000Z');

INSERT INTO videos (id, platform, external_video_id, label, search_keywords, enabled, availability_status, created_at, updated_at) VALUES
  ('48dba56f-3271-4bb9-b59e-dca27c7221c0', 'youtube', 'pgGrQjYcm5A', 'ピザで円周率を考える', '円周率 パイ ピザ', 1, 'active', '2026-10-15T00:00:00.000Z', '2026-10-15T00:00:00.000Z'),
  ('4a995ef1-1cd7-414d-983b-a60f0dc97086', 'youtube', 'uDeQB9OkoXY', '真球に近いシリコン球と計測', 'シリコン球 真球 計測 キログラム', 1, 'active', '2026-10-15T00:00:00.000Z', '2026-10-15T00:00:00.000Z'),
  ('c225d68d-a34c-4a70-bc95-d00cc546aec4', 'youtube', 'Ko02mUWhItA', '風洞で観察する雨粒のかたち', '雨粒 風洞 流体', 1, 'active', '2026-10-15T00:00:00.000Z', '2026-10-15T00:00:00.000Z'),
  ('b0000000-0000-4000-8000-000000000001', 'youtube', 'disabled000', '無効化済みの検証用動画', '無効 検証', 0, 'active', '2026-10-15T00:00:00.000Z', '2026-10-15T00:00:00.000Z');

INSERT INTO video_categories (video_id, category_id) VALUES
  ('48dba56f-3271-4bb9-b59e-dca27c7221c0', 'a0000000-0000-4000-8000-000000000001'),
  ('4a995ef1-1cd7-414d-983b-a60f0dc97086', 'a0000000-0000-4000-8000-000000000002'),
  ('c225d68d-a34c-4a70-bc95-d00cc546aec4', 'a0000000-0000-4000-8000-000000000003'),
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001');

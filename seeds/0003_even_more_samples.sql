-- More LOCAL sample data (applied by hand like 0001/0002; never production
-- content). Titles and authors verified via YouTube oEmbed on 2026-11-10.
-- 数学: fNk_zzaMoSs = "Vectors | Chapter 1, Essence of linear algebra" (3Blue1Brown)
-- 物理: _dQJBBklpQQ = "The Chain Fountain" (Steve Mould)
-- 物理: 6ukMId5fIi0 = "Amazing Slow Motion Bead Chain Experiment" (The Travel Edit)
-- ものづくり: IvUU8joBb1Q = "Wintergatan - Marble Machine" (Wintergatan)
INSERT OR IGNORE INTO videos (id, platform, external_video_id, label, search_keywords, enabled, availability_status, created_at, updated_at) VALUES
  ('42cbd373-121b-43bf-899a-49ca1f86eca0', 'youtube', 'fNk_zzaMoSs', 'ベクトルとは何か（3Blue1Brown）', 'vectors linear algebra 3blue1brown ベクトル 線形代数 数学', 1, 'active', '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('007b3bdf-1fb8-4a02-abe7-581206fdaf37', 'youtube', '_dQJBBklpQQ', 'チェーンファウンテンの謎（Steve Mould）', 'chain fountain steve mould チェーンファウンテン 物理', 1, 'active', '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('5017f62a-a72f-4ccf-ac34-19f22eb481fd', 'youtube', '6ukMId5fIi0', 'スローモーションで見るビーズチェーン実験', 'slow motion bead chain スローモーション 実験 物理', 1, 'active', '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('b5f79cf7-760d-451c-bb1e-d55b7cee6a56', 'youtube', 'IvUU8joBb1Q', '2000個のビー玉で演奏するマーブルマシン（Wintergatan）', 'marble machine wintergatan マーブルマシン 楽器 ものづくり', 1, 'active', '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z');
INSERT OR IGNORE INTO video_categories (video_id, category_id) VALUES
  ('42cbd373-121b-43bf-899a-49ca1f86eca0', 'a0000000-0000-4000-8000-000000000001'),
  ('007b3bdf-1fb8-4a02-abe7-581206fdaf37', 'a0000000-0000-4000-8000-000000000003'),
  ('5017f62a-a72f-4ccf-ac34-19f22eb481fd', 'a0000000-0000-4000-8000-000000000003'),
  ('b5f79cf7-760d-451c-bb1e-d55b7cee6a56', 'a0000000-0000-4000-8000-000000000002');

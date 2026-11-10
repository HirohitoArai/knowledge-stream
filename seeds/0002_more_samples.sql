-- Additional LOCAL sample data (applied by hand like 0001; never production
-- content). Added so every seed genre has two videos and swipe navigation
-- can be tried within a single genre. Titles verified via YouTube oEmbed.
-- 数学: WUvTyaaNkzM = "The essence of calculus" (3Blue1Brown)
-- 物理: dg3pza4y2ws = "Can Humans Sense Magnetic Fields?" (Veritasium)
-- ものづくり: Q-XOM4E4RZQ = "Gears! - But Were Afraid To Ask" (This Old Tony)
INSERT OR IGNORE INTO videos (id, platform, external_video_id, label, search_keywords, enabled, availability_status, created_at, updated_at) VALUES
  ('96996931-3342-4087-847a-554685db2a8c', 'youtube', 'WUvTyaaNkzM', '微積分の本質（3Blue1Brown）', 'calculus essence 3blue1brown 微積分 数学', 1, 'active', '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('a2e0d013-058d-4f59-8697-ffa881baa5b8', 'youtube', 'dg3pza4y2ws', '人間は磁場を感じられるか（Veritasium）', 'magnetic fields veritasium 磁場 物理', 1, 'active', '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('cdceca5e-76cf-4376-8095-b03bc822a79a', 'youtube', 'Q-XOM4E4RZQ', '歯車の仕組み（This Old Tony）', 'gears minilathe this old tony 歯車 旋盤 ものづくり', 1, 'active', '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z');
INSERT OR IGNORE INTO video_categories (video_id, category_id) VALUES
  ('96996931-3342-4087-847a-554685db2a8c', 'a0000000-0000-4000-8000-000000000001'),
  ('a2e0d013-058d-4f59-8697-ffa881baa5b8', 'a0000000-0000-4000-8000-000000000003'),
  ('cdceca5e-76cf-4376-8095-b03bc822a79a', 'a0000000-0000-4000-8000-000000000002');

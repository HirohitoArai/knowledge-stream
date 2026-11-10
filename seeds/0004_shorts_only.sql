-- Shorts-only demo set (owner direction, 2026-11-10): the feed targets
-- Shorts only. This disables every previously seeded long-form sample and
-- registers nine YouTube Shorts, three per genre. All ids came from
-- youtube.com/shorts/ URLs and titles/authors were verified via oEmbed.
UPDATE videos SET enabled = 0, updated_at = '2026-11-10T00:00:00.000Z';
INSERT OR IGNORE INTO videos (id, platform, external_video_id, label, search_keywords, enabled, availability_status, created_at, updated_at) VALUES
  ('8c2dc1b4-8c53-4794-9a7e-22c5318f0dd1', 'youtube', 'wPO8fROsE34', '線を引くだけで割り算（計算トリック）', 'division trick math shorts 割り算 数学', 1, 'active', '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('7fe9821c-ff07-47cd-b93f-723f4db83267', 'youtube', 'DE5ITp_zEuo', '線メソッドで4桁の割り算', 'line method division math shorts 割り算 数学', 1, 'active', '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('9f804e0a-02c9-461e-8132-fbe36ca79b68', 'youtube', '_KUCok05wDc', '指数の計算チャレンジ', 'exponents maths challenge shorts 指数 数学', 1, 'active', '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('116576c6-7ad1-47c4-b9fb-d7e4840d404b', 'youtube', 'oGdi4jhb8WE', '水中でも濡れない砂の実験', 'hydrophobic sand experiment shorts 砂 実験 物理', 1, 'active', '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('8733631b-c718-4749-883c-6fa5271dadb6', 'youtube', 'g8-xosb5Utw', 'CERNが鉛を金に変えた話', 'cern lead gold physics shorts 素粒子 物理', 1, 'active', '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('e630004e-2b10-4f0c-ba3b-217742db5499', 'youtube', 'wqrxmaXmYKg', 'ミントでソーダが噴き出す理由', 'mint soda eruption nucleation shorts 実験 物理', 1, 'active', '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('0fd152e6-2bfa-44e5-b85c-c01705e7cd20', 'youtube', 'd-gte6DHbjY', '0.2mmの金属シャフトを作る難しさ', 'precision machining shaft shorts 加工 ものづくり', 1, 'active', '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('e5b37135-93ee-4f88-a4a1-d59598fec8ca', 'youtube', 'HPlyfcxqoFU', '金型を削る（CNC加工）', 'cnc machining mold tungaloy shorts 金型 ものづくり', 1, 'active', '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('0adfa7f2-4e4d-47e0-8cae-bb4977833c12', 'youtube', 'yoGYaHYlTlE', '旋盤で真鍮と鋼のダイス作り', 'lathe brass steel dice machining shorts 旋盤 ものづくり', 1, 'active', '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z');
INSERT OR IGNORE INTO video_categories (video_id, category_id) VALUES
  ('8c2dc1b4-8c53-4794-9a7e-22c5318f0dd1', 'a0000000-0000-4000-8000-000000000001'),
  ('7fe9821c-ff07-47cd-b93f-723f4db83267', 'a0000000-0000-4000-8000-000000000001'),
  ('9f804e0a-02c9-461e-8132-fbe36ca79b68', 'a0000000-0000-4000-8000-000000000001'),
  ('116576c6-7ad1-47c4-b9fb-d7e4840d404b', 'a0000000-0000-4000-8000-000000000003'),
  ('8733631b-c718-4749-883c-6fa5271dadb6', 'a0000000-0000-4000-8000-000000000003'),
  ('e630004e-2b10-4f0c-ba3b-217742db5499', 'a0000000-0000-4000-8000-000000000003'),
  ('0fd152e6-2bfa-44e5-b85c-c01705e7cd20', 'a0000000-0000-4000-8000-000000000002'),
  ('e5b37135-93ee-4f88-a4a1-d59598fec8ca', 'a0000000-0000-4000-8000-000000000002'),
  ('0adfa7f2-4e4d-47e0-8cae-bb4977833c12', 'a0000000-0000-4000-8000-000000000002');

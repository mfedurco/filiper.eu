-- Demo seed for Výprava on Neon.
-- Run after web/neon/001_init.sql.
-- Re-running truncates app tables and reloads these demo rows.
-- Do not run this on a database that already has live /api/sync data.

truncate table
  contributions,
  player_progress,
  shared_goal_state,
  leaderboard_snapshot,
  milestones,
  goals,
  players,
  admin_settings
restart identity cascade;

insert into admin_settings (id, rewards_enabled, points_enabled, min_chapter_enforced)
values (1, true, true, true);

insert into players (id, mc_uuid, name, chapter, total_points, weekly_points) values
  ('11111111-1111-1111-1111-111111111101', 'a0000000-0000-0000-0000-000000000001', 'MajoCraft', 6, 1240, 180),
  ('11111111-1111-1111-1111-111111111102', 'a0000000-0000-0000-0000-000000000002', 'ZuzkaBuilder', 5, 1115, 210),
  ('11111111-1111-1111-1111-111111111103', 'a0000000-0000-0000-0000-000000000003', 'TomasMine', 5, 980, 95),
  ('11111111-1111-1111-1111-111111111104', 'a0000000-0000-0000-0000-000000000004', 'EmaExplorer', 4, 870, 160),
  ('11111111-1111-1111-1111-111111111105', 'a0000000-0000-0000-0000-000000000005', 'PeterPickaxe', 4, 720, 140),
  ('11111111-1111-1111-1111-111111111106', 'a0000000-0000-0000-0000-000000000006', 'NinaNether', 3, 640, 220);

insert into leaderboard_snapshot (player_id, name, total_points, weekly_points, chapter)
select id, name, total_points, weekly_points, chapter from players;

insert into milestones (id, chapter_id, chapter_order, chapter_name, name, description, points, rewards) values
  ('ms_1', 'chapter_1', 1, 'Základy', 'Prvý tábor', 'Prvý deň v divočine.', 50,
   '[{"material":"IRON_INGOT","amount":8},{"material":"BREAD","amount":16}]'::jsonb),
  ('ms_2', 'chapter_2', 2, 'Domov', 'Vlastný dom', 'Postav si bezpečné zázemie.', 60,
   '[{"material":"IRON_INGOT","amount":16}]'::jsonb),
  ('ms_3', 'chapter_3', 3, 'Baníctvo', 'Železná doba', 'Hĺbky a rudy.', 80,
   '[{"material":"DIAMOND","amount":2}]'::jsonb);

insert into goals (id, kind, name, description, objective_type, targets, amount, points, min_chapter, chapter_id, chapter_order, rewards) values
  ('c1_wood', 'campaign', 'Zberač dreva', 'Získaj 32 klád.', 'BREAK_BLOCK',
   array['OAK_LOG','BIRCH_LOG','SPRUCE_LOG'], 32, 10, 1, 'chapter_1', 1,
   '[{"material":"APPLE","amount":4}]'::jsonb),
  ('c1_stone', 'campaign', 'Kameňolom', 'Vyťaž 24 kameňa.', 'BREAK_BLOCK',
   array['STONE','COBBLESTONE'], 24, 15, 1, 'chapter_1', 1,
   '[]'::jsonb),
  ('d_wood', 'daily', 'Ráno v lese', 'Získaj 24 klád.', 'BREAK_BLOCK',
   array['OAK_LOG','BIRCH_LOG','SPRUCE_LOG'], 24, 8, 1, null, null,
   '[{"material":"APPLE","amount":4}]'::jsonb),
  ('d_stone', 'daily', 'Kamenár', 'Vyťaž 48 kameňa.', 'BREAK_BLOCK',
   array['STONE','COBBLESTONE'], 48, 8, 1, null, null,
   '[{"material":"COAL","amount":8}]'::jsonb),
  ('d_build', 'daily', 'Stavba dňa', 'Polož 48 blokov.', 'PLACE_BLOCK',
   array['ANY_SOLID'], 48, 8, 2, null, null,
   '[{"material":"IRON_NUGGET","amount":18}]'::jsonb),
  ('w_wood', 'weekly', 'Týždeň drevorubača', 'Získaj 200 klád počas týždňa.', 'BREAK_BLOCK',
   array['OAK_LOG','BIRCH_LOG','SPRUCE_LOG'], 200, 40, 1, null, null,
   '[{"material":"IRON_INGOT","amount":12}]'::jsonb),
  ('w_iron', 'weekly', 'Železný týždeň', 'Vyťaž 64 železnej rudy.', 'BREAK_BLOCK',
   array['IRON_ORE','DEEPSLATE_IRON_ORE'], 64, 55, 3, null, null,
   '[{"material":"IRON_BLOCK","amount":2}]'::jsonb),
  ('l_explorer', 'long_term', 'Prieskumník sezóny', 'Polož 1000 stavebných blokov.', 'PLACE_BLOCK',
   array['ANY_SOLID'], 1000, 150, 1, null, null,
   '[{"material":"DIAMOND","amount":4}]'::jsonb),
  ('l_miner', 'long_term', 'Baník sezóny', 'Vyťaž 400 železnej rudy.', 'BREAK_BLOCK',
   array['IRON_ORE','DEEPSLATE_IRON_ORE'], 400, 180, 3, null, null,
   '[{"material":"IRON_BLOCK","amount":8}]'::jsonb),
  ('s_bridge', 'shared', 'Postavte spoločne most', 'Spoločne položte 800 blokov.', 'PLACE_BLOCK',
   array['ANY_SOLID'], 800, 60, 1, null, null,
   '[{"material":"EMERALD","amount":8}]'::jsonb),
  ('s_iron', 'shared', 'Spoločne vyťažte železo', 'Spoločne vyťažte 500 železnej rudy.', 'BREAK_BLOCK',
   array['IRON_ORE','DEEPSLATE_IRON_ORE'], 500, 70, 3, null, null,
   '[{"material":"IRON_BLOCK","amount":4}]'::jsonb),
  ('p_wood', 'party', 'Triedny les', 'Spoločne získajte 120 klád.', 'BREAK_BLOCK',
   array['OAK_LOG','BIRCH_LOG','SPRUCE_LOG'], 120, 30, 1, null, null,
   '[{"material":"IRON_INGOT","amount":8}]'::jsonb),
  ('p_mine', 'party', 'Banícka partia', 'Spoločne vyťažte 80 železnej rudy.', 'BREAK_BLOCK',
   array['IRON_ORE','DEEPSLATE_IRON_ORE'], 80, 40, 3, null, null,
   '[{"material":"DIAMOND","amount":2}]'::jsonb);

update goals set period_key = '2026-W40', active = true where kind in ('weekly', 'shared');
update goals set period_key = '2026-S4', active = true where kind = 'long_term';

insert into shared_goal_state (goal_id, progress, completed, period_key) values
  ('s_bridge', 512, false, '2026-W40'),
  ('s_iron', 210, false, '2026-W40');

insert into contributions (goal_id, player_id, amount) values
  ('s_bridge', '11111111-1111-1111-1111-111111111102', 180),
  ('s_bridge', '11111111-1111-1111-1111-111111111101', 140),
  ('s_bridge', '11111111-1111-1111-1111-111111111104', 100),
  ('s_bridge', '11111111-1111-1111-1111-111111111105', 92),
  ('s_iron', '11111111-1111-1111-1111-111111111103', 95),
  ('s_iron', '11111111-1111-1111-1111-111111111101', 70),
  ('s_iron', '11111111-1111-1111-1111-111111111106', 45);

insert into player_progress (player_id, goal_id, current_amount, completed) values
  ('11111111-1111-1111-1111-111111111101', 'd_wood', 24, true),
  ('11111111-1111-1111-1111-111111111101', 'd_stone', 30, false),
  ('11111111-1111-1111-1111-111111111101', 'w_wood', 120, false),
  ('11111111-1111-1111-1111-111111111101', 'l_explorer', 640, false);

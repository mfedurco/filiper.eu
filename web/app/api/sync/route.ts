import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase";

/**
 * Sync endpoint: pulls from Paper plugin HTTP API and upserts into Supabase.
 * POST with header X-Vyprava-Admin matching VYPRVA_ADMIN_PASSWORD
 * or Authorization: Bearer <SUPABASE_SERVICE_ROLE not required; uses admin password>.
 */
export async function POST(request: NextRequest) {
  const admin = process.env.VYPRVA_ADMIN_PASSWORD?.trim() || "vyprava";
  const header =
    request.headers.get("x-vyprava-admin") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (header !== admin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const service = createServiceSupabase();
  if (!service) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL missing" },
      { status: 503 },
    );
  }

  const pluginBase =
    process.env.VYPRVA_PLUGIN_API_URL?.trim()?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_VYPRVA_API_URL?.trim()?.replace(/\/$/, "");
  if (!pluginBase) {
    return NextResponse.json(
      { error: "VYPRVA_PLUGIN_API_URL not configured" },
      { status: 503 },
    );
  }

  const token = process.env.VYPRVA_PLUGIN_API_TOKEN?.trim() || "";
  const headers: HeadersInit = { Accept: "application/json" };
  if (token) headers["X-Vyprava-Token"] = token;

  try {
    const [leaderboardRes, playersRes, sharedRes] = await Promise.all([
      fetch(`${pluginBase}/api/leaderboard`, { headers, cache: "no-store" }),
      fetch(`${pluginBase}/api/players`, { headers, cache: "no-store" }),
      fetch(`${pluginBase}/api/shared`, { headers, cache: "no-store" }),
    ]);

    if (!leaderboardRes.ok || !playersRes.ok) {
      return NextResponse.json(
        { error: "Plugin API failed", leaderboard: leaderboardRes.status, players: playersRes.status },
        { status: 502 },
      );
    }

    const leaderboardJson = await leaderboardRes.json();
    const playersJson = await playersRes.json();
    const sharedJson = sharedRes.ok ? await sharedRes.json() : { active: [] };

    const players = (playersJson.players ?? []) as Array<{
      uuid: string;
      name: string;
      chapter: number;
      totalPoints: number;
      weeklyPoints: number;
    }>;

    for (const p of players) {
      await service.from("players").upsert(
        {
          mc_uuid: p.uuid,
          name: p.name,
          chapter: p.chapter,
          total_points: p.totalPoints,
          weekly_points: p.weeklyPoints,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "mc_uuid" },
      );
    }

    const { data: dbPlayers } = await service.from("players").select("id, mc_uuid, name");
    const byUuid = new Map((dbPlayers ?? []).map((p) => [p.mc_uuid, p]));

    for (const row of (leaderboardJson.leaderboard ?? []) as Array<{
      uuid?: string;
      name: string;
      totalPoints: number;
      weeklyPoints: number;
      chapter: number;
    }>) {
      const player = row.uuid ? byUuid.get(row.uuid) : [...byUuid.values()].find((p) => p.name === row.name);
      if (!player) continue;
      await service.from("leaderboard_snapshot").upsert({
        player_id: player.id,
        name: row.name,
        total_points: row.totalPoints,
        weekly_points: row.weeklyPoints,
        chapter: row.chapter,
        updated_at: new Date().toISOString(),
      });
    }

    for (const goal of (sharedJson.active ?? []) as Array<{
      questId: string;
      progress: number;
      completed: boolean;
      periodKey?: string;
      contributions?: Array<{ uuid: string; name: string; amount: number }>;
    }>) {
      await service.from("shared_goal_state").upsert({
        goal_id: goal.questId,
        progress: goal.progress,
        completed: goal.completed,
        period_key: goal.periodKey ?? null,
        updated_at: new Date().toISOString(),
      });
      for (const c of goal.contributions ?? []) {
        const player = byUuid.get(c.uuid);
        if (!player) continue;
        await service.from("contributions").upsert(
          {
            goal_id: goal.questId,
            player_id: player.id,
            amount: c.amount,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "goal_id,player_id" },
        );
      }
    }

    return NextResponse.json({
      ok: true,
      players: players.length,
      shared: (sharedJson.active ?? []).length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "sync failed" },
      { status: 500 },
    );
  }
}

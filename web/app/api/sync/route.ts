import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";

/**
 * Sync endpoint: pulls from the Paper plugin HTTP API and upserts into Neon.
 * POST with header X-Vyprava-Admin matching VYPRVA_ADMIN_PASSWORD
 * (Authorization: Bearer <password> is also accepted).
 */
export async function POST(request: NextRequest) {
  const admin = process.env.VYPRVA_ADMIN_PASSWORD?.trim() || "vyprava";
  const header =
    request.headers.get("x-vyprava-admin") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (header !== admin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sql = getSql();
  if (!sql) {
    return NextResponse.json({ error: "DATABASE_URL missing" }, { status: 503 });
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
      await sql`
        insert into players (
          mc_uuid, name, chapter, total_points, weekly_points, updated_at
        ) values (
          ${p.uuid},
          ${p.name},
          ${p.chapter},
          ${p.totalPoints},
          ${p.weeklyPoints},
          now()
        )
        on conflict (mc_uuid) do update set
          name = excluded.name,
          chapter = excluded.chapter,
          total_points = excluded.total_points,
          weekly_points = excluded.weekly_points,
          updated_at = excluded.updated_at
      `;
    }

    const dbPlayers = (await sql`
      select id, mc_uuid, name from players
    `) as Array<{ id: string; mc_uuid: string | null; name: string }>;
    const byUuid = new Map(
      dbPlayers
        .filter((p) => p.mc_uuid)
        .map((p) => [p.mc_uuid as string, p]),
    );

    for (const row of (leaderboardJson.leaderboard ?? []) as Array<{
      uuid?: string;
      name: string;
      totalPoints: number;
      weeklyPoints: number;
      chapter: number;
    }>) {
      const player = row.uuid
        ? byUuid.get(row.uuid)
        : dbPlayers.find((p) => p.name === row.name);
      if (!player) continue;
      await sql`
        insert into leaderboard_snapshot (
          player_id, name, total_points, weekly_points, chapter, updated_at
        ) values (
          ${player.id},
          ${row.name},
          ${row.totalPoints},
          ${row.weeklyPoints},
          ${row.chapter},
          now()
        )
        on conflict (player_id) do update set
          name = excluded.name,
          total_points = excluded.total_points,
          weekly_points = excluded.weekly_points,
          chapter = excluded.chapter,
          updated_at = excluded.updated_at
      `;
    }

    for (const goal of (sharedJson.active ?? []) as Array<{
      questId: string;
      progress: number;
      completed: boolean;
      periodKey?: string;
      contributions?: Array<{ uuid: string; name: string; amount: number }>;
    }>) {
      await sql`
        insert into shared_goal_state (
          goal_id, progress, completed, period_key, updated_at
        ) values (
          ${goal.questId},
          ${goal.progress},
          ${goal.completed},
          ${goal.periodKey ?? null},
          now()
        )
        on conflict (goal_id) do update set
          progress = excluded.progress,
          completed = excluded.completed,
          period_key = excluded.period_key,
          updated_at = excluded.updated_at
      `;
      for (const c of goal.contributions ?? []) {
        const player = byUuid.get(c.uuid);
        if (!player) continue;
        await sql`
          insert into contributions (goal_id, player_id, amount, updated_at)
          values (
            ${goal.questId},
            ${player.id},
            ${c.amount},
            now()
          )
          on conflict (goal_id, player_id) do update set
            amount = excluded.amount,
            updated_at = excluded.updated_at
        `;
      }
    }

    return NextResponse.json({
      ok: true,
      players: players.length,
      shared: (sharedJson.active ?? []).length,
    });
  } catch (error) {
    const raw = error instanceof Error ? error.message : "sync failed";
    return NextResponse.json(
      { error: raw.replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://[redacted]") },
      { status: 500 },
    );
  }
}

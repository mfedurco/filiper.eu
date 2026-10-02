import { dbQuery, hasDatabase } from "@/lib/db";
import { isServerId } from "@/lib/portal";

export type PublicQuest = { name: string };

export type PublicExpedition = {
  name: string;
  blurb: string;
  quests: PublicQuest[];
};

export type PublicLeader = { player: string; points: number; uuid: string };

export type PublicSnapshot = {
  serverId: string;
  expedition: PublicExpedition | null;
  leaderboard: PublicLeader[];
};

function empty(serverId: string): PublicSnapshot {
  return { serverId, expedition: null, leaderboard: [] };
}

function pointsOf(value: unknown): number {
  const points = Number(value ?? 0);
  return Number.isFinite(points) ? points : 0;
}

export async function getPublicSnapshot(rawServerId: string): Promise<PublicSnapshot> {
  const serverId = rawServerId.trim();
  if (!isServerId(serverId) || !hasDatabase()) return empty(isServerId(serverId) ? serverId : "");

  try {
    await dbQuery("select changed from apply_expedition_schedule(now(), $1)", [serverId]);
    const expeditions = await dbQuery<{ id: string; title: string; description: string | null }>(
      `select id::text, title, description
       from expeditions
       where server_id = $1 and status = 'active'
       limit 1`,
      [serverId],
    );
    const expedition = expeditions[0];
    if (!expedition) return empty(serverId);

    const [quests, players, board] = await Promise.all([
      dbQuery<{ title: string }>(
        `select title
         from quest_definitions
         where expedition_id = $1 and server_id = $2 and active
         order by sort_order, title`,
        [expedition.id, serverId],
      ),
      dbQuery<{ name: string; total_points: number; mc_uuid: string | null }>(
        `select name, total_points, mc_uuid
         from players
         where server_id = $1
         order by total_points desc, name`,
        [serverId],
      ),
      dbQuery<{ name: string; total_points: number }>(
        `select name, total_points
         from leaderboard_snapshot
         where server_id = $1 and expedition_id = $2
         order by total_points desc, name
         limit 50`,
        [serverId, expedition.id],
      ),
    ]);

    const snapshot = new Map(board.map((row) => [row.name, pointsOf(row.total_points)]));
    const source = players.length ? players : board.map((row) => ({ ...row, mc_uuid: null as string | null }));
    const leaderboard: PublicLeader[] = source.map((row) => ({
      player: row.name,
      points: Math.max(pointsOf(row.total_points), snapshot.get(row.name) ?? 0),
      uuid: row.mc_uuid ?? "",
    }));
    leaderboard.sort((left, right) => right.points - left.points || left.player.localeCompare(right.player, "sk"));

    return {
      serverId,
      expedition: {
        name: expedition.title,
        blurb: expedition.description ?? "",
        quests: quests.map((quest) => ({ name: quest.title })),
      },
      leaderboard,
    };
  } catch {
    return empty(serverId);
  }
}

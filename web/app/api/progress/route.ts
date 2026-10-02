import { NextResponse } from "next/server";
import { getLivePlayers } from "@/lib/data";
import { getPortalMeta } from "@/lib/portal";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [meta, players] = await Promise.all([getPortalMeta(), getLivePlayers()]);
    if (!meta.connected) {
      return NextResponse.json({ empty: true, connected: false, serverId: meta.serverId, players: [] });
    }
    return NextResponse.json({
      empty: players.length === 0,
      connected: true,
      failed: meta.failed,
      serverId: meta.serverId,
      expedition: meta.expedition?.title ?? null,
      players,
    });
  } catch {
    return NextResponse.json({ error: "Nepodarilo sa načítať hráčov." }, { status: 500 });
  }
}

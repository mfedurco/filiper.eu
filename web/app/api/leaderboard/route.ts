import { NextResponse } from "next/server";
import { getLeaderboard } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getLeaderboard());
  } catch {
    return NextResponse.json({ error: "Dáta momentálne nie sú dostupné." }, { status: 503 });
  }
}

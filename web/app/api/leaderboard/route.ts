import { NextResponse } from "next/server";
import { getLeaderboard } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getLeaderboard());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Chyba" },
      { status: 500 },
    );
  }
}

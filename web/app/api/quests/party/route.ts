import { NextResponse } from "next/server";
import { getPartyPool } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getPartyPool());
  } catch {
    return NextResponse.json({ error: "Dáta momentálne nie sú dostupné." }, { status: 503 });
  }
}

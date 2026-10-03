import { NextResponse } from "next/server";
import { getDailyPool } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getDailyPool());
  } catch {
    return NextResponse.json({ error: "Dáta momentálne nie sú dostupné." }, { status: 503 });
  }
}

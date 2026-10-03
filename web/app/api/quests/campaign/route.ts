import { NextResponse } from "next/server";
import { getCampaign } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getCampaign();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Dáta momentálne nie sú dostupné." }, { status: 503 });
  }
}

import { NextResponse } from "next/server";
import { getCampaign } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getCampaign();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Chyba" },
      { status: 500 },
    );
  }
}

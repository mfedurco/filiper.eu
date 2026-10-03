import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { error: "Podrobný export hráčov nie je verejný." },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}

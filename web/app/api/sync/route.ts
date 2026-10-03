import { NextResponse } from "next/server";

export function POST() {
  return NextResponse.json(
    { error: "Starý Supabase sync je vypnutý. Plugin používa /api/plugin/sync." },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}

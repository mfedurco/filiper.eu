import { NextResponse } from "next/server";

function gone() {
  return NextResponse.json(
    { error: "Admin používa prihlásenie cez Google." },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}

export const POST = gone;
export const DELETE = gone;

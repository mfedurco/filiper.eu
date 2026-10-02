import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json(
    { error: "Úlohy sa spravujú na stránke /admin." },
    { status: 410 },
  );
}

export function PUT() {
  return NextResponse.json(
    { error: "Úlohy sa spravujú na stránke /admin." },
    { status: 410 },
  );
}

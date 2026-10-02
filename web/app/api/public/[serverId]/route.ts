import { NextResponse } from "next/server";
import { getPublicSnapshot } from "@/lib/public-json";

export const dynamic = "force-dynamic";

const ALLOWED_ORIGINS = new Set(["https://filiper.eu", "https://www.filiper.eu"]);

function withCors(response: NextResponse, request: Request) {
  const origin = request.headers.get("origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Vary", "Origin");
  }
  response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.headers.set("Access-Control-Max-Age", "86400");
  return response;
}

export function OPTIONS(request: Request) {
  return withCors(new NextResponse(null, { status: 204 }), request);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ serverId: string }> },
) {
  const { serverId } = await context.params;
  const body = await getPublicSnapshot(serverId);
  return withCors(NextResponse.json(body), request);
}

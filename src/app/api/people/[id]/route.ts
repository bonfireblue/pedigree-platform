// This route has been moved to /api/members/[id]
// This file exists only to clear the build cache

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ error: "MOVED", newPath: "/api/members/[id]" }, { status: 301 });
}

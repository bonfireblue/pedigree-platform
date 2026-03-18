// This route has been moved to /api/person/[id]
// This file exists only to clear the build cache

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.redirect(new URL("/api/person", "http://localhost:3000"));
}

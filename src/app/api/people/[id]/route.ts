// Deprecated - use /api/family-member/[id] instead
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ error: "USE_FAMILY_MEMBER_API" }, { status: 410 });
}

export async function PATCH() {
  return NextResponse.json({ error: "USE_FAMILY_MEMBER_API" }, { status: 410 });
}

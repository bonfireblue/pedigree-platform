import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return NextResponse.json({ redirect: `/api/person/${id}` }, { status: 301 });
}

export async function PATCH(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return NextResponse.json({ redirect: `/api/person/${id}` }, { status: 301 });
}

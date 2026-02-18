import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireMe } from "@/lib/authz";
import { rateLimit, clientKey } from "@/lib/rateLimit";
import { readJson } from "@/lib/body";

export async function POST(req: Request) {
  const me = await requireMe();
  if (!me) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  // 60 requests/min per IP
  const rl = rateLimit({
    key: `rel:spouse:${clientKey(req)}`,
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

  // 50KB max JSON
  const parsed = await readJson(req, 50_000);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const body = parsed.json;

  const aId = typeof body?.aId === "string" ? body.aId.trim() : "";
  const bId = typeof body?.bId === "string" ? body.bId.trim() : "";

  if (!aId || !bId) {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }
  if (aId === bId) {
    return NextResponse.json({ error: "INVALID_RELATION_SELF" }, { status: 400 });
  }

  const [a, b] = await Promise.all([
    prisma.person.findUnique({ where: { id: aId }, select: { id: true, createdById: true } }),
    prisma.person.findUnique({ where: { id: bId }, select: { id: true, createdById: true } }),
  ]);

  if (!a || !b) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  // To link, user must be ADMIN or owner of BOTH people (simple MVP rule)
  const canEdit = me.isAdmin || (a.createdById === me.id && b.createdById === me.id);
  if (!canEdit) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  // Normalize direction so duplicates don't happen (store smaller id as aId)
  const [xId, yId] = aId < bId ? [aId, bId] : [bId, aId];

  const rel = await prisma.spouse.upsert({
    where: { aId_bId: { aId: xId, bId: yId } },
    update: {},
    create: { aId: xId, bId: yId },
    select: { aId: true, bId: true },
  });

  return NextResponse.json({ relationship: rel }, { status: 201 });
}

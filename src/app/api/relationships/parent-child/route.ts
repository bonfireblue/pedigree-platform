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
    key: `rel:parent-child:${clientKey(req)}`,
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

  // 50KB max JSON
  const parsed = await readJson(req, 50_000);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const body = parsed.json;

  const parentId = typeof body?.parentId === "string" ? body.parentId.trim() : "";
  const childId = typeof body?.childId === "string" ? body.childId.trim() : "";

  if (!parentId || !childId) {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }
  if (parentId === childId) {
    return NextResponse.json({ error: "INVALID_RELATION_SELF" }, { status: 400 });
  }

  // Fetch both people to enforce privacy + ownership/admin
  const [parent, child] = await Promise.all([
    prisma.person.findUnique({ where: { id: parentId }, select: { id: true, isPrivate: true, createdById: true } }),
    prisma.person.findUnique({ where: { id: childId }, select: { id: true, isPrivate: true, createdById: true } }),
  ]);

  if (!parent || !child) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  // To link, user must be ADMIN or owner of BOTH people (simple MVP rule)
  const canEdit =
    me.isAdmin || (parent.createdById === me.id && child.createdById === me.id);

  if (!canEdit) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  // Create relationship (avoid duplicates)
  const rel = await prisma.parentChild.upsert({
    where: {
      parentId_childId: { parentId, childId },
    },
    update: {},
    create: { parentId, childId },
    select: { parentId: true, childId: true },
  });

  return NextResponse.json({ relationship: rel }, { status: 201 });
}

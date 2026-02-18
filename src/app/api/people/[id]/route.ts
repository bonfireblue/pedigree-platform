import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, clientKey } from "@/lib/rateLimit";
import { readJson } from "@/lib/body";
import { requireMe } from "@/lib/authz";

type Ctx = {
  params: Promise<{ id: string }>;
};

type PersonRow = {
  id: string;
  fullName: string;
  createdAt: Date;
  isPrivate: boolean;
  bio: string | null;
  location: string | null;
  birthDate: Date | null;
  deathDate: Date | null;
  photoUrl: string | null;
  createdById: string;
};

type ParentRelRow = { parent: PersonRow };
type ChildRelRow = { child: PersonRow };
type SpouseARow = { b: PersonRow };
type SpouseBRow = { a: PersonRow };

function canView(meId: string, row: { isPrivate: boolean; createdById: string }) {
  if (!row.isPrivate) return true;
  return row.createdById === meId;
}

function slim(p: PersonRow) {
  return {
    id: p.id,
    fullName: p.fullName,
    createdAt: p.createdAt.toISOString(),
    isPrivate: p.isPrivate
  };
}

export async function GET(req: Request, ctx: Ctx) {
  const lim = rateLimit({ key: `people_id:${clientKey(req)}`, limit: 120, windowMs: 60_000 });
  if (!lim.ok) return NextResponse.json({ error: "RATE_LIMIT" }, { status: 429 });

  const me = await requireMe();
  if (!me) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await ctx.params;

  const found = await prisma.person.findUnique({
    where: { id },
    include: {
      parents: { include: { parent: true } },
      children: { include: { child: true } },
      spousesA: { include: { b: true } },
      spousesB: { include: { a: true } }
    }
  });

  if (!found) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const person = found as unknown as PersonRow & {
    parents: ParentRelRow[];
    children: ChildRelRow[];
    spousesA: SpouseARow[];
    spousesB: SpouseBRow[];
  };

  if (!canView(me.id, person)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const parents = person.parents
    .map((row: ParentRelRow) => row.parent)
    .filter((p: PersonRow) => canView(me.id, p))
    .map(slim);

  const children = person.children
    .map((row: ChildRelRow) => row.child)
    .filter((c: PersonRow) => canView(me.id, c))
    .map(slim);

  const spouses = [
    ...person.spousesA.map((row: SpouseARow) => row.b),
    ...person.spousesB.map((row: SpouseBRow) => row.a)
  ]
    .filter((s: PersonRow) => canView(me.id, s))
    .map(slim);

  return NextResponse.json({
    person: {
      id: person.id,
      fullName: person.fullName,
      bio: person.bio,
      location: person.location,
      birthDate: person.birthDate ? person.birthDate.toISOString() : null,
      deathDate: person.deathDate ? person.deathDate.toISOString() : null,
      photoUrl: person.photoUrl,
      isPrivate: person.isPrivate,
      createdAt: person.createdAt.toISOString()
    },
    parents,
    children,
    spouses
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const lim = rateLimit({ key: `people_patch:${clientKey(req)}`, limit: 60, windowMs: 60_000 });
  if (!lim.ok) return NextResponse.json({ error: "RATE_LIMIT" }, { status: 429 });

  const me = await requireMe();
  if (!me) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await ctx.params;

  const body = await readJson(req, 50_000);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });

  const fullName = typeof body.json.fullName === "string" ? body.json.fullName.trim() : undefined;
  const bio = body.json.bio === null ? null : typeof body.json.bio === "string" ? body.json.bio : undefined;
  const location =
    body.json.location === null ? null : typeof body.json.location === "string" ? body.json.location : undefined;
  const isPrivate = typeof body.json.isPrivate === "boolean" ? body.json.isPrivate : undefined;

  const existing = await prisma.person.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (existing.createdById !== me.id) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const updated = await prisma.person.update({
    where: { id },
    data: {
      ...(fullName !== undefined ? { fullName } : {}),
      ...(bio !== undefined ? { bio } : {}),
      ...(location !== undefined ? { location } : {}),
      ...(isPrivate !== undefined ? { isPrivate } : {})
    }
  });

  return NextResponse.json({
    person: {
      id: updated.id,
      fullName: updated.fullName,
      bio: updated.bio,
      location: updated.location,
      birthDate: updated.birthDate ? updated.birthDate.toISOString() : null,
      deathDate: updated.deathDate ? updated.deathDate.toISOString() : null,
      photoUrl: updated.photoUrl,
      isPrivate: updated.isPrivate,
      createdAt: updated.createdAt.toISOString()
    }
  });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const lim = rateLimit({ key: `people_delete:${clientKey(req)}`, limit: 60, windowMs: 60_000 });
  if (!lim.ok) return NextResponse.json({ error: "RATE_LIMIT" }, { status: 429 });

  const me = await requireMe();
  if (!me) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await ctx.params;

  const existing = await prisma.person.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (existing.createdById !== me.id) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  await prisma.person.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

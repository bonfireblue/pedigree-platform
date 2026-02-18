import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit, clientKey } from "@/lib/rateLimit";
import { readJson } from "@/lib/body";

type Ctx = {
  params: Promise<{ id: string }>;
};

//
// GET /api/people/:id
//
export async function GET(req: Request, ctx: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const me = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!me) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const person = await prisma.person.findUnique({
    where: { id },
  });

  if (!person) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  // Privacy enforcement
  if (
    person.isPrivate &&
    person.createdById !== me.id &&
    me.role !== "ADMIN"
  ) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  // Immediate relations only (tree endpoint handles full subgraph)
  const parents = await prisma.parentChild.findMany({
    where: { childId: id },
    include: { parent: true },
  });

  const children = await prisma.parentChild.findMany({
    where: { parentId: id },
    include: { child: true },
  });

  const spousesA = await prisma.spouse.findMany({
    where: { aId: id },
    include: { b: true },
  });

  const spousesB = await prisma.spouse.findMany({
    where: { bId: id },
    include: { a: true },
  });

  return NextResponse.json({
    person,
    parents: parents.map((p) => p.parent),
    children: children.map((c) => c.child),
    spouses: [
      ...spousesA.map((s) => s.b),
      ...spousesB.map((s) => s.a),
    ],
  });
}

//
// PATCH /api/people/:id
//
export async function PATCH(req: Request, ctx: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const me = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!me) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const person = await prisma.person.findUnique({
    where: { id },
  });

  if (!person) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  // Only owner or admin can edit
  if (
    person.createdById !== me.id &&
    me.role !== "ADMIN"
  ) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  // Rate limit: 60 edits/minute
  const rl = rateLimit({
    key: `people:patch:${clientKey(req)}`,
    limit: 60,
    windowMs: 60_000,
  });

  if (!rl.ok) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  const parsed = await readJson(req);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const body = parsed.json;

  const updated = await prisma.person.update({
    where: { id },
    data: {
      fullName:
        typeof body.fullName === "string"
          ? body.fullName.trim()
          : undefined,
      isPrivate:
        typeof body.isPrivate === "boolean"
          ? body.isPrivate
          : undefined,
    },
  });

  return NextResponse.json({ person: updated });
}

//
// DELETE /api/people/:id
//
export async function DELETE(req: Request, ctx: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const me = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!me) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const person = await prisma.person.findUnique({
    where: { id },
  });

  if (!person) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  // Only owner or admin can delete
  if (
    person.createdById !== me.id &&
    me.role !== "ADMIN"
  ) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  // Rate limit deletes more aggressively
  const rl = rateLimit({
    key: `people:delete:${clientKey(req)}`,
    limit: 20,
    windowMs: 60_000,
  });

  if (!rl.ok) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  await prisma.person.delete({
    where: { id },
  });

  return NextResponse.json({ success: true });
}

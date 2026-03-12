import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit, clientKey } from "@/lib/rateLimit";
import { readJson } from "@/lib/body";

async function getMeAndGraph(req?: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return { ok: false as const, res: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }) };
  }

  const me = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!me) {
    return { ok: false as const, res: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }) };
  }

  const membership = await prisma.membership.findFirst({
    where: { userId: me.id },
    orderBy: { createdAt: "asc" },
    select: { familyGraphId: true, role: true },
  });

  if (!membership) {
    return { ok: false as const, res: NextResponse.json({ error: "NO_MEMBERSHIP" }, { status: 403 }) };
  }

  return { ok: true as const, me, membership };
}

//
// GET /api/people
// Returns list of visible people in the current user's family graph
//
export async function GET(req: Request) {
  const ctx = await getMeAndGraph(req);
  if (!ctx.ok) return ctx.res;

  const { me, membership } = ctx;

  const people = await prisma.person.findMany({
    where: {
      familyGraphId: membership.familyGraphId,
      deletedAt: null,
      OR: [
        { isPrivate: false },
        { createdById: me.id },
        ...(me.role === "ADMIN" ? [{}] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fullName: true,
      createdAt: true,
      isPrivate: true,
    },
  });

  return NextResponse.json({ people });
}

//
// POST /api/people
// Create a new person inside the current user's family graph
//
export async function POST(req: Request) {
  const ctx = await getMeAndGraph(req);
  if (!ctx.ok) return ctx.res;

  const { me, membership } = ctx;

  // Rate limit: 30 creates per minute per IP
  const rl = rateLimit({
    key: `people:post:${clientKey(req)}`,
    limit: 30,
    windowMs: 60_000,
  });

  if (!rl.ok) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  // Body size guard
  const parsed = await readJson(req);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const body = parsed.json;

  if (!body?.fullName || typeof body.fullName !== "string") {
    return NextResponse.json({ error: "INVALID_FULL_NAME" }, { status: 400 });
  }

  const person = await prisma.person.create({
    data: {
      fullName: body.fullName.trim(),
      isPrivate: Boolean(body.isPrivate),
      createdById: me.id,
      familyGraphId: membership.familyGraphId,
    },
    select: {
      id: true,
      fullName: true,
      createdAt: true,
      isPrivate: true,
    },
  });

  return NextResponse.json({ person });
}
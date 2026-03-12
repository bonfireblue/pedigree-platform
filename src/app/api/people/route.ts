import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireMe } from "@/lib/authz";
import { rateLimit, clientKey } from "@/lib/rateLimit";
import { readJson } from "@/lib/body";

function normalizeFullName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 120) return null;
  return trimmed;
}

async function getOrCreatePrimaryMembership(userId: string) {
  const existing = await prisma.membership.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      familyGraphId: true,
      role: true,
    },
  });

  if (existing) return existing;

  const created = await prisma.$transaction(async (tx) => {
    const graph = await tx.familyGraph.create({
      data: {
        name: "My Family Graph",
        createdById: userId,
      },
      select: { id: true },
    });

    const membership = await tx.membership.create({
      data: {
        userId,
        familyGraphId: graph.id,
        role: "FOUNDER",
      },
      select: {
        familyGraphId: true,
        role: true,
      },
    });

    return membership;
  });

  return created;
}

export async function GET(req: Request) {
  try {
    const lim = rateLimit({
      key: `people_get:${clientKey(req)}`,
      limit: 120,
      windowMs: 60_000,
    });

    if (!lim.ok) {
      return NextResponse.json({ error: "RATE_LIMIT" }, { status: 429 });
    }

    const me = await requireMe();
    if (!me) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const membership = await prisma.membership.findFirst({
      where: { userId: me.id },
      orderBy: { createdAt: "asc" },
      select: {
        familyGraphId: true,
        role: true,
      },
    });

    // Important UX change:
    // A brand new user should see an empty list, not a hard error.
    if (!membership) {
      return NextResponse.json({
        people: [],
        familyGraphId: null,
        role: null,
      });
    }

    const people = await prisma.person.findMany({
      where: {
        familyGraphId: membership.familyGraphId,
        deletedAt: null,
      },
      orderBy: [{ createdAt: "asc" }],
      select: {
        id: true,
        fullName: true,
        createdAt: true,
        isPrivate: true,
        claimedByUserId: true,
      },
    });

    return NextResponse.json({
      people: people.map((p) => ({
        id: p.id,
        fullName: p.fullName,
        createdAt: p.createdAt.toISOString(),
        isPrivate: p.isPrivate,
        claimedByUserId: p.claimedByUserId,
      })),
      familyGraphId: membership.familyGraphId,
      role: membership.role,
    });
  } catch (error) {
    console.error("GET /api/people failed", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const lim = rateLimit({
      key: `people_post:${clientKey(req)}`,
      limit: 60,
      windowMs: 60_000,
    });

    if (!lim.ok) {
      return NextResponse.json({ error: "RATE_LIMIT" }, { status: 429 });
    }

    const me = await requireMe();
    if (!me) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const parsed = await readJson(req, 50_000);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const fullName = normalizeFullName(parsed.json?.fullName);
    const isPrivate = typeof parsed.json?.isPrivate === "boolean" ? parsed.json.isPrivate : false;

    if (!fullName) {
      return NextResponse.json({ error: "INVALID_FULL_NAME" }, { status: 400 });
    }

    // Important UX change:
    // If the user has no graph yet, bootstrap one automatically.
    const membership = await getOrCreatePrimaryMembership(me.id);

    const person = await prisma.person.create({
      data: {
        fullName,
        isPrivate,
        createdById: me.id,
        familyGraphId: membership.familyGraphId,
      },
      select: {
        id: true,
        fullName: true,
        createdAt: true,
        isPrivate: true,
        claimedByUserId: true,
        familyGraphId: true,
      },
    });

    return NextResponse.json(
      {
        person: {
          id: person.id,
          fullName: person.fullName,
          createdAt: person.createdAt.toISOString(),
          isPrivate: person.isPrivate,
          claimedByUserId: person.claimedByUserId,
          familyGraphId: person.familyGraphId,
        },
        bootstrappedGraph: membership.role === "FOUNDER",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/people failed", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
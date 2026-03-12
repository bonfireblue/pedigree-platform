import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, clientKey } from "@/lib/rateLimit";
import { readJson } from "@/lib/body";
import { requireMe } from "@/lib/authz";
import {
  PersonError,
  buildPersonPatch,
  canEditPerson,
  canViewPerson,
} from "@/lib/personRules";

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
  claimedByUserId: string | null;
  familyGraphId: string;
  deletedAt: Date | null;
  deletedByUserId: string | null;
  purgeAfter: Date | null;
};

type ParentRelRow = { parent: PersonRow };
type ChildRelRow = { child: PersonRow };
type SpouseARow = { b: PersonRow };
type SpouseBRow = { a: PersonRow };

function slim(p: PersonRow) {
  return {
    id: p.id,
    fullName: p.fullName,
    createdAt: p.createdAt.toISOString(),
    isPrivate: p.isPrivate,
    claimedByUserId: p.claimedByUserId,
  };
}

async function getMembershipOr403(userId: string, familyGraphId: string) {
  return prisma.membership.findUnique({
    where: {
      userId_familyGraphId: {
        userId,
        familyGraphId,
      },
    },
    select: { role: true },
  });
}

function add7Days(date: Date) {
  return new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000);
}

function normalizeMode(value: unknown): "soft" | "restore" | "now" {
  if (value === "restore") return "restore";
  if (value === "now") return "now";
  return "soft";
}

async function permanentlyDeletePerson(personId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.parentChild.deleteMany({
      where: {
        OR: [{ parentId: personId }, { childId: personId }],
      },
    });

    await tx.spouse.deleteMany({
      where: {
        OR: [{ aId: personId }, { bId: personId }],
      },
    });

    await tx.invitation.deleteMany({
      where: { targetPersonId: personId },
    });

    await tx.person.delete({
      where: { id: personId },
    });
  });
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
      parents: {
        include: {
          parent: true,
        },
      },
      children: {
        include: {
          child: true,
        },
      },
      spousesA: {
        include: {
          b: true,
        },
      },
      spousesB: {
        include: {
          a: true,
        },
      },
    },
  });

  if (!found || found.deletedAt) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const person = found as unknown as PersonRow & {
    parents: ParentRelRow[];
    children: ChildRelRow[];
    spousesA: SpouseARow[];
    spousesB: SpouseBRow[];
  };

  const membership = await getMembershipOr403(me.id, person.familyGraphId);
  if (!membership) return NextResponse.json({ error: "NO_MEMBERSHIP" }, { status: 403 });

  if (!canViewPerson(me.id, me.isAdmin, membership.role, person)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const parents = person.parents
    .map((row) => row.parent)
    .filter((p) => !p.deletedAt)
    .filter((p) => canViewPerson(me.id, me.isAdmin, membership.role, p))
    .map(slim);

  const children = person.children
    .map((row) => row.child)
    .filter((p) => !p.deletedAt)
    .filter((p) => canViewPerson(me.id, me.isAdmin, membership.role, p))
    .map(slim);

  const spouses = [...person.spousesA.map((row) => row.b), ...person.spousesB.map((row) => row.a)]
    .filter((p) => !p.deletedAt)
    .filter((p) => canViewPerson(me.id, me.isAdmin, membership.role, p))
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
      createdAt: person.createdAt.toISOString(),
      claimedByUserId: person.claimedByUserId,
      deletedAt: person.deletedAt ? person.deletedAt.toISOString() : null,
      purgeAfter: person.purgeAfter ? person.purgeAfter.toISOString() : null,
    },
    parents,
    children,
    spouses,
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const lim = rateLimit({ key: `people_patch:${clientKey(req)}`, limit: 60, windowMs: 60_000 });
  if (!lim.ok) return NextResponse.json({ error: "RATE_LIMIT" }, { status: 429 });

  try {
    const me = await requireMe();
    if (!me) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const { id } = await ctx.params;

    const parsed = await readJson(req, 50_000);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const existing = await prisma.person.findUnique({
      where: { id },
      select: {
        id: true,
        createdById: true,
        claimedByUserId: true,
        familyGraphId: true,
        deletedAt: true,
      },
    });

    if (!existing || existing.deletedAt) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const membership = await getMembershipOr403(me.id, existing.familyGraphId);
    if (!membership) return NextResponse.json({ error: "NO_MEMBERSHIP" }, { status: 403 });

    if (!canEditPerson(me.id, membership.role, existing)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const data = buildPersonPatch(parsed.json);

    const updated = await prisma.person.update({
      where: { id },
      data,
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
        createdAt: updated.createdAt.toISOString(),
        claimedByUserId: updated.claimedByUserId,
        deletedAt: updated.deletedAt ? updated.deletedAt.toISOString() : null,
        purgeAfter: updated.purgeAfter ? updated.purgeAfter.toISOString() : null,
      },
    });
  } catch (error) {
    if (error instanceof PersonError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }

    console.error("PATCH /api/people/[id] failed", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const lim = rateLimit({ key: `people_delete:${clientKey(req)}`, limit: 60, windowMs: 60_000 });
  if (!lim.ok) return NextResponse.json({ error: "RATE_LIMIT" }, { status: 429 });

  try {
    const me = await requireMe();
    if (!me) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const { id } = await ctx.params;

    const parsed = await readJson(req, 20_000);
    const body = parsed.ok ? parsed.json : {};
    const mode = normalizeMode(body?.mode);

    const existing = await prisma.person.findUnique({
      where: { id },
      select: {
        id: true,
        fullName: true,
        createdById: true,
        claimedByUserId: true,
        familyGraphId: true,
        deletedAt: true,
        purgeAfter: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const membership = await getMembershipOr403(me.id, existing.familyGraphId);
    if (!membership) return NextResponse.json({ error: "NO_MEMBERSHIP" }, { status: 403 });

    if (!canEditPerson(me.id, membership.role, existing)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    if (existing.claimedByUserId) {
      return NextResponse.json({ error: "PERSON_DELETE_CLAIMED_FORBIDDEN" }, { status: 400 });
    }

    if (mode === "restore") {
      if (!existing.deletedAt) {
        return NextResponse.json({ error: "PERSON_NOT_SOFT_DELETED" }, { status: 400 });
      }

      const restored = await prisma.person.update({
        where: { id: existing.id },
        data: {
          deletedAt: null,
          deletedByUserId: null,
          purgeAfter: null,
        },
      });

      return NextResponse.json({
        restored: true,
        personId: restored.id,
      });
    }

    if (mode === "now") {
      await permanentlyDeletePerson(existing.id);

      return NextResponse.json({
        deleted: true,
        mode: "now",
        personId: existing.id,
      });
    }

    if (existing.deletedAt) {
      return NextResponse.json({
        alreadyDeleted: true,
        mode: "soft",
        personId: existing.id,
        deletedAt: existing.deletedAt.toISOString(),
        purgeAfter: existing.purgeAfter ? existing.purgeAfter.toISOString() : null,
      });
    }

    const now = new Date();
    const purgeAfter = add7Days(now);

    await prisma.$transaction(async (tx) => {
  await tx.invitation.updateMany({
    where: {
      targetPersonId: existing.id,
      status: "PENDING",
    },
    data: {
      status: "REVOKED",
    },
  });

  await tx.parentChild.deleteMany({
    where: {
      OR: [{ parentId: existing.id }, { childId: existing.id }],
    },
  });

  await tx.spouse.deleteMany({
    where: {
      OR: [{ aId: existing.id }, { bId: existing.id }],
    },
  });

  await tx.person.update({
    where: { id: existing.id },
    data: {
      deletedAt: now,
      deletedByUserId: me.id,
      purgeAfter,
    },
  });
});

    return NextResponse.json({
      deleted: true,
      mode: "soft",
      personId: existing.id,
      deletedAt: now.toISOString(),
      purgeAfter: purgeAfter.toISOString(),
    });
  } catch (error) {
    if (error instanceof PersonError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }

    console.error("DELETE /api/people/[id] failed", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
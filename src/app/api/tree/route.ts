import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireMe } from "@/lib/authz";
import { rateLimit, clientKey } from "@/lib/rateLimit";

type NodeRow = {
  id: string;
  fullName: string;
  isPrivate: boolean;
  createdById: string;
  createdAt: Date;
  bio: string | null;
  location: string | null;
  birthDate: Date | null;
  deathDate: Date | null;
  photoUrl: string | null;
  claimedByUserId: string | null;
  familyGraphId: string;
};

type ParentChildEdge = { parentId: string; childId: string };
type SpouseEdge = { aId: string; bId: string };

type GraphRole = "FOUNDER" | "ADMIN" | "TRUSTED" | "MEMBER";
type DiscoverKind = "blood" | "spouse";

function canViewNode(params: {
  meId: string;
  isAdmin: boolean;
  membershipRole: GraphRole;
  row: {
    isPrivate: boolean;
    createdById: string;
    claimedByUserId: string | null;
  };
}) {
  const { meId, isAdmin, membershipRole, row } = params;

  if (!row.isPrivate) return true;
  if (isAdmin) return true;
  if (row.createdById === meId) return true;
  if (row.claimedByUserId === meId) return true;

  if (
    membershipRole === "FOUNDER" ||
    membershipRole === "ADMIN" ||
    membershipRole === "TRUSTED"
  ) {
    return true;
  }

  return false;
}

function dedupe<T extends string>(items: T[]) {
  return Array.from(new Set(items));
}

export async function GET(req: Request) {
  try {
    const lim = rateLimit({
      key: `tree:${clientKey(req)}`,
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

    const { searchParams } = new URL(req.url);

    const centerId = (searchParams.get("centerId") || "").trim();
    const depth = Math.max(1, Math.min(4, Number(searchParams.get("depth") || "2")));
    const limit = Math.max(50, Math.min(1500, Number(searchParams.get("limit") || "800")));

    if (!centerId) {
      return NextResponse.json({ error: "MISSING_CENTER_ID" }, { status: 400 });
    }

    const center = (await prisma.person.findFirst({
        where: { id: centerId, deletedAt: null },
      select: {
        id: true,
        fullName: true,
        isPrivate: true,
        createdById: true,
        createdAt: true,
        bio: true,
        location: true,
        birthDate: true,
        deathDate: true,
        photoUrl: true,
        claimedByUserId: true,
        familyGraphId: true,
      },
    })) as NodeRow | null;

    if (!center) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const membership = await prisma.membership.findUnique({
      where: {
        userId_familyGraphId: {
          userId: me.id,
          familyGraphId: center.familyGraphId,
        },
      },
      select: {
        id: true,
        role: true,
        familyGraphId: true,
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const membershipRole = membership.role as GraphRole;

    if (
      !canViewNode({
        meId: me.id,
        isAdmin: me.isAdmin,
        membershipRole,
        row: center,
      })
    ) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const familyGraphId = center.familyGraphId;

    const visited = new Set<string>();
    const frontier: string[] = [centerId];
    const kindById = new Map<string, DiscoverKind>();

    visited.add(centerId);
    kindById.set(centerId, "blood");

    for (let d = 0; d < depth; d++) {
      if (visited.size >= limit) break;

      const batch = frontier.splice(0, frontier.length);
      if (batch.length === 0) break;

      const bloodBatch = batch.filter((id) => kindById.get(id) !== "spouse");

      let parentRows: Array<{ parentId: string }> = [];
      let childRows: Array<{ childId: string }> = [];

      if (bloodBatch.length > 0) {
        parentRows = await prisma.parentChild.findMany({
          where: { childId: { in: bloodBatch } },
          select: { parentId: true },
        });

        childRows = await prisma.parentChild.findMany({
          where: { parentId: { in: bloodBatch } },
          select: { childId: true },
        });
      }

      const spouseRowsA = await prisma.spouse.findMany({
        where: { aId: { in: batch } },
        select: { bId: true },
      });

      const spouseRowsB = await prisma.spouse.findMany({
        where: { bId: { in: batch } },
        select: { aId: true },
      });

      const bloodCandidateIds = dedupe([
        ...parentRows.map((r) => r.parentId),
        ...childRows.map((r) => r.childId),
      ]);

      const spouseCandidateIds = dedupe([
        ...spouseRowsA.map((r) => r.bId),
        ...spouseRowsB.map((r) => r.aId),
      ]);

      const candidateIds = dedupe([...bloodCandidateIds, ...spouseCandidateIds]).filter(
        (id) => !visited.has(id)
      );

      if (candidateIds.length === 0) continue;

      const remaining = Math.max(0, limit - visited.size);
      const cappedCandidateIds = candidateIds.slice(0, remaining);

      const candidateRows = (await prisma.person.findMany({
  where: {
    id: { in: cappedCandidateIds },
    familyGraphId,
    deletedAt: null,
  },
        select: {
          id: true,
          fullName: true,
          isPrivate: true,
          createdById: true,
          createdAt: true,
          bio: true,
          location: true,
          birthDate: true,
          deathDate: true,
          photoUrl: true,
          claimedByUserId: true,
          familyGraphId: true,
        },
      })) as NodeRow[];

      for (const row of candidateRows) {
        if (visited.size >= limit) break;
        if (visited.has(row.id)) continue;

        const visible = canViewNode({
          meId: me.id,
          isAdmin: me.isAdmin,
          membershipRole,
          row,
        });

        // Critical privacy behavior:
        // If the node is hidden, do NOT add it to visited/frontier.
        // That prevents hidden people from leaking through traversal.
        if (!visible) continue;

        const discoveredViaBlood = bloodCandidateIds.includes(row.id);
        const prev = kindById.get(row.id);

        const discoveredAs: DiscoverKind =
          prev === "blood" || discoveredViaBlood ? "blood" : "spouse";

        visited.add(row.id);
        kindById.set(row.id, discoveredAs);
        frontier.push(row.id);
      }
    }

    const nodesAll = (await prisma.person.findMany({
  where: {
    id: { in: Array.from(visited) },
    familyGraphId,
    deletedAt: null,
  },
      select: {
        id: true,
        fullName: true,
        isPrivate: true,
        createdById: true,
        createdAt: true,
        bio: true,
        location: true,
        birthDate: true,
        deathDate: true,
        photoUrl: true,
        claimedByUserId: true,
        familyGraphId: true,
      },
    })) as NodeRow[];

    const nodes = nodesAll.filter((row) =>
      canViewNode({
        meId: me.id,
        isAdmin: me.isAdmin,
        membershipRole,
        row,
      })
    );

    const visibleIds = new Set(nodes.map((n) => n.id));
    const visibleIdList = Array.from(visibleIds);

    const parentChildEdges = (await prisma.parentChild.findMany({
      where: {
        parentId: { in: visibleIdList },
        childId: { in: visibleIdList },
      },
      select: {
        parentId: true,
        childId: true,
      },
    })) as ParentChildEdge[];

    const spouseEdges = (await prisma.spouse.findMany({
      where: {
        aId: { in: visibleIdList },
        bId: { in: visibleIdList },
      },
      select: {
        aId: true,
        bId: true,
      },
    })) as SpouseEdge[];

    return NextResponse.json({
      centerId,
      depth,
      limit,
      nodes: nodes.map((n) => ({
        id: n.id,
        fullName: n.fullName,
        isPrivate: n.isPrivate,
        createdAt: n.createdAt.toISOString(),
        bio: n.bio,
        location: n.location,
        birthDate: n.birthDate ? n.birthDate.toISOString() : null,
        deathDate: n.deathDate ? n.deathDate.toISOString() : null,
        photoUrl: n.photoUrl,
        claimedByUserId: n.claimedByUserId,
      })),
      edges: {
        parentChild: parentChildEdges,
        spouse: spouseEdges,
      },
    });
  } catch (error) {
    console.error("GET /api/tree failed", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
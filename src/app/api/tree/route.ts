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
};

type ParentChildEdge = {
  parentId: string;
  childId: string;
};

type SpouseEdge = {
  aId: string;
  bId: string;
};

function canView(meId: string, p: { isPrivate: boolean; createdById: string }) {
  if (!p.isPrivate) return true;
  return p.createdById === meId;
}

export async function GET(req: Request) {
  const lim = rateLimit({ key: `tree:${clientKey(req)}`, limit: 120, windowMs: 60_000 });
  if (!lim.ok) return NextResponse.json({ error: "RATE_LIMIT" }, { status: 429 });

  const me = await requireMe();
  if (!me) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { searchParams } = new URL(req.url);

  const centerId = searchParams.get("centerId") || "";
  const depth = Math.max(1, Math.min(4, Number(searchParams.get("depth") || "2")));
  const limit = Math.max(50, Math.min(1000, Number(searchParams.get("limit") || "300")));

  if (!centerId) return NextResponse.json({ error: "MISSING_CENTER_ID" }, { status: 400 });

  // 1) Load center
  const center = (await prisma.person.findUnique({ where: { id: centerId } })) as unknown as NodeRow | null;
  if (!center) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!canView(me.id, center)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  // 2) BFS on ids using parent-child edges (both directions)
  const visited = new Set<string>();
  const frontier: string[] = [centerId];
  visited.add(centerId);

  for (let d = 0; d < depth; d++) {
    if (visited.size >= limit) break;

    const batch = frontier.splice(0, frontier.length);
    if (batch.length === 0) break;

    // parents of batch
    const parents = await prisma.parentChild.findMany({
      where: { childId: { in: batch } },
      select: { parentId: true }
    });

    // children of batch
    const children = await prisma.parentChild.findMany({
      where: { parentId: { in: batch } },
      select: { childId: true }
    });

    const nextIds: string[] = [];

    for (const e of parents as unknown as { parentId: string }[]) {
      if (visited.size >= limit) break;
      if (!visited.has(e.parentId)) {
        visited.add(e.parentId);
        nextIds.push(e.parentId);
      }
    }

    for (const e of children as unknown as { childId: string }[]) {
      if (visited.size >= limit) break;
      if (!visited.has(e.childId)) {
        visited.add(e.childId);
        nextIds.push(e.childId);
      }
    }

    // spouses of batch (both sides)
    const spousesA = await prisma.spouse.findMany({
      where: { aId: { in: batch } },
      select: { bId: true }
    });
    const spousesB = await prisma.spouse.findMany({
      where: { bId: { in: batch } },
      select: { aId: true }
    });

    for (const s of spousesA as unknown as { bId: string }[]) {
      if (visited.size >= limit) break;
      if (!visited.has(s.bId)) {
        visited.add(s.bId);
        nextIds.push(s.bId);
      }
    }

    for (const s of spousesB as unknown as { aId: string }[]) {
      if (visited.size >= limit) break;
      if (!visited.has(s.aId)) {
        visited.add(s.aId);
        nextIds.push(s.aId);
      }
    }

    frontier.push(...nextIds);
  }

  // 3) Load people for visited ids and apply privacy filter
  const nodesAll = (await prisma.person.findMany({
    where: { id: { in: Array.from(visited) } },
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
      photoUrl: true
    }
  })) as unknown as NodeRow[];

  const nodes = nodesAll.filter((n: NodeRow) => canView(me.id, n));

  const visibleIds = new Set<string>(nodes.map((n: NodeRow) => n.id));

  // 4) Load edges among visible nodes
  const parentChildEdges = (await prisma.parentChild.findMany({
    where: {
      OR: [
        { parentId: { in: Array.from(visibleIds) } },
        { childId: { in: Array.from(visibleIds) } }
      ]
    },
    select: { parentId: true, childId: true }
  })) as unknown as ParentChildEdge[];

  const spouseEdges = (await prisma.spouse.findMany({
    where: {
      OR: [
        { aId: { in: Array.from(visibleIds) } },
        { bId: { in: Array.from(visibleIds) } }
      ]
    },
    select: { aId: true, bId: true }
  })) as unknown as SpouseEdge[];

  const pc = parentChildEdges.filter(
    (e: ParentChildEdge) => visibleIds.has(e.parentId) && visibleIds.has(e.childId)
  );
  const sp = spouseEdges.filter((e: SpouseEdge) => visibleIds.has(e.aId) && visibleIds.has(e.bId));

  return NextResponse.json({
    centerId,
    depth,
    nodes: nodes.map((n: NodeRow) => ({
      id: n.id,
      fullName: n.fullName,
      isPrivate: n.isPrivate,
      createdAt: n.createdAt.toISOString(),
      bio: n.bio,
      location: n.location,
      birthDate: n.birthDate ? n.birthDate.toISOString() : null,
      deathDate: n.deathDate ? n.deathDate.toISOString() : null,
      photoUrl: n.photoUrl
    })),
    edges: {
      parentChild: pc,
      spouse: sp
    }
  });
}

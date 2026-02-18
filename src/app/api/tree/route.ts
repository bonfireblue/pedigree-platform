import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireMe } from "@/lib/authz";

type NodeRow = {
  id: string;
  fullName: string;
  isPrivate: boolean;
  createdById: string;
  createdAt: Date;
};

type ParentChildEdge = { parentId: string; childId: string };
type SpouseEdge = { aId: string; bId: string };

function intParam(url: URL, key: string, def: number) {
  const v = url.searchParams.get(key);
  const n = v ? Number(v) : def;
  if (!Number.isFinite(n)) return def;
  return Math.max(0, Math.min(5, Math.floor(n))); // hard cap 0..5
}

export async function GET(req: Request) {
  const me = await requireMe();
  if (!me) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const url = new URL(req.url);
  const centerId = (url.searchParams.get("centerId") ?? "").trim();
  const up = intParam(url, "up", 2);
  const down = intParam(url, "down", 2);

  if (!centerId) return NextResponse.json({ error: "VALIDATION_ERROR", field: "centerId" }, { status: 400 });

  // Privacy filter:
  // - Admin can see all
  // - Non-admin can see public OR their own
  const visibilitySQL = me.isAdmin
    ? prisma.$queryRaw`SELECT 1` // placeholder (unused)
    : prisma.$queryRaw`SELECT 1`; // placeholder (unused)

  // 1) Get ancestor IDs (up)
  const ancestors = await prisma.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE anc(id, depth) AS (
      SELECT ${centerId}::uuid AS id, 0 AS depth
      UNION ALL
      SELECT pc."parentId"::uuid AS id, anc.depth + 1
      FROM "ParentChild" pc
      JOIN anc ON pc."childId"::uuid = anc.id
      WHERE anc.depth < ${up}
    )
    SELECT DISTINCT id::text AS id FROM anc;
  `;

  // 2) Get descendant IDs (down)
  const descendants = await prisma.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE des(id, depth) AS (
      SELECT ${centerId}::uuid AS id, 0 AS depth
      UNION ALL
      SELECT pc."childId"::uuid AS id, des.depth + 1
      FROM "ParentChild" pc
      JOIN des ON pc."parentId"::uuid = des.id
      WHERE des.depth < ${down}
    )
    SELECT DISTINCT id::text AS id FROM des;
  `;

  // Merge IDs (include center)
  const idSet = new Set<string>();
  for (const r of ancestors) idSet.add(r.id);
  for (const r of descendants) idSet.add(r.id);
  idSet.add(centerId);

  // Safety cap to avoid exploding responses in MVP
  const MAX_NODES = 500;
  const ids = Array.from(idSet).slice(0, MAX_NODES);

  // 3) Load nodes with privacy enforcement
  const nodes = await prisma.person.findMany({
    where: me.isAdmin
      ? { id: { in: ids } }
      : {
          id: { in: ids },
          OR: [{ createdById: me.id }, { isPrivate: false }],
        },
    select: {
      id: true,
      fullName: true,
      isPrivate: true,
      createdById: true,
      createdAt: true,
    },
  });

  const visibleIds = new Set(nodes.map((n) => n.id));

  // 4) Load edges among visible nodes
  const parentChildEdges = await prisma.parentChild.findMany({
    where: {
      parentId: { in: Array.from(visibleIds) },
      childId: { in: Array.from(visibleIds) },
    },
    select: { parentId: true, childId: true },
    take: 2000,
  });

  const spouseEdges = await prisma.spouse.findMany({
    where: {
      OR: [
        { aId: { in: Array.from(visibleIds) }, bId: { in: Array.from(visibleIds) } },
        { bId: { in: Array.from(visibleIds) }, aId: { in: Array.from(visibleIds) } },
      ],
    },
    select: { aId: true, bId: true },
    take: 2000,
  });

  return NextResponse.json({
    centerId,
    up,
    down,
    nodes,
    edges: {
      parentChild: parentChildEdges as ParentChildEdge[],
      spouses: spouseEdges as SpouseEdge[],
    },
    meta: {
      nodeCount: nodes.length,
      truncated: ids.length >= MAX_NODES,
    },
  });
}

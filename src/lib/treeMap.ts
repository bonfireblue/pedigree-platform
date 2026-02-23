type Person = {
  id: string;
  fullName: string;
  createdAt: string;
  isPrivate: boolean;
};

export type PersonGraph = {
  person: Person & {
    bio?: string | null;
    location?: string | null;
    birthDate?: string | null;
    deathDate?: string | null;
    photoUrl?: string | null;
  };
  parents: Person[];
  children: Person[];
  spouses: Person[];
};

type TreeApiNode = {
  id: string;
  fullName?: string;
  isPrivate?: boolean;
  createdAt?: string;
  bio?: string | null;
  location?: string | null;
  birthDate?: string | null;
  deathDate?: string | null;
  photoUrl?: string | null;
};

type TreeApiEdgePC = { parentId: string; childId: string };
type TreeApiEdgeSp = { aId: string; bId: string };

function safePerson(n: TreeApiNode): PersonGraph["person"] {
  return {
    id: n.id,
    fullName: n.fullName ?? "Unnamed",
    isPrivate: n.isPrivate ?? false,
    createdAt: n.createdAt ?? new Date().toISOString(),
    bio: n.bio ?? null,
    location: n.location ?? null,
    birthDate: n.birthDate ?? null,
    deathDate: n.deathDate ?? null,
    photoUrl: n.photoUrl ?? null
  };
}

function pick(map: Map<string, TreeApiNode>, ids: string[]): Person[] {
  const out: Person[] = [];
  for (const id of ids) {
    const n = map.get(id);
    if (!n) continue;
    out.push({
      id: n.id,
      fullName: n.fullName ?? "Unnamed",
      isPrivate: n.isPrivate ?? false,
      createdAt: n.createdAt ?? new Date().toISOString()
    });
  }
  return out;
}

// Converts /api/tree response {centerId,nodes,edges} into PersonGraph {person,parents,children,spouses}
export function toPersonGraph(raw: any): PersonGraph {
  // If it already matches PersonGraph, return it.
  if (raw?.person && raw?.parents && raw?.children && raw?.spouses) {
    return raw as PersonGraph;
  }

  const centerId: string | undefined = raw?.centerId;
  const nodes: TreeApiNode[] = Array.isArray(raw?.nodes) ? raw.nodes : [];
  const pc: TreeApiEdgePC[] = Array.isArray(raw?.edges?.parentChild) ? raw.edges.parentChild : [];
  const sp: TreeApiEdgeSp[] = Array.isArray(raw?.edges?.spouse) ? raw.edges.spouse : [];

  if (!centerId) throw new Error("TREE_MAP_MISSING_CENTER_ID");

  const map = new Map<string, TreeApiNode>();
  for (const n of nodes) {
    if (n?.id) map.set(n.id, n);
  }

  const centerNode = map.get(centerId);
  if (!centerNode) throw new Error("TREE_MAP_CENTER_NODE_NOT_FOUND");

  const parentIds = pc.filter((e) => e.childId === centerId).map((e) => e.parentId);
  const childIds = pc.filter((e) => e.parentId === centerId).map((e) => e.childId);

  const spouseIds = sp
    .filter((e) => e.aId === centerId || e.bId === centerId)
    .map((e) => (e.aId === centerId ? e.bId : e.aId));

  return {
    person: safePerson(centerNode),
    parents: pick(map, parentIds),
    children: pick(map, childIds),
    spouses: pick(map, spouseIds)
  };
}
type Node = { id: string; fullName: string; isPrivate?: boolean };
type ParentChild = { parentId: string; childId: string };
type Spouse = { aId: string; bId: string };

export type Subgraph = {
  centerId: string;
  nodes: Node[];
  edges: { parentChild: ParentChild[]; spouses: Spouse[] };
};

export type PersonGraph = {
  person: Node;
  parents: Node[];
  children: Node[];
  spouses: Node[];
};

// For the current TreeView, we show only the immediate neighborhood of centerId.
// The subgraph still contains multi-generation nodes; we just pick direct edges.
export function toPersonGraph(sub: Subgraph): PersonGraph | null {
  const byId = new Map(sub.nodes.map((n) => [n.id, n]));
  const center = byId.get(sub.centerId);
  if (!center) return null;

  const parents: Node[] = [];
  const children: Node[] = [];

  for (const e of sub.edges.parentChild) {
    if (e.childId === sub.centerId) {
      const p = byId.get(e.parentId);
      if (p) parents.push(p);
    }
    if (e.parentId === sub.centerId) {
      const c = byId.get(e.childId);
      if (c) children.push(c);
    }
  }

  const spouses: Node[] = [];
  for (const e of sub.edges.spouses) {
    if (e.aId === sub.centerId) {
      const s = byId.get(e.bId);
      if (s) spouses.push(s);
    } else if (e.bId === sub.centerId) {
      const s = byId.get(e.aId);
      if (s) spouses.push(s);
    }
  }

  // De-dupe just in case
  const dedupe = (arr: Node[]) => Array.from(new Map(arr.map((x) => [x.id, x])).values());

  return {
    person: center,
    parents: dedupe(parents),
    children: dedupe(children),
    spouses: dedupe(spouses),
  };
}

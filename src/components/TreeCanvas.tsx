"use client";
import { useRef, useState, useEffect, useCallback } from "react";

const NODE_W = 240;
const NODE_H = 74;
const H_GAP = 60;
const V_GAP = 100;

type Viewport = { k: number; tx: number; ty: number };

interface TreeNode {
  id: string;
  fullName?: string;
  photoUrl?: string | null;
  birthDate?: string | null;
  deathDate?: string | null;
  grewUpLocation?: string | null;
  occupation?: string | null;
  proudOf?: string | null;
  interests?: string | null;
  claimedByUserId?: string | null;
  isPrivate?: boolean;
}

interface Edge {
  from: string;
  to: string;
  type: string;
}

interface Props {
  data: {
    centerId: string;
    nodes: TreeNode[];
    edges: Edge[];
  };
  selectedId?: string | null;
  focusKey?: number;
  onSelect?: (id: string) => void;
}

export default function TreeCanvas({ data, selectedId, focusKey, onSelect }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [vp, setVp] = useState<Viewport>({ k: 1, tx: 0, ty: 0 });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const personById = new Map(data.nodes.map((n) => [n.id, n]));

  // Build adjacency lists
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  const spouses = new Map<string, string[]>();

  for (const e of data.edges) {
    if (e.type === "parent") {
      if (!children.has(e.from)) children.set(e.from, []);
      children.get(e.from)!.push(e.to);
      if (!parents.has(e.to)) parents.set(e.to, []);
      parents.get(e.to)!.push(e.from);
    } else if (e.type === "spouse") {
      if (!spouses.has(e.from)) spouses.set(e.from, []);
      if (!spouses.has(e.to)) spouses.set(e.to, []);
      spouses.get(e.from)!.push(e.to);
      spouses.get(e.to)!.push(e.from);
    }
  }

  // Build layout - position nodes in a tree structure
  const layout = new Map<string, { x: number; y: number }>();
  const placed = new Set<string>();

  function placeNode(id: string, x: number, y: number) {
    if (placed.has(id)) return;
    placed.add(id);
    layout.set(id, { x, y });
  }

  // Place center person
  const centerId = data.centerId;
  placeNode(centerId, 0, 0);

  // Place parents above
  const centerParents = parents.get(centerId) || [];
  centerParents.forEach((pid, i) => {
    const px = (i - (centerParents.length - 1) / 2) * (NODE_W + H_GAP);
    placeNode(pid, px, -V_GAP - NODE_H);
  });

  // Place grandparents
  centerParents.forEach((pid, pi) => {
    const parentPos = layout.get(pid);
    if (!parentPos) return;
    const grandparents = parents.get(pid) || [];
    grandparents.forEach((gpid, gi) => {
      const gpx = parentPos.x + (gi - (grandparents.length - 1) / 2) * (NODE_W / 2 + H_GAP / 2);
      placeNode(gpid, gpx, parentPos.y - V_GAP - NODE_H);
    });
  });

  // Place spouses to the right of center
  const centerSpouses = spouses.get(centerId) || [];
  centerSpouses.forEach((sid, i) => {
    placeNode(sid, (i + 1) * (NODE_W + H_GAP / 2), 0);
  });

  // Place children below
  const centerChildren = children.get(centerId) || [];
  centerChildren.forEach((cid, i) => {
    const cx = (i - (centerChildren.length - 1) / 2) * (NODE_W + H_GAP);
    placeNode(cid, cx, V_GAP + NODE_H);
  });

  // Place siblings (other children of parents)
  let siblingOffset = 1;
  centerParents.forEach((pid) => {
    const siblings = (children.get(pid) || []).filter((c) => c !== centerId && !placed.has(c));
    siblings.forEach((sid) => {
      placeNode(sid, siblingOffset * (NODE_W + H_GAP), 0);
      siblingOffset++;
    });
  });

  // Build edges for rendering
  const lines: { x1: number; y1: number; x2: number; y2: number; type: string }[] = [];
  for (const e of data.edges) {
    const fromPos = layout.get(e.from);
    const toPos = layout.get(e.to);
    if (fromPos && toPos) {
      lines.push({
        x1: fromPos.x,
        y1: fromPos.y + NODE_H / 2,
        x2: toPos.x,
        y2: toPos.y + NODE_H / 2,
        type: e.type,
      });
    }
  }

  // Focus on selected node
  useEffect(() => {
    if (focusKey && selectedId && layout.has(selectedId)) {
      const pos = layout.get(selectedId)!;
      setVp({ k: 1, tx: -pos.x, ty: -pos.y });
    }
  }, [focusKey, selectedId]);

  // Wheel handler for pan/zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const newK = Math.max(0.3, Math.min(2, vp.k - e.deltaY * 0.001));
      setVp((v) => ({ ...v, k: newK }));
    } else {
      setVp((v) => ({ ...v, tx: v.tx - e.deltaX, ty: v.ty - e.deltaY }));
    }
  }, [vp.k]);

  const expandedPerson = expandedId ? personById.get(expandedId) : null;

  return (
    <div style={{ width: "100%", height: "100%", minHeight: 500, border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", background: "#fff", position: "relative" }}>
      {/* Expanded Profile Modal */}
      {expandedPerson && (
        <div
          style={{ position: "absolute", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }}
          onClick={() => setExpandedId(null)}
        >
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, maxWidth: 400, width: "90%", maxHeight: "80vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setExpandedId(null)}
              style={{ position: "absolute", top: 16, right: 16, width: 32, height: 32, borderRadius: "50%", border: "none", background: "#f1f5f9", cursor: "pointer", fontSize: 18 }}
            >
              x
            </button>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ width: 120, height: 120, borderRadius: "50%", background: "#e2e8f0", margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                {expandedPerson.photoUrl ? (
                  <img src={`/api/file?pathname=${encodeURIComponent(expandedPerson.photoUrl)}`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ fontSize: 48, fontWeight: 700, color: "#94a3b8" }}>{expandedPerson.fullName?.trim()?.[0]?.toUpperCase() || "?"}</span>
                )}
              </div>
              <h2 style={{ fontSize: 24, fontWeight: 700, color: "#111827", margin: 0 }}>{expandedPerson.fullName?.trim() || "Unnamed"}</h2>
              {(expandedPerson.birthDate || expandedPerson.deathDate) && (
                <p style={{ fontSize: 14, color: "#64748b", margin: "8px 0 0" }}>
                  {expandedPerson.birthDate ? new Date(expandedPerson.birthDate).getFullYear() : "?"} - {expandedPerson.deathDate ? new Date(expandedPerson.deathDate).getFullYear() : "Present"}
                </p>
              )}
            </div>
            <div style={{ display: "grid", gap: 16 }}>
              {expandedPerson.grewUpLocation && <div><div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>Grew up in</div><div style={{ fontSize: 15, color: "#111827" }}>{expandedPerson.grewUpLocation}</div></div>}
              {expandedPerson.occupation && <div><div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>Occupation</div><div style={{ fontSize: 15, color: "#111827" }}>{expandedPerson.occupation}</div></div>}
              {expandedPerson.interests && <div><div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>Hobbies / Interests</div><div style={{ fontSize: 15, color: "#111827" }}>{expandedPerson.interests}</div></div>}
              {expandedPerson.proudOf && <div><div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>Most proud of</div><div style={{ fontSize: 15, color: "#111827", lineHeight: 1.5 }}>{expandedPerson.proudOf}</div></div>}
            </div>
          </div>
        </div>
      )}

      <svg ref={svgRef} width="100%" height="100%" style={{ display: "block" }} onWheel={handleWheel}>
        <g transform={`translate(${vp.tx + 400}, ${vp.ty + 300}) scale(${vp.k})`}>
          {/* Render edges */}
          {lines.map((line, i) => (
            <line
              key={i}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke={line.type === "spouse" ? "#f59e0b" : "#94a3b8"}
              strokeWidth={2}
              strokeDasharray={line.type === "spouse" ? "6,4" : undefined}
            />
          ))}

          {/* Render nodes */}
          {Array.from(layout.entries()).map(([id, pos]) => {
            const person = personById.get(id);
            if (!person) return null;
            const isSelected = id === selectedId;
            return (
              <g key={id}>
                <foreignObject x={pos.x - NODE_W / 2} y={pos.y} width={NODE_W} height={NODE_H} style={{ overflow: "visible" }}>
                  <div style={{ width: NODE_W, height: NODE_H, overflow: "visible" }}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelect?.(id)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect?.(id); }}
                      style={{
                        width: "100%", height: "100%", borderRadius: 14,
                        border: isSelected ? "3px solid #3b82f6" : "1px solid #d1d5db",
                        background: isSelected ? "#eff6ff" : "#fff",
                        padding: 10, textAlign: "left", cursor: "pointer",
                        boxShadow: isSelected ? "0 0 0 4px rgba(59,130,246,0.25)" : "0 4px 12px rgba(15,23,42,0.06)",
                        display: "flex", flexDirection: "column", gap: 6,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#e2e8f0", flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {person.photoUrl ? (
                            <img src={`/api/file?pathname=${encodeURIComponent(person.photoUrl)}`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            <span style={{ fontSize: 14, fontWeight: 700, color: "#94a3b8" }}>{person.fullName?.trim()?.[0]?.toUpperCase() || "?"}</span>
                          )}
                        </div>
                        <span style={{ fontWeight: 700, fontSize: 14, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                          {person.fullName?.trim() || "Unnamed"}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {person.isPrivate && <span style={{ borderRadius: 999, padding: "3px 8px", fontSize: 10, fontWeight: 800, background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" }}>Private</span>}
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => { e.stopPropagation(); setExpandedId(id); }}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); setExpandedId(id); } }}
                          style={{ marginLeft: "auto", width: 24, height: 24, borderRadius: 6, background: "#f1f5f9", color: "#64748b", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}
                          title="View profile"
                        >
                          +
                        </span>
                      </div>
                    </div>
                  </div>
                </foreignObject>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

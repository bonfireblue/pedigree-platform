"use client";

import { useRef, useEffect, useState, useCallback } from "react";

interface TreeNode {
  id: string;
  fullName: string;
  photoUrl?: string | null;
  birthDate?: string | null;
  deathDate?: string | null;
  sex?: string | null;
}

interface Props {
  data: {
    centerId: string;
    nodes: TreeNode[];
    edges: {
      parentChild: { parentId: string; childId: string }[];
      spouse: { aId: string; bId: string }[];
    };
  };
  selectedId?: string | null;
  focusKey?: number;
  onSelect?: (id: string) => void;
}

const NODE_W = 240;
const NODE_H = 74;
const GAP_X = 40;
const GAP_Y = 100;

export default function FamilyTreeView({ data, selectedId, focusKey, onSelect }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });

  // Build maps for quick lookup
  const nodeMap = new Map(data.nodes.map((n) => [n.id, n]));

  // Build adjacency lists
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  const spouses = new Map<string, string[]>();

  const parentChildEdges = data.edges?.parentChild ?? [];
  const spouseEdges = data.edges?.spouse ?? [];

  for (const e of parentChildEdges) {
    if (!children.has(e.parentId)) children.set(e.parentId, []);
    children.get(e.parentId)!.push(e.childId);
    if (!parents.has(e.childId)) parents.set(e.childId, []);
    parents.get(e.childId)!.push(e.parentId);
  }

  for (const e of spouseEdges) {
    if (!spouses.has(e.aId)) spouses.set(e.aId, []);
    if (!spouses.has(e.bId)) spouses.set(e.bId, []);
    spouses.get(e.aId)!.push(e.bId);
    spouses.get(e.bId)!.push(e.aId);
  }

  // Build layout
  const layout = new Map<string, { x: number; y: number }>();
  const placed = new Set<string>();

  // Place center node
  const centerId = data.centerId;
  layout.set(centerId, { x: 0, y: 0 });
  placed.add(centerId);

  // Place parents above
  const centerParents = parents.get(centerId) ?? [];
  centerParents.forEach((pid, i) => {
    const offsetX = (i - (centerParents.length - 1) / 2) * (NODE_W + GAP_X);
    layout.set(pid, { x: offsetX, y: -(NODE_H + GAP_Y) });
    placed.add(pid);
  });

  // Place spouses to the right
  const centerSpouses = spouses.get(centerId) ?? [];
  centerSpouses.forEach((sid, i) => {
    layout.set(sid, { x: (i + 1) * (NODE_W + GAP_X), y: 0 });
    placed.add(sid);
  });

  // Place children below
  const centerChildren = children.get(centerId) ?? [];
  centerChildren.forEach((cid, i) => {
    const offsetX = (i - (centerChildren.length - 1) / 2) * (NODE_W + GAP_X);
    layout.set(cid, { x: offsetX, y: NODE_H + GAP_Y });
    placed.add(cid);
  });

  // Center view on focus
  useEffect(() => {
    if (svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      setTransform({ x: rect.width / 2, y: rect.height / 2, scale: 1 });
    }
  }, [focusKey]);

  // Pan/zoom handlers
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey) {
      const newScale = Math.max(0.3, Math.min(2, transform.scale - e.deltaY * 0.001));
      setTransform((t) => ({ ...t, scale: newScale }));
    } else {
      setTransform((t) => ({ ...t, x: t.x - e.deltaX, y: t.y - e.deltaY }));
    }
  }, [transform.scale]);

  // Build lines for edges
  const lines: { x1: number; y1: number; x2: number; y2: number; dashed: boolean }[] = [];

  for (const e of parentChildEdges) {
    const from = layout.get(e.parentId);
    const to = layout.get(e.childId);
    if (from && to) {
      lines.push({ x1: from.x, y1: from.y + NODE_H / 2, x2: to.x, y2: to.y - NODE_H / 2, dashed: false });
    }
  }

  for (const e of spouseEdges) {
    const from = layout.get(e.aId);
    const to = layout.get(e.bId);
    if (from && to) {
      lines.push({ x1: from.x + NODE_W / 2, y1: from.y, x2: to.x - NODE_W / 2, y2: to.y, dashed: true });
    }
  }

  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden" }}>
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        style={{ background: "#fafafa" }}
        onWheel={onWheel}
      >
        <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
          {/* Edges */}
          <g>
            {lines.map((line, i) => (
              <line
                key={i}
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                stroke="#94a3b8"
                strokeWidth={2}
                strokeDasharray={line.dashed ? "6,4" : undefined}
              />
            ))}
          </g>

          {/* Nodes */}
          <g>
            {Array.from(layout.entries()).map(([id, pos]) => {
              const node = nodeMap.get(id);
              if (!node) return null;
              const isSelected = id === selectedId;
              const isCenter = id === centerId;

              return (
                <foreignObject
                  key={id}
                  x={pos.x - NODE_W / 2}
                  y={pos.y - NODE_H / 2}
                  width={NODE_W}
                  height={NODE_H}
                  style={{ overflow: "visible" }}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelect?.(id)}
                    onKeyDown={(e) => e.key === "Enter" && onSelect?.(id)}
                    style={{
                      width: NODE_W,
                      height: NODE_H,
                      borderRadius: 14,
                      border: isSelected ? "3px solid #3b82f6" : isCenter ? "3px solid #2563eb" : "2px solid #e2e8f0",
                      background: isCenter ? "#eff6ff" : "#fff",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      padding: 8,
                      gap: 8,
                      boxShadow: isSelected ? "0 0 0 3px rgba(59,130,246,0.3)" : "0 1px 3px rgba(0,0,0,0.1)",
                    }}
                  >
                    {/* Photo */}
                    <div
                      style={{
                        width: 50,
                        height: 50,
                        borderRadius: "50%",
                        background: "#e2e8f0",
                        flexShrink: 0,
                        overflow: "hidden",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {node.photoUrl ? (
                        <img
                          src={`/api/file?pathname=${encodeURIComponent(node.photoUrl)}`}
                          alt=""
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        <span style={{ fontSize: 20, color: "#94a3b8" }}>
                          {node.fullName?.charAt(0)?.toUpperCase() || "?"}
                        </span>
                      )}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 14,
                          color: "#1e293b",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {node.fullName || "Unnamed"}
                      </div>
                      {node.birthDate && (
                        <div style={{ fontSize: 12, color: "#64748b" }}>
                          {new Date(node.birthDate).getFullYear()}
                          {node.deathDate && ` - ${new Date(node.deathDate).getFullYear()}`}
                        </div>
                      )}
                    </div>
                  </div>
                </foreignObject>
              );
            })}
          </g>
        </g>
      </svg>
    </div>
  );
}

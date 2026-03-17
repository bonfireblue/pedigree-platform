"use client";

import { useRef, useEffect, useState, useMemo } from "react";

interface TreeNode {
  id: string;
  fullName: string;
  photoUrl?: string | null;
  birthDate?: string | null;
  deathDate?: string | null;
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
const GAP_X = 60;
const GAP_Y = 100;

export default function TreeCanvas({ data, selectedId, focusKey, onSelect }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  const nodeMap = useMemo(() => new Map(data.nodes.map((n) => [n.id, n])), [data.nodes]);

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

  function placeNode(id: string, x: number, y: number) {
    if (placed.has(id)) return;
    placed.add(id);
    layout.set(id, { x, y });
  }

  // Place center node
  placeNode(data.centerId, 0, 0);

  // Place parents above
  const centerParents = parents.get(data.centerId) ?? [];
  centerParents.forEach((pid, i) => {
    const offsetX = (i - (centerParents.length - 1) / 2) * (NODE_W + GAP_X);
    placeNode(pid, offsetX, -(NODE_H + GAP_Y));
  });

  // Place children below
  const centerChildren = children.get(data.centerId) ?? [];
  centerChildren.forEach((cid, i) => {
    const offsetX = (i - (centerChildren.length - 1) / 2) * (NODE_W + GAP_X);
    placeNode(cid, offsetX, NODE_H + GAP_Y);
  });

  // Place spouses to the right
  const centerSpouses = spouses.get(data.centerId) ?? [];
  centerSpouses.forEach((sid, i) => {
    placeNode(sid, (i + 1) * (NODE_W + GAP_X), 0);
  });

  // Build edges for rendering
  const lines: { x1: number; y1: number; x2: number; y2: number; type: string }[] = [];

  for (const e of parentChildEdges) {
    const fromPos = layout.get(e.parentId);
    const toPos = layout.get(e.childId);
    if (fromPos && toPos) {
      lines.push({
        x1: fromPos.x,
        y1: fromPos.y + NODE_H / 2,
        x2: toPos.x,
        y2: toPos.y - NODE_H / 2,
        type: "parent",
      });
    }
  }

  for (const e of spouseEdges) {
    const fromPos = layout.get(e.aId);
    const toPos = layout.get(e.bId);
    if (fromPos && toPos) {
      lines.push({
        x1: fromPos.x + NODE_W / 2,
        y1: fromPos.y,
        x2: toPos.x - NODE_W / 2,
        y2: toPos.y,
        type: "spouse",
      });
    }
  }

  // Center view on center node
  useEffect(() => {
    if (svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      setPan({ x: rect.width / 2, y: rect.height / 2 });
    }
  }, [focusKey]);

  function onWheel(e: React.WheelEvent) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom((z) => Math.max(0.25, Math.min(2, z - e.deltaY * 0.001)));
    } else {
      setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
    }
  }

  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden" }}>
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        style={{ background: "#f8fafc" }}
        onWheel={onWheel}
      >
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Edges */}
          <g>
            {lines.map((line, i) => (
              <line
                key={i}
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                stroke={line.type === "spouse" ? "#f472b6" : "#94a3b8"}
                strokeWidth={2}
                strokeDasharray={line.type === "spouse" ? "5,5" : undefined}
              />
            ))}
          </g>

          {/* Nodes */}
          <g>
            {Array.from(layout.entries()).map(([id, pos]) => {
              const node = nodeMap.get(id);
              if (!node) return null;
              const isSelected = id === selectedId;

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
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") onSelect?.(id);
                    }}
                    style={{
                      width: NODE_W,
                      height: NODE_H,
                      borderRadius: 14,
                      border: isSelected ? "3px solid #3b82f6" : "1px solid #d1d5db",
                      background: isSelected ? "#eff6ff" : "#ffffff",
                      padding: 10,
                      cursor: "pointer",
                      boxShadow: isSelected
                        ? "0 0 0 4px rgba(59,130,246,0.25)"
                        : "0 4px 12px rgba(15, 23, 42, 0.06)",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: "50%",
                        background: "#e2e8f0",
                        flexShrink: 0,
                        overflow: "hidden",
                      }}
                    >
                      {node.photoUrl && (
                        <img
                          src={`/api/file?pathname=${encodeURIComponent(node.photoUrl)}`}
                          alt=""
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      )}
                    </div>
                    <div style={{ overflow: "hidden" }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 14,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          color: "#1e293b",
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

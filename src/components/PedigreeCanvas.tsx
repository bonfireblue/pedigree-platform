"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { layoutPedigree, type TreeApiData } from "@/lib/pedigreeLayout";

type PedigreeCanvasProps = {
  data: TreeApiData | null;
  selectedId?: string;
  focusKey?: number;
  onSelectPerson?: (id: string) => void;
};

type Viewport = {
  k: number;
  tx: number;
  ty: number;
};

export function PedigreeCanvas({
  data,
  selectedId,
  focusKey,
  onSelectPerson,
}: PedigreeCanvasProps) {
  const NODE_W = 240;
  const NODE_H = 74;

  const layout = useMemo(() => {
    if (!data) return null;

    return layoutPedigree({
      data,
      options: {
        nodeW: NODE_W,
        nodeH: NODE_H,
        hGap: 18,
        vGap: 90,
        maxDepthUp: 4,
        maxDepthDown: 6,
        maxNodes: 1200,
      },
    });
  }, [data]);

  const personById = useMemo(() => {
    return new Map((data?.nodes ?? []).map((p) => [p.id, p]));
  }, [data]);

  const svgRef = useRef<SVGSVGElement | null>(null);
const animRef = useRef<number | null>(null);
  const [vp, setVp] = useState<Viewport>({ k: 1, tx: 0, ty: 0 });

  const dragRef = useRef<{
    active: boolean;
    startClientX: number;
    startClientY: number;
    startTx: number;
    startTy: number;
    pointerId: number | null;
  }>({
    active: false,
    startClientX: 0,
    startClientY: 0,
    startTx: 0,
    startTy: 0,
    pointerId: null,
  });

  function clamp(n: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, n));
  }

  function getSvgClientRect() {
    const el = svgRef.current;
    if (!el) return null;
    return el.getBoundingClientRect();
  }

  function clientToWorld(clientX: number, clientY: number, v: Viewport) {
    const rect = getSvgClientRect();
    if (!rect) return { x: 0, y: 0 };

    const sx = clientX - rect.left;
    const sy = clientY - rect.top;

    return {
      x: (sx - v.tx) / v.k,
      y: (sy - v.ty) / v.k,
    };
  }

useEffect(() => {
  if (!layout || !svgRef.current) return;

  if (animRef.current !== null) {
    cancelAnimationFrame(animRef.current);
    animRef.current = null;
  }

  const targetId = selectedId || layout.centerId;
  const targetNode = layout.nodes.find((n) => n.id === targetId);
  if (!targetNode) return;

  const rect = svgRef.current.getBoundingClientRect();
  const w = Math.max(1, rect.width);
  const h = Math.max(1, rect.height);

  // Keep a comfortable zoom instead of fitting the whole pedigree.
  // If already reasonably zoomed in, preserve it.
  const targetK = clamp(vp.k < 0.78 ? 0.78 : vp.k, 0.78, 1.05);

  const nodeCx = targetNode.x + NODE_W / 2;
  const nodeCy = targetNode.y + NODE_H / 2;

  const targetTx = w / 2 - nodeCx * targetK;
  const targetTy = h / 2 - nodeCy * targetK;

  const start = { ...vp };
  const end = { k: targetK, tx: targetTx, ty: targetTy };
  const duration = 320;
  const startTime = performance.now();

  const animate = (now: number) => {
    const t = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - t, 3);

    setVp({
      k: start.k + (end.k - start.k) * eased,
      tx: start.tx + (end.tx - start.tx) * eased,
      ty: start.ty + (end.ty - start.ty) * eased,
    });

    if (t < 1) {
      animRef.current = requestAnimationFrame(animate);
    } else {
      animRef.current = null;
    }
  };

  animRef.current = requestAnimationFrame(animate);
}, [layout, selectedId, focusKey]);

  function handleSelectPerson(id: string) {
    if (typeof onSelectPerson === "function") {
      onSelectPerson(id);
    }
  }

  function onWheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault();
    if (!svgRef.current) return;

    const factor = e.deltaY > 0 ? 0.92 : 1.08;

    setVp((prev) => {
      const k2 = clamp(prev.k * factor, 0.1, 4);

      const before = clientToWorld(e.clientX, e.clientY, prev);
      const after = clientToWorld(e.clientX, e.clientY, { ...prev, k: k2 });

      const tx2 = prev.tx + (after.x - before.x) * k2;
      const ty2 = prev.ty + (after.y - before.y) * k2;

      return { k: k2, tx: tx2, ty: ty2 };
    });
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return;

    const el = svgRef.current;
    if (!el) return;

    el.setPointerCapture(e.pointerId);

    dragRef.current.active = true;
    dragRef.current.pointerId = e.pointerId;
    dragRef.current.startClientX = e.clientX;
    dragRef.current.startClientY = e.clientY;
    dragRef.current.startTx = vp.tx;
    dragRef.current.startTy = vp.ty;
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!dragRef.current.active) return;

    const dx = e.clientX - dragRef.current.startClientX;
    const dy = e.clientY - dragRef.current.startClientY;

    setVp((prev) => ({
      ...prev,
      tx: dragRef.current.startTx + dx,
      ty: dragRef.current.startTy + dy,
    }));
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    if (!dragRef.current.active) return;

    dragRef.current.active = false;
    dragRef.current.pointerId = null;

    const el = svgRef.current;
    if (!el) return;

    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }

  if (!layout) {
    return (
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 12,
          color: "#6b7280",
          background: "#ffffff",
        }}
      >
        Loading pedigree…
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        minHeight: 500,
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        overflow: "hidden",
        background: "#ffffff",
      }}
    >
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        style={{ background: "#ffffff", touchAction: "none", display: "block" }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <g transform={`translate(${vp.tx} ${vp.ty}) scale(${vp.k})`}>
          <g>
            {layout.edges.map((e, idx) => (
              <path
                key={`${e.kind}:${e.fromId ?? ""}:${e.toId ?? ""}:${e.unionId ?? ""}:${idx}`}
                d={e.pathD}
                fill="none"
                stroke="#111827"
                strokeWidth={2}
                strokeLinecap="round"
                opacity={e.kind === "spouse" ? 0.85 : 0.95}
              />
            ))}
          </g>

          <g>
            {layout.nodes.map((n) => {
              const person = personById.get(n.id);

              return (
                <foreignObject
  key={n.id}
  x={n.x}
  y={n.y}
  width={NODE_W}
  height={NODE_H}
  style={{ overflow: "visible" }}
>
                  <div style={{ width: NODE_W, height: NODE_H, overflow: "visible" }}>
                    <NodeCard
                      p={person}
                      onClick={() => handleSelectPerson(n.id)}
                      isCenter={n.id === layout.centerId}
                    />
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

function NodeCard({
  p,
  onClick,
  isCenter,
}: {
  p?: {
    id: string;
    fullName?: string;
    claimedByUserId?: string | null;
    isPrivate?: boolean;
  };
  onClick?: () => void;
  isCenter?: boolean;
}) {
  if (!p) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 14,
          border: "1px solid #d1d5db",
          background: "#ffffff",
          color: "#111827",
          padding: 10,
          display: "flex",
          alignItems: "center",
        }}
      >
        Missing person
      </div>
    );
  }

  const claimed = Boolean(p.claimedByUserId);

  return (
    <button
  type="button"
  onClick={(e) => {
    e.stopPropagation();
    onClick?.();
  }}
  onPointerDown={(e) => e.stopPropagation()}
  style={{
        width: "100%",
        height: "100%",
        borderRadius: 14,
       border: isCenter ? "3px solid #60a5fa" : "1px solid #d1d5db",
        background: "#ffffff",
        color: "#111827",
        padding: 10,
        textAlign: "left",
        cursor: "pointer",
        boxShadow: isCenter
  ? "0 0 18px 6px rgba(96,165,250,0.35), 0 0 40px 16px rgba(96,165,250,0.20), 0 10px 30px rgba(59,130,246,0.18)"
  : "0 6px 16px rgba(15, 23, 42, 0.08)",
      }}
      title={p.id}
    >
      <div
        style={{
          fontWeight: 800,
          fontSize: 14,
          lineHeight: "18px",
          color: "#111827",
          marginBottom: 8,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {p.fullName?.trim() || "Unnamed"}
      </div>
<div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            borderRadius: 999,
            padding: "3px 8px",
            fontSize: 10,
            fontWeight: 800,
            background: claimed ? "#ecfdf5" : "#fffbeb",
            color: claimed ? "#166534" : "#b45309",
            border: `1px solid ${claimed ? "#a7f3d0" : "#fde68a"}`,
          }}
        >
          {claimed ? "Claimed" : "Unclaimed"}
        </span>

{isCenter ? (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      borderRadius: 999,
      padding: "3px 8px",
      fontSize: 10,
      fontWeight: 800,
      background: "#dbeafe",
      color: "#1d4ed8",
      border: "1px solid #93c5fd",
    }}
  >
    Selected
  </span>
) : null}

        {p.isPrivate ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              borderRadius: 999,
              padding: "3px 8px",
              fontSize: 10,
              fontWeight: 800,
              background: "#eff6ff",
              color: "#1d4ed8",
              border: "1px solid #bfdbfe",
            }}
          >
            Private
          </span>
        ) : null}
      </div>
    </button>
  );
}
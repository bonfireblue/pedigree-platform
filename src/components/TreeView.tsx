"use client";

import type { PersonGraph, Person } from "@/lib/treeMap";

interface Props {
  graph: PersonGraph;
  onSelectPerson?: (id: string) => void;
  onInvite?: (person: Person) => void;
  canInvite?: boolean;
}

export function TreeView({ graph, onSelectPerson, onInvite, canInvite }: Props) {
  if (!graph || !graph.people || graph.people.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>
        No family members yet. Add someone to get started.
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {graph.people.map((person) => (
          <div
            key={person.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelectPerson?.(person.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectPerson?.(person.id);
              }
            }}
            style={{
              padding: 12,
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              background: "#fff",
              cursor: "pointer",
              minWidth: 150,
            }}
          >
            <div style={{ fontWeight: 500, marginBottom: 4 }}>
              {person.fullName || "Unnamed"}
            </div>
            {person.birthDate && (
              <div style={{ fontSize: 12, color: "#64748b" }}>
                Born: {new Date(person.birthDate).toLocaleDateString()}
              </div>
            )}
            {canInvite && onInvite && !person.claimedById && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onInvite(person);
                }}
                style={{
                  marginTop: 8,
                  padding: "4px 8px",
                  fontSize: 12,
                  borderRadius: 4,
                  border: "1px solid #3b82f6",
                  background: "#eff6ff",
                  color: "#3b82f6",
                  cursor: "pointer",
                }}
              >
                Invite to claim
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";
// TreeView component - March 17 2026 v3
import type { PersonGraph, Person } from "@/lib/treeMap";

interface Props {
  graph: PersonGraph | null | undefined;
  onSelectPerson?: (id: string) => void;
  onInvite?: (person: Person) => void;
  canInvite?: boolean;
}

export function TreeView({ graph, onSelectPerson, onInvite, canInvite }: Props) {
  // Safe null checks for graph and people array
  const people = graph?.people ?? [];
  
  if (people.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>
        No family members yet. Add someone to get started.
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        {people.map((person) => (
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
              padding: 16,
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              background: "#fff",
              cursor: "pointer",
              minWidth: 150,
            }}
          >
            <div style={{ fontWeight: 600 }}>{person.fullName || "Unnamed"}</div>
            {person.birthDate && (
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                Born: {new Date(person.birthDate).getFullYear()}
              </div>
            )}
            {canInvite && onInvite && !person.claimedById && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onInvite(person);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onInvite(person);
                  }
                }}
                style={{
                  display: "inline-block",
                  marginTop: 8,
                  padding: "4px 8px",
                  fontSize: 12,
                  background: "#f1f5f9",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                Invite
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

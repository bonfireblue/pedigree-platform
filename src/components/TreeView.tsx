"use client";

import { useState } from "react";
import type { Person, PersonGraph } from "@/lib/treeMap";

function titleCaseLabel(base: string, count: number) {
  return `${base}${count === 1 ? "" : "s"}`;
}

function PersonRow({
  p,
  onSelect,
  onInvite,
  canInvite,
}: {
  p: Person;
  onSelect: (id: string) => void;
  onInvite: (personId: string, email: string) => Promise<void>;
  canInvite: boolean;
}) {
  const claimed = Boolean(p.claimedByUserId);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10, marginBottom: 8 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
        }}
      >
        <button
          onClick={() => onSelect(p.id)}
          style={{
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
            fontWeight: 700,
            textAlign: "left",
          }}
        >
          {p.fullName}
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: claimed ? "#16a34a" : "#f59e0b",
            }}
          >
            {claimed ? "CLAIMED" : "UNCLAIMED"}
          </span>

          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(p.id)}
            style={{
              fontSize: 12,
              color: "#6b7280",
              border: "1px solid #d1d5db",
              background: "#fff",
              borderRadius: 8,
              padding: "4px 8px",
              cursor: "pointer",
            }}
          >
            Copy ID
          </button>
        </div>
      </div>

      {!claimed && canInvite && (
        <div
          style={{
            marginTop: 10,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Invite email"
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              minWidth: 240,
            }}
          />

          <button
            disabled={busy || !email.trim()}
            onClick={async () => {
              const value = email.trim();
              if (!value) return;

              setBusy(true);
              try {
                await onInvite(p.id, value);
                setEmail("");
              } finally {
                setBusy(false);
              }
            }}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #111827",
              background: busy || !email.trim() ? "#e5e7eb" : "#111827",
              color: busy || !email.trim() ? "#111827" : "#ffffff",
              cursor: busy || !email.trim() ? "not-allowed" : "pointer",
              fontWeight: 700,
            }}
          >
            {busy ? "Inviting..." : "Invite"}
          </button>

          <div style={{ fontSize: 12, color: "#6b7280" }}>
            Creates a claim link for this profile.
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  people,
  onSelectPerson,
  onInvite,
  canInvite,
}: {
  title: string;
  people: Person[];
  onSelectPerson: (id: string) => void;
  onInvite: (personId: string, email: string) => Promise<void>;
  canInvite: boolean;
}) {
  if (!people.length) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <h4 style={{ margin: "0 0 8px 0" }}>
        {title} <span style={{ color: "#6b7280", fontWeight: 600 }}>({people.length})</span>
      </h4>

      {people.map((p) => (
        <PersonRow
          key={p.id}
          p={p}
          onSelect={onSelectPerson}
          onInvite={onInvite}
          canInvite={canInvite}
        />
      ))}
    </div>
  );
}

export function TreeView({
  graph,
  onSelectPerson,
  onInvite,
  canInvite,
}: {
  graph: PersonGraph;
  onSelectPerson: (id: string) => void;
  onInvite: (personId: string, email: string) => Promise<void>;
  canInvite: boolean;
}) {
  return (
    <div style={{ border: "1px solid #e5e7eb", padding: 12, borderRadius: 12 }}>
      <h3 style={{ marginTop: 0 }}>Selected</h3>

      <PersonRow
        p={graph.person}
        onSelect={onSelectPerson}
        onInvite={onInvite}
        canInvite={canInvite}
      />

      <Section
        title={titleCaseLabel("Parent", graph.parents.length)}
        people={graph.parents}
        onSelectPerson={onSelectPerson}
        onInvite={onInvite}
        canInvite={canInvite}
      />

      <Section
        title={titleCaseLabel("Sibling", graph.siblings.length)}
        people={graph.siblings}
        onSelectPerson={onSelectPerson}
        onInvite={onInvite}
        canInvite={canInvite}
      />

      <Section
        title={titleCaseLabel("Spouse", graph.spouses.length)}
        people={graph.spouses}
        onSelectPerson={onSelectPerson}
        onInvite={onInvite}
        canInvite={canInvite}
      />

      <Section
        title={titleCaseLabel("Child", graph.children.length)}
        people={graph.children}
        onSelectPerson={onSelectPerson}
        onInvite={onInvite}
        canInvite={canInvite}
      />

      <Section
        title={titleCaseLabel("Grandchild", graph.grandchildren.length)}
        people={graph.grandchildren}
        onSelectPerson={onSelectPerson}
        onInvite={onInvite}
        canInvite={canInvite}
      />

      <Section
        title={titleCaseLabel("Niece / Nephew", graph.niecesNephews.length)}
        people={graph.niecesNephews}
        onSelectPerson={onSelectPerson}
        onInvite={onInvite}
        canInvite={canInvite}
      />
    </div>
  );
}
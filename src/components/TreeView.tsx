"use client";

type Person = {
  id: string;
  fullName: string;
};

type PersonGraph = {
  person: Person;
  parents: Person[];
  children: Person[];
  spouses: Person[];
};

function Node({
  person,
  onClick,
}: {
  person: Person;
  onClick?: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onClick?.(person.id)}
      style={{
        border: "1px solid #ccc",
        padding: "10px 12px",
        borderRadius: 8,
        cursor: onClick ? "pointer" : "default",
        background: "white",
        minWidth: 180,
        textAlign: "left",
      }}
    >
      <div style={{ fontWeight: 600 }}>{person.fullName}</div>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{person.id.slice(0, 8)}…</div>
    </button>
  );
}

export function TreeView({
  graph,
  onSelectPerson,
}: {
  graph: PersonGraph;
  onSelectPerson: (id: string) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 18 }}>
      {/* Parents */}
      <div>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Parents</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {graph.parents.length ? (
            graph.parents.map((p) => <Node key={p.id} person={p} onClick={onSelectPerson} />)
          ) : (
            <div style={{ opacity: 0.7 }}>(none)</div>
          )}
        </div>
      </div>

      {/* Center: Person + Spouses */}
      <div>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Selected</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <Node person={graph.person} />
          {graph.spouses.length ? (
            <>
              <div style={{ opacity: 0.7 }}>Spouses</div>
              {graph.spouses.map((s) => (
                <Node key={s.id} person={s} onClick={onSelectPerson} />
              ))}
            </>
          ) : null}
        </div>
      </div>

      {/* Children */}
      <div>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Children</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {graph.children.length ? (
            graph.children.map((c) => <Node key={c.id} person={c} onClick={onSelectPerson} />)
          ) : (
            <div style={{ opacity: 0.7 }}>(none)</div>
          )}
        </div>
      </div>
    </div>
  );
}

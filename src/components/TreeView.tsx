"use client";

type Person = {
  id: string;
  fullName: string;
  createdAt: string;
  isPrivate: boolean;
};

type PersonGraph = {
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

export function TreeView({
  graph,
  onSelectPerson
}: {
  graph: PersonGraph;
  onSelectPerson: (id: string) => void;
}) {
  return (
    <div style={{ border: "1px solid #ddd", padding: 12, borderRadius: 8 }}>
      <h3 style={{ marginTop: 0 }}>Selected</h3>
      <button
        onClick={() => onSelectPerson(graph.person.id)}
        style={{ cursor: "pointer", fontWeight: 700 }}
      >
        {graph.person.fullName}
      </button>
      <div style={{ color: "#666", fontSize: 12 }}>{graph.person.id.slice(0, 8)}…</div>

      <div style={{ marginTop: 16 }}>
        <h4>Parents</h4>
        {graph.parents.length === 0 ? (
          <div style={{ color: "#666" }}>(none)</div>
        ) : (
          <ul>
            {graph.parents.map((p) => (
              <li key={p.id}>
                <button onClick={() => onSelectPerson(p.id)} style={{ cursor: "pointer" }}>
                  {p.fullName}
                </button>{" "}
                <span style={{ color: "#666", fontSize: 12 }}>{p.id.slice(0, 8)}…</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <h4>Spouses</h4>
        {graph.spouses.length === 0 ? (
          <div style={{ color: "#666" }}>(none)</div>
        ) : (
          <ul>
            {graph.spouses.map((p) => (
              <li key={p.id}>
                <button onClick={() => onSelectPerson(p.id)} style={{ cursor: "pointer" }}>
                  {p.fullName}
                </button>{" "}
                <span style={{ color: "#666", fontSize: 12 }}>{p.id.slice(0, 8)}…</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <h4>Children</h4>
        {graph.children.length === 0 ? (
          <div style={{ color: "#666" }}>(none)</div>
        ) : (
          <ul>
            {graph.children.map((p) => (
              <li key={p.id}>
                <button onClick={() => onSelectPerson(p.id)} style={{ cursor: "pointer" }}>
                  {p.fullName}
                </button>{" "}
                <span style={{ color: "#666", fontSize: 12 }}>{p.id.slice(0, 8)}…</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

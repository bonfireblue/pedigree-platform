"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { TreeView } from "@/components/TreeView";
import { toPersonGraph } from "@/lib/treeMap";

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

export default function AppPage() {
  const { status } = useSession();
  const [people, setPeople] = useState<Person[]>([]);
  const [fullName, setFullName] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Person[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [up, setUp] = useState(2);
  const [down, setDown] = useState(2);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [graph, setGraph] = useState<PersonGraph | null>(null);
  
    useEffect(() => {
    if (selectedId) loadGraph(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [up, down]);

  async function saveSelectedPerson() {
    if (!selectedId) return;
    setSaving(true);
    setError(null);

    const res = await fetch(`/api/people/${selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: editName.trim(),
        isPrivate: graph?.person?.isPrivate,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setSaving(false);
      setError(data?.error ?? `Save failed: ${res.status}`);
      return;
    }

    // reload list + graph so UI stays consistent
    await loadPeople();
    await loadGraph(selectedId);
    setSaving(false);
  }

  async function togglePrivate() {
    if (!selectedId) return;
    setSaving(true);
    setError(null);

    const next = !(graph?.person?.isPrivate ?? false);

    const res = await fetch(`/api/people/${selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPrivate: next }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setSaving(false);
      setError(data?.error ?? `Toggle failed: ${res.status}`);
      return;
    }

    await loadPeople();
    await loadGraph(selectedId);
    setSaving(false);
  }

  async function deleteSelectedPerson() {
    if (!selectedId) return;

    const ok = window.confirm("Delete this person? This cannot be undone.");
    if (!ok) return;

    setSaving(true);
    setError(null);

    const res = await fetch(`/api/people/${selectedId}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setSaving(false);
      setError(data?.error ?? `Delete failed: ${res.status}`);
      return;
    }

    setGraph(null);
    setSelectedId(null);
    setEditName("");
    await loadPeople();
    setSaving(false);
  }

  if (status === "unauthenticated") {
    window.location.href = "/sign-in";
    return null;
  }

    async function loadPeople() {
    setError(null);
    const res = await fetch("/api/people");
    if (!res.ok) {
      setError(`Failed to load people: ${res.status}`);
      return;
    }
    const data = await res.json();
    const list = data.people ?? [];
    setPeople(list);

    if (!selectedId && list.length > 0) {
      const firstId = list[0].id;
      setSelectedId(firstId);
      loadGraph(firstId);
    }
  }

  async function runSearch(q: string) {
    const res = await fetch(`/api/search/people?q=${encodeURIComponent(q)}`);
    if (!res.ok) return;
    const data = await res.json();
    setSearchResults(data.results ?? []);
  }

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSearchResults([]);
      setSearchOpen(false);
      return;
    }

    setSearchOpen(true);
    const t = setTimeout(() => {
      runSearch(q);
    }, 200);

    return () => clearTimeout(t);
  }, [query]);

    async function loadGraph(id: string) {
    setError(null);
    setGraph(null);

    const res = await fetch(`/api/tree?centerId=${encodeURIComponent(id)}&up=${up}&down=${down}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? `Failed to load tree: ${res.status}`);
      return;
    }

    const sub = await res.json();
    const g = toPersonGraph(sub);
    if (!g) {
      setError("FAILED_TO_MAP_TREE");
      return;
    }

    setGraph(g as any);
    setEditName(g.person.fullName ?? "");
  }


  async function createPerson(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const res = await fetch("/api/people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName, isPrivate }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? `Create failed: ${res.status}`);
      return;
    }

    setFullName("");
    setIsPrivate(false);
    await loadPeople();
  }

  useEffect(() => {
    loadPeople();
  }, []);

  return (
    <main style={{ padding: 40, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
      <section>
        <h1>People</h1>
        
        <div style={{ marginTop: 12, position: "relative" }}>
          <input
            placeholder="Search people…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => query.trim() && setSearchOpen(true)}
            style={{ width: "100%" }}
          />

          {searchOpen && searchResults.length > 0 ? (
            <div
              style={{
                position: "absolute",
                top: 34,
                left: 0,
                right: 0,
                border: "1px solid #ccc",
                background: "white",
                borderRadius: 8,
                padding: 8,
                zIndex: 10,
              }}
            >
              {searchResults.map((r) => (
                <div key={r.id} style={{ padding: 6 }}>
                  <button
                    style={{ cursor: "pointer", width: "100%", textAlign: "left" }}
                    onClick={() => {
                      setQuery("");
                      setSearchOpen(false);
                      setSelectedId(r.id);
                      loadGraph(r.id);
                    }}
                  >
                    {r.fullName} {r.isPrivate ? "(private)" : ""}
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <form onSubmit={createPerson} style={{ marginBottom: 16 }}>
          <div>
            <input
              placeholder="Full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>

          <label style={{ display: "block", marginTop: 8 }}>
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
            />{" "}
            Private
          </label>

          <button type="submit" style={{ marginTop: 8 }}>
            Add Person
          </button>
        </form>

        <button onClick={loadPeople}>Refresh</button>

        {error ? <p style={{ marginTop: 8 }}>{error}</p> : null}

        <ul style={{ marginTop: 16 }}>
          {people.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => {
                  setSelectedId(p.id);
                  loadGraph(p.id);
                }}
                style={{ cursor: "pointer" }}
              >
                {p.fullName} {p.isPrivate ? "(private)" : ""}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
  <h2>Tree</h2>
  
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
          <label>
            Up{" "}
            <input
              type="number"
              value={up}
              min={0}
              max={5}
              onChange={(e) => setUp(Number(e.target.value))}
              style={{ width: 60 }}
            />
          </label>

          <label>
            Down{" "}
            <input
              type="number"
              value={down}
              min={0}
              max={5}
              onChange={(e) => setDown(Number(e.target.value))}
              style={{ width: 60 }}
            />
          </label>
        </div>

  {!selectedId ? <p>Click a person to view the tree.</p> : null}

    {graph ? (
    <>
      <div
        style={{
          marginBottom: 16,
          border: "1px solid #ddd",
          borderRadius: 8,
          padding: 12,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Selected Person</div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input value={editName} onChange={(e) => setEditName(e.target.value)} style={{ minWidth: 260 }} />

          <button onClick={saveSelectedPerson} disabled={saving || !editName.trim()}>
            {saving ? "Saving..." : "Save name"}
          </button>

          <button onClick={togglePrivate} disabled={saving}>
            {graph.person.isPrivate ? "Make Public" : "Make Private"}
          </button>

          <button onClick={deleteSelectedPerson} disabled={saving}>
            Delete
          </button>
        </div>
      </div>

      <TreeView
        graph={graph}
        onSelectPerson={(id) => {
          setSelectedId(id);
          loadGraph(id);
        }}
      />
    </>
  ) : selectedId ? (
    <p>Loading…</p>
  ) : null}

</section>

    </main>
  );
}

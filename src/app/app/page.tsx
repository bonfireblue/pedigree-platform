"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { TreeView } from "@/components/TreeView";
import { toPersonGraph } from "@/lib/treeMap";
import type { Person, PersonGraph } from "@/lib/treeMap";

type RelMode = "PARENT" | "CHILD" | "SPOUSE";

export default function AppPage() {
  const { status } = useSession();

  const [people, setPeople] = useState<Person[]>([]);
  const [fullName, setFullName] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // main search box
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Person[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);

  // selected person editor
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);

  // tree depth
  const [up, setUp] = useState(2);
  const [down, setDown] = useState(2);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [graph, setGraph] = useState<PersonGraph | null>(null);

  // relationship panel
  const [relMode, setRelMode] = useState<RelMode>("PARENT");
  const [relBusy, setRelBusy] = useState(false);

  // create & link
  const [relNewName, setRelNewName] = useState("");
  const [relNewPrivate, setRelNewPrivate] = useState(false);

  // search & link existing
  const [relQuery, setRelQuery] = useState("");
  const [relResults, setRelResults] = useState<Person[]>([]);
  const [relSearchOpen, setRelSearchOpen] = useState(false);

    const depth = useMemo(() => Math.max(up, down), [up, down]);

  useEffect(() => {
    if (status === "unauthenticated") {
      window.location.href = "/sign-in";
    }
  }, [status]);

  const loadGraph = useCallback(
    async (id: string) => {
      setError(null);
      setGraph(null);

      const safeDepth = Math.max(2, depth);
      const res = await fetch(`/api/tree?centerId=${encodeURIComponent(id)}&depth=${safeDepth}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? `Failed to load tree: ${res.status}`);
        return;
      }

      const sub = await res.json();
      const g = toPersonGraph(sub);

      setSelectedId(id);
      setGraph(g);
      setEditName(g.person.fullName ?? "");
    },
    [depth]
  );

  const loadPeople = useCallback(async () => {
    setError(null);

    const res = await fetch("/api/people");
    if (!res.ok) {
      setError(`Failed to load people: ${res.status}`);
      return;
    }

    const data = await res.json();
    const list = (data.people ?? []) as Person[];
    setPeople(list);

    if (!selectedId && list.length > 0) {
      const firstId = list[0].id;
      setSelectedId(firstId);
      await loadGraph(firstId);
    }
  }, [selectedId, loadGraph]);

  useEffect(() => {
    if (selectedId) {
      void loadGraph(selectedId);
    }
  }, [selectedId, loadGraph]);

  useEffect(() => {
    void loadPeople();
  }, [loadPeople]);

  if (status === "unauthenticated") {
    return null;
  }

  async function inviteToClaim(personId: string, email: string) {

    const res = await fetch("/api/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetPersonId: personId, email }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(data?.error ?? `Invite failed: ${res.status}`);
      return;
    }

    window.prompt("Invite link (copy/paste):", data.inviteUrl);
  }


  async function runSearch(q: string) {
    if (!selectedId) {
      setSearchResults([]);
      return;
    }

    const res = await fetch(
      `/api/people/search?q=${encodeURIComponent(q)}&centerId=${encodeURIComponent(selectedId)}&limit=12`
    );

    if (!res.ok) {
      return;
    }

    const data = await res.json();
    setSearchResults(data.results ?? []);
  }

  useEffect(() => {
    const q = query.trim();
    if (!q || !selectedId) {
      setSearchResults([]);
      setSearchOpen(false);
      return;
    }

    setSearchOpen(true);
    const t = setTimeout(() => {
      void runSearch(q);
    }, 180);

    return () => clearTimeout(t);
  }, [query, selectedId]);


  async function jumpToPerson(id: string) {
    setQuery("");
    setSearchOpen(false);
    setSearchResults([]);
    await loadGraph(id);
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

  async function linkRelationship(targetId: string) {
    if (!selectedId) return;

    setRelBusy(true);
    setError(null);

    let url = "";
    let body: Record<string, string> = {};

    if (relMode === "PARENT") {
      url = "/api/relationships/parent-child";
      body = { parentId: targetId, childId: selectedId };
    } else if (relMode === "CHILD") {
      url = "/api/relationships/parent-child";
      body = { parentId: selectedId, childId: targetId };
    } else {
      url = "/api/relationships/spouse";
      body = { aId: selectedId, bId: targetId };
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setRelBusy(false);
      setError(data?.error ?? `Link failed: ${res.status}`);
      return;
    }

    await loadPeople();
    await loadGraph(selectedId);
    setRelBusy(false);
  }

  async function createAndLink() {
    if (!selectedId) return;

    const name = relNewName.trim();
    if (!name) return;

    setRelBusy(true);
    setError(null);

    const createRes = await fetch("/api/people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName: name, isPrivate: relNewPrivate }),
    });

    const createData = await createRes.json().catch(() => ({}));

    if (!createRes.ok) {
      setRelBusy(false);
      setError(createData?.error ?? `Create failed: ${createRes.status}`);
      return;
    }

    const newId = createData?.person?.id as string | undefined;
    if (!newId) {
      setRelBusy(false);
      setError("CREATE_PERSON_NO_ID");
      return;
    }

    await linkRelationship(newId);
    setRelNewName("");
    setRelNewPrivate(false);
    setRelBusy(false);
  }

  async function runRelSearch(q: string) {
    if (!selectedId) {
      setRelResults([]);
      return;
    }

    const res = await fetch(
      `/api/people/search?q=${encodeURIComponent(q)}&centerId=${encodeURIComponent(selectedId)}&limit=12`
    );

    if (!res.ok) {
      return;
    }

    const data = await res.json();
    setRelResults(data.results ?? []);
  }

  useEffect(() => {
    const q = relQuery.trim();
    if (!q || !selectedId) {
      setRelResults([]);
      setRelSearchOpen(false);
      return;
    }

    setRelSearchOpen(true);
    const t = setTimeout(() => {
      void runRelSearch(q);
    }, 180);

    return () => clearTimeout(t);
  }, [relQuery, selectedId]);

  const relTitle =
    relMode === "PARENT" ? "Add Parent" : relMode === "CHILD" ? "Add Child" : "Add Spouse";

  return (
    <main
      style={{
        padding: "20px",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 24,
      }}
      className="app-main"
    >
      <style>{`
        @media (max-width: 768px) {
          .app-main {
            grid-template-columns: 1fr !important;
            padding: 16px !important;
          }
        }
      `}</style>
      <section>
        <h1>People</h1>

        <div style={{ marginTop: 12, position: "relative" }}>
          <input
            placeholder={selectedId ? "Search in this family graph…" : "Select a person first…"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => query.trim() && setSearchOpen(true)}
            style={{ width: "100%" }}
            disabled={!selectedId}
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
                      void jumpToPerson(r.id);
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

        <button onClick={() => void loadPeople()}>Refresh</button>

        {error ? <p style={{ marginTop: 8 }}>{error}</p> : null}

        <ul style={{ marginTop: 16 }}>
          {people.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => {
                  void loadGraph(p.id);
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

        <div style={{ marginBottom: 12, display: "flex", gap: 10, alignItems: "center" }}>
          <a href={selectedId ? `/pedigree?centerId=${encodeURIComponent(selectedId)}` : "/pedigree"}>
            <button type="button" disabled={!selectedId}>
              Pedigree View
            </button>
          </a>
        </div>

        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
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

          <span style={{ opacity: 0.75 }}>Depth used: {depth}</span>
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
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  style={{ minWidth: 260 }}
                />

                <button onClick={() => void saveSelectedPerson()} disabled={saving || !editName.trim()}>
                  {saving ? "Saving..." : "Save name"}
                </button>

                <button onClick={() => void togglePrivate()} disabled={saving}>
                  {graph.person.isPrivate ? "Make Public" : "Make Private"}
                </button>

                <button onClick={() => void deleteSelectedPerson()} disabled={saving}>
                  Delete
                </button>
              </div>
            </div>

            <div
              style={{
                marginBottom: 16,
                border: "1px solid #ddd",
                borderRadius: 8,
                padding: 12,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Add Relationship</div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                <button
                  onClick={() => setRelMode("PARENT")}
                  disabled={relBusy}
                  style={{ fontWeight: relMode === "PARENT" ? 700 : 400 }}
                >
                  Parent
                </button>
                <button
                  onClick={() => setRelMode("CHILD")}
                  disabled={relBusy}
                  style={{ fontWeight: relMode === "CHILD" ? 700 : 400 }}
                >
                  Child
                </button>
                <button
                  onClick={() => setRelMode("SPOUSE")}
                  disabled={relBusy}
                  style={{ fontWeight: relMode === "SPOUSE" ? 700 : 400 }}
                >
                  Spouse
                </button>
              </div>

              <div style={{ fontWeight: 600, marginBottom: 6 }}>{relTitle}</div>

              <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <input
                    placeholder={`New ${
                      relMode === "SPOUSE" ? "spouse" : relMode === "PARENT" ? "parent" : "child"
                    } full name`}
                    value={relNewName}
                    onChange={(e) => setRelNewName(e.target.value)}
                    style={{ minWidth: 280 }}
                  />

                  <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={relNewPrivate}
                      onChange={(e) => setRelNewPrivate(e.target.checked)}
                    />
                    Private
                  </label>

                  <button onClick={() => void createAndLink()} disabled={relBusy || !relNewName.trim()}>
                    {relBusy ? "Working..." : "Create & link"}
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 12, position: "relative" }}>
                <input
                  placeholder={`Search existing ${
                    relMode === "SPOUSE" ? "spouse" : relMode === "PARENT" ? "parent" : "child"
                  }`}
                  value={relQuery}
                  onChange={(e) => setRelQuery(e.target.value)}
                  onFocus={() => relQuery.trim() && setRelSearchOpen(true)}
                  style={{ width: "100%" }}
                />

                {relSearchOpen && relResults.length > 0 ? (
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
                    {relResults
                      .filter((r) => r.id !== selectedId)
                      .map((r) => (
                        <div key={r.id} style={{ padding: 6 }}>
                          <button
                            style={{ cursor: "pointer", width: "100%", textAlign: "left" }}
                            onClick={() => {
                              setRelQuery("");
                              setRelSearchOpen(false);
                              void linkRelationship(r.id);
                            }}
                          >
                            {r.fullName} {r.isPrivate ? "(private)" : ""}
                          </button>
                        </div>
                      ))}
                  </div>
                ) : null}
              </div>
            </div>

            <TreeView
              graph={graph}
              onSelectPerson={(id) => {
                void jumpToPerson(id);
              }}
              onInvite={inviteToClaim}
              canInvite={true}
            />

          </>
        ) : null}
      </section>
    </main>
  );
}

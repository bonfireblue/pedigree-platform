"use client";
// Pedigree page - March 17 2026 rebuild v2
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { PedigreeCanvas } from "@/components/PedigreeCanvas";

type TreeApiNode = {
  id: string;
  fullName?: string;
  isPrivate?: boolean;
  createdAt?: string;
  bio?: string | null;
  location?: string | null;
  birthDate?: string | null;
  deathDate?: string | null;
  photoUrl?: string | null;
  claimedByUserId?: string | null;
};

type TreeApiEdgePC = { parentId: string; childId: string };
type TreeApiEdgeSp = { aId: string; bId: string };

type TreeApiResponse = {
  centerId: string;
  depth: number;
  limit: number;
  nodes: TreeApiNode[];
  edges: {
    parentChild: TreeApiEdgePC[];
    spouse: TreeApiEdgeSp[];
  };
};

type PersonLite = {
  id: string;
  fullName: string;
  photoUrl?: string | null;
  createdAt: string;
  isPrivate: boolean;
  claimedByUserId?: string | null;
};

type PersonDetail = {
  person: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    fullName: string;
    bio?: string | null;
    location?: string | null;
    grewUpLocation?: string | null;
    currentLocation?: string | null;
    birthDate?: string | null;
    deathDate?: string | null;
    gender?: string | null;
    photoUrl?: string | null;
    proudOf?: string | null;
    occupation?: string | null;
    interests?: string | null;
    isPrivate: boolean;
    isVerified: boolean;
    createdAt: string;
    claimedByUserId?: string | null;
  };
  parents: PersonLite[];
  children: PersonLite[];
  spouses: PersonLite[];
  siblings: PersonLite[];
  canVouch?: boolean; // Whether current user can vouch for this person
};

type SearchResult = {
  id: string;
  fullName: string;
  isPrivate: boolean;
  createdAt: string;
  claimedByUserId?: string | null;
};

type RelMode = "PARENT" | "CHILD" | "SPOUSE" | "SIBLING";

function badgeStyle(claimed: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 0.2,
    background: claimed ? "#ecfdf5" : "#fffbeb",
    color: claimed ? "#166534" : "#b45309",
    border: `1px solid ${claimed ? "#a7f3d0" : "#fde68a"}`,
  };
}

function sectionCardStyle(): React.CSSProperties {
  return {
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    background: "#ffffff",
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.06)",
  };
}

function drawerListButtonStyle(): React.CSSProperties {
  return {
    width: "100%",
    textAlign: "left",
    border: "1px solid #e5e7eb",
    background: "#ffffff",
    borderRadius: 12,
    padding: "10px 12px",
    cursor: "pointer",
  };
}

function actionButtonStyle(primary = false): React.CSSProperties {
  return {
    borderRadius: 12,
    padding: "10px 14px",
    border: primary ? "1px solid #111827" : "1px solid #d1d5db",
    background: primary ? "#111827" : "#ffffff",
    color: primary ? "#ffffff" : "#111827",
    fontWeight: 700,
    cursor: "pointer",
  };
}

// Pedigree tree view component
export default function PedigreePage() {
  const { status } = useSession();

  const initialCenterId = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("centerId") ?? "";
  }, []);

  const [treeData, setTreeData] = useState<TreeApiResponse | null>(null);
  const [currentCenterId, setCurrentCenterId] = useState<string>(initialCenterId);
  const [selectedId, setSelectedId] = useState<string>(initialCenterId);
  const [focusKey, setFocusKey] = useState(0);
  const [personDetail, setPersonDetail] = useState<PersonDetail | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loadingTree, setLoadingTree] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  const [relMode, setRelMode] = useState<RelMode>("PARENT");
  const [relBusy, setRelBusy] = useState(false);
  const [newRelativeName, setNewRelativeName] = useState("");
  const [newRelativePrivate, setNewRelativePrivate] = useState(false);
  const [existingRelQuery, setExistingRelQuery] = useState("");
  const [existingRelResults, setExistingRelResults] = useState<SearchResult[]>([]);
  const [existingRelOpen, setExistingRelOpen] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePhone, setInvitePhone] = useState("");
  const [inviteMethod, setInviteMethod] = useState<"email" | "phone">("email");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [vouchBusy, setVouchBusy] = useState(false);

  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editGender, setEditGender] = useState("");
  const [editBirthDate, setEditBirthDate] = useState("");
  const [editDeathDate, setEditDeathDate] = useState("");
  const [editGrewUpLocation, setEditGrewUpLocation] = useState("");
  const [editOccupation, setEditOccupation] = useState("");
  const [editProudOf, setEditProudOf] = useState("");
  const [editInterests, setEditInterests] = useState("");
  const [editPhotoUrl, setEditPhotoUrl] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [editBusy, setEditBusy] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      window.location.href = "/sign-in";
    }
  }, [status]);

  const syncUrl = useCallback((id: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("centerId", id);
    window.history.replaceState({}, "", url.toString());
  }, []);

  const loadPersonDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);

    try {
      const res = await fetch(`/api/people/${encodeURIComponent(id)}`);
      const data = await res.json().catch(() => null);

      if (!res.ok || !data) {
        setPersonDetail(null);
        setError((data as any)?.error ?? `PERSON_LOAD_FAILED_${res.status}`);
        return;
      }

      const detail = data as PersonDetail;
      setPersonDetail(detail);
      
      // Populate form fields
setEditFirstName(detail.person.firstName ?? "");
  setEditLastName(detail.person.lastName ?? "");
  setEditGender(detail.person.gender ?? "");
  setEditBirthDate(detail.person.birthDate ? detail.person.birthDate.split("T")[0] : "");
      setEditDeathDate(detail.person.deathDate ? detail.person.deathDate.split("T")[0] : "");
      setEditGrewUpLocation(detail.person.grewUpLocation ?? "");
      setEditOccupation(detail.person.occupation ?? "");
      setEditProudOf(detail.person.proudOf ?? "");
      setEditInterests(detail.person.interests ?? "");
      setEditPhotoUrl(detail.person.photoUrl ?? "");
      
      // Open sidebar on mobile when selecting a person
      setSidebarOpen(true);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const loadTree = useCallback(
    async (id: string) => {
      if (!id) return;

      setLoadingTree(true);
      setError(null);

      try {
        const res = await fetch(`/api/tree?centerId=${encodeURIComponent(id)}&depth=4`);
        const data = (await res.json().catch(() => null)) as TreeApiResponse | null;

        if (!res.ok || !data) {
          setTreeData(null);
          setError((data as any)?.error ?? `TREE_LOAD_FAILED_${res.status}`);
          return;
        }

        setCurrentCenterId(id);
        setSelectedId(id);
        setTreeData(data);
        syncUrl(id);
        setFocusKey((v) => v + 1);
        await loadPersonDetail(id);
      } finally {
        setLoadingTree(false);
      }
    },
    [loadPersonDetail, syncUrl]
  );

  useEffect(() => {
    async function initializeTree() {
      if (initialCenterId) {
        // If centerId is in URL, use it
        void loadTree(initialCenterId);
      } else {
        // Otherwise, fetch user's claimed person and center on them
        try {
          const res = await fetch("/api/me");
          if (res.ok) {
            const data = await res.json();
            if (data.claimedPersonId) {
              void loadTree(data.claimedPersonId);
            }
          }
        } catch {
          // Silently fail - user will see "Missing centerId" message
        }
      }
    }
    void initializeTree();
  }, [initialCenterId, loadTree]);

    const selectPersonInCurrentTree = useCallback(
    async (id: string) => {
      setSelectedId(id);
      setError(null);
      setFocusKey((v) => v + 1);
      await loadPersonDetail(id);
    },
    [loadPersonDetail]
  );

  const runGlobalSearch = useCallback(
    async (q: string) => {
      if (!selectedId || !q.trim()) {
        setSearchResults([]);
        return;
      }

      const res = await fetch(
        `/api/people/search?q=${encodeURIComponent(q)}&centerId=${encodeURIComponent(selectedId)}&limit=10`
      );

      if (!res.ok) return;

      const data = await res.json().catch(() => ({ results: [] }));
      setSearchResults(data.results ?? []);
    },
    [selectedId]
  );

  useEffect(() => {
    const q = searchQuery.trim();

    if (!q || !selectedId) {
      setSearchOpen(false);
      setSearchResults([]);
      return;
    }

    setSearchOpen(true);
    const t = setTimeout(() => {
      void runGlobalSearch(q);
    }, 180);

    return () => clearTimeout(t);
  }, [searchQuery, runGlobalSearch, selectedId]);

  const runRelationshipSearch = useCallback(
    async (q: string) => {
      if (!selectedId || !q.trim()) {
        setExistingRelResults([]);
        return;
      }

      const res = await fetch(
        `/api/people/search?q=${encodeURIComponent(q)}&centerId=${encodeURIComponent(selectedId)}&limit=10`
      );

      if (!res.ok) return;

      const data = await res.json().catch(() => ({ results: [] }));
      setExistingRelResults((data.results ?? []).filter((p: SearchResult) => p.id !== selectedId));
    },
    [selectedId]
  );

  useEffect(() => {
    const q = existingRelQuery.trim();

    if (!q || !selectedId) {
      setExistingRelOpen(false);
      setExistingRelResults([]);
      return;
    }

    setExistingRelOpen(true);
    const t = setTimeout(() => {
      void runRelationshipSearch(q);
    }, 180);

    return () => clearTimeout(t);
  }, [existingRelQuery, runRelationshipSearch, selectedId]);

  async function createPersonQuick(fullName: string, isPrivate: boolean) {
    const res = await fetch("/api/people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName, isPrivate }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error ?? `CREATE_FAILED_${res.status}`);
    return data.person.id as string;
  }

  async function linkParentChild(parentId: string, childId: string) {
    const res = await fetch("/api/relationships/parent-child", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId, childId }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error ?? `LINK_PC_FAILED_${res.status}`);
  }

  async function linkSpouse(aId: string, bId: string) {
    const res = await fetch("/api/relationships/spouse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aId, bId }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error ?? `LINK_SPOUSE_FAILED_${res.status}`);
  }

  async function linkRelationship(targetId: string) {
    if (!selectedId) return;

    setRelBusy(true);
    setError(null);

    try {
      if (relMode === "PARENT") {
        await linkParentChild(targetId, selectedId);
      } else if (relMode === "CHILD") {
        await linkParentChild(selectedId, targetId);
      } else if (relMode === "SPOUSE") {
        await linkSpouse(selectedId, targetId);
        // When linking spouses, also link the selected person's children to the new spouse
        if (personDetail?.children && personDetail.children.length > 0) {
          for (const child of personDetail.children) {
            try {
              await linkParentChild(targetId, child.id);
            } catch {
              // Ignore errors if relationship already exists
            }
          }
        }
      } else if (relMode === "SIBLING") {
        // Link sibling by sharing parents
        if (!personDetail?.parents || personDetail.parents.length === 0) {
          throw new Error("Cannot add sibling: selected person has no parents. Add parents first.");
        }
        // Link the sibling to all of the selected person's parents
        for (const parent of personDetail.parents) {
          await linkParentChild(parent.id, targetId);
        }
      }

      setExistingRelQuery("");
      setExistingRelOpen(false);
      await loadTree(selectedId);
    } catch (e: unknown) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setRelBusy(false);
    }
  }

  async function createAndLinkRelationship() {
    const name = newRelativeName.trim();
    if (!selectedId || !name) return;

    setRelBusy(true);
    setError(null);

    try {
      const newId = await createPersonQuick(name, newRelativePrivate);

      if (relMode === "PARENT") {
        await linkParentChild(newId, selectedId);
      } else if (relMode === "CHILD") {
        await linkParentChild(selectedId, newId);
      } else if (relMode === "SPOUSE") {
        await linkSpouse(selectedId, newId);
        // When linking spouses, also link the selected person's children to the new spouse
        if (personDetail?.children && personDetail.children.length > 0) {
          for (const child of personDetail.children) {
            try {
              await linkParentChild(newId, child.id);
            } catch {
              // Ignore errors if relationship already exists
            }
          }
        }
      } else if (relMode === "SIBLING") {
        // Link sibling by sharing parents
        if (!personDetail?.parents || personDetail.parents.length === 0) {
          throw new Error("Cannot add sibling: selected person has no parents. Add parents first.");
        }
        // Link the new sibling to all of the selected person's parents
        for (const parent of personDetail.parents) {
          await linkParentChild(parent.id, newId);
        }
      }

      setNewRelativeName("");
      setNewRelativePrivate(false);
      await loadTree(selectedId);
    } catch (e: unknown) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setRelBusy(false);
    }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingPhoto(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Photo upload failed");
        return;
      }

      // Store the pathname for serving via /api/file route
      setEditPhotoUrl(data.pathname);
    } catch {
      setError("Photo upload failed");
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function saveSelectedPerson() {
    if (!selectedId) return;

    // Compute fullName from firstName + lastName
    const fullName = [editFirstName.trim(), editLastName.trim()].filter(Boolean).join(" ") || "Unnamed";

    setEditBusy(true);
    setError(null);

    try {
      // Use new simplified save-profile API
      const res = await fetch("/api/save-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          personId: selectedId,
          firstName: editFirstName.trim() || null,
          lastName: editLastName.trim() || null,
          fullName,
          gender: editGender || null,
          birthDate: editBirthDate || null,
          deathDate: editDeathDate || null,
          grewUpLocation: editGrewUpLocation.trim() || null,
          occupation: editOccupation.trim() || null,
          proudOf: editProudOf.trim() || null,
          interests: editInterests.trim() || null,
          photoUrl: editPhotoUrl || null,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error ?? `SAVE_FAILED_${res.status}`);
        return;
      }
      await loadTree(selectedId);
      await loadPersonDetail(selectedId);
    } finally {
      setEditBusy(false);
    }
  }

  async function togglePrivacy() {
    if (!selectedId || !personDetail) return;

    setEditBusy(true);
    setError(null);

    try {
      const res = await fetch(`/api/people/${encodeURIComponent(selectedId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isPrivate: !personDetail.person.isPrivate }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error ?? `PRIVACY_TOGGLE_FAILED_${res.status}`);
        return;
      }

      await loadTree(selectedId);
    } finally {
      setEditBusy(false);
    }
  }

async function sendInvite() {
    const contact = inviteMethod === "email" ? inviteEmail.trim() : invitePhone.trim();
    if (!selectedId || !contact) return;
    
    setInviteBusy(true);
    setError(null);
    
    try {
      const payload: { targetPersonId: string; email?: string; phone?: string } = {
        targetPersonId: selectedId,
      };
      if (inviteMethod === "email") {
        payload.email = inviteEmail.trim();
      } else {
        payload.phone = invitePhone.trim();
      }

      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      
      const data = await res.json().catch(() => ({}));
      
      if (!res.ok) {
        setError(data?.error ?? `INVITE_FAILED_${res.status}`);
        return;
      }
      
      setInviteEmail("");
      setInvitePhone("");
      window.prompt("Invite link (share this with the person)", data.inviteUrl);
      await loadTree(selectedId);
    } finally {
      setInviteBusy(false);
    }
  }

  async function deleteParentChildRelationship(parentId: string, childId: string) {
    if (!confirm("Are you sure you want to remove this parent-child relationship?")) {
      return;
    }
    
    setError(null);
    
    try {
      const res = await fetch("/api/relationships/parent-child", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId, childId }),
      });
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? `DELETE_FAILED_${res.status}`);
        return;
      }
      
      // Refresh the person detail to update relationships
      if (selectedId) {
        await loadPersonDetail(selectedId);
        await loadTree(selectedId);
      }
    } catch (e: unknown) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }

  async function deleteSpouseRelationship(spouseId: string) {
    if (!selectedId) return;
    if (!confirm("Are you sure you want to remove this spouse relationship?")) {
      return;
    }
    
    setError(null);
    
    try {
      const res = await fetch("/api/relationships/spouse", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aId: selectedId, bId: spouseId }),
      });
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? `DELETE_FAILED_${res.status}`);
        return;
      }
      
      // Refresh the person detail to update relationships
      if (selectedId) {
        await loadPersonDetail(selectedId);
        await loadTree(selectedId);
      }
    } catch (e: unknown) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }

  async function deleteSiblingRelationship(siblingId: string) {
    if (!selectedId) return;
    if (!confirm("Are you sure you want to remove this sibling relationship? This will remove the shared parent-child links.")) {
      return;
    }
    
    setError(null);
    
    try {
      // To remove a sibling relationship, we need to remove the parent-child links
      // that make them siblings (shared parents)
      // Get parents of both the selected person and the sibling
      const selectedParents = personDetail?.parents ?? [];
      
      // For each shared parent, remove the sibling as their child
      for (const parent of selectedParents) {
        await fetch("/api/relationships/parent-child", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parentId: parent.id, childId: siblingId }),
        });
      }
      
      // Refresh the person detail to update relationships
      if (selectedId) {
        await loadPersonDetail(selectedId);
        await loadTree(selectedId);
      }
    } catch (e: unknown) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }

  async function vouchForPerson() {
    if (!selectedId) return;
    
    setVouchBusy(true);
    setError(null);
    
    try {
      const res = await fetch("/api/vouch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId: selectedId }),
      });
      
      const data = await res.json().catch(() => ({}));
      
      if (!res.ok) {
        setError(data?.error ?? `VOUCH_FAILED_${res.status}`);
        return;
      }
      
      // Refresh person detail to show updated verification status
      await loadPersonDetail(selectedId);
    } finally {
      setVouchBusy(false);
    }
  }

  const selectedName = personDetail?.person.fullName ?? "No person selected";
  const selectedClaimed = Boolean(personDetail?.person.claimedByUserId);
  const relTitle =
    relMode === "PARENT" ? "Add Parent" : relMode === "CHILD" ? "Add Child" : relMode === "SPOUSE" ? "Add Spouse" : "Add Sibling";

  if (status === "loading") return null;
  if (status === "unauthenticated") return null;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        color: "#0f172a",
      }}
    >
      {/* Mobile sidebar toggle */}
      <button
        type="button"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        style={{
          display: "none",
          position: "fixed",
          bottom: 20,
          right: 20,
          zIndex: 50,
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "#111827",
          color: "#ffffff",
          border: "none",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          cursor: "pointer",
          fontSize: 24,
        }}
        className="mobile-fab"
      >
        {sidebarOpen ? "×" : "☰"}
      </button>

      <style>{`
        @media (max-width: 768px) {
          .mobile-fab { display: flex !important; align-items: center; justify-content: center; }
          .pedigree-grid { grid-template-columns: 1fr !important; }
          .pedigree-sidebar { 
            position: fixed !important; 
            top: 0 !important; 
            right: 0 !important; 
            bottom: 0 !important; 
            width: 100% !important;
            max-width: 360px !important;
            z-index: 40 !important;
            transform: translateX(${sidebarOpen ? "0" : "100%"});
            transition: transform 0.3s ease;
            overflow-y: auto !important;
            background: #f8fafc !important;
            padding: 16px !important;
          }
          .pedigree-overlay {
            display: ${sidebarOpen ? "block" : "none"} !important;
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.3);
            z-index: 35;
          }
        }
      `}</style>

      {/* Mobile overlay */}
      <div 
        className="pedigree-overlay" 
        style={{ display: "none" }}
        onClick={() => setSidebarOpen(false)}
      />

      <div
        className="pedigree-grid"
        style={{
          height: "100vh",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 360px",
          gap: 16,
          padding: 16,
        }}
      >
        <section
          style={{
            minWidth: 0,
            display: "grid",
            gridTemplateRows: "auto minmax(0, 1fr)",
            gap: 16,
          }}
        >
          <div
            style={{
              ...sectionCardStyle(),
              padding: 14,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 14,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.5, color: "#64748b" }}>
                PEDIGREE WORKSPACE
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, marginTop: 2 }}>Family Graph</div>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ position: "relative", width: 320, maxWidth: "100%" }}>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => searchQuery.trim() && setSearchOpen(true)}
                  placeholder={selectedId ? "Search people in this graph…" : "Load a person first…"}
                  disabled={!selectedId}
                  style={{
  width: "100%",
  borderRadius: 12,
  border: "1px solid #d1d5db",
  padding: "11px 14px",
  background: "#ffffff",
  color: "#111827",
  caretColor: "#111827"
}}
                />

                {searchOpen && searchResults.length > 0 ? (
                  <div
                    style={{
                      position: "absolute",
                      top: 48,
                      left: 0,
                      right: 0,
                      zIndex: 20,
                      background: "#ffffff",
                      border: "1px solid #e5e7eb",
                      borderRadius: 14,
                      boxShadow: "0 18px 40px rgba(15, 23, 42, 0.12)",
                      padding: 8,
                    }}
                  >
                    {searchResults.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          setSearchQuery("");
                          setSearchOpen(false);
                          void selectPersonInCurrentTree(r.id);
                        }}
                        style={{
  width: "100%",
  textAlign: "left",
  border: "none",
  background: "#ffffff",
  color: "#111827",
  padding: "10px 12px",
  borderRadius: 10,
  cursor: "pointer",
}}
                      >
                        <div style={{ fontWeight: 700, color: "#111827" }}>{r.fullName}</div>
                        <div style={{ marginTop: 2, fontSize: 12, color: "#64748b" }}>
                          {r.isPrivate ? "Private" : "Public"} ·{" "}
                          {r.claimedByUserId ? "Claimed" : "Unclaimed"}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!selectedId) return;
                  void loadTree(selectedId);
                }}
                disabled={!selectedId}
                style={actionButtonStyle(false)}
              >
                Recenter
              </button>

              
            </div>
          </div>

          <div
            style={{
              ...sectionCardStyle(),
              overflow: "hidden",
              minHeight: 0,
              position: "relative",
            }}
          >
            {!initialCenterId && !selectedId ? (
              <div style={{ padding: 24 }}>
                <div style={{ fontSize: 20, fontWeight: 800 }}>Missing centerId</div>
                <div style={{ marginTop: 8, color: "#64748b" }}>
                  Open a person first, then enter pedigree view.
                </div>
              </div>
            ) : loadingTree && !treeData ? (
              <div style={{ padding: 24 }}>Loading pedigree…</div>
            ) : treeData ? (
             <PedigreeCanvas
  data={treeData}
  selectedId={selectedId}
  focusKey={focusKey}
  onSelectPerson={(id) => {
    void selectPersonInCurrentTree(id);
  }}
  onNavigateToTree={(id) => {
    void loadTree(id);
  }}
/>

            ) : (
              <div style={{ padding: 24 }}>Unable to load pedigree.</div>
            )}

            {error ? (
              <div
                style={{
                  position: "absolute",
                  left: 16,
                  bottom: 16,
                  maxWidth: 440,
                  background: "#fef2f2",
                  color: "#991b1b",
                  border: "1px solid #fecaca",
                  borderRadius: 14,
                  padding: "12px 14px",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: 4 }}>Error</div>
                <div style={{ fontSize: 14 }}>{error}</div>
              </div>
            ) : null}
          </div>
        </section>

        <aside
          className="pedigree-sidebar"
          style={{
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: 16,
            overflowY: "auto",
            maxHeight: "calc(100vh - 32px)",
            paddingBottom: 24,
          }}
        >
          <div style={{ ...sectionCardStyle(), padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.5, color: "#64748b" }}>
                  SELECTED PERSON
                </div>
                <div style={{ marginTop: 4, fontSize: 22, lineHeight: "28px", fontWeight: 900 }}>
                  {selectedName}
                </div>
              </div>

              <div style={{ display: "flex", gap: 6 }}>
                <div style={badgeStyle(selectedClaimed)}>
                  {selectedClaimed ? "CLAIMED" : "UNCLAIMED"}
                </div>
                {selectedClaimed && (
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      borderRadius: 999,
                      padding: "4px 10px",
                      fontSize: 11,
                      fontWeight: 700,
                      background: personDetail?.person.isVerified ? "#d1fae5" : "#fef3c7",
                      color: personDetail?.person.isVerified ? "#065f46" : "#92400e",
                    }}
                  >
                    {personDetail?.person.isVerified ? "VERIFIED" : "UNVERIFIED"}
                  </div>
                )}
              </div>
            </div>

            {loadingDetail ? (
              <div style={{ marginTop: 12, color: "#64748b" }}>Loading details…</div>
            ) : personDetail ? (
              <>
                <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
                  {/* Profile Photo */}
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <div
                      style={{
                        width: 80,
                        height: 80,
                        borderRadius: "50%",
                        background: "#e2e8f0",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                        flexShrink: 0,
                      }}
                    >
                      {editPhotoUrl ? (
                        <img
                          src={`/api/file?pathname=${encodeURIComponent(editPhotoUrl)}`}
                          alt="Profile"
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        <span style={{ fontSize: 32, color: "#94a3b8" }}>
                          {editFirstName?.[0]?.toUpperCase() || editLastName?.[0]?.toUpperCase() || "?"}
                        </span>
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <label
                        style={{
                          display: "inline-block",
                          padding: "8px 16px",
                          borderRadius: 8,
                          background: "#f1f5f9",
                          color: "#334155",
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: uploadingPhoto ? "not-allowed" : "pointer",
                          opacity: uploadingPhoto ? 0.6 : 1,
                        }}
                      >
                        {uploadingPhoto ? "Uploading..." : editPhotoUrl ? "Change Photo" : "Upload Photo"}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/gif,image/webp"
                          onChange={handlePhotoUpload}
                          disabled={uploadingPhoto}
                          style={{ display: "none" }}
                        />
                      </label>
                      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>
                        JPEG, PNG, GIF, or WebP. Max 5MB.
                      </div>
                    </div>
                  </div>

                  {/* Name fields */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4, display: "block" }}>
                        First Name
                      </label>
                      <input
                        value={editFirstName}
                        onChange={(e) => setEditFirstName(e.target.value)}
                        placeholder="First name"
                        style={{
                          width: "100%",
                          borderRadius: 12,
                          border: "1px solid #d1d5db",
                          padding: "10px 12px",
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4, display: "block" }}>
                        Last Name
                      </label>
                      <input
                        value={editLastName}
                        onChange={(e) => setEditLastName(e.target.value)}
                        placeholder="Last name"
                        style={{
                          width: "100%",
                          borderRadius: 12,
                          border: "1px solid #d1d5db",
                          padding: "10px 12px",
                        }}
                      />
                    </div>
                  </div>

                  {/* Gender */}
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4, display: "block" }}>
                      Gender
                    </label>
                    <select
                      value={editGender}
                      onChange={(e) => setEditGender(e.target.value)}
                      style={{
                        width: "100%",
                        borderRadius: 12,
                        border: "1px solid #d1d5db",
                        padding: "10px 12px",
                        background: "#111827",
                        color: "#ffffff",
                      }}
                    >
                      <option value="" style={{ background: "#111827", color: "#ffffff" }}>Prefer not to say</option>
                      <option value="male" style={{ background: "#111827", color: "#ffffff" }}>Male</option>
                      <option value="female" style={{ background: "#111827", color: "#ffffff" }}>Female</option>
                      <option value="other" style={{ background: "#111827", color: "#ffffff" }}>Other</option>
                    </select>
                  </div>

                  {/* Lived From - To */}
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4, display: "block" }}>
                      Lived From - To
                    </label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "center" }}>
                      <input
                        type="date"
                        value={editBirthDate}
                        onChange={(e) => setEditBirthDate(e.target.value)}
                        style={{
                          width: "100%",
                          borderRadius: 12,
                          border: "1px solid #d1d5db",
                          padding: "10px 12px",
                        }}
                      />
                      <span style={{ color: "#64748b", fontWeight: 700 }}>—</span>
                      <input
                        type="date"
                        value={editDeathDate}
                        onChange={(e) => setEditDeathDate(e.target.value)}
                        placeholder="Present"
                        style={{
                          width: "100%",
                          borderRadius: 12,
                          border: "1px solid #d1d5db",
                          padding: "10px 12px",
                        }}
                      />
                    </div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                      Leave end date empty for living people
                    </div>
                  </div>

                  {/* Where did you grow up */}
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4, display: "block" }}>
                      Where did you grow up?
                    </label>
                    <input
                      value={editGrewUpLocation}
                      onChange={(e) => setEditGrewUpLocation(e.target.value)}
                      placeholder="City, Country"
                      style={{
                        width: "100%",
                        borderRadius: 12,
                        border: "1px solid #d1d5db",
                        padding: "10px 12px",
                      }}
                    />
                  </div>

                  {/* Occupation */}
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4, display: "block" }}>
                      Occupation / Career
                    </label>
                    <input
                      value={editOccupation}
                      onChange={(e) => setEditOccupation(e.target.value)}
                      placeholder="What do/did you do for work?"
                      style={{
                        width: "100%",
                        borderRadius: 12,
                        border: "1px solid #d1d5db",
                        padding: "10px 12px",
                      }}
                    />
                  </div>

                  {/* Interests */}
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4, display: "block" }}>
                      Hobbies / Interests
                    </label>
                    <input
                      value={editInterests}
                      onChange={(e) => setEditInterests(e.target.value)}
                      placeholder="What do you enjoy doing?"
                      style={{
                        width: "100%",
                        borderRadius: 12,
                        border: "1px solid #d1d5db",
                        padding: "10px 12px",
                      }}
                    />
                  </div>

                  {/* Proud Of */}
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4, display: "block" }}>
                      What are you most proud of?
                    </label>
                    <textarea
                      value={editProudOf}
                      onChange={(e) => setEditProudOf(e.target.value)}
                      placeholder="Share something you're proud of..."
                      rows={3}
                      style={{
                        width: "100%",
                        borderRadius: 12,
                        border: "1px solid #d1d5db",
                        padding: "10px 12px",
                        resize: "vertical",
                        fontFamily: "inherit",
                      }}
                    />
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => void saveSelectedPerson()}
                      disabled={!selectedId || editBusy}
                      style={actionButtonStyle(true)}
                    >
                      {editBusy ? "Saving..." : "Save Changes"}
                    </button>

                    <button
                      type="button"
                      onClick={() => void togglePrivacy()}
                      disabled={!selectedId || editBusy}
                      style={actionButtonStyle(false)}
                    >
                      {personDetail.person.isPrivate ? "Make Public" : "Make Private"}
                    </button>

                    {/* Vouch button - only show for claimed but unverified persons */}
                    {selectedClaimed && !personDetail.person.isVerified && personDetail.canVouch && (
                      <button
                        type="button"
                        onClick={() => void vouchForPerson()}
                        disabled={vouchBusy}
                        style={{
                          ...actionButtonStyle(false),
                          background: "#d1fae5",
                          color: "#065f46",
                          border: "1px solid #10b981",
                        }}
                      >
                        {vouchBusy ? "Vouching..." : "Verify This Person"}
                      </button>
                    )}
                  </div>
                </div>

                {!selectedClaimed ? (
                  <div
                    style={{
                      marginTop: 16,
                      borderTop: "1px solid #e5e7eb",
                      paddingTop: 16,
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.5, color: "#64748b" }}>
                      INVITE TO CLAIM
                    </div>

                    {/* Email/Phone toggle */}
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <button
                        type="button"
                        onClick={() => setInviteMethod("email")}
                        style={{
                          flex: 1,
                          padding: "8px 12px",
                          borderRadius: 8,
                          border: "1px solid #d1d5db",
                          background: inviteMethod === "email" ? "#111827" : "#ffffff",
                          color: inviteMethod === "email" ? "#ffffff" : "#111827",
                          fontWeight: 600,
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        Email
                      </button>
                      <button
                        type="button"
                        onClick={() => setInviteMethod("phone")}
                        style={{
                          flex: 1,
                          padding: "8px 12px",
                          borderRadius: 8,
                          border: "1px solid #d1d5db",
                          background: inviteMethod === "phone" ? "#111827" : "#ffffff",
                          color: inviteMethod === "phone" ? "#ffffff" : "#111827",
                          fontWeight: 600,
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        Phone
                      </button>
                    </div>

                    <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                      {inviteMethod === "email" ? (
                        <input
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          placeholder="person@email.com"
                          type="email"
                          style={{
                            width: "100%",
                            borderRadius: 12,
                            border: "1px solid #d1d5db",
                            padding: "10px 12px",
                          }}
                        />
                      ) : (
                        <input
                          value={invitePhone}
                          onChange={(e) => setInvitePhone(e.target.value)}
                          placeholder="+1 (555) 123-4567"
                          type="tel"
                          style={{
                            width: "100%",
                            borderRadius: 12,
                            border: "1px solid #d1d5db",
                            padding: "10px 12px",
                          }}
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => void sendInvite()}
                        disabled={(inviteMethod === "email" ? !inviteEmail.trim() : !invitePhone.trim()) || inviteBusy}
                        style={actionButtonStyle(false)}
                      >
                        {inviteBusy ? "Sending..." : "Create Invite Link"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>

          <div style={{ ...sectionCardStyle(), padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.5, color: "#64748b" }}>
              RELATIONSHIP ACTIONS
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              <button
                type="button"
                onClick={() => setRelMode("PARENT")}
                style={{
                  ...actionButtonStyle(relMode === "PARENT"),
                  background: relMode === "PARENT" ? "#111827" : "#ffffff",
                  color: relMode === "PARENT" ? "#ffffff" : "#111827",
                }}
              >
                Parent
              </button>

              <button
                type="button"
                onClick={() => setRelMode("CHILD")}
                style={{
                  ...actionButtonStyle(relMode === "CHILD"),
                  background: relMode === "CHILD" ? "#111827" : "#ffffff",
                  color: relMode === "CHILD" ? "#ffffff" : "#111827",
                }}
              >
                Child
              </button>

              <button
                type="button"
                onClick={() => setRelMode("SPOUSE")}
                style={{
                  ...actionButtonStyle(relMode === "SPOUSE"),
                  background: relMode === "SPOUSE" ? "#111827" : "#ffffff",
                  color: relMode === "SPOUSE" ? "#ffffff" : "#111827",
                }}
              >
                Spouse
              </button>

              <button
                type="button"
                onClick={() => setRelMode("SIBLING")}
                style={{
                  ...actionButtonStyle(relMode === "SIBLING"),
                  background: relMode === "SIBLING" ? "#111827" : "#ffffff",
                  color: relMode === "SIBLING" ? "#ffffff" : "#111827",
                }}
              >
                Sibling
              </button>
            </div>

            <div style={{ marginTop: 14, fontWeight: 800 }}>{relTitle}</div>

            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              <input
                value={newRelativeName}
                onChange={(e) => setNewRelativeName(e.target.value)}
                placeholder={`Create new ${relMode.toLowerCase()}`}
                style={{
                  width: "100%",
                  borderRadius: 12,
                  border: "1px solid #d1d5db",
                  padding: "10px 12px",
                }}
              />

              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={newRelativePrivate}
                  onChange={(e) => setNewRelativePrivate(e.target.checked)}
                />
                Make new profile private
              </label>

              <button
                type="button"
                onClick={() => void createAndLinkRelationship()}
                disabled={!selectedId || !newRelativeName.trim() || relBusy}
                style={actionButtonStyle(true)}
              >
                {relBusy ? "Working..." : "Create & link"}
              </button>
            </div>

            <div
              style={{
                marginTop: 16,
                paddingTop: 16,
                borderTop: "1px solid #e5e7eb",
                position: "relative",
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Link existing person</div>

              <input
                value={existingRelQuery}
                onChange={(e) => setExistingRelQuery(e.target.value)}
                onFocus={() => existingRelQuery.trim() && setExistingRelOpen(true)}
                placeholder={`Search existing ${relMode.toLowerCase()}`}
                style={{
  width: "100%",
  borderRadius: 12,
  border: "1px solid #d1d5db",
  padding: "10px 12px",
  background: "#ffffff",
  color: "#111827",
  caretColor: "#111827"
}}
              />

              {existingRelOpen && existingRelResults.length > 0 ? (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: 96,
                    zIndex: 20,
                    background: "#ffffff",
                    border: "1px solid #e5e7eb",
                    borderRadius: 14,
                    boxShadow: "0 18px 40px rgba(15, 23, 42, 0.12)",
                    padding: 8,
                  }}
                >
                  {existingRelResults.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        setExistingRelQuery("");
                        setExistingRelOpen(false);
                        void linkRelationship(r.id);
                      }}
                    style={{
  width: "100%",
  textAlign: "left",
  border: "none",
  background: "#ffffff",
  color: "#111827",
  padding: "10px 12px",
  borderRadius: 10,
  cursor: "pointer",
}}
                    >
                      <div style={{ fontWeight: 700, color: "#111827" }}>{r.fullName}</div>
                      <div style={{ marginTop: 2, fontSize: 12, color: "#64748b" }}>
                        {r.isPrivate ? "Private" : "Public"} ·{" "}
                        {r.claimedByUserId ? "Claimed" : "Unclaimed"}
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div style={{ ...sectionCardStyle(), padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.5, color: "#64748b" }}>
              QUICK COUNTS
            </div>

            <div
              style={{
                marginTop: 12,
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 10,
              }}
            >
              {[
                { label: "Parents", value: personDetail?.parents.length ?? 0 },
                { label: "Spouses", value: personDetail?.spouses.length ?? 0 },
                { label: "Children", value: personDetail?.children.length ?? 0 },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 14,
                    padding: "12px 10px",
                    textAlign: "center",
                    background: "#f8fafc",
                  }}
                >
                  <div style={{ fontSize: 22, fontWeight: 900 }}>{item.value}</div>
                  <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>{item.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...sectionCardStyle(), padding: 16, flexShrink: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.5, color: "#64748b" }}>
              RELATIONSHIPS
            </div>

            <RelationshipSection
              title="Parents"
              people={personDetail?.parents ?? []}
              onSelect={(id) => void selectPersonInCurrentTree(id)}
              onDelete={selectedId ? (parentId) => void deleteParentChildRelationship(parentId, selectedId) : undefined}
            />

            <RelationshipSection
              title="Spouses"
              people={personDetail?.spouses ?? []}
              onSelect={(id) => void selectPersonInCurrentTree(id)}
              onDelete={(spouseId) => void deleteSpouseRelationship(spouseId)}
            />

            <RelationshipSection
              title="Children"
              people={personDetail?.children ?? []}
              onSelect={(id) => void selectPersonInCurrentTree(id)}
              onDelete={selectedId ? (childId) => void deleteParentChildRelationship(selectedId, childId) : undefined}
            />

<RelationshipSection
              title="Siblings"
              people={personDetail?.siblings ?? []}
              onSelect={(id) => void selectPersonInCurrentTree(id)}
              onDelete={(siblingId) => void deleteSiblingRelationship(siblingId)}
            />
          </div>
        </aside>
      </div>
    </main>
  );
}

function RelationshipSection({
  title,
  people,
  onSelect,
  onDelete,
}: {
  title: string;
  people: PersonLite[];
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>
        {title} <span style={{ color: "#64748b" }}>({people.length})</span>
      </div>

      {people.length === 0 ? (
        <div
          style={{
            border: "1px dashed #d1d5db",
            borderRadius: 12,
            padding: "10px 12px",
            color: "#64748b",
            fontSize: 14,
          }}
        >
          None
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {people.map((p) => (
            <div
              key={p.id}
              style={{
                ...drawerListButtonStyle(),
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <button
                type="button"
                onClick={() => onSelect(p.id)}
                style={{ flex: 1, textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <div style={{ fontWeight: 800, color: "#111827" }}>{p.fullName}</div>
                  <div style={badgeStyle(Boolean(p.claimedByUserId))}>
                    {p.claimedByUserId ? "Claimed" : "Unclaimed"}
                  </div>
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>
                  {p.isPrivate ? "Private" : "Public"}
                </div>
              </button>
              {onDelete && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(p.id);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 4,
                    cursor: "pointer",
                    color: "#dc2626",
                    fontSize: 18,
                    lineHeight: 1,
                    flexShrink: 0,
                  }}
                  title="Remove relationship"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

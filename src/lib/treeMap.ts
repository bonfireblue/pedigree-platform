type Person = {
  id: string;
  fullName: string;
  createdAt: string;
  isPrivate: boolean;
};

export type PersonGraph = {
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

// Currently identity mapping; exists so UI can normalize/guard future schema changes.
export function toPersonGraph(raw: any): PersonGraph {
  return raw as PersonGraph;
}

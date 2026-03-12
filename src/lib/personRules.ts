export class PersonError extends Error {
  code: string;
  status: number;

  constructor(code: string, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export type PersonAccessRow = {
  createdById: string;
  claimedByUserId: string | null;
  isPrivate: boolean;
};

export type PersonEditRow = {
  createdById: string;
  claimedByUserId: string | null;
};

export type DeleteImpactWarning = {
  code:
    | "PERSON_HAS_PARENT_LINKS"
    | "PERSON_HAS_CHILD_LINKS"
    | "PERSON_HAS_SPOUSE_LINKS"
    | "PERSON_HAS_INVITATIONS"
    | "PERSON_IS_CLAIMED";
  message: string;
};

export function isVerifiedRole(role: string) {
  return role === "FOUNDER" || role === "TRUSTED" || role === "ADMIN";
}

export function canViewPerson(
  meId: string,
  isAdmin: boolean,
  membershipRole: string,
  row: PersonAccessRow
) {
  if (!row.isPrivate) return true;
  if (isAdmin) return true;
  if (row.createdById === meId) return true;
  if (row.claimedByUserId === meId) return true;
  if (isVerifiedRole(membershipRole)) return true;
  return false;
}

export function canEditPerson(meId: string, membershipRole: string, row: PersonEditRow) {
  // Claimed node: only the claimer can edit
  if (row.claimedByUserId) {
    return row.claimedByUserId === meId;
  }

  // Unclaimed node: verified roles can edit any unclaimed node
  if (isVerifiedRole(membershipRole)) return true;

  // Otherwise only creator can edit
  return row.createdById === meId;
}

export function normalizeTrimmedString(
  value: unknown,
  fieldCode: string,
  maxLen: number,
  allowNull = false
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) {
    if (allowNull) return null;
    throw new PersonError(fieldCode, 400);
  }
  if (typeof value !== "string") {
    throw new PersonError(fieldCode, 400);
  }

  const trimmed = value.trim();

  if (!allowNull && trimmed.length === 0) {
    throw new PersonError(fieldCode, 400);
  }

  if (trimmed.length > maxLen) {
    throw new PersonError(fieldCode, 400);
  }

  if (allowNull && trimmed.length === 0) return null;
  return trimmed;
}

export function normalizeFullName(value: unknown) {
  return normalizeTrimmedString(value, "INVALID_FULL_NAME", 120, false) as string | undefined;
}

export function normalizeBio(value: unknown) {
  return normalizeTrimmedString(value, "INVALID_BIO", 2000, true);
}

export function normalizeLocation(value: unknown) {
  return normalizeTrimmedString(value, "INVALID_LOCATION", 160, true);
}

export function normalizeOptionalDate(value: unknown, fieldCode: string): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw new PersonError(fieldCode, 400);

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new PersonError(fieldCode, 400);
  }

  return d;
}

export function normalizePhotoUrl(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw new PersonError("INVALID_PHOTO_URL", 400);

  const trimmed = value.trim();
  if (trimmed.length > 500) throw new PersonError("INVALID_PHOTO_URL", 400);

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new PersonError("INVALID_PHOTO_URL", 400);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new PersonError("INVALID_PHOTO_URL", 400);
  }

  return trimmed;
}

export function assertBirthBeforeDeath(birthDate?: Date | null, deathDate?: Date | null) {
  if (birthDate && deathDate && birthDate.getTime() > deathDate.getTime()) {
    throw new PersonError("BIRTH_AFTER_DEATH", 400);
  }
}

export function buildPersonPatch(body: any) {
  const fullName = normalizeFullName(body?.fullName);
  const bio = normalizeBio(body?.bio);
  const location = normalizeLocation(body?.location);
  const birthDate = normalizeOptionalDate(body?.birthDate, "INVALID_BIRTH_DATE");
  const deathDate = normalizeOptionalDate(body?.deathDate, "INVALID_DEATH_DATE");
  const photoUrl = normalizePhotoUrl(body?.photoUrl);
  const isPrivate = typeof body?.isPrivate === "boolean" ? body.isPrivate : undefined;

  assertBirthBeforeDeath(
    birthDate === undefined ? undefined : birthDate,
    deathDate === undefined ? undefined : deathDate
  );

  const data: Record<string, unknown> = {};

  if (fullName !== undefined) data.fullName = fullName;
  if (bio !== undefined) data.bio = bio;
  if (location !== undefined) data.location = location;
  if (birthDate !== undefined) data.birthDate = birthDate;
  if (deathDate !== undefined) data.deathDate = deathDate;
  if (photoUrl !== undefined) data.photoUrl = photoUrl;
  if (isPrivate !== undefined) data.isPrivate = isPrivate;

  if (Object.keys(data).length === 0) {
    throw new PersonError("NO_VALID_FIELDS", 400);
  }

  return data;
}
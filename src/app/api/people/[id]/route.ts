import { NextResponse } from "next/server";
import { sql } from "@/lib/neon-db";
import { rateLimit, clientKey } from "@/lib/rateLimit";
import { readJson } from "@/lib/body";
import { requireMe } from "@/lib/authz";
import {
  PersonError,
  buildPersonPatch,
  canEditPerson,
  canViewPerson,
} from "@/lib/personRules";

type Ctx = {
  params: Promise<{ id: string }>;
};

type PersonRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  createdAt: string;
  isPrivate: boolean;
  isVerified: boolean;
  bio: string | null;
  location: string | null;
  grewUpLocation: string | null;
  currentLocation: string | null;
  birthDate: string | null;
  deathDate: string | null;
  gender: string | null;
  photoUrl: string | null;
  proudOf: string | null;
  occupation: string | null;
  interests: string | null;
  createdById: string;
  claimedByUserId: string | null;
  familyGraphId: string;
  deletedAt: string | null;
  deletedByUserId: string | null;
  purgeAfter: string | null;
};

function slim(p: PersonRow) {
  return {
    id: p.id,
    fullName: p.fullName,
    createdAt: p.createdAt,
    isPrivate: p.isPrivate,
    claimedByUserId: p.claimedByUserId,
  };
}

async function getMembershipOr403(userId: string, familyGraphId: string) {
  const rows = await sql`
    SELECT role FROM "Membership"
    WHERE "userId" = ${userId} AND "familyGraphId" = ${familyGraphId}
  `;
  return rows.length > 0 ? rows[0] : null;
}

function add7Days(date: Date) {
  return new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000);
}

function normalizeMode(value: unknown): "soft" | "restore" | "now" {
  if (value === "restore") return "restore";
  if (value === "now") return "now";
  return "soft";
}

async function permanentlyDeletePerson(personId: string) {
  await sql`DELETE FROM "ParentChild" WHERE "parentId" = ${personId} OR "childId" = ${personId}`;
  await sql`DELETE FROM "Spouse" WHERE "aId" = ${personId} OR "bId" = ${personId}`;
  await sql`DELETE FROM "Invitation" WHERE "targetPersonId" = ${personId}`;
  await sql`DELETE FROM "Person" WHERE id = ${personId}`;
}

export async function GET(req: Request, ctx: Ctx) {
  const lim = rateLimit({ key: `people_id:${clientKey(req)}`, limit: 120, windowMs: 60_000 });
  if (!lim.ok) return NextResponse.json({ error: "RATE_LIMIT" }, { status: 429 });

  const me = await requireMe();
  if (!me) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await ctx.params;

  const personRows = await sql`
    SELECT id, "firstName", "lastName", "fullName", "createdAt", "isPrivate", "isVerified", bio, location,
           "grewUpLocation", "currentLocation", "birthDate", "deathDate", "gender", "photoUrl",
           "proudOf", occupation, interests, "createdById", "claimedByUserId", "familyGraphId",
           "deletedAt", "deletedByUserId", "purgeAfter"
    FROM "Person"
    WHERE id = ${id}
  `;

  if (personRows.length === 0 || personRows[0].deletedAt) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const person = personRows[0] as PersonRow;

  const membership = await getMembershipOr403(me.id, person.familyGraphId);
  if (!membership) return NextResponse.json({ error: "NO_MEMBERSHIP" }, { status: 403 });

  if (!canViewPerson(me.id, me.isAdmin, membership.role, person)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  // Get parents
  const parentRelRows = await sql`
    SELECT p.id, p."fullName", p."createdAt", p."isPrivate", p."claimedByUserId",
           p."createdById", p."deletedAt"
    FROM "ParentChild" pc
    JOIN "Person" p ON pc."parentId" = p.id
    WHERE pc."childId" = ${id}
  `;
  const parents = parentRelRows
    .filter((p: PersonRow) => !p.deletedAt)
    .filter((p: PersonRow) => canViewPerson(me.id, me.isAdmin, membership.role, p))
    .map(slim);

  // Get children
  const childRelRows = await sql`
    SELECT p.id, p."fullName", p."createdAt", p."isPrivate", p."claimedByUserId",
           p."createdById", p."deletedAt"
    FROM "ParentChild" pc
    JOIN "Person" p ON pc."childId" = p.id
    WHERE pc."parentId" = ${id}
  `;
  const children = childRelRows
    .filter((p: PersonRow) => !p.deletedAt)
    .filter((p: PersonRow) => canViewPerson(me.id, me.isAdmin, membership.role, p))
    .map(slim);

  // Get spouses
  const spouseRowsA = await sql`
    SELECT p.id, p."fullName", p."createdAt", p."isPrivate", p."claimedByUserId",
           p."createdById", p."deletedAt"
    FROM "Spouse" s
    JOIN "Person" p ON s."bId" = p.id
    WHERE s."aId" = ${id}
  `;
  const spouseRowsB = await sql`
    SELECT p.id, p."fullName", p."createdAt", p."isPrivate", p."claimedByUserId",
           p."createdById", p."deletedAt"
    FROM "Spouse" s
    JOIN "Person" p ON s."aId" = p.id
    WHERE s."bId" = ${id}
  `;
  const spouses = [...spouseRowsA, ...spouseRowsB]
    .filter((p: PersonRow) => !p.deletedAt)
    .filter((p: PersonRow) => canViewPerson(me.id, me.isAdmin, membership.role, p))
    .map(slim);

  // Get siblings (people who share at least one parent with this person)
  const siblingRows = await sql`
    SELECT DISTINCT p.id, p."fullName", p."createdAt", p."isPrivate", p."claimedByUserId",
           p."createdById", p."deletedAt"
    FROM "ParentChild" pc1
    JOIN "ParentChild" pc2 ON pc1."parentId" = pc2."parentId"
    JOIN "Person" p ON pc2."childId" = p.id
    WHERE pc1."childId" = ${id}
      AND pc2."childId" != ${id}
  `;
  const siblings = siblingRows
    .filter((p: PersonRow) => !p.deletedAt)
    .filter((p: PersonRow) => canViewPerson(me.id, me.isAdmin, membership.role, p))
    .map(slim);

  // Check if current user can vouch for this person
  let canVouch = false;
  if (person.claimedByUserId && !person.isVerified) {
    // Get current user's claimed person to check if they're verified
    const myPersonRows = await sql`
      SELECT id, "isVerified" FROM "Person"
      WHERE "claimedByUserId" = ${me.id} AND "familyGraphId" = ${person.familyGraphId}
    `;
    const myPerson = myPersonRows[0];
    
    if (myPerson?.isVerified) {
      // Check if current user was the original inviter
      const wasInviter = await sql`
        SELECT id FROM "Invitation"
        WHERE "targetPersonId" = ${person.id}
          AND "inviterUserId" = ${me.id}
          AND status = 'ACCEPTED'
        LIMIT 1
      `;
      // Can vouch if verified and wasn't the inviter
      canVouch = wasInviter.length === 0;
    }
  }

  return NextResponse.json({
    person: {
      id: person.id,
      firstName: person.firstName,
      lastName: person.lastName,
      fullName: person.fullName,
      bio: person.bio,
      location: person.location,
      grewUpLocation: person.grewUpLocation,
      currentLocation: person.currentLocation,
      birthDate: person.birthDate,
      deathDate: person.deathDate,
      gender: person.gender,
      photoUrl: person.photoUrl,
      proudOf: person.proudOf,
      occupation: person.occupation,
      interests: person.interests,
      isPrivate: person.isPrivate,
      isVerified: person.isVerified ?? false,
      createdAt: person.createdAt,
      claimedByUserId: person.claimedByUserId,
      deletedAt: person.deletedAt,
      purgeAfter: person.purgeAfter,
    },
    parents,
    children,
    spouses,
    siblings,
    canVouch,
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const lim = rateLimit({ key: `people_patch:${clientKey(req)}`, limit: 60, windowMs: 60_000 });
  if (!lim.ok) return NextResponse.json({ error: "RATE_LIMIT" }, { status: 429 });

  try {
    const me = await requireMe();
    if (!me) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const { id } = await ctx.params;

    const parsed = await readJson(req, 50_000);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const existingRows = await sql`
      SELECT id, "createdById", "claimedByUserId", "familyGraphId", "deletedAt"
      FROM "Person"
      WHERE id = ${id}
    `;

    if (existingRows.length === 0 || existingRows[0].deletedAt) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const existing = existingRows[0];

    const membership = await getMembershipOr403(me.id, existing.familyGraphId);
    if (!membership) return NextResponse.json({ error: "NO_MEMBERSHIP" }, { status: 403 });

    if (!canEditPerson(me.id, membership.role, existing)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    // Simplified direct update - bypass buildPersonPatch
    const body = parsed.json;
    
    // Build SET clause with explicit fields
    const updates: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;

    if (body.firstName !== undefined) { updates.push(`"firstName" = $${idx++}`); vals.push(body.firstName); }
    if (body.lastName !== undefined) { updates.push(`"lastName" = $${idx++}`); vals.push(body.lastName); }
    if (body.fullName !== undefined) { updates.push(`"fullName" = $${idx++}`); vals.push(body.fullName); }
    if (body.gender !== undefined) { updates.push(`"gender" = $${idx++}`); vals.push(body.gender); }
    if (body.birthDate !== undefined) { updates.push(`"birthDate" = $${idx++}`); vals.push(body.birthDate); }
    if (body.deathDate !== undefined) { updates.push(`"deathDate" = $${idx++}`); vals.push(body.deathDate); }
    if (body.grewUpLocation !== undefined) { updates.push(`"grewUpLocation" = $${idx++}`); vals.push(body.grewUpLocation); }
    if (body.occupation !== undefined) { updates.push(`"occupation" = $${idx++}`); vals.push(body.occupation); }
    if (body.proudOf !== undefined) { updates.push(`"proudOf" = $${idx++}`); vals.push(body.proudOf); }
    if (body.interests !== undefined) { updates.push(`"interests" = $${idx++}`); vals.push(body.interests); }
    if (body.photoUrl !== undefined) { updates.push(`"photoUrl" = $${idx++}`); vals.push(body.photoUrl); }
    if (body.isPrivate !== undefined) { updates.push(`"isPrivate" = $${idx++}`); vals.push(body.isPrivate); }
    if (body.bio !== undefined) { updates.push(`"bio" = $${idx++}`); vals.push(body.bio); }
    if (body.location !== undefined) { updates.push(`"location" = $${idx++}`); vals.push(body.location); }

    if (updates.length > 0) {
      vals.push(id);
      const query = `UPDATE "Person" SET ${updates.join(", ")} WHERE id = $${idx}`;
      await sql.unsafe(query, vals);
    }

    const updatedRows = await sql`
      SELECT id, "firstName", "lastName", "fullName", bio, location, "grewUpLocation",
             "currentLocation", "birthDate", "deathDate", "photoUrl", "proudOf",
             occupation, interests, "isPrivate", "createdAt", "claimedByUserId",
             "deletedAt", "purgeAfter"
      FROM "Person"
      WHERE id = ${id}
    `;

    const updated = updatedRows[0];

    return NextResponse.json({
      person: {
        id: updated.id,
        firstName: updated.firstName,
        lastName: updated.lastName,
        fullName: updated.fullName,
        bio: updated.bio,
        location: updated.location,
        grewUpLocation: updated.grewUpLocation,
        currentLocation: updated.currentLocation,
        birthDate: updated.birthDate,
        deathDate: updated.deathDate,
        photoUrl: updated.photoUrl,
        proudOf: updated.proudOf,
        occupation: updated.occupation,
        interests: updated.interests,
        isPrivate: updated.isPrivate,
        createdAt: updated.createdAt,
        claimedByUserId: updated.claimedByUserId,
        deletedAt: updated.deletedAt,
        purgeAfter: updated.purgeAfter,
      },
    });
  } catch (error) {
    if (error instanceof PersonError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }

    console.error("PATCH /api/people/[id] failed", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const lim = rateLimit({ key: `people_delete:${clientKey(req)}`, limit: 60, windowMs: 60_000 });
  if (!lim.ok) return NextResponse.json({ error: "RATE_LIMIT" }, { status: 429 });

  try {
    const me = await requireMe();
    if (!me) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const { id } = await ctx.params;

    const parsed = await readJson(req, 20_000);
    const body = parsed.ok ? parsed.json : {};
    const mode = normalizeMode(body?.mode);

    const existingRows = await sql`
      SELECT id, "fullName", "createdById", "claimedByUserId", "familyGraphId",
             "deletedAt", "purgeAfter"
      FROM "Person"
      WHERE id = ${id}
    `;

    if (existingRows.length === 0) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const existing = existingRows[0];

    const membership = await getMembershipOr403(me.id, existing.familyGraphId);
    if (!membership) return NextResponse.json({ error: "NO_MEMBERSHIP" }, { status: 403 });

    if (!canEditPerson(me.id, membership.role, existing)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    if (existing.claimedByUserId) {
      return NextResponse.json({ error: "PERSON_DELETE_CLAIMED_FORBIDDEN" }, { status: 400 });
    }

    if (mode === "restore") {
      if (!existing.deletedAt) {
        return NextResponse.json({ error: "PERSON_NOT_SOFT_DELETED" }, { status: 400 });
      }

      await sql`
        UPDATE "Person"
        SET "deletedAt" = NULL, "deletedByUserId" = NULL, "purgeAfter" = NULL
        WHERE id = ${existing.id}
      `;

      return NextResponse.json({
        restored: true,
        personId: existing.id,
      });
    }

    if (mode === "now") {
      await permanentlyDeletePerson(existing.id);

      return NextResponse.json({
        deleted: true,
        mode: "now",
        personId: existing.id,
      });
    }

    if (existing.deletedAt) {
      return NextResponse.json({
        alreadyDeleted: true,
        mode: "soft",
        personId: existing.id,
        deletedAt: existing.deletedAt,
        purgeAfter: existing.purgeAfter,
      });
    }

    const now = new Date();
    const purgeAfter = add7Days(now);

    // Soft delete with cleanup
    await sql`
      UPDATE "Invitation"
      SET status = 'REVOKED'
      WHERE "targetPersonId" = ${existing.id} AND status = 'PENDING'
    `;

    await sql`DELETE FROM "ParentChild" WHERE "parentId" = ${existing.id} OR "childId" = ${existing.id}`;
    await sql`DELETE FROM "Spouse" WHERE "aId" = ${existing.id} OR "bId" = ${existing.id}`;

    await sql`
      UPDATE "Person"
      SET "deletedAt" = ${now.toISOString()}, "deletedByUserId" = ${me.id}, "purgeAfter" = ${purgeAfter.toISOString()}
      WHERE id = ${existing.id}
    `;

    return NextResponse.json({
      deleted: true,
      mode: "soft",
      personId: existing.id,
      deletedAt: now.toISOString(),
      purgeAfter: purgeAfter.toISOString(),
    });
  } catch (error) {
    if (error instanceof PersonError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }

    console.error("DELETE /api/people/[id] failed", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}

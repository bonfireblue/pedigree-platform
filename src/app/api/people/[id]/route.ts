import { NextResponse } from "next/server";
import { sql } from "@/lib/neon-db";
import { rateLimit, clientKey } from "@/lib/rateLimit";
import { readJson } from "@/lib/body";
import { requireMe } from "@/lib/authz";
import {
  PersonError,
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
    SELECT "familyGraphId", role
    FROM "Membership"
    WHERE "userId" = ${userId}
      AND "familyGraphId" = ${familyGraphId}
  `;
  return rows[0] ?? null;
}

function normalizeMode(raw: unknown): "soft" | "now" | "restore" {
  if (raw === "now") return "now";
  if (raw === "restore") return "restore";
  return "soft";
}

function add7Days(d: Date): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + 7);
  return result;
}

async function permanentlyDeletePerson(personId: string): Promise<void> {
  await sql`DELETE FROM "ParentChild" WHERE "parentId" = ${personId} OR "childId" = ${personId}`;
  await sql`DELETE FROM "Spouse" WHERE "aId" = ${personId} OR "bId" = ${personId}`;
  await sql`DELETE FROM "Vouch" WHERE "fromPersonId" = ${personId} OR "toPersonId" = ${personId}`;
  await sql`DELETE FROM "Invitation" WHERE "targetPersonId" = ${personId}`;
  await sql`DELETE FROM "Person" WHERE id = ${personId}`;
}

export async function GET(req: Request, ctx: Ctx) {
  const lim = rateLimit({ key: `people_get:${clientKey(req)}`, limit: 120, windowMs: 60_000 });
  if (!lim.ok) return NextResponse.json({ error: "RATE_LIMIT" }, { status: 429 });

  try {
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

    if (personRows.length === 0) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const person: PersonRow = personRows[0];

    if (person.deletedAt && !me.isAdmin) {
      return NextResponse.json({ error: "PERSON_DELETED" }, { status: 410 });
    }

    const membership = await getMembershipOr403(me.id, person.familyGraphId);
    if (!membership) return NextResponse.json({ error: "NO_MEMBERSHIP" }, { status: 403 });

    if (!canViewPerson(me.id, me.isAdmin, membership.role, person)) {
      return NextResponse.json({ error: "VIEW_FORBIDDEN" }, { status: 403 });
    }

    const parentRows = await sql`
      SELECT p.id, p."fullName", p."createdAt", p."isPrivate", p."claimedByUserId",
             p."createdById", p."deletedAt"
      FROM "ParentChild" pc
      JOIN "Person" p ON pc."parentId" = p.id
      WHERE pc."childId" = ${id}
    `;
    const parents = parentRows
      .filter((p: PersonRow) => !p.deletedAt)
      .filter((p: PersonRow) => canViewPerson(me.id, me.isAdmin, membership.role, p))
      .map(slim);

    const childRows = await sql`
      SELECT p.id, p."fullName", p."createdAt", p."isPrivate", p."claimedByUserId",
             p."createdById", p."deletedAt"
      FROM "ParentChild" pc
      JOIN "Person" p ON pc."childId" = p.id
      WHERE pc."parentId" = ${id}
    `;
    const children = childRows
      .filter((p: PersonRow) => !p.deletedAt)
      .filter((p: PersonRow) => canViewPerson(me.id, me.isAdmin, membership.role, p))
      .map(slim);

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

    const meClaimedPersonRows = await sql`
      SELECT id FROM "Person"
      WHERE "claimedByUserId" = ${me.id}
        AND "familyGraphId" = ${person.familyGraphId}
      LIMIT 1
    `;
    const meClaimedPersonId = meClaimedPersonRows.length > 0 ? meClaimedPersonRows[0].id : null;

    let canVouch = false;
    if (person.claimedByUserId && !person.isVerified && meClaimedPersonId && meClaimedPersonId !== person.id) {
      const existingVouch = await sql`
        SELECT id FROM "Vouch"
        WHERE "fromPersonId" = ${meClaimedPersonId}
          AND "toPersonId" = ${person.id}
      `;
      canVouch = existingVouch.length === 0;
    }

    return NextResponse.json({
      person: {
        id: person.id,
        firstName: person.firstName,
        lastName: person.lastName,
        fullName: person.fullName,
        createdAt: person.createdAt,
        isPrivate: person.isPrivate,
        isVerified: person.isVerified,
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
        claimedByUserId: person.claimedByUserId,
      },
      parents,
      children,
      spouses,
      siblings,
      canVouch,
    });
  } catch (error) {
    if (error instanceof PersonError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }

    console.error("GET /api/people/[id] failed", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const lim = rateLimit({ key: `people_patch:${clientKey(req)}`, limit: 60, windowMs: 60_000 });
  if (!lim.ok) return NextResponse.json({ error: "RATE_LIMIT" }, { status: 429 });

  try {
    const me = await requireMe();
    if (!me) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const { id } = await ctx.params;

    const parsed = await readJson(req, 50_000);
    if (!parsed.ok) return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
    const body = parsed.json;

    const existingRows = await sql`
      SELECT id, "isPrivate", "createdById", "claimedByUserId", "familyGraphId", "deletedAt"
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

    const updates: string[] = [];
    const vals: (string | boolean | null)[] = [];
    let idx = 1;

    if (body.firstName !== undefined) { updates.push(`"firstName" = $${idx++}`); vals.push(body.firstName); }
    if (body.lastName !== undefined) { updates.push(`"lastName" = $${idx++}`); vals.push(body.lastName); }
    if (body.fullName !== undefined) { updates.push(`"fullName" = $${idx++}`); vals.push(body.fullName); }
    if (body.gender !== undefined) { updates.push(`"gender" = $${idx++}`); vals.push(body.gender); }
    if (body.birthDate !== undefined) { updates.push(`"birthDate" = $${idx++}`); vals.push(body.birthDate); }
    if (body.deathDate !== undefined) { updates.push(`"deathDate" = $${idx++}`); vals.push(body.deathDate); }
    if (body.grewUpLocation !== undefined) { updates.push(`"grewUpLocation" = $${idx++}`); vals.push(body.grewUpLocation); }
    if (body.currentLocation !== undefined) { updates.push(`"currentLocation" = $${idx++}`); vals.push(body.currentLocation); }
    if (body.bio !== undefined) { updates.push(`"bio" = $${idx++}`); vals.push(body.bio); }
    if (body.location !== undefined) { updates.push(`"location" = $${idx++}`); vals.push(body.location); }
    if (body.occupation !== undefined) { updates.push(`"occupation" = $${idx++}`); vals.push(body.occupation); }
    if (body.proudOf !== undefined) { updates.push(`"proudOf" = $${idx++}`); vals.push(body.proudOf); }
    if (body.interests !== undefined) { updates.push(`"interests" = $${idx++}`); vals.push(body.interests); }
    if (body.photoUrl !== undefined) { updates.push(`"photoUrl" = $${idx++}`); vals.push(body.photoUrl); }
    if (body.isPrivate !== undefined) { updates.push(`"isPrivate" = $${idx++}`); vals.push(!!body.isPrivate); }

    if (updates.length === 0) {
      return NextResponse.json({ error: "NOTHING_TO_UPDATE" }, { status: 400 });
    }

    vals.push(id);
    const query = `UPDATE "Person" SET ${updates.join(", ")} WHERE id = $${idx} RETURNING id, "fullName", "isPrivate"`;

    const updated = await sql.query(query, vals);

    return NextResponse.json({
      updated: true,
      person: updated.rows[0],
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

    console.error("DELETE /api/people/[id] error:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}

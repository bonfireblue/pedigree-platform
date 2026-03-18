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

type Ctx = { params: Promise<{ id: string }> };

interface PersonRow {
  id: string;
  fullName: string;
  createdAt: string;
  isPrivate: boolean;
  claimedByUserId: string | null;
  createdById: string;
  deletedAt: string | null;
}

async function getMembershipOr403(userId: string, familyGraphId: string) {
  const rows = await sql`
    SELECT role FROM "Membership"
    WHERE "userId" = ${userId} AND "familyGraphId" = ${familyGraphId}
  `;
  return rows.length > 0 ? rows[0] : null;
}

export async function GET(req: Request, ctx: Ctx) {
  const lim = rateLimit({ key: `members_get:${clientKey(req)}`, limit: 120, windowMs: 60_000 });
  if (!lim.ok) return NextResponse.json({ error: "RATE_LIMIT" }, { status: 429 });

  try {
    const me = await requireMe();
    if (!me) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const { id } = await ctx.params;

    const personRows = await sql`
      SELECT p.*, fg.name as "familyGraphName"
      FROM "Person" p
      JOIN "FamilyGraph" fg ON p."familyGraphId" = fg.id
      WHERE p.id = ${id}
    `;

    if (personRows.length === 0) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const person = personRows[0];

    if (person.deletedAt) {
      return NextResponse.json({ error: "PERSON_DELETED" }, { status: 404 });
    }

    const membership = await getMembershipOr403(me.id, person.familyGraphId);
    if (!membership) {
      return NextResponse.json({ error: "NO_MEMBERSHIP" }, { status: 403 });
    }

    if (!canViewPerson(me.id, me.isAdmin, membership.role, person)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const slim = (p: PersonRow) => ({
      id: p.id,
      fullName: p.fullName,
      createdAt: p.createdAt,
      isPrivate: p.isPrivate,
      claimedByUserId: p.claimedByUserId,
    });

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

    const claimedPersonRows = await sql`
      SELECT id FROM "Person"
      WHERE "claimedByUserId" = ${me.id}
        AND "familyGraphId" = ${person.familyGraphId}
      LIMIT 1
    `;
    const myPersonId = claimedPersonRows.length > 0 ? claimedPersonRows[0].id : null;

    let canVouch = false;
    if (
      myPersonId &&
      person.claimedByUserId &&
      !person.isVerified &&
      person.claimedByUserId !== me.id
    ) {
      const alreadyVouched = await sql`
        SELECT id FROM "Vouch"
        WHERE "fromPersonId" = ${myPersonId} AND "toPersonId" = ${id}
      `;
      canVouch = alreadyVouched.length === 0;
    }

    return NextResponse.json({
      person: {
        id: person.id,
        fullName: person.fullName,
        birthDate: person.birthDate,
        deathDate: person.deathDate,
        gender: person.gender,
        bio: person.bio,
        isPrivate: person.isPrivate,
        isVerified: person.isVerified,
        claimedByUserId: person.claimedByUserId,
        createdById: person.createdById,
        familyGraphId: person.familyGraphId,
        familyGraphName: person.familyGraphName,
        createdAt: person.createdAt,
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

    console.error("GET /api/members/[id] failed", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const lim = rateLimit({ key: `members_patch:${clientKey(req)}`, limit: 60, windowMs: 60_000 });
  if (!lim.ok) return NextResponse.json({ error: "RATE_LIMIT" }, { status: 429 });

  try {
    const me = await requireMe();
    if (!me) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const { id } = await ctx.params;

    const parsed = await readJson(req, 20_000);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const body = parsed.json;

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

    const updates: string[] = [];
    const vals: (string | boolean | null)[] = [];
    let idx = 1;

    if (body.fullName !== undefined) { updates.push(`"fullName" = $${idx++}`); vals.push(body.fullName); }
    if (body.gender !== undefined) { updates.push(`"gender" = $${idx++}`); vals.push(body.gender); }
    if (body.birthDate !== undefined) { updates.push(`"birthDate" = $${idx++}`); vals.push(body.birthDate); }
    if (body.deathDate !== undefined) { updates.push(`"deathDate" = $${idx++}`); vals.push(body.deathDate); }
    if (body.bio !== undefined) { updates.push(`"bio" = $${idx++}`); vals.push(body.bio); }
    if (body.isPrivate !== undefined) { updates.push(`"isPrivate" = $${idx++}`); vals.push(body.isPrivate); }

    if (updates.length === 0) {
      return NextResponse.json({ error: "NO_FIELDS_TO_UPDATE" }, { status: 400 });
    }

    vals.push(id);
    const query = `UPDATE "Person" SET ${updates.join(", ")} WHERE id = $${idx} RETURNING *`;

    const updated = await sql.unsafe(query, vals);

    return NextResponse.json({ person: updated[0] });
  } catch (error) {
    if (error instanceof PersonError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }

    console.error("PATCH /api/members/[id] failed", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}

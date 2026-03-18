// Family member API v5 - Uses raw SQL to bypass Prisma cache issues
import { NextResponse } from "next/server";
import { sql } from "@/lib/neon-db";
import { rateLimit, clientKey } from "@/lib/rateLimit";
import { readJson } from "@/lib/body";
import { requireMe } from "@/lib/authz";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const lim = rateLimit({ key: `fm_get:${clientKey(req)}`, limit: 120, windowMs: 60_000 });
  if (!lim.ok) return NextResponse.json({ error: "RATE_LIMIT" }, { status: 429 });

  try {
    const me = await requireMe();
    if (!me) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const { id } = await ctx.params;

    // Get person using raw SQL
    const personRows = await sql`
      SELECT id, "fullName", gender, "birthDate", "deathDate", "isPrivate", 
             "isVerified", "claimedByUserId", "createdById", "photoUrl"
      FROM "Person"
      WHERE id = ${id} AND "deletedAt" IS NULL
    `;

    if (personRows.length === 0) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const person = personRows[0];

    // Get parents
    const parentRows = await sql`
      SELECT p.id, p."fullName", p."isPrivate", p."claimedByUserId"
      FROM "Person" p
      JOIN "ParentChild" pc ON pc."parentId" = p.id
      WHERE pc."childId" = ${id} AND p."deletedAt" IS NULL
    `;

    // Get children
    const childrenRows = await sql`
      SELECT p.id, p."fullName", p."isPrivate", p."claimedByUserId"
      FROM "Person" p
      JOIN "ParentChild" pc ON pc."childId" = p.id
      WHERE pc."parentId" = ${id} AND p."deletedAt" IS NULL
    `;

    // Get spouses
    const spouseRows = await sql`
      SELECT p.id, p."fullName", p."isPrivate", p."claimedByUserId"
      FROM "Person" p
      WHERE p."deletedAt" IS NULL AND (
        p.id IN (SELECT "bId" FROM "Spouse" WHERE "aId" = ${id})
        OR p.id IN (SELECT "aId" FROM "Spouse" WHERE "bId" = ${id})
      )
    `;

    // Get siblings (people who share a parent)
    const siblingRows = await sql`
      SELECT DISTINCT p.id, p."fullName", p."isPrivate", p."claimedByUserId"
      FROM "Person" p
      JOIN "ParentChild" pc ON pc."childId" = p.id
      WHERE pc."parentId" IN (
        SELECT "parentId" FROM "ParentChild" WHERE "childId" = ${id}
      )
      AND p.id != ${id}
      AND p."deletedAt" IS NULL
    `;

    return NextResponse.json({
      person: {
        id: person.id,
        fullName: person.fullName,
        gender: person.gender,
        birthDate: person.birthDate,
        deathDate: person.deathDate,
        isPrivate: person.isPrivate,
        isVerified: person.isVerified,
        claimedByUserId: person.claimedByUserId,
        photoUrl: person.photoUrl,
      },
      parents: parentRows,
      children: childrenRows,
      spouses: spouseRows,
      siblings: siblingRows,
      canEdit: person.claimedByUserId === me.id || person.createdById === me.id,
      canVouch: person.claimedByUserId && person.claimedByUserId !== me.id && !person.isVerified,
    });
  } catch (error) {
    console.error("GET /api/family-member/[id] error:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const lim = rateLimit({ key: `fm_patch:${clientKey(req)}`, limit: 60, windowMs: 60_000 });
  if (!lim.ok) return NextResponse.json({ error: "RATE_LIMIT" }, { status: 429 });

  try {
    const me = await requireMe();
    if (!me) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const { id } = await ctx.params;
    const parsed = await readJson(req, 50_000);
    if (!parsed.ok) return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });

    const body = parsed.json;

    // Get person
    const personRows = await sql`
      SELECT id, "claimedByUserId", "createdById"
      FROM "Person"
      WHERE id = ${id} AND "deletedAt" IS NULL
    `;

    if (personRows.length === 0) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const person = personRows[0];

    // Check edit permissions
    if (person.claimedByUserId !== me.id && person.createdById !== me.id) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    // Build dynamic update query
    const updates: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;

    if (body.fullName !== undefined) { updates.push(`"fullName" = $${idx++}`); vals.push(body.fullName); }
    if (body.gender !== undefined) { updates.push(`"gender" = $${idx++}`); vals.push(body.gender); }
    if (body.birthDate !== undefined) { updates.push(`"birthDate" = $${idx++}`); vals.push(body.birthDate || null); }
    if (body.deathDate !== undefined) { updates.push(`"deathDate" = $${idx++}`); vals.push(body.deathDate || null); }
    if (body.isPrivate !== undefined) { updates.push(`"isPrivate" = $${idx++}`); vals.push(body.isPrivate); }
    if (body.photoUrl !== undefined) { updates.push(`"photoUrl" = $${idx++}`); vals.push(body.photoUrl); }

    if (updates.length === 0) {
      return NextResponse.json({ error: "NO_UPDATES" }, { status: 400 });
    }

    // Execute update
    vals.push(id);
    const updateQuery = `UPDATE "Person" SET ${updates.join(", ")}, "updatedAt" = NOW() WHERE id = $${idx} RETURNING *`;
    const updated = await sql(updateQuery, vals);

    return NextResponse.json({ person: updated[0] });
  } catch (error) {
    console.error("PATCH /api/family-member/[id] error:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { sql } from "@/lib/neon-db";
import { requireMe } from "@/lib/authz";
import { rateLimit, clientKey } from "@/lib/rateLimit";
import { readJson } from "@/lib/body";

function normalizeFullName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 120) return null;
  return trimmed;
}

async function getOrCreatePrimaryMembership(userId: string) {
  // Check for existing membership
  const existingRows = await sql`
    SELECT "familyGraphId", role 
    FROM "Membership" 
    WHERE "userId" = ${userId} 
    ORDER BY "createdAt" ASC 
    LIMIT 1
  `;

  if (existingRows.length > 0) {
    return {
      familyGraphId: existingRows[0].familyGraphId,
      role: existingRows[0].role,
    };
  }

  // Create new graph and membership
  const graphId = crypto.randomUUID();
  const membershipId = crypto.randomUUID();

  await sql`
    INSERT INTO "FamilyGraph" (id, name, "createdById", "createdAt", "updatedAt")
    VALUES (${graphId}, 'My Family Graph', ${userId}, NOW(), NOW())
  `;

  await sql`
    INSERT INTO "Membership" (id, "userId", "familyGraphId", role, "createdAt", "updatedAt")
    VALUES (${membershipId}, ${userId}, ${graphId}, 'FOUNDER', NOW(), NOW())
  `;

  return {
    familyGraphId: graphId,
    role: "FOUNDER",
  };
}

export async function GET(req: Request) {
  try {
    const lim = rateLimit({
      key: `people_get:${clientKey(req)}`,
      limit: 120,
      windowMs: 60_000,
    });

    if (!lim.ok) {
      return NextResponse.json({ error: "RATE_LIMIT" }, { status: 429 });
    }

    const me = await requireMe();
    if (!me) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const membershipRows = await sql`
      SELECT "familyGraphId", role 
      FROM "Membership" 
      WHERE "userId" = ${me.id} 
      ORDER BY "createdAt" ASC 
      LIMIT 1
    `;

    // Important UX change:
    // A brand new user should see an empty list, not a hard error.
    if (membershipRows.length === 0) {
      return NextResponse.json({
        people: [],
        familyGraphId: null,
        role: null,
      });
    }

    const membership = membershipRows[0];

    const people = await sql`
      SELECT id, "fullName", "createdAt", "isPrivate", "claimedByUserId"
      FROM "Person"
      WHERE "familyGraphId" = ${membership.familyGraphId}
        AND "deletedAt" IS NULL
      ORDER BY "createdAt" ASC
    `;

    return NextResponse.json({
      people: people.map((p) => ({
        id: p.id,
        fullName: p.fullName,
        createdAt: new Date(p.createdAt).toISOString(),
        isPrivate: p.isPrivate,
        claimedByUserId: p.claimedByUserId,
      })),
      familyGraphId: membership.familyGraphId,
      role: membership.role,
    });
  } catch (error) {
    console.error("GET /api/people failed", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  console.log("[v0] POST /api/people started");
  try {
    const lim = rateLimit({
      key: `people_post:${clientKey(req)}`,
      limit: 60,
      windowMs: 60_000,
    });

    if (!lim.ok) {
      return NextResponse.json({ error: "RATE_LIMIT" }, { status: 429 });
    }

    const me = await requireMe();
    if (!me) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const parsed = await readJson(req, 50_000);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const fullName = normalizeFullName(parsed.json?.fullName);
    const isPrivate = typeof parsed.json?.isPrivate === "boolean" ? parsed.json.isPrivate : false;

    if (!fullName) {
      return NextResponse.json({ error: "INVALID_FULL_NAME" }, { status: 400 });
    }

    // Important UX change:
    // If the user has no graph yet, bootstrap one automatically.
    const membership = await getOrCreatePrimaryMembership(me.id);

    const personId = crypto.randomUUID();

    await sql`
      INSERT INTO "Person" (id, "fullName", "isPrivate", "createdById", "familyGraphId", "createdAt", "updatedAt")
      VALUES (${personId}, ${fullName}, ${isPrivate}, ${me.id}, ${membership.familyGraphId}, NOW(), NOW())
    `;

    const personRows = await sql`
      SELECT id, "fullName", "createdAt", "isPrivate", "claimedByUserId", "familyGraphId"
      FROM "Person"
      WHERE id = ${personId}
    `;

    const person = personRows[0];

    return NextResponse.json(
      {
        person: {
          id: person.id,
          fullName: person.fullName,
          createdAt: new Date(person.createdAt).toISOString(),
          isPrivate: person.isPrivate,
          claimedByUserId: person.claimedByUserId,
          familyGraphId: person.familyGraphId,
        },
        bootstrappedGraph: membership.role === "FOUNDER",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[v0] POST /api/people failed", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `INTERNAL_SERVER_ERROR: ${errorMessage}` }, { status: 500 });
  }
}

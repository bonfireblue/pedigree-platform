import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const { personId, firstName, lastName, fullName, gender, birthDate, deathDate, grewUpLocation, occupation, proudOf, story, interests, photoUrl } = body;

    if (!personId) {
      return NextResponse.json({ error: "Missing personId" }, { status: 400 });
    }

    // Check if the person is claimed - if so, only the owner can edit
    const personCheck = await sql`
      SELECT "claimedByUserId", "createdById" FROM "Person" WHERE id = ${personId} LIMIT 1
    `;

    if (personCheck.length === 0) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    const person = personCheck[0];
    
    // If claimed, only the claimer can edit their own profile
    if (person.claimedByUserId && person.claimedByUserId !== userId) {
      return NextResponse.json({ error: "Only the profile owner can edit this profile" }, { status: 403 });
    }

    // Direct SQL update with COALESCE to preserve existing values when null is passed
    const result = await sql`
      UPDATE "Person"
      SET 
        "firstName" = COALESCE(${firstName}, "firstName"),
        "lastName" = COALESCE(${lastName}, "lastName"),
        "fullName" = COALESCE(${fullName}, "fullName"),
        "gender" = ${gender},
        "birthDate" = ${birthDate ? birthDate : null}::date,
        "deathDate" = ${deathDate ? deathDate : null}::date,
        "grewUpLocation" = ${grewUpLocation},
        "occupation" = ${occupation},
        "proudOf" = ${proudOf},
        "story" = ${story},
        "interests" = ${interests},
        "photoUrl" = ${photoUrl},
        "updatedAt" = NOW()
      WHERE id = ${personId}
      RETURNING id, "fullName", "gender", "birthDate"
    `;

    return NextResponse.json({ success: true, updated: result[0] });
  } catch (error) {
    console.error("Save profile error:", error);
    return NextResponse.json({ error: "Failed to save: " + (error instanceof Error ? error.message : String(error)) }, { status: 500 });
  }
}

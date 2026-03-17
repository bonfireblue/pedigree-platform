import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { personId, firstName, lastName, fullName, birthDate, deathDate, grewUpLocation, occupation, proudOf, interests, photoUrl } = body;

    if (!personId) {
      return NextResponse.json({ error: "Missing personId" }, { status: 400 });
    }

    // Direct SQL update
    await sql`
      UPDATE "Person"
      SET 
        "firstName" = ${firstName},
        "lastName" = ${lastName},
        "fullName" = ${fullName},
        "birthDate" = ${birthDate},
        "deathDate" = ${deathDate},
        "grewUpLocation" = ${grewUpLocation},
        "occupation" = ${occupation},
        "proudOf" = ${proudOf},
        "interests" = ${interests},
        "photoUrl" = ${photoUrl}
      WHERE id = ${personId}
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Save profile error:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}

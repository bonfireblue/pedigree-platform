import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit, clientKey } from "@/lib/rateLimit";
import { readJson } from "@/lib/body";

//
// GET /api/people
// Returns list of visible people for current user
//
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const me = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!me) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const people = await prisma.person.findMany({
    where: {
      OR: [
        { isPrivate: false },
        { createdById: me.id },
        ...(me.role === "ADMIN" ? [{}] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fullName: true,
      createdAt: true,
      isPrivate: true,
    },
  });

  return NextResponse.json({ people });
}

//
// POST /api/people
// Create a new person
//
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const me = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!me) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  // Rate limit: 30 creates per minute per IP
  const rl = rateLimit({
    key: `people:post:${clientKey(req)}`,
    limit: 30,
    windowMs: 60_000,
  });

  if (!rl.ok) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  // Body size guard
  const parsed = await readJson(req);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const body = parsed.json;

  if (!body?.fullName || typeof body.fullName !== "string") {
    return NextResponse.json({ error: "INVALID_FULL_NAME" }, { status: 400 });
  }

  const person = await prisma.person.create({
    data: {
      fullName: body.fullName.trim(),
      isPrivate: Boolean(body.isPrivate),
      createdById: me.id,
    },
    select: {
      id: true,
      fullName: true,
      createdAt: true,
      isPrivate: true,
    },
  });

  return NextResponse.json({ person });
}

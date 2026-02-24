import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readJson } from "@/lib/body";

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

  const membership = await prisma.membership.findFirst({
    where: { userId: me.id },
    select: { familyGraphId: true, role: true },
  });

  if (!membership) {
    return NextResponse.json({ error: "NO_MEMBERSHIP" }, { status: 403 });
  }

  const parsed = await readJson(req);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { targetPersonId, email } = parsed.json;

  if (!targetPersonId || !email) {
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
  }

  const person = await prisma.person.findFirst({
    where: {
      id: targetPersonId,
      familyGraphId: membership.familyGraphId,
    },
  });

  if (!person) {
    return NextResponse.json({ error: "INVALID_PERSON" }, { status: 404 });
  }

  if (person.claimedByUserId) {
    return NextResponse.json({ error: "ALREADY_CLAIMED" }, { status: 400 });
  }

  const token = randomBytes(32).toString("hex");

  const invitation = await prisma.invitation.create({
    data: {
      token,
      email,
      familyGraphId: membership.familyGraphId,
      targetPersonId,
      inviterUserId: me.id,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7), // 7 days
    },
  });

  const inviteUrl = `${process.env.NEXTAUTH_URL}/accept-invite?token=${token}`;

  return NextResponse.json({
    invitationId: invitation.id,
    inviteUrl,
  });
}
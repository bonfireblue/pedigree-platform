import { NextResponse } from "next/server";
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

  const parsed = await readJson(req);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const token = parsed.json?.token;
  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "MISSING_TOKEN" }, { status: 400 });
  }

  const invitation = await prisma.invitation.findUnique({
    where: { token },
    include: { targetPerson: true },
  });

  if (!invitation) {
    return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 404 });
  }

  if (invitation.status !== "PENDING") {
    return NextResponse.json({ error: "INVITE_NOT_PENDING" }, { status: 400 });
  }

  if (invitation.expiresAt && invitation.expiresAt.getTime() < Date.now()) {
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: "EXPIRED" },
    });
    return NextResponse.json({ error: "INVITE_EXPIRED" }, { status: 400 });
  }

  // Enforce: person can only be claimed once
  if (invitation.targetPerson.claimedByUserId) {
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: "REVOKED" },
    });
    return NextResponse.json({ error: "PERSON_ALREADY_CLAIMED" }, { status: 400 });
  }

  // Ensure user is a member of this family graph
  const membership = await prisma.membership.findUnique({
    where: {
      userId_familyGraphId: {
        userId: me.id,
        familyGraphId: invitation.familyGraphId,
      },
    },
  });

  if (!membership) {
    // Add them as MEMBER. invitedByUserId tracks trust chain later.
    await prisma.membership.create({
      data: {
        userId: me.id,
        familyGraphId: invitation.familyGraphId,
        role: "MEMBER",
        invitedByUserId: invitation.inviterUserId,
      },
    });
  }

  // Claim the person node
  await prisma.person.update({
    where: { id: invitation.targetPersonId },
    data: { claimedByUserId: me.id },
  });

  // Mark invitation accepted
  await prisma.invitation.update({
    where: { id: invitation.id },
    data: {
      status: "ACCEPTED",
      acceptedByUserId: me.id,
      acceptedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true, claimedPersonId: invitation.targetPersonId });
}
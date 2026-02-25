import { NextResponse } from "next/server";
import argon2 from "argon2";
import { prisma } from "@/lib/db";
import { readJson } from "@/lib/body";

export async function POST(req: Request) {
  const parsed = await readJson(req);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { token, email, password } = parsed.json ?? {};

  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "MISSING_TOKEN" }, { status: 400 });
  }

  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "MISSING_EMAIL" }, { status: 400 });
  }

  if (!password || typeof password !== "string" || password.length < 8) {
    return NextResponse.json({ error: "WEAK_PASSWORD" }, { status: 400 });
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

  // IMPORTANT: invite email must match what the inviter intended
  if (invitation.email.toLowerCase() !== email.toLowerCase()) {
    return NextResponse.json({ error: "EMAIL_MISMATCH" }, { status: 400 });
  }

  // Enforce: person can only be claimed once
  if (invitation.targetPerson.claimedByUserId) {
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: "REVOKED" },
    });
    return NextResponse.json({ error: "PERSON_ALREADY_CLAIMED" }, { status: 400 });
  }

  // If user already exists, do not register here (they should sign in and accept)
  const existingUser = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (existingUser) {
    return NextResponse.json({ error: "USER_ALREADY_EXISTS" }, { status: 400 });
  }

  const passwordHash = await argon2.hash(password);

  // Transaction for consistency
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        role: "USER",
      },
      select: { id: true, email: true },
    });

    // Add membership
    await tx.membership.create({
      data: {
        userId: user.id,
        familyGraphId: invitation.familyGraphId,
        role: "MEMBER",
        invitedByUserId: invitation.inviterUserId,
      },
    });

    // Claim the person node
    await tx.person.update({
      where: { id: invitation.targetPersonId },
      data: { claimedByUserId: user.id },
    });

    // Mark invitation accepted
    await tx.invitation.update({
      where: { id: invitation.id },
      data: {
        status: "ACCEPTED",
        acceptedByUserId: user.id,
        acceptedAt: new Date(),
      },
    });

    return user;
  });

  return NextResponse.json({ ok: true, userEmail: result.email });
}
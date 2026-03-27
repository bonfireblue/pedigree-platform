import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/accept-invite?error=missing_token", url.origin));
  }

  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    // Not logged in, redirect back to accept-invite
    return NextResponse.redirect(new URL(`/accept-invite?token=${token}`, url.origin));
  }

  const me = await prisma.user.findUnique({
    where: { email: session.user.email.toLowerCase() },
    select: { id: true },
  });

  if (!me) {
    return NextResponse.redirect(new URL(`/accept-invite?token=${token}&error=user_not_found`, url.origin));
  }

  // Find the invitation
  const invitation = await prisma.invitation.findUnique({
    where: { token },
    select: {
      id: true,
      targetPersonId: true,
      familyGraphId: true,
      expiresAt: true,
      usedAt: true,
    },
  });

  if (!invitation) {
    return NextResponse.redirect(new URL(`/accept-invite?error=invalid_token`, url.origin));
  }

  if (invitation.usedAt) {
    return NextResponse.redirect(new URL(`/accept-invite?error=already_used`, url.origin));
  }

  if (invitation.expiresAt < new Date()) {
    return NextResponse.redirect(new URL(`/accept-invite?error=expired`, url.origin));
  }

  // Claim the person
  await prisma.person.update({
    where: { id: invitation.targetPersonId },
    data: { claimedByUserId: me.id },
  });

  // Mark invitation as used
  await prisma.invitation.update({
    where: { id: invitation.id },
    data: { usedAt: new Date() },
  });

  // Add user to the family graph if not already a member
  const existingMembership = await prisma.membership.findFirst({
    where: {
      userId: me.id,
      familyGraphId: invitation.familyGraphId,
    },
  });

  if (!existingMembership) {
    await prisma.membership.create({
      data: {
        userId: me.id,
        familyGraphId: invitation.familyGraphId,
        role: "MEMBER",
      },
    });
  }

  // Redirect to pedigree page
  return NextResponse.redirect(new URL("/pedigree", url.origin));
}

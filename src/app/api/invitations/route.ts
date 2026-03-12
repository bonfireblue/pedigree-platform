import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readJson } from "@/lib/body";
import {
  InvitationError,
  assertInviteTargetIsValid,
  assertNoDuplicateActiveInvite,
  assertValidEmail,
  computeCanInvite,
} from "@/lib/invitationRules";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const me = await prisma.user.findUnique({
      where: { email: session.user.email.toLowerCase() },
      select: { id: true, email: true },
    });

    if (!me) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const membership = await prisma.membership.findFirst({
      where: { userId: me.id },
      select: { familyGraphId: true, role: true },
      orderBy: { createdAt: "asc" },
    });

    if (!membership) {
      return NextResponse.json({ error: "NO_MEMBERSHIP" }, { status: 403 });
    }

    const canInvite = await computeCanInvite({
      meId: me.id,
      familyGraphId: membership.familyGraphId,
      role: membership.role,
    });

    if (!canInvite) {
      return NextResponse.json({ error: "NOT_VERIFIED_TO_INVITE" }, { status: 403 });
    }

    const parsed = await readJson(req);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const targetPersonId =
      typeof parsed.json?.targetPersonId === "string" ? parsed.json.targetPersonId.trim() : "";
    const rawEmail = typeof parsed.json?.email === "string" ? parsed.json.email : "";

    if (!targetPersonId || !rawEmail) {
      return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
    }

    const email = assertValidEmail(rawEmail);

    await assertInviteTargetIsValid({
      familyGraphId: membership.familyGraphId,
      targetPersonId,
    });

    await assertNoDuplicateActiveInvite({
      familyGraphId: membership.familyGraphId,
      targetPersonId,
      email,
    });

    const token = randomBytes(32).toString("hex");

    const invitation = await prisma.invitation.create({
      data: {
        token,
        email,
        familyGraphId: membership.familyGraphId,
        targetPersonId,
        inviterUserId: me.id,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
      },
      select: { id: true, token: true, email: true, targetPersonId: true, expiresAt: true },
    });

    const inviteUrl = `${process.env.NEXTAUTH_URL}/accept-invite?token=${invitation.token}`;

    return NextResponse.json({
      invitationId: invitation.id,
      inviteUrl,
      email: invitation.email,
      targetPersonId: invitation.targetPersonId,
      expiresAt: invitation.expiresAt?.toISOString() ?? null,
    });
  } catch (error) {
    if (error instanceof InvitationError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }

    console.error("POST /api/invitations failed", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
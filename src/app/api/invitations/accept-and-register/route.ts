import { NextResponse } from "next/server";
import argon2 from "argon2";
import { prisma } from "@/lib/db";
import { readJson } from "@/lib/body";
import {
  InvitationError,
  assertNonEmptyToken,
  assertValidEmail,
  getPendingInvitationOrThrow,
  normalizeEmail,
} from "@/lib/invitationRules";

export async function POST(req: Request) {
  try {
    const parsed = await readJson(req);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const token = assertNonEmptyToken(parsed.json?.token);
    const email = assertValidEmail(parsed.json?.email);
    const password = parsed.json?.password;

    if (!password || typeof password !== "string" || password.length < 8) {
      return NextResponse.json({ error: "WEAK_PASSWORD" }, { status: 400 });
    }

    const invitation = await getPendingInvitationOrThrow(token);

    if (!invitation.email || normalizeEmail(invitation.email) !== email) {
      return NextResponse.json({ error: "EMAIL_MISMATCH" }, { status: 400 });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      return NextResponse.json({ error: "USER_ALREADY_EXISTS" }, { status: 400 });
    }

    const passwordHash = await argon2.hash(password);

    const result = await prisma.$transaction(async (tx) => {
      const freshInvite = await tx.invitation.findUnique({
        where: { token },
        include: {
          targetPerson: {
            select: {
              id: true,
              claimedByUserId: true,
            },
          },
        },
      });

      if (!freshInvite) {
        throw new InvitationError("INVALID_TOKEN", 404);
      }

      if (freshInvite.status !== "PENDING") {
        throw new InvitationError("INVITE_NOT_PENDING", 400);
      }

      if (freshInvite.expiresAt && freshInvite.expiresAt.getTime() < Date.now()) {
        await tx.invitation.update({
          where: { id: freshInvite.id },
          data: { status: "EXPIRED" },
        });
        throw new InvitationError("INVITE_EXPIRED", 400);
      }

      if (!freshInvite.email || normalizeEmail(freshInvite.email) !== email) {
        throw new InvitationError("EMAIL_MISMATCH", 400);
      }

      const duplicateUser = await tx.user.findUnique({
        where: { email },
        select: { id: true },
      });

      if (duplicateUser) {
        throw new InvitationError("USER_ALREADY_EXISTS", 400);
      }

      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          role: "USER",
        },
        select: { id: true, email: true },
      });

      await tx.membership.upsert({
        where: {
          userId_familyGraphId: {
            userId: user.id,
            familyGraphId: freshInvite.familyGraphId,
          },
        },
        update: {},
        create: {
          userId: user.id,
          familyGraphId: freshInvite.familyGraphId,
          role: "MEMBER",
          invitedByUserId: freshInvite.inviterUserId,
        },
      });

      const claimResult = await tx.person.updateMany({
        where: {
          id: freshInvite.targetPersonId,
          claimedByUserId: null,
        },
        data: {
          claimedByUserId: user.id,
        },
      });

      if (claimResult.count !== 1) {
        await tx.invitation.updateMany({
          where: {
            id: freshInvite.id,
            status: "PENDING",
          },
          data: {
            status: "REVOKED",
          },
        });

        throw new InvitationError("PERSON_ALREADY_CLAIMED", 400);
      }

      const acceptResult = await tx.invitation.updateMany({
        where: {
          id: freshInvite.id,
          status: "PENDING",
        },
        data: {
          status: "ACCEPTED",
          acceptedByUserId: user.id,
          acceptedAt: new Date(),
        },
      });

      if (acceptResult.count !== 1) {
        throw new InvitationError("INVITE_NOT_PENDING", 400);
      }

      await tx.invitation.updateMany({
        where: {
          targetPersonId: freshInvite.targetPersonId,
          status: "PENDING",
          NOT: { id: freshInvite.id },
        },
        data: {
          status: "REVOKED",
        },
      });

      return { userEmail: user.email, claimedPersonId: freshInvite.targetPersonId };
    });

    return NextResponse.json({
      ok: true,
      userEmail: result.userEmail,
      claimedPersonId: result.claimedPersonId,
    });
  } catch (error) {
    if (error instanceof InvitationError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }

    console.error("POST /api/invitations/accept-and-register failed", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}

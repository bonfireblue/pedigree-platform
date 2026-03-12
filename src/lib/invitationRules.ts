import { prisma } from "@/lib/db";

export class InvitationError extends Error {
  code: string;
  status: number;

  constructor(code: string, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export function normalizeEmail(email: string) {
  return String(email).trim().toLowerCase();
}

export function assertValidEmail(email: string) {
  const value = normalizeEmail(email);
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  if (!ok) {
    throw new InvitationError("INVALID_EMAIL", 400);
  }
  return value;
}

export function assertNonEmptyToken(token: unknown) {
  if (!token || typeof token !== "string" || !token.trim()) {
    throw new InvitationError("MISSING_TOKEN", 400);
  }
  return token.trim();
}

export function isVerifiedRole(role: string) {
  return role === "FOUNDER" || role === "TRUSTED" || role === "ADMIN";
}

export async function computeCanInvite(params: {
  meId: string;
  familyGraphId: string;
  role: string;
}) {
  const { meId, familyGraphId, role } = params;

  if (isVerifiedRole(role)) return true;

  const graph = await prisma.familyGraph.findUnique({
    where: { id: familyGraphId },
    select: { createdById: true },
  });

  if (!graph) return false;
  if (graph.createdById === meId) return true;

  const firstTenAccepted = await prisma.invitation.findMany({
    where: {
      familyGraphId,
      inviterUserId: graph.createdById,
      status: "ACCEPTED",
      acceptedByUserId: { not: null },
    },
    orderBy: { acceptedAt: "asc" },
    take: 10,
    select: { acceptedByUserId: true },
  });

  return firstTenAccepted.some((r) => r.acceptedByUserId === meId);
}

export async function assertInviteTargetIsValid(params: {
  familyGraphId: string;
  targetPersonId: string;
}) {
  const person = await prisma.person.findFirst({
    where: {
      id: params.targetPersonId,
      familyGraphId: params.familyGraphId,
    },
    select: {
      id: true,
      claimedByUserId: true,
    },
  });

  if (!person) {
    throw new InvitationError("INVALID_PERSON", 404);
  }

  if (person.claimedByUserId) {
    throw new InvitationError("ALREADY_CLAIMED", 400);
  }

  return person;
}

export async function assertNoDuplicateActiveInvite(params: {
  familyGraphId: string;
  targetPersonId: string;
  email: string;
}) {
  const now = new Date();

  const existing = await prisma.invitation.findFirst({
    where: {
      familyGraphId: params.familyGraphId,
      targetPersonId: params.targetPersonId,
      email: params.email,
      status: "PENDING",
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: {
      id: true,
      token: true,
      expiresAt: true,
    },
  });

  if (existing) {
    throw new InvitationError("ACTIVE_INVITE_ALREADY_EXISTS", 409);
  }
}

export async function expireInvitationIfNeeded(invitationId: string, expiresAt: Date | null) {
  if (expiresAt && expiresAt.getTime() < Date.now()) {
    await prisma.invitation.update({
      where: { id: invitationId },
      data: { status: "EXPIRED" },
    });
    throw new InvitationError("INVITE_EXPIRED", 400);
  }
}

export async function getPendingInvitationOrThrow(token: string) {
  const invitation = await prisma.invitation.findUnique({
    where: { token },
    include: {
      targetPerson: {
        select: {
          id: true,
          claimedByUserId: true,
          familyGraphId: true,
        },
      },
    },
  });

  if (!invitation) {
    throw new InvitationError("INVALID_TOKEN", 404);
  }

  if (invitation.status !== "PENDING") {
    throw new InvitationError("INVITE_NOT_PENDING", 400);
  }

  await expireInvitationIfNeeded(invitation.id, invitation.expiresAt);

  return invitation;
}
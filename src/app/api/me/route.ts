import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

function isVerifiedRole(role: string) {
  return role === "FOUNDER" || role === "TRUSTED" || role === "ADMIN";
}

async function computeCanInvite(params: { meId: string; familyGraphId: string; role: string }) {
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

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const me = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true },
  });
  if (!me) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const membership = await prisma.membership.findFirst({
    where: { userId: me.id },
    select: { familyGraphId: true, role: true },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) return NextResponse.json({ error: "NO_MEMBERSHIP" }, { status: 403 });

  const canInvite = await computeCanInvite({
    meId: me.id,
    familyGraphId: membership.familyGraphId,
    role: membership.role,
  });

  return NextResponse.json({
    user: { id: me.id, email: me.email },
    membership,
    canInvite,
  });
}
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";

export type Me = { id: string; isAdmin: boolean; email: string };

export async function requireMe(): Promise<Me | null> {
  const session = await requireSession();
  if (!session?.user?.email) return null;

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true, role: true },
  });

  if (!user) return null;

  return { id: user.id, email: user.email, isAdmin: user.role === "ADMIN" };
}

export function canViewPerson(me: Me, person: { isPrivate: boolean; createdById: string }) {
  if (!person.isPrivate) return true;
  return me.isAdmin || person.createdById === me.id;
}

export function canEditPerson(me: Me, person: { createdById: string }) {
  return me.isAdmin || person.createdById === me.id;
}

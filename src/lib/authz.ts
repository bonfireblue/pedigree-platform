import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export type Me = {
  id: string;
  email: string;
  isAdmin: boolean;
};

export async function requireMe(): Promise<Me | null> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return null;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return null;

  // If you don't have role in schema, treat everyone as non-admin.
  // If you DO have role, keep it consistent with your schema.
  const isAdmin = (user as any).role === "ADMIN";

  return { id: user.id, email: user.email, isAdmin };
}

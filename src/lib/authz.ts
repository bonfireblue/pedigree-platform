import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/neon-db";

export type Me = {
  id: string;
  email: string | null;
  phone: string | null;
  isAdmin: boolean;
};

export async function requireMe(): Promise<Me | null> {
  const session = await getServerSession(authOptions);
  
  // Get user ID from session - this is set in the JWT callback to support phone-only users
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return null;

  // Look up user by ID (not email) to support phone-only users
  const users = await sql`SELECT id, email, phone, role FROM "User" WHERE id = ${userId} LIMIT 1`;
  if (users.length === 0) return null;

  const user = users[0] as { id: string; email: string | null; phone: string | null; role: string };
  const isAdmin = user.role === "ADMIN";

  return { id: user.id, email: user.email, phone: user.phone, isAdmin };
}

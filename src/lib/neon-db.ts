import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";

export const sql = neon(DATABASE_URL);

// User operations
export async function findUserByEmail(email: string) {
  const result = await sql`SELECT * FROM "User" WHERE email = ${email} LIMIT 1`;
  return result[0] || null;
}

export async function findUserById(id: string) {
  const result = await sql`SELECT * FROM "User" WHERE id = ${id} LIMIT 1`;
  return result[0] || null;
}

export async function findUserByPhone(phone: string) {
  const result = await sql`SELECT * FROM "User" WHERE phone = ${phone} LIMIT 1`;
  return result[0] || null;
}

export async function createUser(email: string | null, passwordHash: string, role: string = "USER", phone: string | null = null) {
  const id = crypto.randomUUID();
  await sql`
    INSERT INTO "User" (id, email, phone, "passwordHash", role, "createdAt")
    VALUES (${id}, ${email}, ${phone}, ${passwordHash}, ${role}::"UserRole", NOW())
  `;
  return { id, email, phone, role };
}

// Password reset token operations
export async function createPasswordResetToken(userId: string, token: string, expiresAt: Date) {
  const id = crypto.randomUUID();
  await sql`
    INSERT INTO "PasswordResetToken" (id, token, "userId", "expiresAt", "createdAt")
    VALUES (${id}, ${token}, ${userId}, ${expiresAt}, NOW())
  `;
  return { id, token, userId, expiresAt };
}

export async function findPasswordResetToken(token: string) {
  const result = await sql`
    SELECT prt.*, u.email as "userEmail" 
    FROM "PasswordResetToken" prt
    JOIN "User" u ON u.id = prt."userId"
    WHERE prt.token = ${token} 
    AND prt."usedAt" IS NULL
    AND prt."expiresAt" > NOW()
    LIMIT 1
  `;
  return result[0] || null;
}

export async function markTokenAsUsed(token: string) {
  await sql`UPDATE "PasswordResetToken" SET "usedAt" = NOW() WHERE token = ${token}`;
}

export async function updateUserPassword(userId: string, passwordHash: string) {
  await sql`UPDATE "User" SET "passwordHash" = ${passwordHash} WHERE id = ${userId}`;
}

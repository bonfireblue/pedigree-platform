import { NextResponse } from "next/server";
import argon2 from "argon2";

// IMPORTANT:
// Replace this import with whatever your project uses to access Prisma.
// Common patterns are:
//   import { db } from "@/lib/db";
//   import { prisma } from "@/lib/db";
//   import { prisma } from "@/lib/prisma";
//
// Start with db, because your project earlier had src/lib/db.ts.
import { db } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name = (body?.name ?? "").toString().trim();
    const email = (body?.email ?? "").toString().trim().toLowerCase();
    const password = (body?.password ?? "").toString();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    // Check existing user
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Email is already in use." }, { status: 409 });
    }

    const passwordHash = await argon2.hash(password);

    await db.user.create({
      data: {
        name: name || null,
        email,
        passwordHash,
        role: "USER"
      },
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: "Registration failed." }, { status: 500 });
  }
}
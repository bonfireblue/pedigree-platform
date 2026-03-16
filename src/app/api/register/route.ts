import { NextResponse } from "next/server";
import argon2 from "argon2";
import { findUserByEmail, createUser } from "@/lib/neon-db";

export async function POST(req: Request) {
  try {
    console.log("[v0] Registration request received");
    const body = await req.json();
    console.log("[v0] Body parsed:", { email: body?.email });

    const email = (body?.email ?? "").toString().trim().toLowerCase();
    const password = (body?.password ?? "").toString();

    if (!email || !password) {
      console.log("[v0] Missing email or password");
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      console.log("[v0] Password too short");
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    console.log("[v0] Checking for existing user");
    const existing = await findUserByEmail(email);
    if (existing) {
      console.log("[v0] User already exists");
      return NextResponse.json(
        { error: "Email is already in use." },
        { status: 409 }
      );
    }

    console.log("[v0] Hashing password");
    const passwordHash = await argon2.hash(password);

    console.log("[v0] Creating user in database");
    const newUser = await createUser(email, passwordHash, "USER");
    console.log("[v0] User created successfully:", newUser.id);

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("[v0] Registration error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Registration failed: ${errorMessage}` }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import argon2 from "argon2";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const token = (body?.token ?? "").toString();
    const password = (body?.password ?? "").toString();

    if (!token || !password) {
      return NextResponse.json(
        { error: "Token and password are required." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    // Find the token
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!resetToken) {
      return NextResponse.json(
        { error: "Invalid or expired reset link." },
        { status: 400 }
      );
    }

    // Check if token has been used
    if (resetToken.usedAt) {
      return NextResponse.json(
        { error: "This reset link has already been used." },
        { status: 400 }
      );
    }

    // Check if token has expired
    if (resetToken.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "This reset link has expired." },
        { status: 400 }
      );
    }

    // Hash the new password
    const passwordHash = await argon2.hash(password);

    // Update user password and mark token as used
    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json(
      { error: "Failed to reset password." },
      { status: 500 }
    );
  }
}

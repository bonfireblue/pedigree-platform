import { put } from "@vercel/blob";
import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(request: NextRequest) {
  console.log("[v0] Upload request received");
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    console.log("[v0] Session:", session?.user?.id ? "authenticated" : "not authenticated");
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    console.log("[v0] File received:", file?.name, file?.type, file?.size);

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed." },
        { status: 400 }
      );
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 5MB." },
        { status: 400 }
      );
    }

    // Generate unique filename
    const ext = file.name.split(".").pop() || "jpg";
    const filename = `profile-photos/${session.user.id}/${Date.now()}.${ext}`;

    // Upload to Blob storage (public access so everyone can view)
    console.log("[v0] Uploading to blob storage:", filename);
    const blob = await put(filename, file, {
      access: "public",
    });
    console.log("[v0] Upload successful:", blob.url);

    // Return the public URL directly
    return NextResponse.json({ pathname: blob.pathname, url: blob.url });
  } catch (error) {
    console.error("[v0] Upload error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Upload failed: ${errorMessage}` }, { status: 500 });
  }
}

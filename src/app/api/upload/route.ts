// Upload API - Force rebuild March 16 2026 v2
import { put } from "@vercel/blob";
import { type NextRequest, NextResponse } from "next/server";
import { requireMe } from "@/lib/authz";

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const me = await requireMe();
    if (!me) {
      return NextResponse.json({ error: "Unauthorized - please sign in again" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;

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
    const filename = `profile-photos/${me.id}/${Date.now()}.${ext}`;

    // Upload to Blob storage (private access - serve via /api/file route)
    const blob = await put(filename, file, {
      access: "private",
    });

    // Return the pathname for serving via /api/file route
    return NextResponse.json({ pathname: blob.pathname });
  } catch (error) {
    console.error("Upload error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Upload failed: ${errorMessage}` }, { status: 500 });
  }
}

import { put } from "@vercel/blob";
import { type NextRequest, NextResponse } from "next/server";
import { requireMe } from "@/lib/authz";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(request: NextRequest) {
  console.log("[v0] Upload POST started");
  try {
    // Debug session
    const session = await getServerSession(authOptions);
    console.log("[v0] Session email:", session?.user?.email ?? "none");
    
    // Check authentication using the same pattern as other APIs
    const me = await requireMe();
    console.log("[v0] requireMe result:", me?.id ?? "null");
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

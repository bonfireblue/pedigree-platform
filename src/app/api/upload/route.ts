// Photo upload API v3 - March 16 2026
import { put } from "@vercel/blob";
import { type NextRequest, NextResponse } from "next/server";
import { requireMe } from "@/lib/authz";

export async function POST(request: NextRequest) {
  try {
    const me = await requireMe();
    if (!me) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
    }

    const ext = file.name.split(".").pop() || "jpg";
    const filename = `profile-photos/${me.id}/${Date.now()}.${ext}`;

    // PRIVATE access for Blob storage
    const blob = await put(filename, file, { access: "private" });

    return NextResponse.json({ pathname: blob.pathname });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

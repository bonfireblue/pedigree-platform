export async function readJson(req: Request, maxBytes = 50_000) {
  const len = req.headers.get("content-length");
  if (len && Number(len) > maxBytes) {
    return { ok: false as const, error: "PAYLOAD_TOO_LARGE" as const };
  }

  const text = await req.text();
  if (text.length > maxBytes) {
    return { ok: false as const, error: "PAYLOAD_TOO_LARGE" as const };
  }

  try {
    const json = JSON.parse(text);
    return { ok: true as const, json };
  } catch {
    return { ok: false as const, error: "INVALID_JSON" as const };
  }
}

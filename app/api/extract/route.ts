import { NextRequest, NextResponse } from "next/server";

const PYTHON_EXTRACTOR_URL = process.env.PYTHON_EXTRACTOR_URL || "http://127.0.0.1:8000";

export async function POST(request: NextRequest) {
  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  try {
    const res = await fetch(`${PYTHON_EXTRACTOR_URL}/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = Array.isArray(data.detail) ? data.detail[0]?.msg ?? data.detail : data.detail;
      return NextResponse.json(
        { error: detail ?? "Extract failed" },
        { status: res.status }
      );
    }
    return NextResponse.json(data);
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    const hint = `Is the Python extractor running? From project root: cd python-service && source .venv/bin/activate && uvicorn main:app --reload --port 8000`;
    const message = raw.toLowerCase().includes("fetch") || raw.includes("ECONNREFUSED")
      ? `${hint} (${raw})`
      : raw;
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const SYSTEM_PROMPT = `You are a compliance and quality reviewer for marketing whitepapers. Review the provided whitepaper content and produce a short report. Do NOT rewrite the content.

Your report must include:
1. **Unsupported claims**: List any claims that are not clearly backed by the source data or that could be misleading.
2. **Tone / brand**: Note if the tone is consistent and professional; flag any off-brand or risky language.
3. **Suggestions**: Concrete improvement suggestions (e.g. "Add a disclaimer under the pricing section"). Never auto-rewrite; only suggest.

Format the report in clear sections. Be concise. If nothing major is wrong, say so.`;

export async function POST(request: NextRequest) {
  if (!openai) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not set" },
      { status: 500 }
    );
  }
  let body: { markdown?: string; extractedJson?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const markdown = body.markdown ?? "";
  if (!markdown) {
    return NextResponse.json(
      { error: "markdown is required" },
      { status: 400 }
    );
  }

  let userContent = `Whitepaper content to review:\n\n${markdown}`;
  if (body.extractedJson) {
    userContent += `\n\nOriginal extracted data (for fact-checking):\n${body.extractedJson}`;
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      max_tokens: 1000,
    });
    const report =
      completion.choices[0]?.message?.content?.trim() || "No report generated.";

    return NextResponse.json({ report });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Guardian failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

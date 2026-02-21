import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import type { ExtractedData, LayoutSpec } from "@/lib/types";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const SECTION_IDS = ["cover", "problem", "solution", "what-you-get", "faq", "cta"];

function stripEmojis(s: string): string {
  return s.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{FE00}-\u{FE0F}]/gu, "").replace(/\s{2,}/g, " ").trim();
}

function buildLayoutSpec(templateType: string, title: string): LayoutSpec {
  const sections = SECTION_IDS.map((id) => ({
    id,
    title: id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    recommendedImagery: id === "cover" ? "Hero image or course visual" : "Supporting graphic or icon",
    iconSuggestion: id === "problem" ? "lightbulb" : id === "solution" ? "check-circle" : "file-text",
    callout: id === "cta" ? "Primary CTA button or form" : undefined,
  }));
  return { sectionOrder: SECTION_IDS, sections };
}

export async function POST(request: NextRequest) {
  if (!openai) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not set" },
      { status: 500 }
    );
  }
  let body: { extractedData?: ExtractedData; templateType?: string; language?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const extractedData = body.extractedData;
  const templateType = body.templateType || "lead-magnet";
  const language = (body.language === "en" ? "en" : "nl") as "nl" | "en";
  if (!extractedData || !extractedData.sourceUrl) {
    return NextResponse.json(
      { error: "extractedData is required" },
      { status: 400 }
    );
  }

  const pageCount =
    templateType === "lead-magnet"
      ? 2
      : templateType === "product-deep-dive"
        ? 4
        : 3;

  const rawTitle = extractedData.title || "Whitepaper";
  const courseTitle = stripEmojis(
    rawTitle.replace(/\s*[|\-–—]\s*Lindenhaeghe\s*$/i, "").replace(/\s*Lindenhaeghe\s*[|\-–—]\s*/i, "").trim()
  ) || stripEmojis(rawTitle) || "Whitepaper";

  const langInstruction = language === "en" ? "Write the entire whitepaper in English." : "Write the entire whitepaper in Dutch (Nederlands).";
  const systemPrompt = `You are a marketing copywriter. Generate whitepaper content in Markdown using ONLY the provided extracted course data. Do not invent facts. Do not use emojis. ${langInstruction} Use these sections in order: cover (title + one-line subtitle), problem, solution, what-you-get, faq, cta. For the cover: the FIRST line must be exactly the course title (short, no repetition). The SECOND line must be one short subtitle only. Do not repeat the same phrase or idea in both lines. Keep total length suitable for about ${pageCount} pages (roughly ${pageCount === 2 ? "600" : pageCount === 4 ? "1200" : "900"} words). Write in a professional, compliant tone.`;

  const userContent = `Extracted data (use only this):\n${JSON.stringify(extractedData, null, 2)}\n\nTemplate type: ${templateType}. Produce Markdown with headings ## for each section. The first line of the document (cover title) must be exactly: ${courseTitle}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      max_tokens: 4000,
    });
    const markdown =
      completion.choices[0]?.message?.content?.trim() ||
      "";

    const title = extractedData.title || "Whitepaper";
    const layoutSpec = buildLayoutSpec(templateType, title);

    return NextResponse.json({ markdown, layoutSpec });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Write failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { marked } from "marked";
import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const FIXED_KEYS = new Set(["problem", "solution", "what-you-get", "faq", "cta"]);

/** Map markdown ## section headings to template keys (lowercase, normalized). Include Dutch so content isn't duplicated in extras. */
const SECTION_MAP: Record<string, string> = {
  cover: "cover",
  problem: "problem",
  probleem: "problem",
  solution: "solution",
  oplossing: "solution",
  "what you get": "what-you-get",
  "what-you-get": "what-you-get",
  "wat krijg je": "what-you-get",
  "wat je krijgt": "what-you-get",
  "wat je get": "what-you-get",
  faq: "faq",
  "veelgestelde vragen": "faq",
  cta: "cta",
  "next steps": "cta",
  "volgende stappen": "cta",
  "call to action": "cta",
};

const TEMPLATE_TYPE_LABELS: Record<string, string> = {
  "lead-magnet": "Lead magnet (2 pages)",
  "product-deep-dive": "Product deep-dive (4 pages)",
  "update-explainer": "Update / regulation explainer (3 pages)",
};

/** Section headings and default CTA by language. */
const SECTION_LABELS = {
  nl: {
    problem: "Probleem",
    solution: "Oplossing",
    "what-you-get": "Wat krijg je",
    faq: "Veelgestelde vragen",
    cta: "Volgende stappen",
    defaultCta: "<p>Neem contact op voor meer informatie over deze opleiding of bekijk het aanbod op de website.</p>",
  },
  en: {
    problem: "Problem",
    solution: "Solution",
    "what-you-get": "What you get",
    faq: "FAQ",
    cta: "Next steps",
    defaultCta: "<p>Contact us for more information about this course or view the offer on the website.</p>",
  },
} as const;

interface ParsedSections {
  sections: Record<string, string>;
  ordered: { key: string; heading: string; body: string }[];
  coverTitle: string;
  coverSubtitle: string;
}

function parseMarkdownSections(markdown: string): ParsedSections {
  const sections: Record<string, string> = {};
  const ordered: { key: string; heading: string; body: string }[] = [];
  let coverTitle = "Whitepaper";
  let coverSubtitle = "";

  // Ensure every ## starts a new line so we split into sections (avoids whole doc ending up in cover subtitle)
  const normalized = markdown.replace(/([^\n])##\s+/g, "$1\n\n## ");
  const parts = normalized.split(/^##\s+/m);
  // Content before first ##: use as cover if present
  const beforeFirst = parts[0].trim();
  if (beforeFirst) {
    const firstLineEnd = beforeFirst.indexOf("\n");
    let firstLine = firstLineEnd >= 0 ? beforeFirst.slice(0, firstLineEnd).trim() : beforeFirst;
    let rest = firstLineEnd >= 0 ? beforeFirst.slice(firstLineEnd + 1).trim() : "";
    // If one long run-on line, split into title + subtitle for cleaner cover
    if (!rest && firstLine.length > 72) {
      const afterColon = firstLine.indexOf(": ");
      if (afterColon > 0 && afterColon < 60) {
        rest = firstLine.slice(afterColon + 2).trim();
        firstLine = firstLine.slice(0, afterColon + 1).trim();
      } else {
        const afterPeriod = firstLine.match(/^(.+?\.)\s+(\S.+)$/);
        if (afterPeriod) {
          firstLine = afterPeriod[1].trim();
          rest = afterPeriod[2].trim();
        } else {
          const atSpace = firstLine.lastIndexOf(" ", 72);
          if (atSpace > 24) {
            rest = firstLine.slice(atSpace + 1).trim();
            firstLine = firstLine.slice(0, atSpace).trim();
          }
        }
      }
    }
    coverTitle = firstLine;
    coverSubtitle = rest;
  }

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i].trim();
    if (!part) continue;
    const firstLineEnd = part.indexOf("\n");
    const firstLine = firstLineEnd >= 0 ? part.slice(0, firstLineEnd).trim() : part;
    const body = firstLineEnd >= 0 ? part.slice(firstLineEnd + 1).trim() : "";
    const keyRaw = firstLine.toLowerCase().replace(/\s+/g, " ");
    const templateKey = SECTION_MAP[keyRaw] ?? keyRaw.replace(/\s+/g, "-").replace(/[^\w-]/g, "");
    if (templateKey === "cover") {
      const bodyFirst = body.indexOf("\n");
      coverTitle = bodyFirst >= 0 ? body.slice(0, bodyFirst).trim() : body.trim() || firstLine;
      coverSubtitle = bodyFirst >= 0 ? body.slice(bodyFirst + 1).trim() : "";
      sections["cover-title"] = coverTitle;
      sections["cover-subtitle"] = coverSubtitle;
      continue;
    }
    if (sections[templateKey]) sections[templateKey] += "\n\n" + body;
    else sections[templateKey] = body;
    ordered.push({ key: templateKey, heading: firstLine, body });
  }

  sections["cover-title"] = coverTitle;
  sections["cover-subtitle"] = coverSubtitle;
  return { sections, ordered, coverTitle, coverSubtitle };
}

function markdownToHtml(md: string): string {
  if (!md) return "<p></p>";
  return marked.parse(md, { async: false }) as string;
}

/** Remove first h1/h2/h3 from HTML to avoid duplicate headings with template. */
function stripFirstHeading(html: string): string {
  return html.replace(/^\s*<h[123](?:\s[^>]*)?>[\s\S]*?<\/h[123]>/i, "").trim() || "";
}

/** True if HTML has no meaningful text (empty or only empty tags). */
function isSectionEmpty(html: string): boolean {
  const text = html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  return text.length === 0;
}


function getLogoDataUri(): string {
  const logoPath = path.join(process.cwd(), "resources", "lindenhaeghe-logo-inverted.svg");
  try {
    const svg = fs.readFileSync(logoPath, "utf-8");
    const base64 = Buffer.from(svg, "utf-8").toString("base64");
    return `data:image/svg+xml;base64,${base64}`;
  } catch {
    return "";
  }
}

/** Remove company name from title (e.g. "Course | Lindenhaeghe" -> "Course"). */
function stripCompanyFromTitle(s: string): string {
  return s
    .replace(/\s*[|\-–—]\s*Lindenhaeghe\s*$/i, "")
    .replace(/\s*Lindenhaeghe\s*[|\-–—]\s*/i, "")
    .trim() || s.trim();
}

/** Remove emoji and other symbols (works without regex 'u' flag for older targets). */
function stripEmojis(s: string): string {
  return s
    .replace(/[\u2600-\u26FF\u2700-\u27BF\uFE00-\uFE0F]/g, "") // BMP symbols
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "") // supplementary (emoji) surrogate pairs
    .replace(/\s{2,}/g, " ")
    .trim();
}

function sanitizeFilename(s: string): string {
  return s
    .replace(/[\/\\:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .replace(/[^\x00-\x7F]/g, "") // strip non-ASCII (emoji, etc.) so header is ByteString-safe
    .slice(0, 80) || "whitepaper";
}

export async function POST(request: NextRequest) {
  let body: { markdown?: string; title?: string; courseName?: string; templateType?: string; language?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const rawMarkdown = body.markdown ?? "";
  const markdown = stripEmojis(rawMarkdown);
  const rawCourseName = (body.courseName ?? body.title ?? "").trim() || "Whitepaper";
  const courseName = stripEmojis(stripCompanyFromTitle(rawCourseName)) || "Whitepaper";
  const templateType = (body.templateType ?? "").trim() || "whitepaper";
  const lang = body.language === "en" ? "en" : "nl";
  const labels = SECTION_LABELS[lang];
  const templateLabel = TEMPLATE_TYPE_LABELS[templateType] || templateType;

  if (!rawMarkdown) {
    return NextResponse.json(
      { error: "markdown is required" },
      { status: 400 }
    );
  }

  const parsed = parseMarkdownSections(markdown);
  const { sections, ordered, coverTitle, coverSubtitle } = parsed;
  const finalCoverTitle = courseName !== "Whitepaper" ? courseName : stripEmojis(coverTitle);
  const finalCoverSubtitle = templateLabel + (coverSubtitle ? ` · ${coverSubtitle}` : "");

  const templatePath = path.join(process.cwd(), "app", "whitepaper-template.html");
  let template: string;
  try {
    template = fs.readFileSync(templatePath, "utf-8");
  } catch {
    return NextResponse.json(
      { error: "Whitepaper template not found" },
      { status: 500 }
    );
  }

  function escapeHtml(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const extraSectionsHtml = ordered
    .filter(({ key }) => !FIXED_KEYS.has(key))
    .map(
      ({ heading, body }) =>
        `<div class="section"><h2>${escapeHtml(heading)}</h2>${markdownToHtml(body)}</div>`
    )
    .join("\n");

  const problemHtml = stripFirstHeading(markdownToHtml(sections.problem ?? ""));
  const solutionHtml = stripFirstHeading(markdownToHtml(sections.solution ?? ""));
  const whatYouGetHtml = stripFirstHeading(markdownToHtml(sections["what-you-get"] ?? ""));
  const faqHtml = stripFirstHeading(markdownToHtml(sections.faq ?? ""));
  const ctaRaw = (sections.cta ?? "").trim();
  const ctaHtml = ctaRaw
    ? stripFirstHeading(markdownToHtml(sections.cta ?? ""))
    : labels.defaultCta;

  const logoDataUri = getLogoDataUri();
  const logoImg = logoDataUri
    ? `<img src="${logoDataUri}" alt="Lindenhaeghe" class="cover-logo" />`
    : "";

  const problemSection =
    !isSectionEmpty(problemHtml) &&
    `<div id="problem" class="section"><h2>${escapeHtml(labels.problem)}</h2>${problemHtml}</div>`;
  const solutionSection =
    !isSectionEmpty(solutionHtml) &&
    `<div id="solution" class="section"><h2>${escapeHtml(labels.solution)}</h2>${solutionHtml}</div>`;
  const whatYouGetSection =
    !isSectionEmpty(whatYouGetHtml) &&
    `<div id="what-you-get" class="section"><h2>${escapeHtml(labels["what-you-get"])}</h2>${whatYouGetHtml}</div>`;
  const faqSection =
    !isSectionEmpty(faqHtml) &&
    `<div id="faq" class="section"><h2>${escapeHtml(labels.faq)}</h2>${faqHtml}</div>`;
  const ctaSection = `<div id="cta" class="section cta"><h2>${escapeHtml(labels.cta)}</h2>${ctaHtml}</div>`;

  const html = template
    .replace("{{LANG}}", lang)
    .replace("{{TITLE}}", escapeHtml(finalCoverTitle))
    .replace("{{COVER_TITLE}}", escapeHtml(finalCoverTitle))
    .replace("{{COVER_SUBTITLE}}", escapeHtml(finalCoverSubtitle))
    .replace("{{LOGO_IMG}}", logoImg)
    .replace("{{PROBLEM_SECTION}}", problemSection || "")
    .replace("{{SOLUTION_SECTION}}", solutionSection || "")
    .replace("{{WHAT_YOU_GET_SECTION}}", whatYouGetSection || "")
    .replace("{{FAQ_SECTION}}", faqSection || "")
    .replace("{{CTA_SECTION}}", ctaSection)
    .replace("{{EXTRA_SECTIONS_HTML}}", extraSectionsHtml);

  const downloadName = `${sanitizeFilename(courseName)}-${sanitizeFilename(templateType)}.pdf`;

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      margin: { top: "20mm", right: "20mm", bottom: "20mm", left: "20mm" },
      printBackground: true,
    });
    await browser.close();

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${downloadName}"`,
        "X-Suggested-Filename": downloadName,
      },
    });
  } catch (e) {
    if (browser) await browser.close();
    const message = e instanceof Error ? e.message : "PDF generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

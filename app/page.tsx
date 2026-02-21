"use client";

import { useState } from "react";

const DEFAULT_URL = "https://lindenhaeghe.nl/pensioen";
const TEMPLATE_OPTIONS = [
  { value: "lead-magnet", label: "Lead magnet (2 pages)" },
  { value: "product-deep-dive", label: "Product deep-dive (4 pages)" },
  { value: "update-explainer", label: "Update / regulation explainer (3 pages)" },
] as const;

const LANGUAGE_OPTIONS = [
  { value: "nl", label: "Dutch (NL)" },
  { value: "en", label: "English (EN)" },
] as const;

export default function Home() {
  const [url, setUrl] = useState(DEFAULT_URL);
  const [template, setTemplate] = useState<string>("lead-magnet");
  const [language, setLanguage] = useState<"nl" | "en">("nl");
  const [extractedJson, setExtractedJson] = useState<string>("");
  const [extractLoading, setExtractLoading] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  const [markdown, setMarkdown] = useState("");
  const [layoutSpec, setLayoutSpec] = useState("");
  const [writeLoading, setWriteLoading] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);

  const [guardianReport, setGuardianReport] = useState("");
  const [guardianLoading, setGuardianLoading] = useState(false);
  const [guardianError, setGuardianError] = useState<string | null>(null);

  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  async function handleExtract() {
    setExtractError(null);
    setExtractLoading(true);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Extract failed");
      setExtractedJson(JSON.stringify(data, null, 2));
    } catch (e) {
      setExtractError(e instanceof Error ? e.message : "Extract failed");
    } finally {
      setExtractLoading(false);
    }
  }

  async function handleGenerate() {
    if (!extractedJson) return;
    setWriteError(null);
    setWriteLoading(true);
    try {
      const res = await fetch("/api/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extractedData: JSON.parse(extractedJson),
          templateType: template,
          language,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generate failed");
      setMarkdown(data.markdown ?? "");
      setLayoutSpec(typeof data.layoutSpec === "object" ? JSON.stringify(data.layoutSpec, null, 2) : (data.layoutSpec ?? ""));
    } catch (e) {
      setWriteError(e instanceof Error ? e.message : "Generate failed");
    } finally {
      setWriteLoading(false);
    }
  }

  async function handleGuardian() {
    if (!markdown) return;
    setGuardianError(null);
    setGuardianLoading(true);
    try {
      const res = await fetch("/api/guardian", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown, extractedJson: extractedJson || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Guardian failed");
      setGuardianReport(data.report ?? "");
    } catch (e) {
      setGuardianError(e instanceof Error ? e.message : "Guardian failed");
    } finally {
      setGuardianLoading(false);
    }
  }

  async function handleExportPdf() {
    if (!markdown) return;
    setPdfError(null);
    setPdfLoading(true);
    try {
      let courseName = "Whitepaper";
      if (extractedJson) {
        try {
          const data = JSON.parse(extractedJson);
          if (data?.title) {
            const t = data.title.replace(/\s*[|\-–—]\s*Lindenhaeghe\s*$/i, "").replace(/\s*Lindenhaeghe\s*[|\-–—]\s*/i, "").trim() || data.title;
            courseName = t.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{FE00}-\u{FE0F}]/gu, "").replace(/\s{2,}/g, " ").trim() || t;
          }
        } catch {
          /* ignore */
        }
      }
      const res = await fetch("/api/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          markdown,
          courseName,
          templateType: template,
          language,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "PDF export failed");
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = res.headers.get("X-Suggested-Filename") || "whitepaper.pdf";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : "PDF export failed");
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <main className="min-h-screen p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Whitepaper Factory</h1>

      <section className="space-y-4 mb-8">
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">Course URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-slate-900"
            placeholder="https://..."
            suppressHydrationWarning
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Whitepaper template</label>
            <select
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-slate-900"
            >
              {TEMPLATE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Language</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as "nl" | "en")}
              className="w-full rounded border border-slate-300 px-3 py-2 text-slate-900"
            >
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleExtract}
            disabled={extractLoading}
            className="rounded bg-slate-700 text-white px-4 py-2 font-medium disabled:opacity-50 hover:bg-slate-600"
          >
            {extractLoading ? "Extracting…" : "1. Extract course data"}
          </button>
          <button
            onClick={handleGenerate}
            disabled={writeLoading || !extractedJson}
            className="rounded bg-slate-700 text-white px-4 py-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-600"
          >
            {writeLoading ? "Generating…" : "2. Generate whitepaper content"}
          </button>
        </div>
        {extractError && <p className="text-red-600 text-sm mt-1">{extractError}</p>}
      </section>

      {extractedJson && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-slate-700 mb-2">Extracted JSON</h2>
          <pre className="bg-slate-100 border border-slate-200 rounded p-4 text-sm overflow-auto max-h-64">
            {extractedJson}
          </pre>
          {writeError && <p className="text-red-600 text-sm mt-1">{writeError}</p>}
        </section>
      )}

      {(markdown || layoutSpec) && (
        <section className="mb-8">
          {markdown && (
            <>
              <h2 className="text-lg font-semibold text-slate-700 mb-2">Whitepaper (Markdown)</h2>
              <pre className="bg-slate-100 border border-slate-200 rounded p-4 text-sm overflow-auto max-h-64 whitespace-pre-wrap">
                {markdown}
              </pre>
            </>
          )}
          {layoutSpec && (
            <>
              <h2 className="text-lg font-semibold text-slate-700 mb-2 mt-4">Visual layout spec</h2>
              <pre className="bg-slate-100 border border-slate-200 rounded p-4 text-sm overflow-auto max-h-48">
                {layoutSpec}
              </pre>
            </>
          )}
          <div className="flex flex-wrap gap-2 mt-2">
            <button
              onClick={handleGuardian}
              disabled={guardianLoading || !markdown}
              className="rounded bg-slate-700 text-white px-4 py-2 font-medium disabled:opacity-50 hover:bg-slate-600"
            >
              {guardianLoading ? "Running…" : "3. Run quality guardian"}
            </button>
            <button
              onClick={handleExportPdf}
              disabled={pdfLoading || !markdown}
              className="rounded bg-slate-700 text-white px-4 py-2 font-medium disabled:opacity-50 hover:bg-slate-600"
            >
              {pdfLoading ? "Exporting…" : "4. Export PDF"}
            </button>
          </div>
          {guardianError && <p className="text-red-600 text-sm">{guardianError}</p>}
          {pdfError && <p className="text-red-600 text-sm">{pdfError}</p>}
        </section>
      )}

      {guardianReport && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-slate-700 mb-2">Quality guardian report</h2>
          <pre className="bg-amber-50 border border-amber-200 rounded p-4 text-sm overflow-auto max-h-64 whitespace-pre-wrap">
            {guardianReport}
          </pre>
        </section>
      )}
    </main>
  );
}

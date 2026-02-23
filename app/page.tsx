"use client";

import { useState } from "react";

const CUSTOM_SOURCE_VALUE = "__custom__";

const SOURCE_OPTIONS = [
  {
    label: "E-learning MiFID II ESMA Module Adviseren Beleggen Standaard",
    url: "https://lindenhaeghe.nl/beleggen/e-learning-mifid-ii-esma-module-adviseren-beleggen-standaard",
  },
  {
    label: "100% Online Opleiding Wft Consumptief Krediet",
    url: "https://lindenhaeghe.nl/wft/consumptief-krediet/100-online-opleiding",
  },
  {
    label: "Examentraining Wft Inkomen (hele dag)",
    url: "https://lindenhaeghe.nl/wft/inkomen/examentraining-hele-dag",
  },
  {
    label: "Klassikale Opleiding Wft Schade Particulier + 100% Online",
    url: "https://lindenhaeghe.nl/wft/schade-particulier/opleiding-100-online",
  },
  {
    label: "100% Online Opleiding Wft Schade Zakelijk",
    url: "https://lindenhaeghe.nl/wft/schade-zakelijk/100-online-opleiding",
  },
];

const TEMPLATE_OPTIONS = [
  { value: "lead-magnet", label: "Lead magnet (2 pages)" },
  { value: "product-deep-dive", label: "Product deep-dive (4 pages)" },
  { value: "update-explainer", label: "Update / regulation explainer (3 pages)" },
] as const;

const LANGUAGE_OPTIONS = [
  { value: "nl", label: "Dutch (NL)" },
  { value: "en", label: "English (EN)" },
] as const;

const STEPS = [
  { id: 1, label: "Source" },
  { id: 2, label: "Structure" },
  { id: 3, label: "Compose" },
  { id: 4, label: "Validate" },
  { id: 5, label: "Export" },
] as const;

export default function Home() {
  const [step, setStep] = useState(1);
  const [sourceSelect, setSourceSelect] = useState<string>(SOURCE_OPTIONS[0].url);
  const [url, setUrl] = useState(SOURCE_OPTIONS[0].url);
  const [customUrl, setCustomUrl] = useState("");
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

  const effectiveSourceUrl = sourceSelect === CUSTOM_SOURCE_VALUE ? customUrl : url;

  async function handleExtract() {
    setExtractError(null);
    setExtractLoading(true);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: effectiveSourceUrl }),
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
    <div className="flex min-h-screen relative" style={{ backgroundColor: "#F3EDEB" }}>
      {/* Main content: full-width with padding, scroll per step */}
      <main className="flex-1 flex flex-col min-h-screen overflow-hidden relative z-10">
        <div className="flex-1 overflow-auto">
          {/* Step 1: Source */}
          {step === 1 && (
            <section className="min-h-screen flex flex-col p-6 md:p-8 max-w-4xl mx-auto">
              <h1 className="text-2xl font-bold text-slate-800 mb-2">Content engine for certify360</h1>
              <p className="text-slate-600 mb-6">Step 1 — Source</p>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Source of truth</label>
                  <select
                    value={sourceSelect}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSourceSelect(v);
                      if (v !== CUSTOM_SOURCE_VALUE) setUrl(v);
                    }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 focus:ring-2 focus:ring-[var(--brand-red)] focus:border-transparent"
                  >
                    {SOURCE_OPTIONS.map((opt) => (
                      <option key={opt.url} value={opt.url}>
                        {opt.label}
                      </option>
                    ))}
                    <option value={CUSTOM_SOURCE_VALUE}>Add your own link…</option>
                  </select>
                  {sourceSelect === CUSTOM_SOURCE_VALUE && (
                    <div className="mt-2 space-y-1.5">
                      <p className="text-sm text-slate-600">
                        You can use any Lindenhaeghe course or product page URL.
                      </p>
                      <input
                        type="url"
                        value={customUrl}
                        onChange={(e) => setCustomUrl(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 focus:ring-2 focus:ring-[var(--brand-red)] focus:border-transparent"
                        placeholder="https://lindenhaeghe.nl/wft/pensioen/e-learning"
                      />
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <button
                    onClick={handleExtract}
                    disabled={extractLoading || !effectiveSourceUrl.trim()}
                    className="rounded-lg bg-slate-700 text-white px-5 py-2.5 font-medium disabled:opacity-50 hover:bg-slate-600 transition-colors"
                  >
                    {extractLoading ? "Extracting…" : "Extract from source"}
                  </button>
                  {extractedJson && (
                    <button
                      onClick={() => setStep(2)}
                      className="rounded-lg bg-[var(--brand-red)] text-white px-5 py-2.5 font-medium hover:opacity-90 transition-opacity"
                    >
                      Next: Structure →
                    </button>
                  )}
                </div>
                {extractError && <p className="text-red-600 text-sm">{extractError}</p>}
              </div>
              <div className="flex-1 min-h-0 flex flex-col">
                <h2 className="text-lg font-semibold text-slate-700 mb-2">Extracted JSON</h2>
                <pre className="flex-1 min-h-[65vh] bg-slate-100 border border-slate-200 rounded-lg p-4 text-sm overflow-auto font-mono">
                  {extractedJson || "Extract from source of truth to see the structured data here."}
                </pre>
              </div>
            </section>
          )}

          {/* Step 2: Structure */}
          {step === 2 && (
            <section className="min-h-screen flex flex-col p-6 md:p-8 max-w-4xl mx-auto">
              <h1 className="text-2xl font-bold text-slate-800 mb-2">Content engine for certify360</h1>
              <p className="text-slate-600 mb-6">Step 2 — Structure</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Media template</label>
                  <select
                    value={template}
                    onChange={(e) => setTemplate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 focus:ring-2 focus:ring-[var(--brand-red)] focus:border-transparent"
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
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 focus:ring-2 focus:ring-[var(--brand-red)] focus:border-transparent"
                  >
                    {LANGUAGE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mb-6">
                <button
                  onClick={handleGenerate}
                  disabled={writeLoading || !extractedJson}
                  className="rounded-lg bg-slate-700 text-white px-5 py-2.5 font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-600 transition-colors"
                >
                  {writeLoading ? "Generating…" : "Generate content"}
                </button>
                <button
                  onClick={() => setStep(1)}
                  className="rounded-lg border border-slate-300 text-slate-700 px-5 py-2.5 font-medium hover:bg-slate-100 transition-colors"
                >
                  ← Back
                </button>
                {(markdown || layoutSpec) && (
                  <button
                    onClick={() => setStep(3)}
                    className="rounded-lg bg-[var(--brand-red)] text-white px-5 py-2.5 font-medium hover:opacity-90 transition-opacity"
                  >
                    Next: Compose →
                  </button>
                )}
              </div>
              {writeError && <p className="text-red-600 text-sm mb-4">{writeError}</p>}
              <div className="flex-1 min-h-0 flex flex-col">
                <h2 className="text-lg font-semibold text-slate-700 mb-2">Extracted JSON</h2>
                <pre className="flex-1 min-h-[50vh] bg-slate-100 border border-slate-200 rounded-lg p-4 text-sm overflow-auto font-mono">
                  {extractedJson || "No source data yet. Complete Step 1 first."}
                </pre>
              </div>
            </section>
          )}

          {/* Step 3: Compose */}
          {step === 3 && (
            <section className="min-h-screen flex flex-col p-6 md:p-8 max-w-4xl mx-auto">
              <h1 className="text-2xl font-bold text-slate-800 mb-2">Content engine for certify360</h1>
              <p className="text-slate-600 mb-6">Step 3 — Compose</p>
              <div className="flex flex-wrap gap-2 mb-6">
                <button
                  onClick={() => setStep(2)}
                  className="rounded-lg border border-slate-300 text-slate-700 px-5 py-2.5 font-medium hover:bg-slate-100 transition-colors"
                >
                  ← Back
                </button>
                <button
                  onClick={() => setStep(4)}
                  className="rounded-lg bg-[var(--brand-red)] text-white px-5 py-2.5 font-medium hover:opacity-90 transition-opacity"
                >
                  Next: Validate →
                </button>
              </div>
              <div className="flex-1 min-h-0 flex flex-col gap-6">
                <div className="flex-1 min-h-0 flex flex-col">
                  <h2 className="text-lg font-semibold text-slate-700 mb-2">Whitepaper (Markdown)</h2>
                  <pre className="flex-1 min-h-[45vh] bg-slate-100 border border-slate-200 rounded-lg p-4 text-sm overflow-auto whitespace-pre-wrap font-mono">
                    {markdown || "Generate content in Step 2 to see the whitepaper markdown here."}
                  </pre>
                </div>
                <div className="flex-1 min-h-0 flex flex-col">
                  <h2 className="text-lg font-semibold text-slate-700 mb-2">Visual layout spec</h2>
                  <pre className="flex-1 min-h-[35vh] bg-slate-100 border border-slate-200 rounded-lg p-4 text-sm overflow-auto font-mono">
                    {layoutSpec || "Generate content in Step 2 to see the layout spec here."}
                  </pre>
                </div>
              </div>
            </section>
          )}

          {/* Step 4: Validate */}
          {step === 4 && (
            <section className="min-h-screen flex flex-col p-6 md:p-8 max-w-4xl mx-auto">
              <h1 className="text-2xl font-bold text-slate-800 mb-2">Content engine for certify360</h1>
              <p className="text-slate-600 mb-6">Step 4 — Validate</p>
              <div className="flex flex-wrap gap-2 mb-6">
                <button
                  onClick={handleGuardian}
                  disabled={guardianLoading || !markdown}
                  className="rounded-lg bg-slate-700 text-white px-5 py-2.5 font-medium disabled:opacity-50 hover:bg-slate-600 transition-colors"
                >
                  {guardianLoading ? "Running…" : "Run quality guardian"}
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="rounded-lg border border-slate-300 text-slate-700 px-5 py-2.5 font-medium hover:bg-slate-100 transition-colors"
                >
                  ← Back
                </button>
                <button
                  onClick={() => setStep(5)}
                  className="rounded-lg bg-[var(--brand-red)] text-white px-5 py-2.5 font-medium hover:opacity-90 transition-opacity"
                >
                  Next: Export →
                </button>
              </div>
              {guardianError && <p className="text-red-600 text-sm mb-4">{guardianError}</p>}
              <div className="flex-1 min-h-0 flex flex-col">
                <h2 className="text-lg font-semibold text-slate-700 mb-2">Quality guardian report</h2>
                <pre className="flex-1 min-h-[70vh] bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm overflow-auto whitespace-pre-wrap font-mono">
                  {guardianReport || "Run the quality guardian to see the report here."}
                </pre>
              </div>
            </section>
          )}

          {/* Step 5: Export */}
          {step === 5 && (
            <section className="min-h-screen flex flex-col p-6 md:p-8 max-w-4xl mx-auto">
              <h1 className="text-2xl font-bold text-slate-800 mb-2">Content engine for certify360</h1>
              <p className="text-slate-600 mb-6">Step 5 — Export</p>
              <div className="flex flex-wrap gap-2 mb-6">
                <button
                  onClick={handleExportPdf}
                  disabled={pdfLoading || !markdown}
                  className="rounded-lg bg-slate-700 text-white px-5 py-2.5 font-medium disabled:opacity-50 hover:bg-slate-600 transition-colors"
                >
                  {pdfLoading ? "Exporting…" : "Export PDF"}
                </button>
                <button
                  onClick={() => setStep(4)}
                  className="rounded-lg border border-slate-300 text-slate-700 px-5 py-2.5 font-medium hover:bg-slate-100 transition-colors"
                >
                  ← Back
                </button>
              </div>
              {pdfError && <p className="text-red-600 text-sm mb-4">{pdfError}</p>}
              <div className="flex-1 flex flex-col justify-center text-center text-slate-600 max-w-md mx-auto">
                {markdown ? (
                  <p>Your content is ready. Click &quot;Export PDF&quot; to download.</p>
                ) : (
                  <p>Generate content in Step 2 and compose in Step 3, then return here to export.</p>
                )}
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Dot navigation: fixed right, vertically centered — labels as tooltip only */}
      <nav
        className="fixed right-4 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-4"
        aria-label="Steps"
      >
        {STEPS.map((s) => (
          <button
            key={s.id}
            onClick={() => setStep(s.id)}
            title={`${s.id}. ${s.label}`}
            className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-red)] focus-visible:ring-offset-2"
            aria-current={step === s.id ? "step" : undefined}
            aria-label={`Step ${s.id}: ${s.label}`}
          >
            <span
              className={`h-3 w-3 rounded-full block transition-all ${
                step === s.id
                  ? "bg-[var(--brand-red)] scale-125 ring-2 ring-[var(--brand-red)] ring-offset-2 ring-offset-[#F3EDEB]"
                  : "bg-slate-400 hover:bg-slate-500"
              }`}
            />
          </button>
        ))}
      </nav>
    </div>
  );
}

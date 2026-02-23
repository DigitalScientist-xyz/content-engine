# Content Engine

Template-driven POC that generates marketing whitepapers from a Lindenhaeghe course page URL. Reduces workload for marketing and graphic designers by using a fixed whitepaper template.

## Stack

- **Next.js 14** (App Router) + TypeScript + Tailwind
- **Python microservice** (FastAPI) for webpage extraction
- **OpenAI** for writing and quality check
- No database

## Prerequisites

- Node.js 18+
- Python 3.10+
- [OpenAI API key](https://platform.openai.com/api-keys)
- Playwright Chromium (for PDF export): `npx playwright install chromium`

## Environment variables

Next.js **does not load `.env.example`**. Copy it to `.env.local` and add your real values:

```bash
cp .env.example .env.local
# Edit .env.local and set OPENAI_API_KEY=sk-your-actual-key
```

Required in `.env.local`:

- **OPENAI_API_KEY** – for /api/write and /api/guardian (get one at [platform.openai.com](https://platform.openai.com/api-keys))
- **PYTHON_EXTRACTOR_URL** – optional; defaults to `http://127.0.0.1:8000`

## Run locally

### 1. Start the Python extractor

From the **project root** (`content-engine/`):

```bash
cd python-service
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
python -m pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Leave this running. The API will be at `http://127.0.0.1:8000`.

### 2. Install Playwright (for PDF export)

```bash
npx playwright install chromium
```

### 3. Start the Next.js app

From the project root:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## User flow (single page `/`)

1. **Course URL** – Default: `https://lindenhaeghe.nl/pensioen`
2. **Template** – Lead magnet (2 p), Product deep-dive (4 p), or Update explainer (3 p)
3. **Extract course data** – Calls Python service, shows extracted JSON
4. **Generate whitepaper content** – OpenAI produces Markdown + visual layout spec (sections, suggested icons, callouts)
5. **Run quality guardian** – OpenAI reviews for unsupported claims, tone, and suggests improvements (no auto-rewrite)
6. **Export PDF** – Renders the fixed HTML template + markdown sections to a PDF download

## API

- `POST /api/extract` – Body: `{ "url": "..." }` → proxies to Python `POST /extract`
- `POST /api/write` – Body: `{ "extractedData": {...}, "templateType": "lead-magnet" }` → returns `{ markdown, layoutSpec }`
- `POST /api/guardian` – Body: `{ "markdown": "...", "extractedJson"?: "..." }` → returns `{ report }`
- `POST /api/pdf` – Body: `{ "markdown": "...", "title"?: "..." }` → returns PDF file

## Project layout

```
├── app/
│   ├── api/
│   │   ├── extract/route.ts   # → Python service
│   │   ├── write/route.ts    # OpenAI whitepaper
│   │   ├── guardian/route.ts # OpenAI review
│   │   └── pdf/route.ts      # HTML template + Playwright PDF
│   ├── whitepaper-template.html
│   ├── layout.tsx
│   └── page.tsx
├── lib/types.ts
├── python-service/
│   ├── main.py
│   └── requirements.txt
└── README.md
```

## Template

The whitepaper uses a fixed HTML template with sections: **cover**, **problem**, **solution**, **what-you-get**, **FAQ**, **CTA**. The layout spec JSON (from Generate) lists section order, recommended imagery style, icon suggestions, and callouts for designers.

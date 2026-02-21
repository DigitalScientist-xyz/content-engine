"""
Whitepaper Factory - Course page extractor.
POST /extract with { "url": "..." } returns structured JSON.
Uses patterns: main content only, collapsible sections, sidebar "Wat krijg ik", price/specs blocks.
Never guess facts; use null for missing data.
"""
import re
from typing import Any, Optional

import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from bs4 import BeautifulSoup

app = FastAPI(title="Whitepaper Extractor")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# UI headings we never use as content sections
SKIP_HEADING_TEXTS = ("kruimelpad", "ga direct naar", "lees verder", "inklappen")
SKIP_HEADING_CLASSES = ("visually-hidden", "nav-header")

# Menu accordion IDs – headings inside these are nav, not course content
MENU_ACCORDION_IDS = ("accordion-main-menu", "accordion-secondary-menu")


class ExtractRequest(BaseModel):
    url: str


def _text(el) -> str:
    if el is None:
        return ""
    return (el.get_text(separator=" ", strip=True) or "").strip()


def _collect_bullets(parent) -> list[str]:
    if parent is None:
        return []
    return [_text(li) for li in parent.find_all("li") if _text(li)]


def _find_number(text: str) -> Optional[float]:
    if not text:
        return None
    m = re.search(r"[\d]+[.,]?\d*\s*(?:uur|uren|€|euro)?", text, re.I)
    if not m:
        return None
    s = re.sub(r"[^\d.,]", "", m.group(0).replace(",", "."))
    try:
        return float(s) if s else None
    except ValueError:
        return None


def _is_inside_menu_accordion(el) -> bool:
    if el is None:
        return False
    parent = el.parent
    while parent:
        aid = parent.get("id") or ""
        if any(menu_id in aid for menu_id in MENU_ACCORDION_IDS):
            return True
        parent = parent.parent
    return False


def _should_skip_heading(heading_text: str, el) -> bool:
    if not heading_text:
        return True
    lower = heading_text.lower()
    if any(skip in lower for skip in SKIP_HEADING_TEXTS):
        return True
    if el and el.get("class"):
        classes = " ".join(el.get("class", [])).lower()
        if any(c in classes for c in SKIP_HEADING_CLASSES):
            return True
    return False


def _get_scope(soup: BeautifulSoup) -> Any:
    """Main content scope: <main> or [role=main], fallback to body."""
    main = soup.find("main") or soup.find(attrs={"role": "main"})
    if main:
        return main
    return soup.find("body") or soup


def _strip_emojis(s: str) -> str:
    if not s:
        return s
    return re.sub(
        r"[\U0001F300-\U0001F9FF\U00002600-\U000026FF\U00002700-\U000027BF\U0001F600-\U0001F64F\U0001F680-\U0001F6FF]+",
        "",
        s,
        flags=re.UNICODE,
    ).strip()


def _clean_title(raw: str) -> str:
    if not raw:
        return raw
    s = re.sub(r"\s*[|\-–—]\s*Lindenhaeghe\s*$", "", raw, flags=re.IGNORECASE)
    s = re.sub(r"^\s*Lindenhaeghe\s*[|\-–—]\s*", "", s, flags=re.IGNORECASE)
    return _strip_emojis(s).strip() or raw.strip()


def _extract_title(soup: BeautifulSoup, scope) -> str:
    og = soup.find("meta", property="og:title")
    if og and og.get("content"):
        return _clean_title(og["content"].strip())
    t = soup.find("title")
    if t:
        return _clean_title(_text(t) or "")
    h1 = scope.find("h1")
    if h1:
        return _clean_title(_text(h1) or "")
    return ""


def _extract_price(scope) -> Optional[float]:
    # Price block: .price .euro, .price-with-discount, or text with €
    for cls in ("price", "euro", "price-with-discount"):
        for el in scope.find_all(class_=re.compile(re.escape(cls), re.I)):
            txt = _text(el)
            if "€" in txt:
                n = _find_number(txt)
                if n is not None:
                    return n
    for el in scope.find_all(string=re.compile(r"€\s*[\d]")):  # € 279
        txt = el if isinstance(el, str) else _text(el)
        n = _find_number(txt)
        if n is not None:
            return n
    return None


def _extract_study_load_hours(scope) -> Optional[float]:
    # .specs-list-title often has "X uur studiebelasting"
    for el in scope.find_all(class_=re.compile(r"specs-list-title", re.I)):
        txt = _text(el)
        n = _find_number(txt)
        if n is not None:
            return n
    for el in scope.find_all(string=re.compile(r"\d+\s*(?:uur|uren)", re.I)):
        n = _find_number(el if isinstance(el, str) else _text(el))
        if n is not None:
            return n
    return None


def _extract_key_benefits_from_sidebar(scope) -> list[str]:
    # "Wat krijg ik bij..." in .contra-colored-card: .card-heading + ul inside same card
    for card in scope.find_all(class_=re.compile(r"contra-colored-card", re.I)):
        ch = card.find(class_=re.compile(r"card-heading", re.I))
        heading = _text(ch) if ch else ""
        if "wat krijg" not in heading.lower():
            continue
        ul = card.find("ul")
        if ul:
            return _collect_bullets(ul)[:15]
    # Green block: heading "Wat krijg ik..." then next ul with checkmarks
    for h in scope.find_all(["h2", "h3", "h4"], class_=re.compile(r"heading|h[234]", re.I)):
        if not _text(h) or "wat krijg" not in _text(h).lower():
            continue
        ul = h.find_next("ul")
        if ul:
            return _collect_bullets(ul)[:15]
    return []


def _extract_content_sections_from_collapsible(scope) -> list[dict[str, Any]]:
    """Sections from <section class="collapsible-element"> with accordion: button text = heading, .accordion-body = content."""
    sections: list[dict[str, Any]] = []
    for section in scope.find_all("section", class_=re.compile(r"collapsible", re.I)):
        accordion = section.find("div", class_=re.compile(r"accordion", re.I))
        if not accordion or _is_inside_menu_accordion(accordion):
            continue
        for item in accordion.find_all("div", class_=re.compile(r"accordion-item", re.I)):
            header = item.find("h2", class_=re.compile(r"accordion-header", re.I)) or item.find("h3", class_=re.compile(r"accordion-header", re.I))
            if not header:
                continue
            btn = header.find("button")
            heading = _text(btn) if btn else _text(header)
            if _should_skip_heading(heading, header):
                continue
            body_el = item.find("div", class_=re.compile(r"accordion-body", re.I))
            bullets: list[str] = []
            if body_el:
                for p in body_el.find_all("p"):
                    t = _text(p)
                    if t:
                        bullets.append(t)
                for ul in body_el.find_all("ul"):
                    bullets.extend(_collect_bullets(ul))
            sections.append({"heading": heading, "bullets": bullets[:20]})
    return sections


def _extract_content_sections_fallback(scope) -> list[dict[str, Any]]:
    """Fallback: h2/h3 not in menu, next sibling ul or p."""
    sections: list[dict[str, Any]] = []
    for h in scope.find_all(["h2", "h3"]):
        if _is_inside_menu_accordion(h):
            continue
        heading = _text(h)
        if _should_skip_heading(heading, h):
            continue
        bullets: list[str] = []
        n = h.find_next_sibling()
        if n and n.name == "ul":
            bullets = _collect_bullets(n)
        elif n and n.name == "p":
            t = _text(n)
            if t:
                bullets = [t]
        sections.append({"heading": heading, "bullets": bullets[:15]})
    return sections


def _extract_summary_bullets(scope) -> list[str]:
    # First meaningful list in main (e.g. specs: study load, features)
    for ul in scope.find_all("ul"):
        if _is_inside_menu_accordion(ul):
            continue
        items = _collect_bullets(ul)
        if items and len(items) <= 12:
            return items[:8]
    return []


@app.post("/extract")
def extract(req: ExtractRequest) -> dict[str, Any]:
    url = (req.url or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="url is required")

    try:
        resp = requests.get(url, timeout=15, headers={"User-Agent": "WhitepaperFactory/1.0"})
        resp.raise_for_status()
        html = resp.text
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch URL: {e}")

    soup = BeautifulSoup(html, "html.parser")
    scope = _get_scope(soup)

    title = _extract_title(soup, scope) or ""
    label = "Lindenhaeghe"

    # Key benefits: sidebar "Wat krijg ik" block first
    key_benefits = _extract_key_benefits_from_sidebar(scope)
    if not key_benefits:
        for h in scope.find_all(["h2", "h3"]):
            if _is_inside_menu_accordion(h):
                continue
            t = _text(h)
            if t and any(w in t.lower() for w in ("voordeel", "benefit", "waarom", "wat krijg", "resultaat", "wat levert")):
                n = h.find_next_sibling()
                if n and n.name == "ul":
                    key_benefits = _collect_bullets(n)[:10]
                    break
                if n and n.name in ("p", "div"):
                    pt = _text(n)
                    if pt:
                        key_benefits = [pt[:300]]
                        break
    if not key_benefits:
        key_benefits = _extract_summary_bullets(scope)[:6]

    summary_bullets = _extract_summary_bullets(scope)

    # Content sections: collapsible accordions first, then fallback
    content_sections = _extract_content_sections_from_collapsible(scope)
    if not content_sections:
        content_sections = _extract_content_sections_fallback(scope)

    price = _extract_price(scope)
    study_load_hours = _extract_study_load_hours(scope)
    availability_period = None
    locations_count = None

    disclaimers = []
    for tag in soup.find_all(["small", "footer", "aside"]):
        t = _text(tag)
        if t and 20 < len(t) < 800:
            disclaimers.append(t[:500])

    return {
        "sourceUrl": url,
        "title": title or None,
        "label": label,
        "summaryBullets": summary_bullets,
        "keyBenefits": key_benefits[:10],
        "contentSections": content_sections,
        "facts": {
            "price": price,
            "studyLoadHours": study_load_hours,
            "availabilityPeriod": availability_period,
            "locationsCount": locations_count,
        },
        "disclaimers": disclaimers[:5],
    }

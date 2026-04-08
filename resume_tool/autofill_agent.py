"""
autofill_agent.py

Usage:
    python autofill_agent.py <application_url>

Launches a visible Chromium browser, navigates to the given job-application
URL, and uses OpenAI to map form fields to applicant data.  Multi-page forms
are handled automatically; the agent pauses for user confirmation before
clicking a final Submit button.

Prerequisites:
    pip install -r requirements.txt
    playwright install chromium
"""

import base64
import json
import os
import re
import sys

from dotenv import dotenv_values
from openai import OpenAI
from playwright.sync_api import sync_playwright, TimeoutError as PwTimeout

from utils import load_json

# ---------------------------------------------------------------------------
# OpenAI setup (mirrors resume_tailor.py)
# ---------------------------------------------------------------------------
env_config = dotenv_values(".env")
client = OpenAI(api_key=env_config.get("OPENAI_API_KEY"))
MODEL_NAME = env_config.get("MODEL_NAME", "gpt-5-mini")
VISION_MODEL = env_config.get("VISION_MODEL", "gpt-5-mini")

FIELD_MAP_PROMPT = """\
You are an expert at filling out online job-application forms.

You will receive two things:
1. A list of form fields found on the current page (label, selector, type, options, etc.).
2. The applicant's full profile (contact info, education, work experience, skills, etc.).

Map these form fields to the applicant profile below.
For each field return:
{ "field_label": "...", "selector": "...", "value": "...", "confidence": 0.0-1.0 }

Rules:
- Use EXACT selector strings from the field list — never invent selectors.
- For <select> fields the value MUST be one of the provided option values.
- For file-upload fields set value to "__FILE_UPLOAD__" with confidence 1.0.
- Set confidence < 0.8 and value "__PAUSE__" for anything ambiguous or not in the profile.
- Return ONLY a JSON array, no markdown fences, no commentary."""

VISION_RESOLVE_PROMPT = """\
The screenshot shows a form field that the text-based mapper could not resolve.
Given the applicant profile below, determine the correct value for this field.
Return JSON: { "value": "...", "confidence": 0.0-1.0 }
If you cannot determine the value, set confidence to 0.0.
Return ONLY JSON, no markdown."""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _strip_markdown_fences(text: str) -> str:
    match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if match:
        return match.group(1).strip()
    return text.strip()


def _build_profile(applicant: dict, resume: dict) -> dict:
    """Merge applicant contact data and tailored resume into one dict."""
    return {"applicant_info": applicant, "resume": resume}


JS_EXTRACT_FIELDS = """
() => {
    function labelFor(el) {
        if (el.id) {
            const lbl = document.querySelector('label[for="' + el.id + '"]');
            if (lbl) return lbl.innerText.trim();
        }
        const parent = el.closest('label');
        if (parent) return parent.innerText.trim();
        const prev = el.previousElementSibling;
        if (prev && prev.tagName === 'LABEL') return prev.innerText.trim();
        return '';
    }

    function selectorFor(el) {
        if (el.id) return '#' + CSS.escape(el.id);
        if (el.name) {
            const byName = document.querySelectorAll(el.tagName + '[name="' + el.name + '"]');
            if (byName.length === 1) return el.tagName.toLowerCase() + '[name="' + el.name + '"]';
        }
        const parent = el.parentElement;
        if (!parent) return el.tagName.toLowerCase();
        const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
        const idx = siblings.indexOf(el) + 1;
        const parentSel = parent.id ? '#' + CSS.escape(parent.id) : parent.tagName.toLowerCase();
        return parentSel + ' > ' + el.tagName.toLowerCase() + ':nth-of-type(' + idx + ')';
    }

    const results = [];
    const elements = document.querySelectorAll('input, select, textarea');
    for (const el of elements) {
        if (el.type === 'hidden') continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;

        const info = {
            tag: el.tagName.toLowerCase(),
            type: el.type || '',
            name: el.name || '',
            id: el.id || '',
            placeholder: el.placeholder || '',
            aria_label: el.getAttribute('aria-label') || '',
            label: labelFor(el),
            value: el.value || '',
            required: el.required || false,
            selector: selectorFor(el),
        };

        if (el.tagName === 'SELECT') {
            info.options = Array.from(el.options).map(o => ({
                value: o.value,
                text: o.text.trim()
            }));
        }

        results.push(info);
    }
    return results;
}
"""

# ---------------------------------------------------------------------------
# Core functions
# ---------------------------------------------------------------------------

def extract_form_fields(page):
    """Return (field_list, accessibility_snapshot_text)."""
    try:
        a11y = page.accessibility.snapshot()
    except Exception:
        a11y = None
    a11y_text = json.dumps(a11y, indent=2) if a11y else "(accessibility tree unavailable)"

    fields = page.evaluate(JS_EXTRACT_FIELDS)
    return fields, a11y_text


def map_fields_to_profile(fields, profile):
    """Ask OpenAI to map form fields to the applicant profile. Returns list of dicts."""
    user_message = (
        f"FORM FIELDS:\n{json.dumps(fields, indent=2)}\n\n"
        f"APPLICANT PROFILE:\n{json.dumps(profile, indent=2)}"
    )

    response = client.chat.completions.create(
        model=MODEL_NAME,
        messages=[
            {"role": "system", "content": FIELD_MAP_PROMPT},
            {"role": "user", "content": user_message},
        ],
        temperature=0.1,
    )
    raw = response.choices[0].message.content.strip()
    raw = _strip_markdown_fences(raw)

    try:
        mappings = json.loads(raw)
    except json.JSONDecodeError:
        print(f"[WARN] LLM returned invalid JSON, skipping page.\n{raw[:500]}")
        return []

    if not isinstance(mappings, list):
        print("[WARN] LLM did not return a JSON array, skipping page.")
        return []

    return mappings


def resolve_pause_field(page, mapping, profile):
    """
    Screenshot the ambiguous element and ask the vision model to resolve it.
    Returns an updated mapping dict (value/confidence may change).
    """
    selector = mapping.get("selector", "")
    try:
        element = page.query_selector(selector)
        if not element:
            return mapping

        screenshot_bytes = element.screenshot()
        b64 = base64.b64encode(screenshot_bytes).decode()

        response = client.chat.completions.create(
            model=VISION_MODEL,
            messages=[
                {"role": "system", "content": VISION_RESOLVE_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                f"Field: {mapping.get('field_label', '(unknown)')}\n"
                                f"Selector: {selector}\n\n"
                                f"APPLICANT PROFILE:\n{json.dumps(profile, indent=2)}"
                            ),
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{b64}",
                            },
                        },
                    ],
                },
            ],
            temperature=0.1,
        )

        raw = response.choices[0].message.content.strip()
        raw = _strip_markdown_fences(raw)
        result = json.loads(raw)

        if result.get("confidence", 0) >= 0.8:
            mapping["value"] = result["value"]
            mapping["confidence"] = result["confidence"]
            print(f"  [VISION] Resolved '{mapping.get('field_label')}' -> {result['value']}")
        else:
            print(f"  [VISION] Could not resolve '{mapping.get('field_label')}' (conf={result.get('confidence', 0)})")
    except Exception as exc:
        print(f"  [VISION] Error resolving '{mapping.get('field_label')}': {exc}")

    return mapping


def fill_fields(page, mappings, resume_pdf_path):
    """Fill form fields. Returns (filled_list, skipped_list)."""
    filled = []
    skipped = []

    sorted_mappings = sorted(mappings, key=lambda m: m.get("confidence", 0), reverse=True)

    for m in sorted_mappings:
        selector = m.get("selector", "")
        value = m.get("value", "")
        confidence = m.get("confidence", 0)
        label = m.get("field_label", selector)

        if value == "__PAUSE__" or confidence < 0.8:
            skipped.append({"field": label, "reason": "low confidence or ambiguous", "confidence": confidence})
            continue

        try:
            if value == "__FILE_UPLOAD__":
                if resume_pdf_path and os.path.isfile(resume_pdf_path):
                    page.set_input_files(selector, resume_pdf_path)
                    filled.append({"field": label, "value": os.path.basename(resume_pdf_path)})
                    print(f"  [UPLOAD] {label} <- {os.path.basename(resume_pdf_path)}")
                else:
                    skipped.append({"field": label, "reason": "resume PDF not found"})
                    print(f"  [SKIP]   {label} — resume PDF not found at {resume_pdf_path}")
                continue

            element = page.query_selector(selector)
            if not element:
                skipped.append({"field": label, "reason": "element not found"})
                print(f"  [SKIP]   {label} — selector not found: {selector}")
                continue

            tag = element.evaluate("el => el.tagName.toLowerCase()")

            if tag == "select":
                page.select_option(selector, value)
                filled.append({"field": label, "value": value})
                print(f"  [SELECT] {label} <- {value}")
            else:
                page.fill(selector, value)
                filled.append({"field": label, "value": value})
                print(f"  [FILL]   {label} <- {value}")

        except Exception as exc:
            skipped.append({"field": label, "reason": str(exc)})
            print(f"  [ERROR]  {label} — {exc}")

    return filled, skipped


# Patterns ranked by priority: submit-like last, navigation first
_NEXT_PATTERNS = re.compile(r"\b(next|continue|save\s*&?\s*continue|proceed)\b", re.I)
_SUBMIT_PATTERNS = re.compile(r"\b(submit|apply|send\s*application|finish)\b", re.I)


def detect_navigation_button(page):
    """
    Scan for navigation/submit buttons.
    Returns ("next", locator) | ("submit", locator) | ("none", None).
    """
    buttons = page.query_selector_all(
        'button, input[type="submit"], input[type="button"], a[role="button"], [role="button"]'
    )

    next_candidate = None
    submit_candidate = None

    for btn in buttons:
        try:
            rect = btn.bounding_box()
            if not rect or rect["width"] == 0:
                continue
            text = (btn.inner_text() or btn.get_attribute("value") or "").strip()
        except Exception:
            continue

        if _NEXT_PATTERNS.search(text):
            next_candidate = btn
        elif _SUBMIT_PATTERNS.search(text):
            submit_candidate = btn

    if next_candidate:
        return "next", next_candidate
    if submit_candidate:
        return "submit", submit_candidate
    return "none", None


def print_summary(filled, skipped):
    print("\n" + "=" * 60)
    print("FILLED FIELDS:")
    if filled:
        for f in filled:
            print(f"  {f['field']:40s} <- {f['value']}")
    else:
        print("  (none)")

    print("\nSKIPPED FIELDS:")
    if skipped:
        for s in skipped:
            print(f"  {s['field']:40s}   reason: {s['reason']}")
    else:
        print("  (none)")
    print("=" * 60)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    if len(sys.argv) < 2:
        print("Usage: python autofill_agent.py <application_url>")
        sys.exit(1)

    url = sys.argv[1]

    applicant = load_json("data/applicant_data.json")
    resume = load_json("outputs/tailored_resume.json")
    profile = _build_profile(applicant, resume)

    resume_pdf_path = os.path.abspath(applicant.get("resume_pdf_path", "outputs/tailored_resume.pdf"))

    all_filled = []
    all_skipped = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=False, slow_mo=100)
        context = browser.new_context(viewport={"width": 1280, "height": 900})
        page = context.new_page()

        try:
            print(f"Navigating to {url} ...")
            page.goto(url, wait_until="domcontentloaded", timeout=30_000)
            page.wait_for_load_state("networkidle", timeout=15_000)

            page_num = 0
            while True:
                page_num += 1
                print(f"\n--- Page {page_num} ---")

                # 1. Extract
                fields, a11y_text = extract_form_fields(page)
                if not fields:
                    print("No form fields found on this page.")
                    break

                print(f"Found {len(fields)} form field(s).")

                # 2. Map via LLM
                mappings = map_fields_to_profile(fields, profile)
                if not mappings:
                    print("LLM returned no mappings; stopping.")
                    break

                # 3. Resolve PAUSE fields via vision
                for i, m in enumerate(mappings):
                    if m.get("value") == "__PAUSE__":
                        mappings[i] = resolve_pause_field(page, m, profile)

                # 4. Fill
                filled, skipped = fill_fields(page, mappings, resume_pdf_path)
                all_filled.extend(filled)
                all_skipped.extend(skipped)

                # 5. Detect navigation
                action, button = detect_navigation_button(page)

                if action == "next":
                    print("\nClicking Next / Continue ...")
                    button.click()
                    try:
                        page.wait_for_load_state("networkidle", timeout=15_000)
                    except PwTimeout:
                        page.wait_for_timeout(2000)
                    continue

                if action == "submit":
                    print_summary(all_filled, all_skipped)
                    answer = input("\nSubmit application? (y/n): ").strip().lower()
                    if answer == "y":
                        print("Submitting ...")
                        button.click()
                        try:
                            page.wait_for_load_state("networkidle", timeout=15_000)
                        except PwTimeout:
                            pass
                        print("Done — application submitted.")
                    else:
                        print("Aborted by user.")
                    break

                # No recognizable button
                print("No Next/Submit button detected. Stopping.")
                print_summary(all_filled, all_skipped)
                break

        except KeyboardInterrupt:
            print("\nInterrupted by user.")
        except Exception as exc:
            print(f"\nFatal error: {exc}")
        finally:
            input("\nPress Enter to close the browser...")
            context.close()
            browser.close()


if __name__ == "__main__":
    main()

"""
jd_analyzer.py

Usage:
    python jd_analyzer.py

Paste your JD when prompted, then press Enter twice to submit.
Outputs: jd_analysis.json in the current directory.
"""

import json
import re
from dotenv import dotenv_values
from openai import OpenAI
from utils import load_json, save_json

env_config = dotenv_values(".env")
client = OpenAI(api_key=env_config.get("OPENAI_API_KEY"))

REQUIRED_KEYS = {
    "role", "company", "location", "hard_skills", "soft_skills",
    "key_responsibilities", "required_qualifications", "preferred_qualifications",
    "keywords", "tone", "domain", "notes",
}

SYSTEM_PROMPT = """You are a precise job description parser. Extract structured data from the \
job description the user provides.

Return ONLY valid JSON — no preamble, no explanation, no markdown, no code fences.

Output schema (every key is required):
{
  "role":                    string  — job title exactly as written in the JD,
  "company":                 string  — company name, or "Unknown" if not stated,
  "location":                string  — city/state, "Remote", "Hybrid", or "Unknown" if not stated,
  "hard_skills":             array   — technical skills EXPLICITLY named (never inferred); [] if none,
  "soft_skills":             array   — soft skills or traits EXPLICITLY named; [] if none,
  "key_responsibilities":    array   — top 4-6 responsibilities as concise action phrases,
  "required_qualifications": array   — must-have qualifications; [] if none listed,
  "preferred_qualifications": array  — nice-to-have qualifications; [] if none listed,
  "keywords":                array   — terms that appear multiple times or carry obvious weight,
  "tone":                    string  — exactly one of: technical | startup | corporate | research | creative,
  "domain":                  string  — exactly one of: backend | frontend | fullstack | ML/AI | data | infra | research | general SWE | other,
  "notes":                   string  — visa sponsorship, clearance, team details, etc.; "" if nothing notable
}

Rules:
- Every key listed above must be present in the output.
- Array fields must always be arrays, never null or a string.
- "tone" and "domain" must be one of the allowed values exactly; choose the closest match.
- Do not infer or fabricate information not present in the JD."""


def get_jd_input() -> str:
    print("\n=== JD ANALYZER ===")
    print("Paste the job description below.")
    print("When done, press Enter twice (blank line) to submit.\n")
    lines = []
    while True:
        line = input()
        if line == "" and lines and lines[-1] == "":
            break
        lines.append(line)
    return "\n".join(lines).strip()


def _strip_markdown_fences(text: str) -> str:
    """Remove ```json ... ``` or ``` ... ``` wrappers if present."""
    match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if match:
        return match.group(1).strip()
    return text


def analyze_jd(jd_text: str) -> dict:
    response = client.chat.completions.create(
        model="gpt-5-mini",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": jd_text},
        ],
        temperature=0.1,
        response_format={"type": "json_object"},
    )
    raw = response.choices[0].message.content.strip()

    # Defensive strip in case the model ignores response_format
    raw = _strip_markdown_fences(raw)

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as e:
        raise json.JSONDecodeError(
            f"Model returned invalid JSON: {e.msg}\n\n--- Raw output ---\n{raw}",
            e.doc, e.pos,
        ) from e

    missing = REQUIRED_KEYS - parsed.keys()
    if missing:
        raise ValueError(f"Model response is missing required keys: {sorted(missing)}")

    return parsed


def preview(data: dict) -> None:
    print("\n=== PARSED JD ===")
    print(f"Role:    {data.get('role', 'N/A')}")
    print(f"Company: {data.get('company', 'N/A')}")
    print(f"Domain:  {data.get('domain', 'N/A')}  |  Tone: {data.get('tone', 'N/A')}")

    hard_skills = data.get("hard_skills") or []
    keywords = data.get("keywords") or []
    responsibilities = data.get("key_responsibilities") or []
    notes = data.get("notes", "")

    print(f"\nHard Skills:  {', '.join(hard_skills) if hard_skills else 'None listed'}")
    print(f"Keywords:     {', '.join(keywords) if keywords else 'None listed'}")
    print(f"\nTop Responsibilities:")
    for r in responsibilities:
        print(f"  - {r}")
    if notes:
        print(f"\nNotes: {notes}")


def main() -> None:
    jd_text = get_jd_input()

    if not jd_text:
        print("No input received. Exiting.")
        return

    print("\nAnalyzing...")
    try:
        result = analyze_jd(jd_text)
    except json.JSONDecodeError as e:
        print(f"\nError: {e}")
        return
    except ValueError as e:
        print(f"\nValidation error: {e}")
        return
    except Exception as e:
        print(f"\nAPI error: {e}")
        return

    preview(result)
    save_json(result, "jd_analysis.json")
    save_json(result, "outputs/jd_analysis.json")
    # Sanity check read via helper; does not alter existing behavior.
    _ = load_json("jd_analysis.json")
    print("\n✓ Saved to jd_analysis.json")


if __name__ == "__main__":
    main()
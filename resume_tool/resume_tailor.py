"""
resume_tailor.py

Usage:
    python resume_tailor.py

Reads data/master_resume.json and outputs/jd_analysis.json, calls OpenAI to
produce a tailored resume, saves it to outputs/tailored_resume.json, and
prints a bullet-level diff so you can review every change.
"""

import json
import re
from dotenv import dotenv_values
from openai import OpenAI
from utils import load_json, save_json

env_config = dotenv_values(".env")
client = OpenAI(api_key=env_config.get("OPENAI_API_KEY"))
MODEL_NAME = env_config.get("MODEL_NAME", "gpt-5-mini")

SYSTEM_PROMPT = """You are an expert resume writer. You will receive a master resume in JSON format and a \
parsed job description. Your job is to produce a TAILORED version of the resume JSON.

Rules:
- Never invent experience, skills, or credentials that are not in the master resume
- Rewrite bullet point text to mirror the JD's keywords and language where honest
- Reorder bullets within each job/project so the most relevant ones come first
- Select the 3 most relevant projects from the master resume for this role
- Add any JD hard_skills to the skills section only if they already exist in the master
- Keep the same JSON schema as the master resume exactly
- Return ONLY valid JSON, no markdown, no preamble"""


def _strip_markdown_fences(text: str) -> str:
    """Remove ```json ... ``` or ``` ... ``` wrappers if present."""
    match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if match:
        return match.group(1).strip()
    return text


def tailor_resume(master: dict, jd_analysis: dict) -> dict:
    user_message = (
        f"MASTER RESUME:\n{json.dumps(master, indent=2)}\n\n"
        f"JOB DESCRIPTION ANALYSIS:\n{json.dumps(jd_analysis, indent=2)}\n\n"
        "Produce the tailored resume JSON now."
    )

    response = client.chat.completions.create(
        model=MODEL_NAME,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        temperature=0.3,
    )
    raw = response.choices[0].message.content.strip()
    raw = _strip_markdown_fences(raw)

    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        raise json.JSONDecodeError(
            f"Model returned invalid JSON: {e.msg}\n\n--- Raw output ---\n{raw}",
            e.doc,
            e.pos,
        ) from e


def print_diff(original: dict, tailored: dict) -> None:
    print("\n=== RESUME DIFF ===\n")

    for section_key, label in (("experience", "EXPERIENCE"), ("projects", "PROJECTS")):
        orig_items = original.get(section_key, [])
        tail_items = tailored.get(section_key, [])

        orig_by_id = {item["id"]: item for item in orig_items}

        if tail_items:
            print(f"--- {label} ---")

        for tail_item in tail_items:
            item_id = tail_item.get("id")
            orig_item = orig_by_id.get(item_id)

            if section_key == "experience":
                header = f"{tail_item.get('title', '')} @ {tail_item.get('company', '')}"
            else:
                header = tail_item.get("name", item_id or "Unknown")

            print(f"\n  {header}")

            orig_bullets_by_id = {}
            if orig_item:
                for b in orig_item.get("bullets", []):
                    orig_bullets_by_id[b["id"]] = b["text"]

            for bullet in tail_item.get("bullets", []):
                bid = bullet.get("id")
                new_text = bullet.get("text", "")
                orig_text = orig_bullets_by_id.get(bid)

                if orig_text is None:
                    print(f"    + {new_text}")
                elif orig_text == new_text:
                    print(f"      {new_text}")
                else:
                    print(f"    - {orig_text}")
                    print(f"    + {new_text}")

        if tail_items:
            print()


def main() -> None:
    master = load_json("data/master_resume.json")
    jd_analysis = load_json("outputs/jd_analysis.json")

    print("Tailoring resume...")
    try:
        tailored = tailor_resume(master, jd_analysis)
    except json.JSONDecodeError as e:
        print(f"\nError: {e}")
        return
    except Exception as e:
        print(f"\nAPI error: {e}")
        return

    save_json(tailored, "outputs/tailored_resume.json")
    print_diff(master, tailored)
    print("✓ Saved to outputs/tailored_resume.json")


if __name__ == "__main__":
    main()

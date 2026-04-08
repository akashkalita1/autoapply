import json
import os

from dotenv import dotenv_values
from openai import OpenAI

from utils import load_json

env_config = dotenv_values(".env")
client = OpenAI(api_key=env_config.get("OPENAI_API_KEY"))
MODEL_NAME = env_config.get("MODEL_NAME", "gpt-5-mini")

SYSTEM_PROMPT = """You are a cover letter writer. You write in the voice of the applicant based on their \
style profile. You produce cover letters that feel human, specific, and direct.

Rules:
- Follow the style profile strictly
- Reference specific things from the job description (company name, role, 1-2 responsibilities)
- Pull 2 relevant experience callouts from the resume — be specific, use numbers if available
- Do not use hollow phrases: passionate, excited to, leverage, synergy, team player
- Do not restate the resume — the letter adds context the resume cannot
- Return only the cover letter text, no subject line, no date, no address block"""


def generate_cover_letter(master_resume, jd_analysis, style_profile):
    user_message = (
        f"STYLE PROFILE:\n{style_profile}\n\n"
        f"RESUME SUMMARY:\n{json.dumps(master_resume, indent=2)}\n\n"
        f"JOB DESCRIPTION ANALYSIS:\n{json.dumps(jd_analysis, indent=2)}\n\n"
        "Write the cover letter now."
    )
    response = client.chat.completions.create(
        model=MODEL_NAME,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        temperature=0.7,
    )
    return response.choices[0].message.content.strip()


def main() -> bool:
    master_resume = load_json("data/master_resume.json")
    jd_analysis = load_json("outputs/jd_analysis.json")
    with open("data/style_profile.txt", "r") as f:
        style_profile = f.read()

    try:
        letter = generate_cover_letter(master_resume, jd_analysis, style_profile)
    except Exception as e:
        print(f"\nCover letter error: {e}")
        return False

    os.makedirs("outputs", exist_ok=True)
    with open("outputs/cover_letter.txt", "w") as f:
        f.write(letter)

    print(letter)
    return True


if __name__ == "__main__":
    if not main():
        raise SystemExit(1)

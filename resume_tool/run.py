import os

import jd_analyzer
import resume_tailor
import cover_letter


def main():
    os.makedirs("outputs", exist_ok=True)

    if not jd_analyzer.main():
        print("\nAborting: JD analysis failed.")
        return

    if not resume_tailor.main():
        print("\nAborting: Resume tailoring failed.")
        return

    answer = input("\nGenerate cover letter? (y/n): ").strip().lower()
    cover_letter_ok = False
    if answer == "y":
        cover_letter_ok = cover_letter.main()

    print("\nDone. Files saved to outputs/:")
    print("  - jd_analysis.json")
    print("  - tailored_resume.json")
    if cover_letter_ok:
        print("  - cover_letter.txt")


if __name__ == "__main__":
    main()

"""
resume_renderer.py

Loads outputs/tailored_resume.json and renders it as a clean single-page PDF
using WeasyPrint (HTML + CSS pipeline).

Usage (standalone):
    python resume_renderer.py

Called automatically by resume_tailor.main() after saving tailored_resume.json.
"""

from __future__ import annotations

import html as html_module
import os
from utils import load_json


def _esc(text: str) -> str:
    """HTML-escape a string."""
    return html_module.escape(str(text)) if text else ""


def _contact_strip(personal: dict) -> str:
    parts = []
    if personal.get("email"):
        parts.append(f'<a href="mailto:{_esc(personal["email"])}">{_esc(personal["email"])}</a>')
    if personal.get("phone"):
        parts.append(_esc(personal["phone"]))
    if personal.get("location"):
        parts.append(_esc(personal["location"]))
    if personal.get("linkedin"):
        url = personal["linkedin"]
        label = url.replace("https://", "").replace("http://", "")
        parts.append(f'<a href="{_esc(url)}">{_esc(label)}</a>')
    if personal.get("github"):
        url = personal["github"]
        label = url.replace("https://", "").replace("http://", "")
        parts.append(f'<a href="{_esc(url)}">{_esc(label)}</a>')
    return " &nbsp;·&nbsp; ".join(parts)


def _section(title: str, body: str) -> str:
    return f"""
<div class="section">
  <div class="section-header">{_esc(title)}</div>
  {body}
</div>"""


def _bullets(items: list[dict]) -> str:
    if not items:
        return ""
    lis = "".join(f"<li>{_esc(b.get('text', ''))}</li>" for b in items)
    return f"<ul>{lis}</ul>"


def _build_education(education: list) -> str:
    blocks = []
    for edu in education:
        institution = _esc(edu.get("institution", ""))
        degree = _esc(edu.get("degree", ""))
        expected = _esc(edu.get("expected", ""))
        gpa = edu.get("gpa")
        coursework = edu.get("coursework", [])
        awards = edu.get("awards", [])

        right_col = expected
        if gpa:
            right_col += f" &nbsp;·&nbsp; GPA: {_esc(str(gpa))}"

        cw_str = ""
        if coursework:
            cw_str = f'<div class="sub">Coursework: {_esc(", ".join(coursework))}</div>'

        aw_str = ""
        if awards:
            aw_str = f'<div class="sub">Awards: {_esc(", ".join(awards))}</div>'

        blocks.append(f"""
<div class="entry">
  <div class="entry-header">
    <span class="entry-title">{institution}</span>
    <span class="entry-date">{right_col}</span>
  </div>
  <div class="entry-subtitle">{degree}</div>
  {cw_str}{aw_str}
</div>""")
    return _section("Education", "".join(blocks))


def _build_skills(skills: dict) -> str:
    rows = []
    mapping = [
        ("languages", "Languages"),
        ("technologies", "Technologies"),
        ("concepts", "Concepts"),
    ]
    for key, label in mapping:
        items = skills.get(key, [])
        if items:
            rows.append(
                f'<div class="skill-row"><span class="skill-label">{_esc(label)}:</span>'
                f' {_esc(", ".join(items))}</div>'
            )
    return _section("Skills", "".join(rows))


def _build_experience(experience: list) -> str:
    blocks = []
    for exp in experience:
        title = _esc(exp.get("title", ""))
        company = _esc(exp.get("company", ""))
        location = _esc(exp.get("location", ""))
        start = _esc(exp.get("start", ""))
        end = _esc(exp.get("end", ""))
        headline = _esc(exp.get("headline", ""))
        date_range = f"{start} – {end}" if start or end else ""
        right = f"{date_range}" + (f" &nbsp;·&nbsp; {location}" if location else "")

        blocks.append(f"""
<div class="entry">
  <div class="entry-header">
    <span class="entry-title">{title} <span class="entry-company">@ {company}</span></span>
    <span class="entry-date">{right}</span>
  </div>
  {"" if not headline else f'<div class="entry-headline">{headline}</div>'}
  {_bullets(exp.get("bullets", []))}
</div>""")
    return _section("Experience", "".join(blocks))


def _build_projects(projects: list) -> str:
    blocks = []
    for proj in projects:
        name = _esc(proj.get("name", ""))
        tech = proj.get("tech", [])
        tech_str = f'<span class="entry-headline">{_esc(", ".join(tech))}</span>' if tech else ""

        blocks.append(f"""
<div class="entry">
  <div class="entry-header">
    <span class="entry-title">{name}</span>
    {tech_str}
  </div>
  {_bullets(proj.get("bullets", []))}
</div>""")
    return _section("Projects", "".join(blocks))


def _build_leadership(leadership: list) -> str:
    if not leadership:
        return ""
    blocks = []
    for lead in leadership:
        org = _esc(lead.get("organization", ""))
        role = _esc(lead.get("role", ""))
        location = _esc(lead.get("location", ""))
        start = _esc(lead.get("start", ""))
        end = _esc(lead.get("end", ""))
        date_range = f"{start} – {end}" if start or end else ""
        right = date_range + (f" &nbsp;·&nbsp; {location}" if location else "")

        blocks.append(f"""
<div class="entry">
  <div class="entry-header">
    <span class="entry-title">{role} <span class="entry-company">@ {org}</span></span>
    <span class="entry-date">{right}</span>
  </div>
  {_bullets(lead.get("bullets", []))}
</div>""")
    return _section("Leadership", "".join(blocks))


CSS = """
@page {
  size: letter;
  margin: 0.45in 0.5in;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
  font-size: 9pt;
  line-height: 1.35;
  color: #111;
}

a {
  color: inherit;
  text-decoration: none;
}

/* ── Header ─────────────────────────────── */
.header {
  text-align: center;
  margin-bottom: 6pt;
}

.header-name {
  font-size: 20pt;
  font-weight: 700;
  letter-spacing: 0.04em;
  margin-bottom: 2pt;
}

.header-contact {
  font-size: 8pt;
  color: #444;
}

/* ── Section ─────────────────────────────── */
.section {
  margin-bottom: 6pt;
  page-break-inside: avoid;
}

.section-header {
  font-size: 9.5pt;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  border-bottom: 1px solid #222;
  padding-bottom: 1.5pt;
  margin-bottom: 4pt;
}

/* ── Entry ───────────────────────────────── */
.entry {
  margin-bottom: 4pt;
  page-break-inside: avoid;
}

.entry-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.entry-title {
  font-weight: 700;
  font-size: 9pt;
}

.entry-company {
  font-weight: 400;
  font-style: italic;
}

.entry-date {
  font-size: 8.5pt;
  color: #444;
  white-space: nowrap;
  margin-left: 8pt;
  flex-shrink: 0;
}

.entry-subtitle {
  font-style: italic;
  color: #333;
  font-size: 8.5pt;
}

.entry-headline {
  font-size: 8pt;
  color: #555;
  margin-top: 1pt;
}

.sub {
  font-size: 8pt;
  color: #444;
  margin-top: 1pt;
}

/* ── Bullets ─────────────────────────────── */
ul {
  margin-top: 2pt;
  padding-left: 13pt;
}

li {
  margin-bottom: 1.5pt;
  font-size: 8.5pt;
}

/* ── Skills ──────────────────────────────── */
.skill-row {
  margin-bottom: 2pt;
  font-size: 8.5pt;
}

.skill-label {
  font-weight: 600;
}
"""


def build_html(data: dict) -> str:
    personal = data.get("personal", {})
    name = _esc(personal.get("name", "Resume"))

    header = f"""
<div class="header">
  <div class="header-name">{name}</div>
  <div class="header-contact">{_contact_strip(personal)}</div>
</div>"""

    sections = [
        header,
        _build_education(data.get("education", [])),
        _build_skills(data.get("skills", {})),
        _build_experience(data.get("experience", [])),
        _build_projects(data.get("projects", [])),
        _build_leadership(data.get("leadership", [])),
    ]

    body = "\n".join(s for s in sections if s.strip())

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>{CSS}</style>
</head>
<body>
{body}
</body>
</html>"""


def render_resume(
    json_path: str = "outputs/tailored_resume.json",
    pdf_path: str = "outputs/tailored_resume.pdf",
) -> bool:
    """
    Load the tailored resume JSON and write a PDF. Returns True on success.
    Fails gracefully if WeasyPrint is not installed.
    """
    try:
        import weasyprint  # noqa: PLC0415
    except ImportError:
        print("  [renderer] WeasyPrint not installed — skipping PDF generation.")
        print("  [renderer] Run: pip install weasyprint")
        return False

    try:
        data = load_json(json_path)
    except FileNotFoundError:
        print(f"  [renderer] {json_path} not found — skipping PDF generation.")
        return False

    os.makedirs(os.path.dirname(pdf_path), exist_ok=True)

    html_str = build_html(data)
    weasyprint.HTML(string=html_str).write_pdf(pdf_path)
    return True


if __name__ == "__main__":
    success = render_resume()
    if success:
        print("✓ Saved to outputs/tailored_resume.pdf")
    else:
        raise SystemExit(1)

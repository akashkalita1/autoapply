# ⚡ Job Autofill

> 🚀 The smartest Chrome extension for job applications — autofill forms, optimize your resume with AI, and generate tailored cover letters in seconds.

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)](chrome://extensions/) [![Manifest V3](https://img.shields.io/badge/Manifest-V3-34A853?logo=google&logoColor=white)]() [![OpenAI](https://img.shields.io/badge/Powered%20by-OpenAI-412991?logo=openai&logoColor=white)]()

---

## ✨ What It Does

| Feature | Description |
|---------|-------------|
| 🎯 **Smart Autofill** | Instantly fill job application forms with your saved profile |
| 🔔 **Opportunity hints** | On job pages, a small in-page card offers **Autofill**, **Optimize**, or **Attach resume** when the page looks relevant; the toolbar badge lights up too |
| 🧠 **AI Resume Optimizer** | Two-step flow: preview gaps vs. the JD, then confirm to tailor your resume and generate a cover letter |
| 📝 **Cover Letter Generator** | Auto-generate targeted, human-sounding cover letters |
| 📊 **Requirements Gap Analysis** | See exactly which qualifications you meet, partially meet, or need to address |
| 📎 **Resume file fields** | Upload a **Base Resume PDF** in Options; the extension can attach it to resume/CV upload fields (and during autofill when mapped) |
| 🗂️ **Per-Job Document Vault** | Keep tailored resumes and cover letters organized by job |
| 🖨️ **One-Click PDF Export** | Download print-ready resume and cover letter files instantly |

---

## 🏁 Quick Start (3 minutes)

### 1️⃣ Install the Extension

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** 🔧
3. Click **Load unpacked**
4. Select the `extension/` folder

### 2️⃣ Set Up Your Profile

1. Click the extension icon → **Edit profile & settings**
2. Fill in your info manually, or paste JSON that matches the `applicant_data.json` schema (that filename is **gitignored** in the repo; see **Resume Tool** below for the CLI layout)
3. 📄 Paste resume JSON (`master_resume.json` shape) in the **Resume Data** section — same local-only convention as the CLI
4. 📎 (Recommended) Upload a **Base Resume PDF** so the extension can attach it to resume/CV file fields and the in-page **Attach** action
5. 🔑 Add your **OpenAI API key** and enable LLM
6. Click **Save**

### 3️⃣ Autofill a Job Application

1. Open any job application form (optional: use the corner **✦ Job Autofill** card → **Autofill** if it appears)
2. Click **🔍 Preview** to see proposed values (resume upload fields may show as filled when a base PDF is configured)
3. Review the blue/yellow highlights on the page
4. Click **✅ Confirm & Fill** (or **✏️ Fill** from the popup)

### 4️⃣ AI Optimize for a Job

1. Open any job posting (job board, company careers page, anywhere)
2. Click **✨ Optimize** in the popup (or **Optimize** on the in-page card — the extension badge may show ✨ as a reminder)
3. **Phase 1 — Resume analysis:** The extension analyzes the JD and shows a short preview of missing skills, qualifications, and keywords vs. your resume JSON so you know what will be addressed before any heavy work runs
4. **Phase 2 — Run optimization:** Confirm to run tailoring + cover letter (~15–30 seconds):
   - 📖 JD analysis (keywords, skills, qualifications)
   - ✏️ Tailored resume JSON
   - 📝 Targeted cover letter
5. 📥 Downloads and gap report appear in the popup as before

---

## 🧠 AI Resume Optimizer — Deep Dive

The flagship feature: you review a **gap preview** first, then confirm to tailor the resume and generate a cover letter for that job.

### 🔔 On-page opportunities

On many job and application pages the extension detects:

- **Form fields** it can autofill
- **Job description** text (for optimize)
- **Resume/CV file** inputs

When it finds something useful, a small **✦ Job Autofill** card appears (bottom-right). You can dismiss it for the session; the toolbar icon can show a **!** badge when an opportunity was detected. Single-page apps are re-scanned after DOM changes (debounced).

### 🔄 How It Works

```
📄 Job Page → 🔍 Extract JD → Phase 1: analyze JD + local gap preview → ✋ You confirm
    → Phase 2: ✏️ Tailor resume + 📝 cover letter → 📥 Download / vault
```

1. **Extracts the job description** from any page — works on LinkedIn, Greenhouse, Lever, Workday, Jobright, Samsung Careers, TikTok Careers, Google Careers, and thousands more
2. **Phase 1** — AI analyzes the JD; the popup compares highlights to your resume JSON and lists likely **missing** skills, qualifications, and keywords (quick transparency before spend)
3. **Phase 2** (after you confirm) — **Tailors your resume** by rewriting bullet points to mirror the JD's language, reordering for relevance, and improving keyword coverage
4. **Fills qualification gaps** — if your resume doesn't address a key requirement, the optimizer strategically restructures your projects section to better highlight relevant skills and experience
5. **Generates a cover letter** that references the specific company, role, and 1-2 key responsibilities with concrete examples from your experience

### 📊 Requirements Gap Report

After optimization, you get a color-coded breakdown:

| Status | Meaning |
|--------|---------|
| 🟢 **Met** | Your experience directly addresses this requirement |
| 🟡 **Partial** | Related experience exists but doesn't fully cover it |
| 🔴 **Not Met** | No matching experience found |
| 🟣 **Optimized** | Resume restructured to better highlight relevant skills |

### 📝 Cover Letter Rules

Every generated cover letter follows strict quality guidelines:

- ✅ 2-3 paragraphs max — concise and direct
- ✅ References specific company name, role, and responsibilities
- ✅ Pulls 2 concrete experience callouts with real numbers
- ✅ Opens with something specific about the role (not "I am writing to apply for...")
- ✅ Closes with one confident sentence
- ❌ No buzzwords: "passionate", "leverage", "synergy", "excited to"
- ❌ No filler: "thank you for your consideration"

### 🎨 Customizable Style Profile

Control how your cover letters sound in **Options → Cover Letter Style Profile**:

```
Tone: direct, technical, not overly formal
Length: 3 short paragraphs max
Opening style: lead with a specific thing about the company or role
Closing style: one confident sentence
```

---

## 🌐 Supported Sites

The AI Optimizer extracts job descriptions from virtually any job page:

| Site Type | Examples |
|-----------|----------|
| 🏢 **Job Boards** | LinkedIn, Jobright, Indeed, Glassdoor |
| 🏗️ **ATS Platforms** | Greenhouse, Lever, Workday, iCIMS |
| 🏭 **Company Career Pages** | Samsung, TikTok, Google, Apple, Meta, Amazon, Netflix, Stripe, etc. |
| 🌍 **Any Website** | Falls back to intelligent DOM analysis for any page with a job description |

---

## 🧩 Autofill Engine

The core form-filling system works independently of the AI features:

- 📋 **Rule-based matching** for common fields (name, email, phone, education, work auth, etc.)
- ⚛️ **Framework-safe** event dispatch for React, Angular, and Vue forms
- 🔌 **Built-in adapters** for Greenhouse, Lever, and Workday
- 🤖 **Optional LLM fallback** for ambiguous or unusual fields
- 📎 **Resume PDF on file inputs** — when you have a **Base Resume PDF** saved, mappings to resume/CV-style file fields can attach it via the `DataTransfer` API (same mechanism as the widget **Attach** button)
- 🚫 **No auto-submit** — you always stay in control

---

## 📁 Document Workspace

Every job gets its own document bucket:

- 📄 **Tailored resumes** — AI-generated or manually uploaded
- 📝 **Cover letters** — AI-generated, uploaded as PDF, or saved as text
- 📥 **Smart file names**: `Company-Title-YYYYMMDD-tailored-resume.html`
- 🔄 **Re-downloadable** anytime from the popup
- 🗄️ **Auto-managed storage** with oldest-first trimming

---

## 🏗️ Architecture

```
jobautofill/
├── 🧩 extension/              Chrome extension (Manifest V3)
│   ├── manifest.json
│   ├── 🔧 shared/             Shared utilities & HTML builder
│   │   ├── constants.js
│   │   ├── match_rules.js
│   │   ├── field_extraction.js
│   │   ├── field_matching.js
│   │   ├── event_dispatch.js
│   │   ├── resume_html_builder.js   ← 🆕 PDF-ready resume/cover letter renderer
│   │   └── utils.js
│   ├── 📄 content/             Content scripts (page interaction)
│   │   ├── content_main.js          ← JD extraction + opportunity re-scan (MutationObserver)
│   │   ├── dom_filler.js            ← file inputs: synthetic File from base PDF when mapped
│   │   ├── notification_widget.js   ← floating ✦ card (Autofill / Optimize / Attach)
│   │   ├── opportunity_detector.js  ← detects forms, JD, resume file inputs; badge ping
│   │   └── site_adapters/      Greenhouse, Lever, Workday, generic
│   ├── ⚙️ background/          Service worker
│   │   └── service_worker.js        ← 🆕 AI prompts, callOpenAi wrapper, resume tailoring
│   ├── 🖥️ popup/               Extension popup UI (light cards, ✨ Optimize, two-phase AI)
│   │   ├── popup.html
│   │   ├── popup.css
│   │   └── popup.js
│   └── ⚙️ options/             Settings page
│       ├── options.html             ← 🆕 Style profile textarea
│       └── options.js               ← 🆕 Style profile load/save
└── 🐍 resume_tool/            CLI pipeline (optional)
    ├── jd_analyzer.py
    ├── resume_tailor.py
    ├── cover_letter.py
    ├── resume_renderer.py
    └── data/
        ├── master_resume.json      ← local only (.gitignore)
        ├── applicant_data.json     ← local only (.gitignore)
        └── style_profile.txt
```

### 🔄 Data Flow

```
┌─────────┐    ┌────────────┐    ┌────────────────┐    ┌──────────┐
│  Popup   │───▶│ Background │───▶│ Content Script │───▶│ Job Page │
│   UI     │◀───│  Worker    │◀───│   (DOM ops)    │◀───│   DOM    │
└─────────┘    └────────────┘    └────────────────┘    └──────────┘
                     │
                     ▼
              ┌──────────────┐
              │  OpenAI API  │
              │  (gpt-4o-mini) │
              └──────────────┘
```

### 🔒 Prompt Consistency

All AI calls go through a single `callOpenAi()` wrapper that enforces:

| Call | Temperature | Format | Validation |
|------|-------------|--------|------------|
| 📖 JD Analysis | `0.1` | JSON | 12 required keys |
| ✏️ Resume Tailor | `0.2` | JSON | Schema match + gaps array |
| 📝 Cover Letter | `0.5` | Text | ≤ 3 paragraphs |

- 🔄 **Auto-retry** on parse/validation failure at `temperature: 0.0`
- ✅ **Schema validation** for every JSON response
- 🛡️ **Markdown fence stripping** as a safety net

---

## 🖨️ PDF Generation

The extension generates print-ready HTML files using the exact same CSS as the Python pipeline:

1. 📄 Tailored resume → pixel-perfect one-page layout (letter size, 9pt Helvetica)
2. 📝 Cover letter → clean single-column format with header
3. 📥 Auto-downloaded to your computer
4. 🖨️ Open the file → browser print dialog auto-opens → **Save as PDF** (one click)

---

## ⚠️ Limitations

- 📎 **File uploads:** The extension sets files with `DataTransfer` where the browser allows; some ATS sites use custom upload widgets or shadow DOM and may still ignore or block synthetic files
- 🔒 Cross-origin iframes may block content script access on some ATS flows
- 🏗️ Workday custom controls may need additional adapter tuning
- 💾 Document storage is local to the browser profile (no cloud sync)
- 🔑 AI features require an OpenAI API key (autofill works without it)

---

## 🐍 Resume Tool (CLI — Optional)

`resume_tool/` provides a standalone CLI pipeline for the same capabilities:

- 📖 JD analysis → `jd_analyzer.py`
- ✏️ Resume tailoring → `resume_tailor.py`
- 📝 Cover letter generation → `cover_letter.py`
- 🖨️ PDF rendering → `resume_renderer.py`
- 🤖 Playwright autofill experiments → `autofill_agent.py`

**Private data files:** `resume_tool/data/master_resume.json` and `resume_tool/data/applicant_data.json` are listed in `.gitignore` so they are never committed. After cloning the repo, create them locally (copy from a backup, export from the extension Options page, or restore from an old commit with `git show <commit>:resume_tool/data/applicant_data.json`). `style_profile.txt` remains in the repo as non-sensitive sample text.

```bash
cd resume_tool
pip install -r requirements.txt
playwright install chromium
cp .env.example .env
# Edit .env with your OpenAI API key
# Ensure data/master_resume.json and data/applicant_data.json exist locally
python run.py
```

---

## 📜 License

MIT

---

<p align="center">
  Built with ⚡ by <a href="https://github.com/akashkalita1">Akash Kalita</a>
</p>

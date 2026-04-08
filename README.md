# Job Autofill

> Autofill job applications faster with a Chrome extension built for real ATS forms.

## Chrome Extension First

The primary use case of this repo is the Chrome extension in `extension/`.

### Why this is useful

- ⚡ **Faster applications**: preview + fill common fields in seconds
- 🎯 **Safer than one-click bots**: no auto-submit, you stay in control
- 🧠 **Smart matching**: rule-based by default, optional LLM fallback
- 🗂️ **Job-scoped docs**: keep edited resumes and cover letters grouped per job
- 📄 **Resume PDF vault**: store base resume PDF and download job-specific versions

---

## Quick Start (3 minutes)

### 1) Install extension

1. Open Chrome: `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `extension/` folder

### 2) Set up profile

1. Open the extension popup
2. Click **Edit Profile & Settings**
3. Fill profile manually, or import `resume_tool/data/applicant_data.json`
4. Click **Save Profile**

### 3) Use on a job page

1. Open a job application form
2. Click **Preview** 🔍
3. Review blue/yellow highlights
4. Click **Confirm & Fill** ✅
5. Review results log in popup

---

## Feature Tour

### 🧩 Autofill engine

- Rule-based field matching for common job form fields
- Framework-safe event dispatch for React/Angular/Vue forms
- Built-in adapters for Greenhouse, Lever, and Workday
- No auto-submit behavior by design

### 🤖 Optional AI assist

- Add your OpenAI API key in Options
- Enable **LLM fallback** for ambiguous/unmatched fields
- Uses profile + resume JSON context for better field mapping

### 📁 Document workspace (new)

- **Base Resume PDF** (Options): upload, store, download, clear
- **Per-job document groups** (Popup): save edited resumes + cover letters by detected `jobKey`
- **Download with useful names**:
  - `Company-Title-YYYYMMDD-edited-resume.pdf`
  - `Company-Title-YYYYMMDD-cover-letter.pdf`
- **Storage safeguards**:
  - bounded docs per job
  - soft-cap trimming of oldest docs

---

## Interactive Workflow

```text
Open job page -> Preview -> Confirm & Fill -> Save edited resume / cover letter -> Download per job
```

Think of the popup as your mini control center:

- 🔍 preview before writing fields
- 📝 fill confidently with logs
- 📎 attach/manage job-specific documents
- ⬇️ export files with clean job-based names

---

## Repository Structure

```text
jobautofill/
  extension/      Primary product (Chrome extension, Manifest V3)
  resume_tool/    Secondary CLI pipeline (JD analysis, tailoring, cover letters)
```

---

## Extension Architecture

```text
extension/
  manifest.json
  shared/
    constants.js
    match_rules.js
    field_extraction.js
    field_matching.js
    event_dispatch.js
    prompts.js
    utils.js
  content/
    content_main.js
    dom_filler.js
    site_adapters/
      adapter_registry.js
      base_adapter.js
      generic.js
      greenhouse.js
      lever.js
      workday.js
  background/
    service_worker.js
  popup/
    popup.html / .css / .js
  options/
    options.html / .css / .js
```

Data flow:

```text
Popup -> Background -> Content Script -> Background -> Popup
```

The background worker handles profile/settings storage, LLM calls, logs, and job-scoped documents.

---

## Limitations

- Form file inputs on external job sites still cannot be set programmatically by extensions
- Cross-origin iframes can block content-script access on some ATS flows
- Workday custom controls can require additional adapter tuning
- Document storage is local to the browser profile (no backend sync in current version)

---

## Resume Tool (Secondary / Optional)

`resume_tool/` remains available for CLI-based workflows:

- JD analysis
- resume tailoring
- cover letter generation
- Playwright-assisted autofill experiments

Setup:

```bash
cd resume_tool
pip install -r requirements.txt
playwright install chromium
cp .env.example .env
```

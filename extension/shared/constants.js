/**
 * Shared constants for the Job Autofill extension.
 * Navigation patterns ported from resume_tool/autofill_agent.py lines 296-297.
 */

window.JobAutofill = window.JobAutofill || {};

window.JobAutofill.constants = {
  CONFIDENCE_THRESHOLD: 0.8,

  // Ported from autofill_agent.py _NEXT_PATTERNS / _SUBMIT_PATTERNS
  NEXT_PATTERNS: /\b(next|continue|save\s*&?\s*continue|proceed)\b/i,
  SUBMIT_PATTERNS: /\b(submit|apply|send\s*application|finish)\b/i,

  // CSS class prefix to avoid collisions with page styles
  CSS_PREFIX: "jaf-",

  // Preview overlay colors
  PREVIEW_BG: "rgba(59, 130, 246, 0.08)",
  PREVIEW_BORDER: "2px solid rgba(59, 130, 246, 0.6)",
  FILLED_BG: "rgba(34, 197, 94, 0.08)",
  FILLED_BORDER: "2px solid rgba(34, 197, 94, 0.6)",
  SKIPPED_BG: "rgba(234, 179, 8, 0.08)",
  SKIPPED_BORDER: "2px solid rgba(234, 179, 8, 0.6)",

  // Default applicant profile template (matches resume_tool/data/applicant_data.json schema)
  DEFAULT_PROFILE: {
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    address: {
      street: "",
      city: "",
      state: "",
      zip: "",
      country: "United States",
    },
    linkedin: "",
    github: "",
    portfolio: "",
    university: "",
    degree: "",
    gpa: "",
    graduation_month: "",
    graduation_year: "",
    work_authorization: "",
    require_sponsorship: false,
    years_of_experience: "",
  },
};

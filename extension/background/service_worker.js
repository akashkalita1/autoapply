/**
 * Background service worker.
 * Handles message routing between popup and content scripts,
 * profile storage management, and optional OpenAI API integration.
 */

// ---- Storage helpers -------------------------------------------------------

const STORAGE_KEYS = {
  PROFILE: "jaf_profile",
  RESUME: "jaf_resume",
  API_KEY: "jaf_openai_key",
  LLM_ENABLED: "jaf_llm_enabled",
  LAST_FILL_LOG: "jaf_last_fill_log",
};

async function getProfile() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.PROFILE);
  return result[STORAGE_KEYS.PROFILE] || null;
}

async function getResume() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.RESUME);
  return result[STORAGE_KEYS.RESUME] || null;
}

async function getApiKey() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.API_KEY);
  return result[STORAGE_KEYS.API_KEY] || "";
}

async function isLlmEnabled() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.LLM_ENABLED);
  return result[STORAGE_KEYS.LLM_ENABLED] === true;
}

async function saveLog(log) {
  await chrome.storage.local.set({ [STORAGE_KEYS.LAST_FILL_LOG]: log });
}

// ---- LLM field mapping (optional) -----------------------------------------

const FIELD_MAP_PROMPT =
  "You are an expert at filling out online job-application forms.\n\n" +
  "You will receive two things:\n" +
  "1. A list of form fields found on the current page (label, selector, type, options, etc.).\n" +
  "2. The applicant's full profile (contact info, education, work experience, skills, etc.).\n\n" +
  "Map these form fields to the applicant profile below.\n" +
  "For each field return:\n" +
  '{ "field_label": "...", "selector": "...", "value": "...", "confidence": 0.0-1.0 }\n\n' +
  "Rules:\n" +
  "- Use EXACT selector strings from the field list — never invent selectors.\n" +
  "- For <select> fields the value MUST be one of the provided option values.\n" +
  '- For file-upload fields set value to "__FILE_UPLOAD__" with confidence 1.0.\n' +
  '- Set confidence < 0.8 and value "__PAUSE__" for anything ambiguous or not in the profile.\n' +
  "- Return ONLY a JSON array, no markdown fences, no commentary.";

function stripMarkdownFences(text) {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) return match[1].trim();
  return text.trim();
}

/**
 * Call OpenAI to map unmatched fields to the profile.
 * Ported from autofill_agent.py map_fields_to_profile (lines 155-183).
 */
async function llmMapFields(unmatchedFields, profile, apiKey) {
  const fullProfile = { applicant_info: profile };

  const body = {
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: FIELD_MAP_PROMPT },
      {
        role: "user",
        content:
          "FORM FIELDS:\n" +
          JSON.stringify(unmatchedFields, null, 2) +
          "\n\nAPPLICANT PROFILE:\n" +
          JSON.stringify(fullProfile, null, 2),
      },
    ],
    temperature: 0.1,
  };

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error("OpenAI API error " + resp.status + ": " + errText.substring(0, 200));
  }

  const data = await resp.json();
  const raw = stripMarkdownFences(data.choices[0].message.content.trim());

  try {
    const mappings = JSON.parse(raw);
    if (!Array.isArray(mappings)) return [];
    return mappings;
  } catch (e) {
    console.warn("[JobAutofill] LLM returned invalid JSON:", raw.substring(0, 300));
    return [];
  }
}

// ---- Rule-based matching (runs in service worker context) ------------------

// Inline a minimal version of the matching rules so the background can match
// without needing the content script's window.JobAutofill namespace.

const MATCH_RULES = [
  { key: "first_name", patterns: [/\bfirst[\s_-]?name\b/i, /\bgiven[\s_-]?name\b/i, /\bfname\b/i] },
  { key: "last_name", patterns: [/\blast[\s_-]?name\b/i, /\bfamily[\s_-]?name\b/i, /\bsurname\b/i, /\blname\b/i] },
  { key: "full_name", patterns: [/\bfull[\s_-]?name\b/i, /\byour[\s_-]?name\b/i], derive: (p) => [p.first_name, p.last_name].filter(Boolean).join(" ") },
  { key: "email", patterns: [/\be[\s_-]?mail\b/i, /\bemail[\s_-]?address\b/i], inputType: "email" },
  { key: "phone", patterns: [/\bphone\b/i, /\btelephone\b/i, /\bmobile\b/i, /\bcell\b/i], inputType: "tel" },
  { key: "address.street", patterns: [/\bstreet[\s_-]?address\b/i, /\baddress[\s_-]?line[\s_-]?1\b/i, /\baddress\b/i] },
  { key: "address.city", patterns: [/\bcity\b/i, /\btown\b/i] },
  { key: "address.state", patterns: [/\bstate\b/i, /\bprovince\b/i, /\bregion\b/i] },
  { key: "address.zip", patterns: [/\bzip\b/i, /\bpostal[\s_-]?code\b/i, /\bpostcode\b/i] },
  { key: "address.country", patterns: [/\bcountry\b/i] },
  { key: "linkedin", patterns: [/\blinkedin\b/i] },
  { key: "github", patterns: [/\bgithub\b/i] },
  { key: "portfolio", patterns: [/\bportfolio\b/i, /\bpersonal[\s_-]?website\b/i, /\bwebsite\b/i] },
  { key: "university", patterns: [/\buniversity\b/i, /\bschool\b/i, /\bcollege\b/i, /\binstitution\b/i] },
  { key: "degree", patterns: [/\bdegree\b/i, /\bmajor\b/i, /\bfield[\s_-]?of[\s_-]?study\b/i] },
  { key: "gpa", patterns: [/\bgpa\b/i, /\bgrade[\s_-]?point\b/i] },
  { key: "graduation_year", patterns: [/\bgraduation[\s_-]?year\b/i, /\bgrad[\s_-]?year\b/i, /\bexpected[\s_-]?graduation\b/i] },
  { key: "graduation_month", patterns: [/\bgraduation[\s_-]?month\b/i] },
  { key: "graduation_date", patterns: [/\bgraduation[\s_-]?date\b/i, /\bgrad[\s_-]?date\b/i], derive: (p) => [p.graduation_month, p.graduation_year].filter(Boolean).join(" ") },
  { key: "work_authorization", patterns: [/\bwork[\s_-]?auth/i, /\bauthori[sz]ed[\s_-]?to[\s_-]?work\b/i, /\beligib/i] },
  { key: "require_sponsorship", patterns: [/\bsponsorship\b/i, /\bvisa[\s_-]?sponsor/i, /\brequire[\s_-]?sponsor/i] },
  { key: "years_of_experience", patterns: [/\byears[\s_-]?of[\s_-]?experience\b/i, /\btotal[\s_-]?experience\b/i] },
];

function resolveKey(obj, key) {
  return key.split(".").reduce((o, k) => (o && o[k] !== undefined ? o[k] : ""), obj);
}

function buildSignal(field) {
  return [
    field.label, field.placeholder, field.name, field.id,
    field.aria_label, field.nearby_text,
    Object.values(field.data_attrs || {}).join(" "),
  ].join(" ").toLowerCase();
}

function ruleBasedMatch(fields, profile) {
  const mappings = [];
  const matched = new Set();

  for (const field of fields) {
    const signal = buildSignal(field);
    let didMatch = false;

    for (const rule of MATCH_RULES) {
      // Check input type shortcut
      if (rule.inputType && field.type === rule.inputType) {
        didMatch = true;
      }

      // Check autocomplete
      if (!didMatch && rule.autocomplete && field.autocomplete === rule.autocomplete) {
        didMatch = true;
      }

      // Check patterns
      if (!didMatch) {
        for (const pat of rule.patterns) {
          if (pat.test(signal)) { didMatch = true; break; }
        }
      }

      if (!didMatch) continue;

      let value = rule.derive ? rule.derive(profile) : resolveKey(profile, rule.key);

      // Handle select fields
      if (field.tag === "select" && field.options) {
        if (rule.key === "require_sponsorship") {
          const boolVal = value === true || value === "true" || value === "yes";
          const pos = /\b(yes|true|i\s*do|will\s*require)\b/i;
          const neg = /\b(no|false|i\s*do\s*not|will\s*not|don'?t)\b/i;
          let found = null;
          for (const o of field.options) {
            const t = o.text || o.value || "";
            if (boolVal && pos.test(t)) { found = o.value; break; }
            if (!boolVal && neg.test(t)) { found = o.value; break; }
          }
          value = found;
        } else if (rule.key === "work_authorization") {
          const lower = String(value).toLowerCase();
          let found = null;
          for (const o of field.options) {
            const t = (o.text || "").toLowerCase();
            if (t && lower && t.includes(lower.substring(0, 10))) { found = o.value; break; }
          }
          if (!found) {
            const isCitizen = /citizen|authorized|permanent/i.test(lower);
            for (const o of field.options) {
              const t = (o.text || "").toLowerCase();
              if (isCitizen && /citizen|authorized|permanent|no\s*sponsor/i.test(t)) { found = o.value; break; }
            }
          }
          value = found;
        } else {
          const lower = String(value).toLowerCase();
          const found = field.options.find(o =>
            o.value.toLowerCase() === lower ||
            o.text.toLowerCase() === lower ||
            o.text.toLowerCase().includes(lower) ||
            o.value.toLowerCase().includes(lower)
          );
          value = found ? found.value : null;
        }
      }

      const label = field.label || field.placeholder || field.name || field.selector;
      if (value !== null && value !== undefined && value !== "") {
        mappings.push({ field_label: label, selector: field.selector, value: String(value), confidence: 0.95, profileKey: rule.key });
      } else {
        mappings.push({ field_label: label, selector: field.selector, value: "", confidence: 0.3, profileKey: rule.key, reason: "no profile value" });
      }

      matched.add(field.selector);
      didMatch = false;
      break;
    }

    if (!matched.has(field.selector)) {
      const label = field.label || field.placeholder || field.name || field.selector;
      mappings.push({ field_label: label, selector: field.selector, value: "", confidence: 0, profileKey: null, reason: "no matching rule" });
    }
  }

  return mappings;
}

// ---- Message handler -------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.action) return false;
  handleMessage(msg, sender).then(sendResponse).catch((err) => {
    console.error("[JobAutofill BG] Error:", err);
    sendResponse({ ok: false, error: String(err) });
  });
  return true; // keep channel open for async response
});

async function handleMessage(msg, sender) {
  switch (msg.action) {
    case "getProfile":
      return { ok: true, profile: await getProfile() };

    case "saveProfile":
      await chrome.storage.local.set({ [STORAGE_KEYS.PROFILE]: msg.profile });
      return { ok: true };

    case "saveResume":
      await chrome.storage.local.set({ [STORAGE_KEYS.RESUME]: msg.resume });
      return { ok: true };

    case "getSettings":
      return {
        ok: true,
        profile: await getProfile(),
        resume: await getResume(),
        apiKey: await getApiKey(),
        llmEnabled: await isLlmEnabled(),
      };

    case "saveSettings":
      if (msg.apiKey !== undefined)
        await chrome.storage.local.set({ [STORAGE_KEYS.API_KEY]: msg.apiKey });
      if (msg.llmEnabled !== undefined)
        await chrome.storage.local.set({ [STORAGE_KEYS.LLM_ENABLED]: msg.llmEnabled });
      return { ok: true };

    case "getLastLog":
      const logResult = await chrome.storage.local.get(STORAGE_KEYS.LAST_FILL_LOG);
      return { ok: true, log: logResult[STORAGE_KEYS.LAST_FILL_LOG] || [] };

    case "startAutofill":
      return await handleAutofill(msg);

    case "confirmFill":
      return await handleConfirmFill(msg);

    default:
      return { ok: false, error: "unknown action: " + msg.action };
  }
}

/**
 * Main autofill flow:
 * 1. Tell content script to scan fields
 * 2. Run rule-based matching
 * 3. Optionally run LLM for unmatched fields
 * 4. Send preview or fill command to content script
 */
async function handleAutofill(msg) {
  const profile = await getProfile();
  if (!profile) {
    return { ok: false, error: "No profile configured. Open the Options page to set up your profile." };
  }

  const mode = msg.mode || "preview"; // "preview" or "fill"

  // 1. Get the active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    return { ok: false, error: "No active tab found." };
  }

  // 2. Ask content script to scan fields
  let scanResult;
  try {
    scanResult = await chrome.tabs.sendMessage(tab.id, { action: "scanFields" });
  } catch (err) {
    return { ok: false, error: "Could not reach content script. Try refreshing the page." };
  }

  if (!scanResult || !scanResult.ok) {
    return { ok: false, error: scanResult ? scanResult.error : "Scan returned no data." };
  }

  const fields = scanResult.fields || [];
  if (fields.length === 0) {
    return { ok: false, error: "No form fields found on this page." };
  }

  // 3. Rule-based matching
  let mappings = ruleBasedMatch(fields, profile);

  // 4. Optional LLM fallback for unmatched fields
  const llmEnabled = await isLlmEnabled();
  const apiKey = await getApiKey();
  if (llmEnabled && apiKey) {
    const unmatched = fields.filter((f) => {
      const m = mappings.find((mm) => mm.selector === f.selector);
      return !m || m.confidence < 0.5;
    });

    if (unmatched.length > 0) {
      try {
        const llmMappings = await llmMapFields(unmatched, profile, apiKey);
        // Merge LLM results: replace low-confidence rule-based matches
        for (const lm of llmMappings) {
          const idx = mappings.findIndex((m) => m.selector === lm.selector);
          if (idx >= 0 && (lm.confidence || 0) > mappings[idx].confidence) {
            mappings[idx] = { ...lm, source: "llm" };
          } else if (idx < 0) {
            mappings.push({ ...lm, source: "llm" });
          }
        }
      } catch (err) {
        console.warn("[JobAutofill BG] LLM fallback failed:", err);
        // Continue with rule-based results only
      }
    }
  }

  // 5. Send to content script
  if (mode === "preview") {
    try {
      await chrome.tabs.sendMessage(tab.id, { action: "previewFill", mappings });
    } catch (err) {
      return { ok: false, error: "Preview failed: " + String(err) };
    }
    return {
      ok: true,
      mode: "preview",
      mappings: mappings,
      navButton: scanResult.navButton,
      adapterName: scanResult.adapterName,
      fieldCount: fields.length,
    };
  }

  // Direct fill (skip preview)
  return await executeFillOnTab(tab.id, mappings);
}

async function handleConfirmFill(msg) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    return { ok: false, error: "No active tab found." };
  }
  return await executeFillOnTab(tab.id, msg.mappings);
}

async function executeFillOnTab(tabId, mappings) {
  let result;
  try {
    result = await chrome.tabs.sendMessage(tabId, { action: "executeFill", mappings });
  } catch (err) {
    return { ok: false, error: "Fill failed: " + String(err) };
  }

  if (result && result.ok) {
    await saveLog(result.log || []);
  }

  return {
    ok: result ? result.ok : false,
    mode: "fill",
    filled: result ? result.filled : [],
    skipped: result ? result.skipped : [],
    error: result ? result.error : "No response from content script",
  };
}

// Log extension startup
console.log("[JobAutofill] Background service worker started.");

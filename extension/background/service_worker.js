/**
 * Background service worker.
 * Handles message routing between popup and content scripts,
 * profile storage management, and optional OpenAI API integration.
 */

importScripts("../shared/match_rules.js");

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
async function llmMapFields(unmatchedFields, profile, resume, apiKey) {
  const fullProfile = { applicant_info: profile, resume: resume || {} };

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
  const resume = await getResume();

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

  // 3. Rule-based matching (shared module loaded via importScripts)
  let mappings = MatchRules.ruleBasedMatch(fields, profile);

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
        const llmMappings = await llmMapFields(unmatched, profile, resume, apiKey);
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

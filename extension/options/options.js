/**
 * Options page script for the Job Autofill extension.
 * Profile editor, JSON import/export, AI settings.
 */

(function () {
  // Map of form field IDs to profile keys (flat fields)
  const FLAT_FIELDS = [
    "first_name", "last_name", "email", "phone",
    "linkedin", "github", "portfolio",
    "university", "degree", "gpa",
    "graduation_month", "graduation_year",
    "work_authorization", "years_of_experience",
  ];
  const ADDRESS_FIELDS = ["street", "city", "state", "zip", "country"];

  // ---- Init ----

  loadSettings();

  async function loadSettings() {
    const resp = await sendBg({ action: "getSettings" });
    if (!resp.ok) return;

    if (resp.profile) populateForm(resp.profile);
    if (resp.apiKey) document.getElementById("apiKey").value = resp.apiKey;
    if (resp.llmEnabled) document.getElementById("llmEnabled").checked = true;
    if (resp.resume) {
      document.getElementById("resumeJson").value = JSON.stringify(resp.resume, null, 2);
    }
  }

  function populateForm(profile) {
    for (const key of FLAT_FIELDS) {
      const el = document.getElementById(key);
      if (el && profile[key] !== undefined) {
        if (el.tagName === "SELECT") {
          el.value = String(profile[key]);
        } else {
          el.value = profile[key] || "";
        }
      }
    }
    const addr = profile.address || {};
    for (const key of ADDRESS_FIELDS) {
      const el = document.getElementById(key);
      if (el) el.value = addr[key] || "";
    }
    // Special case: require_sponsorship is boolean
    const sponsorEl = document.getElementById("require_sponsorship");
    if (sponsorEl) {
      sponsorEl.value = profile.require_sponsorship ? "true" : "false";
    }
  }

  function readForm() {
    const profile = {};
    for (const key of FLAT_FIELDS) {
      const el = document.getElementById(key);
      profile[key] = el ? el.value.trim() : "";
    }
    profile.address = {};
    for (const key of ADDRESS_FIELDS) {
      const el = document.getElementById(key);
      profile.address[key] = el ? el.value.trim() : "";
    }
    profile.require_sponsorship = document.getElementById("require_sponsorship").value === "true";
    return profile;
  }

  // ---- Event Listeners ----

  // Save profile
  document.getElementById("profileForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const profile = readForm();
    const resp = await sendBg({ action: "saveProfile", profile });
    showStatus("profileStatus", resp.ok ? "Profile saved." : "Save failed.", resp.ok);
  });

  // Export JSON
  document.getElementById("btnExport").addEventListener("click", () => {
    const profile = readForm();
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "applicant_data.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  // Import JSON
  document.getElementById("btnImport").addEventListener("click", async () => {
    const text = document.getElementById("jsonImport").value.trim();
    if (!text) {
      showStatus("importStatus", "Paste JSON first.", false);
      return;
    }
    try {
      const data = JSON.parse(text);
      // Validate it has at least one expected key
      if (!data.first_name && !data.email && !data.last_name) {
        showStatus("importStatus", "JSON doesn't look like an applicant profile.", false);
        return;
      }
      populateForm(data);
      const resp = await sendBg({ action: "saveProfile", profile: data });
      showStatus("importStatus", resp.ok ? "Imported and saved." : "Import failed.", resp.ok);
      document.getElementById("jsonImport").value = "";
    } catch (err) {
      showStatus("importStatus", "Invalid JSON: " + err.message, false);
    }
  });

  // Save AI settings
  document.getElementById("btnSaveAi").addEventListener("click", async () => {
    const apiKey = document.getElementById("apiKey").value.trim();
    const llmEnabled = document.getElementById("llmEnabled").checked;
    const resp = await sendBg({ action: "saveSettings", apiKey, llmEnabled });
    showStatus("aiStatus", resp.ok ? "AI settings saved." : "Save failed.", resp.ok);
  });

  // Save resume JSON
  document.getElementById("btnSaveResume").addEventListener("click", async () => {
    const text = document.getElementById("resumeJson").value.trim();
    if (!text) {
      showStatus("resumeStatus", "Paste resume JSON first.", false);
      return;
    }
    try {
      const data = JSON.parse(text);
      const resp = await sendBg({ action: "saveResume", resume: data });
      showStatus("resumeStatus", resp.ok ? "Resume data saved." : "Save failed.", resp.ok);
    } catch (err) {
      showStatus("resumeStatus", "Invalid JSON: " + err.message, false);
    }
  });

  // ---- Helpers ----

  function sendBg(msg) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(msg, (resp) => {
        resolve(resp || { ok: false });
      });
    });
  }

  function showStatus(elId, message, success) {
    const el = document.getElementById(elId);
    el.textContent = message;
    el.className = "status-msg " + (success ? "success" : "error");
    el.classList.remove("hidden");
    setTimeout(() => el.classList.add("hidden"), 4000);
  }
})();

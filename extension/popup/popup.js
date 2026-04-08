/**
 * Popup script for the Job Autofill extension.
 * Manages the popup UI: profile display, preview/fill triggers, result logs.
 */

(function () {
  // DOM elements
  const statusBadge = document.getElementById("statusBadge");
  const profileSummary = document.getElementById("profileSummary");
  const openOptions = document.getElementById("openOptions");
  const btnPreview = document.getElementById("btnPreview");
  const btnFill = document.getElementById("btnFill");
  const previewSection = document.getElementById("previewSection");
  const previewStats = document.getElementById("previewStats");
  const previewList = document.getElementById("previewList");
  const btnClearPreview = document.getElementById("btnClearPreview");
  const btnConfirmFill = document.getElementById("btnConfirmFill");
  const resultsSection = document.getElementById("resultsSection");
  const resultStats = document.getElementById("resultStats");
  const resultList = document.getElementById("resultList");
  const adapterNameEl = document.getElementById("adapterName");
  const llmStatusEl = document.getElementById("llmStatus");

  let currentMappings = null;

  // ---- Init ----

  init();

  async function init() {
    // Load profile and settings
    const settings = await sendBg({ action: "getSettings" });
    if (settings.ok && settings.profile) {
      renderProfile(settings.profile);
      btnPreview.disabled = false;
      btnFill.disabled = false;
    } else {
      profileSummary.innerHTML = '<p class="placeholder-text">No profile configured. <a href="#" id="setupLink">Set up now</a></p>';
      const setupLink = document.getElementById("setupLink");
      if (setupLink) {
        setupLink.addEventListener("click", (e) => { e.preventDefault(); openOptionsPage(); });
      }
    }

    // Show LLM status
    if (settings.ok) {
      llmStatusEl.textContent = settings.llmEnabled && settings.apiKey
        ? "LLM: On"
        : "LLM: Off";
    }

    // Check content script connectivity
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        const resp = await chrome.tabs.sendMessage(tab.id, { action: "ping" });
        if (resp && resp.ok) {
          setStatus("Ready", "neutral");
        }
      }
    } catch (e) {
      setStatus("No page access", "warning");
      btnPreview.disabled = true;
      btnFill.disabled = true;
    }
  }

  // ---- Event Listeners ----

  openOptions.addEventListener("click", (e) => {
    e.preventDefault();
    openOptionsPage();
  });

  btnPreview.addEventListener("click", async () => {
    setStatus("Scanning...", "active");
    btnPreview.disabled = true;
    btnFill.disabled = true;

    const result = await sendBg({ action: "startAutofill", mode: "preview" });

    if (result.ok) {
      currentMappings = result.mappings;
      renderPreview(result);
      setStatus("Preview", "active");
      if (result.adapterName) {
        adapterNameEl.textContent = "Adapter: " + result.adapterName;
      }
    } else {
      setStatus("Error", "error");
      showError(result.error);
    }

    btnPreview.disabled = false;
    btnFill.disabled = false;
  });

  btnFill.addEventListener("click", async () => {
    setStatus("Filling...", "active");
    btnFill.disabled = true;
    btnPreview.disabled = true;

    const result = await sendBg({ action: "startAutofill", mode: "fill" });

    if (result.ok) {
      renderResults(result);
      setStatus("Filled", "success");
    } else {
      setStatus("Error", "error");
      showError(result.error);
    }

    btnFill.disabled = false;
    btnPreview.disabled = false;
  });

  btnClearPreview.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      try { await chrome.tabs.sendMessage(tab.id, { action: "clearPreview" }); } catch (e) { /* ignore */ }
    }
    previewSection.classList.add("hidden");
    currentMappings = null;
    setStatus("Ready", "neutral");
  });

  btnConfirmFill.addEventListener("click", async () => {
    if (!currentMappings) return;
    setStatus("Filling...", "active");
    btnConfirmFill.disabled = true;

    const result = await sendBg({ action: "confirmFill", mappings: currentMappings });

    if (result.ok) {
      previewSection.classList.add("hidden");
      renderResults(result);
      setStatus("Filled", "success");
      currentMappings = null;
    } else {
      setStatus("Error", "error");
      showError(result.error);
    }

    btnConfirmFill.disabled = false;
  });

  // ---- Render helpers ----

  function renderProfile(profile) {
    const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "No name";
    const details = [profile.email, profile.phone].filter(Boolean).join(" | ");
    profileSummary.innerHTML =
      '<div class="name">' + escHtml(name) + "</div>" +
      '<div class="detail">' + escHtml(details || "No contact info") + "</div>";
  }

  function renderPreview(result) {
    previewSection.classList.remove("hidden");
    resultsSection.classList.add("hidden");

    const mappings = result.mappings || [];
    const willFill = mappings.filter((m) => m.confidence >= 0.8 && m.value);
    const willSkip = mappings.filter((m) => m.confidence < 0.8 || !m.value);

    previewStats.innerHTML =
      '<span class="stat"><span class="stat-dot stat-dot-total"></span> ' + result.fieldCount + " fields</span>" +
      '<span class="stat"><span class="stat-dot stat-dot-fill"></span> ' + willFill.length + " to fill</span>" +
      '<span class="stat"><span class="stat-dot stat-dot-skip"></span> ' + willSkip.length + " skipped</span>";

    // Nav button warning
    let html = "";
    if (result.navButton && result.navButton.type === "submit") {
      html += '<div class="warning-banner">Submit button detected: "' +
        escHtml(result.navButton.text) + '". This extension will NOT auto-submit.</div>';
    }

    for (const m of willFill) {
      html += '<div class="result-item">' +
        '<span class="result-field" title="' + escHtml(m.field_label) + '">' + escHtml(truncate(m.field_label, 30)) + "</span>" +
        '<span class="result-value" title="' + escHtml(m.value) + '">' + escHtml(truncate(m.value, 30)) + "</span>" +
        "</div>";
    }
    for (const m of willSkip) {
      html += '<div class="result-item">' +
        '<span class="result-field" title="' + escHtml(m.field_label) + '">' + escHtml(truncate(m.field_label, 30)) + "</span>" +
        '<span class="result-value skipped">' + escHtml(m.reason || "skipped") + "</span>" +
        "</div>";
    }

    previewList.innerHTML = html;
  }

  function renderResults(result) {
    resultsSection.classList.remove("hidden");
    previewSection.classList.add("hidden");

    const filled = result.filled || [];
    const skipped = result.skipped || [];

    resultStats.innerHTML =
      '<span class="stat"><span class="stat-dot stat-dot-fill"></span> ' + filled.length + " filled</span>" +
      '<span class="stat"><span class="stat-dot stat-dot-skip"></span> ' + skipped.length + " skipped</span>";

    let html = "";
    for (const f of filled) {
      html += '<div class="result-item">' +
        '<span class="result-field" title="' + escHtml(f.field) + '">' + escHtml(truncate(f.field, 30)) + "</span>" +
        '<span class="result-value" title="' + escHtml(f.value) + '">' + escHtml(truncate(f.value, 30)) + "</span>" +
        "</div>";
    }
    for (const s of skipped) {
      html += '<div class="result-item">' +
        '<span class="result-field" title="' + escHtml(s.field) + '">' + escHtml(truncate(s.field, 30)) + "</span>" +
        '<span class="result-value skipped">' + escHtml(s.reason || "skipped") + "</span>" +
        "</div>";
    }

    resultList.innerHTML = html;
  }

  function showError(message) {
    resultsSection.classList.remove("hidden");
    previewSection.classList.add("hidden");
    resultStats.innerHTML = "";
    resultList.innerHTML = '<div class="result-item"><span class="result-value skipped">' +
      escHtml(message || "Unknown error") + "</span></div>";
  }

  // ---- Utilities ----

  function setStatus(text, type) {
    statusBadge.textContent = text;
    statusBadge.className = "badge badge-" + type;
  }

  function sendBg(msg) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(msg, (resp) => {
        resolve(resp || { ok: false, error: "No response from background" });
      });
    });
  }

  function openOptionsPage() {
    chrome.runtime.openOptionsPage();
  }

  function escHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function truncate(str, len) {
    if (!str) return "";
    return str.length > len ? str.substring(0, len - 3) + "..." : str;
  }
})();

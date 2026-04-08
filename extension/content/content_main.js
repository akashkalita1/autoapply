/**
 * Content script entry point.
 * Orchestrates: scan fields -> match -> preview -> fill.
 * Communicates with the background service worker via chrome.runtime messages.
 */

window.JobAutofill = window.JobAutofill || {};

(function () {
  var JA = window.JobAutofill;

  // Current state
  var currentMappings = null;

  function normalizeKeyPart(str) {
    return String(str || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[^a-z0-9 _-]/g, "")
      .replace(/\s/g, "-")
      .slice(0, 80);
  }

  // Small deterministic hash (avoid async crypto for speed)
  function hashString(str) {
    var s = String(str || "");
    var hash = 5381;
    for (var i = 0; i < s.length; i++) {
      hash = ((hash << 5) + hash) ^ s.charCodeAt(i);
      hash = hash >>> 0;
    }
    return hash.toString(16);
  }

  function firstText(selectors) {
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (!el) continue;
      var t = (el.innerText || el.textContent || "").trim();
      if (t) return t;
    }
    return "";
  }

  function extractJobMeta() {
    var url = window.location.href;
    var title = firstText(["h1", '[data-automation-id="jobPostingHeader"]']) || document.title || "";

    // Best-effort company extraction
    var ogSite = document.querySelector('meta[property="og:site_name"]');
    var ogTitle = document.querySelector('meta[property="og:title"]');
    var company = (ogSite && ogSite.content) ? ogSite.content.trim() : "";
    if (!company && ogTitle && ogTitle.content) {
      // Often "Role at Company"
      var parts = ogTitle.content.split(" at ");
      if (parts.length === 2) company = parts[1].trim();
    }
    if (!company && title) {
      // Often "Company - Role" or "Role | Company"
      var m = title.split(" | ");
      if (m.length >= 2) company = m[m.length - 1].trim();
      if (!company) {
        var m2 = title.split(" - ");
        if (m2.length >= 2) company = m2[0].trim();
      }
    }

    // Best-effort location extraction
    var location =
      firstText([
        '[class*="location" i]',
        '[data-automation-id*="location" i]',
        '[data-testid*="location" i]',
      ]) || "";
    if (location && location.length > 120) location = location.slice(0, 120);

    return {
      url: url,
      hostname: window.location.hostname,
      title: title,
      company: company,
      location: location,
      capturedAt: new Date().toISOString(),
    };
  }

  function buildJobKey(jobMeta) {
    var company = normalizeKeyPart(jobMeta && jobMeta.company);
    var title = normalizeKeyPart(jobMeta && jobMeta.title);
    var location = normalizeKeyPart(jobMeta && jobMeta.location);
    var urlHash = hashString(jobMeta && jobMeta.url);

    var parts = [company, title, location].filter(Boolean);
    if (parts.length === 0) {
      parts = [normalizeKeyPart(window.location.hostname)];
    }
    return parts.join("|") + "|" + urlHash;
  }

  /**
   * Handle messages from the background service worker / popup.
   */
  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg || !msg.action) return false;

    switch (msg.action) {
      case "scanFields":
        handleScan(sendResponse);
        return true; // async response

      case "previewFill":
        handlePreview(msg.mappings, sendResponse);
        return true;

      case "executeFill":
        handleFill(msg.mappings, sendResponse);
        return true;

      case "clearPreview":
        JA.clearPreview();
        sendResponse({ ok: true });
        return false;

      case "ping":
        sendResponse({ ok: true, url: window.location.href });
        return false;

      case "getJobContext":
        try {
          var meta = extractJobMeta();
          sendResponse({ ok: true, jobMeta: meta, jobKey: buildJobKey(meta) });
        } catch (e) {
          sendResponse({ ok: false, error: String(e) });
        }
        return false;

      default:
        sendResponse({ error: "unknown action: " + msg.action });
        return false;
    }
  });

  /**
   * Scan the current page for form fields.
   */
  function handleScan(sendResponse) {
    try {
      // Get the adapter for this site
      var adapter = JA.adapterRegistry
        ? JA.adapterRegistry.getAdapter(window.location.href)
        : null;

      var fields;
      if (adapter && adapter.extractFields) {
        fields = adapter.extractFields();
      } else {
        fields = JA.extractFields();
      }

      // Detect navigation buttons
      var navButton = JA.detectNavigationButton();
      var jobMeta = extractJobMeta();
      var jobKey = buildJobKey(jobMeta);

      JA.log("INFO", "Scanned " + fields.length + " fields on " + window.location.href);

      sendResponse({
        ok: true,
        fields: fields,
        navButton: navButton,
        url: window.location.href,
        adapterName: adapter ? adapter.name : "generic",
        jobMeta: jobMeta,
        jobKey: jobKey,
      });
    } catch (err) {
      JA.log("ERROR", "Scan failed: " + err);
      sendResponse({ ok: false, error: String(err) });
    }
  }

  /**
   * Show preview of proposed fills.
   */
  function handlePreview(mappings, sendResponse) {
    try {
      currentMappings = mappings;
      JA.showPreview(mappings);

      var previewCount = mappings.filter(function (m) {
        return m.confidence >= JA.constants.CONFIDENCE_THRESHOLD && m.value;
      }).length;

      JA.log("INFO", "Preview: " + previewCount + " fields will be filled");
      sendResponse({ ok: true, previewCount: previewCount });
    } catch (err) {
      JA.log("ERROR", "Preview failed: " + err);
      sendResponse({ ok: false, error: String(err) });
    }
  }

  /**
   * Execute the fill using current or provided mappings.
   */
  function handleFill(mappings, sendResponse) {
    try {
      var toFill = mappings || currentMappings;
      if (!toFill || toFill.length === 0) {
        sendResponse({ ok: false, error: "No mappings to fill" });
        return;
      }

      // Clear any existing preview
      JA.clearPreview();

      // Get the adapter for possible fill overrides
      var adapter = JA.adapterRegistry
        ? JA.adapterRegistry.getAdapter(window.location.href)
        : null;

      var results;
      if (adapter && adapter.fillFields) {
        results = adapter.fillFields(toFill);
      } else {
        results = JA.fillFields(toFill);
      }

      JA.log(
        "INFO",
        "Fill complete: " +
          results.filled.length +
          " filled, " +
          results.skipped.length +
          " skipped"
      );

      currentMappings = null;

      sendResponse({
        ok: true,
        filled: results.filled,
        skipped: results.skipped,
        log: JA.getLog(),
      });
    } catch (err) {
      JA.log("ERROR", "Fill failed: " + err);
      sendResponse({ ok: false, error: String(err) });
    }
  }

  JA.log("INFO", "Job Autofill content script loaded on " + window.location.href);
})();

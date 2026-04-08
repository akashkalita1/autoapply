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

      JA.log("INFO", "Scanned " + fields.length + " fields on " + window.location.href);

      sendResponse({
        ok: true,
        fields: fields,
        navButton: navButton,
        url: window.location.href,
        adapterName: adapter ? adapter.name : "generic",
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

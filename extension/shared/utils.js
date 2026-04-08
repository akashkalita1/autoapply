/**
 * Shared utilities for the Job Autofill extension.
 * Ported from resume_tool/autofill_agent.py lines 66-75.
 */

window.JobAutofill = window.JobAutofill || {};

(function () {
  /**
   * Strip markdown code fences from LLM output.
   * Ported from autofill_agent.py _strip_markdown_fences.
   */
  window.JobAutofill.stripMarkdownFences = function (text) {
    var match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) return match[1].trim();
    return text.trim();
  };

  /**
   * Merge applicant data and resume into a single profile object.
   * Ported from autofill_agent.py _build_profile.
   */
  window.JobAutofill.buildProfile = function (applicant, resume) {
    return { applicant_info: applicant, resume: resume || {} };
  };

  /**
   * Simple logger that accumulates fill/skip events for display in the popup.
   */
  var _log = [];

  window.JobAutofill.log = function (level, message, data) {
    var entry = {
      timestamp: new Date().toISOString(),
      level: level,
      message: message,
      data: data || null,
    };
    _log.push(entry);
    console.log("[JobAutofill][" + level + "] " + message, data || "");
  };

  window.JobAutofill.getLog = function () {
    return _log.slice();
  };

  window.JobAutofill.clearLog = function () {
    _log = [];
  };

  /**
   * Decode a base64 string to a Uint8Array.
   * Used by dom_filler.js and notification_widget.js for file attachment.
   */
  window.JobAutofill.base64ToBytes = function (base64) {
    var byteChars = atob(base64);
    var byteNumbers = new Array(byteChars.length);
    for (var i = 0; i < byteChars.length; i++) {
      byteNumbers[i] = byteChars.charCodeAt(i);
    }
    return new Uint8Array(byteNumbers);
  };

  /**
   * Detect navigation/submit buttons on the page.
   * Ported from autofill_agent.py detect_navigation_button (lines 300-330).
   */
  window.JobAutofill.detectNavigationButton = function () {
    var constants = window.JobAutofill.constants;
    var buttons = document.querySelectorAll(
      'button, input[type="submit"], input[type="button"], a[role="button"], [role="button"]'
    );
    var nextCandidate = null;
    var submitCandidate = null;

    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var rect = btn.getBoundingClientRect();
      if (!rect || rect.width === 0) continue;
      var text = (btn.innerText || btn.value || "").trim();

      if (constants.NEXT_PATTERNS.test(text)) {
        nextCandidate = { type: "next", text: text };
      } else if (constants.SUBMIT_PATTERNS.test(text)) {
        submitCandidate = { type: "submit", text: text };
      }
    }

    if (nextCandidate) return nextCandidate;
    if (submitCandidate) return submitCandidate;
    return { type: "none", text: "" };
  };
})();

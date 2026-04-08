/**
 * In-page floating notification widget.
 * Appears when the extension detects autofill / optimize / resume-upload opportunities.
 * Designed to match the popup's light, rounded, emoji-accented aesthetic.
 * All CSS is scoped with the `jaf-` prefix to avoid collisions.
 */

window.JobAutofill = window.JobAutofill || {};

(function () {
  var JA = window.JobAutofill;
  var WIDGET_ID = "jaf-opportunity-widget";
  var DISMISS_KEY = "jaf_widget_dismissed";
  var AUTO_HIDE_MS = 30000;

  var hideTimer = null;

  function injectStyles() {
    if (document.getElementById("jaf-widget-styles")) return;
    var style = document.createElement("style");
    style.id = "jaf-widget-styles";
    style.textContent =
      "#" + WIDGET_ID + " {" +
      "  position: fixed; bottom: 20px; right: 20px; z-index: 2147483647;" +
      "  width: 300px; background: #fff; border-radius: 16px;" +
      "  box-shadow: 0 8px 32px rgba(99,102,241,0.18), 0 2px 8px rgba(0,0,0,0.06);" +
      "  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;" +
      "  font-size: 13px; color: #334155; overflow: hidden;" +
      "  animation: jaf-slide-in 0.35s ease-out;" +
      "}" +
      "#" + WIDGET_ID + ".jaf-hiding {" +
      "  animation: jaf-slide-out 0.25s ease-in forwards;" +
      "}" +
      "@keyframes jaf-slide-in {" +
      "  from { opacity: 0; transform: translateY(20px) scale(0.96); }" +
      "  to   { opacity: 1; transform: translateY(0) scale(1); }" +
      "}" +
      "@keyframes jaf-slide-out {" +
      "  from { opacity: 1; transform: translateY(0) scale(1); }" +
      "  to   { opacity: 0; transform: translateY(20px) scale(0.96); }" +
      "}" +
      ".jaf-w-header {" +
      "  display: flex; align-items: center; justify-content: space-between;" +
      "  padding: 12px 16px 8px; border-bottom: 1px solid #f1f5f9;" +
      "}" +
      ".jaf-w-title {" +
      "  font-size: 14px; font-weight: 700;" +
      "  background: linear-gradient(135deg, #6366f1, #818cf8);" +
      "  -webkit-background-clip: text; -webkit-text-fill-color: transparent;" +
      "  background-clip: text;" +
      "}" +
      ".jaf-w-close {" +
      "  background: none; border: none; cursor: pointer; font-size: 16px;" +
      "  color: #94a3b8; padding: 2px 6px; border-radius: 8px; line-height: 1;" +
      "  transition: background 0.15s, color 0.15s;" +
      "}" +
      ".jaf-w-close:hover { background: #f1f5f9; color: #475569; }" +
      ".jaf-w-body { padding: 8px 12px 12px; }" +
      ".jaf-w-row {" +
      "  display: flex; align-items: center; gap: 10px;" +
      "  padding: 8px 4px; border-bottom: 1px solid #f8fafc;" +
      "}" +
      ".jaf-w-row:last-child { border-bottom: none; }" +
      ".jaf-w-emoji { font-size: 18px; flex-shrink: 0; }" +
      ".jaf-w-label { flex: 1; font-size: 12px; color: #475569; line-height: 1.4; }" +
      ".jaf-w-btn {" +
      "  padding: 5px 12px; border: none; border-radius: 10px;" +
      "  font-size: 12px; font-weight: 600; cursor: pointer;" +
      "  color: #fff; transition: all 0.15s; flex-shrink: 0;" +
      "}" +
      ".jaf-w-btn:hover { transform: translateY(-1px); }" +
      ".jaf-w-btn-fill {" +
      "  background: linear-gradient(135deg, #6366f1, #818cf8);" +
      "  box-shadow: 0 2px 6px rgba(99,102,241,0.25);" +
      "}" +
      ".jaf-w-btn-fill:hover { box-shadow: 0 4px 10px rgba(99,102,241,0.35); }" +
      ".jaf-w-btn-optimize {" +
      "  background: linear-gradient(135deg, #8b5cf6, #a78bfa);" +
      "  box-shadow: 0 2px 6px rgba(139,92,246,0.25);" +
      "}" +
      ".jaf-w-btn-optimize:hover { box-shadow: 0 4px 10px rgba(139,92,246,0.35); }" +
      ".jaf-w-btn-attach {" +
      "  background: linear-gradient(135deg, #059669, #34d399);" +
      "  box-shadow: 0 2px 6px rgba(5,150,105,0.25);" +
      "}" +
      ".jaf-w-btn-attach:hover { box-shadow: 0 4px 10px rgba(5,150,105,0.35); }";
    document.head.appendChild(style);
  }

  function isDismissed() {
    try { return sessionStorage.getItem(DISMISS_KEY) === "1"; } catch (e) { return false; }
  }

  function setDismissed() {
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch (e) { /* ignore */ }
  }

  function removeWidget(animate) {
    var el = document.getElementById(WIDGET_ID);
    if (!el) return;
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    if (animate) {
      el.classList.add("jaf-hiding");
      el.addEventListener("animationend", function () { el.remove(); }, { once: true });
    } else {
      el.remove();
    }
  }

  /**
   * Show the opportunity widget.
   * @param {Object} opportunities - { autofill: bool, optimize: bool, resumeUpload: bool, fieldCount: number }
   */
  JA.showOpportunityWidget = function (opportunities) {
    if (isDismissed()) return;
    if (!opportunities) return;

    var hasAny = opportunities.autofill || opportunities.optimize || opportunities.resumeUpload;
    if (!hasAny) return;

    removeWidget(false);
    injectStyles();

    var widget = document.createElement("div");
    widget.id = WIDGET_ID;

    // Header
    var header = document.createElement("div");
    header.className = "jaf-w-header";
    header.innerHTML =
      '<span class="jaf-w-title">✦ Job Autofill</span>' +
      '<button class="jaf-w-close" title="Dismiss">✕</button>';
    widget.appendChild(header);

    header.querySelector(".jaf-w-close").addEventListener("click", function () {
      setDismissed();
      removeWidget(true);
    });

    // Body
    var body = document.createElement("div");
    body.className = "jaf-w-body";

    if (opportunities.autofill) {
      var row1 = document.createElement("div");
      row1.className = "jaf-w-row";
      row1.innerHTML =
        '<span class="jaf-w-emoji">📝</span>' +
        '<span class="jaf-w-label">' + (opportunities.fieldCount || "Form") + ' fields found</span>' +
        '<button class="jaf-w-btn jaf-w-btn-fill">Autofill</button>';
      row1.querySelector(".jaf-w-btn").addEventListener("click", function () {
        chrome.runtime.sendMessage({ action: "startAutofill", mode: "fill" });
        removeWidget(true);
      });
      body.appendChild(row1);
    }

    if (opportunities.optimize) {
      var row2 = document.createElement("div");
      row2.className = "jaf-w-row";
      row2.innerHTML =
        '<span class="jaf-w-emoji">✨</span>' +
        '<span class="jaf-w-label">Optimize your resume</span>' +
        '<button class="jaf-w-btn jaf-w-btn-optimize">Optimize</button>';
      row2.querySelector(".jaf-w-btn").addEventListener("click", function () {
        chrome.runtime.sendMessage({ action: "requestOptimize" });
        removeWidget(true);
      });
      body.appendChild(row2);
    }

    if (opportunities.resumeUpload) {
      var row3 = document.createElement("div");
      row3.className = "jaf-w-row";
      row3.innerHTML =
        '<span class="jaf-w-emoji">📎</span>' +
        '<span class="jaf-w-label">Resume upload detected</span>' +
        '<button class="jaf-w-btn jaf-w-btn-attach">Attach</button>';
      row3.querySelector(".jaf-w-btn").addEventListener("click", function () {
        attachResumeToFileInput();
        removeWidget(true);
      });
      body.appendChild(row3);
    }

    widget.appendChild(body);
    document.body.appendChild(widget);

    // Reset auto-hide on hover
    widget.addEventListener("mouseenter", function () {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    });
    widget.addEventListener("mouseleave", function () {
      hideTimer = setTimeout(function () { removeWidget(true); }, AUTO_HIDE_MS);
    });

    hideTimer = setTimeout(function () { removeWidget(true); }, AUTO_HIDE_MS);
  };

  JA.removeOpportunityWidget = function () {
    removeWidget(true);
  };

  function attachResumeToFileInput() {
    chrome.runtime.sendMessage({ action: "getBaseResumePdf" }, function (resp) {
      if (!resp || !resp.ok || !resp.pdf || !resp.pdf.dataBase64) {
        JA.log("WARN", "No base resume PDF configured for auto-attach.");
        return;
      }
      var fileInputs = document.querySelectorAll('input[type="file"]');
      var resumePattern = /resume|cv|curriculum/i;
      var target = null;

      for (var i = 0; i < fileInputs.length; i++) {
        var el = fileInputs[i];
        var context = [
          el.name || "", el.id || "",
          el.getAttribute("aria-label") || "",
          el.getAttribute("accept") || "",
        ].join(" ");
        var label = "";
        if (el.id) {
          var lbl = document.querySelector('label[for="' + el.id + '"]');
          if (lbl) label = lbl.innerText || "";
        }
        if (!label) {
          var parent = el.closest("label");
          if (parent) label = parent.innerText || "";
        }
        context += " " + label;
        if (JA.nearbyTextForElement) context += " " + JA.nearbyTextForElement(el);

        if (resumePattern.test(context)) {
          target = el;
          break;
        }
      }

      if (!target) {
        if (fileInputs.length === 1) target = fileInputs[0];
      }

      if (!target) {
        JA.log("WARN", "No resume file input found on page for auto-attach.");
        return;
      }

      try {
        var bytes = JA.base64ToBytes(resp.pdf.dataBase64);
        var file = new File([bytes], resp.pdf.name || "resume.pdf", { type: resp.pdf.mime || "application/pdf" });
        var dt = new DataTransfer();
        dt.items.add(file);
        target.files = dt.files;
        target.dispatchEvent(new Event("change", { bubbles: true }));
        JA.log("INFO", "Resume auto-attached to file input.");
      } catch (e) {
        JA.log("ERROR", "Failed to auto-attach resume: " + e);
      }
    });
  }
})();

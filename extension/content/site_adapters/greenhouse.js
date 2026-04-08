/**
 * Greenhouse ATS adapter.
 * Greenhouse job boards typically run on boards.greenhouse.io
 * and use a standard form layout with known field patterns.
 *
 * Known quirks:
 * - Fields use #first_name, #last_name, #email, #phone naming
 * - Custom questions use data-question attribute
 * - File upload for resume uses a dropzone component
 * - EEO (Equal Employment Opportunity) fields are in a separate section
 */

window.JobAutofill = window.JobAutofill || {};

(function () {
  var adapter = new window.JobAutofill.BaseAdapter({
    name: "greenhouse",
    urlPatterns: [
      /boards\.greenhouse\.io/i,
      /greenhouse\.io\/.*\/jobs/i,
    ],
  });

  /**
   * Greenhouse forms sometimes have custom question fields wrapped in
   * divs with specific data attributes. Enhance extraction to capture those.
   */
  adapter.extractFields = function () {
    var fields = window.JobAutofill.extractFields();

    // Enhance fields with Greenhouse-specific context
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      // Greenhouse custom questions often have a data-question or aria-describedby
      if (!f.label && f.id) {
        var wrapper = document.querySelector("#" + CSS.escape(f.id));
        if (wrapper) {
          var fieldset = wrapper.closest("fieldset, .field");
          if (fieldset) {
            var legend = fieldset.querySelector("label, legend, .field-label");
            if (legend) f.label = legend.innerText.trim();
          }
        }
      }
    }

    return fields;
  };

  window.JobAutofill.GreenhouseAdapter = adapter;
})();

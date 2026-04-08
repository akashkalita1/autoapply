/**
 * Adapter registry.
 * Selects the appropriate site adapter based on the current URL.
 * To add a new site: create a new adapter file, then register it here.
 */

window.JobAutofill = window.JobAutofill || {};

(function () {
  var JA = window.JobAutofill;

  // Ordered list of adapters to try (most specific first)
  var adapters = [
    JA.GreenhouseAdapter,
    JA.LeverAdapter,
    JA.WorkdayAdapter,
  ].filter(Boolean);

  JA.adapterRegistry = {
    /**
     * Returns the adapter that matches the given URL, or the generic fallback.
     */
    getAdapter: function (url) {
      for (var i = 0; i < adapters.length; i++) {
        if (adapters[i].matches(url)) {
          return adapters[i];
        }
      }
      return JA.GenericAdapter;
    },

    /**
     * Register a new adapter at runtime.
     * @param {Object} adapter - adapter instance (must extend BaseAdapter)
     */
    register: function (adapter) {
      adapters.unshift(adapter);
    },
  };
})();

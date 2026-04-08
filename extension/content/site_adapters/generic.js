/**
 * Generic adapter -- fallback for all sites not matched by a specific adapter.
 * Uses the shared extraction, matching, and filling logic without modification.
 */

window.JobAutofill = window.JobAutofill || {};

window.JobAutofill.GenericAdapter = new window.JobAutofill.BaseAdapter({
  name: "generic",
  urlPatterns: [], // matches nothing; used as fallback
});

/**
 * Rule-based field matcher (content-script entry point).
 * Delegates to the shared MatchRules module loaded via match_rules.js.
 */

window.JobAutofill = window.JobAutofill || {};

window.JobAutofill.matchFields = function (fields, profile) {
  return MatchRules.ruleBasedMatch(fields, profile);
};

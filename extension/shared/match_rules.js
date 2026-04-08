/**
 * Shared matching rules and logic.
 * Environment-agnostic: works in both service worker (importScripts) and
 * content script (window) contexts.
 */

/* eslint-disable no-var */
var MatchRules = (function () {
  var RULES = [
    {
      key: "first_name",
      patterns: [/\bfirst[\s_-]?name\b/i, /\bgiven[\s_-]?name\b/i, /\bfname\b/i],
      autocomplete: "given-name",
    },
    {
      key: "last_name",
      patterns: [/\blast[\s_-]?name\b/i, /\bfamily[\s_-]?name\b/i, /\bsurname\b/i, /\blname\b/i],
      autocomplete: "family-name",
    },
    {
      key: "full_name",
      patterns: [/\bfull[\s_-]?name\b/i, /\byour[\s_-]?name\b/i],
      autocomplete: "name",
      derive: function (p) { return [p.first_name, p.last_name].filter(Boolean).join(" "); },
    },
    {
      key: "email",
      patterns: [/\be[\s_-]?mail\b/i, /\bemail[\s_-]?address\b/i],
      autocomplete: "email",
      inputType: "email",
    },
    {
      key: "phone",
      patterns: [/\bphone\b/i, /\btelephone\b/i, /\bmobile\b/i, /\bcell\b/i, /\bphone[\s_-]?number\b/i],
      autocomplete: "tel",
      inputType: "tel",
    },
    {
      key: "address.street",
      patterns: [/\bstreet[\s_-]?address\b/i, /\baddress[\s_-]?line[\s_-]?1\b/i, /\baddress\b/i],
      autocomplete: "address-line1",
    },
    {
      key: "address.city",
      patterns: [/\bcity\b/i, /\btown\b/i],
      autocomplete: "address-level2",
    },
    {
      key: "address.state",
      patterns: [/\bstate\b/i, /\bprovince\b/i, /\bregion\b/i],
      autocomplete: "address-level1",
    },
    {
      key: "address.zip",
      patterns: [/\bzip\b/i, /\bpostal[\s_-]?code\b/i, /\bpostcode\b/i],
      autocomplete: "postal-code",
    },
    {
      key: "address.country",
      patterns: [/\bcountry\b/i],
      autocomplete: "country-name",
    },
    {
      key: "linkedin",
      patterns: [/\blinkedin\b/i, /\blinked[\s_-]?in\b/i],
    },
    {
      key: "github",
      patterns: [/\bgithub\b/i, /\bgit[\s_-]?hub\b/i],
    },
    {
      key: "portfolio",
      patterns: [/\bportfolio\b/i, /\bpersonal[\s_-]?website\b/i, /\bwebsite\b/i, /\bhomepage\b/i],
    },
    {
      key: "university",
      patterns: [/\buniversity\b/i, /\bschool\b/i, /\bcollege\b/i, /\binstitution\b/i, /\bschool[\s_-]?name\b/i],
    },
    {
      key: "degree",
      patterns: [/\bdegree\b/i, /\bmajor\b/i, /\bfield[\s_-]?of[\s_-]?study\b/i],
    },
    {
      key: "gpa",
      patterns: [/\bgpa\b/i, /\bgrade[\s_-]?point\b/i, /\bcumulative[\s_-]?gpa\b/i],
    },
    {
      key: "graduation_year",
      patterns: [
        /\bgraduation[\s_-]?year\b/i, /\bgrad[\s_-]?year\b/i,
        /\byear[\s_-]?of[\s_-]?graduation\b/i, /\bexpected[\s_-]?graduation\b/i,
      ],
    },
    {
      key: "graduation_month",
      patterns: [/\bgraduation[\s_-]?month\b/i, /\bgrad[\s_-]?month\b/i],
    },
    {
      key: "graduation_date",
      patterns: [/\bgraduation[\s_-]?date\b/i, /\bgrad[\s_-]?date\b/i],
      derive: function (p) { return [p.graduation_month, p.graduation_year].filter(Boolean).join(" "); },
    },
    {
      key: "work_authorization",
      patterns: [
        /\bwork[\s_-]?auth/i, /\bauthori[sz]ed[\s_-]?to[\s_-]?work\b/i,
        /\beligib/i, /\blegal[\s_-]?right\b/i,
      ],
    },
    {
      key: "require_sponsorship",
      patterns: [
        /\bsponsorship\b/i, /\bvisa[\s_-]?sponsor/i, /\brequire[\s_-]?sponsor/i,
        /\bneed[\s_-]?sponsor/i, /\bimmigration[\s_-]?sponsor/i,
      ],
    },
    {
      key: "years_of_experience",
      patterns: [
        /\byears[\s_-]?of[\s_-]?experience\b/i, /\bexperience[\s_-]?years\b/i,
        /\byears[\s_-]?experience\b/i, /\btotal[\s_-]?experience\b/i,
      ],
    },
  ];

  function buildSignal(field) {
    return [
      field.label, field.placeholder, field.name, field.id,
      field.aria_label, field.nearby_text,
      Object.values(field.data_attrs || {}).join(" "),
    ].join(" ").toLowerCase();
  }

  function resolveKey(obj, key) {
    return key.split(".").reduce(function (o, k) {
      return o && o[k] !== undefined ? o[k] : "";
    }, obj);
  }

  function matchBooleanOption(profileValue, options) {
    var boolVal = profileValue === true || profileValue === "true" ||
                  profileValue === "yes" || profileValue === "Yes";
    var pos = /\b(yes|true|i\s*do|will\s*require)\b/i;
    var neg = /\b(no|false|i\s*do\s*not|will\s*not|don'?t)\b/i;

    for (var i = 0; i < options.length; i++) {
      var text = options[i].text || options[i].value || "";
      if (boolVal && pos.test(text)) return options[i].value;
      if (!boolVal && neg.test(text)) return options[i].value;
    }
    return null;
  }

  function matchAuthorizationOption(profileValue, options) {
    var lower = (profileValue || "").toLowerCase();
    for (var i = 0; i < options.length; i++) {
      var optText = (options[i].text || "").toLowerCase();
      if (optText && lower && optText.indexOf(lower.substring(0, 10)) !== -1)
        return options[i].value;
    }
    var isCitizen = /citizen|authorized|permanent/i.test(lower);
    for (var j = 0; j < options.length; j++) {
      var t = (options[j].text || "").toLowerCase();
      if (isCitizen && /citizen|authorized|permanent|no\s*sponsor/i.test(t))
        return options[j].value;
    }
    return null;
  }

  function matchGenericOption(value, options) {
    var lower = String(value).toLowerCase();
    for (var i = 0; i < options.length; i++) {
      var ov = options[i].value.toLowerCase();
      var ot = options[i].text.toLowerCase();
      if (ov === lower || ot === lower || ot.indexOf(lower) !== -1 || ov.indexOf(lower) !== -1) {
        return options[i].value;
      }
    }
    return null;
  }

  /**
   * Run rule-based matching on an array of extracted fields against a profile.
   * @param {Array} fields
   * @param {Object} profile
   * @returns {Array} mappings
   */
  function ruleBasedMatch(fields, profile) {
    var mappings = [];
    var matched = {};

    for (var fi = 0; fi < fields.length; fi++) {
      var field = fields[fi];
      var signal = buildSignal(field);
      var didMatch = false;

      for (var ri = 0; ri < RULES.length; ri++) {
        var rule = RULES[ri];

        if (rule.autocomplete && field.autocomplete && field.autocomplete === rule.autocomplete) {
          didMatch = true;
        }

        if (!didMatch && rule.inputType && field.type === rule.inputType) {
          didMatch = true;
        }

        if (!didMatch) {
          for (var pi = 0; pi < rule.patterns.length; pi++) {
            if (rule.patterns[pi].test(signal)) { didMatch = true; break; }
          }
        }

        if (!didMatch) continue;

        var value = rule.derive ? rule.derive(profile) : resolveKey(profile, rule.key);

        // Handle <select> fields
        if (field.tag === "select" && field.options && field.options.length > 0) {
          if (rule.key === "require_sponsorship") {
            value = matchBooleanOption(value, field.options);
          } else if (rule.key === "work_authorization") {
            value = matchAuthorizationOption(value, field.options);
          } else {
            value = matchGenericOption(value, field.options);
          }
        }

        // Handle checkbox/radio for boolean fields
        if ((field.type === "checkbox" || field.type === "radio") && rule.key === "require_sponsorship") {
          var boolVal = value === true || value === "true" || value === "yes";
          var isNegativeField = /\b(no|don'?t|do\s*not)\b/i.test(signal);
          value = isNegativeField ? !boolVal : boolVal;
        }

        var label = field.label || field.placeholder || field.name || field.selector;
        if (value !== null && value !== undefined && value !== "") {
          mappings.push({
            field_label: label, selector: field.selector,
            value: String(value), confidence: 0.95, profileKey: rule.key,
          });
        } else {
          mappings.push({
            field_label: label, selector: field.selector,
            value: "", confidence: 0.3, profileKey: rule.key,
            reason: "no profile value for matched key",
          });
        }

        matched[field.selector] = true;
        break; // one rule per field
      }

      if (!matched[field.selector]) {
        var ulabel = field.label || field.placeholder || field.name || field.selector;
        mappings.push({
          field_label: ulabel, selector: field.selector,
          value: "", confidence: 0, profileKey: null,
          reason: "no matching rule",
        });
      }
    }

    return mappings;
  }

  return {
    RULES: RULES,
    buildSignal: buildSignal,
    resolveKey: resolveKey,
    matchBooleanOption: matchBooleanOption,
    matchAuthorizationOption: matchAuthorizationOption,
    matchGenericOption: matchGenericOption,
    ruleBasedMatch: ruleBasedMatch,
  };
})();

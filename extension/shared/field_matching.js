/**
 * Rule-based field matcher.
 * Maps extracted form fields to applicant profile keys using keyword heuristics
 * on label, placeholder, name, id, aria-label, autocomplete, and nearby text.
 *
 * Works without an API key. Covers ~30 common job-application field patterns.
 */

window.JobAutofill = window.JobAutofill || {};

(function () {
  // Each rule: array of regex patterns -> profile path (dot-notation for nested keys)
  // Patterns are tested against a combined "signal" string built from all field metadata.
  const RULES = [
    {
      key: "first_name",
      patterns: [
        /\bfirst[\s_-]?name\b/i,
        /\bgiven[\s_-]?name\b/i,
        /\bfname\b/i,
      ],
      autocomplete: "given-name",
    },
    {
      key: "last_name",
      patterns: [
        /\blast[\s_-]?name\b/i,
        /\bfamily[\s_-]?name\b/i,
        /\bsurname\b/i,
        /\blname\b/i,
      ],
      autocomplete: "family-name",
    },
    {
      key: "full_name",
      patterns: [/\bfull[\s_-]?name\b/i, /\byour[\s_-]?name\b/i],
      autocomplete: "name",
      derive: function (profile) {
        return [profile.first_name, profile.last_name].filter(Boolean).join(" ");
      },
    },
    {
      key: "email",
      patterns: [/\be[\s_-]?mail\b/i, /\bemail[\s_-]?address\b/i],
      autocomplete: "email",
      inputType: "email",
    },
    {
      key: "phone",
      patterns: [
        /\bphone\b/i,
        /\btelephone\b/i,
        /\bmobile\b/i,
        /\bcell\b/i,
        /\bphone[\s_-]?number\b/i,
      ],
      autocomplete: "tel",
      inputType: "tel",
    },
    {
      key: "address.street",
      patterns: [
        /\bstreet[\s_-]?address\b/i,
        /\baddress[\s_-]?line[\s_-]?1\b/i,
        /\baddress\b/i,
      ],
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
      patterns: [
        /\bportfolio\b/i,
        /\bpersonal[\s_-]?website\b/i,
        /\bwebsite\b/i,
        /\bhomepage\b/i,
      ],
    },
    {
      key: "university",
      patterns: [
        /\buniversity\b/i,
        /\bschool\b/i,
        /\bcollege\b/i,
        /\binstitution\b/i,
        /\bschool[\s_-]?name\b/i,
      ],
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
        /\bgraduation[\s_-]?year\b/i,
        /\bgrad[\s_-]?year\b/i,
        /\byear[\s_-]?of[\s_-]?graduation\b/i,
        /\bexpected[\s_-]?graduation\b/i,
      ],
    },
    {
      key: "graduation_month",
      patterns: [/\bgraduation[\s_-]?month\b/i, /\bgrad[\s_-]?month\b/i],
    },
    {
      key: "graduation_date",
      patterns: [
        /\bgraduation[\s_-]?date\b/i,
        /\bgrad[\s_-]?date\b/i,
      ],
      derive: function (profile) {
        return [profile.graduation_month, profile.graduation_year]
          .filter(Boolean)
          .join(" ");
      },
    },
    {
      key: "work_authorization",
      patterns: [
        /\bwork[\s_-]?auth/i,
        /\bauthori[sz]ed[\s_-]?to[\s_-]?work\b/i,
        /\beligib/i,
        /\blegal[\s_-]?right\b/i,
      ],
    },
    {
      key: "require_sponsorship",
      patterns: [
        /\bsponsorship\b/i,
        /\bvisa[\s_-]?sponsor/i,
        /\brequire[\s_-]?sponsor/i,
        /\bneed[\s_-]?sponsor/i,
        /\bimmigration[\s_-]?sponsor/i,
      ],
    },
    {
      key: "years_of_experience",
      patterns: [
        /\byears[\s_-]?of[\s_-]?experience\b/i,
        /\bexperience[\s_-]?years\b/i,
        /\byears[\s_-]?experience\b/i,
        /\btotal[\s_-]?experience\b/i,
      ],
    },
  ];

  /**
   * Build a searchable signal string from all metadata of a field.
   */
  function buildSignal(field) {
    return [
      field.label,
      field.placeholder,
      field.name,
      field.id,
      field.aria_label,
      field.nearby_text,
      Object.values(field.data_attrs || {}).join(" "),
    ]
      .join(" ")
      .toLowerCase();
  }

  /**
   * Resolve a dot-notation key against a flat/nested profile.
   * e.g. "address.city" -> profile.address.city
   */
  function resolveKey(profile, key) {
    return key.split(".").reduce(function (obj, part) {
      return obj && obj[part] !== undefined ? obj[part] : "";
    }, profile);
  }

  /**
   * For boolean-ish profile values (like require_sponsorship), find the best
   * matching option in a <select> element.
   */
  function matchBooleanOption(profileValue, options) {
    const boolVal =
      profileValue === true ||
      profileValue === "true" ||
      profileValue === "yes" ||
      profileValue === "Yes";
    const positivePatterns = /\b(yes|true|i\s*do|will\s*require)\b/i;
    const negativePatterns = /\b(no|false|i\s*do\s*not|will\s*not|don'?t)\b/i;

    for (const opt of options) {
      const text = opt.text || opt.value || "";
      if (boolVal && positivePatterns.test(text)) return opt.value;
      if (!boolVal && negativePatterns.test(text)) return opt.value;
    }
    return null;
  }

  /**
   * For work_authorization select fields, find the best matching option.
   */
  function matchAuthorizationOption(profileValue, options) {
    const lower = (profileValue || "").toLowerCase();
    // Try exact-ish substring match first
    for (const opt of options) {
      const optText = (opt.text || "").toLowerCase();
      if (optText && lower && optText.includes(lower.substring(0, 10)))
        return opt.value;
    }
    // Heuristic: if profile mentions "citizen" or "authorized", match those
    const isCitizen = /citizen|authorized|permanent/i.test(lower);
    for (const opt of options) {
      const t = (opt.text || "").toLowerCase();
      if (isCitizen && /citizen|authorized|permanent|no\s*sponsor/i.test(t))
        return opt.value;
    }
    return null;
  }

  /**
   * Main matching function.
   * @param {Array} fields - extracted field list from field_extraction.js
   * @param {Object} profile - applicant profile from chrome.storage
   * @returns {Array} mappings [{field_label, selector, value, confidence, profileKey}]
   */
  window.JobAutofill.matchFields = function (fields, profile) {
    const mappings = [];

    for (const field of fields) {
      const signal = buildSignal(field);
      let matched = false;

      for (const rule of RULES) {
        // Check autocomplete attribute first (most reliable signal)
        if (
          rule.autocomplete &&
          field.autocomplete &&
          field.autocomplete === rule.autocomplete
        ) {
          matched = true;
        }

        // Check input type shortcut (email, tel)
        if (!matched && rule.inputType && field.type === rule.inputType) {
          matched = true;
        }

        // Check keyword patterns against the combined signal
        if (!matched) {
          for (const pat of rule.patterns) {
            if (pat.test(signal)) {
              matched = true;
              break;
            }
          }
        }

        if (!matched) continue;

        // Resolve the value from the profile
        let value;
        if (rule.derive) {
          value = rule.derive(profile);
        } else {
          value = resolveKey(profile, rule.key);
        }

        // Handle <select> fields
        if (field.tag === "select" && field.options && field.options.length > 0) {
          if (rule.key === "require_sponsorship") {
            value = matchBooleanOption(value, field.options);
          } else if (rule.key === "work_authorization") {
            value = matchAuthorizationOption(value, field.options);
          } else {
            // Generic select: try to find an option whose text/value contains the profile value
            const lower = String(value).toLowerCase();
            const found = field.options.find(function (o) {
              return (
                o.value.toLowerCase() === lower ||
                o.text.toLowerCase() === lower ||
                o.text.toLowerCase().includes(lower) ||
                o.value.toLowerCase().includes(lower)
              );
            });
            value = found ? found.value : null;
          }
        }

        // Handle checkbox/radio for boolean fields
        if (
          (field.type === "checkbox" || field.type === "radio") &&
          rule.key === "require_sponsorship"
        ) {
          const boolVal =
            value === true || value === "true" || value === "yes";
          // For "do you require sponsorship" questions, check based on the answer
          const isNegativeField = /\b(no|don'?t|do\s*not)\b/i.test(signal);
          value = isNegativeField ? !boolVal : boolVal;
        }

        if (value === null || value === undefined || value === "") {
          mappings.push({
            field_label: field.label || field.placeholder || field.name || field.selector,
            selector: field.selector,
            value: "",
            confidence: 0.3,
            profileKey: rule.key,
            reason: "no profile value for matched key",
          });
        } else {
          mappings.push({
            field_label: field.label || field.placeholder || field.name || field.selector,
            selector: field.selector,
            value: String(value),
            confidence: 0.95,
            profileKey: rule.key,
          });
        }

        matched = false; // reset for next field
        break; // one rule per field
      }

      // If no rule matched, mark as unmatched
      if (!mappings.find((m) => m.selector === field.selector)) {
        mappings.push({
          field_label: field.label || field.placeholder || field.name || field.selector,
          selector: field.selector,
          value: "",
          confidence: 0,
          profileKey: null,
          reason: "no matching rule",
        });
      }
    }

    return mappings;
  };
})();

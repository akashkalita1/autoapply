/**
 * Framework-safe event dispatch.
 * After programmatically setting element.value, React/Angular/Vue may not
 * detect the change unless we dispatch the right synthetic events.
 */

window.JobAutofill = window.JobAutofill || {};

(function () {
  // React overrides the native value setter. We need the original to bypass it.
  var nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  );
  var nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value"
  );
  var nativeSelectValueSetter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value"
  );

  /**
   * Set a value on an element in a framework-safe way and dispatch all
   * necessary events so React, Angular, and Vue detect the change.
   *
   * @param {HTMLElement} element
   * @param {string|boolean} value
   */
  window.JobAutofill.setValueAndDispatch = function (element, value) {
    var tag = element.tagName.toLowerCase();
    var type = (element.type || "").toLowerCase();

    // Checkbox / radio: toggle the checked property
    if (type === "checkbox" || type === "radio") {
      var shouldCheck = value === true || value === "true" || value === "yes";
      if (element.checked !== shouldCheck) {
        element.checked = shouldCheck;
        element.dispatchEvent(new Event("click", { bubbles: true }));
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return;
    }

    // Use the native setter to bypass React's synthetic setter
    if (tag === "textarea" && nativeTextareaValueSetter && nativeTextareaValueSetter.set) {
      nativeTextareaValueSetter.set.call(element, value);
    } else if (tag === "select" && nativeSelectValueSetter && nativeSelectValueSetter.set) {
      nativeSelectValueSetter.set.call(element, value);
    } else if (nativeInputValueSetter && nativeInputValueSetter.set) {
      nativeInputValueSetter.set.call(element, value);
    } else {
      element.value = value;
    }

    // Focus the element first (some frameworks listen for focus)
    element.dispatchEvent(new Event("focus", { bubbles: true }));

    // Input event (React listens for this)
    element.dispatchEvent(
      new InputEvent("input", { bubbles: true, inputType: "insertText" })
    );

    // Change event (most frameworks listen for this)
    element.dispatchEvent(new Event("change", { bubbles: true }));

    // Blur to trigger validation
    element.dispatchEvent(new Event("blur", { bubbles: true }));
  };
})();

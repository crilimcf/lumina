/** A live update may replace the current React tree. Defer it while the
 * user is writing, uploading media or in a live call.
 * Content is not persisted or transmitted by this check.
 */
// Mark actual user edits, not initial values already loaded from the account.
// This listener is installed when main.jsx imports the helper, before React
// mounts the forms, and tracks individual DOM nodes without retaining them.
const editedInputs = new WeakSet();
if (typeof document !== 'undefined') {
  document.addEventListener('input', event => {
    const el = event.target;
    if (el?.matches?.('input,textarea,[contenteditable="true"]')) editedInputs.add(el);
  }, true);
}

export function hasActiveUserWork(doc = document) {
  const active = doc.activeElement;
  if (active?.isContentEditable || active?.matches?.('input,textarea,[role="textbox"]')) return true;
  if (doc.querySelector(
    '[data-lumina-call-active="true"],[data-lumina-unsent-media="true"],.messages-media-ready,.composer-sheet'
  )) return true;
  // Do not mistake existing profile data for an unsaved draft. Plain
  // inputs are protected only after an actual input event, while chat text,
  // contenteditable areas and textareas remain protected whenever populated.
  for (const field of doc.querySelectorAll(
    'textarea,[contenteditable="true"],input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not([type="file"]):not([type="button"]):not([type="submit"])'
  )) {
    if (field.isContentEditable && field.textContent?.trim()) return true;
    const value = typeof field.value === 'string' ? field.value.trim() : '';
    if (value && (field.matches('textarea,.messages-composer-input') || editedInputs.has(field))) return true;
  }
  return false;
}

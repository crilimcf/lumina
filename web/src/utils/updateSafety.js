/** A live update may replace the current React tree. Defer it while the
 * user is writing, uploading media or in a live call.
 * Content is not persisted or transmitted by this check.
 */
export function hasActiveUserWork(doc = document) {
  const active = doc.activeElement;
  if (active?.isContentEditable || active?.matches?.('input,textarea,[role="textbox"]')) return true;
  if (doc.querySelector(
    '[data-lumina-call-active="true"],[data-lumina-unsent-media="true"],.messages-media-ready,.composer-sheet'
  )) return true;
  // React forms keep their state in memory, not in HTML attributes. A value
  // remains unsent even after focus leaves a registration/password field.
  for (const field of doc.querySelectorAll(
    'textarea,[contenteditable="true"],input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not([type="file"]):not([type="button"]):not([type="submit"])'
  )) {
    if (field.isContentEditable && field.textContent?.trim()) return true;
    if (typeof field.value === 'string' && field.value.trim()) return true;
  }
  return false;
}

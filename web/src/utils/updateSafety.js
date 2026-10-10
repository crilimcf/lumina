/** A live update may replace the current React tree. Defer it while the
 * user is writing, uploading media or in a live call.
 * Content is not persisted or transmitted by this check.
 */
export function hasActiveUserWork(doc = document) {
  const active = doc.activeElement;
  if (active?.isContentEditable || active?.matches?.('input,textarea,[role="textbox"]')) return true;
  if (doc.querySelector('[data-lumina-call-active="true"],.composer-sheet')) return true;
  for (const field of doc.querySelectorAll('textarea,.messages-composer-input,[contenteditable="true"]')) {
    if (field.isContentEditable && field.textContent?.trim()) return true;
    if (typeof field.value === 'string' && field.value.trim()) return true;
  }
  return false;
}

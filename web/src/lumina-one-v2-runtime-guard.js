function reconcilePulseDiscovery() {
  const root = document.querySelector('.lumina-one.one-v2');
  const page = root?.querySelector('.one-pulse-page');
  if (!page) return;

  const scope = page.querySelector('.one-segment button.is-on')?.textContent?.trim() || 'Para ti';
  const seed = page.querySelector('.one-v2-pulse-seed');
  const socialCards = page.querySelectorAll('.one-pulse-card');
  const empty = [...page.querySelectorAll('.one-state')].find(node =>
    /Pulso está a aquecer|círculo ainda está silencioso/i.test(node.textContent || '')
  );

  if (socialCards.length) {
    if (seed) seed.hidden = true;
    if (empty) empty.style.display = 'none';
    return;
  }

  if (scope === 'Amigos') {
    if (seed) seed.hidden = true;
    if (empty) {
      empty.style.display = '';
      empty.classList.add('one-v2-friends-empty');
      if (!/círculo ainda está silencioso/i.test(empty.textContent || '')) {
        empty.innerHTML = '<span class="one-v2-empty-orb">◎</span><b>O teu círculo ainda está silencioso</b><span>Segue pessoas e, quando publicarem, aparecem aqui sem mistura com o resto do Pulso.</span>';
      }
    }
    return;
  }

  if (seed) {
    seed.hidden = false;
    if (empty) empty.style.display = 'none';
  }
}

let scheduled = false;
function scheduleReconcile() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    reconcilePulseDiscovery();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleReconcile, { once:true });
else scheduleReconcile();

new MutationObserver(scheduleReconcile).observe(document.documentElement, {
  childList:true,
  subtree:true,
  attributes:true,
  attributeFilter:['class','hidden'],
});

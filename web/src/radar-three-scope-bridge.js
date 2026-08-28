import { t } from './i18n-ui.js';

const OLD_COPY = 'O Radar Local usa a localização real do iPhone. Não misturamos notícias locais com o feed mundial.';
const OLD_CTA = 'Abrir Radar Local / Mundo';

function apply() {
  document.querySelectorAll('.one-radar-handoff p').forEach(node => {
    const source = node.dataset.radarScopeSource || node.textContent.trim();
    if (source === OLD_COPY || node.dataset.radarScopeSource === OLD_COPY) {
      node.dataset.radarScopeSource = OLD_COPY;
      const next = t('O Radar usa a localização real do iPhone: Perto de mim, País e Mundo ficam separados.');
      if (node.textContent !== next) node.textContent = next;
    }
  });

  document.querySelectorAll('.one-agora-actions button').forEach(node => {
    const source = node.dataset.radarScopeSource || node.textContent.trim();
    if (source === OLD_CTA || node.dataset.radarScopeSource === OLD_CTA) {
      node.dataset.radarScopeSource = OLD_CTA;
      const next = t('Abrir Radar Perto / País / Mundo');
      if (node.textContent !== next) node.textContent = next;
    }
  });
}

apply();
new MutationObserver(apply).observe(document.documentElement, { childList:true, subtree:true });

import { t } from './i18n-ui.js';

const GENERIC_LOCATION_LABELS = new Set([
  'Localização do iPhone',
  'Localisation de l’iPhone',
  'Position de l’iPhone',
  'iPhone location',
  'Ubicación del iPhone',
]);

function apply() {
  document.querySelectorAll('.one-radar-handoff').forEach(section => {
    const label = section.querySelector('b');
    if (label && GENERIC_LOCATION_LABELS.has(label.textContent.trim())) {
      const nextLabel = t('Localização do iPhone');
      if (label.textContent !== nextLabel) label.textContent = nextLabel;
    }

    const copy = section.querySelector('p');
    if (copy) {
      const nextCopy = t('O Radar usa a localização real do iPhone: Perto de mim, País e Mundo ficam separados.');
      if (copy.textContent !== nextCopy) copy.textContent = nextCopy;
    }
  });

  document.querySelectorAll('.one-agora-actions .one-secondary-action').forEach(node => {
    const next = t('Abrir Radar Perto / País / Mundo');
    if (node.textContent !== next) node.textContent = next;
  });
}

apply();
new MutationObserver(apply).observe(document.documentElement, {
  childList:true,
  characterData:true,
  subtree:true,
});

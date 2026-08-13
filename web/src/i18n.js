import EN from './locales/en.js';
import FR from './locales/fr.js';
import ES from './locales/es.js';

const catalogs = { pt:{}, en:EN, fr:FR, es:ES };
const locales = { pt:'pt-PT', en:'en-US', fr:'fr-FR', es:'es-ES' };
const supported = new Set(Object.keys(catalogs));
const preferred = [...(navigator.languages || []), navigator.language]
  .filter(Boolean)
  .map(value => String(value).toLowerCase().split('-')[0])
  .find(value => supported.has(value));

export const language = preferred || 'en';
export const locale = locales[language] || 'en-US';
export const t = source => catalogs[language]?.[source] || source;
export const formatDate = (value, options) => new Intl.DateTimeFormat(locale, options).format(new Date(value));
export const formatNumber = (value, options) => new Intl.NumberFormat(locale, options).format(value);

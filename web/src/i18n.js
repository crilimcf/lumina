import EN from './locales/en.js';
import FR from './locales/fr.js';
import ES from './locales/es.js';

const catalogs = { pt:{}, en:EN, fr:FR, es:ES };
const locales = { pt:'pt-PT', en:'en-US', fr:'fr-FR', es:'es-ES' };
const supported = new Set(Object.keys(catalogs));

function resolveLanguage() {
  const candidates = [
    ...(Array.isArray(navigator.languages) ? navigator.languages : []),
    navigator.language,
  ].filter(Boolean);

  for (const value of candidates) {
    const short = String(value).trim().toLowerCase().split('-')[0];
    if (supported.has(short)) return short;
  }
  return 'en';
}

export const language = resolveLanguage();
export const locale = locales[language] || 'en-US';
export const supportedLanguages = Object.freeze([...supported]);

const interpolate = (value, variables = {}) => String(value).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => (
  variables[key] === undefined || variables[key] === null ? match : String(variables[key])
));

export function t(source, variables = {}) {
  if (source === undefined || source === null) return '';
  const key = String(source);
  const translated = catalogs[language]?.[key] ?? key;
  return interpolate(translated, variables);
}

const dynamicRules = {
  en: [
    [/^Abrir perfil de (.+)$/u, 'Open {value} profile'],
    [/^Ligar por áudio a (.+)$/u, 'Audio call {value}'],
    [/^Fazer videochamada com (.+)$/u, 'Video call {value}'],
    [/^Abrir conversa com (.+)$/u, 'Open conversation with {value}'],
    [/^Conversar com (.+)$/u, 'Message {value}'],
    [/^(\d+) por ler$/u, '{value} unread'],
    [/^(\d+) conversa$/u, '{value} conversation'],
    [/^(\d+) conversas$/u, '{value} conversations'],
  ],
  fr: [
    [/^Abrir perfil de (.+)$/u, 'Ouvrir le profil de {value}'],
    [/^Ligar por áudio a (.+)$/u, 'Appeler {value} en audio'],
    [/^Fazer videochamada com (.+)$/u, 'Appeler {value} en vidéo'],
    [/^Abrir conversa com (.+)$/u, 'Ouvrir la conversation avec {value}'],
    [/^Conversar com (.+)$/u, 'Écrire à {value}'],
    [/^(\d+) por ler$/u, '{value} non lu'],
    [/^(\d+) conversa$/u, '{value} conversation'],
    [/^(\d+) conversas$/u, '{value} conversations'],
  ],
  es: [
    [/^Abrir perfil de (.+)$/u, 'Abrir el perfil de {value}'],
    [/^Ligar por áudio a (.+)$/u, 'Llamar por audio a {value}'],
    [/^Fazer videochamada com (.+)$/u, 'Hacer videollamada con {value}'],
    [/^Abrir conversa com (.+)$/u, 'Abrir conversación con {value}'],
    [/^Conversar com (.+)$/u, 'Escribir a {value}'],
    [/^(\d+) por ler$/u, '{value} sin leer'],
    [/^(\d+) conversa$/u, '{value} conversación'],
    [/^(\d+) conversas$/u, '{value} conversaciones'],
  ],
};

export function translateDynamic(source) {
  if (source === undefined || source === null) return '';
  const input = String(source);
  const exact = t(input);
  if (exact !== input || language === 'pt') return exact;

  for (const [pattern, replacement] of dynamicRules[language] || []) {
    const match = input.match(pattern);
    if (!match) continue;
    return replacement.replace('{value}', match[1] ?? '');
  }
  return input;
}

export const formatDate = (value, options) => new Intl.DateTimeFormat(locale, options).format(new Date(value));
export const formatNumber = (value, options) => new Intl.NumberFormat(locale, options).format(value);

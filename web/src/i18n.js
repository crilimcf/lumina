import EN from './locales/en.js';
import FR from './locales/fr.js';
import ES from './locales/es.js';
import EN_EXTRA from './locales/en-extra.js';
import FR_EXTRA from './locales/fr-extra.js';
import ES_EXTRA from './locales/es-extra.js';
import { EN_REMAINING, FR_REMAINING, ES_REMAINING } from './locales/remaining-extra.js';

const catalogs = {
  pt:{},
  en:{ ...EN, ...EN_EXTRA, ...EN_REMAINING },
  fr:{ ...FR, ...FR_EXTRA, ...FR_REMAINING },
  es:{ ...ES, ...ES_EXTRA, ...ES_REMAINING },
};
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

const normalizeKey = value => String(value ?? '')
  .trim()
  .replace(/\s+/gu, ' ')
  .toLocaleLowerCase('pt-PT');

const normalizedCatalogs = Object.fromEntries(Object.entries(catalogs).map(([lang, catalog]) => {
  const normalized = new Map();
  for (const [key, value] of Object.entries(catalog)) {
    const indexKey = normalizeKey(key);
    if (!normalized.has(indexKey)) normalized.set(indexKey, value);
  }
  return [lang, normalized];
}));

const hasLetters = value => /\p{L}/u.test(value);
const isUpperLabel = value => {
  const text = String(value ?? '').trim();
  return hasLetters(text) && text === text.toLocaleUpperCase('pt-PT') && text !== text.toLocaleLowerCase('pt-PT');
};

function lookup(source, lang = language) {
  const key = String(source ?? '');
  const direct = catalogs[lang]?.[key];
  if (direct !== undefined) return direct;

  const normalized = normalizedCatalogs[lang]?.get(normalizeKey(key));
  if (normalized === undefined) return undefined;
  return isUpperLabel(key) ? String(normalized).toLocaleUpperCase(locales[lang] || locale) : normalized;
}

const interpolate = (value, variables = {}) => String(value).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => (
  variables[key] === undefined || variables[key] === null ? match : String(variables[key])
));

export function hasTranslation(source, lang = language) {
  return lookup(source, lang) !== undefined;
}

export function t(source, variables = {}) {
  if (source === undefined || source === null) return '';
  const key = String(source);
  const translated = lookup(key) ?? key;
  return interpolate(translated, variables);
}

const dynamicRules = {
  en: [
    [/^Abrir perfil de (.+)$/u, 'Open {1} profile'],
    [/^Ligar por áudio a (.+)$/u, 'Audio call {1}'],
    [/^Fazer videochamada com (.+)$/u, 'Video call {1}'],
    [/^Abrir conversa com (.+)$/u, 'Open conversation with {1}'],
    [/^Conversar com (.+)$/u, 'Message {1}'],
    [/^Chamada recebida de (.+)$/u, 'Incoming call from {1}'],
    [/^Videochamada com (.+)$/u, 'Video call with {1}'],
    [/^Chamada áudio com (.+)$/u, 'Audio call with {1}'],
    [/^Direto de (.+)$/u, 'Live by {1}'],
    [/^Ver direto de (.+): (.+)$/u, 'Watch {1} live: {2}'],
    [/^(\d+) por ler$/u, '{1} unread'],
    [/^(\d+) conversa$/u, '{1} conversation'],
    [/^(\d+) conversas$/u, '{1} conversations'],
    [/^Alertas, (\d+) por ler$/u, 'Alerts, {1} unread'],
    [/^Agora segues (.+)$/u, 'You now follow {1}'],
    [/^Deixaste de seguir (.+)$/u, 'You unfollowed {1}'],
    [/^(.+) bloqueado$/u, '{1} blocked'],
    [/^(.+) desbloqueado$/u, '{1} unblocked'],
    [/^Convite enviado a (.+)$/u, 'Invitation sent to {1}'],
    [/^Olá, (.+)$/u, 'Hello, {1}'],
    [/^(.+) republicou$/u, '{1} reposted'],
    [/^Responder a (.+)…$/u, 'Reply to {1}…'],
    [/^Vídeo de (.+)$/u, 'Video by {1}'],
    [/^Vídeo do momento de (.+)$/u, 'Moment video by {1}'],
    [/^Abrir na fonte\s*(.*)$/u, 'Open at source {1}'],
    [/^(\d+) seguidores$/u, '{1} followers'],
    [/^(\d+) a seguir$/u, '{1} following'],
    [/^Restam-te (\d+) códigos de emergência\.$/u, '{1} recovery codes remaining.'],
    [/^(\d+) novidade por ver$/u, '{1} new item to view'],
    [/^(\d+) novidades por ver$/u, '{1} new items to view'],
    [/^há (\d+) min$/u, '{1}m ago'],
    [/^há (\d+) h$/u, '{1}h ago'],
    [/^há (\d+) d$/u, '{1}d ago'],
    [/^(.+) quer seguir-te$/u, '{1} wants to follow you'],
    [/^(.+) aceitou o teu pedido$/u, '{1} accepted your request'],
    [/^(.+) começou a seguir-te$/u, '{1} started following you'],
    [/^(.+) publicou algo novo$/u, '{1} posted something new'],
    [/^(.+) está em direto$/u, '{1} is live'],
    [/^(.+) enviou-te uma mensagem$/u, '{1} sent you a message'],
    [/^(.+) ligou-te$/u, '{1} called you'],
    [/^(.+) fez uma videochamada$/u, '{1} video called you'],
  ],
  fr: [
    [/^Abrir perfil de (.+)$/u, 'Ouvrir le profil de {1}'],
    [/^Ligar por áudio a (.+)$/u, 'Appeler {1} en audio'],
    [/^Fazer videochamada com (.+)$/u, 'Appeler {1} en vidéo'],
    [/^Abrir conversa com (.+)$/u, 'Ouvrir la conversation avec {1}'],
    [/^Conversar com (.+)$/u, 'Écrire à {1}'],
    [/^Chamada recebida de (.+)$/u, 'Appel entrant de {1}'],
    [/^Videochamada com (.+)$/u, 'Appel vidéo avec {1}'],
    [/^Chamada áudio com (.+)$/u, 'Appel audio avec {1}'],
    [/^Direto de (.+)$/u, 'Direct de {1}'],
    [/^Ver direto de (.+): (.+)$/u, 'Voir le direct de {1} : {2}'],
    [/^(\d+) por ler$/u, '{1} non lu'],
    [/^(\d+) conversa$/u, '{1} conversation'],
    [/^(\d+) conversas$/u, '{1} conversations'],
    [/^Alertas, (\d+) por ler$/u, 'Alertes, {1} non lues'],
    [/^Agora segues (.+)$/u, 'Tu suis maintenant {1}'],
    [/^Deixaste de seguir (.+)$/u, 'Tu ne suis plus {1}'],
    [/^(.+) bloqueado$/u, '{1} a été bloqué'],
    [/^(.+) desbloqueado$/u, '{1} a été débloqué'],
    [/^Convite enviado a (.+)$/u, 'Invitation envoyée à {1}'],
    [/^Olá, (.+)$/u, 'Bonjour, {1}'],
    [/^(.+) republicou$/u, '{1} a republié'],
    [/^Responder a (.+)…$/u, 'Répondre à {1}…'],
    [/^Vídeo de (.+)$/u, 'Vidéo de {1}'],
    [/^Vídeo do momento de (.+)$/u, 'Vidéo du Moment de {1}'],
    [/^Abrir na fonte\s*(.*)$/u, 'Ouvrir sur la source {1}'],
    [/^(\d+) seguidores$/u, '{1} abonnés'],
    [/^(\d+) a seguir$/u, '{1} abonnements'],
    [/^Restam-te (\d+) códigos de emergência\.$/u, 'Il te reste {1} codes de secours.'],
    [/^(\d+) novidade por ver$/u, '{1} nouveauté à voir'],
    [/^(\d+) novidades por ver$/u, '{1} nouveautés à voir'],
    [/^há (\d+) min$/u, 'il y a {1} min'],
    [/^há (\d+) h$/u, 'il y a {1} h'],
    [/^há (\d+) d$/u, 'il y a {1} j'],
    [/^(.+) quer seguir-te$/u, '{1} veut te suivre'],
    [/^(.+) aceitou o teu pedido$/u, '{1} a accepté ta demande'],
    [/^(.+) começou a seguir-te$/u, '{1} a commencé à te suivre'],
    [/^(.+) publicou algo novo$/u, '{1} a publié quelque chose'],
    [/^(.+) está em direto$/u, '{1} est en direct'],
    [/^(.+) enviou-te uma mensagem$/u, '{1} t’a envoyé un message'],
    [/^(.+) ligou-te$/u, '{1} t’a appelé'],
    [/^(.+) fez uma videochamada$/u, '{1} t’a appelé en vidéo'],
  ],
  es: [
    [/^Abrir perfil de (.+)$/u, 'Abrir el perfil de {1}'],
    [/^Ligar por áudio a (.+)$/u, 'Llamar por audio a {1}'],
    [/^Fazer videochamada com (.+)$/u, 'Hacer videollamada con {1}'],
    [/^Abrir conversa com (.+)$/u, 'Abrir conversación con {1}'],
    [/^Conversar com (.+)$/u, 'Escribir a {1}'],
    [/^Chamada recebida de (.+)$/u, 'Llamada entrante de {1}'],
    [/^Videochamada com (.+)$/u, 'Videollamada con {1}'],
    [/^Chamada áudio com (.+)$/u, 'Llamada de audio con {1}'],
    [/^Direto de (.+)$/u, 'Directo de {1}'],
    [/^Ver direto de (.+): (.+)$/u, 'Ver directo de {1}: {2}'],
    [/^(\d+) por ler$/u, '{1} sin leer'],
    [/^(\d+) conversa$/u, '{1} conversación'],
    [/^(\d+) conversas$/u, '{1} conversaciones'],
    [/^Alertas, (\d+) por ler$/u, 'Alertas, {1} sin leer'],
    [/^Agora segues (.+)$/u, 'Ahora sigues a {1}'],
    [/^Deixaste de seguir (.+)$/u, 'Has dejado de seguir a {1}'],
    [/^(.+) bloqueado$/u, '{1} bloqueado'],
    [/^(.+) desbloqueado$/u, '{1} desbloqueado'],
    [/^Convite enviado a (.+)$/u, 'Invitación enviada a {1}'],
    [/^Olá, (.+)$/u, 'Hola, {1}'],
    [/^(.+) republicou$/u, '{1} republicó'],
    [/^Responder a (.+)…$/u, 'Responder a {1}…'],
    [/^Vídeo de (.+)$/u, 'Vídeo de {1}'],
    [/^Vídeo do momento de (.+)$/u, 'Vídeo del Momento de {1}'],
    [/^Abrir na fonte\s*(.*)$/u, 'Abrir en la fuente {1}'],
    [/^(\d+) seguidores$/u, '{1} seguidores'],
    [/^(\d+) a seguir$/u, '{1} seguidos'],
    [/^Restam-te (\d+) códigos de emergência\.$/u, 'Te quedan {1} códigos de recuperación.'],
    [/^(\d+) novidade por ver$/u, '{1} novedad por ver'],
    [/^(\d+) novidades por ver$/u, '{1} novedades por ver'],
    [/^há (\d+) min$/u, 'hace {1} min'],
    [/^há (\d+) h$/u, 'hace {1} h'],
    [/^há (\d+) d$/u, 'hace {1} d'],
    [/^(.+) quer seguir-te$/u, '{1} quiere seguirte'],
    [/^(.+) aceitou o teu pedido$/u, '{1} aceptó tu solicitud'],
    [/^(.+) começou a seguir-te$/u, '{1} empezó a seguirte'],
    [/^(.+) publicou algo novo$/u, '{1} publicó algo nuevo'],
    [/^(.+) está em direto$/u, '{1} está en directo'],
    [/^(.+) enviou-te uma mensagem$/u, '{1} te envió un mensaje'],
    [/^(.+) ligou-te$/u, '{1} te llamó'],
    [/^(.+) fez uma videochamada$/u, '{1} te hizo una videollamada'],
  ],
};

function renderDynamic(replacement, match) {
  return String(replacement)
    .replace(/\{value\}/g, match[1] ?? '')
    .replace(/\{(\d+)\}/g, (_token, index) => match[Number(index)] ?? '');
}

export function translateDynamic(source) {
  if (source === undefined || source === null) return '';
  const input = String(source);
  const exact = t(input);
  if (exact !== input || language === 'pt') return exact;

  for (const [pattern, replacement] of dynamicRules[language] || []) {
    const match = input.match(pattern);
    if (!match) continue;
    return renderDynamic(replacement, match);
  }
  return input;
}

export const formatDate = (value, options) => new Intl.DateTimeFormat(locale, options).format(new Date(value));
export const formatNumber = (value, options) => new Intl.NumberFormat(locale, options).format(value);

import { language, t as baseT, translateDynamic as baseDynamic } from './i18n.js';
import { EN_MISC, FR_MISC, ES_MISC } from './locales/misc-extra.js';
import { EN_DEVICE, FR_DEVICE, ES_DEVICE, translateDeviceDynamic } from './locales/device-extra.js';
import { EN_QUALITY, FR_QUALITY, ES_QUALITY } from './locales/quality-extra.js';
import { EN_PRODUCT_CLARITY, FR_PRODUCT_CLARITY, ES_PRODUCT_CLARITY } from './locales/product-clarity-extra.js';

const CRITICAL = {
  en:{
    'Lumina a iniciar':'Lumina is starting',
    'Face ID / biometria':'Face ID / biometrics',
    'Ativa neste dispositivo para poderes entrar sem escrever a password.':'Enable it on this device to sign in without typing your password.',
    'Este dispositivo':'This device',
    'Remover':'Remove',
    'Dispositivo removido.':'Device removed.',
    'Adicionar outro dispositivo':'Add another device',
    'Ativar Face ID / biometria':'Enable Face ID / biometrics',
    'Gerir passkeys com segurança':'Manage passkeys securely',
    'A ativar…':'Enabling…',
    'Face ID / biometria ativado neste dispositivo.':'Face ID / biometrics enabled on this device.',
    'A gestão segura de passkeys abriu no navegador. Volta à Lumina quando terminares.':'Secure passkey management opened in the browser. Return to Lumina when you are done.',
    'Não foi possível ativar neste dispositivo.':'Could not enable it on this device.',
    'Perto de mim':'Near me',
    'País':'Country',
    'Mundo':'World',
    'Notícias mesmo da tua zona':'News from your actual area',
    'Notícias do teu país':'News from your country',
    'Notícias de várias partes do mundo':'News from around the world',
    'Ainda não há notícias realmente próximas desta localização.':'There are no truly nearby news items for this location yet.',
    'Não substituímos notícias locais por notícias nacionais.':'We do not replace local news with national news.',
    'Stories':'Stories',
    'A acontecer agora':'Happening now',
    'A tua story':'Your story',
    'Adicionar story':'Add story',
    'Visto':'Seen',
  },
  fr:{
    'Lumina a iniciar':'Lumina démarre',
    'Face ID / biometria':'Face ID / biométrie',
    'Ativa neste dispositivo para poderes entrar sem escrever a password.':'Active-le sur cet appareil pour te connecter sans saisir ton mot de passe.',
    'Este dispositivo':'Cet appareil',
    'Remover':'Supprimer',
    'Dispositivo removido.':'Appareil supprimé.',
    'Adicionar outro dispositivo':'Ajouter un autre appareil',
    'Ativar Face ID / biometria':'Activer Face ID / biométrie',
    'Gerir passkeys com segurança':'Gérer les clés d’accès en toute sécurité',
    'A ativar…':'Activation…',
    'Face ID / biometria ativado neste dispositivo.':'Face ID / biométrie activé sur cet appareil.',
    'A gestão segura de passkeys abriu no navegador. Volta à Lumina quando terminares.':'La gestion sécurisée des clés d’accès s’est ouverte dans le navigateur. Reviens dans Lumina quand tu as terminé.',
    'Não foi possível ativar neste dispositivo.':'Impossible de l’activer sur cet appareil.',
    'Perto de mim':'Près de moi',
    'País':'Pays',
    'Mundo':'Monde',
    'Notícias mesmo da tua zona':'Actualités réellement proches de toi',
    'Notícias do teu país':'Actualités de ton pays',
    'Notícias de várias partes do mundo':'Actualités de plusieurs régions du monde',
    'Ainda não há notícias realmente próximas desta localização.':'Il n’y a pas encore d’actualités réellement proches de cette position.',
    'Não substituímos notícias locais por notícias nacionais.':'Nous ne remplaçons pas les actualités locales par des actualités nationales.',
    'Stories':'Stories',
    'A acontecer agora':'En ce moment',
    'A tua story':'Ta story',
    'Adicionar story':'Ajouter une story',
    'Visto':'Vu',
  },
  es:{
    'Lumina a iniciar':'Lumina se está iniciando',
    'Face ID / biometria':'Face ID / biometría',
    'Ativa neste dispositivo para poderes entrar sem escrever a password.':'Actívalo en este dispositivo para entrar sin escribir la contraseña.',
    'Este dispositivo':'Este dispositivo',
    'Remover':'Eliminar',
    'Dispositivo removido.':'Dispositivo eliminado.',
    'Adicionar outro dispositivo':'Añadir otro dispositivo',
    'Ativar Face ID / biometria':'Activar Face ID / biometría',
    'Gerir passkeys com segurança':'Gestionar passkeys de forma segura',
    'A ativar…':'Activando…',
    'Face ID / biometria ativado neste dispositivo.':'Face ID / biometría activado en este dispositivo.',
    'A gestão segura de passkeys abriu no navegador. Volta à Lumina quando terminares.':'La gestión segura de passkeys se abrió en el navegador. Vuelve a Lumina cuando termines.',
    'Não foi possível ativar neste dispositivo.':'No se pudo activar en este dispositivo.',
    'Perto de mim':'Cerca de mí',
    'País':'País',
    'Mundo':'Mundo',
    'Notícias mesmo da tua zona':'Noticias realmente cercanas',
    'Notícias do teu país':'Noticias de tu país',
    'Notícias de várias partes do mundo':'Noticias de varias partes del mundo',
    'Ainda não há notícias realmente próximas desta localização.':'Todavía no hay noticias realmente cercanas a esta ubicación.',
    'Não substituímos notícias locais por notícias nacionais.':'No sustituimos noticias locales por noticias nacionales.',
    'Stories':'Stories',
    'A acontecer agora':'Está pasando ahora',
    'A tua story':'Tu story',
    'Adicionar story':'Añadir story',
    'Visto':'Visto',
  },
};

const catalogs = {
  en:{ ...EN_MISC, ...EN_DEVICE, ...EN_QUALITY, ...EN_PRODUCT_CLARITY, ...CRITICAL.en },
  fr:{ ...FR_MISC, ...FR_DEVICE, ...FR_QUALITY, ...FR_PRODUCT_CLARITY, ...CRITICAL.fr },
  es:{ ...ES_MISC, ...ES_DEVICE, ...ES_QUALITY, ...ES_PRODUCT_CLARITY, ...CRITICAL.es },
};

const normalize = value => String(value ?? '').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('pt-PT');
const normalized = Object.fromEntries(Object.entries(catalogs).map(([lang, catalog]) => [
  lang,
  new Map(Object.entries(catalog).map(([key, value]) => [normalize(key), value])),
]));

const interpolate = (value, variables = {}) => String(value).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => (
  variables[key] === undefined || variables[key] === null ? match : String(variables[key])
));

export function t(source, variables = {}) {
  if (source === undefined || source === null) return '';
  const input = String(source);
  if (language === 'pt') return interpolate(input, variables);
  const exact = catalogs[language]?.[input] ?? normalized[language]?.get(normalize(input));
  return interpolate(exact ?? baseT(input), variables);
}

export function translateDynamic(source) {
  const input = String(source ?? '');
  if (language === 'pt') return input;
  const device = translateDeviceDynamic(input, language);
  if (device !== input) return device;
  return baseDynamic(input);
}

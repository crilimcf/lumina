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
    'Perto de mim, País e Mundo são experiências separadas. A localização vem diretamente do teu iPhone.':'Near me, Country and World are separate experiences. Your location comes directly from your iPhone.',
    'O Pulso é social. Aqui encontras notícias, eventos, promoções e tendências com origem identificada — sem misturar a tua zona com o país ou o mundo.':'Pulse stays social. Here you find news, events, promotions and trends with identified sources — without mixing your area, country or the world.',
    'Notícias mesmo da tua zona':'News from your actual area',
    'Notícias do teu país':'News from your country',
    'Notícias de várias partes do mundo':'News from around the world',
    'Ainda não há notícias realmente próximas desta localização.':'There are no truly nearby news items for this location yet.',
    'Não substituímos notícias locais por notícias nacionais.':'We do not replace local news with national news.',
    'O Radar usa a localização real do iPhone: Perto de mim, País e Mundo ficam separados.':'Radar uses the iPhone’s real location: Near me, Country and World stay separate.',
    'Abrir Radar Perto / País / Mundo':'Open Radar Near / Country / World',
    'Precisamos da localização do iPhone':'We need your iPhone location',
    'Ativa a localização para o Radar Local usar a tua posição real. Podes continuar a usar o separador Mundo sem localização.':'Enable location so Radar can use your real position. You can keep using World without location.',
    'Localização do iPhone':'iPhone location',
    'Atualizar localização':'Update location',
    'A detetar…':'Detecting…',
    'Radar Mundo':'World Radar',
    'Nada deste separador é usado para preencher o Radar Local.':'Nothing from this tab is used to fill local Radar.',
    'Notícias ficam no Radar.':'News stays in Radar.',
    'Ler na fonte':'Read at source',
    'Abrir na fonte':'Open at source',
    'Todas':'All',
    'Stories':'Stories',
    'A acontecer agora':'Happening now',
    'A tua story':'Your story',
    'Adicionar story':'Add story',
    'Visto':'Seen',
    'Segue pessoas para veres aqui as stories publicadas nas últimas 24 horas.':'Follow people to see the stories posted in the last 24 hours here.',
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
    'Perto de mim, País e Mundo são experiências separadas. A localização vem diretamente do teu iPhone.':'Près de moi, Pays et Monde sont trois espaces distincts. La position provient directement de ton iPhone.',
    'O Pulso é social. Aqui encontras notícias, eventos, promoções e tendências com origem identificada — sem misturar a tua zona com o país ou o mundo.':'Le Pouls reste social. Ici, tu trouves des actualités, événements, promotions et tendances avec une origine identifiée — sans mélanger ta zone, ton pays et le monde.',
    'Notícias mesmo da tua zona':'Actualités réellement proches de toi',
    'Notícias do teu país':'Actualités de ton pays',
    'Notícias de várias partes do mundo':'Actualités de plusieurs régions du monde',
    'Ainda não há notícias realmente próximas desta localização.':'Il n’y a pas encore d’actualités réellement proches de cette position.',
    'Não substituímos notícias locais por notícias nacionais.':'Nous ne remplaçons pas les actualités locales par des actualités nationales.',
    'O Radar usa a localização real do iPhone: Perto de mim, País e Mundo ficam separados.':'Radar utilise la position réelle de l’iPhone : Près de moi, Pays et Monde restent séparés.',
    'Abrir Radar Perto / País / Mundo':'Ouvrir Radar Près / Pays / Monde',
    'Precisamos da localização do iPhone':'Nous avons besoin de la position de l’iPhone',
    'Ativa a localização para o Radar Local usar a tua posição real. Podes continuar a usar o separador Mundo sem localização.':'Active la localisation pour que Radar utilise ta position réelle. Tu peux continuer à utiliser Monde sans localisation.',
    'Localização do iPhone':'Position de l’iPhone',
    'Atualizar localização':'Actualiser la position',
    'A detetar…':'Détection…',
    'Radar Mundo':'Radar Monde',
    'Nada deste separador é usado para preencher o Radar Local.':'Rien de cet onglet n’est utilisé pour remplir le Radar local.',
    'Notícias ficam no Radar.':'Les actualités restent dans Radar.',
    'Ler na fonte':'Lire sur la source',
    'Abrir na fonte':'Ouvrir sur la source',
    'Todas':'Toutes',
    'Stories':'Stories',
    'A acontecer agora':'En ce moment',
    'A tua story':'Ta story',
    'Adicionar story':'Ajouter une story',
    'Visto':'Vu',
    'Segue pessoas para veres aqui as stories publicadas nas últimas 24 horas.':'Suis des personnes pour voir ici les stories publiées au cours des dernières 24 heures.',
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
    'Perto de mim, País e Mundo são experiências separadas. A localização vem diretamente do teu iPhone.':'Cerca de mí, País y Mundo son experiencias separadas. La ubicación viene directamente de tu iPhone.',
    'O Pulso é social. Aqui encontras notícias, eventos, promoções e tendências com origem identificada — sem misturar a tua zona com o país ou o mundo.':'El Pulso sigue siendo social. Aquí encuentras noticias, eventos, promociones y tendencias con fuentes identificadas, sin mezclar tu zona, tu país y el mundo.',
    'Notícias mesmo da tua zona':'Noticias realmente cercanas',
    'Notícias do teu país':'Noticias de tu país',
    'Notícias de várias partes do mundo':'Noticias de varias partes del mundo',
    'Ainda não há notícias realmente próximas desta localização.':'Todavía no hay noticias realmente cercanas a esta ubicación.',
    'Não substituímos notícias locais por notícias nacionais.':'No sustituimos noticias locales por noticias nacionales.',
    'O Radar usa a localização real do iPhone: Perto de mim, País e Mundo ficam separados.':'Radar usa la ubicación real del iPhone: Cerca de mí, País y Mundo permanecen separados.',
    'Abrir Radar Perto / País / Mundo':'Abrir Radar Cerca / País / Mundo',
    'Precisamos da localização do iPhone':'Necesitamos la ubicación del iPhone',
    'Ativa a localização para o Radar Local usar a tua posição real. Podes continuar a usar o separador Mundo sem localização.':'Activa la ubicación para que Radar use tu posición real. Puedes seguir usando Mundo sin ubicación.',
    'Localização do iPhone':'Ubicación del iPhone',
    'Atualizar localização':'Actualizar ubicación',
    'A detetar…':'Detectando…',
    'Radar Mundo':'Radar Mundo',
    'Nada deste separador é usado para preencher o Radar Local.':'Nada de esta pestaña se usa para rellenar el Radar local.',
    'Notícias ficam no Radar.':'Las noticias se quedan en Radar.',
    'Ler na fonte':'Leer en la fuente',
    'Abrir na fonte':'Abrir en la fuente',
    'Todas':'Todas',
    'Stories':'Stories',
    'A acontecer agora':'Está pasando ahora',
    'A tua story':'Tu story',
    'Adicionar story':'Añadir story',
    'Visto':'Visto',
    'Segue pessoas para veres aqui as stories publicadas nas últimas 24 horas.':'Sigue a personas para ver aquí las stories publicadas en las últimas 24 horas.',
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

import { language, t as baseT, translateDynamic as baseDynamic } from './i18n.js';
import { EN_MISC, FR_MISC, ES_MISC } from './locales/misc-extra.js';
import { EN_DEVICE, FR_DEVICE, ES_DEVICE, translateDeviceDynamic } from './locales/device-extra.js';
import { EN_QUALITY, FR_QUALITY, ES_QUALITY } from './locales/quality-extra.js';
import { EN_PRODUCT_CLARITY, FR_PRODUCT_CLARITY, ES_PRODUCT_CLARITY } from './locales/product-clarity-extra.js';

const catalogs = {
  en:{ ...EN_MISC, ...EN_DEVICE, ...EN_QUALITY, ...EN_PRODUCT_CLARITY },
  fr:{ ...FR_MISC, ...FR_DEVICE, ...FR_QUALITY, ...FR_PRODUCT_CLARITY },
  es:{ ...ES_MISC, ...ES_DEVICE, ...ES_QUALITY, ...ES_PRODUCT_CLARITY },
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

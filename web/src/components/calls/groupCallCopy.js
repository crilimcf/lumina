import { locale } from '../../i18n.js';

const copy = {
  pt:{ incoming:'Videochamada de grupo recebida', ringing:'A tocar enquanto a Lumina estiver aberta' },
  fr:{ incoming:'Appel vidéo de groupe entrant', ringing:'Sonnerie tant que Lumina est ouverte' },
  en:{ incoming:'Incoming group video call', ringing:'Ringing while Lumina is open' },
  es:{ incoming:'Videollamada de grupo entrante', ringing:'Sonando mientras Lumina esté abierta' },
};

export const groupCallCopy = copy[String(locale || 'pt').slice(0,2).toLowerCase()] || copy.en;

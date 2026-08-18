const SUPPORTED = new Set(['pt', 'en', 'fr', 'es']);

export function normalizeNotificationLocale(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(',');
  for (const candidate of values) {
    const token = String(candidate || '').split(';')[0].trim().toLowerCase().replace('_', '-');
    const short = token.split('-')[0];
    if (SUPPORTED.has(short)) return short;
  }
  return 'en';
}

const copy = {
  pt: {
    someone:'Alguém', novelty:'Tens uma novidade.', message:'Enviou-te uma mensagem',
    photoOnce:'Enviou uma foto para veres uma vez', videoOnce:'Enviou um vídeo para veres uma vez',
    photo:'Enviou uma fotografia', video:'Enviou um vídeo',
    callTitle:name => `Chamada de ${name}`, videoCall:'Videochamada recebida', audioCall:'Chamada de áudio recebida',
    groupTitle:name => `${name} iniciou uma chamada`, groupBody:name => `Videochamada no grupo ${name}`,
  },
  en: {
    someone:'Someone', novelty:'You have something new.', message:'Sent you a message',
    photoOnce:'Sent you a photo to view once', videoOnce:'Sent you a video to view once',
    photo:'Sent you a photo', video:'Sent you a video',
    callTitle:name => `Call from ${name}`, videoCall:'Incoming video call', audioCall:'Incoming audio call',
    groupTitle:name => `${name} started a call`, groupBody:name => `Video call in ${name}`,
  },
  fr: {
    someone:'Quelqu’un', novelty:'Tu as une nouveauté.', message:'T’a envoyé un message',
    photoOnce:'T’a envoyé une photo à voir une seule fois', videoOnce:'T’a envoyé une vidéo à voir une seule fois',
    photo:'T’a envoyé une photo', video:'T’a envoyé une vidéo',
    callTitle:name => `Appel de ${name}`, videoCall:'Appel vidéo entrant', audioCall:'Appel audio entrant',
    groupTitle:name => `${name} a lancé un appel`, groupBody:name => `Appel vidéo dans le groupe ${name}`,
  },
  es: {
    someone:'Alguien', novelty:'Tienes una novedad.', message:'Te envió un mensaje',
    photoOnce:'Te envió una foto para ver una sola vez', videoOnce:'Te envió un vídeo para ver una sola vez',
    photo:'Te envió una foto', video:'Te envió un vídeo',
    callTitle:name => `Llamada de ${name}`, videoCall:'Videollamada entrante', audioCall:'Llamada de audio entrante',
    groupTitle:name => `${name} inició una llamada`, groupBody:name => `Videollamada en el grupo ${name}`,
  },
};

export function localizeNotification(notification, localeValue) {
  if (!notification) return notification;
  const locale = normalizeNotificationLocale(localeValue);
  if (locale === 'pt') return { ...notification };
  const strings = copy[locale];
  let title = String(notification.title || 'Lumina');
  let body = String(notification.body || 'Tens uma novidade.');

  if (title === 'Alguém') title = strings.someone;
  const directBodies = new Map([
    ['Tens uma novidade.', strings.novelty],
    ['Enviou-te uma mensagem', strings.message],
    ['Enviou uma foto para veres uma vez', strings.photoOnce],
    ['Enviou um vídeo para veres uma vez', strings.videoOnce],
    ['Enviou uma fotografia', strings.photo],
    ['Enviou uma foto', strings.photo],
    ['Enviou um vídeo', strings.video],
    ['Videochamada recebida', strings.videoCall],
    ['Chamada de áudio recebida', strings.audioCall],
  ]);
  body = directBodies.get(body) || body;

  const call = /^Chamada de (.+)$/u.exec(title);
  if (call) title = strings.callTitle(call[1]);
  const groupTitle = /^(.+) iniciou uma chamada$/u.exec(title);
  if (groupTitle) title = strings.groupTitle(groupTitle[1]);
  const groupBody = /^Videochamada no grupo (.+)$/u.exec(body);
  if (groupBody) body = strings.groupBody(groupBody[1]);

  return { ...notification, title, body };
}

export const notificationLocales = Object.freeze([...SUPPORTED]);

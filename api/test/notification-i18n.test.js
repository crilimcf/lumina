import test from 'node:test';
import assert from 'node:assert/strict';
import { localizeNotification, normalizeNotificationLocale } from '../src/lib/notification-i18n.js';

test('normaliza a língua real do dispositivo', () => {
  assert.equal(normalizeNotificationLocale('fr-FR,fr;q=0.9,en;q=0.8'), 'fr');
  assert.equal(normalizeNotificationLocale('en_US'), 'en');
  assert.equal(normalizeNotificationLocale('es-ES'), 'es');
  assert.equal(normalizeNotificationLocale('pt-PT'), 'pt');
  assert.equal(normalizeNotificationLocale('de-DE'), 'en');
});

test('foto de visualização única sai integralmente em francês', () => {
  const out = localizeNotification({
    title:'Angèle Paris',
    body:'Enviou uma foto para veres uma vez',
    tag:'lumina:message:1',
    url:'/?tab=dms',
  }, 'fr-FR');
  assert.equal(out.title, 'Angèle Paris');
  assert.equal(out.body, 'T’a envoyé une photo à voir une seule fois');
  assert.doesNotMatch(out.body, /Enviou|veres|uma foto/u);
});

test('mensagens e chamadas respeitam inglês e espanhol', () => {
  assert.equal(localizeNotification({ title:'Ana', body:'Enviou-te uma mensagem' }, 'en-US').body, 'Sent you a message');
  assert.deepEqual(
    localizeNotification({ title:'Chamada de Ana', body:'Videochamada recebida' }, 'es-ES'),
    { title:'Llamada de Ana', body:'Videollamada entrante' }
  );
});

test('chamada de grupo é localizada sem alterar nome do grupo', () => {
  const out = localizeNotification({
    title:'Carlos iniciou uma chamada',
    body:'Videochamada no grupo Família Paris',
  }, 'fr');
  assert.equal(out.title, 'Carlos a lancé un appel');
  assert.equal(out.body, 'Appel vidéo dans le groupe Família Paris');
});

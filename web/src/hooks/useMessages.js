import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

export function useMessages({ tab, palette, ping, enabled = true }) {
  const [threads, setThreads] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [thread, setThread] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [mode, setMode] = useState('normal');
  const [mediaDraft, setMediaDraft] = useState(null);
  const [mediaReady, setMediaReady] = useState(null);
  const [sending, setSending] = useState(false);
  const end = useRef(null);

  const loadThreads = useCallback(async () => {
    const next = await api.messages.threads();
    setThreads(next);
    return next;
  }, []);

  const loadContacts = useCallback(async () => {
    const [followers, following] = await Promise.all([
      api.users.followers().catch(() => []),
      api.users.following().catch(() => []),
    ]);
    const people = new Map();
    for (const person of [...following, ...followers]) {
      const previous = people.get(person.id) || {};
      people.set(person.id, { ...previous, ...person, follows_me: !!(previous.follows_me || person.follows_me), following: !!(previous.following || person.following) });
    }
    const next = [...people.values()].sort((a, b) => {
      const mutualA = a.following && a.follows_me ? 1 : 0;
      const mutualB = b.following && b.follows_me ? 1 : 0;
      return mutualB - mutualA || String(a.name || '').localeCompare(String(b.name || ''), 'pt');
    });
    setContacts(next);
    return next;
  }, []);

  useEffect(() => {
    if (!enabled || tab !== 'dms') return;
    loadThreads().catch(() => {});
    loadContacts().catch(() => {});
  }, [enabled, tab, loadThreads, loadContacts]);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const markDelivered = () => api.messages.delivered().catch(() => {});
    markDelivered();
    const timer = setInterval(() => { if (document.visibilityState === 'visible' && alive) markDelivered(); }, 3000);
    const visible = () => { if (document.visibilityState === 'visible') markDelivered(); };
    document.addEventListener('visibilitychange', visible);
    return () => { alive = false; clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [enabled]);

  const loadMessages = useCallback(async () => {
    if (!thread) return [];
    const next = await api.messages.list(thread.id);
    setMsgs(next);
    return next;
  }, [thread]);

  useEffect(() => {
    if (!thread) { setMsgs([]); return; }
    let current = true;
    const load = () => api.messages.list(thread.id).then(r => { if (current) setMsgs(r); }).catch(() => {});
    load();
    const timer = setInterval(load, 2500);
    return () => { current = false; clearInterval(timer); };
  }, [thread]);

  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }); }, [msgs]);
  useEffect(() => {
    if (mode === 'timer') { setMediaDraft(null); setMediaReady(null); }
  }, [mode]);

  const openContact = useCallback(async (person) => {
    if (!person?.id) return;
    try {
      const created = await api.messages.openThread(person.id);
      setThread({ id: created.id, name: person.name, handle: person.handle, palette: person.palette, avatar_url: person.avatar_url, other_id: person.id });
      await loadThreads().catch(() => {});
    } catch (e) { ping(e.message); }
  }, [loadThreads, ping]);

  const chooseMedia = useCallback((file) => {
    if (!file) return;
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      ping('Escolhe uma fotografia ou vídeo.');
      return;
    }
    setMediaDraft(file);
  }, [ping]);

  const acceptMedia = useCallback((file, type) => {
    setMediaReady({ file, type });
    setMediaDraft(null);
    setText('');
  }, []);

  const clearMedia = useCallback(() => { setMediaDraft(null); setMediaReady(null); }, []);

  const send = async () => {
    if (!thread || sending) return;
    const hasText = !!text.trim();
    const hasMedia = !!mediaReady?.file;
    if (mode === 'timer' && !hasText) return;
    if (mode === 'once' && !hasMedia) { ping('Escolhe uma fotografia ou vídeo para enviar uma vez.'); return; }
    if (mode === 'normal' && !hasText && !hasMedia) return;

    setSending(true);
    try {
      let payload;
      if (hasMedia) {
        const mediaUrl = await api.upload(mediaReady.file);
        payload = { kind:'media', mode: mode === 'once' ? 'once' : 'normal', mediaUrl, mediaType:mediaReady.type, palette };
      } else {
        payload = { kind:'text', mode, body:text.trim(), palette };
      }
      await api.messages.send(thread.id, payload);
      setText('');
      clearMedia();
      await loadMessages();
      await loadThreads().catch(() => {});
      if (mode === 'timer') ping('Apaga-se pouco depois de ser aberta');
      setMode('normal');
    } catch (e) { ping(e.message); }
    finally { setSending(false); }
  };

  const editMessage = useCallback(async (id, body) => {
    try { await api.messages.edit(id, body); await loadMessages(); await loadThreads().catch(() => {}); }
    catch (e) { ping(e.message); throw e; }
  }, [loadMessages, loadThreads, ping]);

  const removeMessage = useCallback(async (id) => {
    try { await api.messages.remove(id); await loadMessages(); await loadThreads().catch(() => {}); }
    catch (e) { ping(e.message); }
  }, [loadMessages, loadThreads, ping]);

  return {
    threads, setThreads, contacts, setContacts, loadThreads, loadContacts, openContact,
    thread, setThread, msgs, text, setText, mode, setMode,
    mediaDraft, setMediaDraft, mediaReady, setMediaReady, chooseMedia, acceptMedia, clearMedia,
    sending, send, editMessage, removeMessage, end,
  };
}

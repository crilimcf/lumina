import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

export function useMessages({ tab, palette, ping }) {
  const [threads, setThreads] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [thread, setThread] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [mode, setMode] = useState('normal');
  const [onceFile, setOnceFile] = useState(null);
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
    if (tab !== 'dms') return;
    loadThreads().catch(() => {});
    loadContacts().catch(() => {});
  }, [tab, loadThreads, loadContacts]);

  useEffect(() => {
    if (!thread) {
      setMsgs([]);
      return;
    }
    let current = true;
    const load = () => api.messages.list(thread.id)
      .then(r => { if (current) setMsgs(r); })
      .catch(() => {});
    load();
    const timer = setInterval(load, 5000);
    return () => { current = false; clearInterval(timer); };
  }, [thread]);

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' });
  }, [msgs]);

  useEffect(() => {
    if (mode !== 'once') setOnceFile(null);
  }, [mode]);

  const openContact = useCallback(async (person) => {
    if (!person?.id) return;
    try {
      const created = await api.messages.openThread(person.id);
      const nextThread = {
        id: created.id,
        name: person.name,
        handle: person.handle,
        palette: person.palette,
        avatar_url: person.avatar_url,
        other_id: person.id,
      };
      setThread(nextThread);
      await loadThreads().catch(() => {});
    } catch (e) {
      ping(e.message);
    }
  }, [loadThreads, ping]);

  const send = async () => {
    if (!thread || sending) return;
    if (mode !== 'once' && !text.trim()) return;
    if (mode === 'once' && !onceFile) {
      ping('Escolhe uma foto para enviar uma vez.');
      return;
    }

    setSending(true);
    try {
      let payload;
      if (mode === 'once') {
        const mediaUrl = await api.upload(onceFile);
        payload = { kind: 'media', mode: 'once', mediaUrl, palette };
      } else {
        payload = { kind: 'text', mode, body: text.trim(), palette };
      }
      await api.messages.send(thread.id, payload);
      setText('');
      setOnceFile(null);
      setMsgs(await api.messages.list(thread.id));
      await loadThreads().catch(() => {});
      if (mode === 'timer') ping('Apaga-se pouco depois de ser aberta');
      setMode('normal');
    } catch (e) {
      ping(e.message);
    } finally {
      setSending(false);
    }
  };

  return {
    threads, setThreads, contacts, setContacts, loadThreads, loadContacts, openContact,
    thread, setThread, msgs, text, setText, mode, setMode,
    onceFile, setOnceFile, sending, send, end,
  };
}

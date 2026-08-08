import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

export function useMessages({ tab, palette, ping }) {
  const [threads, setThreads] = useState([]);
  const [thread, setThread] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [mode, setMode] = useState('normal');
  const [onceFile, setOnceFile] = useState(null);
  const [sending, setSending] = useState(false);
  const end = useRef(null);

  useEffect(() => {
    if (tab !== 'dms') return;
    api.messages.threads().then(setThreads).catch(() => {});
  }, [tab]);

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
      setThreads(await api.messages.threads().catch(() => threads));
      if (mode === 'timer') ping('Apaga-se pouco depois de ser aberta');
      setMode('normal');
    } catch (e) {
      ping(e.message);
    } finally {
      setSending(false);
    }
  };

  return {
    threads, setThreads, thread, setThread, msgs, text, setText, mode, setMode,
    onceFile, setOnceFile, sending, send, end,
  };
}

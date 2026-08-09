import { useCallback, useMemo, useState } from 'react';
import { api } from '../api.js';

export function useMoments({ me, ping }) {
  const [moments, setMoments] = useState([]);
  const [viewingAuthor, setViewingAuthor] = useState(null);
  const [momentComposer, setMomentComposer] = useState(false);
  const [momentFile, setMomentFile] = useState(null);
  const [momentPalette, setMomentPalette] = useState(0);
  const [momentBusy, setMomentBusy] = useState(false);

  const loadMoments = useCallback(() => {
    api.moments.list().then(setMoments).catch(() => {});
  }, []);

  const momentGroups = useMemo(() => {
    const map = new Map();
    for (const moment of moments) {
      if (!map.has(moment.author_id)) {
        map.set(moment.author_id, {
          author: {
            id: moment.author_id,
            handle: moment.handle,
            name: moment.name,
            palette: moment.author_palette,
            avatarUrl: moment.author_avatar_url,
          },
          items: [],
        });
      }
      map.get(moment.author_id).items.push(moment);
    }

    const groups = [...map.values()];
    groups.sort((a, b) => {
      if (a.author.id === me?.id) return -1;
      if (b.author.id === me?.id) return 1;
      const aUnseen = a.items.some(item => !item.viewed);
      const bUnseen = b.items.some(item => !item.viewed);
      return aUnseen === bUnseen ? 0 : aUnseen ? -1 : 1;
    });
    return groups;
  }, [moments, me?.id]);

  const myMomentGroup = momentGroups.find(group => group.author.id === me?.id) || null;

  const publishMoment = async () => {
    if (momentBusy) return;
    setMomentBusy(true);
    try {
      let mediaUrl = null;
      if (momentFile) mediaUrl = await api.upload(momentFile);
      await api.moments.create({ mediaUrl, palette: momentPalette });
      setMomentComposer(false);
      setMomentFile(null);
      setMomentPalette(0);
      loadMoments();
      ping('Momento publicado. Fica visível 24 horas.');
    } catch (e) {
      ping(e.message);
    } finally {
      setMomentBusy(false);
    }
  };

  const viewMoment = (id) => {
    api.moments.view(id).catch(() => {});
    setMoments(current => current.map(moment =>
      moment.id === id ? { ...moment, viewed: true } : moment
    ));
  };

  const deleteMoment = async (id) => {
    try {
      await api.moments.remove(id);
      setMoments(current => {
        const remaining = current.filter(moment => moment.id !== id);
        setViewingAuthor(authorId =>
          authorId && !remaining.some(moment => moment.author_id === authorId) ? null : authorId
        );
        return remaining;
      });
      ping('Momento apagado');
    } catch (e) {
      ping(e.message);
    }
  };

  const replyToMoment = async (authorId, text) => {
    const body = String(text || '').trim();
    if (!body) return;
    try {
      const thread = await api.messages.openThread(authorId);
      await api.messages.send(thread.id, { kind: 'text', mode: 'normal', body });
      ping('Resposta enviada');
    } catch (e) {
      ping(e.message);
    }
  };

  return {
    moments,
    loadMoments,
    momentGroups,
    myMomentGroup,
    viewingAuthor,
    setViewingAuthor,
    momentComposer,
    setMomentComposer,
    momentFile,
    setMomentFile,
    momentPalette,
    setMomentPalette,
    momentBusy,
    publishMoment,
    viewMoment,
    deleteMoment,
    replyToMoment,
  };
}

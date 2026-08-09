import { useState } from 'react';
import { api } from '../api.js';

export function useComposer({ loadFeed, setComs, setDays, ping }) {
  const [comp, setComp] = useState(null);
  const [body, setBody] = useState('');
  const [palette, setPalette] = useState(0);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);

  const publish = async () => {
    if (!body.trim() || busy || !comp) return;
    setBusy(true);
    try {
      let mediaUrl = null;
      if (file) mediaUrl = await api.upload(file);
      const answeringInvite = !!comp.inviteId;

      await api.posts.create({
        communityId: comp.community,
        body: body.trim(),
        mediaUrl,
        palette,
        inviteId: comp.inviteId || null,
      });

      setBody('');
      setFile(null);
      setComp(null);

      const [, communities, answerDays] = await Promise.all([
        loadFeed(),
        api.communities.mine(),
        api.account.days(),
      ]);
      setComs(communities);
      setDays(answerDays.days || []);
      ping(answeringInvite ? 'Respondeste. Vê as outras respostas.' : 'Publicado');
    } catch (e) {
      ping(e.message);
    } finally {
      setBusy(false);
    }
  };

  return {
    comp,
    setComp,
    body,
    setBody,
    palette,
    setPalette,
    file,
    setFile,
    busy,
    publish,
  };
}

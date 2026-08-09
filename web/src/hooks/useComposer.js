import { useState } from 'react';
import { api } from '../api.js';

export function useComposer({ loadFeed, ping }) {
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

      await api.posts.create({
        body: body.trim(),
        mediaUrl,
        palette,
      });

      setBody('');
      setFile(null);
      setComp(null);
      await loadFeed();
      ping('Publicado');
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

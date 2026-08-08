import { useCallback, useState } from 'react';
import { api } from '../api.js';

export function useFeed({ me, ping }) {
  const [feed, setFeed] = useState([]);
  const [feedErr, setFeedErr] = useState(null);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [open, setOpen] = useState(null);
  const [comments, setComments] = useState({});
  const [draft, setDraft] = useState('');
  const [burst, setBurst] = useState(null);
  const [menuFor, setMenuFor] = useState(null);

  const loadFeed = useCallback(async () => {
    setLoadingFeed(true);
    setFeedErr(null);
    try {
      setFeed((await api.posts.feed()).posts);
    } catch (e) {
      setFeedErr(e);
    } finally {
      setLoadingFeed(false);
    }
  }, []);

  const react = async (post, kind) => {
    const key = kind === 'like' ? 'likes' : 'fires';
    const had = (post.my_reactions || []).includes(kind);
    setFeed(current => current.map(p => p.id === post.id ? {
      ...p,
      [key]: p[key] + (had ? -1 : 1),
      my_reactions: had
        ? p.my_reactions.filter(r => r !== kind)
        : [...(p.my_reactions || []), kind],
    } : p));
    if (!had) {
      setBurst({ id: post.id, kind, n: Date.now() });
      setTimeout(() => setBurst(null), 560);
    }
    try {
      await api.posts.react(post.id, kind);
    } catch {
      loadFeed();
      ping('Não foi possível reagir');
    }
  };

  const repost = async (post) => {
    try {
      await api.posts.repost(post.id);
      await loadFeed();
      ping('Republicado');
    } catch (e) {
      ping(e.message);
    }
  };

  const loadComments = async (id) => {
    setOpen(current => current === id ? null : id);
    setDraft('');
    if (open !== id && !comments[id]) {
      try {
        const list = await api.posts.comments(id);
        setComments(current => ({ ...current, [id]: list }));
      } catch {}
    }
  };

  const comment = async (id) => {
    if (!draft.trim()) return;
    const text = draft.trim();
    setDraft('');
    try {
      await api.posts.comment(id, text);
      setComments(current => ({
        ...current,
        [id]: [...(current[id] || []), {
          id: Math.random(), body: text, name: me.name, handle: me.handle,
          palette: me.palette, avatar_url: me.avatar_url,
        }],
      }));
      setFeed(current => current.map(p => p.id === id ? { ...p, comments: p.comments + 1 } : p));
    } catch (e) {
      ping(e.message);
      setDraft(text);
    }
  };

  return {
    feed, feedErr, loadingFeed, open, comments, draft, setDraft, burst,
    menuFor, setMenuFor, loadFeed, react, repost, loadComments, comment,
  };
}

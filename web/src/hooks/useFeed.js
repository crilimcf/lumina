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
    setLoadingFeed(true); setFeedErr(null);
    try { setFeed((await api.posts.feed()).posts); }
    catch (e) { setFeedErr(e); }
    finally { setLoadingFeed(false); }
  }, []);

  const react = async (post, kind) => {
    const key = kind === 'like' ? 'likes' : 'fires';
    const had = (post.my_reactions || []).includes(kind);
    setFeed(current => current.map(p => p.id === post.id ? {
      ...p, [key]: p[key] + (had ? -1 : 1),
      my_reactions: had ? p.my_reactions.filter(r => r !== kind) : [...(p.my_reactions || []), kind],
    } : p));
    if (!had) { setBurst({ id: post.id, kind, n: Date.now() }); setTimeout(() => setBurst(null), 560); }
    try { await api.posts.react(post.id, kind); }
    catch { loadFeed(); ping('Não foi possível reagir'); }
  };

  const repost = async (post) => {
    try { await api.posts.repost(post.id); await loadFeed(); ping('Republicado'); }
    catch (e) { ping(e.message); }
  };

  const editPost = async (post, body) => {
    try {
      const updated = await api.posts.edit(post.id, body);
      setFeed(current => current.map(p => p.id === post.id ? { ...p, ...updated } : p));
      ping('Publicação editada');
      return true;
    } catch (e) { ping(e.message); return false; }
  };

  const deletePost = async (post) => {
    const removed = new Set([post.id]);
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const candidate of feed) {
        if (candidate.repost_of && removed.has(candidate.repost_of) && !removed.has(candidate.id)) {
          removed.add(candidate.id);
          expanded = true;
        }
      }
    }

    const clearLocally = () => {
      setFeed(current => current.filter(p => !removed.has(p.id)));
      setComments(current => {
        const next = { ...current };
        for (const id of removed) delete next[id];
        return next;
      });
      if (removed.has(open)) setOpen(null);
    };

    try {
      await api.posts.remove(post.id);
      clearLocally();
      ping('Publicação apagada');
      return true;
    } catch (e) {
      // A FK de reposts usa ON DELETE CASCADE. Se a publicação original já apagou
      // este repost no servidor, um cartão antigo não deve ficar preso no cliente.
      if (e?.status === 404 || e?.code === 'not_found') {
        clearLocally();
        ping('Publicação removida');
        return true;
      }
      ping(e.message);
      return false;
    }
  };

  const loadComments = async (id) => {
    setOpen(current => current === id ? null : id);
    setDraft('');
    if (open !== id && !comments[id]) {
      try {
        const loaded = await api.posts.comments(id);
        setComments(current => ({ ...current, [id]: loaded }));
      } catch {}
    }
  };

  const comment = async (id) => {
    if (!draft.trim()) return;
    const text = draft.trim(); setDraft('');
    try {
      const created = await api.posts.comment(id, text);
      setComments(current => ({ ...current, [id]: [...(current[id] || []), {
        ...created, name: me.name, handle: me.handle, palette: me.palette, avatar_url: me.avatar_url,
      }] }));
      setFeed(current => current.map(p => p.id === id ? { ...p, comments: p.comments + 1 } : p));
    } catch (e) { ping(e.message); setDraft(text); }
  };

  const editComment = async (postId, commentId, body) => {
    try {
      const updated = await api.posts.editComment(postId, commentId, body);
      setComments(current => ({ ...current, [postId]: (current[postId] || []).map(c => c.id === commentId ? { ...c, ...updated } : c) }));
      ping('Comentário editado');
      return true;
    } catch (e) { ping(e.message); return false; }
  };

  const deleteComment = async (postId, commentId) => {
    try {
      await api.posts.removeComment(postId, commentId);
      setComments(current => ({ ...current, [postId]: (current[postId] || []).filter(c => c.id !== commentId) }));
      setFeed(current => current.map(p => p.id === postId ? { ...p, comments: Math.max(0, p.comments - 1) } : p));
      ping('Comentário apagado');
      return true;
    } catch (e) { ping(e.message); return false; }
  };

  return {
    feed, feedErr, loadingFeed, open, comments, draft, setDraft, burst, menuFor, setMenuFor,
    loadFeed, react, repost, editPost, deletePost, loadComments, comment, editComment, deleteComment,
  };
}

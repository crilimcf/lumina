import React, { useState } from 'react';
import { Edit3, Flag, MoreHorizontal, Plus, Repeat2, Search, Send, Trash2, X } from 'lucide-react';
import { api } from '../api.js';
import { Orb, Skeleton, ErrorNote, Empty } from '../ui.jsx';
import { Nav, Toast, TopActions } from '../components/AppChrome.jsx';
import { MomentComposer, MomentRing } from '../components/Moments.jsx';
import { MomentViewer } from '../components/MomentViewer.jsx';
import { LiveNow } from '../components/live/LiveNow.jsx';
import '../facelift.css';
import '../mediaOrientation.css';

function EditPostSheet({ post, onClose, onSave }) {
  const [body, setBody] = useState(post.body || '');
  const [busy, setBusy] = useState(false);
  return <div className="edit-post-backdrop" onClick={() => !busy && onClose()} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(15,9,40,.54)', backdropFilter: 'blur(7px)', display: 'flex', alignItems: 'flex-end' }}>
    <div onClick={e => e.stopPropagation()} className="in edit-post-sheet" style={{ width: '100%', maxWidth: 560, margin: '0 auto', background: '#F5F3FF', borderRadius: '28px 28px 0 0', padding: '20px 18px calc(22px + env(safe-area-inset-bottom))' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 13 }}><div className="d" style={{ fontSize: 26, flex: 1 }}>Editar publicação</div><button className="p edit-post-close" onClick={onClose} aria-label="Fechar edição"><X size={16} /></button></div>
      <textarea autoFocus rows={5} maxLength={2000} value={body} onChange={e => setBody(e.target.value)} style={{ width: '100%', resize: 'none', marginBottom: 8 }} />
      <div className="m" style={{ textAlign: 'right', marginBottom: 12 }}>{body.length}/2000</div>
      <button className="p p-brand" disabled={busy || !body.trim()} onClick={async () => { setBusy(true); const ok = await onSave(body.trim()); setBusy(false); if (ok) onClose(); }} style={{ width: '100%', justifyContent: 'center', padding: 13 }}>{busy ? 'A guardar…' : 'Guardar edição'}</button>
    </div>
  </div>;
}

function CommentRow({ comment, post, me, editComment, deleteComment }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(comment.body);
  const own = comment.author_id === me.id;
  const canDelete = own || post.author_id === me.id;
  return <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
    <Orb p={comment.palette} avatarUrl={comment.avatar_url} s={26} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}><div style={{ fontSize: 13, fontWeight: 650, color:'#F5F5FB' }}>{comment.name}</div>{comment.edited_at && <span className="m" style={{ fontSize: 9 }}>editado</span>}</div>
      {editing ? <div style={{ display: 'flex', gap: 7, marginTop: 6 }}><input value={value} maxLength={1000} onChange={e => setValue(e.target.value)} /><button className="p p-sm p-ink" onClick={async () => { if (await editComment(post.id, comment.id, value.trim())) setEditing(false); }}>Guardar</button></div> : <div style={{ fontSize: 15, lineHeight: 1.4, marginTop: 2, color: '#C8CCDC' }}>{comment.body}</div>}
    </div>
    {canDelete && <div style={{ display: 'flex', gap: 1 }}>{own && <button onClick={() => setEditing(v => !v)} aria-label="Editar comentário" style={{ border: 0, background: 'none', color: '#8E94AD', padding: 4 }}><Edit3 size={13} /></button>}<button onClick={() => deleteComment(post.id, comment.id)} aria-label="Apagar comentário" style={{ border: 0, background: 'none', color: '#FF7B86', padding: 4 }}><Trash2 size={13} /></button></div>}
  </div>;
}

export function Feed({
  me, tab, setTab, setScreen,
  feed, feedErr, loadingFeed, loadFeed, comments, open, draft, setDraft,
  react, repost, editPost, deletePost, loadComments, comment, editComment, deleteComment,
  burst, menuFor, setMenuFor, report, setComp,
  threads, setThread, ping, toast, unreadCount,
  momentGroups, myMomentGroup, viewingAuthor, setViewingAuthor,
  viewMoment, deleteMoment, replyToMoment, reactMoment,
  momentComposer, setMomentComposer, momentFile, setMomentFile,
  momentPalette, setMomentPalette, momentBusy, publishMoment,
  onOpenLive,
}) {
  const [editingPost, setEditingPost] = useState(null);

  return (
    <div className="lumina-facelift lumina-feed" style={{ minHeight: '100dvh', paddingBottom: 104 }}>
      <header className="lumina-feed-header">
        <div className="lumina-feed-bar">
          <div className="lumina-brand-lockup" aria-label="Lumina">
            <span className="lumina-brand-spark" aria-hidden="true" />
            <div style={{minWidth:0}}><div className="lumina-brand-title">Lumina</div><div className="lumina-brand-subtitle">Sua luz, suas conexões</div></div>
          </div>
          <button className="p lumina-search-button" onClick={() => setScreen('amigos')} aria-label="Pesquisar pessoas"><Search size={17} /></button>
          <TopActions tab={tab} setTab={setTab} setThread={setThread} unreadCount={unreadCount} />
        </div>
      </header>

      <section className="lumina-moments-wrap" aria-label="Momentos">
        <div className="lumina-section-heading"><strong>Momentos</strong><span>Histórias de quem faz parte da tua luz</span></div>
        <div className="ns lumina-moments">
          <button className="lumina-moment-button" onClick={() => myMomentGroup ? setViewingAuthor(me.id) : setMomentComposer(true)}>
            <div style={{ position: 'relative' }}><MomentRing palette={me.palette} avatarUrl={me.avatar_url} allSeen size={52} />{!myMomentGroup && <span className="lumina-moment-plus"><Plus size={11} strokeWidth={3} /></span>}</div>
            <span className="lumina-moment-name">Tu</span>
          </button>
          {momentGroups.filter(g => g.author.id !== me.id).map(g => <button key={g.author.id} className="lumina-moment-button" onClick={() => setViewingAuthor(g.author.id)}><MomentRing palette={g.author.palette} avatarUrl={g.author.avatarUrl} allSeen={g.items.every(i => i.viewed)} size={52} /><span className="lumina-moment-name">{g.author.name.split(' ')[0]}</span></button>)}
        </div>
      </section>

      <main className="lumina-feed-content">
        <LiveNow onOpen={onOpenLive} />
        <ErrorNote error={feedErr} onRetry={loadFeed} />
        {loadingFeed ? <div className="lumina-feed-list">{[0,1].map(i => <div key={i} className="lumina-post" style={{ padding: '13px 0' }}><div style={{ display: 'flex', gap: 11, padding: '0 14px 13px', alignItems: 'center' }}><Skeleton w={38} h={38} r={99} /><div style={{ flex: 1 }}><Skeleton w="45%" h={13} /></div></div><Skeleton w="calc(100% - 16px)" h={280} r={19} /><div style={{ padding: '14px' }}><Skeleton w="70%" h={13} /></div></div>)}</div> : feed.length === 0 ? <div className="lumina-feed-empty"><Empty>O teu Feed está vazio.<br />Segue pessoas ou publica algo novo.</Empty></div> : (
          <div className="lumina-feed-list">
            {feed.map((p, i) => {
              const mine = p.my_reactions || [];
              const cs = comments[p.id] || [];
              const isVideo = p.media_mime?.startsWith('video/') || /\.(mp4|mov|webm)(?:$|\?)/i.test(p.media_url || '');
              const own = p.author_id === me.id;
              return <article key={p.id} className="lumina-post in" style={{ animationDelay: `${Math.min(i,6)*60}ms` }}>
                {p.repost_of && <div className="lumina-post-repost"><Repeat2 size={14} /><span className="m">{own ? 'Republicaste' : `${p.name} republicou`}</span></div>}
                <div className="lumina-post-head">
                  <Orb p={p.author_palette} avatarUrl={p.author_avatar_url} s={38} />
                  <div style={{ flex: 1, minWidth: 0 }}><div className="lumina-post-name">{p.name}</div><div className="m lumina-post-meta">@{p.handle} · {new Date(p.created_at).toLocaleDateString('pt-PT', { day:'numeric', month:'short' })}{p.edited_at ? ' · editado' : ''}</div></div>
                  <div style={{ position: 'relative' }}>
                    <button className="lumina-post-menu-button" onClick={() => setMenuFor(menuFor === p.id ? null : p.id)} aria-label="Mais opções"><MoreHorizontal size={19} /></button>
                    {menuFor === p.id && <div className="card in lumina-post-menu" style={{ position: 'absolute', top: '100%', right: 0, zIndex: 30, minWidth: 164, padding: 6, display: 'grid' }}>
                      {own ? <><button className="act" style={{ padding:'9px 10px', justifyContent:'flex-start' }} onClick={() => { setMenuFor(null); setEditingPost(p); }}><Edit3 size={14} /> Editar</button><button className="act" style={{ padding:'9px 10px', justifyContent:'flex-start', color:'var(--lumina-coral)' }} onClick={() => { setMenuFor(null); deletePost(p); }}><Trash2 size={14} /> Apagar</button></> : <><button className="act" style={{ padding:'9px 10px', justifyContent:'flex-start' }} onClick={() => { setMenuFor(null); report('post', p.id); }}><Flag size={14} /> Denunciar</button><button className="act" style={{ padding:'9px 10px', justifyContent:'flex-start', color:'var(--lumina-coral)' }} onClick={() => { setMenuFor(null); api.users.block(p.author_id).then(() => { loadFeed(); ping(`${p.name} bloqueado`); }).catch(e => ping(e.message)); }}>Bloquear {p.name}</button></>}
                    </div>}
                  </div>
                </div>
                {p.media_url && <div className="lumina-post-media-wrap">{isVideo ? <video className="lumina-post-media lumina-adaptive-video" src={p.media_url} controls playsInline preload="metadata" aria-label={`Vídeo de ${p.name}`} /> : <img className="lumina-post-media" src={p.media_url} alt="" loading="lazy" />}</div>}
                <div className="lumina-post-actions">
                  <button className={`act${mine.includes('like')?'':' act-off'}`} onClick={() => react(p,'like')}><span className="em" style={{ filter:mine.includes('like')?'none':'grayscale(1) opacity(.55)' }}>👍</span>{p.likes}</button>
                  <button className={`act${mine.includes('fire')?'':' act-off'}`} onClick={() => react(p,'fire')}><span className="em" style={{ filter:mine.includes('fire')?'none':'grayscale(1) opacity(.55)' }}>🔥</span>{p.fires}</button>
                  <button className="act act-off" onClick={() => repost(p)} aria-label="Republicar"><Repeat2 size={20} />{p.reposts}</button>
                  <button className="act act-off" onClick={() => loadComments(p.id)}><span className="em" style={{ filter:'grayscale(1) opacity(.55)' }}>💬</span>{p.comments}</button>
                  {burst?.id === p.id && <span key={burst.n} className="pop" style={{ top:2, left:burst.kind==='like'?4:74, fontSize:26 }}>{burst.kind==='like'?'👍':'🔥'}</span>}
                </div>
                <p className="lumina-post-copy"><b>{p.name}</b> {p.body}</p>
                {open === p.id && <div className="in lumina-comments"><div className="lumina-comments-inner">
                  {cs.length===0 && <div className="m" style={{ marginBottom:14 }}>Sem comentários. Escreve o primeiro.</div>}
                  <div style={{ display:'grid', gap:13, marginBottom:15 }}>{cs.map(c => <CommentRow key={c.id} comment={c} post={p} me={me} editComment={editComment} deleteComment={deleteComment} />)}</div>
                  <div style={{ display:'flex', gap:9 }}><input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key==='Enter' && comment(p.id)} placeholder="Escrever um comentário" /><button className="p p-ink" onClick={() => comment(p.id)} disabled={!draft.trim()} style={{ padding:'12px 15px' }}><Send size={16} /></button></div>
                </div></div>}
              </article>;
            })}
          </div>
        )}
      </main>

      <Nav tab={tab} setTab={setTab} setThread={setThread} setComp={setComp} threads={threads} />
      <Toast text={toast} />
      {editingPost && <EditPostSheet post={editingPost} onClose={() => setEditingPost(null)} onSave={body => editPost(editingPost, body)} />}
      {viewingAuthor && (() => { const group = momentGroups.find(g => g.author.id === viewingAuthor); if (!group) return null; const idx=momentGroups.indexOf(group); return <MomentViewer group={group} meId={me.id} onView={viewMoment} onDelete={deleteMoment} onReply={replyToMoment} onReact={reactMoment} onClose={() => setViewingAuthor(null)} onNext={() => setViewingAuthor(momentGroups[idx+1]?.author.id || null)} onPrev={() => setViewingAuthor(momentGroups[idx-1]?.author.id || null)} />; })()}
      {momentComposer && <MomentComposer file={momentFile} setFile={setMomentFile} palette={momentPalette} setPalette={setMomentPalette} busy={momentBusy} onClose={() => { setMomentComposer(false); setMomentFile(null); setMomentPalette(0); }} onPublish={publishMoment} />}
    </div>
  );
}

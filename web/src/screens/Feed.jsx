import React from 'react';
import { ArrowUpRight, Flag, Plus, Repeat2, Search, Send, Sparkles } from 'lucide-react';
import { api } from '../api.js';
import { PAL, Orb, Skeleton, ErrorNote, Empty } from '../ui.jsx';
import { Composer, Nav, Toast } from '../components/AppChrome.jsx';
import { MomentComposer, MomentRing, MomentViewer } from '../components/Moments.jsx';

export function Feed({
  me, coms, tab, setTab, setScreen,
  feed, feedErr, loadingFeed, loadFeed, comments, open, draft, setDraft,
  react, repost, loadComments, comment, burst, menuFor, setMenuFor, report,
  comp, setComp, file, setFile, palette, setPalette, body, setBody, busy, publish,
  threads, setThread, ping, toast,
  momentGroups, myMomentGroup, viewingAuthor, setViewingAuthor,
  viewMoment, deleteMoment, replyToMoment,
  momentComposer, setMomentComposer, momentFile, setMomentFile,
  momentPalette, setMomentPalette, momentBusy, publishMoment,
}) {
  const main = coms.find(c => c.invite_id && !c.answered);

  return (
    <div style={{ minHeight: '100dvh', paddingBottom: 96 }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 40, background: 'rgba(239,237,251,.9)', backdropFilter: 'blur(14px)' }}>
        <div style={{ padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <h1 className="d" style={{ fontSize: 25, flex: 1 }}>Lumi<span className="it">na</span></h1>
          <button className="p" onClick={() => setScreen('amigos')} aria-label="Amigos" style={{ padding: 10 }}><Search size={16} /></button>
        </div>
      </header>

      <div className="ns" style={{ display: 'flex', gap: 16, overflowX: 'auto', padding: '4px 16px 16px' }}>
        <button onClick={() => myMomentGroup ? setViewingAuthor(me.id) : setMomentComposer(true)}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, background: 'none', border: 0, cursor: 'pointer', flexShrink: 0 }}>
          <div style={{ position: 'relative' }}>
            <MomentRing palette={me.palette} avatarUrl={me.avatar_url} allSeen size={52} />
            {!myMomentGroup && (
              <span style={{ position: 'absolute', bottom: -1, right: -1, width: 19, height: 19, borderRadius: 99, background: 'var(--cobalt)', color: '#fff', display: 'grid', placeItems: 'center', boxShadow: '0 0 0 2px var(--paper)' }}>
                <Plus size={11} strokeWidth={3} />
              </span>
            )}
          </div>
          <span className="m">Tu</span>
        </button>
        {momentGroups.filter(g => g.author.id !== me.id).map(g => (
          <button key={g.author.id} onClick={() => setViewingAuthor(g.author.id)}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, background: 'none', border: 0, cursor: 'pointer', flexShrink: 0, maxWidth: 60 }}>
            <MomentRing palette={g.author.palette} avatarUrl={g.author.avatarUrl} allSeen={g.items.every(i => i.viewed)} size={52} />
            <span className="m" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 58 }}>{g.author.name.split(' ')[0]}</span>
          </button>
        ))}
      </div>

      {main && (
        <button onClick={() => setTab('invites')} className="sect"
          style={{ width: '100%', border: 0, textAlign: 'left', cursor: 'pointer', padding: '18px 16px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
              <Sparkles size={14} color="var(--coral)" />
              <span className="m" style={{ color: 'var(--coral)' }}>Convite de hoje · {main.name}</span>
            </div>
            <div className="d" style={{ fontSize: 25, marginBottom: 6, lineHeight: .98 }}>{main.invite_text}</div>
            <div className="m">Responde para ver as outras</div>
          </div>
          <span style={{ width: 10, height: 10, borderRadius: 9, background: 'var(--coral)', flexShrink: 0 }} />
          <ArrowUpRight size={20} color="#ADA6CC" />
        </button>
      )}

      <div style={{ padding: '0 16px' }}><ErrorNote error={feedErr} onRetry={loadFeed} /></div>

      {loadingFeed ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {[0, 1].map(i => (
            <div key={i} className="sect" style={{ padding: '13px 0' }}>
              <div style={{ display: 'flex', gap: 11, padding: '0 16px 13px', alignItems: 'center' }}>
                <Skeleton w={38} h={38} r={99} /><div style={{ flex: 1 }}><Skeleton w="45%" h={13} /></div>
              </div>
              <Skeleton w="100%" h={280} r={0} />
              <div style={{ padding: '14px 16px' }}><Skeleton w="70%" h={13} /></div>
            </div>
          ))}
        </div>
      ) : feed.length === 0 ? (
        <Empty>
          O teu feed está vazio.<br />
          Responde ao convite de hoje ou junta-te a mais comunidades.
        </Empty>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {feed.map((p, i) => {
            const mine = p.my_reactions || [];
            const cs = comments[p.id] || [];
            return (
              <article key={p.id} className="sect in" style={{ animationDelay: `${Math.min(i, 6) * 60}ms` }}>
                {p.repost_of && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 16px 0', color: 'var(--grey)' }}>
                    <Repeat2 size={14} /><span className="m">{p.author_id === me.id ? 'Republicaste' : `${p.name} republicou`}</span>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '13px 16px' }}>
                  <Orb p={p.author_palette} avatarUrl={p.author_avatar_url} s={38} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-.02em' }}>{p.name}</div>
                    <div className="m" style={{ marginTop: 2 }}>
                      {p.community_name} · {new Date(p.created_at).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })}
                    </div>
                  </div>
                  {p.author_id !== me.id && (
                    <div style={{ position: 'relative' }}>
                      <button onClick={() => setMenuFor(menuFor === p.id ? null : p.id)}
                        aria-label="Mais opções" style={{ background: 'none', border: 0, cursor: 'pointer', color: '#C4BEDC', padding: 6 }}>
                        <Flag size={15} />
                      </button>
                      {menuFor === p.id && (
                        <div className="card in" style={{ position: 'absolute', top: '100%', right: 0, zIndex: 30, minWidth: 150, padding: 6, display: 'grid' }}>
                          <button className="act" style={{ padding: '9px 10px', justifyContent: 'flex-start' }}
                            onClick={() => { setMenuFor(null); report('post', p.id); }}>Denunciar</button>
                          <button className="act" style={{ padding: '9px 10px', justifyContent: 'flex-start', color: 'var(--coral)' }}
                            onClick={() => {
                              setMenuFor(null);
                              api.users.block(p.author_id)
                                .then(() => { loadFeed(); ping(`${p.name} bloqueado`); })
                                .catch(e => ping(e.message));
                            }}>Bloquear {p.name}</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {p.media_url ? (
                  <img src={p.media_url} alt="" loading="lazy"
                    style={{ width: '100%', aspectRatio: '4/5', objectFit: 'cover', display: 'block' }} />
                ) : (
                  <div className="block" style={{ width: '100%', aspectRatio: '4 / 5', background: PAL[p.palette % 5].bg }}>
                    <div className="gloss" />
                    <Orb p={p.palette} s={76} cls="float" st={{ position: 'absolute', bottom: 26, left: 22 }} />
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '13px 16px 4px', position: 'relative' }}>
                  <button className={`act${mine.includes('like') ? '' : ' act-off'}`} onClick={() => react(p, 'like')}>
                    <span className="em" style={{ filter: mine.includes('like') ? 'none' : 'grayscale(1) opacity(.55)' }}>👍</span>{p.likes}
                  </button>
                  <button className={`act${mine.includes('fire') ? '' : ' act-off'}`} onClick={() => react(p, 'fire')}>
                    <span className="em" style={{ filter: mine.includes('fire') ? 'none' : 'grayscale(1) opacity(.55)' }}>🔥</span>{p.fires}
                  </button>
                  <button className="act act-off" onClick={() => repost(p)} aria-label="Republicar"><Repeat2 size={20} />{p.reposts}</button>
                  <button className="act act-off" onClick={() => loadComments(p.id)}>
                    <span className="em" style={{ filter: 'grayscale(1) opacity(.55)' }}>💬</span>{p.comments}
                  </button>
                  {burst?.id === p.id && (
                    <span key={burst.n} className="pop" style={{ top: 2, left: burst.kind === 'like' ? 4 : 74, fontSize: 26 }}>
                      {burst.kind === 'like' ? '👍' : '🔥'}
                    </span>
                  )}
                </div>

                <p style={{ fontSize: 16, lineHeight: 1.4, letterSpacing: '-.015em', margin: '6px 16px 16px' }}>
                  <b style={{ fontWeight: 600 }}>{p.handle}</b> {p.body}
                </p>

                {open === p.id && (
                  <div className="in" style={{ padding: '0 16px 18px' }}>
                    <div style={{ borderTop: '1px solid #EAE6F8', paddingTop: 15 }}>
                      {cs.length === 0 && <div className="m" style={{ marginBottom: 14 }}>Sem comentários. Escreve o primeiro.</div>}
                      <div style={{ display: 'grid', gap: 13, marginBottom: 15 }}>
                        {cs.map(c => (
                          <div key={c.id} style={{ display: 'flex', gap: 11 }}>
                            <Orb p={c.palette} avatarUrl={c.avatar_url} s={26} />
                            <div><div style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</div>
                              <div style={{ fontSize: 15, lineHeight: 1.4, marginTop: 2, color: '#332E4E' }}>{c.body}</div></div>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 9 }}>
                        <input value={draft} onChange={e => setDraft(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && comment(p.id)} placeholder="Escrever um comentário" />
                        <button className="p p-ink" onClick={() => comment(p.id)} disabled={!draft.trim()} style={{ padding: '12px 15px' }}>
                          <Send size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <Composer comp={comp} setComp={setComp} coms={coms} file={file} setFile={setFile}
        palette={palette} setPalette={setPalette} body={body} setBody={setBody} busy={busy} publish={publish} />
      <Nav tab={tab} setTab={setTab} setThread={setThread} setComp={setComp} coms={coms} threads={threads} ping={ping} />
      <Toast text={toast} />

      {viewingAuthor && (() => {
        const group = momentGroups.find(g => g.author.id === viewingAuthor);
        if (!group) return null;
        const idx = momentGroups.indexOf(group);
        return (
          <MomentViewer group={group} meId={me.id}
            onView={viewMoment}
            onDelete={deleteMoment}
            onReply={replyToMoment}
            onClose={() => setViewingAuthor(null)}
            onNext={() => setViewingAuthor(momentGroups[idx + 1]?.author.id || null)}
            onPrev={() => setViewingAuthor(momentGroups[idx - 1]?.author.id || null)}
          />
        );
      })()}

      {momentComposer && (
        <MomentComposer
          file={momentFile} setFile={setMomentFile}
          palette={momentPalette} setPalette={setMomentPalette}
          busy={momentBusy}
          onClose={() => { setMomentComposer(false); setMomentFile(null); setMomentPalette(0); }}
          onPublish={publishMoment}
        />
      )}
    </div>
  );
}

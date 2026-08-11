import React, { useEffect, useState } from 'react';
import { ArrowLeft, Lock, MessageCircle, UserMinus, UserPlus } from 'lucide-react';
import { api } from '../api.js';
import { Empty, Orb, Skeleton } from '../ui.jsx';

function PostMedia({ post }) {
  if (!post.media_url) return null;
  const video = String(post.media_mime || '').startsWith('video/');
  if (video) return <video src={post.media_url} controls playsInline preload="metadata" style={{ width:'100%',maxHeight:520,objectFit:'cover',display:'block',background:'#111' }}/>;
  return <img src={post.media_url} alt="" loading="lazy" style={{ width:'100%',maxHeight:560,objectFit:'cover',display:'block',background:'#DDD8F2' }}/>;
}

export function PublicProfile({ handle, onBack, onMessage, ping }) {
  const [person, setPerson] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const profile = await api.users.get(handle);
      setPerson(profile);
      if (profile.can_view_posts) {
        const data = await api.users.posts(handle);
        setPosts(data.posts || []);
      } else setPosts([]);
    } catch (e) {
      ping(e.message);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [handle]);

  const toggleFollow = async () => {
    if (!person || busy) return;
    setBusy(true);
    try {
      const result = person.following || person.requested
        ? await api.users.unfollow(person.id)
        : await api.users.followAction(person.id);
      setPerson(p => ({ ...p, following: !!result.following, requested: !!result.pending, followers: Math.max(0, Number(p.followers || 0) + (result.following ? 1 : (p.following ? -1 : 0)) ) }));
      ping(result.pending ? 'Pedido enviado' : result.following ? `Agora segues ${person.name}` : `Deixaste de seguir ${person.name}`);
      if (result.following && person.is_private) await load();
    } catch (e) { ping(e.message); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="lumina-public-profile public-profile-loading" style={{minHeight:'100dvh',background:'linear-gradient(180deg,#EFEDFB,#E8E5F7)',padding:20}}><div style={{maxWidth:620,margin:'0 auto'}}><Skeleton h={220}/></div></div>;
  if (!person) return <div className="lumina-public-profile public-profile-unavailable" style={{minHeight:'100dvh',display:'grid',placeItems:'center'}}><Empty>Perfil indisponível.</Empty></div>;

  return <div className="lumina-facelift lumina-public-profile" style={{minHeight:'100dvh',background:'linear-gradient(180deg,#EFEDFB,#E8E5F7)',paddingBottom:34}}>
    <main className="public-profile-shell" style={{maxWidth:620,margin:'0 auto',padding:'18px 16px 32px'}}>
      <button className="p public-profile-back" onClick={onBack} aria-label="Voltar" style={{padding:10,marginBottom:14}}><ArrowLeft size={16}/></button>

      <section className="card public-profile-hero" style={{padding:20}}>
        <div className="public-profile-identity" style={{display:'flex',gap:14,alignItems:'center'}}>
          <Orb p={person.palette} avatarUrl={person.avatar_url} s={82}/>
          <div style={{flex:1,minWidth:0}}><div className="d public-profile-name" style={{fontSize:30,lineHeight:1}}>{person.name}</div><div className="m public-profile-handle" style={{marginTop:6}}>@{person.handle}</div></div>
        </div>
        {person.bio && <p className="public-profile-bio" style={{margin:'16px 0 0',lineHeight:1.5}}>{person.bio}</p>}
        {person.stars?.length>0 && <div className="public-profile-stars" style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:13}}>{person.stars.map(star=><span key={star} className="p p-sm" style={{pointerEvents:'none'}}>{star}</span>)}</div>}
        <div className="public-profile-stats" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:16}}>
          <div className="p" style={{justifyContent:'center',pointerEvents:'none'}}><b>{person.followers || 0}</b>&nbsp;seguidores</div>
          <div className="p" style={{justifyContent:'center',pointerEvents:'none'}}><b>{person.following_count || 0}</b>&nbsp;a seguir</div>
        </div>
        <div className="public-profile-actions" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:9}}>
          <button className={person.following || person.requested ? 'p' : 'p p-brand'} onClick={toggleFollow} disabled={busy} style={{justifyContent:'center'}}>
            {person.following ? <><UserMinus size={15}/>A seguir</> : person.requested ? <><UserPlus size={15}/>Pendente</> : <><UserPlus size={15}/>Seguir</>}
          </button>
          <button className="p p-ink" onClick={()=>onMessage?.(person)} style={{justifyContent:'center'}}><MessageCircle size={15}/>Mensagem</button>
        </div>
      </section>

      <div className="m public-profile-section-label" style={{margin:'22px 4px 10px'}}>PUBLICAÇÕES</div>
      {!person.can_view_posts ? <section className="card public-profile-private" style={{padding:28,textAlign:'center'}}><Lock size={24} style={{marginBottom:9}}/><div style={{fontWeight:800}}>Perfil privado</div><div className="m" style={{marginTop:5}}>Segue esta pessoa para veres as publicações.</div></section>
        : posts.length===0 ? <Empty>Ainda não há publicações.</Empty>
        : <div className="public-profile-posts" style={{display:'grid',gap:13}}>{posts.map(post=><article key={post.id} className="card public-profile-post" style={{overflow:'hidden',padding:0}}>
            <PostMedia post={post}/>
            <div className="public-profile-post-copy" style={{padding:15}}>{post.body && <div style={{fontSize:14.5,lineHeight:1.5,whiteSpace:'pre-wrap'}}>{post.body}</div>}<div className="m" style={{marginTop:10}}>♥ {post.likes || 0} · 🔥 {post.fires || 0} · {post.comments || 0} comentários</div></div>
          </article>)}</div>}
    </main>
  </div>;
}

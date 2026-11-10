import React, { useEffect, useState } from 'react';
import { ArrowLeft, Lock, MessageCircle, UserMinus, UserPlus } from 'lucide-react';
import { api } from '../api.js';
import { isNativeApp } from '../native/session.js';
import { Empty, Orb, Skeleton } from '../ui.jsx';
import '../mediaOrientation.css';

function PostMedia({ post }) {
  if (!post.media_url) return null;
  const video = String(post.media_mime || '').startsWith('video/');
  if (video) return <video className="public-profile-adaptive-video" src={post.media_url} controls playsInline preload="metadata"/>;
  return <img src={post.media_url} alt="" loading="lazy" decoding="async" style={{ width:'100%',maxHeight:560,objectFit:'cover',display:'block',background:'#DDD8F2' }}/>;
}

export function PublicProfile({ handle, onBack, onMessage, ping }) {
  const [person, setPerson] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [paidPlans, setPaidPlans] = useState([]);
  const [memberContent, setMemberContent] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const profile = await api.users.get(handle);
      setPerson(profile);
      // Monetization is web-only until native store billing approval.
      if (!isNativeApp && profile.can_view_posts && profile.id) {
        const [plans, billing] = await Promise.all([
          api.creators.plans(profile.id).catch(() => ({plans:[]})),
          api.creators.billingStatus().catch(() => ({enabled:false})),
        ]);
        setPaidPlans(billing.enabled ? plans.plans || [] : []);
      } else setPaidPlans([]);
      if (profile.can_view_posts) {
        const [data, exclusive] = await Promise.all([
          api.users.posts(handle),
          // The API enforces creator ownership, active paid membership and block checks.
          // This response is never used as a proof of entitlement on the client.
          api.creators.content(profile.id).catch(() => ({content:[]})),
        ]);
        setPosts(data.posts || []);
        setMemberContent(exclusive.content || []);
      } else {
        setPosts([]);
        setMemberContent([]);
      }
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

  const subscribe = async (planId) => {
    if (!person || busy || isNativeApp) return;
    setBusy(true);
    try {
      const result = await api.creators.subscribeCheckout(person.id,planId);
      const redirect = new URL(result.checkoutUrl);
      if (redirect.protocol !== 'https:' || redirect.hostname !== 'checkout.stripe.com') {
        throw new Error('Ligação de pagamento inválida');
      }
      window.location.assign(result.checkoutUrl);
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

      {paidPlans.length > 0 && <section className="card" style={{background:'#141c2b',color:'#f4f8ff',padding:20,marginTop:18,borderRadius:22}}>
        <h2 style={{fontSize:22,marginBottom:6}}>Comunidade <span style={{color:'#31dacb'}}>Creators</span></h2>
        <p style={{color:'#c0d1de',fontSize:13,marginBottom:16}}>Conteúdo exclusivo para membros. Preços recorrentes e renovação automática indicados antes de pagar.</p>
        {paidPlans.map(plan=><div key={plan.id} style={{borderTop:'1px solid #ffffff24',padding:'14px 0',display:'flex',alignItems:'center',gap:12,justifyContent:'space-between'}}>
          <div style={{minWidth:0}}><strong>{plan.title}</strong><div style={{color:'#a9bcd4',fontSize:13}}>{(plan.price_cents/100).toFixed(2)} €/{plan.billing_period==='month'?'mês':'ano'}</div></div>
          <button type="button" disabled={busy} onClick={()=>void subscribe(plan.id)} style={{border:0,borderRadius:12,padding:'10px 14px',background:'#31dacb',color:'#09232e',fontWeight:800}}>Subscrever</button>
        </div>)}
        <p style={{color:'#b6c6da',fontSize:12,marginTop:8}}>Consulta os <a href="/termos.html" style={{color:'#85e5dc'}}>Termos de utilização</a> e as condições apresentadas no Stripe antes de concluir a subscrição.</p>
      </section>}
      {memberContent.length > 0 && <section aria-label="Conteúdo exclusivo da comunidade" className="card" style={{background:'#141c2b',color:'#f4f8ff',padding:20,marginTop:18,borderRadius:22}}>
        <h2 style={{fontSize:22,marginBottom:6}}>Conteúdo exclusivo <span style={{color:'#31dacb'}}>Lumina</span></h2>
        <p style={{color:'#b7cbd9',fontSize:13,marginBottom:14}}>Publicações reservadas à comunidade.</p>
        <div style={{display:'grid',gap:12}}>
          {memberContent.map(item=><article key={item.id} style={{borderTop:'1px solid #ffffff26',paddingTop:12}}>
            <h3 style={{fontSize:17,margin:'0 0 8px'}}>{item.title}</h3>
            {item.body && <p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',lineHeight:1.55,margin:0}}>{item.body}</p>}
          </article>)}
        </div>
      </section>}
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

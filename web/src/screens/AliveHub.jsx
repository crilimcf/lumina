import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Bell, CircleDot, Compass, MessageCircle, Plus, Radio, Search, Sparkles, Users, Waves } from 'lucide-react';
import { api } from '../api.js';
import { Nav, Toast, TopActions } from '../components/AppChrome.jsx';
import '../alive.css';

// ALIVE is a new view over the existing authorized Lumina resources.
// No fabricated activity, presence, engagement, people or sample content.
const COPY = {
  pt: {
    overline:'UMA REDE VIVA, À TUA MANEIRA', heroA:'Mais perto.',heroB:'Mais vivo.',
    intro:'Um lugar para encontrar pessoas, entrar em conversas e descobrir o que te move.',
    enter:'Explorar ligações', start:'Partilhar agora', social:'O teu universo',
    touch:'Toca numa ligação para começar', people:'Pessoas',rooms:'Salas',live:'Diretos',
    noRooms:'As tuas próximas comunidades estão por descobrir.', noPeople:'Encontra novas pessoas à tua medida.',
    liveNow:'A acontecer', noLive:'Sem diretos ativos neste momento.',
    more:'Explorar', moments:'Os teus momentos', momentHelp:'Histórias da tua rede, durante 24 horas.',
    conversations:'Continuar conversa',noChats:'As tuas conversas começam com um olá.',
    posts:'Do teu círculo',postsHelp:'Publicações de quem segues, por ordem cronológica.',
    noPosts:'O teu Feed está pronto para a primeira história.',
    feed:'Abrir Feed cronológico', explorePeople:'Descobrir pessoas',
    orbit:'Universo', quiet:'Foco', quietOff:'Ver tudo', back:'Voltar ao universo',
    discover:'A tua próxima ligação começa aqui.', friend:'Ver perfil',
    load:'A reunir as tuas ligações…',retry:'Tentar novamente',unread:'por ler',
    privacy:'Só vês conteúdos que tens autorização para ver.',
  },
  en: {
    overline:'A LIVING NETWORK, YOUR WAY',heroA:'Closer.',heroB:'More alive.',
    intro:'A place to find people, join conversations and discover what moves you.',
    enter:'Explore connections',start:'Share something',social:'Your universe',
    touch:'Tap a connection to begin',people:'People',rooms:'Rooms',live:'Live',
    noRooms:'Your next community is waiting to be discovered.',noPeople:'Find new people who share your interests.',
    liveNow:'Happening now',noLive:'No live streams right now.',
    more:'Explore',moments:'Your moments',momentHelp:'Stories from your network for 24 hours.',
    conversations:'Pick up a conversation',noChats:'Every conversation starts with hello.',
    posts:'From your circle',postsHelp:'Posts from people you follow, in chronological order.',
    noPosts:'Your Feed is ready for its first story.',
    feed:'Open chronological Feed',explorePeople:'Discover people',orbit:'Universe',
    quiet:'Focus',quietOff:'Show all',back:'Back to universe',discover:'Your next connection starts here.',
    friend:'View profile',load:'Finding your connections…',retry:'Try again',unread:'unread',
    privacy:'Only content you are allowed to see is displayed.',
  },
  fr: {
    overline:'UN RÉSEAU VIVANT, À TA FAÇON',heroA:'Plus proche.',heroB:'Plus vivant.',
    intro:'Un lieu pour rencontrer des gens, rejoindre des conversations et découvrir ce qui te fait vibrer.',
    enter:'Explorer les liens',start:'Partager',social:'Ton univers',
    touch:'Touche un lien pour commencer',people:'Personnes',rooms:'Salons',live:'Directs',
    noRooms:'Tes prochaines communautés restent à découvrir.',noPeople:'Découvre de nouvelles personnes.',
    liveNow:'En ce moment',noLive:'Aucun direct en cours.',
    more:'Explorer',moments:'Tes moments',momentHelp:'Les histoires de ton réseau pendant 24 heures.',
    conversations:'Reprendre une conversation',noChats:'Chaque conversation commence par un bonjour.',
    posts:'De ton cercle',postsHelp:'Les publications de tes abonnements, dans l’ordre chronologique.',
    noPosts:'Ton fil attend sa première histoire.',feed:'Ouvrir le fil chronologique',
    explorePeople:'Découvrir des personnes',orbit:'Univers',quiet:'Focus',quietOff:'Tout voir',
    back:'Retour à l’univers',discover:'Ta prochaine connexion commence ici.',
    friend:'Voir le profil',load:'Recherche de tes liens…',retry:'Réessayer',unread:'non lus',
    privacy:'Seuls les contenus auxquels tu as accès sont affichés.',
  },
  es: {
    overline:'UNA RED VIVA, A TU MANERA',heroA:'Más cerca.',heroB:'Más vivo.',
    intro:'Un lugar para encontrar personas, unirte a conversaciones y descubrir lo que te mueve.',
    enter:'Explorar conexiones',start:'Compartir ahora',social:'Tu universo',
    touch:'Toca una conexión para empezar',people:'Personas',rooms:'Salas',live:'Directos',
    noRooms:'Tus próximas comunidades están por descubrir.',noPeople:'Descubre nuevas personas.',
    liveNow:'Ahora mismo',noLive:'No hay directos activos.',
    more:'Explorar',moments:'Tus momentos',momentHelp:'Historias de tu red durante 24 horas.',
    conversations:'Retomar una conversación',noChats:'Toda conversación empieza con un hola.',
    posts:'De tu círculo',postsHelp:'Publicaciones de quienes sigues, en orden cronológico.',
    noPosts:'Tu feed espera su primera historia.',feed:'Abrir feed cronológico',
    explorePeople:'Descubrir personas',orbit:'Universo',quiet:'Foco',quietOff:'Ver todo',
    back:'Volver al universo',discover:'Tu próxima conexión empieza aquí.',
    friend:'Ver perfil',load:'Buscando tus conexiones…',retry:'Reintentar',unread:'sin leer',
    privacy:'Solo ves contenido al que tienes acceso.',
  },
};

function textForLocale() {
  const language = (document.documentElement.lang || navigator.language || 'pt').slice(0, 2).toLowerCase();
  return COPY[language] || COPY.pt;
}

function rows(value, key) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value[key])) return value[key];
  if (value && Array.isArray(value.items)) return value.items;
  return [];
}

const shortName = person => String(person?.name || person?.author_name || person?.handle || '').trim();
const clean = value => String(value || '').trim();

function Photo({ url, name, color = 'lime' }) {
  return url
    ? <span className="alive-avatar"><img src={url} alt="" loading="lazy" /></span>
    : <span className={`alive-avatar alive-avatar--${color}`} aria-hidden="true">{clean(name).slice(0,1).toUpperCase() || '✳'}</span>;
}

export function AliveHub({
  me, feed = [], threads = [], unreadCount = 0, tab, setTab,
  setThread, setComp, setScreen, onOpenProfile, onOpenLive,
  onOpenFeed, ping, toast,
}) {
  const t = textForLocale();
  const [resources, setResources] = useState({ rooms:[], people:[], lives:[] });
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [focus, setFocus] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    const results = await Promise.allSettled([
      api.rooms.list(), api.users.suggestions(), api.live.list(),
    ]);
    setResources({
      rooms: results[0].status === 'fulfilled' ? rows(results[0].value,'rooms') : [],
      people: results[1].status === 'fulfilled' ? rows(results[1].value,'users') : [],
      lives: results[2].status === 'fulfilled' ? rows(results[2].value,'streams') : [],
    });
    setFailed(results.every(result => result.status === 'rejected'));
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  const navigate = useCallback((next) => { setThread?.(null); setTab(next); }, [setTab, setThread]);
  const openShare = () => { navigate('feed'); setComp({ title:'Publicar' }); };
  const rooms = resources.rooms.slice(0,4);
  const people = resources.people.filter(person => person.id !== me?.id).slice(0,4);
  const lives = resources.lives.filter(stream => stream && stream.id).slice(0,3);
  const points = useMemo(() => [
    ...rooms.slice(0,2).map((room,index) => ({
      key:`room-${room.id}`, title:clean(room.name), hint:t.rooms, kind:'room',position:index,
      onClick:()=>navigate('rooms'), avatar:room.image_url,
    })),
    ...people.slice(0,2).map((person,index) => ({
      key:`person-${person.id}`, title:shortName(person),hint:t.people,kind:'person',position:index+2,
      onClick:()=>onOpenProfile?.(person),avatar:person.avatar_url,
    })),
    ...lives.slice(0,1).map(stream=>({
      key:`live-${stream.id}`,title:clean(stream.title) || t.live,hint:t.live,kind:'live',position:4,
      onClick:()=>onOpenLive?.(stream.id),avatar:stream.thumbnail_url,
    })),
  ], [rooms,people,lives,navigate,onOpenLive,onOpenProfile,t.rooms,t.people,t.live]);

  const emptyOrbit = points.length === 0;
  const firstPost = feed.find(post=>post && (post.body || post.media_url));
  const recentThread = threads.find(thread => !thread.archived);

  return <div className={`alive-root${focus?' alive-root--focus':''}`}>
    <div className="alive-surface">
      <header className="alive-topbar">
        <div className="alive-wordmark" aria-label="Lumina"><span className="alive-symbol">✳</span><span>lumina<span className="alive-wordmark-period">.</span></span></div>
        <span className="alive-edition">ALIVE / 01</span>
        <TopActions tab={tab} setTab={setTab} setThread={setThread} unreadCount={unreadCount}/>
      </header>

      <div className="alive-lead">
        <div className="alive-eyebrow"><span className="alive-pulse-dot" />{t.overline}</div>
        <div className="alive-hero-title"><span>{t.heroA}</span><em>{t.heroB}</em></div>
        <div className="alive-lead-bottom">
          <p>{t.intro}</p>
          <button type="button" className="alive-square-action" onClick={() => document.getElementById('alive-universe')?.scrollIntoView({ behavior:'smooth',block:'start' })} aria-label={t.enter}><ArrowDownRight size={25}/></button>
        </div>
      </div>

      <div className="alive-marquee" aria-hidden="true"><span>LUMINA <i>✳</i> PEOPLE FIRST <i>✳</i> ALWAYS CONNECTED <i>✳</i> LUMINA <i>✳</i> PEOPLE FIRST <i>✳</i></span></div>

      <main id="alive-universe" className="alive-main">
        <div className="alive-section-head">
          <div><span className="alive-index">01 / DISCOVER</span><h1>{t.social}<span className="alive-dot">.</span></h1><p>{t.touch}</p></div>
          <button className="alive-focus-toggle" type="button" aria-pressed={focus} onClick={() => setFocus(value => !value)}><CircleDot size={16}/>{focus?t.quietOff:t.quiet}</button>
        </div>

        <div className="alive-orbit" role="group" aria-label={t.social}>
          <div className="alive-orbit-ring alive-orbit-ring-one" aria-hidden="true"/>
          <div className="alive-orbit-ring alive-orbit-ring-two" aria-hidden="true"/>
          <div className="alive-orbit-glow" aria-hidden="true"/>
          <button type="button" className="alive-orbit-core" onClick={openShare} aria-label={t.start}><span>✳</span><strong>LUMINA</strong><small>{t.start} ↗</small></button>
          {loading ? <div className="alive-orbit-loading" role="status">{t.load}</div>
            : emptyOrbit ? <>
              <button className="alive-orbit-node alive-orbit-node-0" onClick={()=>navigate('rooms')}><Users size={21}/><small>{t.rooms}</small></button>
              <button className="alive-orbit-node alive-orbit-node-1" onClick={()=>setScreen('amigos')}><Search size={21}/><small>{t.people}</small></button>
              <button className="alive-orbit-node alive-orbit-node-2" onClick={()=>navigate('promos')}><Compass size={21}/><small>{t.more}</small></button>
            </> : points.map((point,index) => <button key={point.key} type="button"
              className={`alive-orbit-node alive-orbit-node-${index} alive-orbit-node--${point.kind}`}
              onClick={point.onClick} title={point.title || point.hint}>
              <Photo url={point.avatar} name={point.title} color={point.kind==='person'?'coral':'lime'} />
              <span className="alive-node-label">{point.title || point.hint}</span>
            </button>)}
        </div>
        {failed && <div className="alive-error" role="status">{t.privacy} <button type="button" onClick={refresh}>{t.retry}</button></div>}

        <div className="alive-stats" aria-label={t.social}>
          <button onClick={()=>navigate('rooms')}><Users size={19}/><span><strong>{loading?'—':resources.rooms.length}</strong><small>{t.rooms}</small></span><ArrowUpRight size={17}/></button>
          <button onClick={()=>setScreen('amigos')}><Sparkles size={19}/><span><strong>{loading?'—':resources.people.length}</strong><small>{t.people}</small></span><ArrowUpRight size={17}/></button>
          <button onClick={()=>navigate('dms')}><MessageCircle size={19}/><span><strong>{threads.filter(x=>!x.archived).length}</strong><small>{t.conversations}</small></span><ArrowUpRight size={17}/></button>
        </div>

        {!focus && <>
          <section className="alive-editorial-block">
            <div className="alive-block-head"><span className="alive-index">02 / COMMUNITY</span><h2>{t.rooms}<span>.</span></h2><button onClick={()=>navigate('rooms')} aria-label={t.more}>{t.more} <ArrowUpRight size={18}/></button></div>
            <div className="alive-room-rail">
              {rooms.length ? rooms.map((room,i) => <button key={room.id} type="button" className={`alive-room alive-room-${i % 3}`} onClick={()=>navigate('rooms')}>
                {room.image_url && <img src={room.image_url} alt="" loading="lazy" />}
                <span className="alive-room-top">{room.visibility==='private'?'PRIVATE / ':'PUBLIC / '}{String(i+1).padStart(2,'0')}</span>
                <span className="alive-room-copy"><strong>{room.name}</strong><small>{room.topic || ''}</small></span>
                <ArrowUpRight className="alive-room-arrow" size={22}/>
              </button>) :
                <button className="alive-room alive-room-empty" onClick={()=>navigate('rooms')}><Users size={28}/><strong>{t.noRooms}</strong><span>{t.more} ↗</span></button>}
            </div>
          </section>

          <section className="alive-editorial-block alive-people-block">
            <div className="alive-block-head"><span className="alive-index">03 / PEOPLE</span><h2>{t.people}<span>.</span></h2><button onClick={()=>setScreen('amigos')}>{t.more} <ArrowUpRight size={18}/></button></div>
            {people.length ? <div className="alive-people-strip">{people.map(person=><button type="button" key={person.id} onClick={()=>onOpenProfile?.(person)}>
              <Photo name={shortName(person)} url={person.avatar_url} color="coral"/>
              <span><strong>{shortName(person)}</strong><small>{person.handle?'@'+person.handle:t.friend}</small></span><ArrowUpRight size={17}/>
            </button>)}</div> : <button className="alive-empty-link" onClick={()=>setScreen('amigos')}>{t.noPeople}<ArrowRight size={17}/></button>}
          </section>
        </>}

        <div className="alive-feature-pair">
          <section className="alive-feature alive-feature-conversations">
            <span className="alive-index">04 / CONNECT</span><MessageCircle size={27}/>
            <h2>{t.conversations}</h2>
            <p>{recentThread?.name || t.noChats}</p>
            {threads.some(x=>x.unread>0)&&<small>{threads.reduce((s,x)=>s+(Number(x.unread)||0),0)} {t.unread}</small>}
            <button type="button" onClick={()=>navigate('dms')}>{t.more}<ArrowUpRight size={17}/></button>
          </section>
          <section className="alive-feature alive-feature-live">
            <span className="alive-index">05 / LIVE</span><Radio size={27}/>
            <h2>{t.liveNow}</h2>
            <p>{lives[0]?.title || t.noLive}</p>
            <button type="button" onClick={()=>lives[0]?.id?onOpenLive?.(lives[0].id):navigate('feed')}>{t.more}<ArrowUpRight size={17}/></button>
          </section>
        </div>

        <section className="alive-editorial-block alive-feed-teaser">
          <div className="alive-block-head"><span className="alive-index">06 / YOUR CIRCLE</span><h2>{t.posts}<span>.</span></h2><button type="button" onClick={onOpenFeed}>{t.feed} <ArrowUpRight size={18}/></button></div>
          <p className="alive-subline">{t.postsHelp}</p>
          {firstPost ? <button className="alive-story" onClick={onOpenFeed}>
            {firstPost.media_url && !String(firstPost.media_mime||'').startsWith('video/') && <img src={firstPost.media_url} alt="" loading="lazy"/>}
            <span><small>{shortName({ name:firstPost.author_name || firstPost.name, handle:firstPost.author_handle })}</small><strong>{String(firstPost.body || t.feed).slice(0,145)}</strong><em>{t.feed} ↗</em></span>
          </button> : <button className="alive-empty-link" onClick={openShare}>{t.noPosts}<Plus size={18}/></button>}
        </section>

        <div className="alive-footer-cta">
          <span className="alive-index">NEXT / YOUR MOVE</span>
          <h2>{t.discover}</h2>
          <div><button onClick={openShare}><Plus size={18}/>{t.start}</button><button onClick={()=>setScreen('amigos')}><Search size={18}/>{t.explorePeople}</button></div>
          <p><Waves size={15}/>{t.privacy}</p>
        </div>
        <div className="alive-brand-tail" aria-hidden="true">LUMINA<span>✳</span></div>
      </main>
    </div>
    <Nav tab={tab} setTab={setTab} setComp={setComp} setThread={setThread} threads={threads}/>
    <Toast text={toast}/>
  </div>;
}

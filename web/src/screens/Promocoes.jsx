import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck, BadgePercent, CalendarDays, ChevronRight, ExternalLink, MapPin, Newspaper,
  RefreshCw, Settings2, ShieldCheck, Sparkles, TrendingUp,
} from 'lucide-react';
import { api } from '../api.js';
import { detectRadarLocation, loadRadarForLocation, readCachedRadarLocation } from '../radar-location.js';
import { Nav, Toast, TopActions } from '../components/AppChrome.jsx';
import { ScrollToTopButton } from '../components/ScrollToTopButton.jsx';
import '../explore-facelift.css';
import '../radar-location.css';

const FILTERS = [
  ['', Sparkles, 'Para ti'],
  ['news', Newspaper, 'Notícias'],
  ['promotion', BadgePercent, 'Promoções'],
  ['event', CalendarDays, 'Eventos'],
  ['trend', TrendingUp, 'Tendências'],
];

const TYPE_LABEL = {
  news: 'Notícia', promotion: 'Promoção', event: 'Evento', trend: 'Tendência', editorial: 'Lumina',
};

function formatDate(value) {
  if (!value) return '';
  try {
    const date = new Date(value);
    const now = new Date();
    const sameYear = date.getFullYear() === now.getFullYear();
    return new Intl.DateTimeFormat(navigator.language || undefined, { day:'numeric', month:'short', ...(sameYear ? {} : { year:'numeric' }) }).format(date);
  } catch { return ''; }
}

function ItemIcon({ type, size = 15 }) {
  const Icon = type === 'news' ? Newspaper : type === 'promotion' ? BadgePercent : type === 'event' ? CalendarDays : type === 'trend' ? TrendingUp : Sparkles;
  return <Icon size={size}/>;
}

function sourceInitials(name) {
  const cleaned = String(name || 'Radar').replace(/·.*$/, '').trim();
  return cleaned.split(/\s+/).slice(0,2).map(word=>word[0]).join('').toUpperCase().slice(0,2) || 'R';
}

function PublisherMark({ name, size = 36 }) {
  return <span className="explore-publisher-mark" aria-hidden="true" style={{ width:size, height:size }}>{sourceInitials(name)}</span>;
}

function SourceLine({ item }) {
  const name = item.sponsor_label || item.source_name || 'Radar Lumina';
  return <div className="explore-source-line">
    <PublisherMark name={name}/>
    <div className="explore-source-copy">
      <div className="explore-source-name">{name}{!item.sponsored && <BadgeCheck size={13} fill="#7b61ff" color="#fff"/>}</div>
      <div className="explore-source-status">{item.sponsored ? 'Parceiro identificado' : 'Fonte verificada'}</div>
    </div>
  </div>;
}

function RadarImage({ item }) {
  const [source, setSource] = useState(item.image_url ? 'proxy' : 'none');

  useEffect(() => {
    setSource(item.image_url ? 'proxy' : 'none');
  }, [item.id, item.image_url]);

  if (!item.image_url || source === 'none') return null;
  const src = source === 'proxy'
    ? `/api/radar-images/${encodeURIComponent(item.id)}`
    : item.image_url;

  return <div className="explore-media">
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={()=>setSource(current => current === 'proxy' ? 'direct' : 'none')}
    />
  </div>;
}

function RadarCard({ item, hero = false }) {
  const displayDate = item.type === 'event' ? item.starts_at : item.published_at;
  const titleTag = hero ? 'h2' : 'h3';
  const Title = titleTag;

  return <article className={`explore-card in${hero ? ' is-hero' : ''}`}>
    <RadarImage item={item}/>
    <div className="explore-card-body">
      <div className="explore-card-meta">
        <span className="explore-type-badge"><ItemIcon type={item.type}/>{TYPE_LABEL[item.type] || 'Radar'}</span>
        {item.sponsored && <span className="explore-sponsored-badge">Patrocinado</span>}
        <span className="explore-date">{formatDate(displayDate)}</span>
      </div>
      <Title>{item.title}</Title>
      {(item.summary || item.body) && <div className="explore-card-summary">{item.summary || item.body}</div>}
      <div className="explore-card-footer">
        <SourceLine item={item}/>
        {item.external_url && <a
          className="explore-external"
          href={item.external_url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Abrir na fonte ${item.source_name || ''}`}
        ><ExternalLink size={15}/></a>}
      </div>
    </div>
  </article>;
}

export function Promocoes({ me, setScreen, tab, setTab, setComp, threads, setThread, ping, toast, unreadCount }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [publisher, setPublisher] = useState('');
  const [location, setLocation] = useState(() => readCachedRadarLocation());
  const [locationReady, setLocationReady] = useState(false);
  const [locating, setLocating] = useState(false);

  const refreshLocation = useCallback(async (force = false) => {
    setLocating(true);
    try {
      const next = await detectRadarLocation({ force });
      if (next) setLocation(next);
    } catch {
      if (force) setLocation(readCachedRadarLocation());
    } finally {
      setLocationReady(true);
      setLocating(false);
    }
  }, []);

  useEffect(() => { void refreshLocation(false); }, [refreshLocation]);

  useEffect(() => {
    if (!locationReady) return undefined;
    let active = true;
    setLoading(true);
    setPublisher('');
    loadRadarForLocation({
      type:filter || undefined,
      limit:30,
      country:location?.countryCode,
      region:location?.city || location?.region,
    })
      .then(result => { if (active) setItems(result.items || []); })
      .catch(error => { if (active) ping(error.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filter, location?.countryCode, location?.city, location?.region, locationReady, ping]);

  const publishers = useMemo(
    () => [...new Set(items.map(item => item.source_name).filter(Boolean))].sort((a,b)=>a.localeCompare(b, navigator.language || undefined)),
    [items],
  );
  const visible = publisher ? items.filter(item => item.source_name === publisher) : items;
  const hero = visible[0] || null;
  const rest = hero ? visible.slice(1) : visible;

  return <div className="lumina-facelift lumina-explore">
    <div className="explore-shell">
      <header className="explore-header">
        <div className="explore-title-row">
          <div className="explore-title-copy">
            <div className="explore-eyebrow">Explorar agora</div>
            <h1>Radar</h1>
            <p>O mundo agora, sem misturar com o teu Feed. Descobre sinais relevantes com contexto e origem clara.</p>
            <div className="explore-location-row">
              <button
                type="button"
                className="explore-location-chip"
                onClick={()=>refreshLocation(true)}
                disabled={locating}
                aria-label={location ? 'Tentar localização novamente' : 'Detetar onde estou'}
              >
                {locating ? <RefreshCw className="explore-location-spin" size={15}/> : <MapPin size={15}/>} 
                <span data-i18n-ignore={location?.label ? 'true' : undefined}>
                  {locating ? 'A pedir localização ao iPhone…' : (location?.label || 'Detetar onde estou')}
                </span>
              </button>
              {location?.countryCode && <span className="explore-location-country" data-i18n-ignore="true">{location.countryCode}</span>}
              {location?.countryCode && <a
                className="explore-location-attribution"
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noopener noreferrer"
                data-i18n-ignore="true"
              >© OpenStreetMap</a>}
            </div>
          </div>
          <TopActions tab={tab} setTab={setTab} setThread={setThread} unreadCount={unreadCount}/>
        </div>
      </header>

      <section className="explore-trust-panel" aria-label="Como funciona o Radar">
        <span className="explore-trust-icon"><ShieldCheck size={20}/></span>
        <div className="explore-trust-copy">
          <strong>Descoberta com contexto, não ruído.</strong>
          <p>Fontes editoriais verificadas, manchetes e contexto ficam separados do Feed social. O artigo original continua na respetiva fonte e conteúdo comercial permanece sempre identificado.</p>
        </div>
      </section>

      {me?.is_staff && <button type="button" className="p explore-staff-button" onClick={()=>setScreen?.('radar-admin')}><Settings2 size={15}/>Gerir Radar</button>}

      <div aria-label="Filtros do Radar" className="explore-filter-rail">
        {FILTERS.map(([value,Icon,label]) => {
          const active = filter === value;
          return <button
            key={value || 'all'}
            type="button"
            onClick={()=>setFilter(value)}
            aria-pressed={active}
            className={`explore-filter-chip${active ? ' is-active' : ''}`}
          ><Icon size={14}/>{label}</button>;
        })}
      </div>

      {filter === 'news' && publishers.length > 1 && <section className="explore-sources" aria-label="Fontes de notícias">
        <div className="explore-section-label">Fontes</div>
        <div className="explore-source-rail">
          <button type="button" onClick={()=>setPublisher('')} className={`explore-source-chip${!publisher ? ' is-active' : ''}`}>Todas</button>
          {publishers.map(name => <button
            type="button"
            key={name}
            onClick={()=>setPublisher(name)}
            className={`explore-source-chip${publisher === name ? ' is-active' : ''}`}
          ><PublisherMark name={name} size={27}/><span>{name}</span><ChevronRight size={12}/></button>)}
        </div>
      </section>}

      {!locationReady || loading ? <div className="explore-loading"><span className="explore-loading-dot"/>A sintonizar o Radar…</div>
        : !visible.length ? <div className="explore-empty">Sem sinais nesta categoria.<br/>Quando houver algo relevante, aparece aqui.</div>
        : <div className="explore-grid">
          {hero && <RadarCard item={hero} hero/>}
          {rest.length > 0 && <div className="explore-rest">{rest.map(item => <RadarCard key={item.id} item={item}/>)}</div>}
        </div>}
    </div>

    <ScrollToTopButton/>
    <Nav tab={tab} setTab={setTab} setThread={setThread} setComp={setComp} threads={threads}/>
    <Toast text={toast}/>
  </div>;
}

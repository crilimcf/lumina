import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck, BadgePercent, CalendarDays, ChevronRight, ExternalLink, Globe2, MapPin,
  Newspaper, RefreshCw, Settings2, ShieldCheck, Sparkles, TrendingUp, Flag,
} from 'lucide-react';
import { detectRadarLocation, loadCountryRadar, loadGlobalRadar, loadNearbyRadar, readCachedRadarLocation } from '../radar-location.js';
import { Nav, Toast, TopActions } from '../components/AppChrome.jsx';
import { ScrollToTopButton } from '../components/ScrollToTopButton.jsx';
import { t } from '../i18n-ui.js';
import '../explore-facelift.css';
import '../radar-location.css';
import '../radar-split-v2.css';

const LOCAL_FILTERS = [
  ['', Sparkles, 'Para ti'],
  ['news', Newspaper, 'Notícias'],
  ['promotion', BadgePercent, 'Promoções'],
  ['event', CalendarDays, 'Eventos'],
  ['trend', TrendingUp, 'Tendências'],
];
const GLOBAL_FILTERS = [
  ['', Sparkles, 'Destaques'],
  ['news', Newspaper, 'Notícias'],
  ['trend', TrendingUp, 'Tendências'],
];
const TYPE_LABEL = {
  news:'Notícia', promotion:'Promoção', event:'Evento', trend:'Tendência', editorial:'Lumina',
};

function cleanEditorialText(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;|&#x0*a0;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x0*27);|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatDate(value) {
  if (!value) return '';
  try {
    const date = new Date(value);
    const now = new Date();
    const sameYear = date.getFullYear() === now.getFullYear();
    return new Intl.DateTimeFormat(navigator.language || undefined, {
      day:'numeric', month:'short', ...(sameYear ? {} : { year:'numeric' }),
    }).format(date);
  } catch { return ''; }
}

function ItemIcon({ type, size = 15 }) {
  const Icon = type === 'news' ? Newspaper
    : type === 'promotion' ? BadgePercent
      : type === 'event' ? CalendarDays
        : type === 'trend' ? TrendingUp : Sparkles;
  return <Icon size={size}/>;
}

function sourceInitials(name) {
  const cleaned = cleanEditorialText(name || 'Radar').replace(/·.*$/, '').trim();
  return cleaned.split(/\s+/).slice(0,2).map(word=>word[0]).join('').toUpperCase().slice(0,2) || 'R';
}

function PublisherMark({ name, size = 36 }) {
  return <span className="explore-publisher-mark" aria-hidden="true" style={{ width:size, height:size }}>{sourceInitials(name)}</span>;
}

function SourceLine({ item }) {
  const name = cleanEditorialText(item.sponsor_label || item.source_name || 'Radar Lumina');
  return <div className="explore-source-line">
    <PublisherMark name={name}/>
    <div className="explore-source-copy">
      <div className="explore-source-name">{name}{!item.sponsored && <BadgeCheck size={13} fill="#7b61ff" color="#fff"/>}</div>
      <div className="explore-source-status">{t(item.sponsored ? 'Parceiro identificado' : 'Fonte verificada')}</div>
    </div>
  </div>;
}

function RadarImage({ item }) {
  const [source, setSource] = useState(item.image_url ? 'proxy' : 'none');
  useEffect(() => { setSource(item.image_url ? 'proxy' : 'none'); }, [item.id, item.image_url]);
  if (!item.image_url || source === 'none') return null;
  const src = source === 'proxy' ? `/api/radar-images/${encodeURIComponent(item.id)}` : item.image_url;
  return <div className="explore-media"><img src={src} alt="" loading="lazy" decoding="async" onError={()=>setSource(current => current === 'proxy' ? 'direct' : 'none')}/></div>;
}

function safeArticleUrl(item) {
  const raw = String(item.external_url || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw, window.location.origin);
    const source = String(item.source_name || '').toLowerCase();
    if ((url.hostname === 'trends.google.com' || source.includes('google trends')) && /\/trending\/rss/i.test(url.pathname)) {
      const tag = Array.isArray(item.tags) ? item.tags.find(value => /^country:[a-z]{2}$/i.test(value)) : null;
      const geo = tag ? tag.split(':')[1].toUpperCase() : (url.searchParams.get('geo') || '').toUpperCase();
      const explore = new URL('https://trends.google.com/trends/explore');
      if (geo) explore.searchParams.set('geo', geo);
      explore.searchParams.set('q', cleanEditorialText(item.title));
      return explore.toString();
    }
    return url.toString();
  } catch { return null; }
}

function RadarCard({ item, hero = false }) {
  const displayDate = item.type === 'event' ? item.starts_at : item.published_at;
  const Title = hero ? 'h2' : 'h3';
  const title = cleanEditorialText(item.title);
  const summary = cleanEditorialText(item.summary || item.body);
  const sourceName = cleanEditorialText(item.source_name || '');
  const externalHref = safeArticleUrl(item);
  return <article className={`explore-card in${hero ? ' is-hero' : ''}`}>
    <RadarImage item={item}/>
    <div className="explore-card-body">
      <div className="explore-card-meta">
        <span className="explore-type-badge"><ItemIcon type={item.type}/>{t(TYPE_LABEL[item.type] || 'Radar')}</span>
        {item.sponsored && <span className="explore-sponsored-badge">{t('Patrocinado')}</span>}
        <span className="explore-date">{formatDate(displayDate)}</span>
      </div>
      <Title>{title}</Title>
      {summary && <div className="explore-card-summary">{summary}</div>}
      <div className="explore-card-footer">
        <SourceLine item={item}/>
        {externalHref && <a className="explore-external" href={externalHref} target="_blank" rel="noopener noreferrer external" aria-label={`${t('Abrir na fonte')} ${sourceName}`}><span>{t('Ler na fonte')}</span><ExternalLink size={15}/></a>}
      </div>
    </div>
  </article>;
}

function RadarSkeleton() {
  return <div className="radar-skeleton" aria-hidden="true">
    <div className="radar-skeleton-media"/>
    <div className="radar-skeleton-line is-short"/>
    <div className="radar-skeleton-line is-title"/>
    <div className="radar-skeleton-line is-mid"/>
    <div className="radar-skeleton-line"/>
  </div>;
}

function RadarFeed({ items, loading, empty }) {
  const hero = items[0] || null;
  const rest = hero ? items.slice(1) : [];
  if (loading) return <div className="radar-skeleton-grid" role="status" aria-label={t('A sintonizar o Radar…')}><RadarSkeleton/><RadarSkeleton/></div>;
  if (!items.length) return <div className="explore-empty radar-scope-empty">{empty}</div>;
  return <div className="explore-grid">{hero && <RadarCard item={hero} hero/>}{rest.length > 0 && <div className="explore-rest">{rest.map(item => <RadarCard key={item.id} item={item}/>)}</div>}</div>;
}

export function Promocoes({ me, setScreen, tab, setTab, setComp, threads, setThread, ping, toast, unreadCount }) {
  const [scope, setScope] = useState('nearby');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [publisher, setPublisher] = useState('');
  const [location, setLocation] = useState(() => readCachedRadarLocation());
  const [locationReady, setLocationReady] = useState(false);
  const [locating, setLocating] = useState(false);

  const filters = scope === 'global' ? GLOBAL_FILTERS : LOCAL_FILTERS;
  const nearbyRegion = location?.city || location?.region || '';

  const refreshLocation = useCallback(async (force = false) => {
    setLocating(true);
    try {
      const next = await detectRadarLocation({ force });
      if (next) setLocation(next);
    } catch {
      if (force) ping(t('Não consegui obter a localização do iPhone. Confirma a permissão de localização.'));
    } finally {
      setLocationReady(true);
      setLocating(false);
    }
  }, [ping]);

  useEffect(() => { void refreshLocation(false); }, [refreshLocation]);

  useEffect(() => {
    if (scope === 'global' && !GLOBAL_FILTERS.some(([value]) => value === filter)) setFilter('');
    setPublisher('');
  }, [scope, filter]);

  useEffect(() => {
    let active = true;
    if (scope !== 'global' && !locationReady) return () => { active = false; };
    if (scope !== 'global' && !location?.countryCode) {
      setItems([]);
      setLoading(false);
      return () => { active = false; };
    }
    if (scope === 'nearby' && !nearbyRegion) {
      setItems([]);
      setLoading(false);
      return () => { active = false; };
    }

    setLoading(true);
    const common = { type:filter || undefined, limit:40 };
    const request = scope === 'global'
      ? loadGlobalRadar(common)
      : scope === 'country'
        ? loadCountryRadar({ ...common, country:location.countryCode })
        : loadNearbyRadar({ ...common, country:location.countryCode, region:nearbyRegion });

    request
      .then(result => { if (active) setItems(result.items || []); })
      .catch(error => { if (active) { setItems([]); ping(error.message); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [scope, filter, locationReady, location?.countryCode, nearbyRegion, ping]);

  const publishers = useMemo(() => [...new Set(items.map(item => cleanEditorialText(item.source_name)).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b, navigator.language || undefined)), [items]);
  const visible = publisher ? items.filter(item => cleanEditorialText(item.source_name) === publisher) : items;

  const emptyCopy = scope === 'nearby'
    ? t('Ainda não há notícias realmente próximas desta localização.')
    : scope === 'country'
      ? (filter === 'promotion' ? t('Ainda não há promoções verificadas na tua localização.')
        : filter === 'event' ? t('Ainda não há eventos futuros verificados na tua localização.')
          : filter === 'trend' ? t('Ainda não há tendências locais disponíveis.')
            : t('Ainda não há conteúdo local disponível.'))
      : (filter === 'trend' ? t('Ainda não há tendências globais disponíveis.') : t('Ainda não há conteúdo mundial nesta categoria.'));

  const needsLocation = scope !== 'global';

  return <div className="lumina-facelift lumina-explore">
    <div className="explore-shell">
      <header className="explore-header">
        <div className="explore-title-row">
          <div className="explore-title-copy">
            <div className="explore-eyebrow">{t('Explorar agora')}</div>
            <h1>Radar</h1>
            <p>{t('Perto de mim, País e Mundo são experiências separadas. A localização vem diretamente do teu iPhone.')}</p>
          </div>
          <TopActions tab={tab} setTab={setTab} setThread={setThread} unreadCount={unreadCount}/>
        </div>
      </header>

      <section className="explore-trust-panel" aria-label={t('Como funciona o Radar')}>
        <span className="explore-trust-icon"><ShieldCheck size={20}/></span>
        <div className="explore-trust-copy"><strong>{t('Notícias ficam no Radar.')}</strong><p>{t('O Pulso é social. Aqui encontras notícias, eventos, promoções e tendências com origem identificada — sem misturar a tua zona com o país ou o mundo.')}</p></div>
      </section>

      <div className="radar-split-switch radar-three-way" role="tablist" aria-label={t('Âmbito do Radar')}>
        <button type="button" role="tab" aria-selected={scope==='nearby'} className={scope==='nearby'?'is-active':''} onClick={()=>setScope('nearby')}><MapPin size={18}/> {t('Perto de mim')}</button>
        <button type="button" role="tab" aria-selected={scope==='country'} className={scope==='country'?'is-active':''} onClick={()=>setScope('country')}><Flag size={18}/> {t('País')}</button>
        <button type="button" role="tab" aria-selected={scope==='global'} className={scope==='global'?'is-active':''} onClick={()=>setScope('global')}><Globe2 size={18}/> {t('Mundo')}</button>
      </div>

      {scope === 'nearby' ? <div className="radar-scope-banner">
        <MapPin size={20}/><div><b>{location?.label || location?.city || t('Localização do iPhone')}</b><p>{t('Notícias mesmo da tua zona')}. {t('Não substituímos notícias locais por notícias nacionais.')}</p>{location?.countryCode && <a className="radar-osm-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" data-i18n-ignore="true">© OpenStreetMap contributors</a>}<button type="button" className="radar-refresh-location" onClick={()=>refreshLocation(true)} disabled={locating}>{locating?<RefreshCw size={14}/>:<MapPin size={14}/>} {locating?t('A detetar…'):t('Atualizar localização')}</button></div>{location?.countryCode && <span className="radar-scope-country" data-i18n-ignore="true">{location.countryCode}</span>}
      </div> : scope === 'country' ? <div className="radar-scope-banner">
        <Flag size={20}/><div><b>{location?.country || location?.countryCode || t('País')}</b><p>{t('Notícias do teu país')}.</p><button type="button" className="radar-refresh-location" onClick={()=>refreshLocation(true)} disabled={locating}>{locating?<RefreshCw size={14}/>:<MapPin size={14}/>} {locating?t('A detetar…'):t('Atualizar localização')}</button></div>{location?.countryCode && <span className="radar-scope-country" data-i18n-ignore="true">{location.countryCode}</span>}
      </div> : <div className="radar-scope-banner">
        <Globe2 size={20}/><div><b>{t('Radar Mundo')}</b><p>{t('Notícias de várias partes do mundo')}. {t('Nada deste separador é usado para preencher o Radar Local.')}</p></div>
      </div>}

      {me?.is_staff && <button type="button" className="p explore-staff-button" onClick={()=>setScreen?.('radar-admin')}><Settings2 size={15}/>{t('Gerir Radar')}</button>}

      <div aria-label={t('Filtros do Radar')} className="explore-filter-rail">
        {filters.map(([value,Icon,label]) => {
          const active = filter === value;
          return <button key={value || 'all'} type="button" onClick={()=>setFilter(value)} aria-pressed={active} className={`explore-filter-chip${active ? ' is-active' : ''}`}><Icon size={14}/>{t(label)}</button>;
        })}
      </div>

      {filter === 'news' && publishers.length > 1 && <section className="explore-sources" aria-label={t('Fontes de notícias')}>
        <div className="explore-section-label">{t('Fontes')}</div>
        <div className="explore-source-rail">
          <button type="button" onClick={()=>setPublisher('')} className={`explore-source-chip${!publisher ? ' is-active' : ''}`}>{t('Todas')}</button>
          {publishers.map(name => <button type="button" key={name} onClick={()=>setPublisher(name)} className={`explore-source-chip${publisher === name ? ' is-active' : ''}`}><PublisherMark name={name} size={27}/><span>{name}</span><ChevronRight size={12}/></button>)}
        </div>
      </section>}

      <div className="radar-single-feed">
        {needsLocation && locationReady && (!location?.countryCode || (scope === 'nearby' && !nearbyRegion))
          ? <div className="radar-local-missing"><MapPin size={24}/><b>{t('Precisamos da localização do iPhone')}</b><p>{t('Ativa a localização para o Radar Local usar a tua posição real. Podes continuar a usar o separador Mundo sem localização.')}</p><button type="button" className="radar-refresh-location" onClick={()=>refreshLocation(true)}>{t('Detetar onde estou')}</button></div>
          : <RadarFeed items={visible} loading={loading} empty={emptyCopy}/>
        }
      </div>
    </div>

    <ScrollToTopButton/>
    <Nav tab={tab} setTab={setTab} setThread={setThread} setComp={setComp} threads={threads}/>
    <Toast text={toast}/>
  </div>;
}

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck, BadgePercent, CalendarDays, ChevronRight, ExternalLink, Globe2, MapPin, Newspaper,
  RefreshCw, Settings2, ShieldCheck, Sparkles, TrendingUp,
} from 'lucide-react';
import { detectRadarLocation, loadGlobalRadar, loadRadarForLocation, readCachedRadarLocation } from '../radar-location.js';
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

const LOCAL_ONLY_FILTERS = new Set(['promotion', 'event']);

const FILTER_COPY = {
  '': {
    localSubtitle: 'Notícias e sinais do local onde estás agora.',
    globalSubtitle: 'Notícias e sinais globais, independentemente do local onde estás.',
    localEmpty: 'Ainda não há conteúdo local disponível.',
    globalEmpty: 'Ainda não há conteúdo global disponível.',
  },
  news: {
    localSubtitle: 'Notícias verificadas do país e da região onde estás.',
    globalSubtitle: 'Notícias globais, independentemente do local onde estás.',
    localEmpty: 'Sem notícias locais neste momento.',
    globalEmpty: 'Sem notícias globais neste momento.',
  },
  promotion: {
    localSubtitle: 'Ofertas e campanhas verificadas relevantes no país onde estás.',
    globalSubtitle: '',
    localEmpty: 'Ainda não há promoções verificadas para esta localização.',
    globalEmpty: '',
  },
  event: {
    localSubtitle: 'Eventos atuais e próximos, com data e fonte verificável.',
    globalSubtitle: '',
    localEmpty: 'Ainda não há eventos futuros verificados para esta localização.',
    globalEmpty: '',
  },
  trend: {
    localSubtitle: 'Pesquisas que estão a ganhar força no país onde estás.',
    globalSubtitle: 'Pesquisas em alta reunidas a partir de vários países.',
    localEmpty: 'A aguardar novas tendências desta localização.',
    globalEmpty: 'A aguardar novas tendências globais.',
  },
};

const TYPE_LABEL = {
  news: 'Notícia', promotion: 'Promoção', event: 'Evento', trend: 'Tendência', editorial: 'Lumina',
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
    return new Intl.DateTimeFormat(navigator.language || undefined, { day:'numeric', month:'short', ...(sameYear ? {} : { year:'numeric' }) }).format(date);
  } catch { return ''; }
}

function ItemIcon({ type, size = 15 }) {
  const Icon = type === 'news' ? Newspaper : type === 'promotion' ? BadgePercent : type === 'event' ? CalendarDays : type === 'trend' ? TrendingUp : Sparkles;
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
      <div className="explore-source-status">{item.sponsored ? 'Parceiro identificado' : 'Fonte verificada'}</div>
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

function RadarCard({ item, hero = false }) {
  const displayDate = item.type === 'event' ? item.starts_at : item.published_at;
  const Title = hero ? 'h2' : 'h3';
  const title = cleanEditorialText(item.title);
  const summary = cleanEditorialText(item.summary || item.body);
  const sourceName = cleanEditorialText(item.source_name || '');
  return <article className={`explore-card in${hero ? ' is-hero' : ''}`}>
    <RadarImage item={item}/>
    <div className="explore-card-body">
      <div className="explore-card-meta">
        <span className="explore-type-badge"><ItemIcon type={item.type}/>{TYPE_LABEL[item.type] || 'Radar'}</span>
        {item.sponsored && <span className="explore-sponsored-badge">Patrocinado</span>}
        <span className="explore-date">{formatDate(displayDate)}</span>
      </div>
      <Title>{title}</Title>
      {summary && <div className="explore-card-summary">{summary}</div>}
      <div className="explore-card-footer">
        <SourceLine item={item}/>
        {item.external_url && <a className="explore-external" href={item.external_url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir na fonte ${sourceName}`}><span>Ler na fonte</span><ExternalLink size={15}/></a>}
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

function RadarSection({ scope, icon:Icon, title, subtitle, items, loading, empty, locationLabel }) {
  const hero = items[0] || null;
  const rest = hero ? items.slice(1) : [];
  return <section className="radar-scope-section" data-radar-scope={scope} aria-label={title}>
    <div className="radar-scope-heading">
      <span className="radar-scope-icon"><Icon size={19}/></span>
      <div><div className="radar-scope-title">{title}</div><div className="radar-scope-subtitle">{subtitle}</div></div>
      {locationLabel && <span className="radar-scope-location" data-i18n-ignore="true">{locationLabel}</span>}
    </div>
    {loading ? <div className="radar-skeleton-grid" role="status" aria-label="A sintonizar o Radar…"><RadarSkeleton/><RadarSkeleton/></div>
      : !items.length ? <div className="explore-empty radar-scope-empty">{empty}</div>
      : <div className="explore-grid">{hero && <RadarCard item={hero} hero/>}{rest.length > 0 && <div className="explore-rest">{rest.map(item => <RadarCard key={item.id} item={item}/>)}</div>}</div>}
  </section>;
}

export function Promocoes({ me, setScreen, tab, setTab, setComp, threads, setThread, ping, toast, unreadCount }) {
  const [localItems, setLocalItems] = useState([]);
  const [globalItems, setGlobalItems] = useState([]);
  const [localLoading, setLocalLoading] = useState(true);
  const [globalLoading, setGlobalLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [publisher, setPublisher] = useState('');
  const [location, setLocation] = useState(() => readCachedRadarLocation());
  const [locationReady, setLocationReady] = useState(false);
  const [locating, setLocating] = useState(false);
  const localOnly = LOCAL_ONLY_FILTERS.has(filter);
  const copy = FILTER_COPY[filter] || FILTER_COPY[''];

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
    let active = true;
    setPublisher('');
    if (LOCAL_ONLY_FILTERS.has(filter)) {
      setGlobalItems([]);
      setGlobalLoading(false);
      return () => { active = false; };
    }
    setGlobalLoading(true);
    loadGlobalRadar({ type:filter || undefined, limit:30 })
      .then(result => { if (active) setGlobalItems(result.items || []); })
      .catch(error => { if (active) ping(error.message); })
      .finally(() => { if (active) setGlobalLoading(false); });
    return () => { active = false; };
  }, [filter, ping]);

  useEffect(() => {
    if (!locationReady) return undefined;
    if (!location?.countryCode) {
      setLocalItems([]);
      setLocalLoading(false);
      return undefined;
    }
    let active = true;
    setLocalLoading(true);
    loadRadarForLocation({
      type:filter || undefined,
      limit:30,
      country:location.countryCode,
      region:location.city || location.region,
      scope:'local',
    })
      .then(result => { if (active) setLocalItems(result.items || []); })
      .catch(error => { if (active) ping(error.message); })
      .finally(() => { if (active) setLocalLoading(false); });
    return () => { active = false; };
  }, [filter, location?.countryCode, location?.city, location?.region, locationReady, ping]);

  const allItems = useMemo(() => [...localItems, ...globalItems], [localItems, globalItems]);
  const publishers = useMemo(
    () => [...new Set(allItems.map(item => cleanEditorialText(item.source_name)).filter(Boolean))].sort((a,b)=>a.localeCompare(b, navigator.language || undefined)),
    [allItems],
  );
  const localVisible = publisher ? localItems.filter(item => cleanEditorialText(item.source_name) === publisher) : localItems;
  const localIds = new Set(localVisible.map(item => item.id));
  const globalVisible = (publisher ? globalItems.filter(item => cleanEditorialText(item.source_name) === publisher) : globalItems)
    .filter(item => !localIds.has(item.id));

  return <div className="lumina-facelift lumina-explore">
    <div className="explore-shell">
      <header className="explore-header">
        <div className="explore-title-row">
          <div className="explore-title-copy">
            <div className="explore-eyebrow">Explorar agora</div>
            <h1>Radar</h1>
            <p>O mundo e o que acontece perto de ti, sempre separados e com origem clara.</p>
            <div className="explore-location-row">
              <button type="button" className="explore-location-chip" onClick={()=>refreshLocation(true)} disabled={locating} aria-label={location ? 'Atualizar localização' : 'Detetar onde estou'}>
                {locating ? <RefreshCw className="explore-location-spin" size={15}/> : <MapPin size={15}/>} 
                <span data-i18n-ignore={location?.label ? 'true' : undefined}>{locating ? 'A pedir localização ao iPhone…' : (location?.label || 'Detetar onde estou')}</span>
              </button>
              {location?.countryCode && <span className="explore-location-country" data-i18n-ignore="true">{location.countryCode}</span>}
              {location?.countryCode && <a className="explore-location-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" data-i18n-ignore="true">© OpenStreetMap</a>}
            </div>
          </div>
          <TopActions tab={tab} setTab={setTab} setThread={setThread} unreadCount={unreadCount}/>
        </div>
      </header>

      <section className="explore-trust-panel" aria-label="Como funciona o Radar">
        <span className="explore-trust-icon"><ShieldCheck size={20}/></span>
        <div className="explore-trust-copy"><strong>Descoberta com contexto, não ruído.</strong><p>Fontes editoriais verificadas, manchetes e contexto ficam separados do Feed social. O artigo original continua na respetiva fonte e conteúdo comercial permanece sempre identificado.</p></div>
      </section>

      <div className="radar-status-strip" aria-label="Estado do Radar">
        <div className="radar-status-chip is-local">
          <span className="radar-status-chip-icon"><MapPin size={16}/></span>
          <span className="radar-status-chip-copy"><b><span className="radar-status-live"/>{location?.countryCode ? 'Local ativo' : 'Local opcional'}</b><small data-i18n-ignore={location?.label ? 'true' : undefined}>{location?.label || 'Ativa a localização'}</small></span>
        </div>
        <div className="radar-status-chip is-world">
          <span className="radar-status-chip-icon"><Globe2 size={16}/></span>
          <span className="radar-status-chip-copy"><b><span className="radar-status-live"/>Mundo sempre ativo</b><small>{filter === 'trend' ? 'Tendências de vários países' : 'Notícias globais em qualquer lugar'}</small></span>
        </div>
      </div>

      {me?.is_staff && <button type="button" className="p explore-staff-button" onClick={()=>setScreen?.('radar-admin')}><Settings2 size={15}/>Gerir Radar</button>}

      <div aria-label="Filtros do Radar" className="explore-filter-rail">
        {FILTERS.map(([value,Icon,label]) => { const active = filter === value; return <button key={value || 'all'} type="button" onClick={()=>setFilter(value)} aria-pressed={active} className={`explore-filter-chip${active ? ' is-active' : ''}`}><Icon size={14}/>{label}</button>; })}
      </div>

      {filter === 'news' && publishers.length > 1 && <section className="explore-sources" aria-label="Fontes de notícias">
        <div className="explore-section-label">Fontes</div>
        <div className="explore-source-rail">
          <button type="button" onClick={()=>setPublisher('')} className={`explore-source-chip${!publisher ? ' is-active' : ''}`}>Todas</button>
          {publishers.map(name => <button type="button" key={name} onClick={()=>setPublisher(name)} className={`explore-source-chip${publisher === name ? ' is-active' : ''}`}><PublisherMark name={name} size={27}/><span>{name}</span><ChevronRight size={12}/></button>)}
        </div>
      </section>}

      <div className="radar-dual-feed" style={localOnly ? { gridTemplateColumns:'minmax(0,1fr)' } : undefined}>
        {locationReady && !location?.countryCode ? <section className="radar-location-off"><MapPin size={20}/><div><strong>Localização desligada</strong><p>{localOnly ? 'Ativa a localização para veres conteúdo válido para o país onde estás.' : 'Ativa a localização para juntar conteúdo local. O Radar mundial continua disponível.'}</p></div></section> : <RadarSection scope="local" icon={MapPin} title="Perto de ti" subtitle={copy.localSubtitle} items={localVisible} loading={!locationReady || localLoading} empty={copy.localEmpty} locationLabel={location?.label}/>} 
        {!localOnly && <RadarSection scope="global" icon={Globe2} title="Mundo" subtitle={copy.globalSubtitle} items={globalVisible} loading={globalLoading} empty={copy.globalEmpty}/>} 
      </div>
    </div>

    <ScrollToTopButton/>
    <Nav tab={tab} setTab={setTab} setThread={setThread} setComp={setComp} threads={threads}/>
    <Toast text={toast}/>
  </div>;
}

import React, { useEffect, useState } from 'react';
import {
  BadgePercent, CalendarDays, ExternalLink, Newspaper, Radar as RadarIcon,
  ShieldCheck, Sparkles, TrendingUp,
} from 'lucide-react';
import { api } from '../api.js';
import { Empty } from '../ui.jsx';
import { Nav, Toast, TopActions } from '../components/AppChrome.jsx';

const FILTERS = [
  ['', Sparkles, 'Para ti'],
  ['news', Newspaper, 'Notícias'],
  ['promotion', BadgePercent, 'Promoções'],
  ['event', CalendarDays, 'Eventos'],
  ['trend', TrendingUp, 'Tendências'],
];

const TYPE_LABEL = {
  news: 'Notícia',
  promotion: 'Promoção',
  event: 'Evento',
  trend: 'Tendência',
  editorial: 'Lumina',
};

function formatDate(value) {
  if (!value) return '';
  try {
    const date = new Date(value);
    const now = new Date();
    const sameYear = date.getFullYear() === now.getFullYear();
    return new Intl.DateTimeFormat('pt-PT', {
      day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }),
    }).format(date);
  } catch { return ''; }
}

function ItemIcon({ type, size = 16 }) {
  const Icon = type === 'news' ? Newspaper
    : type === 'promotion' ? BadgePercent
      : type === 'event' ? CalendarDays
        : type === 'trend' ? TrendingUp
          : Sparkles;
  return <Icon size={size} />;
}

export function Promocoes({ tab, setTab, setComp, threads, setThread, ping, toast, unreadCount }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.radar.list({ type: filter || undefined })
      .then(r => { if (active) setItems(r.items || []); })
      .catch(e => { if (active) ping(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filter, ping]);

  return <div style={{ minHeight: '100dvh', paddingBottom: 100, background: 'linear-gradient(180deg,#F5F1FF,#E9E7F8)' }}>
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '20px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 8px' }}>
        <span style={{ width: 50, height: 50, borderRadius: 18, background: 'linear-gradient(135deg,#6E4CFF,#A445FF)', color: '#fff', display: 'grid', placeItems: 'center', boxShadow: '0 12px 28px rgba(98,70,220,.22)', flexShrink: 0 }}><RadarIcon size={24} /></span>
        <div style={{ flex: 1, minWidth: 0 }}><h2 className="d" style={{ fontSize: 38, margin: 0 }}>Ra<span className="it">dar</span></h2><div className="m">O que vale a pena descobrir agora.</div></div>
        <TopActions tab={tab} setTab={setTab} setThread={setThread} unreadCount={unreadCount} />
      </div>

      <div className="card" style={{ padding: 15, margin: '14px 0 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <ShieldCheck size={20} color="var(--cobalt)" style={{ marginTop: 1, flexShrink: 0 }} />
        <div style={{ fontSize: 13, lineHeight: 1.45 }}><b>Separado do Feed social.</b> Notícias, eventos, tendências e campanhas vivem no Radar. Conteúdo comercial aparece sempre identificado.</div>
      </div>

      <div aria-label="Filtros do Radar" style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '2px 1px 11px', scrollbarWidth: 'none' }}>
        {FILTERS.map(([value, Icon, label]) => {
          const active = filter === value;
          return <button key={value || 'all'} type="button" onClick={() => setFilter(value)} aria-pressed={active} className="p" style={{ flexShrink: 0, padding: '9px 12px', borderRadius: 999, background: active ? 'var(--ink)' : 'rgba(255,255,255,.74)', color: active ? '#fff' : 'var(--ink)', borderColor: active ? 'var(--ink)' : 'var(--edge)' }}><Icon size={14} />{label}</button>;
        })}
      </div>

      {loading ? <div className="m" style={{ padding: 34, textAlign: 'center' }}>A sintonizar o Radar…</div> : !items.length ? <Empty>Sem sinais nesta categoria.<br />Quando houver algo relevante, aparece aqui.</Empty> : <div style={{ display: 'grid', gap: 13 }}>
        {items.map(item => {
          const displayDate = item.type === 'event' ? item.starts_at : item.published_at;
          return <article key={item.id} className="card in" style={{ overflow: 'hidden', padding: 0 }}>
            {item.image_url && <img src={item.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" style={{ width: '100%', aspectRatio: item.type === 'news' ? '16/10' : '4/3', objectFit: 'cover', display: 'block', background: '#DDD8F2' }} />}
            <div style={{ padding: 15 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '6px 9px', background: '#F0ECFF', color: '#4F36C9', fontSize: 10.5, fontWeight: 800, letterSpacing: '.02em' }}><ItemIcon type={item.type} />{TYPE_LABEL[item.type] || 'Radar'}</span>
                {item.sponsored && <span style={{ borderRadius: 999, padding: '6px 9px', background: '#FFF2C7', color: '#6B4D00', fontSize: 10.5, fontWeight: 800 }}>Patrocinado</span>}
                <span className="m" style={{ marginLeft: 'auto', fontSize: 10.5 }}>{item.type === 'event' ? 'Evento · ' : ''}{formatDate(displayDate)}</span>
              </div>

              <h3 className="d" style={{ fontSize: 24, lineHeight: 1.04, margin: '0 0 8px' }}>{item.title}</h3>
              {(item.summary || item.body) && <div style={{ fontSize: 14.5, lineHeight: 1.48, whiteSpace: 'pre-wrap' }}>{item.summary || item.body}</div>}

              {(item.source_name || item.sponsor_label || item.external_url) && <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 13, paddingTop: 12, borderTop: '1px solid var(--edge)' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="m" style={{ fontSize: 9.5 }}>{item.sponsored ? 'Parceiro' : 'Fonte'}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.sponsor_label || item.source_name || 'Fonte externa'}</div>
                </div>
                {item.external_url && <a href={item.external_url} target="_blank" rel="noopener noreferrer" className="p" style={{ textDecoration: 'none', padding: '9px 11px', flexShrink: 0 }}>Abrir <ExternalLink size={13} /></a>}
              </div>}
            </div>
          </article>;
        })}
      </div>}
    </div>
    <Nav tab={tab} setTab={setTab} setThread={setThread} setComp={setComp} threads={threads} />
    <Toast text={toast} />
  </div>;
}

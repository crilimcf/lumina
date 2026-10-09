import React, { useEffect, useMemo, useState } from 'react';
import { Camera, Clock3, Compass, Flame, Sparkles, ArrowUpRight } from 'lucide-react';
import { api } from '../api.js';
import { readCachedRadarLocation } from '../radar-location.js';
import { t } from '../i18n-ui.js';
import './one-discovery-portal.css';

const modes = [
  ['pulse', Flame, 'Pulso', 'O que está a acontecer na tua comunidade'],
  ['lumes', Camera, 'Lumes', 'Partilha uma fotografia do momento'],
  ['capsules', Clock3, 'Cápsulas', 'Guarda memórias com quem importa'],
  ['agora', Compass, 'Agora', 'Descobre o mundo à tua volta'],
];
const validModes = new Set(modes.map(item => item[0]));
const safeStoredMode = () => {
  try { const v=localStorage.getItem('lumina-one-last-mode-v1'); return validModes.has(v)?v:'pulse'; }
  catch { return 'pulse'; }
};

export function OneDiscoveryPortal({ onEnter }) {
  const [mode,setMode] = useState(safeStoredMode);
  const [promptIndex,setPromptIndex] = useState(0);
  const [counts,setCounts] = useState({lumes:0,capsules:0});
  const [location,setLocation] = useState(() => readCachedRadarLocation());
  useEffect(() => {
    const id = setInterval(() => setPromptIndex(value => value+1), 4_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const update = () => { setMode(safeStoredMode()); setLocation(readCachedRadarLocation()); };
    window.addEventListener('focus',update);
    window.addEventListener('lumina:one-mode-changed',update);
    return () => {window.removeEventListener('focus',update);window.removeEventListener('lumina:one-mode-changed',update);};
  }, []);
  useEffect(() => {
    let active=true;
    Promise.allSettled([api.one.lumes(),api.one.capsules()]).then(([l,c])=>{
      if(!active)return;
      setCounts({
        lumes:l.status==='fulfilled'&&Array.isArray(l.value)?l.value.length:0,
        capsules:c.status==='fulfilled'&&Array.isArray(c.value)?c.value.length:0,
      });
    });
    return () => {active=false};
  },[]);
  const active = modes.find(([key])=>key===mode) || modes[0];
  const Icon = active[1];
  const subtitle = useMemo(()=>{
    if(mode==='agora' && location?.label) return t('Agora em {place}',{place:location.label});
    if(mode==='lumes' && counts.lumes) return t('{count} Lumes para ver',{count:counts.lumes});
    if(mode==='capsules' && counts.capsules) return t('{count} Cápsulas contigo',{count:counts.capsules});
    return t(active[3]);
  },[mode,location?.label,counts.lumes,counts.capsules,active]);
  const opened = () => {
    const url=new URL(window.location.href);
    url.searchParams.set('one',mode);
    window.history.replaceState(window.history.state,'',url.pathname+url.search+url.hash);
    onEnter(mode);
  };
  return <button type="button" onClick={opened}
    className="one-v3-feed-entry one-adventure-entry" data-one-adventure-mode={mode}
    data-one-adventure-personalized={mode==='agora'&&location?.label||mode==='lumes'&&counts.lumes||mode==='capsules'&&counts.capsules?'1':'0'}
    aria-label={t('Abrir Lumina One')}>
    <span className="one-adventure-portal" aria-hidden="true"/>
    <span className="one-adventure-top"><Sparkles size={13}/> LUMINA ONE <ArrowUpRight size={17}/></span>
    <span className="one-adventure-content">
      <span className={`one-adventure-symbol one-adventure-symbol-${mode}`} aria-hidden="true"><Icon size={21}/></span>
      <span className="one-adventure-copy"><strong data-one-adventure-prompt>{t(modes[(promptIndex + modes.findIndex(([key])=>key===mode))%modes.length][2])}</strong><small data-one-adventure-status>{subtitle}</small></span>
    </span>
    <span className="one-adventure-dots" aria-hidden="true">{modes.map(([key])=><i className={key===mode?'is-on':''} key={key}/>)}</span>
  </button>;
}

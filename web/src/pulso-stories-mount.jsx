import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Plus } from 'lucide-react';
import { api } from './api.js';
import { Orb } from './ui.jsx';
import { MomentComposer } from './components/Moments.jsx';
import { MomentViewer } from './components/MomentViewer.jsx';
import { useMoments } from './hooks/useMoments.js';
import { t } from './i18n-ui.js';
import './lumina-one-stories.css';

const roots = new WeakMap();

function PulsoStories() {
  const [me, setMe] = useState(null);
  const [notice, setNotice] = useState('');
  const ping = text => {
    setNotice(String(text || ''));
    window.setTimeout(() => setNotice(''), 2600);
  };
  const state = useMoments({ me, ping });

  useEffect(() => {
    let alive = true;
    api.auth.me().then(user => { if (alive) setMe(user); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => { if (me) state.loadMoments(); }, [me, state.loadMoments]);

  if (!me) return null;
  const groups = state.momentGroups;
  const own = state.myMomentGroup;
  const others = groups.filter(group => group.author.id !== me.id);
  const viewerGroup = state.viewingAuthor ? groups.find(group => group.author.id === state.viewingAuthor) : null;
  const viewerIndex = viewerGroup ? groups.indexOf(viewerGroup) : -1;

  const storyButton = (group, ownStory = false) => {
    const author = ownStory ? { id:me.id, name:me.name, palette:me.palette, avatarUrl:me.avatar_url } : group.author;
    const hasStory = ownStory ? !!own : !!group;
    const unseen = hasStory && (ownStory || group.items.some(item => !item.viewed));
    const label = ownStory ? t('A tua story') : author.name.split(' ')[0];
    const click = () => {
      if (ownStory && !own) state.setMomentComposer(true);
      else state.setViewingAuthor(author.id);
    };
    return <button key={author.id} type="button" className="one-story-button" onClick={click} aria-label={ownStory && !own ? t('Adicionar story') : label}>
      <span className={`one-story-avatar${hasStory ? ' has-story' : ''}${unseen ? ' is-unseen' : ' is-seen'}`}>
        <Orb p={author.palette} avatarUrl={author.avatarUrl} s={54}/>
        {ownStory && !own && <span className="one-story-plus"><Plus size={13} strokeWidth={3}/></span>}
      </span>
      <span className="one-story-name">{label}</span>
    </button>;
  };

  return <>
    <section className="one-story-section" aria-label={t('Stories')}>
      <div className="one-story-head">
        <div><span>{t('Stories').toLocaleUpperCase()}</span><b>{t('A acontecer agora')}</b></div>
        <small>24h</small>
      </div>
      <div className="one-story-rail">
        {storyButton(own, true)}
        {others.map(group => storyButton(group))}
      </div>
      {!others.length && !own && <div className="one-story-empty-note">{t('Segue pessoas para veres aqui as stories publicadas nas últimas 24 horas.')}</div>}
      {notice && <div className="one-story-empty-note" role="status">{notice}</div>}
    </section>

    {viewerGroup && <MomentViewer
      group={viewerGroup}
      meId={me.id}
      onView={state.viewMoment}
      onDelete={state.deleteMoment}
      onReply={state.replyToMoment}
      onReact={state.reactMoment}
      onClose={()=>state.setViewingAuthor(null)}
      onNext={()=>state.setViewingAuthor(groups[viewerIndex+1]?.author.id || null)}
      onPrev={()=>state.setViewingAuthor(groups[viewerIndex-1]?.author.id || null)}
    />}

    {state.momentComposer && <MomentComposer
      file={state.momentFile}
      setFile={state.setMomentFile}
      palette={state.momentPalette}
      setPalette={state.setMomentPalette}
      busy={state.momentBusy}
      onClose={()=>{ state.setMomentComposer(false); state.setMomentFile(null); state.setMomentPalette(0); }}
      onPublish={state.publishMoment}
    />}
  </>;
}

function mountStories() {
  const intro = document.querySelector('.one-pulse-page .one-pulse-intro');
  if (!intro || !intro.isConnected) return;
  const page = intro.parentElement;
  if (!page || page.querySelector('[data-pulso-stories-root]')) return;
  const host = document.createElement('div');
  host.dataset.pulsoStoriesRoot = 'true';
  intro.insertAdjacentElement('afterend', host);
  const root = createRoot(host);
  roots.set(host, root);
  root.render(<PulsoStories/>);
}

mountStories();
new MutationObserver(mountStories).observe(document.documentElement, { childList:true, subtree:true });

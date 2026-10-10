import React, { useState } from 'react';
import { Check, MoonStar, Sun, Sparkles } from 'lucide-react';
import { t } from '../i18n-ui.js';
import { readLanguagePreference, saveLanguagePreference } from '../i18n.js';

export const LUMINA_IDENTITY_KEY = 'lumina-identity-v1';
const IDENTITIES = [
  { id:'midnight',Icon:MoonStar,label:'Midnight',caption:'Profundo · elegante · focado',badge:'Original' },
  { id:'air',Icon:Sun,label:'Air',caption:'Claro · editorial · leve',badge:'Claro' },
  { id:'pulse',Icon:Sparkles,label:'Pulse',caption:'Vibrante · imersivo · multimédia',badge:'Vivo' },
];

export function readLuminaIdentity() {
  try {
    const stored=window.localStorage.getItem(LUMINA_IDENTITY_KEY);
    return IDENTITIES.some(item=>item.id===stored)?stored:'midnight';
  } catch {return 'midnight'}
}

export function applyLuminaIdentity(id) {
  const next=IDENTITIES.some(item=>item.id===id)?id:'midnight';
  document.body.dataset.luminaIdentity=next;
  document.documentElement.dataset.luminaIdentity=next;
  document.documentElement.style.colorScheme=next==='air'?'light':'dark';
  const themeColor=next==='air'?'#f5f7fc':next==='pulse'?'#160e29':'#0b1428';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',themeColor);
  try { window.localStorage.setItem(LUMINA_IDENTITY_KEY,next) } catch {}
  window.dispatchEvent(new CustomEvent('lumina:identity-change',{detail:{identity:next}}));
}

const LANGUAGE_OPTIONS = [
  {id:'auto',label:'Auto'},
  {id:'pt',label:'Português'},
  {id:'en',label:'English'},
  {id:'fr',label:'Français'},
  {id:'es',label:'Español'},
];

export function LuminaAppearance() {
  const [selected,setSelected]=useState(readLuminaIdentity);
  const [preferredLanguage,setPreferredLanguage]=useState(readLanguagePreference);
  const setIdentity=(next)=>{setSelected(next);applyLuminaIdentity(next)};
  const changeLanguage=(next)=>{
    if (next === preferredLanguage || !saveLanguagePreference(next)) return;
    setPreferredLanguage(next);
    // The i18n catalog is loaded once at startup. A normal reload reapplies
    // the preferred locale without affecting the session, theme or content.
    window.location.reload();
  };
  return <section className="lumina-profile-section lumina-identity-section" aria-labelledby="lumina-identity-title">
    <div className="lumina-profile-section-head">
      <strong id="lumina-identity-title">{t('A tua Lumina')}</strong>
      <span>{t('Identidade visual')}</span>
    </div>
    <p className="lumina-identity-intro">{t('Escolhe como queres viver a Lumina. O conteúdo e as tuas definições de privacidade mantêm-se iguais.')}</p>
    <div className="lumina-identity-options" role="group" aria-label={t('Identidade visual da Lumina')}>
      {IDENTITIES.map(({id,Icon,label,caption,badge})=><button key={id} type="button"
        className={`lumina-identity-choice is-${id}${selected===id?' is-selected':''}`}
        onClick={()=>setIdentity(id)} aria-pressed={selected===id}
        aria-label={`${label}, ${t(caption)}`}>
        <span className="lumina-identity-preview" aria-hidden="true">
          <span className="lumina-identity-preview-top"><span/><span/><span/></span>
          <span className="lumina-identity-preview-hero"><span/><span/></span>
          <span className="lumina-identity-preview-cards"><span/><span/><span/></span>
        </span>
        <span className="lumina-identity-choice-label"><Icon size={14}/><strong>{label}</strong>{selected===id&&<Check className="lumina-identity-check" size={15}/>}</span>
        <small>{t(caption)}</small>
        <span className="lumina-identity-badge">{t(badge)}</span>
      </button>)}
    </div>
    <p className="lumina-identity-note" role="status">
      {selected==='midnight'?t('Midnight ativo: contraste confortável e conteúdos em destaque.')
        :selected==='air'?t('Air ativo: uma interface clara, com mais espaço e leitura editorial.')
        :t('Pulse ativo: fundos intensos e maior destaque para fotografias e vídeos.')}
    </p>
    <div className="lumina-profile-section-head lumina-language-heading">
      <strong>{t('Idioma da aplicação')}</strong>
      <span>{t('No teu dispositivo')}</span>
    </div>
    <div className="lumina-language-options" role="group" aria-label={t('Idioma da aplicação')}>
      {LANGUAGE_OPTIONS.map(({id,label})=><button
        key={id} type="button" className={`lumina-language-choice${preferredLanguage===id?' is-selected':''}`}
        aria-pressed={preferredLanguage===id} onClick={()=>changeLanguage(id)}
      >{id==='auto'?t('Automático'):label}{preferredLanguage===id&&<Check size={14} aria-hidden="true"/>}</button>)}
    </div>
    <p className="lumina-language-note">{t('Podes mudar o idioma sem alterar o teu perfil, mensagens ou publicações.')}</p>
  </section>
}

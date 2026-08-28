import React, { useEffect, useState } from 'react';
import { ArrowUpRight, DoorOpen, Home } from 'lucide-react';
import { Orb, Skeleton } from '../ui.jsx';
import { t, translateDynamic } from '../i18n.js';

/** Entrada visual curta depois do login/registo, alinhada com Feed + Salas. */
export function Abertura({ me, onSkip, onRooms }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('tab') || params.has('notification') || params.has('live')) {
      onSkip();
      return undefined;
    }
    const a = setTimeout(() => setStep(1), 240);
    const b = setTimeout(() => setStep(2), 820);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);

  const firstName = me?.name?.split(' ')[0] || '';

  return (
    <div className="lumina-opening" style={{ minHeight:'100dvh', position:'relative', background:'linear-gradient(180deg,#1B2140,#10172B 52%,#0D1326)' }}>
      {step>=1&&<><div className="halo" style={{top:-70,right:-60,width:240,height:240,background:'#806BFF'}}/><div className="halo" style={{bottom:130,left:-80,width:220,height:220,background:'#557DFF',animationDelay:'.3s'}}/></>}
      <div className="opening-shell" style={{position:'relative',maxWidth:460,margin:'0 auto',padding:'26px 20px calc(28px + env(safe-area-inset-bottom))',minHeight:'100dvh',display:'flex',flexDirection:'column'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:38}}>
          {step===0?<Skeleton w={38} h={38} r={99}/>:<div className="pill"><Orb p={me.palette} avatarUrl={me.avatar_url} s={38}/></div>}
          <div style={{flex:1}}>{step===0?<Skeleton w={96} h={11}/>:<div className="m up opening-kicker">{translateDynamic(`Olá, ${firstName}`)}</div>}</div>
          {step===0?<Skeleton w={74} h={11}/>:<div className="m up opening-kicker" style={{animationDelay:'.1s'}}>Lumina</div>}
        </div>

        <div style={{marginBottom:30}}>
          {step===0?<><Skeleton w="58%" h={15} st={{marginBottom:18}}/><Skeleton w="90%" h={44} st={{marginBottom:12}}/><Skeleton w="62%" h={44}/></> : <>
            <div className="m up opening-kicker" style={{color:'var(--cobalt)',marginBottom:16}}>{t('O teu espaço está pronto')}</div>
            <h1 className="d up opening-title" style={{fontSize:'clamp(38px,10.5vw,54px)',lineHeight:.98}}>{t('Pessoas no')} <span className="it">{t('Feed')}</span>.<br/>{t('Tópicos nas')} <span className="it">{t('Salas')}</span>.</h1>
            <p className="up opening-copy" style={{fontSize:15,lineHeight:1.5,color:'var(--grey)',marginTop:18}}>{t('O Feed é o teu ponto de partida para veres quem segues. Se preferires começar por uma conversa sobre um tema, podes abrir diretamente as Salas.')}</p>
          </>}
        </div>

        <div className="opening-action-spacer" style={{height:'clamp(70px,13vh,122px)',flex:'0 0 auto'}} />

        <div className="opening-actions" style={{marginTop:0,paddingBottom:'max(8px, env(safe-area-inset-bottom))'}}>
          {step===0?<Skeleton w="100%" h={56} r={99}/>:step>=2&&<>
            <div className="m up opening-choice-label" style={{textAlign:'center',marginBottom:11,letterSpacing:'.08em'}}>{t('Escolhe onde queres começar')}</div>
            <button className="p p-brand up opening-primary-action" onClick={onSkip} style={{width:'100%',minHeight:56,padding:15,fontSize:15,display:'flex',alignItems:'center',justifyContent:'center',gap:9}}><Home size={17}/>{t('Entrar no Feed')}</button>
            <button className="p p-brand up opening-secondary-action" onClick={onRooms} style={{width:'100%',minHeight:56,marginTop:11,padding:15,fontSize:15,display:'flex',alignItems:'center',justifyContent:'center',gap:9}}><DoorOpen size={17}/>{t('Explorar Salas')} <ArrowUpRight size={16}/></button>
          </>}
        </div>
      </div>
    </div>
  );
}

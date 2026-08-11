import React, { useEffect, useState } from 'react';
import { ArrowUpRight, DoorOpen, Home, LockKeyhole } from 'lucide-react';
import { Orb, Skeleton } from '../ui.jsx';

/** Entrada visual curta depois do login/registo, alinhada com Feed + Salas. */
export function Abertura({ me, onSkip, onRooms }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('tab') || params.has('notification')) {
      onSkip();
      return undefined;
    }
    const a = setTimeout(() => setStep(1), 240);
    const b = setTimeout(() => setStep(2), 820);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);

  return (
    <div className="lumina-opening" style={{ minHeight:'100dvh', position:'relative', background:'linear-gradient(180deg,#EFEDFB,#DFDCF2)' }}>
      {step>=1&&<><div className="halo" style={{top:-70,right:-60,width:240,height:240,background:'#B99BFF'}}/><div className="halo" style={{bottom:130,left:-80,width:220,height:220,background:'#8F86F6',animationDelay:'.3s'}}/></>}
      <div className="opening-shell" style={{position:'relative',maxWidth:460,margin:'0 auto',padding:'26px 20px 40px',minHeight:'100dvh',display:'flex',flexDirection:'column'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:38}}>
          {step===0?<Skeleton w={38} h={38} r={99}/>:<div className="pill"><Orb p={me.palette} avatarUrl={me.avatar_url} s={38}/></div>}
          <div style={{flex:1}}>{step===0?<Skeleton w={96} h={11}/>:<div className="m up opening-kicker">Olá, {me.name.split(' ')[0]}</div>}</div>
          {step===0?<Skeleton w={74} h={11}/>:<div className="m up opening-kicker" style={{animationDelay:'.1s'}}>Lumina</div>}
        </div>

        <div style={{marginBottom:30}}>
          {step===0?<><Skeleton w="58%" h={15} st={{marginBottom:18}}/><Skeleton w="90%" h={44} st={{marginBottom:12}}/><Skeleton w="62%" h={44}/></> : <>
            <div className="m up opening-kicker" style={{color:'var(--cobalt)',marginBottom:16}}>O teu espaço está pronto</div>
            <h1 className="d up opening-title" style={{fontSize:'clamp(38px,10.5vw,54px)',lineHeight:.98}}>Pessoas no <span className="it">Feed</span>.<br/>Tópicos nas <span className="it">Salas</span>.</h1>
            <p className="up opening-copy" style={{fontSize:15,lineHeight:1.5,color:'var(--grey)',marginTop:18}}>Segue pessoas para construíres o teu Feed cronológico. Nas Salas podes descobrir temas, criar espaços públicos ou privados e conversar com quem quiseres.</p>
          </>}
        </div>

        {step>=2&&<div className="up" style={{animationDelay:'.2s',marginBottom:'auto',display:'grid',gap:10}}>
          <div className="card opening-card" style={{padding:16,display:'flex',gap:12,alignItems:'center'}}>
            <div className="opening-card-icon" style={{width:42,height:42,borderRadius:16,display:'grid',placeItems:'center',background:'#ECE9FF',color:'var(--cobalt)',flexShrink:0}}><Home size={19}/></div>
            <div><b style={{display:'block',fontSize:14.5}}>Feed</b><span style={{fontSize:12.5,lineHeight:1.4,color:'var(--grey)'}}>Publicações da tua rede por ordem cronológica.</span></div>
          </div>
          <div className="card opening-card" style={{padding:16,display:'flex',gap:12,alignItems:'center'}}>
            <div className="opening-card-icon" style={{width:42,height:42,borderRadius:16,display:'grid',placeItems:'center',background:'#ECE9FF',color:'var(--cobalt)',flexShrink:0}}><DoorOpen size={19}/></div>
            <div style={{flex:1}}><b style={{display:'block',fontSize:14.5}}>Salas</b><span style={{fontSize:12.5,lineHeight:1.4,color:'var(--grey)'}}>Espaços para temas, públicos ou privados por convite.</span></div>
            <LockKeyhole size={15} color="var(--grey)"/>
          </div>
        </div>}

        <div style={{marginTop:34}}>
          {step===0?<Skeleton w="100%" h={52} r={99}/>:step>=2&&<><button className="p p-brand up" onClick={onRooms} style={{width:'100%',padding:15,fontSize:15,display:'flex',alignItems:'center',justifyContent:'center',gap:9}}><DoorOpen size={17}/>Explorar Salas <ArrowUpRight size={17}/></button><button className="p up" onClick={onSkip} style={{width:'100%',marginTop:10,padding:'13px 16px',fontSize:15,background:'rgba(255,255,255,.45)',color:'var(--ink)',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}><Home size={16}/>Ir para o Feed</button></>}
        </div>
      </div>
    </div>
  );
}

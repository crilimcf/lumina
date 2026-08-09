import React, { useEffect, useState } from 'react';
import { ArrowUpRight, DoorOpen } from 'lucide-react';
import { Orb, Skeleton } from '../ui.jsx';

/** Abertura diária sem convites: uma entrada visual curta antes do Feed. */
export function Abertura({ me, coms, days, onSkip, onRooms, onCreateCommunity }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const a = setTimeout(() => setStep(1), 240);
    const b = setTimeout(() => setStep(2), 820);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);

  const total = days.filter(d => d.answered).length;
  return (
    <div style={{ minHeight:'100dvh', position:'relative', background:'linear-gradient(180deg,#EFEDFB,#DFDCF2)' }}>
      {step>=1&&<><div className="halo" style={{top:-70,right:-60,width:240,height:240,background:'#B99BFF'}}/><div className="halo" style={{bottom:130,left:-80,width:220,height:220,background:'#8F86F6',animationDelay:'.3s'}}/></>}
      <div style={{position:'relative',maxWidth:460,margin:'0 auto',padding:'26px 20px 40px',minHeight:'100dvh',display:'flex',flexDirection:'column'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:38}}>
          {step===0?<Skeleton w={38} h={38} r={99}/>:<div className="pill"><Orb p={me.palette} avatarUrl={me.avatar_url} s={38}/></div>}
          <div style={{flex:1}}>{step===0?<Skeleton w={96} h={11}/>:<div className="m up">Olá, {me.name.split(' ')[0]}</div>}</div>
          {step===0?<Skeleton w={74} h={11}/>:<div className="m up" style={{animationDelay:'.1s'}}>Lumina</div>}
        </div>

        <div style={{marginBottom:30}}>
          {step===0?<><Skeleton w="58%" h={15} st={{marginBottom:18}}/><Skeleton w="90%" h={44} st={{marginBottom:12}}/><Skeleton w="62%" h={44}/></> : coms.length===0 ? <>
            <div className="m up" style={{color:'var(--cobalt)',marginBottom:16}}>Ainda sem comunidade</div>
            <h1 className="d up" style={{fontSize:'clamp(34px,9vw,46px)'}}>Junta-te ou cria a tua <span className="it">comunidade</span></h1>
            <p className="up" style={{fontSize:15,lineHeight:1.45,color:'var(--grey)',marginTop:16}}>A comunidade liga-te às pessoas; as Salas dão espaço aos tópicos. Começa por criar ou escolher a tua comunidade.</p>
          </> : <>
            <div className="m up" style={{color:'var(--cobalt)',marginBottom:16}}>O teu espaço está pronto</div>
            <h1 className="d up" style={{fontSize:'clamp(40px,11vw,56px)',lineHeight:.98}}>Pessoas no <span className="it">Feed</span>.<br/>Tópicos nas <span className="it">Salas</span>.</h1>
            <p className="up" style={{fontSize:15,lineHeight:1.5,color:'var(--grey)',marginTop:18}}>Sem publicidade misturada nas conversas. Entra no Feed para ver a tua gente ou abre uma Sala para falar sobre um tema.</p>
          </>}
        </div>

        {step>=2&&<div className="up" style={{animationDelay:'.2s',marginBottom:'auto'}}>
          <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:13}}><span className="m">A tua jornada</span><span className="m">{total} dias com atividade</span></div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(14,1fr)',gap:7}}>{days.slice(0,27).map((d,i)=><div key={d.date} className="dot" style={{aspectRatio:'1',background:d.answered?'var(--ink)':'rgba(20,18,42,.09)',transform:d.answered?'none':'scale(.62)',transitionDelay:`${i*22}ms`}}/>)}<div className="dot glow" style={{aspectRatio:'1',background:'var(--cobalt)'}}/></div>
        </div>}

        <div style={{marginTop:34}}>
          {step===0?<Skeleton w="100%" h={52} r={99}/>:step>=2&&(coms.length===0?<button className="p p-brand up" onClick={onCreateCommunity} style={{width:'100%',padding:15,fontSize:15,display:'flex',alignItems:'center',justifyContent:'center',gap:9}}>Criar ou entrar numa comunidade <ArrowUpRight size={17}/></button>:<><button className="p p-brand up" onClick={onSkip} style={{width:'100%',padding:15,fontSize:15,display:'flex',alignItems:'center',justifyContent:'center',gap:9}}>Ver o feed <ArrowUpRight size={17}/></button><button className="p up" onClick={onRooms} style={{width:'100%',marginTop:10,padding:'13px 16px',fontSize:15,background:'rgba(255,255,255,.45)',color:'var(--ink)',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}><DoorOpen size={16}/>Explorar Salas</button></>)}
        </div>
      </div>
    </div>
  );
}

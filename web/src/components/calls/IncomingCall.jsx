import React, { useEffect } from 'react';
import { Phone, Video } from 'lucide-react';
import { Orb } from '../../ui.jsx';
import { startCallRingtone, stopCallRingtone } from './ringtone.js';
import '../../rooms-calls-facelift.css';

export function IncomingCall({ call, busy, onAccept, onDecline }) {
  useEffect(() => {
    if (!call) return undefined;
    startCallRingtone().catch(() => {});
    return () => stopCallRingtone();
  }, [call?.id]);

  if (!call) return null;

  const accept = () => {
    stopCallRingtone();
    onAccept?.();
  };
  const decline = () => {
    stopCallRingtone();
    onDecline?.();
  };

  return <div role="dialog" aria-modal="true" aria-label={`Chamada recebida de ${call.name}`} style={{position:'fixed',inset:0,zIndex:205,background:'radial-gradient(circle at 50% 28%,#49347D,#17102E 48%,#080711 80%)',display:'grid',placeItems:'center',color:'#fff',padding:22}}>
    <div style={{width:'100%',maxWidth:360,textAlign:'center'}}>
      <div style={{padding:7,borderRadius:'50%',background:'linear-gradient(135deg,#FF6558,#624DFF)',display:'inline-grid'}}><Orb p={call.palette} avatarUrl={call.avatar_url} s={118}/></div>
      <div className="d" style={{fontSize:34,marginTop:19,color:'#fff'}}>{call.name}</div>
      <div style={{marginTop:8,opacity:.72}}>{call.mode==='video'?'Videochamada recebida':'Chamada áudio recebida'}</div>
      <div style={{marginTop:7,fontSize:12,opacity:.52}}>A tocar enquanto a Lumina estiver aberta</div>
      <div style={{display:'flex',justifyContent:'center',gap:34,marginTop:46}}>
        <button disabled={busy} onClick={decline} aria-label="Recusar chamada" style={{width:68,height:68,borderRadius:99,border:0,background:'#FF5149',color:'#fff',display:'grid',placeItems:'center',transform:'rotate(135deg)'}}><Phone size={29}/></button>
        <button disabled={busy} onClick={accept} aria-label="Atender chamada" style={{width:68,height:68,borderRadius:99,border:0,background:'#36C978',color:'#fff',display:'grid',placeItems:'center'}}>{call.mode==='video'?<Video size={29}/>:<Phone size={29}/>}</button>
      </div>
      <div style={{marginTop:18,fontSize:12,opacity:.6}}>Lumina</div>
    </div>
  </div>;
}

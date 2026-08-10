import React from 'react';
import { Phone, Video } from 'lucide-react';
import { Orb } from '../../ui.jsx';

export function IncomingCall({ call, busy, onAccept, onDecline }) {
  if (!call) return null;
  return <div role="dialog" aria-modal="true" aria-label={`Chamada recebida de ${call.name}`} style={{position:'fixed',inset:0,zIndex:205,background:'radial-gradient(circle at 50% 28%,#49347D,#17102E 48%,#080711 80%)',display:'grid',placeItems:'center',color:'#fff',padding:22}}>
    <div style={{width:'100%',maxWidth:360,textAlign:'center'}}>
      <div style={{padding:7,borderRadius:'50%',background:'linear-gradient(135deg,#FF6558,#624DFF)',display:'inline-grid'}}><Orb p={call.palette} avatarUrl={call.avatar_url} s={118}/></div>
      <div className="d" style={{fontSize:34,marginTop:19,color:'#fff'}}>{call.name}</div>
      <div style={{marginTop:8,opacity:.72}}>{call.mode==='video'?'Videochamada recebida':'Chamada áudio recebida'}</div>
      <div style={{display:'flex',justifyContent:'center',gap:34,marginTop:50}}>
        <button disabled={busy} onClick={onDecline} aria-label="Recusar chamada" style={{width:68,height:68,borderRadius:99,border:0,background:'#FF5149',color:'#fff',display:'grid',placeItems:'center',transform:'rotate(135deg)'}}><Phone size={29}/></button>
        <button disabled={busy} onClick={onAccept} aria-label="Atender chamada" style={{width:68,height:68,borderRadius:99,border:0,background:'#36C978',color:'#fff',display:'grid',placeItems:'center'}}>{call.mode==='video'?<Video size={29}/>:<Phone size={29}/>}</button>
      </div>
      <div style={{marginTop:18,fontSize:12,opacity:.6}}>Lumina</div>
    </div>
  </div>;
}

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CameraOff, Mic, MicOff, PhoneOff, UsersRound, Volume2 } from 'lucide-react';
import { api } from '../../api.js';
import { Orb } from '../../ui.jsx';
import { locale } from '../../i18n.js';
import { fetchIceConfig, syncCall } from './callSync.js';

const FALLBACK_ICE_SERVERS=[{urls:['stun:stun.cloudflare.com:3478','stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302']}];
const NO_ANSWER_MS=45_000;
const dictionary={
  pt:{calling:'A chamar o grupo…',connecting:'A ligar…',live:'Em videochamada',reconnecting:'A restabelecer…',noAnswer:'Ninguém atendeu',permission:'Permite microfone e câmara para entrar na videochamada.',unsupported:'Este dispositivo/browser não permite videochamadas WebRTC.',audio:'Ativar áudio',mute:'Desativar microfone',unmute:'Ativar microfone',cameraOff:'Desativar câmara',cameraOn:'Ativar câmara',hangup:'Sair da chamada',waiting:'À espera de entrar…',people:'pessoas'},
  fr:{calling:'Appel du groupe…',connecting:'Connexion…',live:'Appel vidéo en cours',reconnecting:'Reconnexion…',noAnswer:'Personne n’a répondu',permission:'Autorise le micro et la caméra pour rejoindre l’appel vidéo.',unsupported:'Cet appareil ou navigateur ne permet pas les appels vidéo WebRTC.',audio:'Activer le son',mute:'Couper le micro',unmute:'Activer le micro',cameraOff:'Couper la caméra',cameraOn:'Activer la caméra',hangup:'Quitter l’appel',waiting:'En attente de connexion…',people:'personnes'},
  en:{calling:'Calling the group…',connecting:'Connecting…',live:'In video call',reconnecting:'Reconnecting…',noAnswer:'No one answered',permission:'Allow microphone and camera to join the video call.',unsupported:'This device or browser does not support WebRTC video calls.',audio:'Enable audio',mute:'Mute microphone',unmute:'Unmute microphone',cameraOff:'Turn camera off',cameraOn:'Turn camera on',hangup:'Leave call',waiting:'Waiting to join…',people:'people'},
  es:{calling:'Llamando al grupo…',connecting:'Conectando…',live:'En videollamada',reconnecting:'Reconectando…',noAnswer:'Nadie ha respondido',permission:'Permite el micrófono y la cámara para entrar en la videollamada.',unsupported:'Este dispositivo o navegador no permite videollamadas WebRTC.',audio:'Activar audio',mute:'Silenciar micrófono',unmute:'Activar micrófono',cameraOff:'Apagar cámara',cameraOn:'Encender cámara',hangup:'Salir de la llamada',waiting:'Esperando para entrar…',people:'personas'},
};
const copy=dictionary[String(locale||'pt').slice(0,2).toLowerCase()]||dictionary.en;

function RemoteTile({participant,stream}){
  const ref=useRef(null);
  useEffect(()=>{const node=ref.current;if(!node||!stream)return;node.srcObject=stream;node.play?.().catch(()=>{});},[stream]);
  return <div style={{position:'relative',minWidth:0,minHeight:0,borderRadius:20,overflow:'hidden',background:'radial-gradient(circle at 50% 35%,#35296A,#0D0B19 72%)'}}>
    {stream?<video ref={ref} autoPlay playsInline data-group-remote-video="1" aria-label={`Vídeo de ${participant.name}`} style={{width:'100%',height:'100%',objectFit:'cover'}}/>:<div style={{position:'absolute',inset:0,display:'grid',placeItems:'center'}}><div style={{textAlign:'center'}}><Orb p={participant.palette} avatarUrl={participant.avatar_url} s={72}/><div style={{marginTop:8,fontWeight:800,fontSize:14}}>{participant.name}</div><small style={{opacity:.55}}>{copy.waiting}</small></div></div>}
    <div style={{position:'absolute',left:9,bottom:8,padding:'5px 8px',borderRadius:999,background:'rgba(0,0,0,.45)',backdropFilter:'blur(8px)',fontSize:11,fontWeight:800}}>{participant.name}</div>
  </div>;
}

export function GroupCallOverlay({call,onClosed,ping}){
  const [phase,setPhase]=useState(call.status==='ringing'?copy.calling:copy.connecting);
  const [participants,setParticipants]=useState(call.participants||[]);
  const [streams,setStreams]=useState({});
  const [muted,setMuted]=useState(false);
  const [cameraOff,setCameraOff]=useState(false);
  const [needsAudioTap,setNeedsAudioTap]=useState(false);
  const localVideo=useRef(null);
  const localStream=useRef(null);
  const pcs=useRef(new Map());
  const pendingIce=useRef(new Map());
  const pollRef=useRef(null);
  const lastSignal=useRef(0);
  const closed=useRef(false);
  const iceServers=useRef(FALLBACK_ICE_SERVERS);
  const startedAt=useRef(Date.now());
  const selfId=call.self_id;

  const joined=useMemo(()=>participants.filter(item=>item.status==='joined'),[participants]);
  const selfParticipant=participants.find(item=>item.id===selfId)||{name:'Tu',palette:0,avatar_url:null};
  const remoteParticipants=joined.filter(item=>item.id!==selfId);
  const tileCount=Math.max(1,remoteParticipants.length+1);
  const columns=tileCount<=2?1:2;

  const signal=(peerId,kind,data)=>api.calls.signal(call.id,kind,{to:peerId,data});

  const closePeer=peerId=>{
    const pc=pcs.current.get(peerId);try{pc?.close()}catch{}pcs.current.delete(peerId);pendingIce.current.delete(peerId);
    setStreams(current=>{if(!current[peerId])return current;const next={...current};delete next[peerId];return next});
  };

  const flushIce=async(peerId,pc)=>{
    if(!pc.remoteDescription)return;
    const queue=pendingIce.current.get(peerId)||[];pendingIce.current.set(peerId,[]);
    for(const candidate of queue){try{await pc.addIceCandidate(new RTCIceCandidate(candidate))}catch{}}
  };

  const ensurePeer=async(peerId,{offer=false}={})=>{
    if(pcs.current.has(peerId))return pcs.current.get(peerId);
    if(!localStream.current)return null;
    const pc=new RTCPeerConnection({iceServers:iceServers.current,iceCandidatePoolSize:2});
    pcs.current.set(peerId,pc);
    localStream.current.getTracks().forEach(track=>pc.addTrack(track,localStream.current));
    pc.ontrack=event=>{
      const stream=event.streams?.[0];if(!stream)return;
      setStreams(current=>({...current,[peerId]:stream}));
      stream.getAudioTracks?.().forEach(track=>{track.enabled=true});
      setPhase(copy.live);
    };
    pc.onicecandidate=event=>{if(event.candidate)signal(peerId,'ice',event.candidate.toJSON?.()||event.candidate).catch(()=>{})};
    pc.onconnectionstatechange=()=>{
      if(pc.connectionState==='connected')setPhase(copy.live);
      if(pc.connectionState==='disconnected')setPhase(copy.reconnecting);
      if(pc.connectionState==='failed'){closePeer(peerId);}
    };
    if(offer){
      const description=await pc.createOffer();
      await pc.setLocalDescription(description);
      await signal(peerId,'offer',{type:description.type,sdp:description.sdp});
    }
    return pc;
  };

  const handleSignal=async item=>{
    const peerId=item.sender_id;
    if(!peerId||peerId===selfId)return;
    if(item.kind==='hangup'){closePeer(peerId);return}
    if(item.kind==='offer'){
      const pc=await ensurePeer(peerId);if(!pc)return;
      if(pc.signalingState!=='stable'){try{await pc.setLocalDescription({type:'rollback'})}catch{}}
      await pc.setRemoteDescription(new RTCSessionDescription(item.payload));
      await flushIce(peerId,pc);
      const answer=await pc.createAnswer();await pc.setLocalDescription(answer);
      await signal(peerId,'answer',{type:answer.type,sdp:answer.sdp});return;
    }
    const pc=await ensurePeer(peerId);if(!pc)return;
    if(item.kind==='answer'){
      if(pc.signalingState==='have-local-offer'){await pc.setRemoteDescription(new RTCSessionDescription(item.payload));await flushIce(peerId,pc)}
      return;
    }
    if(item.kind==='ice'&&item.payload){
      if(!pc.remoteDescription){const queue=pendingIce.current.get(peerId)||[];queue.push(item.payload);pendingIce.current.set(peerId,queue);return}
      try{await pc.addIceCandidate(new RTCIceCandidate(item.payload))}catch{}
    }
  };

  const shouldOfferTo=peer=>{
    const self=participants.find(item=>item.id===selfId);
    if(!self?.joined_at||!peer?.joined_at)return false;
    const ours=`${new Date(self.joined_at).toISOString()}|${selfId}`;
    const theirs=`${new Date(peer.joined_at).toISOString()}|${peer.id}`;
    return ours>theirs;
  };

  const sync=async()=>{
    const state=await syncCall(call.id,lastSignal.current);
    for(const item of state.signals||[]){lastSignal.current=Math.max(lastSignal.current,Number(item.id)||0);await handleSignal(item)}
    const next=state.participants||[];setParticipants(next);
    if(state.status==='ended'){cleanup();return}
    const livePeers=next.filter(item=>item.status==='joined'&&item.id!==selfId);
    for(const peerId of [...pcs.current.keys()])if(!livePeers.some(item=>item.id===peerId))closePeer(peerId);
    for(const peer of livePeers)if(!pcs.current.has(peer.id)&&shouldOfferTo(peer))await ensurePeer(peer.id,{offer:true});
    if(livePeers.length>0)setPhase(copy.live);
    else if(state.status==='ringing'&&Date.now()-startedAt.current>NO_ANSWER_MS&&call.initiator_id===selfId){setPhase(copy.noAnswer);await api.calls.end(call.id).catch(()=>{});setTimeout(()=>cleanup(),900)}
  };

  const cleanup=async({notify=false}={})=>{
    if(closed.current)return;closed.current=true;clearInterval(pollRef.current);pollRef.current=null;
    for(const peerId of [...pcs.current.keys()])closePeer(peerId);
    localStream.current?.getTracks?.().forEach(track=>track.stop());localStream.current=null;
    if(notify)await api.calls.end(call.id).catch(()=>{});
    onClosed?.();
  };

  useEffect(()=>{let mounted=true;(async()=>{try{
    if(!navigator.mediaDevices?.getUserMedia||typeof RTCPeerConnection==='undefined')throw new Error(copy.unsupported);
    const [stream,ice]=await Promise.all([
      navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:{facingMode:'user',width:{ideal:640,max:960},height:{ideal:360,max:540},frameRate:{ideal:24,max:30}}}),
      fetchIceConfig().catch(()=>null),
    ]);
    if(!mounted){stream.getTracks().forEach(track=>track.stop());return}
    localStream.current=stream;iceServers.current=Array.isArray(ice?.iceServers)&&ice.iceServers.length?ice.iceServers:FALLBACK_ICE_SERVERS;
    if(localVideo.current){localVideo.current.srcObject=stream;localVideo.current.play?.().catch(()=>{})}
    await sync();pollRef.current=setInterval(()=>sync().catch(()=>{}),1500);
  }catch(error){ping?.(error?.name==='NotAllowedError'?copy.permission:error.message);cleanup({notify:true})}})();
    return()=>{mounted=false;cleanup()};
  },[call.id]);

  const playAll=async()=>{
    let failed=false;for(const video of document.querySelectorAll('[data-group-remote-video]')){try{await video.play?.()}catch{failed=true}}
    setNeedsAudioTap(failed);
  };
  useEffect(()=>{if(Object.keys(streams).length)playAll().catch(()=>setNeedsAudioTap(true))},[streams]);
  const toggleMute=()=>{const next=!muted;localStream.current?.getAudioTracks?.().forEach(track=>{track.enabled=!next});setMuted(next)};
  const toggleCamera=()=>{const next=!cameraOff;localStream.current?.getVideoTracks?.().forEach(track=>{track.enabled=!next});setCameraOff(next)};

  return <div role="dialog" aria-modal="true" aria-label={`${call.group_name||call.name} · ${copy.live}`} style={{position:'fixed',inset:0,zIndex:210,background:'#070712',color:'#fff',display:'flex',flexDirection:'column',padding:'calc(10px + env(safe-area-inset-top)) 10px calc(18px + env(safe-area-inset-bottom))'}}>
    <header style={{display:'flex',alignItems:'center',gap:10,padding:'4px 4px 10px'}}><span style={{width:38,height:38,borderRadius:14,display:'grid',placeItems:'center',background:'linear-gradient(135deg,#6E58FF,#FF5E7A)'}}><UsersRound size={19}/></span><div style={{minWidth:0,flex:1}}><strong style={{display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{call.group_name||call.name}</strong><small style={{opacity:.58}}>{phase} · {joined.length}/{participants.length} {copy.people}</small></div></header>
    <div style={{flex:1,minHeight:0,display:'grid',gridTemplateColumns:`repeat(${columns},minmax(0,1fr))`,gridAutoRows:'minmax(0,1fr)',gap:8}}>
      <div style={{position:'relative',minWidth:0,minHeight:0,borderRadius:20,overflow:'hidden',background:'#151327'}}><video ref={localVideo} autoPlay playsInline muted aria-label="O teu vídeo" style={{width:'100%',height:'100%',objectFit:'cover',transform:'scaleX(-1)'}}/><div style={{position:'absolute',left:9,bottom:8,padding:'5px 8px',borderRadius:999,background:'rgba(0,0,0,.45)',fontSize:11,fontWeight:800}}>{selfParticipant.name}</div></div>
      {remoteParticipants.map(participant=><RemoteTile key={participant.id} participant={participant} stream={streams[participant.id]}/>) }
    </div>
    {needsAudioTap&&<button onClick={playAll} style={{alignSelf:'center',marginTop:10,border:0,borderRadius:999,padding:'10px 14px',background:'#fff',color:'#151426',fontWeight:850,display:'flex',alignItems:'center',gap:7}}><Volume2 size={16}/>{copy.audio}</button>}
    <div style={{display:'flex',justifyContent:'center',gap:15,paddingTop:14}}><button onClick={toggleMute} aria-label={muted?copy.unmute:copy.mute} style={{width:56,height:56,borderRadius:99,border:0,background:'rgba(255,255,255,.14)',color:'#fff',display:'grid',placeItems:'center'}}>{muted?<MicOff size={22}/>:<Mic size={22}/>}</button><button onClick={toggleCamera} aria-label={cameraOff?copy.cameraOn:copy.cameraOff} style={{width:56,height:56,borderRadius:99,border:0,background:'rgba(255,255,255,.14)',color:'#fff',display:'grid',placeItems:'center'}}>{cameraOff?<CameraOff size={22}/>:<Camera size={22}/>}</button><button onClick={()=>cleanup({notify:true})} aria-label={copy.hangup} style={{width:64,height:56,borderRadius:99,border:0,background:'#FF5149',color:'#fff',display:'grid',placeItems:'center'}}><PhoneOff size={24}/></button></div>
  </div>;
}

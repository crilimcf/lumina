import React, { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Mic, MicOff, PhoneOff, Volume2 } from 'lucide-react';
import { api } from '../../api.js';
import { Orb } from '../../ui.jsx';
import { fetchIceConfig, syncCall } from './callSync.js';

const FALLBACK_ICE_SERVERS = [{
  urls: [
    'stun:stun.cloudflare.com:3478',
    'stun:stun.l.google.com:19302',
    'stun:stun1.l.google.com:19302',
  ],
}];

const browserSafeIceUrl = (value) => {
  const url = String(value || '').trim();
  if (!/^(?:stun|turn|turns):/i.test(url)) return null;
  if (/^(?:stun|turn|turns):[^?]*:53(?:\?|$)/i.test(url)) return null;
  return url;
};

// Compatibilidade temporária com builds antigos. A configuração segura vem do
// backend e estas variáveis deixam de ser necessárias quando TURN server-side estiver ativo.
const LEGACY_TURN = (() => {
  const urls = String(import.meta.env.VITE_TURN_URL || '').split(',').map(browserSafeIceUrl).filter(Boolean);
  if (!urls.length) return [];
  return [{ urls, username:import.meta.env.VITE_TURN_USERNAME || '', credential:import.meta.env.VITE_TURN_CREDENTIAL || '' }];
})();

const NO_ANSWER_MS = 45_000;

/** WebRTC 1:1; a API troca apenas signaling autenticado, nunca o áudio/vídeo. */
export function CallOverlay({ call, caller, person, onClosed, ping }) {
  const [phase,setPhase]=useState(caller?'A chamar…':'A ligar…');
  const [muted,setMuted]=useState(false);
  const [cameraOff,setCameraOff]=useState(false);
  const [remoteReady,setRemoteReady]=useState(false);
  const [needsAudioTap,setNeedsAudioTap]=useState(false);
  const [networkHint,setNetworkHint]=useState('');
  const localVideo=useRef(null),remoteMedia=useRef(null),pcRef=useRef(null),streamRef=useRef(null),pollRef=useRef(null),lastSignalRef=useRef(0),closedRef=useRef(false),pendingIceRef=useRef([]),handlingOfferRef=useRef(false),restartRef=useRef(0),connectedRef=useRef(false),startedAtRef=useRef(Date.now()),relayConfiguredRef=useRef(false),noAnswerRef=useRef(false);

  const cleanup=async({notify=false}={})=>{if(closedRef.current)return;closedRef.current=true;clearInterval(pollRef.current);pollRef.current=null;try{pcRef.current?.close()}catch{}pcRef.current=null;streamRef.current?.getTracks?.().forEach(t=>t.stop());streamRef.current=null;if(notify)await api.calls.end(call.id).catch(()=>{});onClosed?.();};
  const flushIce=async()=>{const pc=pcRef.current;if(!pc?.remoteDescription)return;for(const c of pendingIceRef.current.splice(0)){try{await pc.addIceCandidate(new RTCIceCandidate(c))}catch(e){console.debug('[call] ICE rejeitado',e?.message)}}};
  const sendDescription=(kind,d)=>api.calls.signal(call.id,kind,{type:d.type,sdp:d.sdp});

  const playRemote=async()=>{
    const node=remoteMedia.current;
    if(!node)return;
    try{await node.play?.();setNeedsAudioTap(false)}catch{setNeedsAudioTap(true)}
  };

  const logSelectedRoute=async()=>{
    const pc=pcRef.current;
    if(!pc?.getStats)return;
    try{
      const stats=await pc.getStats();
      let selected=null;
      stats.forEach(report=>{if(report.type==='transport'&&report.selectedCandidatePairId)selected=stats.get(report.selectedCandidatePairId)||selected;if(report.type==='candidate-pair'&&report.selected)selected=report});
      if(!selected)return;
      const local=stats.get(selected.localCandidateId),remote=stats.get(selected.remoteCandidateId);
      console.debug('[call] ICE route',{local:local?.candidateType,remote:remote?.candidateType,protocol:local?.protocol,relayConfigured:relayConfiguredRef.current});
    }catch{}
  };

  const handleSignal=async signal=>{
    const pc=pcRef.current;if(!pc)return;
    if(signal.kind==='hangup')return cleanup();
    if(signal.kind==='offer'){
      if(caller||handlingOfferRef.current)return;
      handlingOfferRef.current=true;
      try{
        await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
        await flushIce();
        const answer=await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendDescription('answer',answer);
        setPhase('A ligar…');
      }finally{handlingOfferRef.current=false}
      return;
    }
    if(signal.kind==='answer'){
      if(!caller)return;
      if(pc.signalingState==='have-local-offer'){
        await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
        await flushIce();
      }
      return;
    }
    if(signal.kind==='ice'&&signal.payload){
      if(!pc.remoteDescription){pendingIceRef.current.push(signal.payload);return;}
      try{await pc.addIceCandidate(new RTCIceCandidate(signal.payload))}catch(e){console.debug('[call] ICE rejeitado',e?.message)}
    }
  };

  const restartIce=async()=>{
    const pc=pcRef.current;
    if(!pc||closedRef.current||restartRef.current>=2)return false;
    restartRef.current+=1;
    setPhase('A restabelecer…');
    try{
      pc.restartIce?.();
      if(caller){
        const offer=await pc.createOffer({iceRestart:true});
        await pc.setLocalDescription(offer);
        await sendDescription('offer',offer);
      }
      return true;
    }catch(e){console.debug('[call] ICE restart',e?.message);return false}
  };

  const finishNoAnswer=()=>{
    if(noAnswerRef.current||closedRef.current)return;
    noAnswerRef.current=true;
    clearInterval(pollRef.current);pollRef.current=null;
    setNetworkHint('O destinatário não atendeu.');
    setPhase('Sem resposta');
    api.calls.end(call.id).catch(()=>{});
    setTimeout(()=>cleanup(),1200);
  };

  const startPolling=()=>{
    clearInterval(pollRef.current);
    const poll=async()=>{
      try{
        const state=await syncCall(call.id,lastSignalRef.current);
        for(const signal of state.signals||[]){
          lastSignalRef.current=Math.max(lastSignalRef.current,Number(signal.id)||0);
          await handleSignal(signal);
        }
        if(state.status==='declined'){setPhase('Chamada recusada');setTimeout(()=>cleanup(),650);return}
        if(state.status==='ended'){cleanup();return}
        const elapsed=Date.now()-startedAtRef.current;
        if(caller&&state.status==='ringing'){
          if(elapsed>12000)setNetworkHint('A tentar chegar ao outro dispositivo…');
          if(elapsed>NO_ANSWER_MS)return finishNoAnswer();
        }
        if(state.status==='active'&&!connectedRef.current)setPhase('A ligar…');
        if(state.status==='active'&&!connectedRef.current&&elapsed>18000)setNetworkHint('A negociar a ligação de áudio…');
        if(state.status==='active'&&!connectedRef.current&&elapsed>32000)setNetworkHint(relayConfiguredRef.current?'A tentar uma rota alternativa…':'Esta rede está a bloquear a ligação direta…');
      }catch(e){if(!closedRef.current)console.debug('[call] sync',e?.message)}
    };
    poll();
    pollRef.current=setInterval(poll,2500);
  };

  useEffect(()=>{let mounted=true;(async()=>{try{
    if(!navigator.mediaDevices?.getUserMedia||typeof RTCPeerConnection==='undefined')throw new Error('Este dispositivo/browser não permite chamadas WebRTC.');
    const [stream,iceConfig]=await Promise.all([
      navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:call.mode==='video'?{facingMode:'user',width:{ideal:1280},height:{ideal:720}}:false}),
      fetchIceConfig().catch(error=>{console.debug('[call] ICE config fallback',error?.message);return null}),
    ]);
    if(!mounted){stream.getTracks().forEach(t=>t.stop());return;}
    streamRef.current=stream;
    if(localVideo.current){localVideo.current.srcObject=stream;localVideo.current.play?.().catch(()=>{})}
    const serverIce=Array.isArray(iceConfig?.iceServers)&&iceConfig.iceServers.length?iceConfig.iceServers:FALLBACK_ICE_SERVERS;
    const iceServers=iceConfig?.relayConfigured?serverIce:[...serverIce,...LEGACY_TURN];
    relayConfiguredRef.current=!!iceConfig?.relayConfigured||LEGACY_TURN.length>0;
    const pc=new RTCPeerConnection({iceServers,iceCandidatePoolSize:4});
    pcRef.current=pc;
    stream.getTracks().forEach(t=>pc.addTrack(t,stream));
    pc.ontrack=e=>{
      const remote=e.streams?.[0];
      if(remoteMedia.current&&remote){remoteMedia.current.srcObject=remote;playRemote()}
      connectedRef.current=true;
      setRemoteReady(true);
      setNetworkHint('');
      setPhase('Em chamada');
    };
    pc.onicecandidate=e=>{if(e.candidate)api.calls.signal(call.id,'ice',e.candidate.toJSON?.()||e.candidate).catch(()=>{})};
    pc.onicecandidateerror=e=>console.debug('[call] ICE candidate error',e?.errorCode,e?.errorText,e?.url);
    pc.oniceconnectionstatechange=()=>{
      const state=pc.iceConnectionState;
      if(state==='checking')setPhase('A ligar…');
      if(state==='connected'||state==='completed'){connectedRef.current=true;setNetworkHint('');setPhase('Em chamada');logSelectedRoute()}
      if(state==='disconnected')setPhase('A restabelecer…');
      if(state==='failed'&&!closedRef.current)restartIce();
    };
    pc.onconnectionstatechange=()=>{
      if(pc.connectionState==='connected'){connectedRef.current=true;setNetworkHint('');setPhase('Em chamada');playRemote();logSelectedRoute()}
      if(pc.connectionState==='disconnected')setPhase('A restabelecer…');
      if(pc.connectionState==='failed'&&!closedRef.current)restartIce();
    };
    startPolling();
    if(caller){const offer=await pc.createOffer();await pc.setLocalDescription(offer);await sendDescription('offer',offer)}
  }catch(e){ping?.(e?.name==='NotAllowedError'?'Permite microfone/câmara para fazer a chamada.':e.message);cleanup({notify:true})}})();return()=>{mounted=false;cleanup()};},[call.id]);

  const toggleMute=()=>{const next=!muted;streamRef.current?.getAudioTracks?.().forEach(t=>{t.enabled=!next});setMuted(next)};
  const toggleCamera=()=>{if(call.mode!=='video')return;const next=!cameraOff;streamRef.current?.getVideoTracks?.().forEach(t=>{t.enabled=!next});setCameraOff(next)};

  return <div role="dialog" aria-label={`${call.mode==='video'?'Videochamada':'Chamada áudio'} com ${person.name}`} style={{position:'fixed',inset:0,zIndex:180,background:'#080711',color:'#fff',display:'grid',overflow:'hidden'}}>
    {call.mode==='video'?<><video ref={remoteMedia} playsInline autoPlay aria-label="Vídeo remoto" style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',background:'#090713'}}/>{!remoteReady&&<div style={{position:'absolute',inset:0,display:'grid',placeItems:'center',background:'radial-gradient(circle at 50% 35%,#342466,#080711 65%)'}}><div style={{textAlign:'center',padding:24}}><Orb p={person.palette} avatarUrl={person.avatar_url} s={112}/><div className="d" style={{fontSize:31,marginTop:15,color:'#fff'}}>{person.name}</div><div style={{opacity:.68,marginTop:7}}>{phase}</div>{networkHint&&<div style={{opacity:.5,fontSize:12,marginTop:9,maxWidth:280}}>{networkHint}</div>}</div></div>}<div style={{position:'absolute',top:'calc(16px + env(safe-area-inset-top))',right:14,width:108,height:154,borderRadius:22,overflow:'hidden',border:'1px solid rgba(255,255,255,.3)',background:'#171425',boxShadow:'0 12px 30px rgba(0,0,0,.34)'}}><video ref={localVideo} playsInline autoPlay muted aria-label="O teu vídeo" style={{width:'100%',height:'100%',objectFit:'cover',transform:'scaleX(-1)'}}/></div></>:<div style={{position:'absolute',inset:0,display:'grid',placeItems:'center',background:'radial-gradient(circle at 50% 30%,#47327D,#17102E 46%,#080711 78%)'}}><div style={{textAlign:'center',transform:'translateY(-45px)',padding:24}}><div style={{padding:7,borderRadius:'50%',background:'linear-gradient(135deg,#FF6558,#624DFF)',display:'inline-grid'}}><Orb p={person.palette} avatarUrl={person.avatar_url} s={122}/></div><div className="d" style={{fontSize:34,marginTop:19,color:'#fff'}}>{person.name}</div><div style={{opacity:.68,marginTop:8}}>{phase}</div>{networkHint&&<div style={{opacity:.5,fontSize:12,marginTop:9,maxWidth:280}}>{networkHint}</div>}</div><audio ref={remoteMedia} autoPlay playsInline/></div>}
    {needsAudioTap&&<button onClick={playRemote} style={{position:'absolute',left:'50%',transform:'translateX(-50%)',bottom:'calc(108px + env(safe-area-inset-bottom))',zIndex:5,border:0,borderRadius:999,padding:'11px 16px',background:'#fff',color:'#14122A',fontWeight:800,display:'flex',alignItems:'center',gap:8}}><Volume2 size={17}/>Ativar áudio</button>}
    <div style={{position:'absolute',left:0,right:0,bottom:'calc(28px + env(safe-area-inset-bottom))',display:'flex',justifyContent:'center',gap:16,zIndex:3}}><button onClick={toggleMute} aria-label={muted?'Ativar microfone':'Desativar microfone'} style={{width:58,height:58,borderRadius:99,border:0,background:'rgba(255,255,255,.16)',backdropFilter:'blur(13px)',color:'#fff',display:'grid',placeItems:'center'}}>{muted?<MicOff/>:<Mic/>}</button>{call.mode==='video'&&<button onClick={toggleCamera} aria-label={cameraOff?'Ativar câmara':'Desativar câmara'} style={{width:58,height:58,borderRadius:99,border:0,background:'rgba(255,255,255,.16)',backdropFilter:'blur(13px)',color:'#fff',display:'grid',placeItems:'center'}}>{cameraOff?<CameraOff/>:<Camera/>}</button>}<button onClick={()=>cleanup({notify:true})} aria-label="Terminar chamada" style={{width:64,height:64,borderRadius:99,border:0,background:'#FF5149',color:'#fff',display:'grid',placeItems:'center',boxShadow:'0 10px 30px rgba(255,81,73,.34)'}}><PhoneOff size={28}/></button></div>
  </div>;
}

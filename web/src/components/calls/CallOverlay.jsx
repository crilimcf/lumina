import React, { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Mic, MicOff, PhoneOff, Volume2 } from 'lucide-react';
import { api } from '../../api.js';
import { Orb } from '../../ui.jsx';
import { syncCall } from './callSync.js';

const ICE_SERVERS = (() => {
  const servers = [{ urls: ['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302'] }];
  const turn = String(import.meta.env.VITE_TURN_URL || '').split(',').map(v=>v.trim()).filter(Boolean);
  if (turn.length) servers.push({ urls:turn, username:import.meta.env.VITE_TURN_USERNAME || '', credential:import.meta.env.VITE_TURN_CREDENTIAL || '' });
  return servers;
})();

/** WebRTC 1:1; a API troca apenas signaling autenticado, nunca o áudio/vídeo. */
export function CallOverlay({ call, caller, person, onClosed, ping }) {
  const [phase,setPhase]=useState(caller?'A chamar…':'A ligar…');
  const [muted,setMuted]=useState(false);
  const [cameraOff,setCameraOff]=useState(false);
  const [remoteReady,setRemoteReady]=useState(false);
  const [needsAudioTap,setNeedsAudioTap]=useState(false);
  const [networkHint,setNetworkHint]=useState('');
  const localVideo=useRef(null),remoteMedia=useRef(null),pcRef=useRef(null),streamRef=useRef(null),pollRef=useRef(null),lastSignalRef=useRef(0),closedRef=useRef(false),pendingIceRef=useRef([]),handlingOfferRef=useRef(false),restartRef=useRef(0),connectedRef=useRef(false),startedAtRef=useRef(Date.now());

  const cleanup=async({notify=false}={})=>{if(closedRef.current)return;closedRef.current=true;clearInterval(pollRef.current);pollRef.current=null;try{pcRef.current?.close()}catch{}pcRef.current=null;streamRef.current?.getTracks?.().forEach(t=>t.stop());streamRef.current=null;if(notify)await api.calls.end(call.id).catch(()=>{});onClosed?.();};
  const flushIce=async()=>{const pc=pcRef.current;if(!pc?.remoteDescription)return;for(const c of pendingIceRef.current.splice(0)){try{await pc.addIceCandidate(new RTCIceCandidate(c))}catch(e){console.debug('[call] ICE rejeitado',e?.message)}}};
  const sendDescription=(kind,d)=>api.calls.signal(call.id,kind,{type:d.type,sdp:d.sdp});

  const playRemote=async()=>{
    const node=remoteMedia.current;
    if(!node)return;
    try{await node.play?.();setNeedsAudioTap(false)}catch{setNeedsAudioTap(true)}
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
      // Uma resposta posterior pode pertencer a um ICE restart; só a aplicamos
      // quando existe uma oferta local pendente.
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
        if(state.status==='active'&&!connectedRef.current)setPhase('A ligar…');
        const elapsed=Date.now()-startedAtRef.current;
        if(state.status==='active'&&!connectedRef.current&&elapsed>18000)setNetworkHint('A negociar a ligação de áudio…');
        if(state.status==='active'&&!connectedRef.current&&elapsed>32000)setNetworkHint('A rede está a dificultar a ligação. A tentar uma rota alternativa…');
      }catch(e){if(!closedRef.current)console.debug('[call] sync',e?.message)}
    };
    poll();
    pollRef.current=setInterval(poll,2500);
  };

  useEffect(()=>{let mounted=true;(async()=>{try{
    if(!navigator.mediaDevices?.getUserMedia||typeof RTCPeerConnection==='undefined')throw new Error('Este dispositivo/browser não permite chamadas WebRTC.');
    const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:call.mode==='video'?{facingMode:'user',width:{ideal:1280},height:{ideal:720}}:false});
    if(!mounted){stream.getTracks().forEach(t=>t.stop());return;}
    streamRef.current=stream;
    if(localVideo.current){localVideo.current.srcObject=stream;localVideo.current.play?.().catch(()=>{})}
    const pc=new RTCPeerConnection({iceServers:ICE_SERVERS,iceCandidatePoolSize:4});
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
    pc.oniceconnectionstatechange=()=>{
      const state=pc.iceConnectionState;
      if(state==='checking')setPhase('A ligar…');
      if(state==='connected'||state==='completed'){connectedRef.current=true;setNetworkHint('');setPhase('Em chamada')}
      if(state==='disconnected')setPhase('A restabelecer…');
      if(state==='failed'&&!closedRef.current)restartIce();
    };
    pc.onconnectionstatechange=()=>{
      if(pc.connectionState==='connected'){connectedRef.current=true;setNetworkHint('');setPhase('Em chamada');playRemote()}
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

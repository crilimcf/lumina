import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { callCopy } from '../components/calls/callCopy.js';

const INCOMING_POLL_MS = 1200;

function setVoiceAudioSession(active) {
  const session = navigator.audioSession;
  if (!session) return;
  try {
    if (active) {
      session.type = 'play-and-record';
    } else {
      // WebKit needs an explicit playback -> auto reset after microphone use.
      session.type = 'playback';
      session.type = 'auto';
    }
  } catch {}
}

const notifyActivityChanged = () => window.dispatchEvent(new CustomEvent('lumina:notifications-changed'));

function createRingtone(audioRef) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return () => {};
    if (!audioRef.current || audioRef.current.state === 'closed') audioRef.current = new AudioContext();
    const ctx = audioRef.current;
    ctx.resume?.().catch(() => {});
    const play = () => {
      if (ctx.state !== 'running') { ctx.resume?.().catch(() => {}); return; }
      const now = ctx.currentTime;
      for (const offset of [0, .24]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(740, now + offset);
        osc.frequency.exponentialRampToValueAtTime(880, now + offset + .16);
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.13, now + offset + .018);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + .2);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now + offset); osc.stop(now + offset + .22);
      }
    };
    play();
    const timer = setInterval(play, 1450);
    return () => clearInterval(timer);
  } catch { return () => {}; }
}

export function useCalls({ enabled, ping }) {
  const [activeCall, setActiveCall] = useState(null);
  const [incoming, setIncoming] = useState(null);
  const [busy, setBusy] = useState(false);
  const audioRef = useRef(null);
  const checkingRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const unlock = () => {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        if (!audioRef.current || audioRef.current.state === 'closed') audioRef.current = new AudioContext();
        audioRef.current.resume?.().catch(() => {});
      } catch {}
    };
    document.addEventListener('pointerdown', unlock, { passive:true, capture:true });
    document.addEventListener('touchend', unlock, { passive:true, capture:true });
    document.addEventListener('click', unlock, { passive:true, capture:true });
    return () => {
      document.removeEventListener('pointerdown', unlock, true);
      document.removeEventListener('touchend', unlock, true);
      document.removeEventListener('click', unlock, true);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || activeCall) return;
    let alive = true;
    const check = async ({ force = false } = {}) => {
      if (checkingRef.current) return;
      if (!force && document.visibilityState !== 'visible') return;
      checkingRef.current = true;
      try {
        const call = await api.calls.incoming();
        if (alive) setIncoming(current => current?.id === call?.id ? current : call);
      } catch {}
      finally { checkingRef.current = false; }
    };
    check({ force:true });
    const timer = setInterval(check, INCOMING_POLL_MS);
    const visible = () => { if (document.visibilityState === 'visible') check({ force:true }); };
    const online = () => check({ force:true });
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('pageshow', online);
    window.addEventListener('focus', online);
    window.addEventListener('online', online);
    return () => {
      alive=false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('pageshow', online);
      window.removeEventListener('focus', online);
      window.removeEventListener('online', online);
    };
  }, [enabled, activeCall]);

  useEffect(() => {
    if (!incoming || activeCall) return;
    const stop = createRingtone(audioRef);
    try { navigator.vibrate?.([500,250,500,250,500]); } catch {}
    return () => { stop(); try { navigator.vibrate?.(0); } catch {} };
  }, [incoming, activeCall]);

  const startCall = useCallback(async (thread, mode) => {
    if (!thread || busy) return;
    const voiceCall = mode === 'audio';
    if (voiceCall) setVoiceAudioSession(true);
    setBusy(true);
    try {
      const call = await api.calls.start(thread.id, mode);
      setActiveCall({ call, caller:true, person:{ name:thread.name, handle:thread.handle, palette:thread.palette, avatar_url:thread.avatar_url } });
      if (call.callee_push_ready === false) {
        ping(callCopy.pushDisabledToast);
      }
    } catch (e) {
      if (voiceCall) setVoiceAudioSession(false);
      ping(e.message);
    } finally { setBusy(false); }
  }, [busy, ping]);

  const acceptIncoming = useCallback(async () => {
    if (!incoming || busy) return;
    const voiceCall = incoming.mode === 'audio';
    // Must be set before CallOverlay mounts and asks getUserMedia for the microphone.
    if (voiceCall) setVoiceAudioSession(true);
    setBusy(true);
    try {
      await audioRef.current?.resume?.().catch(() => {});
      const call = await api.calls.answer(incoming.id);
      setActiveCall({ call, caller:false, person:{ name:incoming.name, handle:incoming.handle, palette:incoming.palette, avatar_url:incoming.avatar_url } });
      setIncoming(null);
      notifyActivityChanged();
    } catch (e) {
      if (voiceCall) setVoiceAudioSession(false);
      ping(e.message);
      setIncoming(null);
    } finally { setBusy(false); }
  }, [incoming, busy, ping]);

  const declineIncoming = useCallback(async () => {
    const current = incoming;
    setIncoming(null);
    if (!current) return;
    try {
      await api.calls.decline(current.id);
      notifyActivityChanged();
    } catch (e) { ping(e.message); }
  }, [incoming, ping]);

  const closeActiveCall = useCallback(() => {
    setVoiceAudioSession(false);
    setActiveCall(null);
    notifyActivityChanged();
  }, []);

  return { activeCall, incoming, busy, startCall, acceptIncoming, declineIncoming, closeActiveCall };
}

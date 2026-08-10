import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

function createRingtone(audioRef) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return () => {};
    if (!audioRef.current) audioRef.current = new AudioContext();
    const ctx = audioRef.current;
    ctx.resume?.().catch(() => {});
    const play = () => {
      if (ctx.state === 'closed') return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 720;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.55);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.58);
    };
    play();
    const timer = setInterval(play, 1700);
    return () => clearInterval(timer);
  } catch { return () => {}; }
}

export function useCalls({ enabled, ping }) {
  const [activeCall, setActiveCall] = useState(null);
  const [incoming, setIncoming] = useState(null);
  const [busy, setBusy] = useState(false);
  const audioRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;
    const unlock = () => {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        if (!audioRef.current) audioRef.current = new AudioContext();
        audioRef.current.resume?.().catch(() => {});
      } catch {}
    };
    window.addEventListener('pointerdown', unlock, { once:true, passive:true });
    window.addEventListener('touchstart', unlock, { once:true, passive:true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || activeCall) return;
    let alive = true;
    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const call = await api.calls.incoming();
        if (alive) setIncoming(call);
      } catch {}
    };
    check();
    const timer = setInterval(check, 1400);
    const visible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', visible);
    return () => { alive=false; clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [enabled, activeCall]);

  useEffect(() => {
    if (!incoming || activeCall) return;
    const stop = createRingtone(audioRef);
    try { navigator.vibrate?.([500,250,500,250,500]); } catch {}
    return () => { stop(); try { navigator.vibrate?.(0); } catch {} };
  }, [incoming, activeCall]);

  const startCall = useCallback(async (thread, mode) => {
    if (!thread || busy) return;
    setBusy(true);
    try {
      const call = await api.calls.start(thread.id, mode);
      setActiveCall({ call, caller:true, person:{ name:thread.name, handle:thread.handle, palette:thread.palette, avatar_url:thread.avatar_url } });
    } catch (e) { ping(e.message); }
    finally { setBusy(false); }
  }, [busy, ping]);

  const acceptIncoming = useCallback(async () => {
    if (!incoming || busy) return;
    setBusy(true);
    try {
      const call = await api.calls.answer(incoming.id);
      setActiveCall({ call, caller:false, person:{ name:incoming.name, handle:incoming.handle, palette:incoming.palette, avatar_url:incoming.avatar_url } });
      setIncoming(null);
    } catch (e) { ping(e.message); setIncoming(null); }
    finally { setBusy(false); }
  }, [incoming, busy, ping]);

  const declineIncoming = useCallback(async () => {
    const current = incoming;
    setIncoming(null);
    if (!current) return;
    try { await api.calls.decline(current.id); }
    catch (e) { ping(e.message); }
  }, [incoming, ping]);

  const closeActiveCall = useCallback(() => setActiveCall(null), []);

  return { activeCall, incoming, busy, startCall, acceptIncoming, declineIncoming, closeActiveCall };
}

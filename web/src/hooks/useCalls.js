import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { callCopy } from '../components/calls/callCopy.js';
import { acquireCallMedia, stopCallMedia } from '../components/calls/callMedia.js';
import { prepareCallAudioSession } from '../components/calls/audioSession.js';
import { resetCallAudioRoute, setCallAudioRoute } from '../components/calls/audioRoute.js';
import { primeCallAudio, stopCallRingtone } from '../components/calls/ringtone.js';

const INCOMING_POLL_MS = 1200;

const notifyActivityChanged = () => window.dispatchEvent(new CustomEvent('lumina:notifications-changed'));

function mediaErrorMessage(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
    return 'Permite o microfone e a câmara para fazer a chamada.';
  }
  if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
    return 'Não foi encontrado microfone/câmara disponível neste dispositivo.';
  }
  return error?.message || 'Não foi possível preparar o microfone/câmara.';
}

export function useCalls({ enabled, ping }) {
  const [activeCall, setActiveCall] = useState(null);
  const [incoming, setIncoming] = useState(null);
  const [busy, setBusy] = useState(false);
  const checkingRef = useRef(false);

  // Prime the ringtone AudioContext only while idle. Never resume a playback
  // context while a call is ringing or active because iOS may keep that
  // speaker route when getUserMedia starts.
  useEffect(() => {
    if (!enabled || activeCall || incoming) return;
    const unlock = () => { void primeCallAudio(); };
    document.addEventListener('pointerdown', unlock, { passive:true, capture:true });
    document.addEventListener('touchend', unlock, { passive:true, capture:true });
    document.addEventListener('click', unlock, { passive:true, capture:true });
    return () => {
      document.removeEventListener('pointerdown', unlock, true);
      document.removeEventListener('touchend', unlock, true);
      document.removeEventListener('click', unlock, true);
    };
  }, [enabled, activeCall, incoming]);

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

  const startCall = useCallback(async (thread, mode) => {
    if (!thread || busy) return;
    const voiceCall = mode === 'audio';
    if (voiceCall) {
      // The reliable iOS/WebKit sequence is:
      // ringtone/playback off -> audioSession auto -> getUserMedia ->
      // play-and-record/receiver. Do not put play-and-record before the mic.
      stopCallRingtone();
      prepareCallAudioSession();
    }
    setBusy(true);
    let mediaStream = null;
    try {
      // Keep getUserMedia as the first awaited operation from the user's tap.
      // Mobile Safari/Samsung can lose media user activation otherwise.
      mediaStream = await acquireCallMedia(mode);
      if (voiceCall) await setCallAudioRoute('receiver');
      const call = await api.calls.start(thread.id, mode);
      setActiveCall({
        call,
        caller:true,
        group:false,
        mediaStream,
        person:{ name:thread.name, handle:thread.handle, palette:thread.palette, avatar_url:thread.avatar_url },
      });
      mediaStream = null; // CallOverlay owns and closes it from here.
      if (call.callee_push_ready === false) ping(callCopy.pushDisabledToast);
    } catch (e) {
      stopCallMedia(mediaStream);
      if (voiceCall) await resetCallAudioRoute();
      ping(mediaErrorMessage(e));
    } finally { setBusy(false); }
  }, [busy, ping]);

  const startGroupCall = useCallback(async (group) => {
    if (!group || busy) return;
    setBusy(true);
    try {
      const call = await api.calls.start(`group:${group.id}`, 'video');
      setIncoming(null);
      setActiveCall({ call, caller:true, group:true, groupInfo:{ id:group.id, name:group.name } });
    } catch (e) {
      throw e;
    } finally { setBusy(false); }
  }, [busy]);

  const acceptIncoming = useCallback(async () => {
    if (!incoming || busy) return;
    const voiceCall = !incoming.group && incoming.mode === 'audio';
    if (voiceCall) {
      // Stop the ringtone's playback AudioContext before opening the mic. The
      // old flow resumed a speaker-routed AudioContext here, which made iOS
      // keep loudspeaker active even though the UI button was off.
      stopCallRingtone();
      prepareCallAudioSession();
    }
    setBusy(true);
    let mediaStream = null;
    try {
      if (!incoming.group) mediaStream = await acquireCallMedia(incoming.mode);
      if (voiceCall) await setCallAudioRoute('receiver');
      const call = await api.calls.answer(incoming.id);
      if (incoming.group || call.group) {
        stopCallMedia(mediaStream);
        mediaStream = null;
        setActiveCall({ call, caller:false, group:true, groupInfo:{ id:call.group_id || call.room_id, name:call.group_name || call.name } });
      } else {
        setActiveCall({
          call,
          caller:false,
          group:false,
          mediaStream,
          person:{ name:incoming.name, handle:incoming.handle, palette:incoming.palette, avatar_url:incoming.avatar_url },
        });
        mediaStream = null; // CallOverlay owns and closes it from here.
      }
      setIncoming(null);
      notifyActivityChanged();
    } catch (e) {
      stopCallMedia(mediaStream);
      if (voiceCall) await resetCallAudioRoute();
      ping(mediaErrorMessage(e));
      setIncoming(null);
    } finally { setBusy(false); }
  }, [incoming, busy, ping]);

  const declineIncoming = useCallback(async () => {
    const current = incoming;
    stopCallRingtone();
    setIncoming(null);
    if (!current) return;
    try {
      await api.calls.decline(current.id);
      notifyActivityChanged();
    } catch (e) { ping(e.message); }
  }, [incoming, ping]);

  const closeActiveCall = useCallback(() => {
    void resetCallAudioRoute();
    setActiveCall(null);
    notifyActivityChanged();
  }, []);

  return { activeCall, incoming, busy, startCall, startGroupCall, acceptIncoming, declineIncoming, closeActiveCall };
}

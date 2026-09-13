let audioContext = null;
let ringtoneTimer = null;
let vibrationTimer = null;
let primeSuspendTimer = null;
let active = false;

function context() {
  if (audioContext) return audioContext;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  audioContext = new AudioContextClass();
  return audioContext;
}

function clearTimers() {
  if (ringtoneTimer) window.clearInterval(ringtoneTimer);
  if (vibrationTimer) window.clearInterval(vibrationTimer);
  if (primeSuspendTimer) window.clearTimeout(primeSuspendTimer);
  ringtoneTimer = null;
  vibrationTimer = null;
  primeSuspendTimer = null;
}

function suspendContext() {
  const ctx = audioContext;
  if (!ctx || ctx.state !== 'running') return;
  ctx.suspend?.().catch(() => {});
}

function scheduleTone(ctx, startAt, frequency, duration = 0.24, volume = 0.055) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.025);
  gain.gain.setValueAtTime(volume, Math.max(startAt + 0.03, startAt + duration - 0.05));
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.02);
}

function ringBurst(ctx) {
  if (!active || ctx.state !== 'running') return;
  const now = ctx.currentTime + 0.015;
  scheduleTone(ctx, now, 523.25, 0.28, 0.065);
  scheduleTone(ctx, now + 0.34, 659.25, 0.3, 0.065);
  scheduleTone(ctx, now + 0.76, 523.25, 0.28, 0.06);
}

function vibrateBurst() {
  try { navigator.vibrate?.([650, 220, 650]); } catch {}
}

/**
 * Desbloqueia o AudioContext durante uma interação explícita do utilizador.
 * Depois do pulso inaudível suspendemo-lo novamente para que um contexto de
 * playback não fique a prender o iPhone ao altifalante quando começa uma
 * chamada de voz.
 */
export async function primeCallAudio() {
  const ctx = context();
  if (!ctx) return false;
  try {
    if (ctx.state === 'suspended') await ctx.resume();
    if (ctx.state !== 'running') return false;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.00001;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.015);
    if (primeSuspendTimer) window.clearTimeout(primeSuspendTimer);
    primeSuspendTimer = window.setTimeout(() => {
      primeSuspendTimer = null;
      if (!active) suspendContext();
    }, 40);
    return true;
  } catch {
    return false;
  }
}

/** Toca enquanto a chamada recebida estiver visível na app. */
export async function startCallRingtone() {
  clearTimers();
  active = true;
  const ctx = context();
  if (ctx) {
    try { if (ctx.state === 'suspended') await ctx.resume(); } catch {}
    if (active && ctx.state === 'running') {
      ringBurst(ctx);
      ringtoneTimer = window.setInterval(() => ringBurst(ctx), 2200);
    }
  }
  vibrateBurst();
  vibrationTimer = window.setInterval(vibrateBurst, 2200);
  return () => stopCallRingtone();
}

/**
 * Pára o toque e, crucialmente, suspende o AudioContext de playback. Deixar
 * este contexto ativo durante getUserMedia faz o iOS conservar a rota de
 * altifalante que estava a usar para o toque da chamada.
 */
export function stopCallRingtone() {
  active = false;
  clearTimers();
  try { navigator.vibrate?.(0); } catch {}
  suspendContext();
}

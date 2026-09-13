import { test, expect } from '@playwright/test';
import { callMediaConstraints } from '../src/components/calls/callMedia.js';

const PASSWORD = 'lumina-call-reliability-1234';

function registration(handle, name) {
  return {
    handle,
    email:`${handle}@example.test`,
    password:PASSWORD,
    name,
    birthDate:'1990-01-01',
    acceptTerms:true,
  };
}

test('constraints de chamada mantêm áudio e só ativam câmara em vídeo', () => {
  expect(callMediaConstraints('audio').audio.echoCancellation).toBe(true);
  expect(callMediaConstraints('audio').video).toBe(false);
  expect(callMediaConstraints('video').video.facingMode).toBe('user');
});

test('destinatário reutiliza media do toque, mantém alta-voz desligada e responde a oferta antiga', async ({ page, request }) => {
  await page.addInitScript(() => {
    window.__luminaTestGetUserMediaCalls = 0;

    const makeTrack = kind => ({
      kind,
      readyState:'live',
      enabled:true,
      stop() { this.readyState = 'ended'; },
    });

    const makeStream = constraints => {
      const tracks = [makeTrack('audio')];
      if (constraints?.video) tracks.push(makeTrack('video'));
      return {
        getTracks:() => tracks,
        getAudioTracks:() => tracks.filter(track => track.kind === 'audio'),
        getVideoTracks:() => tracks.filter(track => track.kind === 'video'),
      };
    };

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable:true,
      value:{
        getUserMedia:async constraints => {
          window.__luminaTestGetUserMediaCalls += 1;
          return makeStream(constraints);
        },
      },
    });

    class FakeSessionDescription {
      constructor(init) { Object.assign(this, init || {}); }
    }
    class FakeIceCandidate {
      constructor(init) { Object.assign(this, init || {}); }
    }
    class FakePeerConnection {
      constructor() {
        this.signalingState = 'stable';
        this.connectionState = 'new';
        this.iceConnectionState = 'new';
        this.remoteDescription = null;
        this.localDescription = null;
      }
      addTrack() {}
      close() { this.connectionState = 'closed'; }
      restartIce() {}
      async addIceCandidate() {}
      async setRemoteDescription(description) {
        this.remoteDescription = description;
        this.signalingState = description?.type === 'offer' ? 'have-remote-offer' : 'stable';
      }
      async setLocalDescription(description) {
        this.localDescription = description;
        this.signalingState = description?.type === 'offer' ? 'have-local-offer' : 'stable';
      }
      async createAnswer() { return { type:'answer', sdp:'v=0\r\na=lumina-test-answer\r\n' }; }
      async createOffer() { return { type:'offer', sdp:'v=0\r\na=lumina-test-offer\r\n' }; }
      async getStats() { return new Map(); }
    }

    Object.defineProperty(window, 'RTCSessionDescription', { configurable:true, value:FakeSessionDescription });
    Object.defineProperty(window, 'RTCIceCandidate', { configurable:true, value:FakeIceCandidate });
    Object.defineProperty(window, 'RTCPeerConnection', { configurable:true, value:FakePeerConnection });
  });

  const suffix = `${Date.now()}${Math.floor(Math.random()*1000)}`;
  const callerHandle = `sigcallera${suffix}`.slice(0,22);
  const calleeHandle = `sigcalleeb${suffix}`.slice(0,22);

  const callerResponse = await request.post('/api/auth/register', { data:registration(callerHandle,'Caller Signal') });
  expect(callerResponse.status()).toBe(201);
  const caller = await callerResponse.json();
  const callerHeaders = {
    authorization:`Bearer ${caller.token}`,
    'x-csrf-token':caller.csrf,
  };

  await page.goto('/');
  await page.getByRole('button', { name:'Criar conta' }).click();
  await page.getByPlaceholder('Como te chamas').fill('Callee Signal');
  await page.getByPlaceholder('Nome de utilizador').fill(calleeHandle);
  await page.locator('input[type="date"]').fill('1990-01-01');
  await page.getByPlaceholder('Email').fill(`${calleeHandle}@example.test`);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole('button', { name:'Criar conta' }).click();
  await expect(page.getByText('Bem-vindo à Lumina')).toBeVisible();

  const callee = await page.evaluate(async () => {
    const response = await fetch('/api/auth/me', { credentials:'include', cache:'no-store' });
    return response.json();
  });
  expect(callee.id).toBeTruthy();

  await page.getByRole('button', { name:'Entendido, vamos lá' }).click();
  await page.getByRole('button', { name:'Entrar no Feed' }).click();

  const threadResponse = await request.post('/api/messages/threads', {
    headers:callerHeaders,
    data:{ userId:callee.id },
  });
  expect(threadResponse.status()).toBe(201);
  const thread = await threadResponse.json();

  const callResponse = await request.post('/api/calls', {
    headers:callerHeaders,
    data:{ threadId:thread.id, mode:'audio' },
  });
  expect(callResponse.status()).toBe(201);
  const call = await callResponse.json();

  const offerResponse = await request.post(`/api/calls/${call.id}/signals`, {
    headers:callerHeaders,
    data:{ kind:'offer', payload:{ type:'offer', sdp:'v=0\r\na=lumina-pre-answer-offer\r\n' } },
  });
  expect(offerResponse.status()).toBe(201);

  const incoming = page.getByRole('dialog', { name:'Chamada recebida de Caller Signal' });
  await expect(incoming).toBeVisible({ timeout:6000 });
  await page.getByRole('button', { name:'Atender chamada' }).click();

  await expect(page.getByRole('dialog', { name:'Chamada áudio com Caller Signal' })).toBeVisible({ timeout:6000 });

  // A voice call must start on receiver/headset. Speaker is an explicit user action.
  const speakerButton = page.getByRole('button', { name:'Ativar alta-voz' });
  await expect(speakerButton).toBeVisible();
  await expect(speakerButton).toHaveAttribute('aria-pressed', 'false');

  // Media is acquired once by the Accept user action and then handed to the
  // WebRTC overlay; no second delayed getUserMedia call is allowed.
  await expect.poll(() => page.evaluate(() => window.__luminaTestGetUserMediaCalls)).toBe(1);

  await expect.poll(async () => {
    const response = await request.get(`/api/calls/${call.id}/signals?after=0`, { headers:callerHeaders });
    if (!response.ok()) return false;
    const signals = await response.json();
    return signals.some(signal => signal.kind === 'answer');
  }, { timeout:8000 }).toBe(true);
});

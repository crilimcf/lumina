import crypto from 'node:crypto';
import { pool, q } from './db.js';

const CHANNEL = 'lumina_realtime_v1';
const instanceId = crypto.randomUUID();
const subscribers = new Map();

let listenerClient = null;
let listenerStarting = null;
let listenerStopping = null;

function localPublish(event) {
  for (const userId of event.userIds || []) {
    const handlers = subscribers.get(String(userId));
    if (!handlers) continue;
    for (const handler of handlers) {
      try { handler(event); }
      catch (error) { console.debug('[realtime] subscriber', error?.message); }
    }
  }
}

function parseNotification(message) {
  try {
    const event = JSON.parse(message.payload || '{}');
    if (!event || event.origin === instanceId || !Array.isArray(event.userIds)) return;
    localPublish(event);
  } catch (error) {
    console.debug('[realtime] invalid notification', error?.message);
  }
}

function onListenerError(error) {
  console.error('[realtime] postgres listener:', error.message);
}

async function stopListenerIfIdle() {
  if (subscribers.size > 0 || !listenerClient || listenerStopping) return;
  const client = listenerClient;
  listenerClient = null;
  listenerStopping = (async () => {
    try { await client.query(`UNLISTEN ${CHANNEL}`); }
    catch (error) { console.debug('[realtime] unlisten', error?.message); }
    finally {
      client.removeListener('notification', parseNotification);
      client.removeListener('error', onListenerError);
      client.release();
      listenerStopping = null;
    }
  })();
  await listenerStopping;
}

async function ensureListener() {
  if (listenerClient) return listenerClient;
  if (listenerStarting) return listenerStarting;
  if (listenerStopping) await listenerStopping;

  listenerStarting = (async () => {
    const client = await pool.connect();
    try {
      client.on('notification', parseNotification);
      client.on('error', onListenerError);
      await client.query(`LISTEN ${CHANNEL}`);
      listenerClient = client;
      return client;
    } catch (error) {
      client.removeListener('notification', parseNotification);
      client.removeListener('error', onListenerError);
      client.release(true);
      throw error;
    } finally {
      listenerStarting = null;
    }
  })();

  return listenerStarting;
}

export async function subscribeRealtime(userId, handler) {
  const key = String(userId);
  let handlers = subscribers.get(key);
  if (!handlers) {
    handlers = new Set();
    subscribers.set(key, handlers);
  }
  handlers.add(handler);

  try { await ensureListener(); }
  catch (error) {
    handlers.delete(handler);
    if (!handlers.size) subscribers.delete(key);
    throw error;
  }

  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    const current = subscribers.get(key);
    current?.delete(handler);
    if (current && !current.size) subscribers.delete(key);
    stopListenerIfIdle().catch(error => console.debug('[realtime] stop listener', error?.message));
  };
}

export async function publishRealtime(userIds, type, data = {}) {
  const recipients = [...new Set((userIds || []).filter(Boolean).map(String))];
  if (!recipients.length) return;
  const event = {
    id: crypto.randomUUID(),
    origin: instanceId,
    userIds: recipients,
    type,
    at: new Date().toISOString(),
    ...data,
  };

  localPublish(event);
  await q('SELECT pg_notify($1, $2)', [CHANNEL, JSON.stringify(event)]);
}
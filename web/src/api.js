export class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let csrfToken = null;
let unauthorizedHandler = null;

export function onUnauthorized(handler) {
  unauthorizedHandler = handler;
}

function updateCsrfFromResponse(response) {
  const token = response.headers.get('x-csrf-token');
  if (token) csrfToken = token;
}

async function call(path, options = {}) {
  const method = options.method || 'GET';
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined && !headers['content-type']) headers['content-type'] = 'application/json';
  if (!['GET','HEAD','OPTIONS'].includes(method) && csrfToken) headers['x-csrf-token'] = csrfToken;
  const response = await fetch(`/api${path}`, {
    method,
    credentials:'include',
    cache:'no-store',
    headers,
    body: options.body === undefined ? undefined : (headers['content-type']==='application/json' ? JSON.stringify(options.body) : options.body),
  });
  updateCsrfFromResponse(response);
  let data = null;
  try { data = await response.json(); } catch {}
  if (!response.ok) {
    const error = new ApiError(response.status, data?.error || 'Erro de comunicação', data?.code);
    if (response.status === 401) unauthorizedHandler?.(error);
    throw error;
  }
  return data;
}

async function followAction(id) {
  try { return await call(`/users/${id}/follow`, { method:'POST' }); }
  catch (error) {
    if (error.status !== 409) throw error;
    return call(`/users/${id}/follow`, { method:'DELETE' });
  }
}

export const api = {
  auth: {
    me: () => call('/auth/me'),
    login: (body) => call('/auth/login', { method:'POST', body }),
    register: (body) => call('/auth/register', { method:'POST', body }),
    logout: () => call('/auth/logout', { method:'POST' }),
  },
  feed: {
    list: () => call('/posts'),
    create: (body) => call('/posts', { method:'POST', body }),
    remove: (id) => call(`/posts/${id}`, { method:'DELETE' }),
    comments: (id) => call(`/posts/${id}/comments`),
    comment: (id, body) => call(`/posts/${id}/comments`, { method:'POST', body:{ body } }),
    like: (id) => call(`/posts/${id}/like`, { method:'POST' }),
  },
  messages: {
    threads: () => call('/messages/threads'),
    thread: (id) => call(`/messages/threads/${id}`),
    createThread: (userId) => call('/messages/threads', { method:'POST', body:{ userId } }),
    send: (threadId, body) => call(`/messages/threads/${threadId}`, { method:'POST', body }),
    edit: (threadId, messageId, body) => call(`/messages/threads/${threadId}/${messageId}`, { method:'PATCH', body:{ body } }),
    remove: (threadId, messageId) => call(`/messages/threads/${threadId}/${messageId}`, { method:'DELETE' }),
    markRead: (threadId) => call(`/messages/threads/${threadId}/read`, { method:'POST' }),
    unread: () => call('/messages/unread-count'),
  },
  radar: {
    feed: (params = {}) => {
      const query = new URLSearchParams();
      for (const [key,value] of Object.entries(params)) if (value !== undefined && value !== null && value !== '') query.set(key,String(value));
      return call(`/radar${query.size ? `?${query}` : ''}`);
    },
    sources: () => call('/radar/sources'),
    sourceSync: (id) => call(`/radar/sources/${id}/sync`, { method:'POST' }),
    sync: () => call('/radar/sync', { method:'POST' }),
  },
  rooms: {
    list: () => call('/rooms'),
    get: (id) => call(`/rooms/${id}`),
    create: (b) => call('/rooms', { method: 'POST', body: b }),
    update: (id, b) => call(`/rooms/${id}`, { method: 'PATCH', body: b }),
    remove: (id) => call(`/rooms/${id}`, { method: 'DELETE' }),
    join: (id) => call(`/rooms/${id}/join`, { method: 'POST' }),
    invite: (id, userId) => call(`/rooms/${id}/invite`, { method: 'POST', body: { userId } }),
    checkoutCreate: (id) => call(`/rooms/${id}/checkout-create`, { method: 'POST' }),
    checkoutEntry: (id) => call(`/rooms/${id}/checkout-entry`, { method: 'POST' }),
    messages: (id) => call(`/rooms/${id}/messages`),
    send: (id, body) => call(`/rooms/${id}/messages`, { method: 'POST', body: { body } }),
    editMessage: (roomId, messageId, body) => call(`/rooms/${roomId}/messages/${messageId}`, { method: 'PATCH', body: { body } }),
    removeMessage: (roomId, messageId) => call(`/rooms/${roomId}/messages/${messageId}`, { method: 'DELETE' }),
  },
  calls: {
    start: (threadId, mode) => call('/calls', { method: 'POST', body: { threadId, mode } }),
    incoming: () => call('/calls/incoming'),
    get: (id) => call(`/calls/${id}`),
    answer: (id) => call(`/calls/${id}/answer`, { method: 'POST' }),
    decline: (id) => call(`/calls/${id}/decline`, { method: 'POST' }),
    end: (id) => call(`/calls/${id}/end`, { method: 'POST' }),
    signal: (id, kind, payload) => call(`/calls/${id}/signals`, { method: 'POST', body: { kind, payload } }),
    signals: (id, after = 0) => call(`/calls/${id}/signals?after=${after}`),
  },
  notifications: {
    list: (cursor) => call(`/notifications${cursor ? `?before=${encodeURIComponent(cursor)}` : ''}`),
    unread: () => call('/notifications/unread-count'),
    pushStatus: () => call('/notifications/push/status'),
    read: (id) => call(`/notifications/${id}/read`, { method: 'POST' }),
    readAll: () => call('/notifications/read-all', { method: 'POST' }),
  },
  twoFactor: {
    status: () => call('/2fa/status'),
    setup: (password) => call('/2fa/setup', { method: 'POST', body: { password } }),
    enable: (code) => call('/2fa/enable', { method: 'POST', body: { code } }),
    disable: (password) => call('/2fa/disable', { method: 'POST', body: { password } }),
  },
  sessions: {
    list: () => call('/sessions'),
    revoke: (id) => call(`/sessions/${id}`, { method: 'DELETE' }),
    revokeAll: () => call('/sessions/revoke-all', { method: 'POST' }),
  },
  moderation: {
    queue: () => call('/reports/queue'),
    resolve: (id, resolution) => call(`/reports/${id}/resolve`, { method: 'POST', body: { resolution } }),
  },
  users: {
    search: (q) => call(`/users/search?q=${encodeURIComponent(q)}`),
    get: (handle) => call(`/users/${handle}`),
    posts: (handle) => call(`/users/${handle}/posts`),
    followAction,
    follow: async (id) => {
      const result = await followAction(id);
      if (result?.pending) throw new ApiError(202, 'Pedido enviado', 'follow_pending');
      return result;
    },
    unfollow: (id) => call(`/users/${id}/follow`, { method: 'DELETE' }),
    block: (id) => call(`/users/${id}/block`, { method: 'POST' }),
    unblock: (id) => call(`/users/${id}/block`, { method: 'DELETE' }),
    blocked: () => call('/users/me/blocked'),
    followers: () => call('/users/me/followers'),
    following: () => call('/users/me/following'),
    suggestions: () => call('/users/me/suggestions'),
    privacy: () => call('/users/me/privacy'),
    setPrivacy: (isPrivate) => call('/users/me/privacy', { method: 'PATCH', body: { isPrivate } }),
    followRequests: () => call('/users/me/follow-requests'),
    acceptRequest: (id) => call(`/users/me/follow-requests/${id}/accept`, { method: 'POST' }),
    declineRequest: (id) => call(`/users/me/follow-requests/${id}/decline`, { method: 'POST' }),
  },
  reports: { create: (b) => call('/reports', { method: 'POST', body: b }) },
  moments: {
    list: () => call('/moments'),
    create: (b) => call('/moments', { method: 'POST', body: b }),
    update: (id, b) => call(`/moments/${id}`, { method: 'PATCH', body: b }),
    view: (id) => call(`/moments/${id}/view`, { method: 'POST' }),
    react: (id, kind) => call(`/moments/${id}/reactions/${kind}`, { method: 'POST' }),
    viewers: (id) => call(`/moments/${id}/viewers`),
    interactions: (id) => call(`/moments/${id}/interactions`),
    remove: (id) => call(`/moments/${id}`, { method: 'DELETE' }),
  },
  async upload(file) {
    const { uploadUrl, key } = await call('/uploads/sign', { method: 'POST', body: { mime: file.type, bytes: file.size } });
    const res = await fetch(uploadUrl, { method: 'PUT', headers: { 'content-type': file.type }, body: file });
    if (!res.ok) throw new ApiError(res.status, 'Não foi possível enviar o ficheiro');
    const { url } = await call('/uploads/confirm', { method: 'POST', body: { key } });
    return url;
  },
};
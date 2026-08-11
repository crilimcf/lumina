/** Cliente único da API Lumina. */
const BASE = import.meta.env.VITE_API_URL || '/api';
const SAFE_METHODS = new Set(['GET', 'HEAD']);
const REQUEST_TIMEOUT_MS = 12_000;

let csrfToken = null;
let unauthorizedHandler = () => {};
export const onUnauthorized = (fn) => { unauthorizedHandler = fn; };

export class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function call(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (!SAFE_METHODS.has(method) && csrfToken) headers['x-csrf-token'] = csrfToken;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(BASE + path, {
      method, headers, credentials: 'include', signal: controller.signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new ApiError(0, 'A Lumina demorou demasiado a responder. Tenta novamente.', 'timeout');
    }
    throw new ApiError(0, 'Sem ligação. Verifica a internet.', 'offline');
  } finally {
    clearTimeout(timeout);
  }
  if (res.status === 401 && auth) {
    const data = await res.json().catch(() => ({}));
    unauthorizedHandler();
    throw new ApiError(401, data.error || 'A sessão expirou', data.code || 'unauthorized');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (typeof data?.csrf === 'string') csrfToken = data.csrf;
  if (!res.ok) throw new ApiError(res.status, data.error || 'Alguma coisa correu mal', data.code);
  return data;
}

const followAction = (id) => call(`/users/${id}/follow`, { method: 'POST' });

export const api = {
  auth: {
    register: (b) => call('/auth/register', { method: 'POST', body: b, auth: false }),
    login: (b) => call('/auth/login', { method: 'POST', body: b, auth: false }),
    me: () => call('/auth/me'),
    update: (b) => call('/auth/me', { method: 'PATCH', body: b }),
    changePassword: (b) => call('/auth/change-password', { method: 'POST', body: b }),
    logout: async () => { const r = await call('/auth/logout', { method: 'POST' }); csrfToken = null; return r; },
  },
  account: {
    forgot: (email) => call('/account/forgot-password', { method: 'POST', body: { email }, auth: false }),
    reset: (b) => call('/account/reset-password', { method: 'POST', body: b, auth: false }),
    async download() {
      const res = await fetch(`${BASE}/account/export`, { credentials: 'include' });
      if (!res.ok) throw new ApiError(res.status, 'Nao foi possivel descarregar');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'lumina-os-meus-dados.json'; a.click();
      URL.revokeObjectURL(url);
    },
    remove: () => call('/account/delete', { method: 'POST' }),
    cancelRemoval: () => call('/account/delete/cancel', { method: 'POST' }),
  },
  posts: {
    feed: (cursor) => call(`/posts/feed${cursor ? `?before=${encodeURIComponent(cursor)}` : ''}`),
    promotions: (cursor) => call(`/posts/promotions${cursor ? `?before=${encodeURIComponent(cursor)}` : ''}`),
    create: (b) => call('/posts', { method: 'POST', body: b }),
    edit: (id, body) => call(`/posts/${id}`, { method: 'PATCH', body: { body } }),
    react: (id, kind) => call(`/posts/${id}/reactions/${kind}`, { method: 'POST' }),
    repost: (id) => call(`/posts/${id}/repost`, { method: 'POST' }),
    comments: (id) => call(`/posts/${id}/comments`),
    comment: (id, body) => call(`/posts/${id}/comments`, { method: 'POST', body: { body } }),
    editComment: (postId, commentId, body) => call(`/posts/${postId}/comments/${commentId}`, { method: 'PATCH', body: { body } }),
    removeComment: (postId, commentId) => call(`/posts/${postId}/comments/${commentId}`, { method: 'DELETE' }),
    remove: (id) => call(`/posts/${id}`, { method: 'DELETE' }),
  },
  radar: {
    list: ({ type, cursor, limit } = {}) => {
      const params = new URLSearchParams();
      if (type) params.set('type', type);
      if (cursor) params.set('before', cursor);
      if (limit) params.set('limit', String(limit));
      const suffix = params.size ? `?${params.toString()}` : '';
      return call(`/radar${suffix}`);
    },
    manage: (status) => call(`/radar/manage${status ? `?status=${encodeURIComponent(status)}` : ''}`),
    create: (body) => call('/radar', { method: 'POST', body }),
    edit: (id, body) => call(`/radar/${id}`, { method: 'PATCH', body }),
    archive: (id) => call(`/radar/${id}`, { method: 'DELETE' }),
    sources: () => call('/radar/sources'),
    createSource: (body) => call('/radar/sources', { method: 'POST', body }),
    editSource: (id, body) => call(`/radar/sources/${id}`, { method: 'PATCH', body }),
  },
  messages: {
    eventsUrl: () => `${BASE}/messages/events`,
    threads: () => call('/messages/threads'),
    openThread: (userId) => call('/messages/threads', { method: 'POST', body: { userId } }),
    list: (tid) => call(`/messages/threads/${tid}/messages`),
    send: (tid, b) => call(`/messages/threads/${tid}/messages`, { method: 'POST', body: b }),
    delivered: () => call('/messages/delivered', { method: 'POST' }),
    edit: (mid, body) => call(`/messages/${mid}`, { method: 'PATCH', body: { body } }),
    remove: (mid) => call(`/messages/${mid}`, { method: 'DELETE' }),
    reveal: (mid) => call(`/messages/${mid}/open`, { method: 'POST' }),
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
    send: (id, body, mediaUrl = null) => call(`/rooms/${id}/messages`, { method: 'POST', body: { body, mediaUrl } }),
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
  live: {
    config: () => call('/live/config'),
    list: () => call('/live'),
    create: (body) => call('/live', { method: 'POST', body }),
    start: (id) => call(`/live/${id}/start`, { method: 'POST' }),
    get: (id) => call(`/live/${id}`),
    heartbeat: (id) => call(`/live/${id}/heartbeat`, { method: 'POST' }),
    activity: (id, after) => call(`/live/${id}/activity${after ? `?after=${encodeURIComponent(after)}` : ''}`),
    comment: (id, body) => call(`/live/${id}/comments`, { method: 'POST', body: { body } }),
    react: (id, kind) => call(`/live/${id}/reactions/${kind}`, { method: 'POST' }),
    end: (id) => call(`/live/${id}/end`, { method: 'POST' }),
    replay: (id, replayUrl, mime) => call(`/live/${id}/replay`, { method: 'POST', body: { replayUrl, mime } }),
    deleteReplay: (id) => call(`/live/${id}/replay`, { method: 'DELETE' }),
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
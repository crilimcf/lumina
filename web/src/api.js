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
    days: () => call('/account/days'),
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
  communities: {
    list: () => call('/communities', { auth: false }),
    mine: () => call('/communities/mine'),
    create: (b) => call('/communities', { method: 'POST', body: b }),
    join: (id) => call(`/communities/${id}/join`, { method: 'POST' }),
    leave: (id) => call(`/communities/${id}/leave`, { method: 'POST' }),
  },
  invites: {
    today: (cid) => call(`/invites/${cid}/today`),
    proposals: (cid) => call(`/invites/${cid}/proposals`),
    propose: (cid, text) => call(`/invites/${cid}/proposals`, { method: 'POST', body: { text } }),
    vote: (pid) => call(`/invites/proposals/${pid}/vote`, { method: 'POST' }),
    replies: (iid) => call(`/invites/${iid}/replies`),
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
  messages: {
    threads: () => call('/messages/threads'),
    openThread: (userId) => call('/messages/threads', { method: 'POST', body: { userId } }),
    list: (tid) => call(`/messages/threads/${tid}/messages`),
    send: (tid, b) => call(`/messages/threads/${tid}/messages`, { method: 'POST', body: b }),
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
  },
  moments: {
    list: () => call('/moments'),
    create: (b) => call('/moments', { method: 'POST', body: b }),
    remove: (id) => call(`/moments/${id}`, { method: 'DELETE' }),
  },
  uploads: {
    sign: (b) => call('/uploads/sign', { method: 'POST', body: b }),
    confirm: (b) => call('/uploads/confirm', { method: 'POST', body: b }),
  },
  users: {
    search: (query) => call(`/users/search?q=${encodeURIComponent(query)}`),
    profile: (id) => call(`/users/${id}`),
    follow: followAction,
    unfollow: followAction,
    followers: (id) => call(`/users/${id}/followers`),
    following: (id) => call(`/users/${id}/following`),
    block: (id) => call(`/users/${id}/block`, { method: 'POST' }),
    unblock: (id) => call(`/users/${id}/block`, { method: 'DELETE' }),
    blocked: () => call('/users/blocked'),
  },
  notifications: {
    list: (cursor) => call(`/notifications${cursor ? `?before=${encodeURIComponent(cursor)}` : ''}`),
    unread: () => call('/notifications/unread'),
    markRead: (id) => call(`/notifications/${id}/read`, { method: 'POST' }),
    markAllRead: () => call('/notifications/read-all', { method: 'POST' }),
  },
  reports: { create: (b) => call('/reports', { method: 'POST', body: b }) },
};

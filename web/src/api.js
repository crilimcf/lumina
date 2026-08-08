/**
 * Cliente da API.
 *
 * Um sítio só para falar com o servidor. Os ecrãs chamam `api.posts.feed()`
 * e não sabem nada de fetch, cookies ou cabeçalhos.
 */

const BASE = import.meta.env.VITE_API_URL || '/api';
const SAFE_METHODS = new Set(['GET', 'HEAD']);

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
  if (body) headers['content-type'] = 'application/json';
  if (!SAFE_METHODS.has(method) && csrfToken) headers['x-csrf-token'] = csrfToken;

  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      credentials: 'include',
      body: body && JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Sem ligação. Verifica a internet.', 'offline');
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

export const api = {
  auth: {
    register: (b) => call('/auth/register', { method: 'POST', body: b, auth: false }),
    login: (b) => call('/auth/login', { method: 'POST', body: b, auth: false }),
    me: () => call('/auth/me'),
    update: (b) => call('/auth/me', { method: 'PATCH', body: b }),
    changePassword: (b) => call('/auth/change-password', { method: 'POST', body: b }),
    logout: async () => {
      const r = await call('/auth/logout', { method: 'POST' });
      csrfToken = null;
      return r;
    },
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
      const a = document.createElement('a');
      a.href = url;
      a.download = 'lumina-os-meus-dados.json';
      a.click();
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
    create: (b) => call('/posts', { method: 'POST', body: b }),
    react: (id, kind) => call(`/posts/${id}/reactions/${kind}`, { method: 'POST' }),
    repost: (id) => call(`/posts/${id}/repost`, { method: 'POST' }),
    comments: (id) => call(`/posts/${id}/comments`),
    comment: (id, body) => call(`/posts/${id}/comments`, { method: 'POST', body: { body } }),
    remove: (id) => call(`/posts/${id}`, { method: 'DELETE' }),
  },
  messages: {
    threads: () => call('/messages/threads'),
    openThread: (userId) => call('/messages/threads', { method: 'POST', body: { userId } }),
    list: (tid) => call(`/messages/threads/${tid}/messages`),
    send: (tid, b) => call(`/messages/threads/${tid}/messages`, { method: 'POST', body: b }),
    reveal: (mid) => call(`/messages/${mid}/open`, { method: 'POST' }),
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
    queue: (cid) => call(`/reports/community/${cid}`),
    resolve: (id, resolution) => call(`/reports/${id}/resolve`, { method: 'POST', body: { resolution } }),
  },
  users: {
    search: (q) => call(`/users/search?q=${encodeURIComponent(q)}`),
    get: (handle) => call(`/users/${handle}`),
    follow: (id) => call(`/users/${id}/follow`, { method: 'POST' }),
    unfollow: (id) => call(`/users/${id}/follow`, { method: 'DELETE' }),
    block: (id) => call(`/users/${id}/block`, { method: 'POST' }),
    unblock: (id) => call(`/users/${id}/block`, { method: 'DELETE' }),
    blocked: () => call('/users/me/blocked'),
    followers: () => call('/users/me/followers'),
    following: () => call('/users/me/following'),
    suggestions: () => call('/users/me/suggestions'),
  },
  reports: {
    create: (b) => call('/reports', { method: 'POST', body: b }),
  },
  moments: {
    list: () => call('/moments'),
    create: (b) => call('/moments', { method: 'POST', body: b }),
    view: (id) => call(`/moments/${id}/view`, { method: 'POST' }),
    viewers: (id) => call(`/moments/${id}/viewers`),
    remove: (id) => call(`/moments/${id}`, { method: 'DELETE' }),
  },

  async upload(file) {
    const { uploadUrl, key } = await call('/uploads/sign', {
      method: 'POST',
      body: { mime: file.type, bytes: file.size },
    });
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': file.type },
      body: file,
    });
    if (!res.ok) throw new ApiError(res.status, 'Não foi possível enviar a imagem');
    const { url } = await call('/uploads/confirm', { method: 'POST', body: { key } });
    return url;
  },
};
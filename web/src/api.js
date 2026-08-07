/**
 * Cliente da API.
 *
 * Um sítio só para falar com o servidor. Os ecrãs chamam `api.posts.feed()`
 * e não sabem nada de fetch, cookies ou cabeçalhos.
 *
 * A sessão vive num cookie HttpOnly — o browser envia-o sozinho
 * (`credentials: 'include'`), e o JavaScript nunca lhe consegue tocar. Isso
 * fecha a porta a um roubo de sessão via XSS que o localStorage deixava
 * aberta. Pedidos que mudam estado levam também o valor do cookie CSRF
 * (esse sim legível por JS) num cabeçalho — é a prova de que quem pediu foi
 * mesmo o nosso próprio JavaScript, e não um site de terceiros a explorar o
 * cookie de sessão a ser enviado sozinho.
 */

const BASE = import.meta.env.VITE_API_URL || '/api';
const CSRF_COOKIE = '__Host-lumina-csrf';
const SAFE_METHODS = new Set(['GET', 'HEAD']);

function readCsrfCookie() {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

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
  if (!SAFE_METHODS.has(method)) {
    const csrf = readCsrfCookie();
    if (csrf) headers['x-csrf-token'] = csrf;
  }

  let res;
  try {
    res = await fetch(BASE + path, { method, headers, credentials: 'include', body: body && JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'Sem ligação. Verifica a internet.', 'offline');
  }

  if (res.status === 401 && auth) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(401, data.error || 'A sessão expirou', data.code || 'unauthorized');
  }

  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));
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
    logout: () => call('/auth/logout', { method: 'POST' }),
  },
  account: {
    forgot: (email) => call('/account/forgot-password', { method: 'POST', body: { email }, auth: false }),
    reset: (b) => call('/account/reset-password', { method: 'POST', body: b, auth: false }),
    days: () => call('/account/days'),
    /**
     * Descarrega os dados. Um <a href> nao envia o cookie de sessao a um
     * pedido cross-origin da mesma forma previsivel, por isso pedimos com
     * fetch (que leva o cookie automaticamente) e guardamos o ficheiro a
     * partir da resposta.
     */
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
    list: () => call('/communities'),
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
    setup: () => call('/2fa/setup', { method: 'POST' }),
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

  /**
   * Envia uma imagem em dois passos: pede um URL assinado e envia o ficheiro
   * direto para o armazenamento. A API nunca toca no ficheiro.
   */
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
    // O servidor lê os primeiros bytes e confirma que é mesmo uma imagem.
    // Só depois disto o URL pode ser usado num post.
    const { url } = await call('/uploads/confirm', { method: 'POST', body: { key } });
    return url;
  },
};

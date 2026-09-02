from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, text):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding='utf-8')


def replace_one(path, old, new):
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one match, got {count} for {old[:80]!r}')
    write(path, text.replace(old, new, 1))


# iPhone keyboard/caret: keep the fixed thread in one coordinate space and preserve input focus.
replace_one(
    'web/src/screens/Conversas.jsx',
    "import React, { useCallback, useEffect, useMemo, useState } from 'react';",
    "import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';",
)
replace_one(
    'web/src/screens/Conversas.jsx',
    "  const [visualFrame, setVisualFrame] = useState(null);",
    "  const [visualHeight, setVisualHeight] = useState(null);\n  const composerInputRef = useRef(null);",
)
replace_one(
    'web/src/screens/Conversas.jsx',
    """  useEffect(() => {
    if (!thread || !window.visualViewport) { setVisualFrame(null); return undefined; }
    const viewport = window.visualViewport;
    let raf = 0;
    const sync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setVisualFrame({
        top:viewport.offsetTop,
        left:viewport.offsetLeft,
        width:viewport.width,
        height:viewport.height,
      }));
    };
    sync();
    viewport.addEventListener('resize', sync);
    viewport.addEventListener('scroll', sync);
    return () => {
      cancelAnimationFrame(raf);
      viewport.removeEventListener('resize', sync);
      viewport.removeEventListener('scroll', sync);
    };
  }, [thread?.id]);""",
    """  useEffect(() => {
    if (!thread || !window.visualViewport) { setVisualHeight(null); return undefined; }
    const viewport = window.visualViewport;
    let raf = 0;
    const sync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setVisualHeight(Math.max(1, Math.round(viewport.height))));
    };
    sync();
    viewport.addEventListener('resize', sync);
    return () => {
      cancelAnimationFrame(raf);
      viewport.removeEventListener('resize', sync);
    };
  }, [thread?.id]);""",
)
replace_one(
    'web/src/screens/Conversas.jsx',
    """  const focusComposer = () => {
    window.setTimeout(() => end?.current?.scrollIntoView?.({ block:'end', behavior:'smooth' }), 80);
  };""",
    """  const focusComposer = () => {
    requestAnimationFrame(() => end?.current?.scrollIntoView?.({ block:'end', behavior:'auto' }));
  };

  const keepComposerFocused = event => {
    if (document.activeElement === composerInputRef.current) event.preventDefault();
  };

  const sendWithComposerFocus = () => {
    void send();
    requestAnimationFrame(() => composerInputRef.current?.focus?.({ preventScroll:true }));
  };

  const sendOnEnter = event => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    sendWithComposerFocus();
  };""",
)
replace_one(
    'web/src/screens/Conversas.jsx',
    """    const viewportStyle = visualFrame
      ? {
          top:`${visualFrame.top}px`,
          left:`${visualFrame.left}px`,
          width:`${visualFrame.width}px`,
          height:`${visualFrame.height}px`,
        }
      : { top:0, left:0, width:'100%', height:'100dvh' };""",
    """    const viewportStyle = visualHeight
      ? { height:`${visualHeight}px` }
      : { height:'100dvh' };""",
)
replace_one(
    'web/src/screens/Conversas.jsx',
    """          <input className=\"messages-composer-input\" value={text} onChange={e=>setText(e.target.value)} onFocus={focusComposer} onKeyDown={e=>e.key==='Enter'&&send()} placeholder={t('Mensagem efémera…')}/>
          <button className=\"messages-send-button\" onClick={send} disabled={sending||!text.trim()} aria-label={t('Enviar mensagem')}><Send size={17}/></button>""",
    """          <input ref={composerInputRef} className=\"messages-composer-input\" value={text} onChange={e=>setText(e.target.value)} onFocus={focusComposer} onKeyDown={sendOnEnter} placeholder={t('Mensagem efémera…')}/>
          <button className=\"messages-send-button\" onPointerDown={keepComposerFocused} onClick={sendWithComposerFocus} disabled={sending||!text.trim()} aria-label={t('Enviar mensagem')}><Send size={17}/></button>""",
)
replace_one(
    'web/src/screens/Conversas.jsx',
    """          <input className=\"messages-composer-input\" value={text} disabled={!!mediaReady} onChange={e=>setText(e.target.value)} onFocus={focusComposer} onKeyDown={e=>e.key==='Enter'&&send()} placeholder={mediaReady?t('Media pronta para enviar'):t('Escrever…')}/>
          <button className=\"messages-send-button\" onClick={send} disabled={sending||(!text.trim()&&!mediaReady)} aria-label={t('Enviar')}><Send size={17}/></button>""",
    """          <input ref={composerInputRef} className=\"messages-composer-input\" value={text} disabled={!!mediaReady} onChange={e=>setText(e.target.value)} onFocus={focusComposer} onKeyDown={sendOnEnter} placeholder={mediaReady?t('Media pronta para enviar'):t('Escrever…')}/>
          <button className=\"messages-send-button\" onPointerDown={keepComposerFocused} onClick={sendWithComposerFocus} disabled={sending||(!text.trim()&&!mediaReady)} aria-label={t('Enviar')}><Send size={17}/></button>""",
)

# API client + hook: retrieve persistent reactions alongside message history.
replace_one(
    'web/src/api.js',
    """    list: (tid) => call(`/messages/threads/${tid}/messages`),
    send: (tid, b) => call(`/messages/threads/${tid}/messages`, { method: 'POST', body: b }),""",
    """    list: (tid) => call(`/messages/threads/${tid}/messages`),
    reactions: (tid) => call(`/messages/threads/${tid}/reactions`),
    send: (tid, b) => call(`/messages/threads/${tid}/messages`, { method: 'POST', body: b }),
    react: (mid, emoji) => call(`/messages/${mid}/reaction`, { method: 'POST', body: { emoji } }),
    unreact: (mid) => call(`/messages/${mid}/reaction`, { method: 'DELETE' }),""",
)
replace_one(
    'web/src/hooks/useMessages.js',
    """    const next = await api.messages.list(threadId);
    if (threadRef.current?.id !== threadId) return next;
    setMsgs(next);""",
    """    const [messages, reactionPayload] = await Promise.all([
      api.messages.list(threadId),
      api.messages.reactions(threadId).catch(() => ({ reactions:[] })),
    ]);
    const grouped = new Map();
    for (const row of reactionPayload?.reactions || []) {
      const entry = grouped.get(row.message_id) || { counts:new Map(), mine:null };
      entry.counts.set(row.emoji, (entry.counts.get(row.emoji) || 0) + 1);
      if (row.mine) entry.mine = row.emoji;
      grouped.set(row.message_id, entry);
    }
    const next = messages.map(message => {
      const entry = grouped.get(message.id);
      if (!entry) return { ...message, reactions:[], my_reaction:null };
      return {
        ...message,
        reactions:[...entry.counts.entries()].map(([emoji, count]) => ({ emoji, count })),
        my_reaction:entry.mine,
      };
    });
    if (threadRef.current?.id !== threadId) return next;
    setMsgs(next);""",
)

# Mount the isolated message-reactions router next to the existing messages router.
replace_one(
    'api/src/server.js',
    "import { messageRoutes } from './routes/messages.js';",
    "import { messageRoutes } from './routes/messages.js';\nimport { messageReactionRoutes } from './routes/message-reactions.js';",
)
replace_one(
    'api/src/server.js',
    "  app.use(`${prefix}/messages`, messageRoutes);",
    "  app.use(`${prefix}/messages`, messageReactionRoutes);\n  app.use(`${prefix}/messages`, messageRoutes);",
)

# iOS caret compositing: no blur layer while the text field owns the caret.
css_path = 'web/src/messages-facelift.css'
css = read(css_path)
marker = '/* iPhone chat keyboard + message reactions */'
if marker not in css:
    css += """

/* iPhone chat keyboard + message reactions */
.lumina-messages-thread.messages-visual-viewport {
  top: 0;
  left: 0;
  right: 0;
  width: 100%;
}

.messages-composer-shell:focus-within {
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
  background: #080b16;
}

.messages-composer-input {
  position: relative;
  z-index: 1;
  caret-color: #9b82ff;
  -webkit-transform: translateZ(0);
  transform: translateZ(0);
}

.message-wrap {
  position: relative;
}

.message-reaction-trigger {
  width: 25px;
  height: 25px;
  padding: 0;
  display: inline-grid;
  place-items: center;
  border: 0;
  border-radius: 999px;
  color: inherit;
  background: transparent;
  opacity: .7;
}

.message-reaction-trigger:active,
.message-reaction-trigger.is-active {
  opacity: 1;
  background: rgba(139,112,255,.13);
}

.message-reaction-tray {
  width: max-content;
  max-width: min(330px, 84vw);
  margin-top: 6px;
  padding: 6px;
  display: flex;
  align-items: center;
  gap: 3px;
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 999px;
  background: rgba(14,18,34,.96);
  box-shadow: 0 12px 34px rgba(0,0,0,.34);
  -webkit-backdrop-filter: blur(18px) saturate(140%);
  backdrop-filter: blur(18px) saturate(140%);
  z-index: 24;
}

.message-wrap-mine .message-reaction-tray { margin-left: auto; }

.message-reaction-choice {
  width: 39px;
  height: 39px;
  padding: 0;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 999px;
  background: transparent;
  font-size: 22px;
  line-height: 1;
}

.message-reaction-choice:active,
.message-reaction-choice.is-selected {
  background: rgba(139,112,255,.20);
  transform: scale(1.08);
}

.message-reaction-summary {
  margin-top: 4px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.message-wrap-mine .message-reaction-summary { justify-content: flex-end; }

.message-reaction-pill {
  min-height: 27px;
  padding: 2px 8px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid rgba(255,255,255,.10);
  border-radius: 999px;
  color: #e9e7f6;
  background: rgba(255,255,255,.07);
  font-size: 13px;
}

.message-reaction-pill.is-mine {
  border-color: rgba(139,112,255,.42);
  background: rgba(139,112,255,.17);
}
"""
    write(css_path, css)

# Release marker helps rule out stale PWA assets during physical iPhone verification.
replace_one(
    'web/index.html',
    '<meta name="lumina-ui-release" content="radar-stories-2026-08-28" />',
    '<meta name="lumina-ui-release" content="chat-iphone-reactions-2026-09-02" />',
)

# New migration.
write('api/migrations/037_message_reactions.sql', """CREATE TABLE IF NOT EXISTS message_reactions (
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL CHECK (emoji IN ('👍','❤️','😂','😮','😢','🔥')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS message_reactions_message_idx ON message_reactions(message_id);
""")

# Dedicated reactions API, kept separate from ephemeral-message lifecycle code.
write('api/src/routes/message-reactions.js', """import { Router } from 'express';
import { q } from '../db.js';
import { auth, h, bad, notFound, forbidden } from '../middleware/auth.js';
import { publishRealtime } from '../realtime.js';

export const messageReactionRoutes = Router();

const ALLOWED_REACTIONS = new Set(['👍','❤️','😂','😮','😢','🔥']);

async function blocked(a, b) {
  const { rows } = await q(
    `SELECT 1 FROM blocks
     WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)`,
    [a, b],
  );
  return !!rows[0];
}

async function participantThread(threadId, userId) {
  const { rows } = await q(
    'SELECT * FROM threads WHERE id=$1 AND (user_a=$2 OR user_b=$2)',
    [threadId, userId],
  );
  const thread = rows[0];
  if (!thread) throw forbidden('Não fazes parte desta conversa');
  const other = thread.user_a === userId ? thread.user_b : thread.user_a;
  if (await blocked(userId, other)) throw forbidden('Esta conversa já não está disponível');
  return thread;
}

async function participantMessage(messageId, userId) {
  const { rows } = await q(
    `SELECT m.id,m.thread_id,m.mode,m.deleted_at,m.purged_at,t.user_a,t.user_b
       FROM messages m JOIN threads t ON t.id=m.thread_id
      WHERE m.id=$1`,
    [messageId],
  );
  const message = rows[0];
  if (!message) throw notFound('Mensagem não encontrada');
  if (message.user_a !== userId && message.user_b !== userId) throw forbidden('Não fazes parte desta conversa');
  const other = message.user_a === userId ? message.user_b : message.user_a;
  if (await blocked(userId, other)) throw forbidden('Esta conversa já não está disponível');
  return message;
}

function ensureReactable(message) {
  if (message.deleted_at || message.purged_at || message.mode !== 'normal') {
    throw bad('Esta mensagem não pode receber reações', 'not_reactable');
  }
}

messageReactionRoutes.get('/threads/:threadId/reactions', auth, h(async (req, res) => {
  await participantThread(req.params.threadId, req.user.id);
  const { rows } = await q(
    `SELECT mr.message_id,mr.emoji,(mr.user_id=$2) AS mine
       FROM message_reactions mr
       JOIN messages m ON m.id=mr.message_id
      WHERE m.thread_id=$1
        AND m.mode='normal'
        AND m.deleted_at IS NULL
        AND m.purged_at IS NULL
      ORDER BY mr.created_at,mr.message_id`,
    [req.params.threadId, req.user.id],
  );
  res.json({ reactions:rows });
}));

messageReactionRoutes.post('/:messageId/reaction', auth, h(async (req, res) => {
  const emoji = String(req.body?.emoji || '');
  if (!ALLOWED_REACTIONS.has(emoji)) throw bad('Reação inválida', 'bad_reaction');
  const message = await participantMessage(req.params.messageId, req.user.id);
  ensureReactable(message);
  await q(
    `INSERT INTO message_reactions (message_id,user_id,emoji)
     VALUES ($1,$2,$3)
     ON CONFLICT (message_id,user_id)
     DO UPDATE SET emoji=EXCLUDED.emoji,created_at=now()`,
    [message.id, req.user.id, emoji],
  );
  await publishRealtime(
    [message.user_a, message.user_b],
    'message_reacted',
    { threadId:message.thread_id, messageId:message.id },
  );
  res.json({ messageId:message.id, emoji });
}));

messageReactionRoutes.delete('/:messageId/reaction', auth, h(async (req, res) => {
  const message = await participantMessage(req.params.messageId, req.user.id);
  ensureReactable(message);
  await q('DELETE FROM message_reactions WHERE message_id=$1 AND user_id=$2', [message.id, req.user.id]);
  await publishRealtime(
    [message.user_a, message.user_b],
    'message_reacted',
    { threadId:message.thread_id, messageId:message.id },
  );
  res.json({ messageId:message.id, reaction:null });
}));
""")

# API regression coverage.
write('api/test/message-reactions.test.js', """import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/server.js';
import { migrate, pool, q } from '../src/db.js';

let server;
let baseUrl;

async function request(path, { method='GET', token, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body:body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  return { response, data };
}

async function register(handle) {
  const out = await request('/auth/register', {
    method:'POST',
    body:{ handle, email:`${handle}@example.test`, password:'lumina-test-1234', name:handle, birthDate:'1990-01-01', acceptTerms:true },
  });
  assert.equal(out.response.status, 201, JSON.stringify(out.data));
  return out.data;
}

before(async () => {
  await migrate();
  const { rows } = await q(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations'`);
  if (rows.length) await q(`TRUNCATE ${rows.map(({tablename})=>`"${String(tablename).replaceAll('"','""')}"`).join(', ')} RESTART IDENTITY CASCADE`);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve,reject)=>{ server.once('listening',resolve); server.once('error',reject); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise(resolve=>server.close(resolve));
  await pool.end();
});

test('reações de mensagem persistem, substituem e removem sem expor outros chats', async () => {
  const alice = await register('reaction.alice');
  const bob = await register('reaction.bob');
  const charlie = await register('reaction.charlie');

  const thread = await request('/messages/threads', { method:'POST', token:alice.token, body:{ userId:bob.user.id } });
  assert.equal(thread.response.status, 201, JSON.stringify(thread.data));
  const sent = await request(`/messages/threads/${thread.data.id}/messages`, {
    method:'POST', token:alice.token, body:{ kind:'text', mode:'normal', body:'Mensagem para reagir' },
  });
  assert.equal(sent.response.status, 201, JSON.stringify(sent.data));

  const heart = await request(`/messages/${sent.data.id}/reaction`, { method:'POST', token:bob.token, body:{ emoji:'❤️' } });
  assert.equal(heart.response.status, 200, JSON.stringify(heart.data));

  const bobList = await request(`/messages/threads/${thread.data.id}/reactions`, { token:bob.token });
  assert.equal(bobList.response.status, 200);
  assert.deepEqual(bobList.data.reactions, [{ message_id:sent.data.id, emoji:'❤️', mine:true }]);

  const aliceList = await request(`/messages/threads/${thread.data.id}/reactions`, { token:alice.token });
  assert.equal(aliceList.response.status, 200);
  assert.deepEqual(aliceList.data.reactions, [{ message_id:sent.data.id, emoji:'❤️', mine:false }]);

  const replace = await request(`/messages/${sent.data.id}/reaction`, { method:'POST', token:bob.token, body:{ emoji:'👍' } });
  assert.equal(replace.response.status, 200);
  const afterReplace = await request(`/messages/threads/${thread.data.id}/reactions`, { token:bob.token });
  assert.deepEqual(afterReplace.data.reactions, [{ message_id:sent.data.id, emoji:'👍', mine:true }]);

  const intruder = await request(`/messages/${sent.data.id}/reaction`, { method:'POST', token:charlie.token, body:{ emoji:'🔥' } });
  assert.equal(intruder.response.status, 403);

  const invalid = await request(`/messages/${sent.data.id}/reaction`, { method:'POST', token:bob.token, body:{ emoji:'💣' } });
  assert.equal(invalid.response.status, 400);
  assert.equal(invalid.data.code, 'bad_reaction');

  const removed = await request(`/messages/${sent.data.id}/reaction`, { method:'DELETE', token:bob.token });
  assert.equal(removed.response.status, 200);
  const afterRemove = await request(`/messages/threads/${thread.data.id}/reactions`, { token:bob.token });
  assert.deepEqual(afterRemove.data.reactions, []);
});

test('mensagens efémeras não aceitam reações', async () => {
  const alice = await register('reaction.timer.alice');
  const bob = await register('reaction.timer.bob');
  const thread = await request('/messages/threads', { method:'POST', token:alice.token, body:{ userId:bob.user.id } });
  const sent = await request(`/messages/threads/${thread.data.id}/messages`, {
    method:'POST', token:alice.token, body:{ kind:'text', mode:'timer', body:'Segredo' },
  });
  assert.equal(sent.response.status, 201);
  const reaction = await request(`/messages/${sent.data.id}/reaction`, { method:'POST', token:bob.token, body:{ emoji:'❤️' } });
  assert.equal(reaction.response.status, 400);
  assert.equal(reaction.data.code, 'not_reactable');
});
""")

print('chat iPhone patch applied')

import { Router } from 'express';
import { q } from '../db.js';
import { auth, h, bad, HttpError } from '../middleware/auth.js';
import {
  editImage,
  embedTexts,
  generateImage,
  openaiStatus,
  recordAiUsage,
  responseText,
  saveGeneratedImage,
  sha256Text,
} from '../lib/openai.js';

export const aiRoutes = Router();

const LANG_RE = /^[a-z]{2,3}(?:-[A-Za-z]{2,8})?$/;
const clean = (value, max) => String(value || '').trim().slice(0, max);

function cosine(a, b) {
  let dot = 0;
  let aa = 0;
  let bb = 0;
  const length = Math.min(a?.length || 0, b?.length || 0);
  for (let i = 0; i < length; i += 1) {
    const x = Number(a[i] || 0);
    const y = Number(b[i] || 0);
    dot += x * y;
    aa += x * x;
    bb += y * y;
  }
  if (!aa || !bb) return 0;
  return dot / Math.sqrt(aa * bb);
}

function snippet(value, max = 220) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

aiRoutes.get('/status', auth, h(async (_req, res) => {
  const status = openaiStatus();
  res.json({ configured:status.configured, features:{ translate:true, rewrite:true, search:true, image:true } });
}));

aiRoutes.post('/translate', auth, h(async (req, res) => {
  const text = clean(req.body?.text, 4000);
  const targetLanguage = clean(req.body?.targetLanguage, 16);
  if (!text) throw bad('Falta o texto a traduzir', 'ai_text_required');
  if (!LANG_RE.test(targetLanguage)) throw bad('Idioma de destino inválido', 'ai_bad_language');

  const sourceHash = sha256Text(text);
  const cached = await q(
    `SELECT translated_text,model FROM ai_translation_cache
      WHERE source_hash=$1 AND target_language=$2 AND created_at>now()-interval '30 days'`,
    [sourceHash, targetLanguage]
  );
  if (cached.rows[0]) {
    return res.json({ translation:cached.rows[0].translated_text, targetLanguage, cached:true });
  }

  const result = await responseText({
    instructions: `Translate the user's text into ${targetLanguage}. Preserve names, @handles, URLs, emojis, line breaks and meaning. Return only the translated text, with no explanation.`,
    input:text,
    maxOutputTokens:1800,
  });
  await q(
    `INSERT INTO ai_translation_cache (source_hash,target_language,translated_text,model)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (source_hash,target_language) DO UPDATE
       SET translated_text=EXCLUDED.translated_text,model=EXCLUDED.model,created_at=now()`,
    [sourceHash, targetLanguage, result.text, result.model]
  );
  await recordAiUsage(req.user.id, 'translate', result);
  res.json({ translation:result.text, targetLanguage, cached:false });
}));

aiRoutes.post('/rewrite', auth, h(async (req, res) => {
  const text = clean(req.body?.text, 2000);
  const mode = ['clearer','shorter','warmer','caption'].includes(req.body?.mode) ? req.body.mode : 'clearer';
  const language = LANG_RE.test(String(req.body?.language || '')) ? String(req.body.language) : 'pt-PT';
  if (!text) throw bad('Falta o texto', 'ai_text_required');
  const goals = {
    clearer:'Make it clearer and more natural without changing the meaning.',
    shorter:'Make it shorter while keeping the important meaning.',
    warmer:'Make it warmer and more human without sounding artificial.',
    caption:'Turn it into a concise social caption. Avoid hashtags unless they are already present.',
  };
  const result = await responseText({
    instructions:`Rewrite the user's text in ${language}. ${goals[mode]} Preserve names, @handles, URLs and emojis when relevant. Return only the rewritten text.`,
    input:text,
    maxOutputTokens:900,
  });
  await recordAiUsage(req.user.id, 'rewrite', result);
  res.json({ text:result.text, mode });
}));

async function searchCandidates(userId, scope) {
  const includeSocial = scope === 'all' || scope === 'social';
  const includeRadar = scope === 'all' || scope === 'radar';
  const includeMessages = scope === 'all' || scope === 'messages';
  const tasks = [];

  if (includeSocial) tasks.push(q(
    `SELECT 'post'::text AS type,p.id,p.body AS text,
            ('@'||u.handle::text) AS label,NULL::uuid AS parent_id,NULL::text AS external_url,p.created_at
       FROM posts p JOIN users u ON u.id=p.author_id AND u.suspended_at IS NULL
      WHERE p.hidden_at IS NULL AND COALESCE(p.kind,'post')='post' AND p.created_at>now()-interval '180 days'
        AND (p.author_id=$1 OR EXISTS (SELECT 1 FROM follows f WHERE f.follower_id=$1 AND f.following_id=p.author_id))
        AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=p.author_id) OR (b.blocked_id=$1 AND b.blocker_id=p.author_id))
      ORDER BY p.created_at DESC LIMIT 45`, [userId]
  ));

  if (includeRadar) tasks.push(q(
    `SELECT 'radar'::text AS type,r.id,
            concat_ws('. ',r.title,r.summary) AS text,
            COALESCE(r.source_name,'Radar') AS label,NULL::uuid AS parent_id,r.external_url,r.published_at AS created_at
       FROM radar_items r
      WHERE r.status='published' AND (r.expires_at IS NULL OR r.expires_at>now())
        AND r.published_at>now()-interval '90 days'
      ORDER BY r.published_at DESC LIMIT 55`
  ));

  if (includeMessages) {
    tasks.push(q(
      `SELECT 'message'::text AS type,m.id,m.body AS text,
              ('Chat · '||u.name) AS label,t.id AS parent_id,NULL::text AS external_url,m.created_at
         FROM messages m
         JOIN threads t ON t.id=m.thread_id AND (t.user_a=$1 OR t.user_b=$1)
         JOIN users u ON u.id=CASE WHEN t.user_a=$1 THEN t.user_b ELSE t.user_a END
        WHERE m.mode='normal' AND m.kind='text' AND m.body IS NOT NULL
          AND m.purged_at IS NULL AND m.deleted_at IS NULL AND m.created_at>now()-interval '120 days'
          AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=u.id) OR (b.blocked_id=$1 AND b.blocker_id=u.id))
        ORDER BY m.created_at DESC LIMIT 40`, [userId]
    ));
    tasks.push(q(
      `SELECT 'room_message'::text AS type,rm.id,rm.body AS text,
              ('Sala · '||r.name) AS label,r.id AS parent_id,NULL::text AS external_url,rm.created_at
         FROM room_messages rm
         JOIN rooms r ON r.id=rm.room_id
         JOIN room_members member ON member.room_id=r.id AND member.user_id=$1
        WHERE rm.deleted_at IS NULL AND rm.created_at>now()-interval '120 days'
        ORDER BY rm.created_at DESC LIMIT 40`, [userId]
    ));
  }

  const results = await Promise.all(tasks);
  return results.flatMap(result => result.rows)
    .map(row => ({ ...row, text:snippet(row.text, 650) }))
    .filter(row => row.text);
}

aiRoutes.post('/search', auth, h(async (req, res) => {
  const query = clean(req.body?.query, 300);
  const scope = ['all','social','radar','messages'].includes(req.body?.scope) ? req.body.scope : 'all';
  if (query.length < 2) throw bad('Escreve pelo menos duas letras', 'ai_search_short');
  const candidates = await searchCandidates(req.user.id, scope);
  if (!candidates.length) return res.json({ results:[], scope });

  const embedded = await embedTexts([query, ...candidates.map(item => `${item.label}\n${item.text}`)]);
  const queryVector = embedded.vectors[0];
  const ranked = candidates
    .map((item, index) => ({ ...item, score:cosine(queryVector, embedded.vectors[index + 1]) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map(item => ({
      type:item.type,
      id:item.id,
      parentId:item.parent_id || null,
      label:item.label,
      snippet:snippet(item.text),
      externalUrl:item.external_url || null,
      createdAt:item.created_at,
      score:Number(item.score.toFixed(4)),
    }));
  await recordAiUsage(req.user.id, 'search', embedded);
  res.json({ results:ranked, scope });
}));

aiRoutes.post('/image/generate', auth, h(async (req, res) => {
  const prompt = clean(req.body?.prompt, 800);
  if (prompt.length < 3) throw bad('Descreve a imagem que queres criar', 'ai_prompt_required');
  const generated = await generateImage(prompt);
  const saved = await saveGeneratedImage({ userId:req.user.id, buffer:generated.buffer });
  await recordAiUsage(req.user.id, 'image_generate', generated, 1);
  res.status(201).json({ url:saved.url, provenance:'generated_ai', model:generated.model });
}));

aiRoutes.post('/image/edit', auth, h(async (req, res) => {
  const sourceUrl = clean(req.body?.sourceUrl, 2000);
  const prompt = clean(req.body?.prompt, 800);
  if (!sourceUrl || prompt.length < 3) throw bad('Falta a fotografia ou a instrução de edição', 'ai_edit_required');
  const source = await q(
    `SELECT url,mime,bytes FROM uploads
      WHERE url=$1 AND owner_id=$2 AND confirmed_at IS NOT NULL AND mime LIKE 'image/%'`,
    [sourceUrl, req.user.id]
  );
  if (!source.rows[0]) throw bad('Só podes editar uma fotografia tua já confirmada na Lumina', 'ai_source_invalid');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let fetched;
  try { fetched = await fetch(sourceUrl, { signal:controller.signal }); }
  catch { throw new HttpError(503, 'Não foi possível ler a fotografia original', 'ai_source_fetch'); }
  finally { clearTimeout(timeout); }
  if (!fetched.ok) throw new HttpError(503, 'Não foi possível ler a fotografia original', 'ai_source_fetch');
  const sourceBuffer = Buffer.from(await fetched.arrayBuffer());
  if (!sourceBuffer.length || sourceBuffer.length > 8 * 1024 * 1024) throw bad('A fotografia original é demasiado grande', 'ai_source_too_big');

  const edited = await editImage({ sourceBuffer, sourceMime:source.rows[0].mime, prompt });
  const saved = await saveGeneratedImage({ userId:req.user.id, buffer:edited.buffer });
  await recordAiUsage(req.user.id, 'image_edit', edited, 1);
  res.status(201).json({ url:saved.url, provenance:'edited_ai', model:edited.model });
}));

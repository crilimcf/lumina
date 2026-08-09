import crypto from 'node:crypto';
import { Router } from 'express';
import { env } from '../env.js';
import { q, tx } from '../db.js';
import { h, bad, HttpError } from '../middleware/auth.js';

export const paymentRoutes = Router();

function stripeEvent(req) {
  if (!env.STRIPE_WEBHOOK_SECRET) throw new HttpError(503, 'Webhook de pagamentos não configurado');
  const signature = String(req.headers['stripe-signature'] || '');
  const parts = Object.fromEntries(signature.split(',').map(part => part.split('=', 2)));
  const timestamp = Number(parts.t);
  const received = parts.v1 || '';
  if (!Number.isFinite(timestamp) || !received || Math.abs(Date.now() / 1000 - timestamp) > 300) {
    throw bad('Assinatura de pagamento inválida');
  }
  const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
  const expected = crypto.createHmac('sha256', env.STRIPE_WEBHOOK_SECRET)
    .update(`${timestamp}.`).update(raw).digest('hex');
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw bad('Assinatura de pagamento inválida');
  return req.body;
}

paymentRoutes.post('/stripe/webhook', h(async (req, res) => {
  const event = stripeEvent(req);
  if (event.type !== 'checkout.session.completed') return res.json({ received: true });

  const session = event.data?.object || {};
  if (session.payment_status !== 'paid') return res.json({ received: true });
  const meta = session.metadata || {};
  const roomId = meta.room_id;
  const userId = meta.user_id;
  const paymentId = meta.payment_id;
  if (!roomId || !userId || !paymentId) return res.json({ received: true });

  await tx(async (c) => {
    const { rows } = await c.query(
      `UPDATE room_payments SET status='paid', paid_at=now(), provider_ref=COALESCE(provider_ref,$2)
       WHERE id=$1 AND room_id=$3 AND user_id=$4 AND status='pending'
       RETURNING kind`,
      [paymentId, session.id || null, roomId, userId]
    );
    const kind = rows[0]?.kind;
    if (!kind) return;
    if (kind === 'create') {
      await c.query(
        `UPDATE rooms SET billing_state='active', updated_at=now()
         WHERE id=$1 AND creator_id=$2 AND visibility='ultra'`,
        [roomId, userId]
      );
      await c.query(
        `UPDATE room_members SET paid_entry_at=now()
         WHERE room_id=$1 AND user_id=$2 AND role='owner'`,
        [roomId, userId]
      );
    } else if (kind === 'entry') {
      await c.query(
        `INSERT INTO room_members (room_id,user_id,role,paid_entry_at)
         VALUES ($1,$2,'member',now()) ON CONFLICT (room_id,user_id)
         DO UPDATE SET paid_entry_at=EXCLUDED.paid_entry_at`,
        [roomId, userId]
      );
      await c.query('UPDATE room_invites SET accepted_at=now() WHERE room_id=$1 AND user_id=$2', [roomId, userId]);
    }
  });

  res.json({ received: true });
}));

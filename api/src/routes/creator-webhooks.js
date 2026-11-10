import { Router } from 'express';
import { tx, q } from '../db.js';
import { env } from '../env.js';
import { h, HttpError } from '../middleware/auth.js';
import { verifyCreatorStripeEvent, stripeCreatorsRequest, stripeCreatorSubscriptionState,
  creatorWebhookEnabled } from '../lib/stripe-creators.js';
import { handleCreatorPaymentIncident } from '../lib/creator-billing-incidents.js';

export const creatorWebhookRoutes = Router();
const uuid = v => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || ''));
const subscriptionId = v => typeof v === 'string' && /^sub_[A-Za-z0-9]+$/.test(v);

const handled = new Set(['checkout.session.completed','checkout.session.async_payment_succeeded',
  'checkout.session.expired','invoice.paid','invoice.payment_failed','customer.subscription.created','customer.subscription.updated',
  'charge.refunded','charge.dispute.created','refund.created',
  'customer.subscription.deleted']);

const getId = value => typeof value === 'string' ? value : value?.id;
const findSubscription = object => {
  if (subscriptionId(object?.subscription)) return object.subscription;
  if (subscriptionId(object?.parent?.subscription_details?.subscription)) return object.parent.subscription_details.subscription;
  if (subscriptionId(object?.id) && object.object === 'subscription') return object.id;
  return null;
};

async function reconcileSubscription(subId, checkoutSessionId = null) {
  if (!subscriptionId(subId)) return null;
  const subscription = await stripeCreatorsRequest('GET',
    '/subscriptions/' + subId + '?expand%5B%5D=latest_invoice');
  const meta = subscription.metadata || {};
  const creatorId = meta.lumina_creator_id;
  const subscriberId = meta.lumina_subscriber_id;
  const planId = meta.lumina_plan_id;
  if (![creatorId,subscriberId,planId].every(uuid)) return null;
  const row = await tx(async client => {
    const { rows } = await client.query(
      "SELECT p.price_cents,p.currency,p.billing_period,a.stripe_account_id,c.stripe_customer_id FROM creator_plans p JOIN creator_billing_accounts a ON a.creator_id=p.creator_id JOIN creator_billing_customers c ON c.subscriber_id=$2 WHERE p.id=$1 AND p.creator_id=$3",
      [planId,subscriberId,creatorId]);
    return rows[0] || null;
  });
  if (!row || row.stripe_account_id !== getId(subscription.transfer_data?.destination) ||
      row.stripe_customer_id !== getId(subscription.customer)) return null;
  const price = subscription.items?.data?.[0]?.price;
  if (!price || Number(price.unit_amount) !== Number(row.price_cents) ||
      price.currency !== 'eur' || price.recurring?.interval !== row.billing_period) return null;
  let {status, currentPeriodEnd} = stripeCreatorSubscriptionState(subscription);
  const invoiceId = getId(subscription.latest_invoice);
  // Stripe invoices remain "paid" even if their underlying charge was
  // subsequently refunded or disputed. Preserve the hold for that invoice.
  if (status === 'active') {
    if (!/^in_[a-zA-Z0-9]+$/.test(String(invoiceId || ''))) {
      status = 'pending';
    } else {
      const {rows: incidents} = await q(
        'SELECT 1 FROM creator_billing_incidents WHERE provider_subscription_id=$1 AND invoice_id=$2 LIMIT 1',
        [subId,invoiceId]
      );
      if (incidents[0]) status='past_due';
    }
  }
  return {subId, creatorId, subscriberId, planId, status, currentPeriodEnd,
    checkoutSessionId, invoiceId: /^in_[a-zA-Z0-9]+$/.test(String(invoiceId||'')) ? invoiceId : null};
}

creatorWebhookRoutes.post('/stripe/creators-webhook', h(async (req, res) => {
  if (!creatorWebhookEnabled()) throw new HttpError(503, 'Notificações de pagamentos indisponíveis', 'creator_webhook_unavailable');
  const event = verifyCreatorStripeEvent(req.rawBody, req.headers['stripe-signature'],
    env.CREATORS_STRIPE_WEBHOOK_SECRET);
  const object = event.data?.object || {};
  if (!handled.has(event.type)) return res.json({received: true});
  if (['charge.refunded','charge.dispute.created','refund.created'].includes(event.type)) {
    const outcome = await handleCreatorPaymentIncident(event);
    return res.json({received:true,matched:!!outcome.matched});
  }
  const isExpiredSession = event.type === 'checkout.session.expired';

  const sessionId = object.object === 'checkout.session' ? object.id : null;
  let subId = findSubscription(object);
  if (sessionId && /^cs_[a-zA-Z0-9_]+$/.test(sessionId)) {
    subId = getId(object.subscription);
  }
  const state = subId && !isExpiredSession ? await reconcileSubscription(subId, sessionId) : null;
  // A signed event about our own payment must be retried if provider state is not yet usable.
  // Unrelated subscriptions on the same Stripe account are acknowledged and ignored.
  const ourEvent = Boolean(object.metadata?.lumina_creator_id || object.metadata?.lumina_plan_id);
  if (subId && !state && ourEvent && !isExpiredSession) {
    throw new HttpError(503, 'Aguardar sincronização com o prestador de pagamentos', 'creator_payment_reconcile_pending');
  }

  await tx(async client => {
    const { rowCount } = await client.query(
      'INSERT INTO creator_stripe_webhook_events(event_id,event_type) VALUES($1,$2) ON CONFLICT(event_id) DO NOTHING',
      [event.id,event.type]);
    if (!rowCount) return;
    if (isExpiredSession && /^cs_[a-zA-Z0-9_]+$/.test(String(sessionId || ''))) {
      await client.query("UPDATE creator_checkout_sessions SET status='expired',updated_at=now() WHERE session_id=$1 AND status='pending'", [sessionId]);
      return;
    }
    if (!state) return;
    const {rows: checkouts} = await client.query(
      "SELECT session_id FROM creator_checkout_sessions WHERE creator_id=$1 AND subscriber_id=$2 AND plan_id=$3 AND (stripe_subscription_id IS NULL OR stripe_subscription_id=$4) AND ($5::text IS NULL OR session_id=$5) ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
      [state.creatorId,state.subscriberId,state.planId,state.subId,state.checkoutSessionId]);
    const session = checkouts[0];
    if (!session) throw new HttpError(503, 'Aguardar registo da sessão Stripe', 'creator_checkout_not_yet_registered');
    await client.query(
      "UPDATE creator_checkout_sessions SET stripe_subscription_id=$2,status=CASE WHEN $3='active' THEN 'paid' WHEN $3='expired' THEN 'expired' ELSE status END,updated_at=now() WHERE session_id=$1",
      [session.session_id,state.subId,state.status]);
    const {rows: existing} = await client.query(
      'SELECT id FROM creator_memberships WHERE provider_subscription_id=$1 FOR UPDATE',
      [state.subId]);
    if (existing[0]) {
      await client.query(
        "UPDATE creator_memberships SET status=$2,current_period_end=$3,last_paid_invoice_id=CASE WHEN $2='active' THEN $4 ELSE last_paid_invoice_id END,updated_at=now() WHERE id=$1",
        [existing[0].id,state.status,state.currentPeriodEnd,state.invoiceId]);
    } else if (state.status === 'active') {
      const {rows: others} = await client.query(
        "SELECT id FROM creator_memberships WHERE creator_id=$1 AND subscriber_id=$2 AND status IN ('pending','active','past_due') FOR UPDATE",
        [state.creatorId,state.subscriberId]);
      if (!others[0]) {
        await client.query(
          "INSERT INTO creator_memberships(creator_id,subscriber_id,plan_id,provider,provider_subscription_id,status,current_period_end,last_paid_invoice_id) VALUES($1,$2,$3,'stripe',$4,'active',$5,$6)",
          [state.creatorId,state.subscriberId,state.planId,state.subId,state.currentPeriodEnd,state.invoiceId]);
      }
    }
  });
  res.json({received: true});
}));

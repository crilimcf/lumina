import crypto from 'node:crypto';
import { env } from '../env.js';
import { HttpError } from '../middleware/auth.js';

// Staging uses the real production NODE_ENV setting for HTTP safeguards,
// but can only ever communicate with Stripe test-mode credentials.
export const creatorStripeKeyMatchesEnvironment = () => {
  const key=env.STRIPE_SECRET_KEY || '';
  if (process.env.LUMINA_SANDBOX === 'true') return key.startsWith('sk_test_') || key.startsWith('rk_test_');
  if (env.NODE_ENV === 'production') return key.startsWith('sk_live_') || key.startsWith('rk_live_');
  return key.startsWith('sk_test_') || key.startsWith('rk_test_');
};

export const creatorBillingConfigured = () =>
  Boolean(creatorStripeKeyMatchesEnvironment() &&
    (env.NODE_ENV !== 'production' || process.env.LUMINA_SANDBOX === 'true' ||
      env.CREATORS_LIVE_PAYMENTS_APPROVED) &&
    env.CREATORS_STRIPE_WEBHOOK_SECRET &&
    Number.isFinite(env.CREATORS_PLATFORM_FEE_PERCENT) &&
    env.CREATORS_PLATFORM_FEE_PERCENT >= 0 &&
    env.CREATORS_PLATFORM_FEE_PERCENT <= 30);

// Let creators complete Stripe verification before public sales are approved.
// This never enables plan publication or checkout.
export const creatorOnboardingEnabled = () =>
  Boolean(env.FEATURE_CREATORS &&
    creatorStripeKeyMatchesEnvironment() && env.CREATORS_STRIPE_WEBHOOK_SECRET &&
    Number.isFinite(env.CREATORS_PLATFORM_FEE_PERCENT) &&
    env.CREATORS_PLATFORM_FEE_PERCENT >= 0 &&
    env.CREATORS_PLATFORM_FEE_PERCENT <= 30);

export const creatorCheckoutEnabled = () =>
  Boolean(env.FEATURE_CREATORS && env.FEATURE_SUBSCRIPTIONS && creatorBillingConfigured());

// Keep verified billing events working when new purchases are paused. Disabling
// Checkout must never silently disable cancellations, refunds or entitlement
// revocation for already-paid members.
export const creatorWebhookEnabled = () =>
  Boolean(creatorStripeKeyMatchesEnvironment() && env.CREATORS_STRIPE_WEBHOOK_SECRET);

export async function stripeCreatorsRequest(method, resource, parameters, idempotencyKey) {
  if (!creatorStripeKeyMatchesEnvironment()) {
    throw new HttpError(503, 'Credenciais Stripe incompatíveis com o ambiente', 'creator_stripe_environment_mismatch');
  }
  if (!/^\/[a-zA-Z0-9/?=&_%.\-]+$/.test(resource)) {
    throw new HttpError(400, 'Operação de pagamentos inválida', 'invalid_payment_operation');
  }
  const headers = { authorization: 'Bearer ' + env.STRIPE_SECRET_KEY };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  let url = 'https://api.stripe.com/v1' + resource;
  const request = { method, headers, signal: AbortSignal.timeout(15000) };
  if (method === 'GET' && parameters) {
    url += '?' + new URLSearchParams(parameters).toString();
  } else if (parameters) {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    request.body = new URLSearchParams(parameters).toString();
  }
  let response;
  try {
    response = await fetch(url, request);
  } catch {
    throw new HttpError(502, 'Serviço de pagamentos temporariamente indisponível', 'creator_payment_network');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || data.error) {
    // Do not send Stripe's raw response (which can contain private billing details) to clients.
    console.error('[creators/stripe] erro', response.status, data?.error?.code || 'unknown');
    throw new HttpError(502, 'Não foi possível concluir a operação no serviço de pagamentos', 'creator_payment_provider');
  }
  return data;
}

// New Stripe Connect marketplaces use Accounts v2 for new connected accounts.
// Keep v1 calls for Customers, Checkout, subscriptions and compatible account
// retrieval; the newly created acct_ IDs can still be retrieved from v1.
export async function stripeCreatorsV2Request(resource, body, idempotencyKey) {
  if (!creatorStripeKeyMatchesEnvironment()) {
    throw new HttpError(503, 'Credenciais Stripe incompatíveis com o ambiente', 'creator_stripe_environment_mismatch');
  }
  if (!/^\/core\/(accounts|account_links)$/.test(resource)) {
    throw new HttpError(400, 'Operação Stripe v2 inválida', 'invalid_stripe_v2_resource');
  }
  const headers={
    authorization:'Bearer '+env.STRIPE_SECRET_KEY,
    'content-type':'application/json',
    'Stripe-Version':'2026-07-29.preview',
  };
  if (idempotencyKey) headers['Idempotency-Key']=idempotencyKey;
  let response;
  try {
    response=await fetch('https://api.stripe.com/v2'+resource,{
      method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(15000),
    });
  } catch {
    throw new HttpError(502, 'Serviço de pagamentos temporariamente indisponível','creator_payment_network');
  }
  const data=await response.json().catch(()=>null);
  if (!response.ok || !data || data.error) {
    console.error('[creators/stripe-v2] erro',response.status,data?.error?.code||'unknown');
    throw new HttpError(502,'Não foi possível concluir a operação no serviço de pagamentos',
      'creator_payment_provider');
  }
  return data;
}

export function verifyCreatorStripeEvent(raw, header, secret, nowSeconds = Date.now() / 1000) {
  if (!secret) throw new HttpError(503, 'Webhook de pagamentos não configurado');
  if (!Buffer.isBuffer(raw) || raw.length > 256 * 1024) {
    throw new HttpError(400, 'Pedido de pagamentos inválido', 'invalid_webhook_body');
  }
  const components = String(header || '').split(',');
  const timestampPart = components.find(part => part.trim().startsWith('t='));
  const t = Number(timestampPart?.trim().slice(2));
  const signatures = components.filter(part => part.trim().startsWith('v1='))
    .map(part => part.trim().slice(3))
    .filter(hex => /^[a-f0-9]{64}$/i.test(hex));
  if (!Number.isSafeInteger(t) || Math.abs(nowSeconds - t) > 300 || !signatures.length) {
    throw new HttpError(400, 'Assinatura de pagamento inválida', 'invalid_webhook_signature');
  }
  const expected = crypto.createHmac('sha256', secret)
    .update(String(t)).update('.').update(raw).digest();
  if (!signatures.some(value => crypto.timingSafeEqual(Buffer.from(value, 'hex'), expected))) {
    throw new HttpError(400, 'Assinatura de pagamento inválida', 'invalid_webhook_signature');
  }
  try {
    const event = JSON.parse(raw.toString('utf8'));
    if (!event || typeof event.id !== 'string' || !/^evt_[A-Za-z0-9]+$/.test(event.id) ||
        typeof event.type !== 'string' || !event.data?.object) throw new Error('shape');
    return event;
  } catch {
    throw new HttpError(400, 'Evento de pagamentos inválido', 'invalid_webhook_event');
  }
}

export function stripeCreatorSubscriptionState(subscription) {
  const end = Number(subscription?.current_period_end ||
    Math.max(0, ...(subscription?.items?.data || []).map(item => Number(item.current_period_end) || 0)));
  const latest = subscription?.latest_invoice;
  // Stripe's current Invoice API can omit the legacy `paid` boolean.
  // Treat as paid only when the provider confirms status, zero outstanding
  // balance and captured funds. A mere active subscription is insufficient.
  const invoicePaid = Boolean(latest && typeof latest === 'object' &&
    latest.status === 'paid' &&
    (latest.paid === true || (Number(latest.amount_paid) > 0 &&
      Number(latest.amount_remaining) === 0)));
  const now = Date.now() / 1000;
  const paidAndCurrent = subscription?.status === 'active' && invoicePaid && end > now;
  let status = 'pending';
  if (paidAndCurrent) status = 'active';
  else if (['canceled', 'unpaid'].includes(subscription?.status) || (end && end <= now)) status = 'expired';
  else if (subscription?.status === 'past_due' || subscription?.status === 'active') status = 'past_due';
  return { status, currentPeriodEnd: end > 0 ? new Date(end * 1000).toISOString() : null };
}

import crypto from 'node:crypto';
import { Router } from 'express';
import { q, tx } from '../db.js';
import { env } from '../env.js';
import { auth, h, bad, forbidden, HttpError } from '../middleware/auth.js';
import { stripeCreatorsRequest, stripeCreatorsV2Request, creatorCheckoutEnabled, creatorBillingConfigured } from '../lib/stripe-creators.js';

export const creatorBillingRoutes = Router();
creatorBillingRoutes.use(auth);

const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
const paymentNotReady = () => new HttpError(503, 'A cobrança de subscrições está em preparação', 'creator_payments_unavailable');
const ensureStudio = () => {
  if (!env.FEATURE_CREATORS) throw new HttpError(404, 'Funcionalidade indisponível', 'feature_off');
};
const ensurePayment = () => {
  ensureStudio();
  if (!creatorCheckoutEnabled()) throw paymentNotReady();
};
const cleanAccountId = value => /^acct_[a-zA-Z0-9]+$/.test(String(value || ''));
const email = value => String(value || '').slice(0, 254);

// Web-only checkout until native digital goods billing requirements are reviewed.
// Do not embed or deep link these payment routes from iOS/Android Capacitor builds.
creatorBillingRoutes.get('/me/billing/status', h(async (req, res) => {
  ensureStudio();
  const { rows } = await q('SELECT stripe_account_id, country, charges_enabled, payouts_enabled, transfers_enabled, details_submitted FROM creator_billing_accounts WHERE creator_id=$1', [req.user.id]);
  res.json({ available: creatorBillingConfigured(), enabled: creatorCheckoutEnabled(),
    account: rows[0] ? { linked: true, country: rows[0].country, chargesEnabled: rows[0].charges_enabled, payoutsEnabled: rows[0].payouts_enabled, transfersEnabled: rows[0].transfers_enabled, detailsSubmitted: rows[0].details_submitted } : { linked: false } });
}));

// Subscribers must retain access to billing information after creator-facing
// features or new sales are suspended.
creatorBillingRoutes.get('/me/billing/subscriptions', h(async (req, res) => {
  const { rows } = await q(
    "SELECT m.id,m.creator_id,m.plan_id,m.status,m.current_period_end,p.title,p.price_cents,p.billing_period FROM creator_memberships m JOIN creator_plans p ON p.id=m.plan_id WHERE m.subscriber_id=$1 ORDER BY m.created_at DESC LIMIT 50",
    [req.user.id]
  );
  res.json({ subscriptions:rows });
}));

// A subscriber's cancellation right cannot disappear when creators are paused.
creatorBillingRoutes.post('/me/billing/portal', h(async (req, res) => {
  // Existing subscribers must retain a cancellation route even if new checkouts are disabled.
  if (!env.STRIPE_SECRET_KEY) throw paymentNotReady();
  const { rows } = await q(
    'SELECT stripe_customer_id FROM creator_billing_customers WHERE subscriber_id=$1',
    [req.user.id]
  );
  const customer = rows[0]?.stripe_customer_id;
  if (!/^cus_[A-Za-z0-9]+$/.test(String(customer || ''))) {
    throw new HttpError(404, 'Não existe uma conta de faturação associada', 'creator_billing_customer_missing');
  }
  const session = await stripeCreatorsRequest('POST', '/billing_portal/sessions', {
    customer, return_url:env.APP_URL + '/?tab=profile',
  });
  let url;
  try { url = new URL(session.url); } catch { /* Invalid provider URL */ }
  if (!url || url.protocol !== 'https:' || url.hostname !== 'billing.stripe.com') {
    throw new HttpError(502, 'Portal de faturação indisponível', 'creator_billing_portal_invalid');
  }
  res.json({ url:session.url });
}));

creatorBillingRoutes.post('/me/billing/onboard', h(async (req, res) => {
  ensureStudio();
  if (!env.STRIPE_SECRET_KEY || !creatorBillingConfigured()) throw paymentNotReady();
  const { rows: eligibility } = await q(
    "SELECT birth_date IS NOT NULL AND birth_date <= (CURRENT_DATE - INTERVAL '18 years')::date AS eligible FROM users WHERE id=$1",
    [req.user.id]
  );
  if (!eligibility[0]?.eligible) {
    throw new HttpError(403, 'O recebimento de pagamentos exige que o criador seja maior de idade', 'creator_age_not_eligible');
  }
  let { rows } = await q('SELECT stripe_account_id FROM creator_billing_accounts WHERE creator_id=$1', [req.user.id]);
  let accountId = rows[0]?.stripe_account_id;
  if (!accountId) {
    const connected = await stripeCreatorsV2Request('/core/accounts', {
      contact_email:email(req.user.email),
      display_name:String(req.user.name || req.user.handle || 'Criador Lumina').slice(0,100),
      dashboard:'express',
      identity:{country:'PT'},
      defaults:{responsibilities:{fees_collector:'application',losses_collector:'application'}},
      configuration:{recipient:{capabilities:{stripe_balance:{stripe_transfers:{requested:true}}}}},
      metadata:{lumina_creator_id:req.user.id},
    }, 'lumina-creators-v2-account-' + req.user.id);
    accountId = connected.id;
    if (!cleanAccountId(accountId)) throw new HttpError(502, 'Conta de criador inválida', 'creator_account_invalid');
    await q('INSERT INTO creator_billing_accounts (creator_id,stripe_account_id,country) VALUES ($1,$2,$3) ON CONFLICT (creator_id) DO NOTHING',
      [req.user.id, accountId, connected.country || 'PT']);
    ({ rows } = await q('SELECT stripe_account_id FROM creator_billing_accounts WHERE creator_id=$1', [req.user.id]));
    accountId = rows[0]?.stripe_account_id;
  }
  if (!cleanAccountId(accountId)) throw paymentNotReady();
  const link = await stripeCreatorsV2Request('/core/account_links', {
    account:accountId,
    use_case:{
      type:'account_onboarding',
      account_onboarding:{
        configurations:['recipient'],
        refresh_url:env.APP_URL + '/?creators=onboarding',
        return_url:env.APP_URL + '/?creators=onboarded',
      },
    },
  });
  let url;
  try { url = new URL(link.url); } catch { /* invalid Stripe URL */ }
  if (!url || url.protocol !== 'https:' || !['connect.stripe.com','connect.stripe.network'].includes(url.hostname)) {
    throw new HttpError(502,'Ligação de verificação Stripe inválida','creator_onboarding_link_invalid');
  }
  res.json({ url: link.url });
}));

creatorBillingRoutes.post('/me/billing/refresh', h(async (req, res) => {
  ensureStudio();
  if (!env.STRIPE_SECRET_KEY) throw paymentNotReady();
  const { rows } = await q('SELECT stripe_account_id FROM creator_billing_accounts WHERE creator_id=$1', [req.user.id]);
  const accountId = rows[0]?.stripe_account_id;
  if (!cleanAccountId(accountId)) throw bad('Conta Stripe por associar');
  const account = await stripeCreatorsRequest('GET', '/accounts/' + accountId);
  const charges = Boolean(account.charges_enabled);
  const payouts = Boolean(account.payouts_enabled);
  const details = Boolean(account.details_submitted);
  // Recipient-only Accounts v2 can receive destination transfers without
  // being permitted to accept direct charges on the connected account.
  const transfers = account.capabilities?.transfers === 'active';
  await q('UPDATE creator_billing_accounts SET charges_enabled=$2,payouts_enabled=$3,details_submitted=$4,transfers_enabled=$5,updated_at=now() WHERE creator_id=$1',
    [req.user.id, charges, payouts, details, transfers]);
  res.json({ linked: true, chargesEnabled: charges, payoutsEnabled: payouts,
    transfersEnabled: transfers, detailsSubmitted: details });
}));

creatorBillingRoutes.post('/me/plans/:planId/publish', h(async (req, res) => {
  ensurePayment();
  if (!uuid(req.params.planId)) throw bad('Plano inválido');
  const { rows: account } = await q('SELECT stripe_account_id,charges_enabled,payouts_enabled,transfers_enabled,details_submitted FROM creator_billing_accounts WHERE creator_id=$1', [req.user.id]);
  if (!(account[0]?.transfers_enabled ?? account[0]?.charges_enabled) || !account[0]?.payouts_enabled || !account[0]?.details_submitted) {
    throw new HttpError(409, 'Completa primeiro a verificação de pagamentos', 'creator_onboarding_required');
  }
  const { rows } = await q("UPDATE creator_plans SET status='published',updated_at=now() WHERE id=$1 AND creator_id=$2 AND status='draft' RETURNING id,title,status", [req.params.planId, req.user.id]);
  if (!rows[0]) throw new HttpError(404, 'Plano indisponível', 'creator_plan_missing');
  res.json({ plan: rows[0] });
}));

creatorBillingRoutes.post('/:creatorId/plans/:planId/checkout', h(async (req, res) => {
  ensurePayment();
  if (!uuid(req.params.creatorId) || !uuid(req.params.planId)) throw bad('Identificadores inválidos');
  if (req.user.id === req.params.creatorId) throw bad('Não podes subscrever o teu próprio plano');
  const { rows: plans } = await q(
    "SELECT p.id,p.title,p.price_cents,p.billing_period,p.creator_id,a.stripe_account_id FROM creator_plans p JOIN creator_billing_accounts a ON a.creator_id=p.creator_id WHERE p.id=$1 AND p.creator_id=$2 AND p.status='published' AND COALESCE(a.transfers_enabled,a.charges_enabled)=true AND a.payouts_enabled=true AND a.details_submitted=true AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=$3) OR (b.blocker_id=$3 AND b.blocked_id=$2)) AND NOT EXISTS (SELECT 1 FROM creator_memberships m WHERE m.creator_id=$2 AND m.subscriber_id=$3 AND m.status IN ('pending','active','past_due')) LIMIT 1",
    [req.params.planId, req.params.creatorId, req.user.id]
  );
  const plan = plans[0];
  if (!plan) throw new HttpError(409, 'Plano não disponível ou subscrição já existente', 'creator_plan_unavailable');
  if (!cleanAccountId(plan.stripe_account_id)) throw paymentNotReady();
  const { rows: customers } = await q('SELECT stripe_customer_id FROM creator_billing_customers WHERE subscriber_id=$1', [req.user.id]);
  let customerId = customers[0]?.stripe_customer_id;
  if (!customerId) {
    const customer = await stripeCreatorsRequest('POST', '/customers', {
      email: email(req.user.email),
      'metadata[lumina_subscriber_id]': req.user.id,
    }, 'lumina-creators-customer-' + req.user.id);
    if (!/^cus_[a-zA-Z0-9]+$/.test(String(customer.id))) throw paymentNotReady();
    await q('INSERT INTO creator_billing_customers(subscriber_id,stripe_customer_id) VALUES($1,$2) ON CONFLICT(subscriber_id) DO NOTHING',
      [req.user.id, customer.id]);
    const { rows } = await q('SELECT stripe_customer_id FROM creator_billing_customers WHERE subscriber_id=$1', [req.user.id]);
    customerId = rows[0].stripe_customer_id;
  }
  const result = await tx(async client => {
    // Serialise checkouts for the same subscriber so two rapid taps cannot create
    // two live subscription payment pages for the same creator.
    await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [req.user.id]);
    const { rows: member } = await client.query(
      "SELECT id FROM creator_memberships WHERE creator_id=$1 AND subscriber_id=$2 AND status IN ('pending','active','past_due') LIMIT 1",
      [req.params.creatorId,req.user.id]
    );
    if (member[0]) throw new HttpError(409, 'Já existe uma subscrição para este criador', 'creator_membership_exists');

    const { rows: existing } = await client.query(
      "SELECT session_id,plan_id,checkout_url FROM creator_checkout_sessions WHERE creator_id=$1 AND subscriber_id=$2 AND status='pending' AND expires_at>now() ORDER BY created_at DESC LIMIT 1",
      [req.params.creatorId, req.user.id]
    );
    if (existing[0]) {
      if (existing[0].plan_id !== plan.id) throw new HttpError(409,
        'Já existe um pagamento pendente para outra periodicidade', 'creator_checkout_already_pending');
      return { url:existing[0].checkout_url, reused:true };
    }

    const session = await stripeCreatorsRequest('POST', '/checkout/sessions', {
      mode: 'subscription',
      customer: customerId,
      // Tax collection applies only to Lumina Creators Checkout sessions;
      // never alter account-wide DigiBox products, prices, or Billing defaults.
      'automatic_tax[enabled]': 'true',
      billing_address_collection: 'required',
    client_reference_id: req.user.id,
    'line_items[0][price_data][currency]': 'eur',
    'line_items[0][price_data][unit_amount]': String(plan.price_cents),
    'line_items[0][price_data][recurring][interval]': plan.billing_period,
    'line_items[0][price_data][product_data][name]': 'Lumina Creators · ' + plan.title,
    'line_items[0][quantity]': '1',
    'subscription_data[application_fee_percent]': String(env.CREATORS_PLATFORM_FEE_PERCENT),
    'subscription_data[transfer_data][destination]': plan.stripe_account_id,
    'subscription_data[metadata][lumina_creator_id]': req.params.creatorId,
    'subscription_data[metadata][lumina_subscriber_id]': req.user.id,
    'subscription_data[metadata][lumina_plan_id]': plan.id,
    'metadata[lumina_creator_id]': req.params.creatorId,
    'metadata[lumina_subscriber_id]': req.user.id,
    'metadata[lumina_plan_id]': plan.id,
    success_url: env.APP_URL + '/?creators=subscription-return&session_id={CHECKOUT_SESSION_ID}',
    cancel_url: env.APP_URL + '/?creators=subscription-cancelled',
    }, 'lumina-creators-checkout-' + req.user.id + '-' + plan.id + '-' + crypto.randomUUID());
    if (!/^cs_[a-zA-Z0-9_]+$/.test(String(session.id || '')) ||
        !/^https:\/\/checkout\.stripe\.com\//.test(String(session.url || ''))) {
      throw new HttpError(502, 'Sessão de pagamento inválida', 'checkout_session_invalid');
    }
    const expiry = Number.isSafeInteger(Number(session.expires_at)) && Number(session.expires_at)>Date.now()/1000
      ? new Date(Number(session.expires_at)*1000)
      : new Date(Date.now() + 23*60*60*1000);
    await client.query(
      'INSERT INTO creator_checkout_sessions (session_id,creator_id,subscriber_id,plan_id,checkout_url,expires_at) VALUES($1,$2,$3,$4,$5,$6)',
      [session.id,req.params.creatorId,req.user.id,plan.id,session.url,expiry]
    );
    return { url:session.url, reused:false };
  });
  res.status(result.reused ? 200 : 201).json({ checkoutUrl: result.url });
}));

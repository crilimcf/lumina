import { tx } from '../db.js';
import { stripeCreatorsRequest } from './stripe-creators.js';

const getId = object => typeof object === 'string' ? object : object?.id;
const id = (value,prefix) => typeof value === 'string' && new RegExp('^'+prefix+'_[a-zA-Z0-9]+$').test(value);
const invoiceSubscriptionId = invoice =>
  getId(invoice?.subscription) ||
  getId(invoice?.parent?.subscription_details?.subscription);

/**
 * Any refund, even partial, or newly opened dispute suspends the current
 * invoice entitlement. This is intentionally conservative and reversible only
 * by a genuinely new paid invoice, not a repeated old subscription.updated.
 * Caller must verify the signed raw Stripe event before entering this helper.
 */
export async function handleCreatorPaymentIncident(event) {
  const type = event.type;
  const reason = type === 'charge.dispute.created' ? 'dispute' :
    type === 'charge.refunded' || type === 'refund.created' ? 'refund' : null;
  if (!reason) return {handled:false};
  const object = event.data?.object || {};
  if (type === 'charge.refunded' && !object.refunded && Number(object.amount_refunded || 0) <= 0) {
    return {handled:true,matched:false};
  }
  let charge = type === 'charge.refunded' ? object : null;
  let chargeId = getId(charge?.id) || getId(object?.charge);
  // Some newer Refund notifications contain a PaymentIntent but no Charge.
  // Resolve through the provider, never trust a client-supplied subscription ID.
  let paymentIntentId = getId(charge?.payment_intent) || getId(object?.payment_intent);
  let pi = null;
  if (!id(chargeId,'ch') && id(paymentIntentId,'pi')) {
    pi = await stripeCreatorsRequest('GET','/payment_intents/'+paymentIntentId);
    chargeId = getId(pi.latest_charge);
  }
  if (!charge && id(chargeId,'ch')) {
    charge = await stripeCreatorsRequest('GET','/charges/'+chargeId);
  }
  if (!charge) {
    console.warn('[creators/billing] incidente sem charge identificável:',type);
    return {handled:true,matched:false};
  }

  let invoiceId = getId(charge.invoice);
  if (!id(invoiceId,'in')) {
    paymentIntentId = getId(charge.payment_intent) || paymentIntentId;
    if (id(paymentIntentId,'pi')) {
      pi ||= await stripeCreatorsRequest('GET','/payment_intents/'+paymentIntentId);
      invoiceId = getId(pi.invoice);
    }
  }
  if (!id(invoiceId,'in')) {
    console.warn('[creators/billing] incidente sem fatura identificável:',type);
    return {handled:true,matched:false};
  }

  const invoice = await stripeCreatorsRequest('GET','/invoices/'+invoiceId);
  const subId = invoiceSubscriptionId(invoice);
  if (!id(subId,'sub')) return {handled:true,matched:false};

  // A refund may arrive before Checkout's paid event. In that case there
  // is no membership row yet, but the charge must still be marked reversed.
  // Resolve its Stripe subscription and verify its ownership against the
  // server-side pending Checkout session before recording an incident.
  const subscription = await stripeCreatorsRequest('GET','/subscriptions/'+subId);
  const meta = subscription.metadata || {};
  const ownsCheckout = typeof meta.lumina_creator_id === 'string' &&
    typeof meta.lumina_subscriber_id === 'string' &&
    typeof meta.lumina_plan_id === 'string' &&
    getId(subscription.customer) === getId(invoice.customer);

  const result = await tx(async client => {
    const {rows:memberships} = await client.query(
      'SELECT m.id,m.status,m.last_paid_invoice_id FROM creator_memberships m JOIN creator_billing_customers c ON c.subscriber_id=m.subscriber_id WHERE m.provider_subscription_id=$1 AND c.stripe_customer_id=$2 FOR UPDATE OF m',
      [subId,getId(invoice.customer)]
    );
    if (!memberships[0]) {
      if (!ownsCheckout) return {matched:false};
      const {rows:checkouts} = await client.query(
        "SELECT cs.session_id FROM creator_checkout_sessions cs JOIN creator_billing_customers bc ON bc.subscriber_id=cs.subscriber_id WHERE cs.creator_id=$1 AND cs.subscriber_id=$2 AND cs.plan_id=$3 AND bc.stripe_customer_id=$4 AND (cs.stripe_subscription_id IS NULL OR cs.stripe_subscription_id=$5) ORDER BY cs.created_at DESC LIMIT 1 FOR UPDATE OF cs",
        [meta.lumina_creator_id,meta.lumina_subscriber_id,meta.lumina_plan_id,
          getId(invoice.customer),subId]
      );
      if (!checkouts[0]) return {matched:false};
      await client.query(
        "UPDATE creator_checkout_sessions SET stripe_subscription_id=$2,updated_at=now() WHERE session_id=$1 AND (stripe_subscription_id IS NULL OR stripe_subscription_id=$2)",
        [checkouts[0].session_id,subId]
      );
    }
    const {rowCount} = await client.query(
      'INSERT INTO creator_billing_incidents(event_id,provider_subscription_id,invoice_id,charge_id,reason) VALUES($1,$2,$3,$4,$5) ON CONFLICT(event_id) DO NOTHING',
      [event.id,subId,invoiceId,id(chargeId,'ch')?chargeId:null,reason]
    );
    if (rowCount && memberships[0].last_paid_invoice_id === invoiceId) {
      await client.query(
        "UPDATE creator_memberships SET status='past_due',updated_at=now() WHERE id=$1 AND status='active'",
        [memberships[0].id]
      );
    }
    return {matched:true,duplicate:rowCount===0};
  });
  return {handled:true,...result};
}

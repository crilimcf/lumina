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
  const chargeId = getId(charge?.id) || getId(object?.charge);
  if (!charge && id(chargeId,'ch')) {
    charge = await stripeCreatorsRequest('GET','/charges/'+chargeId);
  }
  if (!charge) {
    console.warn('[creators/billing] incidente sem charge identificável:',type);
    return {handled:true,matched:false};
  }

  let invoiceId = getId(charge.invoice);
  if (!id(invoiceId,'in')) {
    const paymentIntentId = getId(charge.payment_intent);
    if (id(paymentIntentId,'pi')) {
      const pi = await stripeCreatorsRequest('GET','/payment_intents/'+paymentIntentId);
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

  const result = await tx(async client => {
    const {rows:memberships} = await client.query(
      'SELECT m.id,m.status,m.last_paid_invoice_id FROM creator_memberships m JOIN creator_billing_customers c ON c.subscriber_id=m.subscriber_id WHERE m.provider_subscription_id=$1 AND c.stripe_customer_id=$2 FOR UPDATE OF m',
      [subId,getId(invoice.customer)]
    );
    if (!memberships[0]) return {matched:false};
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

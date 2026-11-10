import { q } from '../db.js';
import { stripeCreatorsRequest } from './stripe-creators.js';

/**
 * Cancel Stripe subscriptions where the account is creator or subscriber.
 * This must precede deletion of the local account and payment references.
 * Already canceled subscriptions are skipped on retry.
 */
export async function cancelCreatorSubscriptionsForUser(userId) {
  const { rows } = await q(
    "SELECT DISTINCT provider_subscription_id AS subscription_id FROM creator_memberships WHERE (creator_id=$1 OR subscriber_id=$1) AND provider='stripe' AND provider_subscription_id IS NOT NULL",
    [userId]
  );
  let canceled = 0;
  for (const { subscription_id: value } of rows) {
    const id = String(value || '');
    if (!/^sub_[A-Za-z0-9]+$/.test(id)) {
      throw new Error('Identificador Stripe inválido: cancelamento bloqueado');
    }
    const current = await stripeCreatorsRequest('GET', '/subscriptions/' + id);
    if (current.status !== 'canceled') {
      await stripeCreatorsRequest('DELETE', '/subscriptions/' + id,
        undefined, 'lumina-creator-cancel-' + id);
      canceled++;
    }
  }
  return { found: rows.length, canceled };
}

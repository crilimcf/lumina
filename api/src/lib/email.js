import { env } from '../env.js';

/**
 * Envio de email.
 *
 * Sem RESEND_API_KEY, escreve na consola em vez de enviar — assim o
 * desenvolvimento funciona sem configurar nada e sem enviar emails a sério
 * por engano.
 */
export async function sendEmail({ to, subject, text, html }) {
  if (!env.RESEND_API_KEY) {
    console.log(`\n─── EMAIL (não enviado, sem RESEND_API_KEY) ───`);
    console.log(`para: ${to}\nassunto: ${subject}\n${text}\n──────────────────────────────\n`);
    return { simulated: true };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ from: env.EMAIL_FROM, to, subject, text, html }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error('[email] falhou:', res.status, detail);
    throw new Error('Não foi possível enviar o email');
  }
  return res.json();
}

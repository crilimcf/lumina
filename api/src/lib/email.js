import { env } from '../env.js';

/**
 * Envio de email.
 *
 * Em desenvolvimento sem RESEND_API_KEY simulamos o envio, mas nunca
 * imprimimos o corpo: emails de recuperação contêm tokens que não devem ir
 * parar a logs. Em produção, ausência da chave é erro de configuração.
 */
export async function sendEmail({ to, subject, text, html }) {
  if (!env.RESEND_API_KEY) {
    if (env.NODE_ENV === 'production') {
      console.error('[email] RESEND_API_KEY em falta');
      throw new Error('Não foi possível enviar o email');
    }
    console.log(`[email] simulado (sem RESEND_API_KEY): ${subject} -> ${to}`);
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
    // O corpo de erro do fornecedor pode conter dados do pedido. Registamos
    // apenas o estado HTTP para evitar voltar a pôr conteúdo sensível em logs.
    console.error('[email] falhou:', res.status);
    throw new Error('Não foi possível enviar o email');
  }
  return res.json();
}

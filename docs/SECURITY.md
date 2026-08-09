# Segurança

Este documento descreve o estado técnico atual. Questões jurídicas/RGPD devem ser validadas por aconselhamento adequado antes de um lançamento amplo.

## Autenticação e sessões

- passwords guardadas com bcrypt;
- JWT secret obrigatório e forte em produção;
- sessão revogável e `session_version` para invalidar tokens antigos;
- reset/troca de password invalida sessões anteriores;
- 2FA TOTP com códigos de recuperação de utilização única;
- proteção progressiva contra tentativas repetidas de login;
- comparação bcrypt também para contas inexistentes, reduzindo enumeração por timing;
- sessões ativas podem ser consultadas e terminadas.

## Autorização

A API valida ownership/membership em cada operação sensível. O frontend não é considerado uma fronteira de segurança.

Cobertura inclui posts, comentários, comunidades, Salas, mensagens, Momentos, perfis privados, pedidos de follow, uploads e moderação.

## Browser

A Vercel aplica:

- Content-Security-Policy;
- HSTS;
- `X-Frame-Options: DENY`;
- `X-Content-Type-Options: nosniff`;
- Referrer Policy;
- Permissions Policy.

O HTML e ficheiros de controlo PWA não usam cache imutável. Assets de build têm hash.

## CORS e CSRF

Em produção, `CORS_ORIGIN` é obrigatório. O servidor não deve arrancar com um fallback permissivo.

Os fluxos de autenticação pública têm testes de regressão específicos em `api/test/csrf-public-auth.test.js`.

## Uploads

- tipos e tamanhos têm limites no servidor;
- a assinatura binária do objeto é verificada depois do upload;
- o objeto tem de pertencer ao utilizador autenticado;
- um upload confirmado não pode ser consumido por vários conteúdos;
- apagar/expirar conteúdo remove as referências e, quando aplicável, o objeto associado.

## Privacidade e RGPD técnico

O código inclui mecanismos para:

- retificação do perfil;
- exportação de dados;
- pedido e execução de apagamento de conta;
- bloqueio de utilizadores;
- perfis privados e pedidos de follow;
- retenção/limpeza de tentativas de login e tokens;
- expiração real de conteúdo efémero.

Os textos legais canónicos estão em `legal/`.

## Dependências

O CI executa `npm audit --omit=dev --audit-level=high` para `api/` e `web/`. Uma release não deve avançar com vulnerabilidades `high` ou `critical` conhecidas em dependências de produção.

`.github/dependabot.yml` abre atualizações periódicas das dependências npm. Os GitHub Dependabot Security Alerts dependem também da configuração de segurança do repositório.

## Segredos

Nunca versionar:

- `DATABASE_URL`;
- `JWT_SECRET`;
- chaves Resend;
- chaves S3/R2;
- segredos Stripe;
- tokens GitHub/Vercel/Railway.

Usar apenas variáveis do ambiente da plataforma.

## Riscos que exigem acompanhamento

- Tokens browser continuam sujeitos ao risco inerente de XSS; CSP e ausência de scripts de terceiros reduzem a superfície, mas não substituem revisão contínua.
- Deteção/moderação automática de media abusivo não deve ser tratada como resolvida apenas por validação do formato do ficheiro.
- Logs e serviços externos devem continuar sujeitos a políticas de retenção e localização adequadas.
- Antes de crescimento público, rever limites de rate limiting, observabilidade e resposta a incidentes.

## Processo

Qualquer correção de segurança deve incluir teste de regressão quando tecnicamente possível. Não incluir dados reais de utilizadores em fixtures, logs de CI ou issues públicas.

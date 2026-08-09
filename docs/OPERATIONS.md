# Operações e releases

## Ambientes

- Web canónica: `https://lumina-snowy-ten.vercel.app`
- API: Railway, root directory `api/`
- Web principal: Vercel, root directory `web/`
- Web fallback: build Vite copiado automaticamente para `api/public/`

## Release normal

1. Trabalhar numa branch.
2. Esperar `CI` e `Mobile Safari WebKit` verdes.
3. Rever o diff contra `master`.
4. Fazer fast-forward/merge para `master`.
5. Esperar novamente os gates do `master`.
6. Confirmar Vercel `READY`.
7. Confirmar `/api/health`/health da API.
8. Confirmar que o workflow Railway fallback terminou quando houve alterações em `web/`.

Nunca usar `api/public/` como fonte de edição manual.

## Migrações

- `api/src/db.js` executa migrations no arranque.
- Migrations existentes são imutáveis depois de produção.
- Para alterar schema, criar o próximo ficheiro numerado em `api/migrations/`.
- Testar sempre contra PostgreSQL limpo no CI.

## Jobs

Os jobs podem correr dentro do processo da API ou através dos scripts de cron, consoante a configuração do ambiente. Não manter duas implementações SQL diferentes para a mesma tarefa.

## Operações destrutivas

A aplicação de produção **não mantém um comando permanente de reset total** e o arranque normal da Railway é apenas `npm start`.

Se no futuro for necessária uma limpeza integral de ambiente, tratar como operação excepcional de release:

1. criar implementação temporária numa branch dedicada;
2. exigir confirmação explícita e proteção contra repetição;
3. testar primeiro numa base PostgreSQL descartável;
4. garantir limpeza coordenada de dados e media rastreado;
5. validar contadores/estado depois da execução;
6. remover o mecanismo destrutivo e voltar ao arranque normal antes de encerrar a release.

Nunca executar `seed` em produção pública nem introduzir comandos destrutivos no `npm start` normal.

## Recuperação

Se um deploy web falhar na Vercel:

- não alterar a API por reflexo;
- consultar o build Vercel;
- o workflow `Build Railway web fallback` mantém uma cópia do frontend no serviço Railway quando o build do repositório está válido.

Se a API falhar após migration:

- consultar primeiro logs Railway e erro PostgreSQL;
- não apagar/recriar a base de dados como primeira resposta;
- verificar `DATABASE_URL`, `PGSSL` e variáveis de ambiente antes de qualquer operação destrutiva.

## Variáveis críticas

API:

- `DATABASE_URL`
- `JWT_SECRET`
- `PGSSL`
- `NODE_ENV`
- `APP_URL`
- `CORS_ORIGIN`
- Resend (`RESEND_API_KEY`, `EMAIL_FROM`)
- R2/S3 (`S3_*`)
- Stripe apenas quando funcionalidades pagas estiverem ativadas.

Web:

- configuração de API quando necessária;
- a produção atual encaminha `/api/*` através de `web/vercel.json`.

## Pós-release

Validar no mínimo:

- abrir PWA instalada sem reinstalar;
- Feed;
- Salas;
- Novo post;
- Radar;
- Conversas;
- Alertas;
- Perfil;
- criação de conta/login num fluxo de smoke test quando a release altera autenticação.
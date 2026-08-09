# Operações e releases

## Ambientes

- Web canónica: `https://lumina-snowy-ten.vercel.app`
- API: Railway, projeto `lumina`, ambiente `production`, serviço `api`
- Railway project ID: `ea3ad6aa-658d-4fb4-9659-8c3edc06cc77`
- Railway service ID: `3d051e84-e985-48c1-9f31-b16a555f8075`
- Railway root directory: `/api`
- Railway config file: `/api/railway.json`
- Railway domain: `https://api-production-f9e9.up.railway.app`
- Web principal: Vercel, root directory `web/`
- Web fallback: build Vite copiado automaticamente para `api/public/`

## Ligação Railway ↔ GitHub obrigatória

O serviço Railway `api` deve ter uma fonte GitHub persistente. Não usar `railway up` browserless como mecanismo normal de release.

Configuração esperada em **Railway → lumina → production → api → Settings**:

- Source repository: `crilimcf/lumina`
- Branch: `master`
- Root Directory: `/api`
- Config File: `/api/railway.json`
- Autodeploy: **Enabled**
- Wait for CI: **Enabled**
- Watch Paths: manter vazio ou usar `/api/**`; se forem usadas watch paths, garantir que alterações do fallback em `api/public/**` continuam a disparar deploy quando necessário.

Com `Wait for CI` ativo, um push para `master` fica em espera enquanto os GitHub Actions correm. Se algum workflow obrigatório falhar, o deploy não deve avançar.

## Release normal

1. Trabalhar numa branch.
2. Esperar `CI` e `Mobile Safari WebKit` verdes.
3. Rever o diff contra `master`.
4. Fazer merge para `master`.
5. Esperar novamente os gates do `master`.
6. Confirmar que Railway criou o deploy do mesmo commit de `master` e terminou com sucesso.
7. Confirmar Vercel `READY` para o mesmo release web quando existirem alterações em `web/`.
8. Consultar `/api/health` e verificar:
   - HTTP `200`;
   - `X-Lumina-Release` igual ao commit Railway esperado;
   - `X-Lumina-Schema` igual à migration mais recente esperada.
9. Confirmar `/api/radar` protegido (`401` sem sessão) e executar os smoke tests relevantes da release.
10. Confirmar que o workflow Railway fallback terminou quando houve alterações em `web/`.

Nunca usar `api/public/` como fonte de edição manual.

## Identidade de release

`/health` e `/api/health` mantêm o corpo estável `{ "ok": true }`, mas em produção acrescentam headers operacionais:

- `X-Lumina-Release`: SHA fornecido por `RAILWAY_GIT_COMMIT_SHA` quando o deploy vem do GitHub.
- `X-Lumina-Schema`: maior versão registada em `schema_migrations`.

Estes headers são a fonte de verdade para distinguir três estados diferentes: código merged, código construído e código realmente ativo em produção.

## Migrações

- `api/src/db.js` executa migrations no arranque e regista cada versão em `schema_migrations`.
- `001_init.sql` é o esquema canónico atual para uma base nova.
- `010_social_feed_cleanup.sql` é a migração de compatibilidade para instalações que já tinham versões 1–9 registadas antes da consolidação do esquema.
- A migração 010 é idempotente em relação ao esquema limpo: também pode correr depois de `001_init.sql` numa base nova.
- Alterações futuras de schema devem usar o próximo número disponível; não reutilizar 010 para mudanças posteriores.
- Testar sempre uma base PostgreSQL limpa no CI e validar a migração de upgrade antes de produção quando houver alteração estrutural.

## Jobs

Os jobs podem correr dentro do processo da API ou através dos scripts de cron, consoante a configuração do ambiente. Não manter duas implementações SQL diferentes para a mesma tarefa.

Atualmente os jobs tratam expiração de mensagens e Momentos, uploads abandonados/órfãos, apagamentos RGPD, limpeza de tokens/tentativas de login e ingestão automática do Radar.

## Operações destrutivas

A aplicação de produção **não mantém um comando permanente de reset total** e o arranque normal da Railway é apenas `npm start`.

Se no futuro for necessária uma limpeza integral de ambiente, tratar como operação excepcional de release:

1. criar implementação temporária numa branch dedicada;
2. exigir confirmação explícita e proteção contra repetição;
3. testar primeiro numa base PostgreSQL descartável;
4. garantir limpeza coordenada de dados e media rastreado;
5. validar estado depois da execução;
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
- verificar `DATABASE_URL`, `PGSSL` e variáveis de ambiente antes de qualquer operação destrutiva;
- comparar `X-Lumina-Release` e `X-Lumina-Schema` com o release esperado antes de assumir que o deploy novo ficou ativo.

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
- Novo post numa conta que não tenha qualquer outro conteúdo;
- Radar;
- Conversas;
- Alertas;
- Perfil;
- criação de conta/login num fluxo de smoke test quando a release altera autenticação.

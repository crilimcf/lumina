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

## Reset total de produção

O reset existe apenas para situações deliberadas como a passagem de ambiente de desenvolvimento/teste para uma instância pública vazia.

Comando protegido:

```bash
cd api
LUMINA_RESET_CONFIRM=RESET_LUMINA_PRODUCTION npm run reset:production
```

O script `api/scripts/reset-production.js`:

1. recusa correr sem a frase de confirmação exata;
2. garante migrations atuais;
3. impede execução repetida da mesma operação;
4. elimina objetos de media rastreados no armazenamento;
5. trunca dinamicamente as tabelas de dados, preservando metadata de schema/operação;
6. reinicia sequências;
7. verifica que utilizadores, posts, Momentos, Salas e uploads ficaram a zero.

### Regras do reset

- executar apenas depois de backup/decisão explícita;
- nunca executar como parte do `npm start` normal;
- nunca usar `seed` depois do reset de lançamento;
- o reset apaga media **rastreado pela base de dados**. Objetos órfãos antigos sem linha em `uploads` exigem inspeção do bucket pelo fornecedor de armazenamento;
- depois da limpeza, confirmar contadores a zero e criar a primeira conta apenas pela interface pública.

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

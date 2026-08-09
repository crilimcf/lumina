# Arquitetura da Lumina

## Visão geral

```text
iPhone / browser
      |
      v
Vercel · React/Vite PWA
      |
      | /api/*
      v
Railway · Express API
      |
      +---- PostgreSQL
      +---- Cloudflare R2 / S3-compatible media
      +---- Resend
```

A origem web canónica é `lumina-snowy-ten.vercel.app`. Outros aliases Vercel são redirecionados para a origem canónica, exceto previews explicitamente abertos com `?preview=1`.

## Modelo de produto

A navegação principal é **Feed · Salas · Novo · Radar · Chat**. Alertas e Perfil são atalhos pessoais no topo.

- O **Feed** é cronológico e deriva do grafo `follows`: a própria pessoa + autores que segue.
- **Novo** publica diretamente no Feed.
- **Salas** são o único espaço de grupo/tópico e têm controlo de acesso próprio.
- **Radar** mantém campanhas e conteúdos patrocinados fora do Feed social.
- **Chat** é privado e independente das Salas.
- **Momentos** usam o mesmo grafo social do Feed e expiram ao fim de 24 horas.
- Bloqueios vencem sempre a relação de follow e cortam visibilidade nos dois sentidos.
- Perfis privados exigem pedido aceite para o follow existir.

## Web

Código em `web/`.

- React 18.
- Vite.
- Navegação mobile-first.
- PWA instalável no iPhone.
- HTML/manifest sem cache agressivo; assets Vite usam nomes com hash.
- A aplicação compara a assinatura dos assets carregados com a produção ao voltar ao foreground e recarrega quando há uma versão nova.
- `public/sw.js` é apenas um worker de migração para retirar caches/service workers antigos; não mantém um shell offline paralelo.

O `vercel.json` aplica headers de segurança e encaminha `/api/*` para a API Railway.

## API

Código em `api/src/`.

A API Express está separada por domínio em `src/routes/`:

- `auth` / `twofactor` / `account`
- `users`
- `posts`
- `moments`
- `rooms`
- `messages` / `calls`
- `notifications`
- `uploads`
- `reports`
- `payments`

A autorização é feita no servidor. O frontend nunca decide sozinho se um conteúdo é visível.

## Base de dados e migrações

`api/migrations/001_init.sql` é o esquema canónico para uma instalação nova. Contém apenas o modelo atual.

`010_social_feed_cleanup.sql` existe para atualizar bases que nasceram antes da mudança para o Feed social. Essa migração preserva as publicações existentes, retira-lhes as colunas antigas de associação e remove as tabelas que deixaram de fazer parte do produto.

`api/src/db.js` regista versões em `schema_migrations` e executa automaticamente apenas as versões ainda não aplicadas.

## Media

O browser pede uma autorização de upload à API, envia diretamente para o armazenamento e confirma o upload. A API verifica tamanho e assinatura binária antes de permitir que o URL seja consumido por uma publicação, Momento, mensagem, avatar ou Sala.

Um upload confirmado é de utilização única. O ciclo de vida dos objetos está coberto pelos testes em `api/test/media-lifecycle.test.js`.

## Dados e privacidade

Exemplos de regras verificadas pela API:

- um Feed só contém a própria pessoa e quem ela segue;
- conteúdo de perfil privado só é exposto depois de o follow ser aceite;
- Salas privadas não são descobertas por estranhos;
- editar/apagar publicações, Momentos, mensagens ou Salas valida autoria/permissões;
- bloqueios cortam relações e visibilidade nos dois sentidos;
- sessões podem ser revogadas e a troca/reset de password invalida sessões antigas;
- denúncias são revistas pela equipa Lumina numa fila global de moderação.

## Jobs

Os jobs em `api/src/jobs/` tratam tarefas periódicas como:

- expiração de mensagens efémeras;
- expiração de Momentos;
- limpeza de uploads abandonados/órfãos;
- pedidos de apagamento de conta;
- limpeza de tokens e tentativas antigas de login.

## Fallback Railway

`api/public/` não é código-fonte manual. O workflow `.github/workflows/railway-web-fallback.yml`:

1. compila `web/`;
2. substitui `api/public/` pelo `web/dist` atual;
3. cria um commit automático no `master` quando o build mudou.

Isto permite à API Railway servir uma cópia recente da web como fallback. Não editar ficheiros em `api/public/` à mão.

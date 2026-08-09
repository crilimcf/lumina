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
- `communities` / `invites`
- `posts`
- `moments`
- `rooms`
- `messages` / `calls`
- `notifications`
- `uploads`
- `reports`
- `payments`

As migrations vivem em `api/migrations/` e são executadas automaticamente no arranque. Nunca editar uma migration que já tenha ido para produção; criar a seguinte.

## Media

O browser pede uma autorização de upload à API, envia diretamente para o armazenamento e confirma o upload. A API verifica tamanho e assinatura binária antes de permitir que o URL seja consumido por um post, Momento, mensagem, avatar ou sala.

Um upload confirmado é de utilização única. O ciclo de vida dos objetos está coberto pelos testes em `api/test/media-lifecycle.test.js`.

## Dados e privacidade

A autorização é validada no servidor. O frontend nunca é a barreira de segurança.

Exemplos:

- conteúdo de perfil privado só é exposto a quem tem acesso;
- salas privadas não são descobertas por estranhos;
- editar/apagar posts, Momentos, mensagens ou Salas é verificado pela API;
- bloqueios cortam relações e visibilidade nos dois sentidos;
- sessões podem ser revogadas e a troca/reset de password invalida sessões antigas.

## Jobs

Os jobs em `api/src/jobs/` tratam tarefas periódicas como:

- rotação de convites;
- expiração de mensagens efémeras;
- expiração de Momentos;
- pedidos de apagamento de conta;
- limpeza de tokens/tentativas antigas.

## Fallback Railway

`api/public/` não é código-fonte manual. O workflow `.github/workflows/railway-web-fallback.yml`:

1. compila `web/`;
2. substitui `api/public/` pelo `web/dist` atual;
3. cria um commit automático no `master` quando o build mudou.

Isto permite à API Railway servir uma cópia recente da web como fallback. Não editar ficheiros em `api/public/` à mão.

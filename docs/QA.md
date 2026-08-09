# QA e testes

## Gates obrigatórios

Cada release da Lumina passa por três gates automáticos:

1. **API integration tests** — Node test runner + PostgreSQL 16 isolado.
2. **Web build** — instalação limpa + auditoria de dependências de produção + build Vite.
3. **Mobile Safari end-to-end** — Playwright WebKit com perfil iPhone 13 e stack local HTTPS.

Os workflows correm em `master`, pull requests e branches `qa/**`, `feature/**`, `fix/**` e `refactor/**`.

## Cobertura da API

`api/test/` valida, entre outros:

- registo, login, logout, sessões e reset de password;
- 2FA e códigos de recuperação;
- perfis, privacidade, follow requests, bloqueios e notificações;
- avatar: colocar, substituir e remover, incluindo limpeza do upload antigo;
- comunidades, convites e limites;
- posts, edição, eliminação, comentários e autorização;
- 👍, 🔥 e repost/undo;
- Salas públicas e privadas, convites, edição, mensagens e eliminação;
- mensagens privadas, efemeridade e controlo de acesso;
- Momentos: criar, listar, ver, substituir media depois de publicar e apagar;
- edição de Momento sem reiniciar a validade das 24 horas;
- substituição de media sem deixar o upload anterior órfão;
- rejeição de edição de Momento por outro utilizador;
- uploads, vídeos e remoção de media;
- denúncias, conteúdo escondido e jobs concorrentes;
- CSRF/autenticação pública e regressões de segurança.

`release-lifecycle.test.js` é o teste de aceitação de release: cria utilizadores reais numa base isolada e atravessa o ciclo social principal do início ao fim.

No fim da suite, o CI executa também o `reset:production` contra a base descartável, com a frase de confirmação correta, para provar que a operação de limpeza total funciona antes de poder ser usada em produção.

## Cobertura Mobile Safari

`web/e2e/` usa WebKit com viewport/configuração de iPhone.

Fluxos cobertos:

- criar conta e concluir onboarding;
- logout e novo login real com email/password;
- persistência de sessão/reload;
- criar comunidade;
- navegação final Feed · Salas · Novo · Radar · Conversas;
- Alertas e Perfil no topo;
- criar, editar e apagar publicação;
- composer de post a partir de vários ecrãs;
- editor de fotografia: crop/gestos, brilho, rotação, stickers, trocar/remover media;
- publicação de vídeo;
- Momento com fotografia/vídeo e editor antes da publicação;
- ação de edição disponível no visualizador do próprio Momento publicado;
- perfil e edição/crop do avatar;
- Sala pública: criar, editar, conversar, apagar mensagem e apagar sala;
- Sala privada com dois utilizadores: criar, procurar utilizador, convidar, login do convidado, aceitar convite e entrar;
- Chat com ações de áudio/vídeo;
- Alertas de pedido de follow e mudança de perfil público/privado.

## Momentos: regra de produto

Antes de publicar, uma fotografia de Momento pode passar pelo editor completo e o ficheiro pode ser trocado ou removido. Depois de publicado, o autor pode **substituir a fotografia/vídeo** ou apagar o Momento. A substituição mantém o mesmo Momento e a mesma hora de expiração; não oferece mais 24 horas ao conteúdo.

A autorização e o ciclo real de uploads desta edição pós-publicação são validados nos testes de integração da API. Os testes browser nunca escrevem no bucket de produção.

## Media e armazenamento

Os testes browser não escrevem no bucket de produção. O ciclo de vida do armazenamento é validado no nível da API através de uploads confirmados de teste e verificações de referência/eliminação.

Produção nunca é usada como base de dados de testes automatizados.

## Comandos locais

```bash
cd api
npm ci
npm audit --omit=dev --audit-level=high
npm test
```

```bash
cd web
npm ci
npm audit --omit=dev --audit-level=high
npm run build
```

Para WebKit, usar o workflow GitHub Actions ou instalar Playwright localmente de acordo com `web/playwright.config.js`.

## Regra para bugs

Um bug encontrado na auditoria deve resultar, sempre que possível, em:

1. teste que reproduz a falha;
2. correção mínima;
3. teste verde;
4. regressão mantida na suite.

Não remover/afrouxar um teste apenas para tornar o CI verde.

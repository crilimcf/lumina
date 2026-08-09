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
- perfis públicos/privados, follow requests, bloqueios e notificações;
- Feed baseado em follows: antes do follow o conteúdo não entra; depois do follow entra; um bloqueio volta a cortá-lo;
- criação, edição e eliminação de publicações;
- 👍, 🔥, comentários e repost/undo com autorização social;
- avatar: colocar, substituir e remover, incluindo limpeza do upload antigo;
- Salas públicas e privadas, convites, edição, mensagens e eliminação;
- mensagens privadas, efemeridade e controlo de acesso;
- Momentos: criar, listar segundo follows, ver, substituir media depois de publicar e apagar;
- edição de Momento sem reiniciar a validade das 24 horas;
- uploads de fotografia/vídeo, consumo único e remoção de media órfão;
- denúncias, auto-ocultação e fila global reservada à equipa Lumina;
- apagamento RGPD e remoção de conteúdo derivado;
- CSRF/autenticação pública e regressões de segurança.

`release-lifecycle.test.js` é o teste de aceitação de release: cria utilizadores reais numa base isolada e atravessa o ciclo principal do início ao fim.

## Cobertura Mobile Safari

`web/e2e/` usa WebKit com viewport/configuração de iPhone.

Fluxos cobertos:

- criar conta e concluir onboarding;
- entrar diretamente no Feed sem pré-requisitos extra;
- logout e novo login real com email/password;
- persistência de sessão/reload;
- navegação Feed · Salas · Novo · Radar · Chat;
- Alertas e Perfil no topo;
- `Novo` abre o composer diretamente a partir do Feed, Perfil e Chat;
- criar, editar e apagar publicação;
- editor de fotografia: crop/gestos, brilho, rotação, stickers, trocar/remover media;
- publicação de vídeo;
- Momentos com fotografia/vídeo e editor antes da publicação;
- substituir o media de um Momento já publicado através do visualizador do autor;
- Perfil com seguidores, a seguir, descoberta de pessoas e entrada em Salas;
- edição/crop do avatar;
- Sala pública: criar, editar, conversar, apagar mensagem e apagar Sala;
- Sala privada com dois utilizadores: criar, procurar utilizador, convidar, login do convidado, aceitar convite e entrar;
- Chat com ações de áudio/vídeo;
- Alertas de pedido de follow e mudança de perfil público/privado.

## Regressão específica do botão Novo

O teste principal de Mobile Safari começa com uma conta recém-criada, entra no Feed vazio e carrega em **Novo** sem criar nem aderir a qualquer outro espaço. O composer tem de abrir e a publicação tem de aparecer no Feed. Esta regressão impede que volte a surgir qualquer pré-condição indevida no botão central.

## Momentos: regra de produto

Antes de publicar, uma fotografia de Momento pode passar pelo editor completo e o ficheiro pode ser trocado ou removido. Depois de publicado, o autor pode **substituir a fotografia/vídeo** ou apagar o Momento. A substituição mantém o mesmo Momento e a mesma hora de expiração; não oferece mais 24 horas ao conteúdo.

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
2. correção estrutural;
3. teste verde;
4. regressão mantida na suite.

Não remover/afrouxar um teste apenas para tornar o CI verde.

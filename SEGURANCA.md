# Segurança e RGPD

Auditoria feita ao código, com o que foi corrigido e o que continua por fazer.
Não sou advogado — a parte legal precisa de confirmação de quem seja.

---

## Achados corrigidos

### Crítico · Resolver denúncias rebentava sempre

`POST /reports/:id/resolve` passava cinco parâmetros a uma query que só usava
quatro. O Postgres recusa. Resultado: **a moderação nunca funcionou** — as
denúncias acumulavam-se e nenhuma podia ser decidida.

Só apareceu porque testei o endpoint. Ler o código não o mostrava.

### Crítico · Sessões sobreviviam à troca de password

Recuperar a password não invalidava os tokens já emitidos. Quem tivesse roubado
uma conta mantinha o acesso mesmo depois de a vítima trocar a password — que é
exatamente o momento em que ela precisa de fechar as sessões.

Corrigido com `users.session_version`, que vai dentro do JWT. Sobe no reset e na
troca de password; qualquer token mais antigo passa a devolver `session_revoked`.

### Alto · Sem verificação de idade

O RGPD fixa a idade de consentimento em 16 anos e deixa os Estados baixarem até
13. Portugal manteve 16. O registo aceitava qualquer pessoa.

Agora exige data de nascimento e recusa quem tenha menos de `MIN_AGE`. Isto é
uma declaração, não uma verificação — que é o que praticamente todas as redes
sociais fazem. Verificação a sério exige documento ou pagamento, o que traz
problemas maiores do que resolve nesta fase.

### Alto · Sem direito de retificação

Não havia forma de corrigir dados sobre si próprio (artigo 16 do RGPD).
Acrescentado `PATCH /auth/me` para nome, descrição, cor e estrelas.

### Alto · Não era possível bloquear ninguém

Havia denúncia mas não bloqueio. Numa rede social isso vem ao de cima na
primeira semana.

Agora há `blocks`, e o bloqueio corta nos dois sentidos: some do feed, da
pesquisa, das mensagens e do perfil. Desfaz também as ligações que existiam —
um bloqueio que deixa a outra pessoa continuar a seguir-te não é um bloqueio.

### Médio · Descarregar os dados falhava

O frontend usava `<a href>`, que não envia o cabeçalho `Authorization`. O
pedido devolvia 401 e a pessoa não conseguia exercer o direito de acesso.

Corrigido nos dois lados: a API aceita `?token=` para descargas, e o frontend
pede com `fetch` e guarda o ficheiro a partir da resposta.

### Médio · Conteúdo legível por não-membros

`GET /posts/:id/comments` não verificava se quem pedia pertencia à comunidade.
Com o id de um post, qualquer pessoa lia os comentários.

Corrigido com `requirePostMember`.

### Menor · CORS permissivo e limite de tentativas por IP

O CORS caía num fallback que aceitava qualquer origem. Agora, em produção, o
arranque falha se `CORS_ORIGIN` não estiver definido — melhor rebentar no deploy
do que ficar aberto sem ninguém dar por isso.

O limite de tentativas de login passou a contar por IP **e** por email, para que
um atacante com muitos endereços não tenha caminho livre para a mesma conta.

---

## Segunda ronda de correções

### Autenticação em dois passos

Implementada em código próprio (RFC 6238), sem dependências. **Validada contra
os cinco vetores de teste oficiais do RFC** — os cinco corretos.

Uma biblioteca para isto traria código que não controlamos ao sítio mais
sensível da aplicação. São quarenta linhas de HMAC.

Inclui oito códigos de emergência guardados em hash, cada um de uso único.
Desligar exige a password: sem isso, um separador esquecido aberto chegava.

### Bloqueio progressivo por conta

O limite por janela de tempo não chega — um atacante paciente passa por baixo e
um atacante com muitos IPs contorna-o de todo.

Agora conta as falhas **da própria conta**: cinco falhas dão um minuto de
espera, e a espera duplica a cada falha até trinta minutos. Contas diferentes
não se afetam.

### Sessões visíveis

A pessoa vê onde tem sessão iniciada, fecha uma de cada vez ou fecha tudo em
todo o lado. Guardamos a impressão digital do token, nunca o token.

### Verificação de imagens pela assinatura

O upload deixou de ser confiado ao cliente. Depois de o ficheiro chegar ao
armazenamento, o servidor lê os primeiros bytes e compara com a assinatura do
formato declarado. Um executável com o nome acabado em `.jpg` não passa, e o
ficheiro é removido.

Publicar exige que a imagem seja tua e tenha sido confirmada — sem isso, bastava
apontar `mediaUrl` para qualquer coisa na internet.

---

---

## Terceira ronda · auditoria pós-deploy (2026-08-07)

Feita depois de a app já estar em produção no Railway e na Vercel. Os achados
anteriores continuavam válidos; estes eram novos.

### Alto · RGPD · o apagamento de conta ao fim de 30 dias nunca corria

`runDeletions` e `cleanTokens` só existiam em `scripts/cron.js`, pensado para
correr como processo externo. Este deploy corre os trabalhos dentro do
processo da API (`RUN_JOBS_IN_PROCESS` não está a `false`), e esse caminho só
agendava `rotateInvites`, `purgeMessages` e `purgeMoments`. A promessa "a
conta será apagada dentro de 30 dias" ficava só no texto — o pedido nunca era
executado.

Movido para `jobs/daily.js` como `runAccountDeletions`, `purgeExpiredTokens` e
`purgeOldLoginAttempts`, agendados de madrugada. `scripts/cron.js` passou a
importar as mesmas funções em vez de duplicar SQL.

### Médio · RGPD · tentativas de login nunca eram apagadas

A política de privacidade promete `[90]` dias de retenção para
`login_attempts`; não havia limpeza nenhuma. Acrescentada a
`purgeOldLoginAttempts`, junto dos outros trabalhos diários.

### Médio · Republicar não verificava adesão à comunidade

`POST /posts` exige ser membro; `POST /:postId/repost` não — dava para
republicar conteúdo dentro de qualquer comunidade, mesmo sem pertencer a ela.
Acrescentada a mesma verificação.

### Médio · Token de sessão aceite por query string, sem ninguém usar

O `auth` aceitava `?token=` como alternativa ao cabeçalho `Authorization`,
para o download de dados via `<a href>`. O frontend já usa `fetch` com
cabeçalho há uma ronda de correções — o fallback ficou por remover. Um token
na query string fica em logs de acesso, em proxies e no `Referer` de qualquer
link de saída; removido por já não ser preciso em lado nenhum.

### Baixo · Diferença de tempo no login

Quando o email não existia, `bcrypt.compare` nunca corria — só a consulta à
base de dados. Como o bcrypt demora dezenas de milissegundos, a diferença de
tempo entre "conta existe" e "conta não existe" dava para medir. Agora corre
sempre, contra um hash fixo quando não há conta.

### Baixo · Sem CSP no frontend

A API tinha Helmet com CSP; o site na Vercel, onde o token vive em
`localStorage` e uma falha de XSS importa a sério, não tinha nenhuma.
Acrescentado `Content-Security-Policy`, `X-Frame-Options` e
`Strict-Transport-Security` ao `vercel.json`.

### PWA · manifest apontava para ícones inexistentes, sem service worker

O `manifest.webmanifest` e as meta tags do iOS já lá estavam, mas
`/icon-192.png` e `/icon-512.png` não existiam e não havia service worker —
a app não passava a instalável nem funcionava offline. Gerados os ícones,
criado `public/sw.js` (cache do essencial + `/assets/*`, nunca da API) e
registado em `main.jsx`.

### Alto · RGPD · base de dados alojada nos EUA, não na UE — resolvido

A `PRIVACIDADE.md` recomenda "escolher regiões europeias" para evitar a
questão de transferências para fora do Espaço Económico Europeu — mas o
Postgres na Railway ficou, por omissão, numa região dos EUA (`sfo`).
`railway add --database postgres` não tem opção de região; só
`railway service scale` a muda depois de criado.

Duas primeiras tentativas (`railway service scale eu-west=1 sfo=0`, sobre um
serviço já em uso ou recém-criado) deixaram a app momentaneamente em baixo
(503): apagar e recriar o serviço Postgres **parte a referência
`DATABASE_URL`** que o serviço `api` guarda (`${{Postgres.DATABASE_URL}}`
fica a apontar para o serviço antigo, já apagado), e o sintoma —
`password authentication failed` em ciclo — parecia um problema de dados,
não de configuração.

Identificada a causa, resolvido à terceira: apagar o Postgres, criar de
novo, mudar a região numa única chamada (`eu-west=1 sfo=0`) sobre o serviço
ainda vazio, e **imediatamente a seguir**, sem esperar por sintoma nenhum,
redefinir `DATABASE_URL` no serviço `api` e deixar o redeploy automático
seguir. A API ficou saudável em menos de dez segundos. Confirmado por
comando: `europe-west4`, migrações aplicadas do zero sem erros, nenhuma
conta perdida — nunca houve nenhuma.

### Por decisão, não corrigido nesta ronda

- **Vulnerabilidades de dependências (`npm audit`).** `node-cron`/`uuid` e
  `vite`/`esbuild` têm avisos moderados/altos, mas a correção automática exige
  subir versão maior (`node-cron@4`, `vite@8`) sem garantia de compatibilidade
  testada aqui. O vetor do `esbuild` só afeta o servidor de desenvolvimento,
  não a build de produção servida pela Vercel. Vale a pena tratar num commit
  à parte, com testes.
- **Token em `localStorage`.** Continua o mesmo risco já registado na segunda
  ronda — a CSP nova reduz a superfície de XSS que o exploraria, mas não a
  fecha.

---

## Quarta ronda · Momentos e auditoria de fecho (2026-08-07)

### Alto · Dois momentos rebentavam ou vazavam, apanhados antes de publicar

Ao construir a funcionalidade de Momentos (ver commit próprio):
apagar um momento que não é o último da sequência enquanto está a ser visto
deixava o índice fora dos limites e rebentava o visualizador; e
`POST /moments/:id/view` não aplicava a mesma regra de visibilidade da
listagem, deixando alguém fora da comunidade (ou bloqueado) marcar-se como
tendo visto um momento que nunca devia sequer saber que existia. Os dois
foram encontrados em revisão própria, corrigidos e testados antes de
qualquer utilizador ver — não depois.

### Médio · RGPD · exportação de dados incompleta

`GET /account/export` não incluía Momentos, quem viu os meus Momentos, nem a
lista de pessoas bloqueadas. Como é a rota que cumpre o artigo 20.º
(portabilidade), "um ficheiro com tudo o que temos sobre ti" não estava a
ser verdade. Acrescentados os três.

### Médio · Duas cópias dos documentos legais, uma delas esquecida

`legal/PRIVACIDADE.md` (a que eu editava) e
`web/public/legal/PRIVACIDADE.md` (a que a app mostra de verdade dentro do
ecrã "Privacidade") são ficheiros separados. A segunda ficou parada desde
antes da correção da região do alojamento — quem lesse a política de
privacidade dentro da app via "EUA" muito depois de a base já estar na UE
há dias, e via os placeholders todos por preencher muito depois de eu os
ter preenchido com os prestadores reais.

Corrigido a sério, não só sincronizado uma vez: `web/scripts/sync-legal.mjs`
corre antes de cada `dev` e `build`, copiando `legal/*.md` para
`web/public/legal/` automaticamente. Só há agora um sítio para editar.

### Auditoria de marca

Verificação pedida explicitamente: não há nenhuma referência a Instagram,
Snapchat, BeReal, TikTok, WhatsApp ou qualquer outra marca de terceiros em
código, documentos legais ou interface — a Lumina não usa nomes, logótipos
nem código de ninguém. Os ícones são gerados por script próprio (ver
`web/scripts` do PWA), as fontes são do Google Fonts com licença aberta.
Semelhanças funcionais com outras redes (fotos que desaparecem, convite
diário) são conceitos genéricos, não protegidos por direitos de autor —
só a expressão concreta (nome, código, imagem) o é, e aí não há
sobreposição nenhuma.

---

## Quinta ronda · Sessão em cookie, dependências e Resend a sério (2026-08-07)

### Alto · Token em `localStorage`, resolvido

Registado como risco em aberto desde a segunda ronda: uma falha de XSS dava
acesso direto ao token de sessão. Migrado para cookie `__Host-lumina-session`
(`HttpOnly`, `Secure`, inicialmente `SameSite=None` — corrigido para `Lax`
na sexta ronda, ver abaixo) — o JavaScript da própria app já não lhe
consegue tocar, muito menos um script injetado.

Isto obriga a proteção CSRF: sem ela, o próprio cookie a ser enviado sozinho
pelo browser abriria a porta a um pedido forjado por um site de terceiros.
A primeira versão usou o padrão clássico de "cookie CSRF legível por JS" —
e **rebentou em teste de browser real contra a produção**, não em revisão de
código: a API (Railway) e o frontend (Vercel) vivem em domínios diferentes, e
`document.cookie` do lado do frontend nunca vê um cookie posto pela API,
mesmo que o browser o envie sozinho no pedido. `curl` não apanha isto — só
simula o pedido, não a política de origem real de um browser. Um teste
Playwright contra o site publicado, a clicar em "Sair" a sério, é que expôs
o `403` que os testes por `curl` (a construir o cabeçalho à mão) mascaravam.

Corrigido com o valor CSRF embutido (assinado) dentro do próprio JWT em vez
de num cookie à parte: o servidor devolve-o no corpo das respostas de
login/registo/`/auth/me`/etc, o frontend guarda-o em memória (nunca em
`localStorage`) e repete-o num cabeçalho `X-CSRF-Token` em todo o pedido que
muda estado. Um site de terceiros não o consegue forjar — não lê o cookie de
sessão (`HttpOnly`) nem a resposta de um pedido que não é seu (política de
origem, desta vez a favor). Testado a fundo: emissão/limpeza dos cookies,
bloqueio de pedidos sem/com CSRF errado, sobrevivência a reload, compatibilidade
com o cabeçalho `Authorization` antigo, e a suite de regressão completa — tudo
contra a API e o frontend publicados, incluindo um percurso real de browser
(registo → reload → logout pelo botão).

### Médio · Vulnerabilidades de dependências, resolvidas

`node-cron` 3→4 e `vite`/`@vitejs/plugin-react` 5→8, adiadas na terceira ronda
por exigirem versão maior. Investigada a mudança de comportamento de cada
uma antes de subir (reescrita interna do `node-cron` não afeta o uso mínimo
feito aqui; `vite@8` não usa opções de build que dependessem do bundler
antigo). `npm audit` sem avisos pendentes em nenhum dos dois projetos.

### Resend configurado e testado com envio real

`RESEND_API_KEY` e `EMAIL_FROM` configurados no serviço da API. A primeira
tentativa falhou (`403`, domínio por omissão `lumina.app` não verificado no
Resend) — diagnosticado pelos próprios logs do envio, não assumido como
"deve funcionar". Corrigido apontando `EMAIL_FROM` para um domínio
verificado do dono da conta. Confirmado com um envio real de recuperação de
password, entregue e verificado na caixa de entrada.

### Cloudflare R2 configurado e testado com upload real

Bucket `lumina-media` criado na Europa (`EEUR`), com acesso público via
domínio `r2.dev` gerido pela própria Cloudflare. Duas armadilhas pelo
caminho, nenhuma no código: (1) um token geral da conta Cloudflare não
serve para assinatura S3 — precisa do par Access Key ID + Secret Access
Key específico, gerado só através de "R2 → Manage R2 API Tokens"; (2) o
R2 precisa de ser ativado uma vez por conta antes de qualquer chamada à
API funcionar — sem isso, tanto o token geral como um token R2 bem
configurado devolvem o mesmo erro genérico de autenticação, o que
mascarava a causa real.

Testado de ponta a ponta contra o R2 verdadeiro (não simulado): pedido de
URL assinado, envio direto do ficheiro, verificação da assinatura do
formato a partir do URL público, o URL público a servir o conteúdo
correto, um ficheiro forjado (extensão certa, conteúdo errado) a ser
recusado, e o caso de uso real — publicar um Momento com foto e ele
aparecer na listagem de quem partilha a comunidade.

---

## Sexta ronda · Sessão nunca gravada no Safari, e outros bugs reais em produção (2026-08-07)

### Crítico · O cookie de sessão nunca ficava gravado no Safari/WebKit (iOS incluído)

Reportado pelo utilizador: feed a mostrar "Sessão em falta", Convites a
"cair a sessão", tudo depois de entrar normalmente. Reproduzido e
confirmado com Playwright a sério em **WebKit** (motor do Safari, usado por
todos os browsers em iOS) — nunca testado nesse motor até agora, só em
Chromium. O resultado era claro: zero cookies visíveis ao browser logo a
seguir ao registo, e todo o pedido autenticado a seguir devolvia 401.

A causa: `SameSite=None` num cookie posto por uma API num domínio
diferente do frontend (Railway vs Vercel) é tecnicamente aceite pela
especificação, mas o Safari trata-o como rastreio entre sites e recusa-se
a guardá-lo quando é posto por `fetch()`, mesmo assim. Funcionava em
Chromium (usado em todos os testes automatizados anteriores) e falhava
sempre em WebKit — nenhum teste anterior apanhava isto.

Corrigido na raiz, não com mais uma exceção: a Vercel passa a reencaminhar
`/api/*` para a API na Railway (`web/vercel.json`), por isso o browser já
só fala com um único domínio — deixa de haver "terceiro" nenhum. O cookie
passou de `SameSite=None` para `SameSite=Lax` (mais seguro, e deixa de
precisar da exceção que o Safari recusava). Testado de fundo outra vez em
WebKit: registo, reload, Convites, segundo reload — sessão sólida do
princípio ao fim, sem um único 401 fora do pedido inicial (antes de haver
sessão nenhuma). Também confirmado sem regressões em Chromium.

Verificado ainda que o IP real de cada pessoa continua a chegar
corretamente à API através deste novo salto (Vercel → Railway) — importante
para o limite de pedidos por IP não passar a ser partilhado por toda a
gente que passa pelo proxy.

### Alto · Sessão presa sem aviso quando o token deixa de ser válido

Um 401 a meio da sessão (token expirado ao fim de 30 dias, password mudada
noutro sítio, "fechar tudo em todo o lado") deixava a pessoa presa no ecrã
em que estava — cada ação seguinte falhava em silêncio com um aviso
genérico, sem devolver ninguém ao ecrã de entrada. Corrigido com um
mecanismo central (`api.js` → `onUnauthorized`, registado uma vez na
`App`): qualquer 401 de uma rota autenticada limpa a sessão e mostra
"A sessão expirou. Entra outra vez." — mas só quando havia mesmo sessão
antes, para não disparar no pedido silencioso do arranque, antes de
sequer entrar.

### Alto · Ligações de termos/privacidade apagavam o formulário de registo

`<a href="/termos">` dentro do formulário de registo: sem router nenhum na
app, isto era uma navegação a sério, que recarregava a página do zero. A
pessoa perdia tudo o que já tinha escrito (nome, utilizador, data de
nascimento, email, password) só por querer ler o que estava a aceitar.
Corrigido trocando por botões que mostram o mesmo ecrã `Legal` já usado
noutros sítios da app, sem sair da sessão do formulário.

### Médio · Lista de sessões desatualizada depois de mudar password ou "fechar tudo"

`POST /auth/change-password` e `POST /sessions/revoke-all` emitem um token
novo mas nunca o registavam na tabela `sessions` — a pessoa mudava a
password e a página de segurança continuava a mostrar os dispositivos
antigos como ativos (já tinham sido invalidados a sério, só a tabela não
sabia) e não mostrava o dispositivo atual de todo. Corrigido chamando
`recordSession` nas duas rotas.

### Médio · Service worker com uma guarda "API é outra origem" que deixou de ser verdade

`web/public/sw.js` decidia nunca guardar em cache pedidos para a API
comparando a origem do pedido com a da app — proteção certa quando a API
vivia mesmo noutro domínio. Depois do proxy da Vercel, `/api/*` passou a
ser a mesma origem, e a guarda deixava de identificar estes pedidos. Não
rebentava nada hoje (nenhum outro código do service worker respondia a
pedidos GET fora de `/assets/`), mas ficava à espera do próximo código que
tentasse cache genérico e passasse a guardar respostas autenticadas num
dispositivo partilhado. Corrigido para verificar o caminho (`/api/`), não
só a origem.

### Menor · Promessa sem tratamento e corridas ao trocar rápido de comunidade/conversa

Um voto falhado tentava recarregar as propostas sem apanhar uma segunda
falha (podia rebentar sem ser apanhado). Trocar de comunidade ou de
conversa mais depressa do que a rede respondia podia deixar o ecrã a
mostrar dados da comunidade ou conversa errada, por a resposta mais lenta
chegar depois da mais rápida. Corrigido com tratamento de erro em cada
promessa e uma bandeira que ignora respostas que já não interessam.

### Auditoria mais ampla, sem mais achados confirmados

Pedida uma verificação a todo o projeto. Confirmado sem problemas: nenhuma
referência esquecida ao antigo cookie CSRF ou ao token em `localStorage`;
CSP consistente com todos os recursos externos que a app carrega a sério.
Identificado (não corrigido nesta ronda inicialmente, por ser
funcionalidade em falta e não bug, depois pedido e implementado — ver
abaixo): não havia forma de mudar foto de perfil, cor, nome, biografia ou
password a partir da própria app depois do registo.

### Foto de perfil, edição de nome/biografia/cor e mudança de password

Implementado a pedido. `users.avatar_url` novo (migração `005_profile.sql`),
opcional — sem foto, continua o Orb colorido de sempre; com foto, mostra-a
em todo o sítio onde o autor aparece (feed, comentários, momentos,
conversas). Upload validado da mesma forma que as imagens de posts: tem de
ser tua e ter passado a verificação de assinatura do ficheiro, senão
`PATCH /auth/me` recusa (`unconfirmed_upload`) — testado a rejeitar
explicitamente um URL alheio.

Ecrã novo "Editar perfil", ligado às rotas que já existiam no backend mas
sem nada a chamá-las.

Testado a fundo, com dois achados reais só visíveis com um browser a
sério (não com os meus scripts de teste, que chamam a API diretamente e
não estão sujeitos às proteções do próprio browser):

- **O bucket R2 nunca teve CORS configurado.** Todos os testes anteriores
  ao upload de imagens (posts, Momentos) passavam por `fetch()` num script
  Node, que não aplica a política de origem do browser — nunca tinha sido
  testado a sério a partir da app. O primeiro upload feito de um browser
  real falhava sempre, silenciosamente do ponto de vista de quem usa a
  app: "Access to fetch... blocked by CORS policy". Corrigido configurando
  CORS no bucket (`PUT .../r2/buckets/lumina-media/cors`) a aceitar
  `PUT`/`GET`/`HEAD` a partir do domínio da app.
- **A CSP bloqueava a pré-visualização local da foto escolhida.**
  `img-src` não incluía `blob:`, usado pela pré-visualização antes do
  envio. Acrescentado.

Ambos só apareceram no primeiro teste com upload de imagem feito de dentro
de um browser real — reforça que testar por API não substitui testar a
app como alguém a usa.

---

## Sétima ronda · A app rebentava ao abrir Convites sem comunidade, e teclado que fechava sozinho (2026-08-07)

### Crítico · A app rebentava ao abrir "Convites" numa conta sem comunidade nenhuma

`PAL[coms.findIndex(c => c.id === pick) % 5]` — sem nenhuma comunidade
correspondente a `pick`, `findIndex` devolve `-1`; em JavaScript
`-1 % 5` é `-1`, não `4` (o resto negativo mantém-se negativo, ao
contrário de Python), e `PAL[-1]` é `undefined`. O acesso a `.chip` a
seguir rebentava o render inteiro, apanhado pelo `ErrorBoundary` — exatamente
o "a app vai abaixo, reinicia" reportado. Reproduzido de propósito com uma
conta sem nenhuma comunidade e confirmado byte a byte com o erro exato
(`Cannot read properties of undefined (reading 'chip')`). Corrigido com
`Math.max(0, ...)` antes do resto.

### Alto · O teclado fechava-se sozinho a meio de escrever um post

`Composer`, `Nav` e `Toast` estavam definidos **dentro** do corpo de `App`,
recriados a cada render — uma função redefinida a cada render é, aos olhos
do React, um tipo de componente diferente do anterior. Cada tecla escrita
no campo de texto do `Composer` muda o estado `body`, o que recria a
própria função `Composer`, e o React desmonta e volta a montar o modal
inteiro a cada tecla — tirando o foco do campo e fechando o teclado no
telemóvel. Corrigido movendo os três para fora, como componentes de topo
estáveis que recebem o que precisam por props. Testado escrevendo letra a
letra com atraso entre cada uma (como um teclado real faria): o campo
mantém o foco e o texto chega inteiro.

### Pedidos de design

Barra de navegação passou de barra a toda a largura para pílula flutuante
(com margem, cantos arredondados, sombra). Texto "Ver o feed" no ecrã de
abertura aumentado.

### Verificado, não alterado

O temporizador dos Momentos (avança automaticamente a cada 5 segundos,
passa ao momento seguinte do mesmo amigo ou ao amigo seguinte no fim) já
existia e está correto no código — confirmado por leitura cuidadosa, não
foi preciso mudar nada.

---

## Oitava ronda · Recorte de foto, amigos, e ícone novo (2026-08-07)

### Recorte interativo da foto de perfil

O corte automático por CSS (`object-fit: cover`) só fica bem quando a
cara está mesmo ao centro da foto original — em qualquer outro caso corta
mal, sem forma de corrigir. Construído um recorte circular a sério:
arrastar para posicionar, barra para ampliar, tudo feito com matemática
de posição/escala e `canvas.drawImage` para gerar o PNG final (sem
bibliotecas). Usado na foto de perfil, onde o resultado é sempre um
círculo — nos Momentos, que mostram a imagem inteira sem cortar
(`object-fit: contain`, ecrã inteiro), um recorte quadrado não fazia
sentido; ficou só a pré-visualização em falta.

Um bug real apanhado a testar com uma imagem a sério (não com o meu
ficheiro de teste, que por sua vez tinha dados PNG inválidos escritos à
mão — a primeira suspeita de bug foi, ela própria, um falso alarme):
o evento `onLoad` da imagem podia não disparar a tempo de o React o
apanhar, deixando o botão de confirmar desativado para sempre. Corrigido
com uma verificação no próprio `ref` do elemento (`img.complete` +
`naturalWidth`), o contorno conhecido para esta condição de corrida.

### Pré-visualização ao escolher foto para Momento

Não havia nenhuma — só o nome do ficheiro em texto. Acrescentada uma
pré-visualização real, no mesmo enquadramento (`contain`) em que o
Momento vai aparecer depois de publicado, mais um botão para remover e
escolher outra.

### Ecrã de Amigos: pesquisar, ver quem sigo, seguir

`api.users.search`, `.get`, `.follow`, `.unfollow` já existiam no
backend e no cliente, sem nenhum ecrã ligado a eles. Novo ecrã "Amigos"
(pesquisa por nome/utilizador, lista de quem já sigo por omissão, seguir
e deixar de seguir em cada resultado), acessível pelo ícone que antes
estava no cabeçalho do feed a fingir ser pesquisa (só atualizava o feed —
corrigido para abrir isto a sério) e por um atalho novo no ecrã de
Perfil. Rota nova no backend, `GET /users/me/following`, para a lista por
omissão sem precisar de pesquisar primeiro.

### Ícone da app redesenhado

O anterior era uma bola azul com um ponto branco e vermelho — pouco
distinto. Novo ícone gerado com a mesma técnica de sempre (buffer RGBA
pixel a pixel, comprimido com zlib, PNG escrito à mão, sem
dependências): quadrado arredondado com o gradiente real da marca
(cobalto → coral, o mesmo dos halos usados no resto da app), um círculo
de luz grande com brilho suave (o "amanhecer", ligação direta ao nome
Lumina) e um segundo círculo sobreposto mais pequeno (duas pessoas, uma
comunidade). Composição desenhada dentro da zona segura de 80% central,
para não ser cortada pelo recorte automático dos ícones adaptáveis do
Android ("maskable"). Script guardado em `web/scripts/gen-icons.mjs`,
desta vez commitado — o anterior não tinha sobrevivido no repositório.

---

## Nona ronda · Não havia forma nenhuma de criar ou entrar numa comunidade (2026-08-07)

### Crítico · "Erro interno" ao propor convite, "faltam campos" ao publicar

As duas rotas (`api.communities.create/join/list`) estavam completas no
backend e no cliente (`api.js`) desde sempre — mas nenhum ecrã da app
alguma vez as chamava. Uma conta nova ficava sem nenhuma comunidade e sem
forma nenhuma, a partir da interface, de arranjar uma. Isto tinha ficado
tapado a sessão inteira porque todos os scripts de teste criavam
comunidades diretamente pela API, nunca pela app a sério.

Sem comunidade, `pick` (a comunidade escolhida nos Convites) e
`comp.community` (no compositor de posts) ficavam `undefined`. Isso
mandava a palavra literal `"undefined"` como id de comunidade:

- Ao publicar, falhava a validação de campos obrigatórios → "Faltam campos".
- Ao propor um convite, `"undefined"` não é um UUID válido — o Postgres
  recusa com o código `22P02`, que o `errorHandler` não tratava, caindo
  no 500 genérico → "Erro interno".

Três correções, todas verificadas com uma conta nova a sério, num browser
real, do registo até publicar e propor:

1. **Ecrã "Comunidades" novo** (`Comunidades` em `App.jsx`): descobrir
   comunidades públicas e entrar, ou criar uma nova (nome, identificador
   com sugestão automática, e as `SEED_PROPOSALS_REQUIRED` ideias de
   arranque que o backend já exigia). Acessível pelo Perfil, e a partir
   dos estados vazios da Abertura e dos Convites quando a conta não tem
   nenhuma comunidade.
2. **`22P02` mapeado para 400 limpo** em `errorHandler`
   (`api/src/middleware/auth.js`): `"Identificador inválido"` em vez do
   500 genérico — mesmo que outro sítio no futuro volte a mandar um id
   por preencher, o erro passa a ser compreensível.
3. **Guarda no botão "Novo"** da navegação: sem comunidade nenhuma, nem
   chega a abrir o compositor — mostra logo "Junta-te a uma comunidade
   primeiro, em Convites."

### Ecrã de Amigos: sugestões, não só pesquisa

Só mostrava resultados depois de escrever um nome — impossível descobrir
alguém sem já saber quem procurar. Rota nova, `GET /users/me/suggestions`
(`api/src/routes/users.js`): pessoas que partilham uma comunidade e ainda
não sigo, ordenadas por comunidades em comum. O ecrã agora mostra sempre
duas listas por omissão — "Os teus amigos" e "Pessoas que talvez
conheças" — e só troca para resultados de pesquisa quando há termo
escrito.

### Verificado com fluxo completo, não só por rota

Registo → popup de boas-vindas → "Criar ou entrar numa comunidade" →
criar (5 seeds) → publicar um post (`201`) → propor um convite. O único
erro que sobrou foi `400 account_too_new` — a regra já existente que
impede contas com menos de `MIN_ACCOUNT_AGE_HOURS` de proporem convite,
a funcionar como esperado, não um bug.

---

## O que continua por fazer

### No código

- **O limite de pedidos é em memória.** Com mais do que uma instância, cada uma
  conta em separado. Precisa de Redis quando escalares. O bloqueio progressivo
  não sofre disto — vive na base de dados.
- **Não há deteção de imagens de abuso.** Verificamos que o ficheiro é uma
  imagem, não o que a imagem contém. Para uma rede com fotos isto é obrigatório
  na prática, e não é coisa que se resolva sozinho — serviços como o PhotoDNA
  existem para isto e exigem candidatura.
- **Sem cifragem ponto a ponto nas mensagens.** Está declarado na política de
  privacidade em vez de deixar a pessoa assumir o contrário.

### Fora do código — e é aqui que está o risco maior

Escrevi rascunhos de tudo o que se pode escrever, em `legal/`:

- `TERMOS.md` — termos de utilização
- `PRIVACIDADE.md` — política de privacidade
- `RGPD-INTERNO.md` — registo de atividades (artigo 30) e plano de resposta a
  violações de dados

**São rascunhos, não documentos prontos.** Descrevem com rigor o que o código
faz, mas têm campos por preencher e precisam de revisão de quem perceba de
direito digital em Portugal. Não sou advogado.

O que continua a depender só de ti:

- **Preencher os campos entre colchetes.** Nome legal, morada, NIF, contactos,
  região de alojamento.
- **Contratos de subcontratação (DPA)** com o alojamento, a Vercel, o Resend e
  a Cloudflare. Todos os disponibilizam; tens de os aceitar e guardar.
- **Revisão jurídica** antes de aceitares alguém que não conheças.
- **Escolher regiões europeias** no alojamento. Evita a questão das
  transferências para fora do Espaço Económico Europeu por inteiro.

---

## Decisões que ficam registadas

**As mensagens efémeras são apagadas do servidor, não escondidas no cliente.**
Quando expiram, `body` e `media_url` passam a `NULL`. Fica o registo de que a
mensagem existiu, para a conversa fazer sentido.

**Isto impede uma segunda leitura, não impede uma captura de ecrã.** A app diz
isso ao utilizador em vez de prometer o contrário.

**Ocultar não é decidir.** Três denúncias tiram o conteúdo da frente; quem
decide se volta é um moderador. Deliberadamente não é por votação — uma
publicação ofensiva pode ser popular.

**Apagar a conta tem 30 dias de espera.** Entrar outra vez cancela o pedido.
Quem apaga por impulso costuma voltar, e um apagamento imediato é irreversível.

**O feed é cronológico e não há índice que permita o contrário.** As reações
contam-se e mostram-se, mas não entram em nenhuma ordenação.

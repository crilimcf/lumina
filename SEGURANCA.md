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

### Alto · RGPD · base de dados alojada nos EUA, não na UE

A `PRIVACIDADE.md` recomenda "escolher regiões europeias" para evitar a
questão de transferências para fora do Espaço Económico Europeu — mas o
Postgres na Railway ficou, por omissão, numa região dos EUA. Tentei mover o
serviço para `eu-west` por comando (`railway service scale`); o resultado foi
inesperado: a app ficou 503 durante a transição e a base voltou a assentar
nos EUA na mesma — o volume de dados está fisicamente preso à região onde
nasceu, e mudar a réplica não muda onde o volume vive.

**Não tentei outra vez.** A base está vazia (0 utilizadores reais, nunca
corri o seed em produção), por isso a forma segura de resolver é apagar este
serviço Postgres e criar um novo já na região certa pelo painel da Railway —
lá a região é uma escolha explícita no momento da criação, em vez de um
comando às cegas sobre um recurso com estado. Fica por fazer porque mexer
outra vez num Postgres com uma base viva não é coisa para tentativa e erro.

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

## O que continua por fazer

### No código

- **O limite de pedidos é em memória.** Com mais do que uma instância, cada uma
  conta em separado. Precisa de Redis quando escalares. O bloqueio progressivo
  não sofre disto — vive na base de dados.
- **O token vive em `localStorage`.** Uma falha de XSS dá acesso à sessão. A
  alternativa — cookie `HttpOnly` — obriga a proteção CSRF e complica o
  frontend. Vale a pena trocar antes de crescer.
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

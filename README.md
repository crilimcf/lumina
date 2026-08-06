# Lumina

Uma rede de comunidades pequenas. Cada comunidade tem o seu convite do dia,
escolhido por quem lá está. Sem anúncios e sem algoritmo.

```
lumina/
├── api/          Node 20 + Express + Postgres  → Railway (ou Render)
├── web/          React + Vite (PWA)            → Vercel
├── legal/        rascunhos dos termos e da privacidade
├── SEGURANCA.md  auditoria: o que foi corrigido e o que falta
├── render.yaml   blueprint do Render
└── api/railway.json
```

---

# Pôr no ar

Tudo em cloud: **GitHub** (código), **Render** (API e base de dados),
**Vercel** (frontend), **Resend** (email) e **Cloudflare R2** (imagens).

## 1 · Código no GitHub

Cria um repositório novo e envia esta pasta. Se não usas git, o GitHub deixa
arrastar ficheiros pelo site: **Add file → Upload files**.

## 2 · Base de dados e API

### Qual escolher

A app tem uma exigência que decide tudo: **um processo que corre a horas certas**.
Os convites rodam de hora a hora e as mensagens efémeras têm de ser apagadas em
minutos. Um serviço que adormece por inatividade não serve — a comunidade
acordava sem convite e ninguém dava por isso durante dias.

Isso elimina os planos gratuitos que hibernam, e elimina o alojamento
*serverless* (as funções da Vercel não mantêm ligações a Postgres nem correm
processos longos).

**Recomendo o Railway**, por três razões concretas:

1. Não hiberna, mesmo no escalão mais barato.
2. A base de dados e a API vivem no mesmo projeto e a ligação é interna.
3. Os trabalhos periódicos correm dentro do processo da API — sem serviços
   extra e sem custo adicional.

**O Render faz o mesmo trabalho**, mas com uma diferença que importa: no plano
gratuito o serviço adormece, e os Cron Jobs são pagos à parte. Fica mais caro
para chegar ao mesmo sítio. Se preferires o Render — e já lá tens conta, o que
vale alguma coisa — o `render.yaml` na raiz cria tudo de uma vez, com os
trabalhos em serviços próprios.

Os preços dos dois mudam com frequência. Confirma nas páginas deles antes de
decidires; o que escrevo aqui é sobre arquitetura, não sobre valores.

### Railway (recomendado)

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. Escolhe o repositório e define **Root Directory** = `api`
3. No mesmo projeto: **New** → **Database** → **Add PostgreSQL**
4. No serviço da API → **Variables**:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `JWT_SECRET` | `openssl rand -base64 48` |
| `PGSSL` | `true` |
| `NODE_ENV` | `production` |
| `APP_URL` | endereço da Vercel (passo 3) |
| `CORS_ORIGIN` | o mesmo endereço |

5. **Settings → Networking → Generate Domain**

⚠️ Em produção o arranque **falha de propósito** se `CORS_ORIGIN` não estiver
definido. Melhor rebentar no deploy do que ficar aberto a qualquer origem sem
ninguém reparar.

A base de dados migra-se sozinha. Confirma nos logs: `[migracao] base de dados
em dia`.

### Render (alternativa)

**New → Blueprint** → aponta ao repositório. O `render.yaml` cria a base de
dados, a API e três Cron Jobs. A API arranca com `RUN_JOBS_IN_PROCESS=false`
porque os trabalhos vivem em serviços próprios.

Para começar sem pagar os Cron Jobs: mantém `RUN_JOBS_IN_PROCESS=true` e usa um
serviço externo de ping para a API não adormecer. Funciona, mas é frágil — se o
ping falhar, os convites param.

## 3 · Frontend — Vercel

1. [vercel.com](https://vercel.com) → **Add New → Project** → importa o repositório
2. **Root Directory** = `web`
3. **Environment Variables**: `VITE_API_URL` = o endereço do Render
4. **Deploy**

Volta ao Render e mete o endereço da Vercel em `APP_URL` e `CORS_ORIGIN`.

⚠️ No plano gratuito do Render o serviço adormece e o primeiro pedido depois
disso demora perto de um minuto. Para um teste com amigos serve; para pessoas
que não te conhecem, não — ninguém espera um minuto por um ecrã de entrada.

## 4 · Email — Resend

Sem isto, ninguém recupera a password. Os emails vão para os logs em vez de
serem enviados, o que serve para testar mas não para pessoas reais.

1. [resend.com](https://resend.com) → cria uma API key
2. No Render: `RESEND_API_KEY` e `EMAIL_FROM`

Para enviar do teu domínio tens de o verificar no Resend (uns registos DNS).
Enquanto não o fizeres, usa `onboarding@resend.dev` como remetente.

## 5 · Imagens — Cloudflare R2

Sem isto, os posts não têm fotos. Escolhi o R2 porque não cobra saída de dados,
que numa app de fotografia é o custo que mais depressa cresce.

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **R2** → cria um bucket `lumina`
2. **Settings → Public access** → liga o acesso público
3. **Manage API tokens** → cria um token com permissão de leitura e escrita
4. No Render: `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_PUBLIC_URL`

**CORS do bucket** — sem isto o telemóvel não consegue enviar nada:

```json
[{
  "AllowedOrigins": ["https://o-teu-endereco.vercel.app"],
  "AllowedMethods": ["PUT", "GET"],
  "AllowedHeaders": ["content-type"],
  "MaxAgeSeconds": 3600
}]
```

## 6 · Primeira comunidade

A app não traz comunidades. Cria a primeira pela API — precisas de cinco
convites de arranque, senão ela nasce muda:

```bash
curl -X POST https://lumina-api.onrender.com/communities \
  -H "authorization: Bearer O_TEU_TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "slug": "fotografia",
    "name": "Fotografia",
    "timezone": "Europe/Lisbon",
    "seedProposals": [
      "Algo azul",
      "A primeira coisa que viste hoje",
      "Uma sombra que te fez parar",
      "O céu, sem cortar nada",
      "A janela mais próxima de ti"
    ]
  }'
```

O token sai do registo ou do login.

---

# Correr localmente

```bash
# api
cd api && cp .env.example .env    # mete um DATABASE_URL e um JWT_SECRET
npm install && npm run seed && npm run dev

# web (noutro terminal)
cd web && npm install && npm run dev
```

O Vite encaminha `/api` para `localhost:3000`, por isso não há problemas de CORS.
O seed cria quatro contas, todas com a password `lumina1234`.

---

# As decisões que estão no código

**O dia vira à meia-noite do fuso da comunidade.** `communities.timezone` guarda
um fuso IANA. A alternativa — 24 h a contar da abertura — destrói o ritual: o
convite abre às 9h, depois às 9h20, e ao fim de uma semana ninguém sabe quando é.
Testado com Lisboa, Tóquio e Kathmandu (+5:45).

**Fundar uma comunidade exige cinco convites de arranque.** Sem eles, a
comunidade acorda no primeiro dia com a lista vazia e o convite não abre.

**Se a lista esvaziar, a comunidade fica sem convite nesse dia** em vez de
repetir um. É um sinal para avisar os moderadores, não um buraco para tapar.

**Moderação em três camadas.** Limites automáticos (conta com 24 h, três
propostas por semana, sem ligações) apanham quase todo o spam. Três denúncias
escondem o conteúdo. Moderadores da comunidade decidem se volta. A decisão não
é por votação — uma proposta ofensiva pode ser popular.

**O feed é cronológico e não há como não ser.** Não existe índice por contagem
de reações. 👍 e 🔥 contam-se e mostram-se, mas não entram em nenhuma ordenação.

**As mensagens efémeras são apagadas mesmo.** Quando expiram, `body` e
`media_url` passam a `NULL` na base. Isto impede uma segunda leitura, não
impede uma captura de ecrã — e a app diz isso ao utilizador.

**O registo de dias só cresce.** Os dias falhados ficam em branco e ficam assim.
É a antecipação do streak sem o mecanismo que o torna tóxico: não há contador a
zerar nem nada a perder.

**Subscrições atrás de flag.** `FEATURE_SUBSCRIPTIONS=false`. Mexer em dinheiro
traz obrigações que não valem a pena antes de haver quem pague.

---

# O que ainda falta

Isto está pronto para um teste fechado com pessoas que conheces. **Não está
pronto para um lançamento público.** O que falta:

**Legal, antes de qualquer pessoa que não conheças**
- Termos de utilização e política de privacidade. **A app já tem os links no
  registo e apontam para páginas que ainda não existem.**
- Contacto de moderação visível
- Contratos de subcontratação (DPA) com o alojamento, a Vercel, o Resend e a
  Cloudflare

Ver `SEGURANCA.md` para a lista completa.

**Técnico**
- Notificações push. Sem elas o convite diário não funciona: ninguém abre a app
  a adivinhar. É o maior buraco funcional que resta.
- Tempo real nas conversas. Neste momento sonda de cinco em cinco segundos.
- Testes automatizados. O que existe foi verificado à mão contra um Postgres
  real.
- Monitorização de erros (Sentry ou equivalente).
- Deteção de imagens de abuso. Para uma rede com fotos é obrigatório na prática.
- Autenticação em dois passos.

**Produto**
- Nada disto resolve o problema difícil: o convite diário só funciona com
  pessoas a responder. Numa comunidade vazia é um ecrã triste. Vale mais
  pôr dez pessoas a responder durante duas semanas do que acrescentar
  funcionalidades.

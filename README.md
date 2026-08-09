# Lumina

Lumina é uma rede social mobile-first centrada em comunidades pequenas, feed cronológico, Momentos de 24 horas, Salas e conversas privadas.

## Estado

A aplicação é composta por:

- **Web/PWA:** React 18 + Vite, publicada na Vercel.
- **API:** Node.js 20 + Express, publicada no Railway.
- **Base de dados:** PostgreSQL.
- **Media:** armazenamento S3 compatível / Cloudflare R2.
- **Email:** Resend.
- **CI:** GitHub Actions com testes de integração da API, build e end-to-end Mobile Safari/WebKit.

Produção web canónica: `https://lumina-snowy-ten.vercel.app`

## Estrutura

```text
lumina/
├── .github/
│   ├── dependabot.yml
│   └── workflows/          CI, Mobile Safari e fallback Railway
├── api/
│   ├── migrations/         schema PostgreSQL versionado
│   ├── scripts/            jobs e operações administrativas
│   ├── src/                API Express
│   ├── test/               testes de integração
│   └── public/             build web gerado para fallback Railway
├── docs/                   arquitetura, QA, segurança e operações
├── legal/                  documentos legais canónicos
├── web/
│   ├── e2e/                Playwright/WebKit
│   ├── public/             manifest, ícones e assets públicos
│   ├── scripts/            geração/sincronização de assets
│   └── src/                aplicação React
└── arrancar.sh             preparação do ambiente local
```

> `api/public/` é intencional. O workflow `Build Railway web fallback` recompila `web/` e publica o resultado nesse diretório para manter uma segunda via de entrega da interface. Não deve ser editado manualmente.

## Desenvolvimento local

Requisitos: Node.js 20+, npm, Git e PostgreSQL.

```bash
bash arrancar.sh
```

Ou manualmente:

```bash
cd api
cp .env.example .env
npm ci
npm run migrate
npm run dev
```

Noutro terminal:

```bash
cd web
cp .env.example .env
npm ci
npm run dev
```

## Testes

API completa:

```bash
cd api
npm ci
npm test
```

Build web:

```bash
cd web
npm ci
npm run build
```

Mobile Safari/WebKit usa Playwright e corre automaticamente no GitHub Actions. A configuração e a matriz de fluxos estão em [docs/QA.md](docs/QA.md).

## Regras de release

Nenhuma alteração deve chegar ao `master` sem:

1. `API integration tests` verde.
2. `Web build` verde.
3. `Mobile Safari end-to-end` verde.
4. Auditoria de dependências de produção sem vulnerabilidades `high` ou `critical` conhecidas.
5. Verificação da produção depois do deploy.

Consultar [docs/OPERATIONS.md](docs/OPERATIONS.md) para deploy, fallback, reset e recuperação.

## Documentação

- [Arquitetura](docs/ARCHITECTURE.md)
- [QA e testes](docs/QA.md)
- [Segurança](docs/SECURITY.md)
- [Operações e releases](docs/OPERATIONS.md)
- [Termos](legal/TERMOS.md)
- [Privacidade](legal/PRIVACIDADE.md)
- [RGPD interno](legal/RGPD-INTERNO.md)

## Princípios de produto

- Feed cronológico, sem ranking por reações.
- 👍 e 🔥 são expressão social, não mecanismo de ordenação.
- Perfis podem ser públicos ou privados; pedidos privados exigem aceitação.
- Salas podem ser públicas ou privadas; Salas Ultra permanecem atrás de feature/UX desativada.
- Momentos duram 24 horas. Foto/vídeo pode ser editado, trocado ou removido antes de publicar; depois de publicado, o autor pode substituir o media sem reiniciar as 24 horas ou apagar o Momento.
- Conteúdo efémero é limpo por jobs da API.
- Produção não usa dados de demonstração.

## Segredos

Nunca colocar `.env`, tokens, palavras-passe, chaves R2/S3, JWT secrets ou chaves Stripe/Resend no Git. Os exemplos de configuração estão em `api/.env.example` e `web/.env.example`.

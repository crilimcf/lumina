# Lumina — Proteção de releases e ensaio de restauro

Atualizado: 12/11/2026. Este guia não altera automaticamente o ambiente de produção.
Nunca anexar dumps PostgreSQL, chaves ou tokens a commits, Issues, logs CI ou serviços públicos.

## Estado conhecido
- Produção principal: `crilimcf/lumina` em `master`, web Vercel + API Railway + PostgreSQL Railway.
- Última release confirmada após PR #212: `284af7ff`, com API e Vercel online.
- PostgreSQL: volume redimensionado de 500 MB para **5 GB** em 10/11. Utilização em 12/11 ~**0,68 GB (13,6%)**; sem indícios de esgotamento.
- O Railway continua a expor `warningCount: 1` no serviço Postgres sem diagnóstico detalhado. **Não** assumir que é um aviso atual de capacidade.
- O dump externo `lumina-backup-20261110.dump` foi transferido em 10/11, com SHA-256 local/remoto coincidente. Um checksum igual **não** prova restauro.
- Gestão de credenciais e acessos de produção deve ser tratada num processo privado e aprovado, fora desta revisão.
- Não criar contas de produção nem fazer compras reais para concluir esta auditoria.

## A) Proteção GitHub — por ativar nas Settings

A integração GitHub utilizada por esta auditoria **não tem permissões de administração** para ativar regras do repositório. A proteção observada do `master` é `protected: false`.

1. Abrir **Settings → Branches → Add branch protection rule** (ou Rules → Rulesets) em `https://github.com/crilimcf/lumina/settings/branches`.
2. Aplicar à branch `master`. Exigir **pull request before merging**, **required status checks** e resolução de conversas; proibir `force push` e eliminação da branch.
3. Selecionar checks que são criados em **todas** as PR: `Web build`, `API integration tests`, `Mobile Safari end-to-end (1/2)` e `Mobile Safari end-to-end (2/2)`. Conferir nomes concretos na UI do GitHub Actions antes de guardar.
4. Os builds nativos `Android APK and AAB` e `iOS simulator build` só surgem em determinadas PR, porque `mobile.yml` tem `paths`. Não os exigir globalmente sem primeiro os tornar sempre executáveis.
5. Se for aplicável, impedir bypass a quem publica alterações; manter permissões administrativas limitadas.

O GitHub pode exigir um plano com suporte de proteção de branches em repositórios privados. Se o controlo não aparecer, rever o plano, sem tornar o repositório público como atalho.

## B) Railway — por ativar nas Settings

Em Railway, abrir serviço **api → Settings → Source → Wait for CI** e ativar depois de confirmar que o GitHub está ligado e os workflows `push master` aparecem. Esta opção faz o Railway aguardar pelos resultados dos workflows GitHub antes de disparar um deploy; não altera PostgreSQL, secrets nem pagamentos.

**Confirmar:** num próximo push aprovado para `master`, o novo deployment deve passar por `WAITING` até os workflows necessários acabarem com sucesso. A opção não estava ativa em 12/11 (`checkSuites: false`).

## C) Observação automática — nova workflow

`.github/workflows/production-smoke.yml` verifica apenas URLs públicas, sem autenticação:
- API `GET /health` responde com `ok: true`
- A web devolve HTML com `id="root"`
- `GET /api/reports/product-health` sem sessão devolve **401**; nunca revelar indicadores internos.

A GitHub Action corre a cada seis horas, pode ser iniciada **manualmente após cada release** em Actions → Production smoke → Run workflow e corre nesta PR ao alterar a própria workflow para validar os endpoints públicos. Não é disparada por `push` ou `workflow_run`, para impedir um ciclo em que Railway Wait for CI aguardaria por um smoke test que depende do próprio deployment. **Deteta** incidentes, mas **não bloqueia** um deployment por si só. Os bloqueios são GitHub branch protection e Railway Wait for CI.

## D) Restaurar backup local sem tocar em produção

A workflow `.github/workflows/offline-restore-drill.yml` testa o script com um dump sintético criado no próprio CI. **Não tem acesso ao dump real.**

Para confirmar **o backup real de 10/11** num Mac, Linux ou Windows + WSL2 com Docker operacional:

1. Guardar o backup fora do repositório, numa pasta privada.
2. Confirmar o SHA-256 com o valor que foi validado em 10/11. Não divulgar o checksum caso esteja associado a um ficheiro privado em repositórios públicos.
3. Executar a partir da pasta do repositório:

```bash
bash scripts/rehearse-postgres-restore.sh "/caminho/privado/lumina-backup-20261110.dump"
```

O script usa PostgreSQL 18, valida `PGDMP`, repõe os dados num container Docker **sem rede nem portas expostas**, verifica tabelas nucleares e elimina automaticamente o container. Não utiliza a variável `DATABASE_URL` nem liga ao Railway.

**Aceitação:** resultado `RESTORE_OK`, sem erros de `pg_restore`, com início/fim registados para medir duração (RTO do ensaio). Confirmar a data/hora do backup para estimar o intervalo de perda aceitável (RPO). Fazer cópias frequentes fora da instância e testar restauros periodicamente.

**Limitação:** restaura SQL, não os objetos S3/R2 (fotografias, vídeos e replays). Verificar separadamente a recuperação e retenção de media.

## E) Verificações restantes antes de considerar a Lumina pronta para escala

- Validar experiências autenticadas com contas isoladas de QA, incluindo erros de conectividade, acessibilidade e dispositivos reais.
- Investigar o aviso residual PostgreSQL no painel Railway, sem mexer no volume que está saudável.
- Rever periodicamente credenciais e permissões fora do repositório público, sem publicar detalhes operacionais sensíveis.
- Conservar Stripe DigiBox, comissão de **10%**, webhooks e onboarding Connect já realizados.
- Não introduzir funcionalidades de saúde/IA médica.

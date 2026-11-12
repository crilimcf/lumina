# Auditoria Lumina — seis prioridades (12 novembro 2026)

**Estado:** melhorias propostas num ramo isolado; **não é uma autorização para publicar**, ativar faturação ou alterar bases de dados em produção.

## Contexto preservado dos dias 10–11/11

- Plataforma principal: Vercel (web), Railway (API e PostgreSQL); repositório `crilimcf/lumina`.
- Stripe DigiBox é a conta autorizada, mas **não** se podem alterar webhooks nem pagamentos de outros projetos.
- Comissão acordada para Lumina Creators: **10%**; qualquer modificação de taxa requer revisão.
- Onboarding Connect Accounts v2 e verificações de criador foram concluídas anteriormente; isto **não equivale** a cobranças públicas, acessos pagos ou payout fim-a-fim validados.
- Foram executados testes Stripe isolados em sandbox e verificado um backup PostgreSQL externo (10/11). **Isso não substitui uma restauração testada nem prova recuperação automática.**
- Não efetuar compras reais, ativar flags de faturação, trocar chaves, alterar volume, remover dados ou introduzir novos tratamentos de dados de saúde como parte desta auditoria.
- Evitar a cor laranja na UI; preservar identidade e fluxo mobile-first.

## 1. Releases fiáveis — P0

**Observado:** Railway `api` online, PostgreSQL online; workflows de CI e WebKit bem-sucedidos em 10/11. A configuração Railway apresenta `source.checkSuites=false`; o runbook exige esperar por CI. Investigar a correspondência entre configuração e política efetiva antes de afirmar que o gate está ativo.

**Feito neste ramo:** as branches `audit/**` passam a executar CI e WebKit em cada push, além dos gates de pull request.

**Condição de aceitação antes de merge:**

1. CI API + web, Safari WebKit e builds móveis exigidos passam no **mesmo SHA**.
2. Confirmar regras do ramo `master` e que Railway não publica commits antes dos checks.
3. Confirmar alias Vercel `READY` e que o web build atualizado corresponde a alterações em `web/`; alterações apenas à API não exigem um build web novo.
4. Confirmar `GET /health` com HTTP 200 e headers `X-Lumina-Release`/`X-Lumina-Schema` (não confundir HEAD/sucesso de deploy com release correta).
5. Não aplicar release enquanto houver alterações pendentes ou regressões.

## 2. Creators e pagamentos — P0

**Observado:** código de Connect v2, onboarding, checkout, webhook e controlo de acessos pagos existe. A conta de criador verificada não comprova por si só checkout, imposto, renovação, cancelamento, reembolso e pagamento ao criador. Flags de ambiente foram vistas **por nome**, sem leitura dos valores; não inferir que a cobrança está ativa.

**Feito neste ramo:** mensagens do Creator Studio passam a distinguir verificação Stripe de acesso pago, incluem estados vazios e esclarecem restrições no iOS/Android.

**Condição de aceitação:**

- Conferir estado real das flags por via autorizada, sem imprimir segredos.
- Validar com ambiente isolado: compra, webhook assinado/idempotente, ativação de membro, cancelamento, reembolso, disputa, renovação, rejeição de pagamento, e nenhum desbloqueio sem subscription ativa.
- Conservar os webhooks DigiBox e dos outros projetos.
- Avaliar App Store / Play Billing para bens digitais em app nativa.
- Só após validação e decisão explícita de lançamento ativar pagamentos reais.

## 3. Experiência e simplicidade — P1

**Observado:** frontend tem camadas sucessivas de CSS e componentes evolutivos; o volume de estilos isoladamente não mede desempenho. A navegação principal é `Feed · Salas · Novo · Radar · Chat`.

**Feito neste ramo:** linguagem de estado e empty states do Creator Studio mais claros, sem modificar a navegação global.

**Condição de aceitação:**

- Testar iPhone pequeno/grande e Android: registo, feed vazio, primeira publicação, salas, conversas, perfil, edição, diretos e Creators.
- Conferir alvos de toque, navegação por teclado, VoiceOver, estados de erro/carregamento, tamanho e contraste.
- Executar auditoria CSS por seletores duplicados em ramo próprio, com screenshots de regressão antes de eliminar regras.
- Não acrescentar IA médica ou secções não validadas.

## 4. Métricas sem recolha excessiva — P1

**Feito neste ramo:** `GET /api/reports/product-health` (staff only, `no-store`) agrega números **já existentes** para 7 dias: contas registadas, novas contas, posts, salas, momentos, planos publicados e memberships pagas ativas. Sem persistir eventos novos nem extrair emails, nomes, IP, mensagens ou corpos de posts. Incluído teste de acesso e ausência de campos identificáveis.

**Limite:** não mede DAU/MAU, utilizadores únicos, retenção, taxa de conversão nem receita. Não alegar esses KPIs a partir destas contagens. Novos eventos analíticos só após desenho e revisão de privacidade, transparência ao utilizador e retenção limitada.

## 5. Backups, segurança e recuperação — P0

**Observado:** volume PostgreSQL 5 GB e ~0,68 GB de utilização registada na auditoria; aviso de infraestrutura pendente. API e DB com uma réplica cada. Backup externo de 10/11 foi reportado como verificado anteriormente, **mas não foi executado nenhum restauro nesta auditoria**.

**Condição de aceitação:**

- Investigar o aviso do Postgres e confirmar backup automático/externo regular, encriptação e retenção.
- Fazer ensaio de restauro **numa instância isolada**, nunca na produção, medindo RPO/RTO.
- Rever separação de acessos, rotação e resposta a incidentes, sem expor segredos em logs/issues.
- Confirmar recuperação também de objetos S3/R2, não só SQL.
- Testar rollback da API/website com migrations compatíveis.

## 6. Percursos reais e qualidade — P1

**Feito neste ramo:** adicionados os testes para métricas de staff; CI e WebKit passam a correr em branches de auditoria.

**Condição de aceitação:**

- Executar testes automatizados de ponta a ponta com contas **isoladas de QA**, não criar contas adicionais na produção.
- Testar caminhos: primeiro acesso → primeira publicação → primeira interação; seguir → feed; convite Sala privada → entrada; DM/chamada → feedback; criador → preparar plano → perceber claramente indisponibilidade de pagamento.
- Em dispositivos reais e com consentimento, validar legibilidade e fluxos principais; recolher erros observados sem registar informação médica ou conversas privadas.
- Consolidar incidentes de UX com severidade e corrigir os três bloqueios mais relevantes antes de novas funcionalidades.

## Verificação de publicação (comandos apenas de leitura)

```bash
curl -fsSI https://api-production-f9e9.up.railway.app/health | grep -Ei 'HTTP/|X-Lumina-(Release|Schema)'
curl -fsSI https://lumina-snowy-ten.vercel.app/ | grep -Ei 'HTTP/|cache-control'
```

Apenas uma resposta HTTP positiva não demonstra que todo o fluxo social funciona.

## Checklist de aprovação

- [ ] CI, build web, WebKit e builds móveis completos passam no mesmo commit.
- [ ] Gate obrigatório GitHub/Railway efetivamente confirmado.
- [ ] Stripe permanece sem cobranças públicas até validação fim-a-fim.
- [ ] Direitos RGPD e política de compras móveis revistos.
- [ ] Alerta PostgreSQL investigado e restauro isolado executado.
- [ ] Percursos essenciais validados sem regressões.
- [ ] Equipa aprova release explícita e confirma saúde após deploy.

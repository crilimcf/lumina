# Registo interno de tratamento e resposta a incidentes

Documento operacional interno. Deve ser revisto sempre que o produto, os fornecedores ou as obrigações aplicáveis mudarem.

> Campos entre `[colchetes]` ficam por preencher pelo responsável pelo tratamento.

## Parte 1 · Registo de atividades

**Responsável pelo tratamento:** Carlos Fernandes, Rua da Cabecinha N.º 23, 5300-802 Rebordainhos, Bragança, Portugal, NIF 227369661
**Contacto:** carlos.fernandes@digibox.pt
**Última atualização:** `10 de novembro de 2026`

### A · Contas e perfis

| Campo | Informação |
|---|---|
| Finalidade | Criar conta, autenticar e apresentar o perfil |
| Titulares | Utilizadores registados, segundo a política de idade do produto |
| Dados | Nome, nome de utilizador, email, data de nascimento, bio, avatar, interesses, configuração público/privado, datas de conta/termos |
| Fundamento | Execução do serviço/Termos; obrigações legais; interesses legítimos de segurança e prevenção de abuso; consentimento quando aplicável |
| Destinatários | Railway/PostgreSQL, Vercel; armazenamento de media quando aplicável |
| Retenção | Enquanto durar a conta, sem prejuízo de obrigações legais e da janela de apagamento |
| Segurança | Password com bcrypt, HTTPS, sessões revogáveis, CSRF, 2FA opcional, rate limiting |

### B · Feed e relações sociais

| Campo | Informação |
|---|---|
| Finalidade | Mostrar o Feed e permitir interação entre pessoas |
| Dados | Follows, pedidos de follow, bloqueios, publicações, comentários, reações e reposts |
| Visibilidade | Feed cronológico com a própria pessoa e autores seguidos; perfis privados exigem follow aceite; bloqueios cortam visibilidade |
| Retenção | Enquanto existir a conta/conteúdo, salvo eliminação ou moderação |

### C · Momentos

| Campo | Informação |
|---|---|
| Finalidade | Partilha temporária de fotografia/vídeo |
| Dados | Media, autor, paleta, data de criação/expiração e visualizações |
| Visibilidade | Mesmo grafo social do Feed |
| Retenção | Conteúdo ativo durante 24 horas; limpeza automática depois da expiração |

### D · Salas

| Campo | Informação |
|---|---|
| Finalidade | Conversa temática em espaços públicos ou privados |
| Dados | Sala criada/aderida, imagem, tópico, descrição, membros, convites, mensagens e, quando aplicável, dados de pagamento |
| Visibilidade | Salas públicas são descobertas na aplicação; Salas privadas dependem de convite |
| Retenção | Enquanto a Sala/conteúdo existirem, salvo pedidos de apagamento e obrigações legais |

### E · Chat e chamadas

| Campo | Informação |
|---|---|
| Finalidade | Comunicação privada entre utilizadores |
| Dados | Conversas, mensagens, media, remetente, leitura/abertura, modo efémero, chamadas e signaling técnico |
| Retenção | Mensagens normais enquanto forem necessárias ao serviço; conteúdo efémero segundo o modo escolhido; chamadas/signaling conforme política operacional |
| Nota | Não existe promessa de cifragem ponta-a-ponta nem de impedir capturas/gravações feitas pelo destinatário |

### F · Segurança e prevenção de abuso

| Campo | Informação |
|---|---|
| Finalidade | Proteger contas, limitar ataques e permitir revogar sessões |
| Dados | Email, IP, user-agent, tentativas de login, sessões, 2FA, códigos de recuperação protegidos |
| Fundamento | Interesses legítimos de segurança e prevenção de abuso; cumprimento de obrigações legais |
| Retenção | Tentativas antigas e tokens são limpos por jobs; restantes dados enquanto necessários para segurança/conta |

### G · Moderação

| Campo | Informação |
|---|---|
| Finalidade | Receber denúncias, ocultar conteúdo de risco e tomar decisões de moderação |
| Dados | Denunciante, tipo/alvo, motivo, nota, decisão, responsável pela decisão e datas |
| Acesso | Fila global reservada à equipa Lumina |
| Retenção | `[prazo a definir juridicamente]` |

### H · Email transacional

| Campo | Informação |
|---|---|
| Finalidade | Recuperação de password e comunicações essenciais |
| Dados | Email e tokens de recuperação armazenados em hash |
| Destinatário | Resend quando configurado |
| Retenção | Token expira em 1 hora; limpeza posterior automatizada |

### I · Media

| Campo | Informação |
|---|---|
| Finalidade | Guardar fotografias/vídeos usados no perfil, Feed, Momentos, Chat e Salas |
| Dados | Objeto, MIME, tamanho, proprietário, finalidade e estado de consumo |
| Destinatário | Cloudflare R2 / fornecedor S3 compatível configurado |
| Segurança | Upload assinado, validação de tipo/tamanho/assinatura binária, ownership e consumo único |
| Retenção | Ligada ao conteúdo; uploads abandonados/órfãos são limpos automaticamente |

### J · Lumina Creators (planos e conteúdo reservado)

| Campo | Informação |
|---|---|
| Finalidade | Preparar planos, permitir autoria e publicar conteúdo reservado; futuramente gerir subscrições |
| Dados | Identificador do criador, título/descrição do plano, valor, periodicidade, estado, conteúdo e datas |
| Fundamento | Execução do serviço solicitado; interesses legítimos de segurança; obrigações legais quando aplicáveis |
| Visibilidade | Planos em rascunho privados; conteúdos publicados só acessíveis ao criador e, após lançamento, a subscritores elegíveis verificados pelo servidor |
| Retenção | Enquanto a conta e os conteúdos forem necessários; sujeito ao ciclo de apagamento e exceções legais |
| Ponto de controlo | FEATURE_CREATORS permite estúdio de rascunhos; FEATURE_SUBSCRIPTIONS desativada; nenhum pagamento deve ser ativado apenas com uma mudança de texto ou flag |

### K · Subscrições pagas e pagamentos a criadores (futuro lançamento)

| Campo | Informação |
|---|---|
| Finalidade | Cobrança recorrente, cancelamento, apoio, reembolsos e pagamentos ao criador |
| Dados | IDs externos Stripe (cliente, conta Connect, subscrição, transação), valor, estado e datas; nunca números completos de cartões |
| Fornecedor | Stripe, sujeito a verificação de acordos, países elegíveis e configuração de produção |
| Fundamento | Execução contratual e obrigações fiscais/legais, apenas após lançamento |
| Retenção | Prazos legais aplicáveis aos documentos financeiros, minimizados e separados do conteúdo social |
| Ponto de controlo | Webhooks autenticados e idempotentes; reconciliação de pagamentos; faturação e impostos; direito de cancelamento; avaliação Apple/Google digital goods; testes de chargebacks |
| Estado | Não implementado em produção. Não apresentar preços como subscrições compráveis |

### L · Funcionalidades de IA (quando utilizadas)

| Campo | Informação |
|---|---|
| Finalidade | Processamento de pedidos de IA expressamente iniciados pelo utilizador |
| Dados | Prompt e dados estritamente necessários à função e respetiva segurança |
| Fornecedor | OpenAI conforme integração e contratação efetiva |
| Fundamento | Execução do serviço solicitado e interesses legítimos de segurança, com consentimento quando exigido |
| Controlos pendentes | Rever minimização, retenção do fornecedor, transferências internacionais, política de conteúdos, base jurídica e eventual AIPD |

## Parte 2 · Exportação e apagamento

`GET /account/export` exporta o modelo de dados atual da conta, incluindo:

- perfil;
- publicações, comentários e reações;
- Momentos;
- seguidores, pessoas seguidas e bloqueios;
- mensagens privadas;
- Salas criadas/aderidas, convites e mensagens de Sala;
- pagamentos de Sala quando existirem;
- chamadas.

O pedido de apagamento é agendado com uma janela de 30 dias. A execução remove a conta e conteúdo/referências abrangidos pelo modelo técnico, incluindo uploads pertencentes à conta. Qualquer exceção legal deve ser definida na política jurídica final.

## Parte 3 · Estado técnico de privacidade

- [x] Perfil público/privado implementado.
- [x] Pedidos de follow para perfis privados implementados.
- [x] Bloqueio bilateral de visibilidade implementado.
- [x] Exportação de dados implementada.
- [x] Pedido/cancelamento/execução de apagamento implementados.
- [x] Sessões revogáveis implementadas.
- [x] Conteúdo efémero e Momentos com limpeza automática.
- [x] Salas privadas protegidas por convite.
- [x] Moderação global reservada à equipa Lumina.
- [x] Identidade e contactos do responsável preenchidos.
- [ ] Confirmar bases jurídicas, prazos de retenção e contratos/subcontratantes.
- [ ] Confirmar regiões de alojamento e mecanismos de transferências internacionais antes do lançamento público.
- [ ] Rever e assinar acordos de subcontratação, incluindo eventuais transferências internacionais, para cada fornecedor usado.
- [ ] Incluir explicitamente planos/conteúdos Creators na exportação RGPD e verificar apagamento em cascata e retenções legais.
- [ ] Confirmar e testar respostas a pedidos RGPD e a denúncias/recurso da moderação (DSA).
- [ ] Efetuar revisão jurídica/fiscal de subscrições, regras de lojas móveis, reembolsos e faturação antes da cobrança.
- [ ] Sincronizar e rever traduções legais PT/FR/EN/ES antes de anunciar versões equivalentes.

## Parte 4 · Resposta a violações de dados

### Hora 0–1 · Conter

- [ ] Isolar o componente afetado; desligar tráfego se necessário.
- [ ] Rodar segredos potencialmente comprometidos (`JWT_SECRET`, base de dados, armazenamento, email, pagamentos).
- [ ] Se necessário, invalidar sessões através de `session_version`/revogação.
- [ ] Preservar logs e evidência antes de reiniciar componentes.

### Hora 1–24 · Avaliar

- [ ] Determinar que sistemas e dados foram afetados.
- [ ] Estimar número de titulares e registos envolvidos.
- [ ] Identificar vetor de entrada e confirmar se continua ativo.
- [ ] Criar cronologia com horas concretas e ações tomadas.
- [ ] Avaliar risco para os titulares com apoio jurídico/segurança.

### Hora 24–72 · Decidir e notificar

Avaliar as obrigações de notificação à autoridade de controlo e aos titulares nos prazos legais aplicáveis. Não assumir automaticamente que todos os incidentes têm o mesmo dever de notificação; documentar a decisão e respetivo fundamento.

### Depois

- [ ] Corrigir a causa estrutural.
- [ ] Criar teste de regressão quando possível.
- [ ] Registar formalmente o incidente e a decisão de notificação.
- [ ] Rever deteção, logs, retenção e resposta.

## Contactos de incidente

| Função | Contacto |
|---|---|
| Responsável interno | `[nome, telefone]` |
| Jurídico/DPO, se aplicável | `[nome, contacto]` |
| Autoridade de controlo | `[confirmar contacto oficial no momento do incidente]` |
| Alojamento | `[contacto]` |

## Registo de incidentes

| Data | Incidente | Dados/titulares afetados | Medidas | Notificação | Encerramento |
|---|---|---|---|---|---|
| | | | | | |

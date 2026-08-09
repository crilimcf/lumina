# Registo interno de tratamento e resposta a incidentes

Documento operacional interno. Deve ser completado e validado juridicamente antes de um lançamento público alargado.

> Campos entre `[colchetes]` ficam por preencher pelo responsável pelo tratamento.

## Parte 1 · Registo de atividades

**Responsável pelo tratamento:** `[nome legal]`, `[morada]`, NIF `[NIF]`  
**Contacto:** `[email]`  
**Última atualização:** `9 de agosto de 2026`

### A · Contas e perfis

| Campo | Informação |
|---|---|
| Finalidade | Criar conta, autenticar e apresentar o perfil |
| Titulares | Utilizadores registados, segundo a política de idade do produto |
| Dados | Nome, nome de utilizador, email, data de nascimento, bio, avatar, interesses, configuração público/privado, datas de conta/termos |
| Fundamento | `[validar juridicamente]` |
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
| Fundamento | `[validar juridicamente]` |
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
- [ ] Preencher identidade/contactos do responsável.
- [ ] Confirmar bases jurídicas, prazos de retenção e contratos/subcontratantes.
- [ ] Confirmar regiões de alojamento e mecanismos de transferências internacionais antes do lançamento público.

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

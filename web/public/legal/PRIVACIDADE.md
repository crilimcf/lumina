# Política de Privacidade da Lumina

**Versão:** 15 de agosto de 2026

## 1. Responsável pelo tratamento

**Responsável:** Carlos Fernandes

**Email:** carlos.fernandes@digibox.pt

**Morada:** Rua da Cabecinha N.º 23, 5300-802 Rebordainhos, Bragança, Portugal

**NIF:** 227369661

## 2. Dados tratados

Consoante as funcionalidades usadas, a Lumina pode tratar:

- identificador interno da conta;
- nome, nome de utilizador, email e data de nascimento;
- bio, avatar e interesses adicionados ao perfil;
- configuração de perfil público/privado;
- relações de follow, pedidos de follow e bloqueios;
- publicações, comentários, reações e reposts;
- Momentos e respetivas visualizações;
- Salas criadas/aderidas, convites e mensagens de Sala;
- mensagens privadas, estado de leitura/abertura e chamadas;
- fotografias e vídeos carregados;
- denúncias e decisões de moderação;
- dados técnicos de segurança, como sessões, user-agent, IP e tentativas de login;
- pedidos de recuperação de password, 2FA e códigos de recuperação em formato protegido;
- dados necessários a pagamentos quando uma funcionalidade paga estiver efetivamente ativada.

## 3. Para que usamos os dados

Os dados são tratados para:

- criar e proteger a conta;
- mostrar o Feed, perfis e ligações sociais;
- gerir perfis privados e pedidos de follow;
- permitir Salas, Chat, chamadas, Momentos e Radar;
- guardar e servir media;
- prevenir abuso, spam e acessos indevidos;
- moderar conteúdo denunciado;
- executar pedidos de exportação, correção e apagamento;
- operar, diagnosticar e melhorar o serviço.

Os fundamentos jurídicos aplicáveis são a execução dos Termos e do serviço solicitado, o cumprimento de obrigações legais, os interesses legítimos de segurança, prevenção de abuso e melhoria do serviço, e o consentimento quando este for especificamente solicitado. O consentimento pode ser retirado a qualquer momento, sem afetar o tratamento anteriormente realizado.

## 4. Visibilidade

- Um perfil público pode ser consultado por outras pessoas autenticadas na Lumina.
- Um perfil privado só expõe as suas publicações depois de um pedido de follow ser aceite.
- O Feed social mostra a própria pessoa e autores que ela segue.
- Salas públicas podem ser descobertas por pessoas Lumina; Salas privadas dependem de convite.
- Um bloqueio corta relações e visibilidade entre as duas contas.
- Momentos seguem a mesma relação social do Feed e expiram após 24 horas.

## 5. Mensagens e conteúdo efémero

Mensagens privadas e mensagens de Sala são armazenadas para fornecer o serviço.

Mensagens com temporizador ou de abertura única e Momentos são removidos do conteúdo ativo segundo as regras apresentadas no produto. A Lumina não consegue impedir que outra pessoa faça uma captura de ecrã, gravação ou cópia antes da expiração.

## 6. Sessão e armazenamento local

A sessão browser principal usa um cookie `HttpOnly`, `Secure`, `SameSite=Lax` e `Path=/`. O JavaScript da aplicação não lê esse cookie.

O valor CSRF necessário para pedidos que alteram estado é devolvido pela API e mantido em memória pela aplicação. O PWA pode também usar armazenamento local do browser para preferências técnicas não sensíveis.

## 7. Fornecedores

A arquitetura atual pode envolver:

- **Railway** — API;
- **PostgreSQL** — base de dados;
- **Vercel** — aplicação web;
- **Cloudflare R2 / serviço S3-compatível** — fotografias e vídeos;
- **Resend** — emails transacionais;
- **Stripe** — apenas quando funcionalidades pagas forem ativadas.

A Lumina aplica aos fornecedores as garantias contratuais e os mecanismos de transferência exigidos pelo RGPD, incluindo decisões de adequação ou cláusulas contratuais-tipo quando aplicáveis.

## 8. Retenção

- Momentos expiram após 24 horas.
- Mensagens temporárias são limpas depois de abertas/expirarem conforme o modo escolhido.
- Tokens de recuperação expirados e tentativas antigas de login são limpos periodicamente.
- Pedidos de apagamento de conta têm uma janela de 30 dias antes da execução, salvo obrigações legais em contrário.
- Uploads abandonados/órfãos são limpos por jobs da API.

## 9. Direitos

A aplicação contém mecanismos técnicos para:

- corrigir dados de perfil;
- exportar dados da conta;
- pedir apagamento;
- cancelar o pedido durante a janela prevista;
- gerir privacidade, follows, bloqueios e sessões.

Os pedidos de acesso, retificação, apagamento, limitação, oposição e portabilidade podem ser enviados para o email indicado na secção 1 e são tratados nos prazos legais. Quando o tratamento depender de consentimento, este pode ser retirado a qualquer momento. Também é possível apresentar reclamação à Comissão Nacional de Proteção de Dados (CNPD).

A Lumina não utiliza decisões exclusivamente automatizadas que produzam efeitos jurídicos ou outros efeitos igualmente significativos sobre a pessoa.

## 10. Segurança

A Lumina aplica medidas técnicas como hashing de passwords, sessões revogáveis, 2FA opcional, proteção CSRF, rate limiting, validação de uploads, Content-Security-Policy e controlo de acesso no servidor.

Nenhum sistema é invulnerável; incidentes relevantes devem ser avaliados e tratados de acordo com as obrigações legais aplicáveis.

## 11. Alterações

Esta Política pode ser atualizada quando o produto, os fornecedores ou os requisitos legais mudarem. Alterações relevantes devem ser comunicadas de forma adequada.

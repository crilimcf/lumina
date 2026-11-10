# Política de Privacidade da Lumina

**Versão:** 10 de novembro de 2026

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
- localização precisa ou aproximada, apenas quando ativas uma funcionalidade local;
- token de notificações, plataforma, identificador técnico do dispositivo, modelo e versão do sistema;
- denúncias e decisões de moderação;
- dados técnicos de segurança, como sessões, user-agent, IP e tentativas de login;
- pedidos de recuperação de password, 2FA e códigos de recuperação em formato protegido;
- no Lumina Creators: nomes e preços dos planos, periodicidade, descrição, conteúdos de acesso reservado, estado de publicação e identificadores de participação;
- quando houver subscrições pagas: referências técnicas de cliente, subscrição, pagamentos, reembolsos e eventos do prestador de pagamentos; não guardamos números completos de cartões;
- pedidos e interações com funcionalidades de IA, quando estas forem utilizadas; evita incluir dados pessoais sensíveis nos pedidos.

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
- operar, diagnosticar e melhorar o serviço;
- guardar planos e conteúdos do Lumina Creators e, apenas quando ativadas, gerir subscrições, faturação, apoio e acesso a conteúdos pagos;
- processar pedidos enviados voluntariamente às funções de inteligência artificial, quando utilizadas.

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

Nas aplicações iOS e Android, o token de sessão é guardado no Keychain ou Keystore protegido do dispositivo. Face ID, impressão digital e código do dispositivo são validados pelo sistema operativo; a Lumina apenas recebe o resultado da validação e não recebe nem guarda dados biométricos.

## 7. Fornecedores

A arquitetura atual pode envolver:

- **Railway** — API;
- **PostgreSQL** — base de dados;
- **Vercel** — aplicação web;
- **Cloudflare R2 / serviço S3-compatível** — fotografias e vídeos;
- **Resend** — emails transacionais;
- **Apple Push Notification service (APNs)** e **Google Firebase Cloud Messaging (FCM)** — entrega de notificações móveis;
- **Amazon Web Services (Amazon IVS/S3)** — emissão e gravação de diretos, quando utilizados;
- **OpenAI** — processamento de pedidos de funcionalidades de IA, quando utilizadas;
- **Stripe** — processamento de pagamentos, gestão de assinaturas e pagamentos a criadores, apenas quando funcionalidades pagas forem ativadas. A Lumina não deve receber números completos dos cartões.

Os fornecedores podem tratar dados em diferentes jurisdições, consoante o serviço e a respetiva configuração. As transferências internacionais, quando existirem, devem ter uma base legal adequada (por exemplo, decisão de adequação ou cláusulas contratuais-tipo) e medidas complementares quando exigidas. Os contratos de subcontratação, as regiões efetivas de tratamento e os mecanismos de transferência estão sujeitos a verificação operacional periódica.

## 8. Retenção

- Momentos expiram após 24 horas.
- Mensagens temporárias são limpas depois de abertas/expirarem conforme o modo escolhido.
- Tokens de recuperação expirados e tentativas antigas de login são limpos periodicamente.
- Pedidos de apagamento de conta têm uma janela de 30 dias antes da execução, salvo obrigações legais em contrário.
- Uploads abandonados/órfãos são limpos por jobs da API.
- Planos e conteúdos Creators permanecem associados à conta enquanto forem necessários ao serviço ou até eliminação, sem prejuízo das obrigações aplicáveis.
- Quando existirem pagamentos, os registos financeiros estritamente necessários podem ser conservados pelo prazo legal aplicável, mesmo após encerramento da conta; as durações exatas dependem do tipo de documento e da legislação em vigor.

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

## 11. Lumina Creators e subscrições

O estúdio permite preparar planos e conteúdo reservado. Enquanto a cobrança estiver desativada, criar um plano **não** contrata uma subscrição nem desencadeia uma cobrança. Quando as subscrições forem lançadas, os interessados receberão informação sobre preço total, periodicidade, eventual renovação automática, cancelamento, fornecedor de pagamentos e políticas aplicáveis antes de confirmar uma compra.

Os acessos a conteúdos pagos deverão ser concedidos apenas após confirmação segura do pagamento e do estado da subscrição pelo prestador. A Lumina não publica dados bancários completos, nem os utiliza para classificar ou promover perfis no Feed.

## 12. IA, decisões e transparência

Se usares funcionalidades de IA, o conteúdo do pedido e informações estritamente necessárias ao processamento poderão ser enviados ao prestador técnico da função. Não são previstas decisões exclusivamente automatizadas que produzam efeitos jurídicos ou efeitos igualmente significativos sobre a pessoa. Esta informação não dispensa uma avaliação de impacto quando legalmente necessária.

## 13. Alterações

Esta Política pode ser atualizada quando o produto, os fornecedores ou os requisitos legais mudarem. Alterações relevantes devem ser comunicadas de forma adequada.

# Privacidade de loja e Data Safety

Este inventário descreve a versão `1.0.0`. Deve ser replicado nos formulários App Store Connect e Play Console e revisto sempre que uma integração mudar.

O manifesto iOS declara também `NSPrivacyAccessedAPICategoryFileTimestamp` com o motivo aprovado `C617.1`, exigido pelo plugin Capacitor Filesystem usado para preparar a exportação local da conta.

| Categoria | Recolhida | Ligada à conta | Obrigatória | Finalidade |
| --- | --- | --- | --- | --- |
| Nome | Sim | Sim | Sim | Conta e funcionalidade |
| Email | Sim | Sim | Sim | Conta, login e recuperação |
| Data de nascimento | Sim | Sim | Sim | Regra de idade mínima |
| Identificador de utilizador | Sim | Sim | Sim | Conta e segurança |
| Bio, interesses e conteúdo textual | Sim | Sim | Opcional | Perfil e conteúdo social |
| Fotografias e vídeos | Sim | Sim | Opcional | Perfil, Feed, Chat, Salas e Momentos |
| Mensagens privadas | Sim | Sim | Opcional | Chat e Salas |
| Localização precisa/aproximada | Sim, quando pedida | Não persistida como coordenadas no perfil | Opcional | Contexto local e seleção do país do Radar |
| Identificador técnico do dispositivo e token push | Sim | Sim | Opcional | Notificações e segurança |
| IP, user-agent, sessões e tentativas de login | Sim | Sim | Sim | Segurança, prevenção de abuso e operação |
| Diagnósticos da aplicação | Sim | Sim quando existe sessão | Opcional | Fiabilidade e suporte |
| Interações com o produto | Sim | Sim | Sim | Feed personalizado, estado de leitura e funcionalidade social |
| Denúncias e bloqueios | Sim | Sim | Opcional | Segurança e moderação |

## Respostas de alto nível

- Dados encriptados em trânsito: **Sim** (HTTPS/TLS; APNs/FCM para push).
- Dados partilhados para publicidade ou tracking entre empresas: **Não**.
- Tracking: **Não**; não existe IDFA/Advertising ID nem ATT.
- Publicidade de terceiros: **Não**.
- Venda de dados: **Não**.
- Eliminação de conta: **Sim**, dentro da app e através da página pública indicada na listagem.
- Janela de execução: **30 dias**, cancelável na própria conta.
- Biometria: processada exclusivamente pelo sistema operativo; a Lumina não recebe templates biométricos.
- Conteúdo efémero: removido do conteúdo ativo segundo o modo, sem prometer impedir capturas feitas por terceiros.
- Service providers, não partilha comercial: Railway/PostgreSQL, Vercel, Cloudflare R2, Resend, Apple APNs, Google FCM e OpenStreetMap/Nominatim para converter uma posição pedida pelo utilizador em país/cidade; Stripe apenas se uma funcionalidade paga for efetivamente ativada.
- Para o Radar por país, as coordenadas são usadas no dispositivo apenas durante a deteção/reverse-geocoding e **não são persistidas pela Lumina no perfil nem enviadas à API Lumina**; o cache local guarda apenas país, cidade/região e momento da deteção.

## Permissões e disclosure

| Permissão | Momento do pedido | Texto funcional |
| --- | --- | --- |
| Notificações | Depois de contexto no Chat/Alertas | Mensagens, chamadas e atividade da conta |
| Câmara | Ao criar conteúdo, direto ou videochamada | Captar fotos/vídeos e transmitir vídeo escolhido |
| Microfone | Ao iniciar chamada, direto ou gravação | Transmitir áudio escolhido |
| Fotos/vídeos | Ao tocar em adicionar media | Escolher conteúdo para publicar/enviar |
| Localização | Ao abrir/atualizar uma experiência local como o Radar | Mostrar o país/cidade atual e conteúdo local; não é pedida no arranque |
| Face ID/biometria | Ao ativar desbloqueio protegido | Validar localmente o acesso à sessão guardada |

# Checklist de release móvel

## Gates automáticos

- [ ] API tests, incluindo handoff PKCE e push nativo
- [ ] Web build e Mobile Safari WebKit
- [ ] Android lint + unit tests + debug APK + release AAB
- [ ] iOS simulator build, iPhone e iPad
- [ ] Artifact `lumina-store-screenshots-*` revisto em iPhone 6,7″ e Android phone
- [ ] Sem segredos, keystores, perfis ou `google-services.json` no Git
- [ ] `X-Lumina-Schema: 31` depois do deploy da API

## QA funcional

- [ ] Criar conta, login por password e passkey, 2FA e recuperação
- [ ] Fechar/reabrir app, sessão no Keychain/Keystore e biometria opcional
- [ ] Feed: criar, editar, apagar, foto, vídeo, reações e comentários
- [ ] Perfil público/privado, follow request, bloquear, denunciar e moderar
- [ ] Momentos e media efémero
- [ ] Chat, recibos, foto/vídeo, áudio/vídeo chamada e notificação de chamada
- [ ] Salas públicas/privadas, convite, media e mensagens
- [ ] Alertas, badge, APNs/FCM em foreground/background e toque no deep link
- [ ] Radar e abertura segura de fontes externas
- [ ] Lumina One: Lumes, Cápsulas, Together e localização por consentimento
- [ ] Exportar dados, pedir/cancelar eliminação, privacidade e termos
- [ ] Logout remove token push e sessão local
- [ ] Offline/rede lenta, teclado, safe areas, rotação, dark mode e acessibilidade

## Conta Apple — ação externa obrigatória

- [ ] Registar `pt.digibox.lumina` no Apple Developer e ativar Push + Associated Domains
- [ ] Criar registo App Store Connect, aceitar contratos e concluir DSA/trader status
- [ ] Criar chave APNs `.p8` e chave App Store Connect API
- [ ] Configurar segredos GitHub: `APPLE_API_KEY_ID`, `APPLE_API_ISSUER_ID`, `APPLE_API_PRIVATE_KEY_BASE64`, `APPLE_TEAM_ID`
- [ ] Publicar AASA com `<APPLE_TEAM_ID>.pt.digibox.lumina`
- [ ] Preencher App Privacy, age rating, review contact e conta de demonstração

## Conta Google — ação externa obrigatória

- [ ] Criar app Play Console `pt.digibox.lumina`, aceitar contratos e verificar identidade/trader status
- [ ] Criar projeto Firebase, registar Android e descarregar `google-services.json`
- [ ] Criar service account FCM HTTP v1 e configurar as variáveis Railway
- [ ] Criar upload key/Play App Signing e configurar os segredos Android no GitHub
- [ ] Dar à service account de publicação acesso à app no Play Console e ativar a Google Play Developer API
- [ ] Publicar `assetlinks.json` com o SHA-256 do certificado de produção
- [ ] Preencher Data Safety, content rating, target audience e account deletion URL

## Segredos de release Android

- `FIREBASE_GOOGLE_SERVICES_JSON_BASE64`
- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64`

## Variáveis privadas da API

- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
- `APNS_TEAM_ID`, `APNS_KEY_ID`, `APNS_PRIVATE_KEY`
- `APNS_BUNDLE_ID=pt.digibox.lumina`, `APNS_PRODUCTION=true`

O workflow manual `.github/workflows/mobile-release.yml` produz o AAB assinado, publica-o na faixa interna do Google Play e envia o arquivo iOS para TestFlight. Falha de propósito se qualquer credencial externa obrigatória estiver em falta.

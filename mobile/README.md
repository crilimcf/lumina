# Lumina Mobile

As aplicações iOS e Android usam Capacitor 8 sobre a interface Lumina existente. O Web/PWA continua independente e sem redirecionamentos para o bundle nativo.

## Identidade

- Nome: `Lumina`
- Bundle ID / application ID: `pt.digibox.lumina`
- Versão inicial: `1.0.0` (`1`)
- iOS mínimo: 15
- Android mínimo: API 24
- Android target/compile: API 36
- Deep link: `lumina://`
- Domínio associado: `https://lumina-snowy-ten.vercel.app`

## Desenvolvimento

```bash
cd web
npm ci
npm run native:sync
npx cap open android
npx cap open ios
```

O build nativo usa `https://api-production-f9e9.up.railway.app`. Para outro ambiente:

```bash
VITE_NATIVE_API_URL=https://api.example.test npm run native:sync
```

## Integrações nativas

- sessão JWT no Keychain/Android Keystore, com desbloqueio biométrico opcional;
- login por passkey através de handoff PKCE de utilização única no browser seguro;
- APNs e Firebase Cloud Messaging, com tokens por dispositivo;
- câmara, microfone, galeria, localização, partilha e exportação de ficheiros;
- lifecycle, rede, botão voltar Android, haptics, splash, status bar e safe areas;
- deep links para notificações, autenticação, Feed, Chat, Radar, Lumina One e diretos;
- proteção do snapshot da aplicação no app switcher;
- SSE substituído por polling no runtime nativo, evitando ligações WebView frágeis.

Os ficheiros `google-services.json`, chaves APNs, keystores e credenciais de loja nunca entram no Git. A CI normal produz APK/AAB não publicados e valida o simulador iOS; o workflow manual `Mobile store release` assina e publica o AAB na faixa interna do Google Play e envia o arquivo iOS para TestFlight quando os segredos externos estiverem configurados.

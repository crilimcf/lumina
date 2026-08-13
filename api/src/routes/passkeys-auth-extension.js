import { authRoutes } from './auth.js';
import { passkeyRoutes } from './passkeys.js';

// auth.js já importa o módulo TOTP. A extensão é ligada no microtask seguinte
// para evitar aceder ao binding authRoutes durante a avaliação circular dos ESM.
queueMicrotask(() => {
  authRoutes.use('/passkeys', passkeyRoutes);
});

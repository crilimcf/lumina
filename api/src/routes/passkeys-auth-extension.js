queueMicrotask(async () => {
  const [{ authRoutes }, { passkeyRoutes }] = await Promise.all([
    import('./auth.js'),
    import('./passkeys.js'),
  ]);
  authRoutes.use('/passkeys', passkeyRoutes);
});

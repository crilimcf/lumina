queueMicrotask(async () => {
  const [{ notificationRoutes }, { nativePushRoutes }] = await Promise.all([
    import('./notifications.js'),
    import('./native-push.js'),
  ]);
  notificationRoutes.use('/native', nativePushRoutes);

  if (process.env.NODE_ENV !== 'test') {
    const { startNativePushWorker } = await import('../jobs/native-push.js');
    startNativePushWorker();
  }
});

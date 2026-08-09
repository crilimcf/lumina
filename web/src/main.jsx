import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { ErrorBoundary } from './ui.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary><App /></ErrorBoundary>
  </React.StrictMode>
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const hadControllerAtStart = !!navigator.serviceWorker.controller;
    let refreshing = false;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // Na primeira instalação não há versão antiga para substituir; evitamos
      // um reload desnecessário. Nas atualizações seguintes, recarregamos uma
      // única vez assim que o novo worker assume controlo.
      if (!hadControllerAtStart || refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
      .then((registration) => {
        const checkForUpdate = () => registration.update().catch(() => {});

        // iOS pode restaurar uma PWA instalada da memória/BFCache sem fazer
        // uma navegação completa. Verificamos ao regressar ao primeiro plano,
        // ao recuperar a página e ao receber foco.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') checkForUpdate();
        });
        window.addEventListener('pageshow', checkForUpdate);
        window.addEventListener('focus', checkForUpdate);
        checkForUpdate();
      })
      .catch(() => {});
  });
}

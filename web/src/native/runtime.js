import { App as CapacitorApp } from '@capacitor/app';
import { Network } from '@capacitor/network';
import { PrivacyScreen } from '@capacitor/privacy-screen';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { initializeNativeSession, installNativeFetchBridge, isNativeApp, nativePlatform, toNativeNavigationUrl } from './session.js';
import { installNativeGeolocationBridge } from './geolocation.js';
import { initializeNativePush } from './push.js';

let pendingNavigation = null;

const dispatchNavigation = (url) => {
  pendingNavigation = toNativeNavigationUrl(url);
  window.dispatchEvent(new CustomEvent('lumina:native-navigation', { detail:{ url:pendingNavigation } }));
};

export const takePendingNativeNavigation = () => {
  const value = pendingNavigation;
  pendingNavigation = null;
  return value;
};

export async function initializeNativeRuntime() {
  if (!isNativeApp) return;
  document.documentElement.classList.add('lumina-native', `lumina-native-${nativePlatform}`);
  installNativeFetchBridge();
  installNativeGeolocationBridge();
  await initializeNativeSession();

  // Only secure session restoration is startup-critical. Native presentation,
  // push and OS event listeners are optional and may be slow on older devices.
  // Keeping them outside the render-critical path avoids a blank screen if a
  // plugin hangs or the OS delays a permission/initialization handshake.
  const backgroundTasks = [
    StatusBar.setStyle({ style:Style.Light }),
    StatusBar.setOverlaysWebView({ overlay:true }),
    PrivacyScreen.enable({
      android:{ dimBackground:true, preventScreenshots:false, privacyModeOnActivityHidden:'dim' },
      ios:{ blurEffect:'dark' },
    }),
    initializeNativePush(),
    // Dispatching the deep link also persists it for App when it has not
    // mounted yet, so the initial OS launch isn't lost in the background.
    CapacitorApp.getLaunchUrl().then(launch => {
      if (launch?.url) dispatchNavigation(launch.url);
    }),
    CapacitorApp.addListener('appUrlOpen', ({ url }) => dispatchNavigation(url)),
    CapacitorApp.addListener('backButton', () => {
      window.dispatchEvent(new CustomEvent('lumina:native-back'));
    }),
    CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      document.dispatchEvent(new Event('visibilitychange'));
      if (isActive) window.dispatchEvent(new Event('focus'));
    }),
    Network.addListener('networkStatusChange', status => {
      window.dispatchEvent(new CustomEvent(status.connected ? 'online' : 'offline'));
    }),
  ];
  void Promise.allSettled(backgroundTasks).then(results => {
    for (const result of results) {
      if (result.status === 'rejected') {
        console.debug('[native] inicialização opcional:', result.reason?.message || result.reason);
      }
    }
  });
  window.__luminaNativeHaptic = () => Haptics.impact({ style:ImpactStyle.Light }).catch(() => {});
}

export async function revealNativeApp() {
  if (!isNativeApp) return;
  await SplashScreen.hide({ fadeOutDuration:250 }).catch(() => {});
}

export async function exitNativeApp() {
  if (!isNativeApp) return;
  await CapacitorApp.exitApp();
}

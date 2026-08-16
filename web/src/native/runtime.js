import { App as CapacitorApp } from '@capacitor/app';
import { Network } from '@capacitor/network';
import { PrivacyScreen } from '@capacitor/privacy-screen';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { initializeNativeSession, installNativeFetchBridge, isNativeApp, toNativeNavigationUrl } from './session.js';
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
  document.documentElement.classList.add('lumina-native');
  installNativeFetchBridge();
  installNativeGeolocationBridge();
  await initializeNativeSession();

  await Promise.allSettled([
    StatusBar.setStyle({ style:Style.Light }),
    StatusBar.setOverlaysWebView({ overlay:true }),
    PrivacyScreen.enable({
      android:{ dimBackground:true, preventScreenshots:false, privacyModeOnActivityHidden:'dim' },
      ios:{ blurEffect:'dark' },
    }),
    initializeNativePush(),
  ]);

  const launch = await CapacitorApp.getLaunchUrl().catch(() => null);
  if (launch?.url) pendingNavigation = toNativeNavigationUrl(launch.url);
  await CapacitorApp.addListener('appUrlOpen', ({ url }) => dispatchNavigation(url));
  await CapacitorApp.addListener('backButton', () => {
    window.dispatchEvent(new CustomEvent('lumina:native-back'));
  });
  await CapacitorApp.addListener('appStateChange', ({ isActive }) => {
    document.dispatchEvent(new Event('visibilitychange'));
    if (isActive) window.dispatchEvent(new Event('focus'));
  });
  await Network.addListener('networkStatusChange', status => {
    window.dispatchEvent(new CustomEvent(status.connected ? 'online' : 'offline'));
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

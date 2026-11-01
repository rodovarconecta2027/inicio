import { useCallback, useEffect, useRef, useState } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms?: string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

declare global {
  interface Window {
    __rodovarDeferredPrompt?: BeforeInstallPromptEvent | null;
    __rodovarAppInstalled?: boolean;
  }
}

const POSTPONE_SESSION_KEY = 'rodovar_pwa_install_postponed_session_v1';
const POSTPONE_UNTIL_KEY = 'rodovar_pwa_install_postponed_until_v1';

export type PWAInstallOutcome = 'idle' | 'prompting' | 'accepted' | 'dismissed';

export function detectStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const isDisplayStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: window-controls-overlay)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches;
    const isNavigatorStandalone =
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    const isTwaReferrer =
      typeof document !== 'undefined' && document.referrer.includes('android-app://');
    return Boolean(isDisplayStandalone || isNavigatorStandalone || isTwaReferrer);
  } catch {
    return false;
  }
}

export function detectIOSDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isClassicIOS = /iPad|iPhone|iPod/i.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
  const isIPadOS =
    navigator.platform === 'MacIntel' && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1;
  return Boolean(isClassicIOS || isIPadOS);
}

export function detectAndroidDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent || '');
}

export function detectInAppBrowser(): { isInApp: boolean; appName: string | null } {
  if (typeof navigator === 'undefined') return { isInApp: false, appName: null };
  const ua = navigator.userAgent || '';
  if (/WhatsApp/i.test(ua)) return { isInApp: true, appName: 'WhatsApp' };
  if (/Instagram/i.test(ua)) return { isInApp: true, appName: 'Instagram' };
  if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) return { isInApp: true, appName: 'Facebook' };
  if (/LinkedInApp/i.test(ua)) return { isInApp: true, appName: 'LinkedIn' };
  if (/Messenger/i.test(ua)) return { isInApp: true, appName: 'Messenger' };
  if (/BytedanceWebview|TikTok/i.test(ua)) return { isInApp: true, appName: 'TikTok' };
  if (/Telegram/i.test(ua)) return { isInApp: true, appName: 'Telegram' };
  return { isInApp: false, appName: null };
}

export function detectSafariOnIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (!detectIOSDevice()) return false;
  const ua = navigator.userAgent || '';
  const isSafariEngine = /Safari/i.test(ua);
  const isOtherIOSBrowser = /CriOS|FxiOS|OPiOS|EdgiOS|DuckDuckGo/i.test(ua);
  const { isInApp } = detectInAppBrowser();
  return isSafariEngine && !isOtherIOSBrowser && !isInApp;
}

export function detectInIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() => {
    if (typeof window !== 'undefined' && window.__rodovarDeferredPrompt) {
      return window.__rodovarDeferredPrompt;
    }
    return null;
  });

  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.__rodovarAppInstalled) return true;
    return detectStandaloneMode();
  });

  const [isIOS, setIsIOS] = useState<boolean>(() => detectIOSDevice());
  const [isAndroid, setIsAndroid] = useState<boolean>(() => detectAndroidDevice());
  const [isSafariIOS, setIsSafariIOS] = useState<boolean>(() => detectSafariOnIOS());
  const [inAppInfo, setInAppInfo] = useState<{ isInApp: boolean; appName: string | null }>(() =>
    detectInAppBrowser()
  );
  const [isInIframe, setIsInIframe] = useState<boolean>(() => detectInIframe());
  const [installOutcome, setInstallOutcome] = useState<PWAInstallOutcome>('idle');
  const [isPostponed, setIsPostponed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      if (sessionStorage.getItem(POSTPONE_SESSION_KEY) === '1') return true;
      const untilRaw = localStorage.getItem(POSTPONE_UNTIL_KEY);
      if (untilRaw && Number(untilRaw) > Date.now()) return true;
    } catch {
      // ignore storage errors
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncEnvironment = () => {
      const standalone = detectStandaloneMode() || Boolean(window.__rodovarAppInstalled);
      setIsInstalled(standalone);
      setIsIOS(detectIOSDevice());
      setIsAndroid(detectAndroidDevice());
      setIsSafariIOS(detectSafariOnIOS());
      setInAppInfo(detectInAppBrowser());
      setIsInIframe(detectInIframe());
      if (window.__rodovarDeferredPrompt && !standalone) {
        setDeferredPrompt(window.__rodovarDeferredPrompt);
      }
    };

    syncEnvironment();

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      if (detectIOSDevice()) return;
      const promptEvt = e as BeforeInstallPromptEvent;
      window.__rodovarDeferredPrompt = promptEvt;
      setDeferredPrompt(promptEvt);
      setInstallOutcome('idle');
    };

    const handleCustomDeferredPrompt = (e: Event) => {
      if (detectIOSDevice()) return;
      const customEvt = e as CustomEvent<BeforeInstallPromptEvent>;
      const promptEvt = customEvt.detail || window.__rodovarDeferredPrompt;
      if (promptEvt) {
        setDeferredPrompt(promptEvt);
        setInstallOutcome('idle');
      }
    };

    const handleAppInstalled = () => {
      window.__rodovarDeferredPrompt = null;
      window.__rodovarAppInstalled = true;
      setDeferredPrompt(null);
      setIsInstalled(true);
      setInstallOutcome('accepted');
    };

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = (evt: MediaQueryListEvent) => {
      if (evt.matches) {
        setIsInstalled(true);
        setDeferredPrompt(null);
        window.__rodovarDeferredPrompt = null;
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('rodovar:beforeinstallprompt', handleCustomDeferredPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('rodovar:appinstalled', handleAppInstalled);
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleDisplayModeChange);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('rodovar:beforeinstallprompt', handleCustomDeferredPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('rodovar:appinstalled', handleAppInstalled);
      if (typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', handleDisplayModeChange);
      }
    };
  }, []);

  const install = useCallback(async (): Promise<boolean> => {
    // Requirement 2 & 3: Never call beforeinstallprompt on iOS or when unavailable; consume once and clear
    const activePrompt = deferredPrompt || (typeof window !== 'undefined' ? window.__rodovarDeferredPrompt : null);
    if (!activePrompt || isIOS || isInstalled) {
      return false;
    }

    // Clear reference immediately after invoking so we never attempt to reuse a consumed event
    setDeferredPrompt(null);
    if (typeof window !== 'undefined') {
      window.__rodovarDeferredPrompt = null;
    }
    setInstallOutcome('prompting');

    try {
      await activePrompt.prompt();
      const choiceResult = await activePrompt.userChoice;
      if (choiceResult && choiceResult.outcome === 'accepted') {
        setInstallOutcome('prompting');
        // Wait for appinstalled rather than claiming success on acceptance.
        if (typeof window !== 'undefined') {
          // Keep waiting for the browser appinstalled event.
        }
        return true;
      } else {
        // User cancelled/dismissed: do NOT show success
        setInstallOutcome('dismissed');
        return false;
      }
    } catch {
      setInstallOutcome('dismissed');
      return false;
    }
  }, [deferredPrompt, isIOS, isInstalled]);

  const postponeInstall = useCallback(() => {
    setIsPostponed(true);
    try {
      sessionStorage.setItem(POSTPONE_SESSION_KEY, '1');
      // Snooze auto-prompts for 24h while keeping manual button available
      localStorage.setItem(POSTPONE_UNTIL_KEY, String(Date.now() + 24 * 60 * 60 * 1000));
    } catch {
      // ignore storage errors
    }
  }, []);

  const resetInstallOutcome = useCallback(() => {
    setInstallOutcome('idle');
  }, []);

  const canPromptInstall = Boolean(deferredPrompt) && !isIOS && !isInstalled;

  return {
    isInstallable: canPromptInstall,
    canPromptInstall,
    isInstalled,
    isIOS,
    isAndroid,
    isSafariIOS,
    isInAppBrowser: inAppInfo.isInApp,
    inAppBrowserName: inAppInfo.appName,
    isInIframe,
    installOutcome,
    isPostponed,
    install,
    installApp: install,
    postponeInstall,
    resetInstallOutcome,
  };
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

export function useServiceWorkerUpdate() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState<boolean>(false);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const isRefreshingRef = useRef<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    let registrationRef: ServiceWorkerRegistration | null = null;

    const attachWaitingListener = (reg: ServiceWorkerRegistration) => {
      if (reg.waiting && navigator.serviceWorker.controller) {
        setWaitingWorker(reg.waiting);
        setUpdateAvailable(true);
      }

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setWaitingWorker(newWorker);
            setUpdateAvailable(true);
          }
        });
      });
    };

    const registerSw = async () => {
      try {
        const existing = await navigator.serviceWorker.getRegistration('/');
        if (existing) {
          registrationRef = existing;
          attachWaitingListener(existing);
        } else {
          const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
          registrationRef = reg;
          attachWaitingListener(reg);
        }
      } catch (err) {
        console.debug('Service Worker registration info:', err);
      }
    };

    if (document.readyState === 'complete') {
      void registerSw();
    } else {
      window.addEventListener('load', () => void registerSw(), { once: true });
    }

    // Periodically check for a new version every 5 minutes when online
    const interval = window.setInterval(() => {
      if (registrationRef && navigator.onLine) {
        registrationRef.update().catch(() => {});
      }
    }, 5 * 60 * 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  const applyUpdate = useCallback(() => {
    if (!waitingWorker || typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      window.location.reload();
      return;
    }

    setIsUpdating(true);

    const handleControllerChange = () => {
      if (isRefreshingRef.current) return;
      isRefreshingRef.current = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });

    // Fallback reload if controllerchange does not fire within 1500ms
    window.setTimeout(() => {
      if (!isRefreshingRef.current) {
        isRefreshingRef.current = true;
        window.location.reload();
      }
    }, 1500);
  }, [waitingWorker]);

  const dismissUpdate = useCallback(() => {
    setUpdateAvailable(false);
  }, []);

  return {
    updateAvailable,
    isUpdating,
    applyUpdate,
    dismissUpdate,
  };
}

export async function clearSensitiveDataOnLogout(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem('rodovar_conecta_session_v1');
    sessionStorage.removeItem('rodovar_conecta_session_v1');
    sessionStorage.removeItem('rodovar_active_shared_draft_v1');
    sessionStorage.removeItem('rodovar_intended_section_v1');
  } catch {
    // ignore storage errors
  }

  try {
    if ('serviceWorker' in navigator) {
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_SENSITIVE_DATA' });
      }
      const reg = await navigator.serviceWorker.getRegistration('/');
      if (reg?.active) {
        reg.active.postMessage({ type: 'CLEAR_SENSITIVE_DATA' });
      }
    }
  } catch {
    // ignore SW message error
  }
}

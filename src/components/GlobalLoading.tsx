import { useLayoutEffect, useEffect, useSyncExternalStore } from 'react';
import { portalLoading } from '../lib/portalLoading';

/** One persistent view in index.html also covers the interval before React starts. */
export function GlobalLoading() {
  const loading = useSyncExternalStore(portalLoading.subscribe, portalLoading.getSnapshot, () => true);
  useLayoutEffect(() => {
    document.documentElement.dataset.portalLoading = String(loading);
    const root = document.getElementById('root');
    const overlay = document.getElementById('portal-loading');
    if (root) { root.inert = loading; root.setAttribute('aria-busy', String(loading)); }
    overlay?.setAttribute('aria-hidden', String(!loading));
  }, [loading]);
  return null;
}
/** Compatibility for page loaders: internal navigation never opens the global overlay.
 * Initial portal boot and validated login are the only global loading owners.
 * Existing page loading states and their inline indicators remain unchanged.
 */
export function useGlobalLoading(_active: boolean) {}
export function usePortalInitialized(ready: boolean) {
  useLayoutEffect(() => { if (ready) portalLoading.finishInitialization(); }, [ready]);
}


/** Release a successful-login task only after the prepared panel commits. */
export function useAuthenticatedPanelLoading(preparing: boolean, release: {current: (() => void) | null}) {
  useEffect(() => {
    if (!preparing) { release.current?.(); release.current = null; }
  }, [preparing, release]);
  useEffect(() => () => { release.current?.(); release.current = null; }, [release]);
}

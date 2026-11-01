export function createLoadingCoordinator(initial = false) {
  const tasks = new Set<symbol>();
  const listeners = new Set<() => void>();
  const boot = Symbol('initialization');
  if (initial) tasks.add(boot);
  const notify = () => listeners.forEach(listener => listener());
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => tasks.size > 0,
    begin() { const id = Symbol('content'); tasks.add(id); notify(); let released = false; return () => { if (!released) { released = true; tasks.delete(id); notify(); } }; },
    finishInitialization() { if (tasks.delete(boot)) notify(); },
  };
}
export const portalLoading = createLoadingCoordinator(true);

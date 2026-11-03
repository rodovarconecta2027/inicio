import { useEffect, useState } from 'react';
import { CLOUD_MODE } from '../lib/apiTransport';

export function RemoteApiStatus() {
  const [failed, setFailed] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!CLOUD_MODE) return;
    const update = (event: Event) => {
      const { resource, ok, status } = (event as CustomEvent).detail;
      if (![0, 404, 500, 501, 502, 503, 504].includes(status) && !ok) return;
      setFailed(previous => { const next = { ...previous }; if (ok) delete next[resource]; else next[resource] = status; return next; });
    };
    window.addEventListener('rodovar:api-status', update);
    return () => window.removeEventListener('rodovar:api-status', update);
  }, []);
  if (!CLOUD_MODE || !Object.keys(failed).length) return null;
  return <aside role="alert" className="mx-4 my-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-slate-900">
    <strong>Alguns serviços da homologação estão indisponíveis.</strong> Os dados desses serviços não foram carregados. Uma lista vazia não confirma ausência de registros.
    <details><summary className="cursor-pointer">Ver serviços afetados</summary><ul>{Object.entries(failed).map(([path, status]) => <li key={path}>{path.replace('/api/cloud/', '')} — {status ? `HTTP ${status}` : 'falha de conexão'}</li>)}</ul></details>
  </aside>;
}

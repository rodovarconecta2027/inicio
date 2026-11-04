import { useRef, useState } from 'react';
import { portalFetch } from '../lib/apiTransport';
import { getAuthHeaders } from '../lib/serverApi';

const labels: Record<string, string> = {
  freights: 'Fretes',
  freightDetails: 'Detalhes de fretes',
  events: 'Eventos',
  announcements: 'Comunicados',
  requests: 'Solicitações internas',
};

async function backupRequest(action: 'export' | 'validate', body?: object) {
  const response = await portalFetch('/api/admin/backups/operations/' + action, {
    method: 'POST', headers: getAuthHeaders(),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Não foi possível processar o backup operacional.');
  }
  return response;
}

export async function downloadOperationalBackup() {
  const response = await backupRequest('export');
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = 'rodovar-homologacao-operacoes-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function OperationalBackups() {
  const operation = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [verified, setVerified] = useState<{ totals: Record<string, number>; exportedAtIso: string } | null>(null);

  const run = async (action: () => Promise<void>) => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    setVerified(null);
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao processar o backup.'); }
    finally { operation.current = false; setBusy(false); }
  };

  const validate = (file: File) => run(async () => {
    if (file.size > 2 * 1024 * 1024) throw new Error('O arquivo ultrapassa o limite de 2 MB do backup operacional.');
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    const response = await backupRequest('validate', { sha256 });
    setVerified(await response.json());
  });

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 text-slate-900">
      <div>
        <h3 className="text-base font-bold">Backup operacional</h3>
        <p className="mt-1 text-sm text-slate-600">Cópia do Firestore com fretes e seus detalhes, agenda, comunicados e solicitações internas. Contas, conversas privadas, pagamentos e arquivos anexos ficam fora desta exportação.</p>
        <p className="mt-1 text-sm text-slate-600">O arquivo contém informações internas. Guarde-o em local restrito. A restauração operacional ainda está indisponível.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy} className="rounded-lg bg-yellow-400 px-4 py-2 text-sm font-bold disabled:opacity-50"
          onClick={() => void run(async () => { await downloadOperationalBackup(); setMessage('Backup operacional exportado.'); })}>
          Exportar dados operacionais (.JSON)
        </button>
        <label className="text-sm font-medium">
          Verificar arquivo exportado
          <input type="file" accept=".json,application/json" disabled={busy} className="ml-2 max-w-full text-sm"
            onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void validate(file);
            }} />
        </label>
      </div>
      {busy && <p role="status" className="text-sm">Processando backup…</p>}
      {message && <p role="status" className="text-sm text-emerald-800">{message}</p>}
      {verified && <div role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
        <p>Arquivo íntegro. Exportado em {new Date(verified.exportedAtIso).toLocaleString('pt-BR')}.</p>
        <p className="mt-1">{Object.entries(verified.totals).map(([key, count]) => (labels[key] || key) + ': ' + count).join(' · ')}</p>
      </div>}
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    </section>
  );
}

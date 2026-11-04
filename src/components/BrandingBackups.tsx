import { useRef, useState } from 'react';
import type { SystemConfig } from '../types';
import { portalFetch } from '../lib/apiTransport';
import { getAuthHeaders } from '../lib/serverApi';

type Backup = { format: string; schemaVersion: number; config: SystemConfig };
type ValidatedBackup = { backup: Backup; config: SystemConfig; currentRevision: number };

async function request<T>(action: 'export' | 'validate' | 'restore', body?: object): Promise<T> {
  const response = await portalFetch('/api/admin/backups/branding/' + action, {
    method: 'POST',
    headers: getAuthHeaders(),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Não foi possível acessar os backups da homologação.');
  return data as T;
}

export async function downloadBrandingBackup() {
  const backup = await request<Backup>('export');
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'rodovar-homologacao-identidade-r' + backup.config.revision + '.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return backup.config.revision;
}

export function BrandingBackups({ onRestore }: { onRestore?: (config: SystemConfig) => void }) {
  const [preview, setPreview] = useState<ValidatedBackup | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const operation = useRef(false);
  const run = async (action: () => Promise<void>) => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao processar o backup.'); }
    finally { setBusy(false); operation.current = false; }
  };
  const validate = (file: File) => run(async () => {
    setPreview(null);
    if (file.size > 80 * 1024) throw new Error('O backup de identidade visual deve ter até 80 KB.');
    let backup: Backup;
    try { backup = JSON.parse(await file.text()); }
    catch { throw new Error('O arquivo não contém JSON válido.'); }
    const result = await request<Omit<ValidatedBackup, 'backup'>>('validate', { backup });
    setPreview({ backup, ...result });
  });
  const restore = () => {
    if (!preview || preview.config.revision === preview.currentRevision) return;
    if (!window.confirm('Restaurar a identidade visual da revisão ' + preview.config.revision + ' como uma nova revisão?')) return;
    void run(async () => {
      setPreview(null);
      const result = await request<{ config: SystemConfig }>('restore', {
        backup: preview.backup, baseRevision: preview.currentRevision, confirm: true,
      });
      onRestore?.(result.config);
      setMessage('Identidade visual restaurada na revisão ' + result.config.revision + '.');
    });
  };
  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 text-slate-900">
      <div>
        <h3 className="text-base font-bold">Backup da identidade visual</h3>
        <p className="mt-1 text-sm text-slate-600">Exporte a revisão ativa do Firestore ou valide um backup desta homologação antes de restaurar. O arquivo contém apenas as configurações de imagens e carrossel.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy} onClick={() => void run(async () => {
          const revision = await downloadBrandingBackup();
          setMessage('Backup da revisão ' + revision + ' exportado.');
        })} className="rounded-lg bg-yellow-400 px-4 py-2 text-sm font-bold disabled:opacity-50">
          Exportar backup (.JSON)
        </button>
        <label className="text-sm font-medium">
          Selecionar backup para validar
          <input type="file" accept=".json,application/json" disabled={busy} className="ml-2 max-w-full text-sm"
            onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void validate(file);
            }} />
        </label>
      </div>
      {preview && <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
        <p><strong>Revisão do arquivo:</strong> {preview.config.revision} · <strong>Revisão ativa:</strong> {preview.currentRevision}</p>
        <p>{preview.config.welcomeBanner.items.length} imagem(ns) no banner · Intervalo de {preview.config.welcomeBanner.intervalSeconds} s</p>
        <img src={preview.config.topHeader.imageUrl} alt="Prévia do cabeçalho do backup" className="max-h-24 w-full rounded-md object-cover" />
        {preview.config.revision === preview.currentRevision
          ? <p>Esta revisão já está ativa.</p>
          : <button type="button" disabled={busy} onClick={restore} className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white disabled:opacity-50">Restaurar identidade visual</button>}
      </div>}
      {busy && <p role="status" className="text-sm">Processando backup…</p>}
      {message && <p role="status" className="text-sm text-emerald-800">{message}</p>}
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    </section>
  );
}

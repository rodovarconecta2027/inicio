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

async function backupRequest(action: 'export' | 'validate' | 'preview' | 'restore', body?: object) {
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
  const [restorePlan, setRestorePlan] = useState<{planHash:string;missing:Record<string,number>;conflicts:Record<string,number>;canRestore:boolean;total:number} | null>(null);
  const [serialized, setSerialized] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [legacyDocuments,setLegacyDocuments] = useState<{id:string;name:string;url:string;size:number}[]>([]);

  const run = async (action: () => Promise<void>) => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao processar o backup.'); }
    finally { operation.current = false; setBusy(false); }
  };

  const validate = (file: File) => run(async () => {
    setVerified(null);setRestorePlan(null);setSerialized('');setConfirmed(false);
    if (file.size > 2 * 1024 * 1024) throw new Error('O arquivo ultrapassa o limite de 2 MB do backup operacional.');
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    const response = await backupRequest('validate', { sha256 });
    setVerified(await response.json());
    const text = await file.text();
    const preview = await backupRequest('preview',{serialized:text});
    setRestorePlan(await preview.json());setSerialized(text);
  });

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 text-slate-900">
      <div>
        <h3 className="text-base font-bold">Backup operacional</h3>
        <p className="mt-1 text-sm text-slate-600">Cópia do Firestore com fretes e seus detalhes, agenda, comunicados e solicitações internas. Contas, conversas privadas, pagamentos e arquivos anexos ficam fora desta exportação.</p>
        <p className="mt-1 text-sm text-slate-600">A restauração recupera somente registros ausentes. Registros atuais, pagamentos e conflitos são preservados. O arquivo contém informações internas; guarde-o em local restrito.</p>
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
      {restorePlan && <div className="space-y-3 rounded-lg border border-slate-200 p-4 text-sm">
        <h4 className="font-bold">Prévia da restauração</h4>
        <p>Ausentes: {Object.entries(restorePlan.missing).map(([key,count])=>(labels[key]||key)+': '+count).join(' · ')}</p>
        <p>Conflitos que serão preservados: {Object.values(restorePlan.conflicts).reduce((sum,count)=>sum+count,0)}.</p>
        {restorePlan.total>440 && <p role="alert">Este arquivo excede o limite de 440 registros ausentes por restauração. Nenhum registro foi alterado.</p>}
        {restorePlan.canRestore ? <>
          <label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)} disabled={busy}/><span>Conferi a prévia e quero recuperar somente os registros ausentes.</span></label>
          <button type="button" disabled={busy||!confirmed} className="rounded-lg bg-yellow-400 px-4 py-2 font-bold disabled:opacity-50" onClick={()=>void run(async()=>{
            const response=await backupRequest('restore',{serialized,planHash:restorePlan.planHash,confirmation:'RESTORE_MISSING_RECORDS'});
            const result=await response.json();
            setMessage('Restauração concluída: '+Object.values(result.restored as Record<string,number>).reduce((sum,count)=>sum+count,0)+' registros recuperados. Conflitos preservados.');
            setRestorePlan(null);setSerialized('');setConfirmed(false);
          })}>Restaurar registros ausentes</button>
        </> : restorePlan.total===0 ? <p>Não há registros ausentes para restaurar.</p> : null}
      </div>}
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      <div className="space-y-3 border-t border-slate-200 pt-4">
        <h4 className="font-bold">Acervo legado protegido</h4>
        <p className="text-sm text-slate-600">PDFs originais preservados. O administrador pode consultar o acervo; documentos vinculados a comunicados ou eventos seguem as permissões desses módulos.</p>
        <button type="button" disabled={busy} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50" onClick={()=>void run(async()=>{
          const response=await portalFetch('/api/legacy-documents',{headers:getAuthHeaders()});
          if(!response.ok)throw Error('Não foi possível consultar o acervo.');
          setLegacyDocuments((await response.json()).documents);
        })}>Consultar PDFs preservados</button>
        {legacyDocuments.map(file=><div key={file.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3">
          <span className="min-w-0 break-all text-sm">{file.name}</span>
          <button type="button" disabled={busy} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50" onClick={()=>void run(async()=>{
            const response=await portalFetch(file.url,{headers:getAuthHeaders()});
            if(!response.ok)throw Error('Documento indisponível ou não autorizado.');
            const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download=file.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
          })}>Baixar PDF</button>
        </div>)}
      </div>
    </section>
  );
}

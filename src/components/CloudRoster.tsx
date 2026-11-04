import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { AccessProfile } from '../lib/accessPolicy';
import { getAuthHeaders } from '../lib/serverApi';

type Slot = {
  slot: string; name: string; profile: AccessProfile; actualProfile?: AccessProfile; uid?: string; login?: string;
  status: 'active' | 'inactive' | 'removed' | 'unlinked'; profileMatches: boolean; mustChangePassword: boolean;
};

const labels: Record<AccessProfile, string> = {
  RH: 'RH', DIRETORIA: 'Diretoria', MONITORAMENTO: 'Monitoramento',
  COMERCIAL: 'Comercial', EXPEDICAO: 'Expedição', FINANCEIRO: 'Financeiro',
};

const base = '/api/cloud/admin/roster';
const field = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900';
const button = 'rounded-lg border border-slate-300 bg-white px-3 py-2 font-semibold disabled:opacity-50';

async function rosterRequest(path: string, init?: RequestInit) {
  const response = await fetch(base + path, { credentials: 'include', headers: getAuthHeaders(), ...init });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Falha ao acessar os vínculos.');
  return data;
}

export function CloudRoster({ onChanged }: { onChanged: () => void }) {
  const [data, setData] = useState<{ roster: Slot[]; unlinkedActive: number }>();
  const [selection, setSelection] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState('');
  const [message, setMessage] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const selected = data?.roster.find(person => person.slot === selection);

  async function refresh(signal?: AbortSignal) {
    setLoading(true);
    setFailure('');
    try { setData(await rosterRequest('', { signal })); }
    catch (error) { if (!signal?.aborted) setFailure((error as Error).message); }
    finally { if (!signal?.aborted) setLoading(false); }
  }

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, []);

  async function save(path: string, method: string, body: object, success: string) {
    setPending(true);
    setFailure('');
    setMessage('');
    try {
      await rosterRequest(path, { method, body: JSON.stringify(body) });
      setMessage(success);
      setSelection('');
      onChanged();
      await refresh();
    } catch (error) { setFailure((error as Error).message); }
    finally { setPending(false); }
  }

  function link(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || pending) return;
    const form = new FormData(event.currentTarget);
    void save('', 'POST', {
      slot: selected.slot, uid: String(form.get('uid') || '').trim(),
      email: String(form.get('email') || '').trim(), login: String(form.get('login') || '').trim(),
      confirm: form.has('confirm'),
    }, 'Vínculo salvo no Firebase.');
  }

  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-800" aria-label="Vínculos do Firebase">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="text-base font-bold text-slate-950">Colaboradores autorizados</h3>
        <p>Vincule uma conta individual de teste já existente no Firebase de homologação.</p></div>
      <button type="button" className={button} disabled={loading || pending} onClick={() => void refresh()}>Atualizar lista</button>
    </div>
    {failure && <p role="alert" className="text-red-800">{failure}</p>}
    {message && <p role="status" className="text-emerald-800">{message}</p>}
    {loading && <p role="status">Conferindo vínculos…</p>}
    {data && <>
      <p>Administrador principal protegido · {data.roster.filter(person => person.status === 'active').length} de {data.roster.length} vínculos ativos no portal</p>
      {data.unlinkedActive > 0 && <p className="rounded-lg bg-amber-50 p-2 text-amber-950">{data.unlinkedActive} conta(s) ativa(s) sem vínculo conferido com esta lista.</p>}
      <form ref={formRef} onSubmit={link} className="space-y-3 rounded-xl bg-slate-50 p-3">
        <label className="grid gap-1 font-medium">Colaborador da lista
          <select className={field} value={selection} disabled={pending} onChange={event => setSelection(event.target.value)}>
            <option value="">Selecione para vincular por UID</option>
            {data.roster.filter(person => person.status === 'unlinked').map(person => <option key={person.slot} value={person.slot}>{person.name} · {labels[person.profile]}</option>)}
          </select>
        </label>
        {selected && <fieldset key={selected.slot} className="space-y-3" disabled={pending}>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="grid gap-1">UID do Firebase<input className={field} name="uid" required maxLength={128} /></label>
            <label className="grid gap-1">E-mail da conta de teste<input className={field} name="email" type="email" required maxLength={254} placeholder="conta@example.test" /></label>
            <label className="grid gap-1">Login individual<input className={field} name="login" required minLength={3} maxLength={80} /></label>
          </div>
          <label className="flex items-start gap-2"><input className="mt-1" type="checkbox" name="confirm" required /> Conferi o UID, o e-mail e o perfil indicado para este vínculo.</label>
          <button className={button + ' bg-yellow-300'} type="submit">{pending ? 'Salvando…' : 'Vincular conta existente'}</button>
        </fieldset>}
      </form>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[580px] text-left">
          <thead><tr className="border-b border-slate-200"><th className="p-2">Colaborador</th><th className="p-2">Perfil previsto</th><th className="p-2">Login</th><th className="p-2">Situação</th><th className="p-2">Ação</th></tr></thead>
          <tbody>{data.roster.map(person => <tr key={person.slot} className="border-b border-slate-100">
            <th scope="row" className="p-2 font-medium">{person.name}</th>
            <td className="p-2">{labels[person.profile]}{person.actualProfile && !person.profileMatches && <span className="block text-amber-900">Atual: {labels[person.actualProfile] || person.actualProfile}</span>}</td>
            <td className="p-2">{person.login || '—'}</td>
            <td className="p-2">{{ active: person.mustChangePassword ? 'Primeiro acesso pendente' : 'Ativo', inactive: 'Inativo', removed: 'Excluído', unlinked: 'Sem vínculo' }[person.status]}</td>
            <td className="p-2">{person.status === 'unlinked' ? <button type="button" className={button} disabled={pending} onClick={() => { setSelection(person.slot); formRef.current?.scrollIntoView({ block: 'nearest' }); formRef.current?.querySelector('select')?.focus({ preventScroll: true }); }}>Vincular</button>
              : !person.profileMatches && person.status !== 'removed' && <button type="button" className={button} disabled={pending} onClick={() => {
                if (window.confirm('Aplicar o perfil previsto e revogar as sessões da conta?')) void save('/' + person.slot + '/profile', 'PATCH', { confirm: true }, 'Perfil aplicado e sessões anteriores revogadas.');
              }}>Aplicar perfil previsto</button>}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </>}
  </section>;
}

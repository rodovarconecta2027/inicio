import { useState, type FormEvent } from 'react';
import { apiUpdateProfile } from '../lib/serverApi';

export function CloudPasswordForm() {
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState('');
  const [success, setSuccess] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const password = String(fields.get('password') || '');
    setFailure('');
    setSuccess(false);
    if (password !== fields.get('confirmation')) {
      setFailure('A confirmação precisa ser igual à nova senha.');
      return;
    }
    setPending(true);
    try {
      const result = await apiUpdateProfile({ password, currentPassword: String(fields.get('currentPassword') || '') });
      if (!result.ok) throw new Error(result.error || 'Não foi possível alterar a senha.');
      form.reset();
      setSuccess(true);
    } catch (error) { setFailure((error as Error).message); }
    finally { setPending(false); }
  }

  const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2';
  return <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
    <h2 className="text-base font-bold text-slate-950">Acesso e Segurança</h2>
    <p className="text-sm text-slate-700">Use de 12 a 128 caracteres. A troca encerra as sessões anteriores.</p>
    <fieldset disabled={pending} className="grid gap-3 text-sm text-slate-900">
      <label className="grid gap-1">Senha atual<input className={inputClass} name="currentPassword" type="password" autoComplete="current-password" maxLength={1024} required /></label>
      <label className="grid gap-1">Nova senha<input className={inputClass} name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
      <label className="grid gap-1">Confirmar nova senha<input className={inputClass} name="confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
      <button type="submit" className="justify-self-start rounded-lg bg-yellow-300 px-4 py-2 font-semibold disabled:opacity-50">{pending ? 'Alterando…' : 'Alterar senha'}</button>
    </fieldset>
    {failure && <p role="alert" className="text-sm text-red-800">{failure}</p>}
    {success && <p role="status" className="text-sm text-emerald-800">Senha alterada. Esta sessão foi renovada.</p>}
  </form>;
}

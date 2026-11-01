import React, { useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import { apiUpdateProfile } from '../lib/serverApi';
import type { Employee } from '../types';

export function FirstAccessPassword({ user, onComplete, onLogout }: { user: Employee; onComplete: (user: Employee) => void; onLogout: () => void }) {
  const [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <main className="flex min-h-screen items-center justify-center bg-[#080B0D] p-5"><section className="w-full max-w-md rounded-2xl bg-white p-7 shadow-xl">
    <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-[#FFD400]"><LockKeyhole className="h-6 w-6" /></div>
    <p className="text-xs font-extrabold uppercase tracking-widest text-gray-400">RODOVAR CONECTA · Primeiro acesso</p>
    <h1 className="mt-2 text-2xl font-extrabold text-gray-900">Defina sua senha pessoal</h1>
    <p className="mt-3 text-sm text-gray-600">Olá, {user.name}. Seu acesso foi ativado. Para continuar, substitua a senha inicial por uma senha pessoal.</p>
    <form className="mt-6 space-y-4" onSubmit={async e => {
      e.preventDefault(); if (busy) return; setError('');
      if (password !== confirmation) { setError('As senhas não coincidem.'); return; }
      setBusy(true);
      try { const result = await apiUpdateProfile({ password }); if (!result.ok || !result.user) throw Error(result.error || 'Não foi possível salvar a senha.'); setPassword(''); setConfirmation(''); onComplete(result.user); }
      catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    }}>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <label className="block text-sm font-bold text-gray-700">Nova senha<input type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 p-3 focus:border-yellow-500 focus:outline-none" /></label>
      <label className="block text-sm font-bold text-gray-700">Confirmar nova senha<input type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={confirmation} onChange={e => setConfirmation(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 p-3 focus:border-yellow-500 focus:outline-none" /></label>
      <p className="text-xs text-gray-500">Use pelo menos 8 caracteres. Recomendamos combinar letras, números e símbolos. A nova senha deve ser diferente da inicial.</p>
      <button type="submit" disabled={busy} className="w-full rounded-lg bg-[#FFD400] p-3 text-sm font-extrabold text-gray-900 disabled:opacity-50">{busy ? 'Salvando...' : 'Salvar senha e continuar'}</button>
      <button type="button" disabled={busy} onClick={onLogout} className="w-full p-2 text-xs font-bold text-gray-500">Sair da conta</button>
    </form>
  </section></main>;
}

import React,{useState} from 'react';
import {Lock,ShieldCheck,KeyRound,Eye,EyeOff} from 'lucide-react';
import type {Employee} from '../types';
import {apiUpdateProfile} from '../lib/serverApi';
import {CorporateModal} from './ui/CorporateModal';

export function ProfileSecurity({user,onUpdated}:{user:Employee;onUpdated?:(user:Employee)=>void}){
 const [open,setOpen]=useState(false),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[visible,setVisible]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');
 const close=()=>{if(busy)return;setOpen(false);setPassword('');setConfirmation('');setVisible(false);setError('');};
 return <section className="rv-profile-security rv-profile-section">
  <div className="rv-profile-section-heading"><span className="rv-profile-icon"><Lock size={23}/></span><div><h2>Acesso e Segurança</h2><p>Gerencie sua senha de acesso ao portal.</p></div></div>
  <dl className="rv-profile-security-data"><div><dt>Login de acesso</dt><dd>{user.login||user.email}</dd></div><div><dt>Situação da conta</dt><dd className="rv-profile-active"><ShieldCheck size={16}/>{user.active&&user.approvalStatus==='APROVADO'?'Conta ativa':'Conta restrita'}</dd></div></dl>
  <button type="button" className="rv-profile-secondary" onClick={()=>{setSuccess('');setOpen(true);}}><KeyRound size={17}/>Alterar senha</button>
  {success&&<p role="status" className="rv-profile-success">{success}</p>}
  <CorporateModal isOpen={open} onClose={close} title="Alterar minha senha" subtitle="A nova senha será validada pelo sistema de autenticação." maxWidth="md" isLoading={busy} footer={<><button type="button" className="rv-profile-secondary" disabled={busy} onClick={close}>Cancelar</button><button type="submit" form="profile-password-form" className="rv-profile-primary" disabled={busy}>{busy?'Salvando...':'Salvar nova senha'}</button></>}>
   <form id="profile-password-form" className="rv-profile-password-form" onSubmit={async e=>{e.preventDefault();if(busy)return;setError('');if(password.length<8||password.length>128){setError('Use entre 8 e 128 caracteres.');return;}if(password!==confirmation){setError('A confirmação deve ser igual à nova senha.');return;}setBusy(true);try{const result=await apiUpdateProfile({password});if(!result.ok||!result.user){setError(result.error||'Não foi possível alterar sua senha.');return;}onUpdated?.(result.user);setPassword('');setConfirmation('');setVisible(false);setOpen(false);setSuccess('Senha alterada com sucesso.');}catch{setError('Não foi possível conectar ao servidor. Tente novamente.');}finally{setBusy(false);}}}>
    {error&&<p role="alert" className="rv-profile-error">{error}</p>}
    <label htmlFor="profile-new-password">Nova senha</label><div className="rv-profile-password-input"><input id="profile-new-password" type={visible?'text':'password'} autoComplete="new-password" minLength={8} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} disabled={busy} required/><button type="button" aria-label={visible?'Ocultar nova senha':'Mostrar nova senha'} onClick={()=>setVisible(v=>!v)}>{visible?<EyeOff size={18}/>:<Eye size={18}/>}</button></div>
    <label htmlFor="profile-confirm-password">Confirmar nova senha</label><input id="profile-confirm-password" type={visible?'text':'password'} autoComplete="new-password" minLength={8} maxLength={128} value={confirmation} onChange={e=>setConfirmation(e.target.value)} disabled={busy} required/>
    <p>Use uma senha exclusiva, com pelo menos 8 caracteres. Senhas comuns e repetidas são recusadas pelo servidor.</p>
   </form>
  </CorporateModal>
 </section>;
}

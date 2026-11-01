import './SharedRequestsPremium.css';
import {useGlobalLoading} from './GlobalLoading';
import {useNotificationRecord} from '../hooks/useNotificationRecord';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, Clock3, Download, FileText, Inbox, Loader2, MessageSquare, Paperclip, Plus, RefreshCw, Search, ShieldCheck, UserCheck, X } from 'lucide-react';
import { getAuthHeaders } from '../lib/serverApi';
import { newRequestKey } from '../lib/requestKey';
import { printRequestCsiReceipt } from '../lib/csiReceiptPrinter';
import { CorporateModal } from './ui/CorporateModal';
import type { Department, Employee, InternalRequest, RequestAttachment, RequestStatus } from '../types';

const STATUSES: RequestStatus[] = ['Aberta', 'Em análise', 'Em andamento', 'Aguardando funcionário', 'Concluída', 'Cancelada'];
const DESTINATIONS: Department[] = ['Recursos Humanos', 'Administrativo', 'Financeiro'];
const field = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-yellow-500 focus:ring-2 focus:ring-yellow-100 disabled:bg-gray-100';
const secondary = 'inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50 cursor-pointer';
const primary = 'inline-flex items-center justify-center gap-2 rounded-lg bg-[#FFD400] px-4 py-2.5 text-sm font-extrabold text-[#15191D] hover:bg-yellow-300 disabled:opacity-50 cursor-pointer';
const closed = (r: InternalRequest) => ['Concluída', 'Cancelada'].includes(r.status);
const date = (value: string) => Number.isNaN(Date.parse(value)) ? value : new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
function canHandle(u: Employee, r: InternalRequest) {
  return u.accessLevel === 'ADMINISTRADOR' || u.accessProfile === 'RH' || (u.accessProfile === 'FINANCEIRO' && r.targetDepartment === 'Financeiro');
}
function sla(r: InternalRequest) {
  if (closed(r)) return { text: r.status === 'Concluída' ? 'Atendimento concluído' : 'Protocolo cancelado', color: 'bg-gray-100 text-gray-600' };
  const hours = Math.ceil((Date.parse(r.currentDueAtIso) - Date.now()) / 3600000);
  return hours < 0 ? { text: `Prazo vencido há ${Math.abs(hours)}h`, color: 'bg-red-50 text-red-700' } : { text: hours === 0 ? 'Vence nesta hora' : `Restam ${hours}h`, color: hours <= 8 ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700' };
}
function statusColor(status: RequestStatus) {
  return status === 'Concluída' ? 'bg-emerald-50 text-emerald-700' : status === 'Cancelada' ? 'bg-gray-100 text-gray-600' : status === 'Aberta' ? 'bg-yellow-50 text-yellow-800' : 'bg-blue-50 text-blue-700';
}
async function readFile(file: File | null) {
  if (!file) return undefined;
  if (file.size > 5 * 1024 * 1024) throw Error('Escolha um arquivo de até 5 MB.');
  if (!['application/pdf', 'image/png', 'image/jpeg'].includes(file.type)) throw Error('Envie PDF, PNG ou JPEG.');
  const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(Error('Não foi possível ler o arquivo.')); reader.readAsDataURL(file); });
  return { name: file.name, dataUrl };
}

export function SharedRequestsView({ currentUser, initialOpenRequestModal, onClearInitialModal }: { currentUser: Employee; initialOpenRequestModal?: boolean; onClearInitialModal?: () => void }) {
  const [handlers,setHandlers]=useState<{id:string;name:string}[]>([]);
  const [assignee,setAssignee]=useState('');
  const [rows, setRows] = useState<InternalRequest[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [success, setSuccess] = useState('');
  const [notices, setNotices] = useState(0), [search, setSearch] = useState(''), [status, setStatus] = useState('Todas'), [department, setDepartment] = useState('Todos');
  const [routing, setRouting] = useState<{rhActive:number;financeActive:number} | null>(null);
  const [scope, setScope] = useState('Todas'), [page, setPage] = useState(1), [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(Boolean(initialOpenRequestModal)), [busy, setBusy] = useState(false);
  const [subject, setSubject] = useState(''), [description, setDescription] = useState(''), [destination, setDestination] = useState<Department>('Recursos Humanos');
  const [priority, setPriority] = useState('Média'), [file, setFile] = useState<File | null>(null), [responseFile, setResponseFile] = useState<File | null>(null);
  const [note, setNote] = useState(''), [justification, setJustification] = useState('');
  const submissionKey = useRef(newRequestKey()), inFlight = useRef(false);
  const actionKey = useRef(newRequestKey());
  const responseFileInput = useRef<HTMLInputElement>(null);
  const {id:notificationRecordId,revision:notificationRevision}=useNotificationRecord();
  useEffect(()=>{if(notificationRecordId&&rows.some(r=>r.id===notificationRecordId))setSelectedId(notificationRecordId);},[notificationRecordId,notificationRevision,rows.length]);
 useGlobalLoading(loading && rows.length === 0);
  const selected = rows.find(r => r.id === selectedId);

  const load = useCallback(async (signal?: AbortSignal) => {
    const r = await fetch('/api/requests', { headers: getAuthHeaders(), signal });
    const data = await r.json();
    if (!r.ok) throw Error(data.error || 'Não foi possível carregar a fila.');
    if (signal?.aborted) return;
    setRows(data.requests); setHandlers(data.handlers || []); setRouting(data.routing || null); setNotices(data.notifications.filter((n: { read: boolean }) => !n.read).length); setLoading(false);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const update = () => load(controller.signal).catch(e => { if (!controller.signal.aborted) { setError(e.message); setLoading(false); } });
    update(); const timer = setInterval(update, 5000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [currentUser.id, load]);
  useEffect(() => { if (initialOpenRequestModal) { setCreating(true); onClearInitialModal?.(); } }, [initialOpenRequestModal, onClearInitialModal]);

  const filtered = useMemo(() => rows.filter(r => {
    const q = search.trim().toLocaleLowerCase('pt-BR');
    return (!q || [r.protocol, r.subject, r.description, r.requesterName, r.assignedToName || ''].some(v => v.toLocaleLowerCase('pt-BR').includes(q))) &&
      (department === 'Todos' || r.targetDepartment === department) &&
      (status === 'Todas' || (status === 'Atrasadas' ? !closed(r) && Date.parse(r.currentDueAtIso) < Date.now() : r.status === status)) &&
      (scope === 'Todas' || (scope === 'Minhas' ? r.requesterId === currentUser.id : scope === 'Comigo' ? r.assignedToId === currentUser.id : canHandle(currentUser, r) && !r.assignedToId && !closed(r)));
  }), [rows, search, department, status, scope, currentUser]);
  const pages = Math.max(1, Math.ceil(filtered.length / 10)), activePage = Math.min(page, pages);
  const pageRows = filtered.slice((activePage - 1) * 10, activePage * 10);
  const completedOnTime = rows.filter(r => r.status === 'Concluída' && r.completedAtIso && Date.parse(r.completedAtIso) <= Date.parse(r.currentDueAtIso)).length;
  const stats = [
    { label: 'Novas', value: rows.filter(r => r.status === 'Aberta').length, icon: Inbox, color: 'text-amber-600' },
    { label: 'Em atendimento', value: rows.filter(r => ['Em análise','Em andamento'].includes(r.status)).length, icon: Inbox, color: 'text-blue-600' },
    { label: 'Prazo vencido', value: rows.filter(r => !closed(r) && Date.parse(r.currentDueAtIso) < Date.now()).length, icon: Clock3, color: 'text-red-600' },
    { label: 'Concluídas', value: rows.filter(r => r.status === 'Concluída').length, icon: CheckCircle2, color: 'text-emerald-600' },
    { label: 'Aguardando funcionário', value: rows.filter(r => r.status === 'Aguardando funcionário').length, icon: UserCheck, color: 'text-amber-600' },
  ];

  async function action(id: string, name: string, body: Record<string, unknown> = {}) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(''); setSuccess('');
    try {
      const r = await fetch(`/api/requests/${id}/${name}`, { method: 'POST', headers: getAuthHeaders({ 'X-Idempotency-Key': actionKey.current }), body: JSON.stringify(body) });
      const data = await r.json(); if (!r.ok) throw Error(data.error || 'Não foi possível salvar.');
      await load();
      actionKey.current = newRequestKey();
      if (name === 'response') { setNote(''); setResponseFile(null); if (responseFileInput.current) responseFileInput.current.value = ''; }
      if (name === 'extend' || name === 'escalate') setJustification('');
      if (name !== 'read') setSuccess('Atualização salva no protocolo.');
    } catch (e) { setError((e as Error).message); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function download(r: InternalRequest, attachment: RequestAttachment) {
    try {
      const response = await fetch(`/api/requests/${r.id}/attachments/${attachment.id}`, { headers: getAuthHeaders() });
      if (!response.ok) throw Error('Arquivo indisponível ou acesso negado.');
      const url = URL.createObjectURL(await response.blob()), link = document.createElement('a'); link.href = url; link.download = attachment.name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError((e as Error).message); }
  }
  function exportCsv() {
    const escape = (v: string) => '"' + (/^[=+@\-\t\r]/.test(v) ? "'" + v : v).replaceAll('"', '""') + '"';
    const csv = [['Protocolo', 'Assunto', 'Destino', 'Status', 'Prioridade', 'Solicitante', 'Responsável', 'Prazo'], ...filtered.map(r => [r.protocol, r.subject, r.targetDepartment, r.status, r.priority, r.requesterName, r.assignedToName || 'Disponível', date(r.currentDueAtIso)])].map(row => row.map(escape).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })), link = document.createElement('a'); link.href = url; link.download = 'rodovar-solicitacoes.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section className="csi-premium space-y-5 text-[#15191D]">
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFD400]"><FileText className="h-6 w-6" /></div><div><p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-400">Atendimento interno · CSI</p><h1 className="text-xl font-extrabold">{currentUser.accessProfile==='RH'?'Central de Atendimento — RH':currentUser.accessLevel==='ADMINISTRADOR'?'Central de Solicitações — Supervisão':'Minhas Solicitações'}</h1><p className="mt-1 text-xs text-gray-500">Protocolos, documentos e respostas em um só lugar. Prazo inicial de 48 horas.</p></div></div>
        <div className="flex flex-wrap gap-2"><button type="button" className={secondary} onClick={() => load().catch(e => setError(e.message))} aria-label="Atualizar solicitações"><RefreshCw className="h-4 w-4" /></button><button type="button" className={secondary} onClick={exportCsv}><Download className="h-4 w-4" />Exportar CSV</button><button type="button" className={primary} onClick={() => { setCreating(true); setError(''); }}><Plus className="h-4 w-4" />Nova solicitação</button></div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3 text-[11px] text-gray-500"><ShieldCheck className="h-4 w-4 text-emerald-600" /><span>Você visualiza apenas os protocolos autorizados ao seu perfil.</span>{notices > 0 && <span className="rounded-full bg-yellow-100 px-2 py-1 font-bold text-yellow-900">{notices} novas atualizações</span>}</div>
    </div>
    {error && <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><span className="flex items-center gap-2"><AlertCircle className="h-4 w-4 shrink-0" />{error}</span><button type="button" onClick={() => setError('')} aria-label="Fechar erro"><X className="h-4 w-4" /></button></div>}
    {success && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</p>}
    {currentUser.accessLevel === 'ADMINISTRADOR' && routing && (routing.rhActive < 2 || routing.financeActive < 1) && <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span><strong>Ativação da equipe pendente.</strong> RH: {routing.rhActive}/2 responsáveis ativas. Financeiro: {routing.financeActive} responsável ativo. Os protocolos permanecem na fila; as notificações da equipe dependem da ativação das contas.</span></p>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{stats.map(({ label, value, icon: Icon, color }) => <div key={label} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4"><div><p className="text-xs font-semibold text-gray-500">{label}</p><p className="mt-2 text-2xl font-extrabold tabular-nums">{value}</p></div><Icon className={`h-6 w-6 ${color}`} /></div>)}</div>
    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-3"><label className="relative min-w-56 flex-1"><span className="sr-only">Buscar protocolo, assunto ou pessoa</span><Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" /><input className={`${field} pl-9`} value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar protocolo, assunto ou pessoa..." /></label><label><span className="sr-only">Filtrar por destino</span><select className={field} value={department} onChange={e => { setDepartment(e.target.value); setPage(1); }}><option value="Todos">Todos os destinos</option>{[...new Set([...DESTINATIONS, ...rows.map(r => r.targetDepartment)])].map(d => <option key={d}>{d}</option>)}</select></label><label><span className="sr-only">Filtrar por responsabilidade</span><select className={field} value={scope} onChange={e => { setScope(e.target.value); setPage(1); }}><option value="Todas">Todos os protocolos</option><option value="Minhas">Solicitações que abri</option><option value="Comigo">Sob minha responsabilidade</option><option value="Fila">Disponíveis para assumir</option></select></label></div>
      <div className="flex flex-wrap gap-1.5" aria-label="Filtrar por situação">{['Todas', 'Aberta', 'Em análise', 'Em andamento', 'Aguardando funcionário', 'Atrasadas', 'Concluída', 'Cancelada'].map(s => <button type="button" key={s} aria-pressed={status === s} onClick={() => { setStatus(s); setPage(1); }} className={`rounded-lg px-3 py-2 text-[11px] font-bold transition ${status === s ? 'bg-[#15191D] text-[#FFD400]' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>{s}</button>)}</div>
    </div>
    {loading ? <div className="flex items-center justify-center gap-2 p-12 text-gray-500"><Loader2 className="h-5 w-5 animate-spin" />Carregando protocolos...</div> : pageRows.length === 0 ? <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center"><Inbox className="mx-auto mb-3 h-9 w-9 text-gray-300" /><h2 className="font-bold">Nenhuma solicitação encontrada</h2><p className="mt-2 text-sm text-gray-500">Ajuste os filtros ou abra uma nova solicitação.</p></div> : <div className="space-y-3">{pageRows.map(r => {
      const due = sla(r);
      return <article key={r.id} className="flex flex-col justify-between gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center"><div className="min-w-0 space-y-2"><div className="flex flex-wrap items-center gap-2"><span className="rounded bg-[#15191D] px-2 py-1 font-mono text-xs font-bold text-[#FFD400]">{r.protocol}</span><span className={`rounded px-2 py-1 text-[10px] font-bold ${statusColor(r.status)}`}>{r.status}</span><span className={`flex items-center gap-1 rounded px-2 py-1 text-[10px] font-bold ${due.color}`}><Clock3 className="h-3 w-3" />{due.text}</span>{r.priority === 'Urgente' && <span className="text-[10px] font-bold text-red-600">URGENTE</span>}</div><h2 className="text-sm font-extrabold">{r.subject}</h2><p className="line-clamp-2 text-xs leading-relaxed text-gray-500">{r.description}</p><p className="text-[11px] text-gray-500">{r.targetDepartment} · {r.requesterName} · Prioridade {r.priority}</p><p className="flex items-center gap-1 text-[11px] font-semibold text-gray-600"><UserCheck className="h-3.5 w-3.5" />{r.assignedToName || (closed(r) ? 'Responsável não registrado no histórico' : 'Aguardando responsável')}{(r.attachments?.length || 0) > 0 && <span className="ml-2 flex items-center gap-1"><Paperclip className="h-3 w-3" />{r.attachments?.length}</span>}</p></div><div className="flex shrink-0 flex-wrap gap-2">{canHandle(currentUser, r) && !r.assignedToId && !closed(r) && <button type="button" disabled={busy} className={primary} onClick={() => action(r.id, 'claim')}><UserCheck className="h-4 w-4" />Assumir</button>}<button type="button" className={secondary} onClick={() => { setSelectedId(r.id); setNote(''); setJustification(''); setError(''); action(r.id, 'read'); }}>Histórico e detalhes<ArrowRight className="h-3.5 w-3.5" /></button></div></article>;
    })}</div>}
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500"><span>{filtered.length} protocolos · Página {activePage} de {pages}</span><div className="flex gap-2"><button type="button" className={secondary} disabled={activePage <= 1} onClick={() => setPage(activePage - 1)}>Anterior</button><button type="button" className={secondary} disabled={activePage >= pages} onClick={() => setPage(activePage + 1)}>Próxima</button></div></div>
    {completedOnTime > 0 && <p className="text-[11px] text-gray-400">{completedOnTime} conclusões no prazo com data de encerramento registrada.</p>}

    <CorporateModal isOpen={creating} onClose={() => { if (!busy) setCreating(false); }} title="Nova solicitação interna" subtitle="Protocolo e prazo de 48 horas gerados após o envio." maxWidth="2xl" isLoading={busy} footer={<><button type="button" className={secondary} disabled={busy} onClick={() => setCreating(false)}>Cancelar</button><button type="submit" form="new-csi-request" disabled={busy} className={primary}>{busy ? 'Enviando...' : 'Gerar protocolo'}</button></>}>
      <form id="new-csi-request" className="space-y-4" onSubmit={async e => {
        e.preventDefault(); if (inFlight.current) return; inFlight.current = true; setBusy(true); setError('');
        try {
          const attachment = await readFile(file);
          const r = await fetch('/api/requests', { method: 'POST', headers: getAuthHeaders({ 'X-Idempotency-Key': submissionKey.current }), body: JSON.stringify({ subject, description, targetDepartment: destination, priority, attachment }) });
          const d = await r.json(); if (!r.ok) throw Error(d.error || 'Falha ao criar protocolo.');
          await load(); setCreating(false); setSubject(''); setDescription(''); setPriority('Média'); setFile(null); submissionKey.current = newRequestKey(); setSuccess(`Solicitação ${d.request.protocol} registrada com sucesso.`);
        } catch (e) { setError((e as Error).message); } finally { inFlight.current = false; setBusy(false); }
      }}>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="grid gap-4 sm:grid-cols-2"><label className="space-y-1 text-xs font-bold text-gray-600"><span>Setor de atendimento</span><select className={field} value={destination} onChange={e => setDestination(e.target.value as Department)}>{DESTINATIONS.map(d => <option key={d}>{d}</option>)}</select></label><label className="space-y-1 text-xs font-bold text-gray-600"><span>Prioridade</span><select className={field} value={priority} onChange={e => setPriority(e.target.value)}>{['Baixa', 'Média', 'Alta', 'Urgente'].map(p => <option key={p}>{p}</option>)}</select></label></div>
        <p className="rounded-lg bg-blue-50 p-3 text-xs text-blue-800">RH e atendimento administrativo são atendidos pela mesma equipe, com uma responsável identificada por protocolo.</p>
        <label className="block space-y-1 text-xs font-bold text-gray-600"><span>Assunto *</span><input required maxLength={200} className={field} value={subject} onChange={e => setSubject(e.target.value)} placeholder="Ex.: Solicitação de declaração de vínculo" /></label>
        <label className="block space-y-1 text-xs font-bold text-gray-600"><span>Descrição detalhada *</span><textarea required rows={5} maxLength={3000} className={field} value={description} onChange={e => setDescription(e.target.value)} placeholder="Descreva o que precisa e inclua as informações necessárias ao atendimento." /></label>
        <label className="block space-y-2 rounded-lg border border-dashed border-gray-300 p-4 text-xs font-bold text-gray-600"><span className="flex items-center gap-2"><Paperclip className="h-4 w-4" />Anexo opcional · PDF, PNG ou JPEG · Até 5 MB</span><input type="file" accept="application/pdf,image/png,image/jpeg" onChange={e => setFile(e.target.files?.[0] || null)} className="block w-full text-xs" />{file && <span className="block font-normal">{file.name}</span>}</label>
      </form>
    </CorporateModal>

    <CorporateModal isOpen={!!selected} onClose={() => setSelectedId(null)} title={selected ? `${selected.protocol} · ${selected.subject}` : 'Protocolo'} subtitle="Detalhes, documentos e histórico do atendimento" maxWidth="3xl" footer={<button type="button" className={secondary} onClick={() => setSelectedId(null)}>Fechar</button>}>
      {selected && <div className="csi-detail space-y-5 text-sm">
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
        {success && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-700">{success}</p>}
        <div className="grid gap-3 rounded-xl bg-gray-50 p-4 sm:grid-cols-2"><p><span className="block text-xs text-gray-500">Solicitante</span><strong>{selected.requesterName}</strong></p><p><span className="block text-xs text-gray-500">Setor · Prioridade</span><strong>{selected.targetDepartment} · {selected.priority}</strong></p><p><span className="block text-xs text-gray-500">Prazo inicial preservado</span>{date(selected.originalDueAtIso)}</p><p><span className="block text-xs text-gray-500">Prazo atual</span>{date(selected.currentDueAtIso)}</p><p><span className="block text-xs text-gray-500">Responsável</span><strong>{selected.assignedToName || (closed(selected) ? 'Responsável não registrado no histórico' : 'Aguardando responsável')}</strong></p><p><span className="block text-xs text-gray-500">Situação</span><strong>{selected.status}</strong></p></div>
        <p className="whitespace-pre-wrap leading-relaxed text-gray-700">{selected.description}</p>
        <div className="flex flex-wrap gap-2">{canHandle(currentUser, selected) && !selected.assignedToId && !closed(selected) && <button type="button" disabled={busy} className={primary} onClick={() => action(selected.id, 'claim')}>Assumir atendimento</button>}</div>
        {(currentUser.accessProfile==='RH'||currentUser.accessLevel==='ADMINISTRADOR')&&!closed(selected)&&<div className="csi-assignment"><label>Atribuir responsável RH<select className={field} value={assignee} onChange={e=>setAssignee(e.target.value)}><option value="">Selecione a responsável</option>{handlers.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select></label><button className={secondary} disabled={busy||!assignee} onClick={()=>action(selected.id,'assign',{assignedToId:assignee})}>Atribuir atendimento</button></div>}
        <section className="space-y-2"><h3 className="flex items-center gap-2 text-xs font-extrabold uppercase text-gray-500"><Paperclip className="h-4 w-4" />Documentos do protocolo</h3>{selected.attachments?.length ? selected.attachments.map(a => <button type="button" key={a.id} className={secondary} onClick={() => download(selected, a)}><Download className="h-3.5 w-3.5" />{a.name} · {Math.ceil(a.size / 1024)} KB</button>) : <p className="text-xs text-gray-500">{selected.attachmentName ? `Registro antigo: ${selected.attachmentName}. O conteúdo do arquivo não foi incluído no pacote original.` : 'Nenhum arquivo anexado.'}</p>}</section>
        {selected.assignedToId === currentUser.id && canHandle(currentUser, selected) && !closed(selected) && <label className="block space-y-1 text-xs font-bold text-gray-600"><span>Atualizar situação</span><select className={field} value={selected.status} disabled={busy} onChange={e => action(selected.id, 'status', { status: e.target.value })}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></label>}
        <section className="csi-conversation space-y-3 border-t border-gray-100 pt-4"><h3 className="flex items-center gap-2 font-bold"><MessageSquare className="h-4 w-4" />Histórico e respostas</h3><div className="max-h-72 space-y-3 overflow-y-auto">{selected.history.map(h => <article key={h.id} className="rounded-lg border border-gray-200 p-3"><div className="flex flex-wrap justify-between gap-2 text-xs"><strong>{h.actorName}</strong><time className="text-gray-400">{date(h.timestamp)}</time></div><p className="mt-1 text-xs font-semibold text-gray-600">{h.action}</p>{h.note && <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{h.note}</p>}</article>)}</div></section>
        {!closed(selected) && (selected.requesterId === currentUser.id || selected.assignedToId === currentUser.id) && <form className="space-y-3 rounded-xl bg-gray-50 p-4" onSubmit={async e => { e.preventDefault(); try { const attachment = await readFile(responseFile); await action(selected.id, 'response', { note, attachment }); } catch (e) { setError((e as Error).message); } }}><label className="block space-y-1 text-xs font-bold text-gray-600"><span>Adicionar resposta</span><textarea required rows={3} maxLength={3000} className={field} value={note} onChange={e => setNote(e.target.value)} placeholder="Escreva uma resposta para o protocolo..." /></label><label className="block text-xs text-gray-500">Anexo complementar (PDF, PNG ou JPEG, até 5 MB)<input ref={responseFileInput} type="file" className="mt-2 block w-full" accept="application/pdf,image/png,image/jpeg" onChange={e => setResponseFile(e.target.files?.[0] || null)} /></label><button type="submit" className={primary} disabled={busy || !note.trim()}>{busy ? 'Salvando...' : 'Enviar resposta'}</button></form>}
        {selected.assignedToId === currentUser.id && canHandle(currentUser, selected) && !closed(selected) && <section className="space-y-3 border-t border-gray-100 pt-4"><label className="block space-y-1 text-xs font-bold text-gray-600"><span>Justificativa para prorrogação ou revisão administrativa</span><textarea className={field} rows={2} value={justification} onChange={e => setJustification(e.target.value)} maxLength={3000} /></label><div className="flex flex-wrap gap-2"><button type="button" className={secondary} disabled={busy || justification.trim().length < 5} onClick={() => action(selected.id, 'extend', { hours: 24, note: justification })}>Prorrogar prazo em 24h</button><button type="button" className={secondary} disabled={busy || selected.escalatedToDiretoria || justification.trim().length < 5} onClick={() => action(selected.id, 'escalate', { note: justification })}>{selected.escalatedToDiretoria ? 'Revisão já solicitada' : 'Solicitar revisão administrativa'}</button></div><p className="text-[11px] text-gray-500">O prazo original e o histórico são preservados. A revisão mantém as restrições de dados do protocolo.</p></section>}
      </div>}
    </CorporateModal>
  </section>;
}

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Express } from 'express';
import type { Employee, InternalRequest, RequestAttachment, RequestStatus } from '../types';
import { PREVIEW_FREIGHT_FILE_LIMIT } from '../lib/freightFileLimits.js';
import { hasPagePermission } from '../lib/permissions.js';

const DESTINATIONS = ['Recursos Humanos', 'Administrativo', 'Financeiro'];
const STATUSES: RequestStatus[] = ['Aberta', 'Em análise', 'Em andamento', 'Aguardando funcionário', 'Concluída', 'Cancelada'];
const terminal = (r: InternalRequest) => ['Concluída', 'Cancelada'].includes(r.status);
interface QueueNotification { id: string; recipientId: string; targetId: string; title: string; read: boolean; createdAtIso: string }
interface QueueState { requests: InternalRequest[]; notifications: QueueNotification[]; keys: Record<string, string> }

export function canHandleRequest(u: Employee, r: InternalRequest): boolean {
  return u.active && u.approvalStatus === 'APROVADO' && (u.accessLevel === 'ADMINISTRADOR' ||
    u.accessProfile === 'RH' ||
    (u.accessProfile === 'FINANCEIRO' && r.targetDepartment === 'Financeiro'));
}

export function registerRequestQueue(app: Express, guard: any, users: () => Employee[], initial: InternalRequest[] = [], remoteState?: QueueState) {
  const directory = path.join(process.env.RODOVAR_DATA_ROOT || process.cwd(), 'data');
  const file = path.join(directory, 'requests-server.json');
  const attachmentsDir = path.join(directory, 'request-attachments');
  const state: QueueState = remoteState || (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) :
    { requests: structuredClone(initial), notifications: [], keys: {} });
  const save = () => {
    if (remoteState) return;
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(file + '.tmp', JSON.stringify(state, null, 2));
    fs.renameSync(file + '.tmp', file);
  };
  const visible = (u: Employee, r: InternalRequest) => r.requesterId === u.id || canHandleRequest(u, r);
  const notify = (r: InternalRequest, recipientId: string, title: string, eventId: string) => {
    const id = `${eventId}:${recipientId}`;
    if (!state.notifications.some(n => n.id === id)) state.notifications.push({ id, recipientId, targetId: r.id, title, read: false, createdAtIso: new Date().toISOString() });
  };
  const history = (r: InternalRequest, u: Employee, action: string, note?: string) => {
    const id = crypto.randomUUID();
    r.history.push({ id, timestamp: new Date().toISOString(), actorName: u.name, action, ...(note ? { note } : {}) });
    return id;
  };
  const attachmentPayload = (input: any): { name: string; mimeType: string; bytes: Buffer } | undefined => {
    if (!input) return;
    if (typeof input.dataUrl !== 'string' || typeof input.name !== 'string') throw Error('Anexo inválido.');
    const match = /^data:(application\/pdf|image\/png|image\/jpeg);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(input.dataUrl);
    if (!match) throw Error('Envie PDF, PNG ou JPEG.');
    const bytes = Buffer.from(match[2], 'base64');
    const maxBytes = remoteState ? PREVIEW_FREIGHT_FILE_LIMIT : 5 * 1024 * 1024;
    if (bytes.length < 8 || bytes.length > maxBytes || bytes.toString('base64') !== match[2].replace(/\s/g, '')) throw Error('Arquivo inválido ou acima do limite de ' + maxBytes / (1024 * 1024) + ' MB.');
    const valid = match[1] === 'application/pdf' ? bytes.subarray(0, 5).toString() === '%PDF-' :
      match[1] === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!valid) throw Error('O conteúdo do arquivo não corresponde ao formato informado.');
    return { name: input.name.replace(/[\r\n<>"/\\]/g, '_').slice(0, 160), mimeType: match[1], bytes };
  };
  const addAttachment = (req: any, r: InternalRequest, u: Employee, parsed: ReturnType<typeof attachmentPayload>) => {
    if (!parsed) return;
    const attachment: RequestAttachment = { id: crypto.randomUUID(), name: parsed.name, mimeType: parsed.mimeType, size: parsed.bytes.length, uploadedById: u.id, createdAtIso: new Date().toISOString() };
    if (remoteState) req.saveRequestAttachment(r.id, attachment, parsed.bytes);
    else {
      fs.mkdirSync(attachmentsDir, { recursive: true });
      fs.writeFileSync(path.join(attachmentsDir, attachment.id), parsed.bytes);
    }
    (r.attachments ||= []).push(attachment);
    r.attachmentName ||= attachment.name;
  };
  const fail = (res: any, message: string, status = 400) => res.status(status).json({ error: message });
  if (!fs.existsSync(file)) save();

  app.get('/api/requests', guard, (req: any, res) => {
    const u = req.sessionUser;
    if (!hasPagePermission(u, 'solicitacoes')) return fail(res, 'Sem acesso à fila.', 403);
    res.setHeader('Cache-Control', 'no-store');
    const activeUsers = users().filter(person => person.active && person.approvalStatus === 'APROVADO');
    let slaChanged = false;
    for (const request of state.requests) {
      const due = request.currentDueAtIso || request.originalDueAtIso;
      if (terminal(request) || !due || !Number.isFinite(Date.parse(due)) || Date.parse(due) > Date.now() || request.slaLastEscalatedDueAtIso === due) continue;
      request.slaLastEscalatedDueAtIso = due;
      request.slaBreachedAtIso = new Date().toISOString();
      request.escalatedToDiretoria = true;
      request.history.push({id:crypto.randomUUID(),timestamp:request.slaBreachedAtIso,actorName:'Sistema',action:'Prazo SLA vencido — revisão administrativa solicitada',note:'Prazo original preservado. Vencimento: '+due});
      for (const person of activeUsers.filter(person => person.accessLevel === 'ADMINISTRADOR' || person.id === request.assignedToId && canHandleRequest(person,request) && hasPagePermission(person,'solicitacoes'))) notify(request,person.id,'Prazo vencido: '+request.protocol,'sla:'+request.id+':'+due);
      slaChanged = true;
    }
    if (slaChanged) save();
    res.json({ handlers: activeUsers.filter(person => person.accessProfile === 'RH').map(person => ({id:person.id,name:person.name})), requests: state.requests.filter(r => visible(u, r)), notifications: state.notifications.filter(n => n.recipientId === u.id), routing: {
      rhActive: activeUsers.filter(person => person.accessProfile === 'RH').length,
      financeActive: activeUsers.filter(person => person.accessProfile === 'FINANCEIRO').length,
    } });
  });
  app.post('/api/requests', guard, (req: any, res) => {
    const u = req.sessionUser;
    if (!hasPagePermission(u, 'solicitacoes')) return fail(res, 'Sem acesso.', 403);
    const { subject, description, targetDepartment, priority, attachment } = req.body || {};
    const key = String(req.headers['x-idempotency-key'] || '');
    if (!key || key.length > 160) return fail(res, 'Identificador de envio obrigatório.');
    const composite = u.id + ':' + key;
    if (state.keys[composite]) return res.json({ request: state.requests.find(r => r.id === state.keys[composite]) });
    if (!DESTINATIONS.includes(targetDepartment) || typeof subject !== 'string' || !subject.trim() || subject.length > 200 || typeof description !== 'string' || !description.trim() || description.length > 3000) return fail(res, 'Preencha destino, assunto e descrição.');
    let parsed: ReturnType<typeof attachmentPayload>;
    try { parsed = attachmentPayload(attachment); } catch (e) { return fail(res, (e as Error).message); }
    const id = crypto.randomUUID(), now = new Date(), due = new Date(now.getTime() + 48 * 3600000).toISOString();
    const maxProtocol = state.requests.reduce((max, r) => Math.max(max, /^#\d+$/.test(r.protocol) ? Number(r.protocol.slice(1)) : 0), 1025);
    const record: InternalRequest = { id, protocol: '#' + (maxProtocol + 1), requesterId: u.id, requesterName: u.name, requesterDepartment: u.department, targetDepartment, subject: subject.trim(), description: description.trim(), priority: ['Baixa', 'Média', 'Alta', 'Urgente'].includes(priority) ? priority : 'Média', status: 'Aberta', createdAtIso: now.toISOString(), originalDueAtIso: due, currentDueAtIso: due, history: [] };
    history(record, u, 'Solicitação aberta', 'Prazo inicial de 48 horas corridas.');
    addAttachment(req, record, u, parsed);
    state.requests.unshift(record); state.keys[composite] = id;
    for (const recipient of users().filter(r => r.active && r.approvalStatus === 'APROVADO' && (targetDepartment === 'Financeiro' ? r.accessProfile === 'FINANCEIRO' : r.accessProfile === 'RH'))) notify(record, recipient.id, 'Nova solicitação ' + record.protocol, id);
    save(); res.status(201).json({ request: record });
  });
  app.get('/api/requests/:id/attachments/:attachmentId', guard, async (req: any, res) => {
    const u = req.sessionUser, r = state.requests.find(r => r.id === req.params.id);
    if (!hasPagePermission(u, 'solicitacoes') || !r || !visible(u, r)) return fail(res, 'Arquivo não encontrado.', 404);
    const attachment = r.attachments?.find(a => a.id === req.params.attachmentId);
    if (!attachment) return fail(res, 'Arquivo não encontrado.', 404);
    if (remoteState) {
      await req.sendRequestAttachment(r.id, attachment);
      return;
    }
    const storedPath = path.join(attachmentsDir, attachment.id);
    if (!fs.existsSync(storedPath)) return fail(res, 'Arquivo indisponível no servidor.', 404);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Type', attachment.mimeType);
    res.attachment(attachment.name).sendFile(storedPath);
  });
  app.post('/api/requests/:id/:action', guard, (req: any, res) => {
    const u = req.sessionUser, r = state.requests.find(r => r.id === req.params.id);
    if (!hasPagePermission(u, 'solicitacoes') || !r || !visible(u, r)) return fail(res, 'Solicitação não encontrada.', 404);
    const action = req.params.action, isHandler = canHandleRequest(u, r), assigned = r.assignedToId === u.id;
    const actionKey = String(req.headers['x-idempotency-key'] || '');
    if (actionKey.length > 160) return fail(res, 'Identificador de envio inválido.');
    const composite = [u.id, r.id, action, actionKey].join(':');
    if (actionKey && state.keys[composite]) return res.json({ request: r });
    if (action === 'read') {
      for (const n of state.notifications) if (n.targetId === r.id && n.recipientId === u.id) n.read = true;
      save(); return res.json({ request: r });
    }
    if (terminal(r)) return fail(res, 'Protocolo encerrado. O histórico permanece disponível.', 409);
    if (action === 'assign') {
      if (!(u.accessProfile === 'RH' || u.accessLevel === 'ADMINISTRADOR')) return fail(res, 'Atribuição não autorizada.', 403);
      if (r.assignedToId && !assigned && u.accessLevel !== 'ADMINISTRADOR') return fail(res, 'Somente a responsável atual pode transferir.', 409);
      const target = users().find(person => person.id === req.body?.assignedToId && person.accessProfile === 'RH' && canHandleRequest(person,r));
      if (!target) return fail(res, 'Responsável RH inválida.', 400);
      r.assignedToId=target.id; r.assignedToName=target.name;
      if(r.status==='Aberta')r.status='Em análise';
      const event=history(r,u,'Atendimento atribuído a '+target.name);
      notify(r,target.id,'Atendimento atribuído: '+r.protocol,event);
    } else if (action === 'claim') {
      if (!isHandler) return fail(res, 'Somente o setor responsável pode assumir.', 403);
      // No await between checking the owner and persisting in this single Node process.
      if (r.assignedToId && !assigned) return fail(res, 'Atendimento já assumido por ' + r.assignedToName, 409);
      if (assigned) return res.json({ request: r });
      r.assignedToId = u.id; r.assignedToName = u.name;
      if (r.status === 'Aberta') r.status = 'Em análise';
      history(r, u, 'Atendimento assumido');
    } else if (action === 'response') {
      if (!(u.id === r.requesterId || (isHandler && assigned))) return fail(res, 'Apenas o solicitante e o responsável podem responder.', 403);
      const note = String(req.body?.note || '').trim();
      if (!note || note.length > 3000) return fail(res, 'Informe uma resposta de até 3.000 caracteres.');
      let parsed: ReturnType<typeof attachmentPayload>;
      try { parsed = attachmentPayload(req.body?.attachment); } catch (e) { return fail(res, (e as Error).message); }
      addAttachment(req, r, u, parsed);
      const event = history(r, u, 'Resposta no atendimento', note);
      const recipients = new Set([r.requesterId, r.assignedToId, ...users().filter(person => canHandleRequest(person, r) && person.accessProfile === 'RH').map(person => person.id)]);
      for (const uid of recipients) if (uid && uid !== u.id) notify(r, uid, 'Nova resposta em ' + r.protocol, event);
    } else {
      if (!isHandler || !assigned) return fail(res, 'Assuma o atendimento antes de atualizar.', 403);
      if (action === 'status') {
        if (!STATUSES.includes(req.body?.status)) return fail(res, 'Status inválido.');
        if (r.status === req.body.status) return res.json({ request: r });
        r.status = req.body.status;
        if (terminal(r)) r.completedAtIso = new Date().toISOString();
        const event = history(r, u, 'Status: ' + r.status, String(req.body?.note || '').trim().slice(0, 3000));
        notify(r, r.requesterId, r.protocol + ' — ' + r.status, event);
      } else if (action === 'extend') {
        const hours = Number(req.body?.hours), note = String(req.body?.note || '').trim();
        if (!Number.isInteger(hours) || hours < 1 || hours > 168 || note.length < 5 || note.length > 3000) return fail(res, 'Informe de 1 a 168 horas e uma justificativa.');
        r.currentDueAtIso = new Date(Date.parse(r.currentDueAtIso) + hours * 3600000).toISOString();
        const event = history(r, u, `Prazo prorrogado em ${hours}h`, note);
        notify(r, r.requesterId, 'Prazo atualizado em ' + r.protocol, event);
      } else if (action === 'escalate') {
        const note = String(req.body?.note || '').trim();
        if (note.length < 5 || note.length > 3000) return fail(res, 'Informe o motivo do alerta.');
        if (r.escalatedToDiretoria) return res.json({ request: r });
        r.escalatedToDiretoria = true;
        history(r, u, 'Alerta registrado para revisão administrativa', note);
        for (const admin of users().filter(person => person.active && person.accessLevel === 'ADMINISTRADOR')) notify(r, admin.id, 'Revisão administrativa: ' + r.protocol, 'escalate:' + r.id);
      } else return fail(res, 'Ação inválida.', 404);
    }
    if (actionKey) state.keys[composite] = r.id;
    save(); res.json({ request: r });
  });
}

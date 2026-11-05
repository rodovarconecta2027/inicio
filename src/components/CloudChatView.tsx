import React, { useEffect, useRef, useState } from 'react';
import { WhatsAppChatPresentation, type WhatsAppChatViewProps } from './WhatsAppChatView';
import { portalFetch } from '../lib/apiTransport';
import { getAuthHeaders } from '../lib/serverApi';
import { newRequestKey } from '../lib/requestKey';
import type { ChatThread } from '../types';

export function CloudChatView(props: WhatsAppChatViewProps) {
  const [conversations, setConversations] = useState<any[]>([]), [messages, setMessages] = useState<Record<string, any[]>>({});
  const [error, setError] = useState(''), [loading, setLoading] = useState(true), [selected, setSelected] = useState('');
  const alive = useRef(true), sending = useRef(false), keys = useRef(new Map<string, string>());
  const attachmentPayload = async (name?: string, mediaUrl?: string) => {
    if (!name && !mediaUrl) return undefined;
    if (!name || !mediaUrl) throw Error('Arquivo incompleto. Selecione-o novamente.');
    if (mediaUrl.startsWith('data:')) return { name, dataUrl: mediaUrl };
    if (!/^\/api\/cloud\/chat\/messages\/[a-f0-9]{64}\/attachment$/.test(mediaUrl)) throw Error('Selecione um arquivo real de até 3 MB.');
    const response = await portalFetch(mediaUrl, {headers:getAuthHeaders()});
    if (!response.ok) throw Error('O arquivo encaminhado não está disponível para sua conta.');
    const file = await response.blob();
    return { name, dataUrl: await new Promise<string>((resolve,reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(Error('Falha ao ler arquivo.')); reader.readAsDataURL(file);
    }) };
  };
  const request = async (path: string, method = 'GET', body?: any) => {
    const signature = JSON.stringify([path, method, body]);
    if (!keys.current.has(signature)) keys.current.set(signature, newRequestKey());
    const response = await portalFetch('/api/cloud/chat' + path, { method, headers: getAuthHeaders({ 'X-Idempotency-Key': keys.current.get(signature)! }), ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'Não foi possível acessar a conversa.');
    keys.current.delete(signature); return data;
  };
  const refresh = async (id = selected, older?: number) => {
    const list = await request('/conversations');
    if (alive.current) setConversations(list);
    const target = list.some((c:any)=>c.id===id) ? id : list[0]?.id;
    if (target && target !== id && alive.current) setSelected(target);
    if (target) {
      const page = await request(`/conversations/${target}/messages${older ? '?before=' + older : ''}`);
      if (alive.current) setMessages(previous => ({ ...previous, [target]: [...new Map([...(previous[target] || []), ...page].map(m => [m.id, m])).values()].sort((a: any, b: any) => a.sequence - b.sequence) }));
    }
    if (alive.current) { setError(''); setLoading(false); }
    return list;
  };
  const run = async (action: () => Promise<unknown>) => {
    try { await action(); if (alive.current) setError(''); return true; }
    catch (e) { if (alive.current) setError((e as Error).message); return false; }
  };
  useEffect(() => {
    alive.current = true; let stopped = false;
    const poll = () => { if (!stopped) void run(() => refresh()); };
    poll(); const timer = setInterval(poll, 5000);
    return () => { stopped = true; alive.current = false; clearInterval(timer); };
  }, [props.currentUser.id, selected]);
  const select = (id: string) => {
    setSelected(id);
    void run(async () => {
      const list = await refresh(id), thread = list.find((c: any) => c.id === id);
      if (thread) await request(`/conversations/${id}/read`, 'POST', { sequence: thread.messageCount });
    });
  };
  const threads: ChatThread[] = conversations.map(c => {
    const other = props.employees.find(u => u.id !== props.currentUser.id && c.participantIds?.includes(u.id));
    return { id: c.id, isGroup: c.isGroup, name: c.isGroup ? c.name : other?.name || 'Conversa interna',
      roleOrDept: c.isGroup ? 'Grupo corporativo' : other?.roleTitle || '', participantIds: c.participantIds || [],
      participantsCount: c.participantIds?.length || 0, pinnedNotice: c.pinnedNotice || '',
      avatar: other?.avatar || '/assets/default-avatar.png', unreadCount: Math.max(0, c.messageCount - c.lastReadSequence),
      messages: (messages[c.id] || []).map(m => ({ id: m.id, senderId: m.senderId,
        senderName: props.employees.find(u => u.id === m.senderId)?.name || 'Colaborador',
        text: m.deleted ? 'Mensagem removida' : m.text, timestamp: new Date(m.createdAtIso).toLocaleString('pt-BR'), status: 'delivered',
        ...(!m.deleted && m.attachment ? {attachment:m.attachment.name,attachmentSize:`${Math.ceil(m.attachment.size/1024)} KB`,mediaType:m.attachment.mediaType,mediaUrl:m.attachment.url} : {}),
        pinned: !!m.pinned, reactions: Object.values(m.reactionsByUser || {}) as string[],
      })),
    };
  });
  const oldest = messages[selected]?.[0]?.sequence;
  return <div>
    <div className="mb-3 rounded-xl border border-slate-200 bg-white p-3 text-sm" role="status">
      {error ? <span role="alert">{error} <button className="underline" onClick={() => void run(() => refresh())}>Tentar novamente</button></span> : loading ? 'Carregando conversas…' : 'Mensagens salvas no servidor de homologação. Atualização automática.'}
      {oldest > 1 && <button className="ml-3 underline" onClick={() => void run(() => refresh(selected, oldest))}>Carregar mensagens anteriores</button>}
    </div>
    <WhatsAppChatPresentation {...props} chats={threads} onSelectThread={select}
      onMarkThreadRead={select}
      onStartDirectChat={async employee => {
        let id: string | undefined;
        await run(async () => { const c = await request('/conversations', 'POST', { participants: [employee.id] }); id = c.id; await refresh(id); setSelected(id!); });
        return id;
      }}
      onSendMessage={async (id, text, attachment, _size, extra) => {
        if (sending.current) return false;
        sending.current = true;
        try { return await run(async () => {
          const file = await attachmentPayload(attachment, extra?.mediaUrl);
          await request(`/conversations/${id}/messages`, 'POST', { text, ...(file ? {attachment:file} : {}) }); await refresh(id);
        }); } finally { sending.current = false; }
      }}
      onCreateGroupChat={async group => run(async () => { const c = await request('/conversations', 'POST', { participants: group.participantIds, name: group.name, isGroup: true });
        if (group.pinnedNotice) await request('/conversations/' + c.id, 'PATCH', { pinnedNotice: group.pinnedNotice }); await refresh(c.id); setSelected(c.id); })}
      onUpdateThreadPinnedNotice={(id, pinnedNotice) => { void run(async () => { await request('/conversations/' + id, 'PATCH', { pinnedNotice }); await refresh(id); }); }}
      onManageGroupParticipants={(id, participantIds) => { void run(async () => { await request('/conversations/' + id, 'PATCH', { participantIds }); await refresh(id); }); }}
      onDeleteMessage={(id, message) => { void run(async () => { await request('/messages/' + message, 'DELETE'); await refresh(id); }); }}
      onTogglePinMessage={(id, message) => { void run(async () => { await request('/messages/' + message + '/decoration', 'POST', { pinned: !messages[id]?.find(m => m.id === message)?.pinned }); await refresh(id); }); }}
      onReact={(message, reaction) => { void run(async () => { await request('/messages/' + message + '/decoration', 'POST', { reaction }); await refresh(); }); }}
      onForwardToTargets={(employees, groups, payload) => { void run(async () => {
        const attachment = await attachmentPayload(payload.attachment,payload.mediaUrl);
        const targets = [...groups];
        for (const employee of employees) targets.push((await request('/conversations', 'POST', { participants: [employee] })).id);
        for (const id of new Set(targets)) await request(`/conversations/${id}/messages`, 'POST', { text: payload.text, ...(attachment ? {attachment} : {}) });
        await refresh();
      }); }}
    />
  </div>;
}

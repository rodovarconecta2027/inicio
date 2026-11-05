import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { jsPDF } from 'jspdf';
import { firebaseTestRuntime } from '../src/server/firebase-test/runtime';
import { createCloudApi } from '../src/server/cloud/api';
import { CloudAuthService, firebasePasswordVerifier, privateIdentifierKey } from '../src/server/cloud/authService';
import {legacyDocumentCatalog} from '../src/server/legacyDocumentCatalog';

export async function verifyRemoteModules(adminSession: { sessionId: string; csrfToken: string }) {
  const runtime = firebaseTestRuntime(); // Refuses real Firebase projects and credentials.
  const verifier = firebasePasswordVerifier({ projectId: 'demo-rodovar-conecta', apiKey: 'emulator-only', emulator: true });
  const sessions = new CloudAuthService(runtime, verifier);
  const actors: Record<string, any> = {};
  for (const [role, profile, department] of [
    ['com', 'COMERCIAL', 'Logística'], ['exp', 'EXPEDICAO', 'Logística'],
    ['mon', 'MONITORAMENTO', 'Logística'], ['other', 'MONITORAMENTO', 'Logística'],
    ['rh', 'RH', 'Recursos Humanos'], ['rh2', 'RH', 'Recursos Humanos'],
    ['dir', 'DIRETORIA', 'Diretoria'], ['fin', 'FINANCEIRO', 'Financeiro'],
  ]) {
    const uid = 'integration-' + role, email = uid + '@example.test', password = crypto.randomBytes(24).toString('base64url');
    await runtime.auth.createUser({ uid, email, password });
    await runtime.db.collection('users').doc(uid).set({ active: true, approvalStatus: 'APROVADO', accessProfile: profile, accessLevel: role === 'dir' ? 'DIRETORIA' : 'FUNCIONARIO' });
    await runtime.db.collection('employee_profiles').doc(uid).set({ name: 'TESTE ' + role, login: uid, department, roleTitle: profile });
    await runtime.db.collection('auth_identifiers').doc(privateIdentifierKey(uid)).set({ uid, email });
    actors[role] = { uid, ...(await sessions.login({ identifier: uid, password })) };
  }
  // Remove only incomplete repository-unit fixtures, exclusively inside the emulator.
  for (const d of (await runtime.db.collection('freight_operations').get()).docs) await d.ref.delete();
  const start = async () => {
    const instance = createCloudApi(runtime, { passwordVerifier: verifier }).listen(0, '127.0.0.1');
    await new Promise<void>(r => instance.once('listening', r)); return instance;
  };
  let server = await start();
  let base = `http://127.0.0.1:${(server.address() as any).port}/api/cloud`;
  const call = async (role: string, path: string, body?: any, method = body === undefined ? 'GET' : 'POST', status = 200, key = crypto.randomUUID()) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-Rodovar-Session': actors[role].sessionId, 'X-CSRF-Token': actors[role].csrfToken, 'X-Idempotency-Key': key }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json();
    assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(data)}`); return data;
  };
  try {
    const create = { cliente: 'TESTE INTEGRAÇÃO', origemCidadeUf: 'Salvador / BA', destinoCidadeUf: 'Recife / PE', enderecoColeta: 'Rua de Teste, 10', tipoCarga: 'Carga de teste', dataColetaIso: '2026-11-03', valorCobradoClienteCentavos: 20000, confirmAndSendToExpedicao: true, expedicaoResponsavelId: actors.exp.uid };
    const key = crypto.randomUUID();
    let f = (await call('com', '/meus-fretes', create, 'POST', 201, key)).freight;
    assert.ok(f?.id); assert.equal((await call('com', '/meus-fretes', create, 'POST', 201, key)).freight.id, f.id);
    await call('mon', '/meus-fretes', create, 'POST', 403);
    f = (await call('exp', `/meus-fretes/${f.id}/operational`, { baseRevision: f.revision, pesoKg: 1000, volumes: 2, veiculoNecessario: 'Carreta', motoristaNome: 'Motorista Teste', motoristaCpf: '12345678901', motoristaTelefone: '11999999999', transportadorNome: 'Transportador Teste', placaVeiculo: 'ABC1234', valorContratadoCentavos: 10000, condicoesPagamento: 'Integral (100%)', condicoesOperacionais: 'Contrato de teste', checklistFechamento: { motoristaConfirmado: true, veiculoConfirmado: true, condicoesConferidas: true, documentosConferidos: true } }, 'PUT')).freight;
    for (const action of ['REGISTRAR_VIDEOCHAMADA', 'EMITIR_ORDEM', 'CONFIRMAR_ENVIO_ORDEM_MOTORISTA', 'LIBERAR_PARA_MONITORAMENTO']) {
      const body = { action, baseRevision: f.revision, monitoramentoResponsavelId: actors.mon.uid }, actionKey = crypto.randomUUID();
      const result = await call('exp', `/meus-fretes/${f.id}/expedicao-action`, body, 'POST', 200, actionKey);
      assert.deepEqual(await call('exp', `/meus-fretes/${f.id}/expedicao-action`, body, 'POST', 200, actionKey), result); f = result.freight;
    }
    assert.equal(f.situacaoOperacional, 'LIBERADO_MONITORAMENTO');
    assert.equal((await runtime.db.collection('freight_operations').get()).size, 1);
    const notifications = (await runtime.db.collection('freight_notifications').get()).docs.map(d => d.data());
    assert.ok(notifications.some(n => n.recipientId === actors.fin.uid));
    const financial = (await call('fin', '/pagamentos/fretes')).freights.find((r: any) => r.id === f.id);
    assert.equal(financial.valorTotal, 100); assert.equal(financial.adiantamentoPago, false);
    await call('dir', '/pagamentos/fretes', { freight: financial }, 'POST', 403);
    await call('mon', `/meus-fretes/${f.id}/monitoramento-action`, { action: 'AVANCAR_ETAPA', targetStage: 'FINALIZADO', baseRevision: f.revision }, 'POST', 409);
    f = (await call('mon', `/meus-fretes/${f.id}/monitoramento-action`, { action: 'REGISTRAR_LOCALIZACAO_ORIENTACAO', enderecoEntrega: 'Endereço fictício de entrega, 100', baseRevision: f.revision })).freight;
    for (const targetStage of ['EM_DESLOCAMENTO_COLETA', 'NO_LOCAL_COLETA', 'CARREGADO_EM_TRANSPORTE', 'NO_LOCAL_ENTREGA', 'ENTREGUE']) {
      f = (await call('mon', `/meus-fretes/${f.id}/monitoramento-action`, { action: 'AVANCAR_ETAPA', targetStage, baseRevision: f.revision })).freight;
    }
    await call('mon', `/meus-fretes/${f.id}/monitoramento-action`, { action: 'AVANCAR_ETAPA', targetStage: 'FINALIZADO', baseRevision: f.revision }, 'POST', 400);

    const document = new jsPDF();
    document.text('TESTE: comprovante de entrega fictício', 10, 15);
    const pdf = Buffer.concat([Buffer.from(document.output('arraybuffer')), Buffer.from(('% Arquivo de teste de integracao\n').repeat(19000))]);
    const uploadPath = '/meus-fretes/' + f.id + '/attachments';
    const proofUpload = { category: 'COMPROVANTE_ENTREGA', fileName: 'comprovante-teste.pdf', dataUrl: 'data:application/pdf;base64,' + pdf.toString('base64') };
    await call('rh', uploadPath, proofUpload, 'POST', 403);
    await call('mon', uploadPath, { ...proofUpload, dataUrl: 'data:application/pdf;base64,' + Buffer.from('<html>invalido</html>').toString('base64') }, 'POST', 400);
    const uploadKey = crypto.randomUUID();
    const uploaded = await call('mon', uploadPath, proofUpload, 'POST', 201, uploadKey);
    assert.equal((await call('mon', uploadPath, proofUpload, 'POST', 201, uploadKey)).attachment.id, uploaded.attachment.id);
    assert.equal(uploaded.attachment.conferido, false);
    f = uploaded.freight;
    const proofPath = uploadPath + '/' + uploaded.attachment.id;
    await call('rh', proofPath + '/download', undefined, 'GET', 403);
    const readFile = () => fetch(base + proofPath + '/download', { headers: { 'X-Rodovar-Session': actors.mon.sessionId } });
    const download = await readFile();
    assert.equal(download.status, 200);
    assert.equal(download.headers.get('content-type'), 'application/pdf');
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), pdf);
    await call('mon', '/meus-fretes/' + f.id + '/monitoramento-action', { action: 'AVANCAR_ETAPA', targetStage: 'FINALIZADO', baseRevision: f.revision }, 'POST', 400);
    f = (await call('mon', proofPath + '/verify', { conferido: true })).freight;
    const temporary = await call('mon', uploadPath, { ...proofUpload, category: 'OUTRO' }, 'POST', 201);
    f = (await call('mon', uploadPath + '/' + temporary.attachment.id, undefined, 'DELETE')).freight;
    await call('mon', uploadPath + '/' + temporary.attachment.id + '/download', undefined, 'GET', 404);
    assert.equal((await runtime.db.collection('system_settings').doc('freight_file_usage').get()).data()?.bytes, pdf.length);
    f = (await call('mon', `/meus-fretes/${f.id}/monitoramento-action`, { action: 'AVANCAR_ETAPA', targetStage: 'FINALIZADO', baseRevision: f.revision })).freight;
    assert.equal(f.situacaoMonitoramento, 'FINALIZADO');
    assert.equal((await call('fin', '/pagamentos/fretes')).freights.find((r: any) => r.id === f.id).adiantamentoPago, false);
    const request = (await call('mon', '/requests', { subject: 'TESTE protocolo', description: 'Solicitação fictícia isolada', targetDepartment: 'Recursos Humanos', attachment: { name: 'solicitacao-teste.pdf', dataUrl: proofUpload.dataUrl } }, 'POST', 201)).request;
    assert.ok(!(await call('other', '/requests')).requests.some((r: any) => r.id === request.id));
    for (const rh of ['rh', 'rh2']) assert.ok((await call(rh, '/requests')).notifications.some((n: any) => n.targetId === request.id));
    await call('rh', `/requests/${request.id}/claim`, {});
    await call('rh2', `/requests/${request.id}/claim`, {}, 'POST', 409);
    const reply = await call('rh', `/requests/${request.id}/response`, {
      note: 'Resposta de teste persistida', attachment: { name: 'resposta-teste.pdf', dataUrl: proofUpload.dataUrl },
    });
    const requestDownloadPath = '/requests/' + request.id + '/attachments/' + reply.request.attachments[1].id;
    await call('other', requestDownloadPath, undefined, 'GET', 404);
    const downloadRequestFile = () => fetch(base + requestDownloadPath, { headers: { 'X-Rodovar-Session': actors.mon.sessionId } });
    const replyFile = await downloadRequestFile();
    assert.equal(replyFile.status, 200);
    assert.deepEqual(Buffer.from(await replyFile.arrayBuffer()), pdf);
    await call('rh', `/requests/${request.id}/status`, { status: 'Concluída' });
    await call('mon', '/rh-external', undefined, 'GET', 403);
    const external = (await call('rh', '/rh-external', {
      clientName: 'TESTE cliente externo', document: '52998224725', service: 'Serviço de teste',
      reference: 'TESTE 001', amountCents: 500, dueDate: '2026-12-10',
    }, 'POST', 201)).request;
    await call('rh', `/rh-external/${external.id}/action`, { action: 'ANALYZE' });
    await call('rh', `/rh-external/${external.id}/action`, { action: 'ISSUE' }, 'POST', 503);
    assert.equal((await call('rh2', '/rh-external')).requests.find((r: any) => r.id === external.id).status, 'Análise');
    await call('mon', '/profile', { name: 'TESTE nome atualizado', phoneExt: '123' }, 'PUT');
    assert.equal((await call('mon', '/auth/session')).user.name, 'TESTE nome atualizado');
    assert.equal((await runtime.auth.getUser(actors.mon.uid)).displayName, 'TESTE nome atualizado');
    await call('mon', '/profile', { accessLevel: 'ADMINISTRADOR' }, 'PUT', 400);
    await call('mon', '/admin/access-requests', undefined, 'GET', 403);
    const event = await call('dir', '/agenda', { title: 'TESTE reunião', description: 'Evento fictício', category: 'Reunião', dateIso: '2026-12-01', start: '09:00', end: '10:00', allDay: false, location: 'Ambiente de teste', organizer: 'TESTE dir', department: 'Diretoria', invitees: [actors.mon.uid], sectors: [], priority: 'Normal', visibility: 'Convidados', attachments: [], recurrence: 'Nenhuma', requireRsvp: true });
    await call('mon', `/agenda/${event.id}/rsvp`, { response: 'Confirmado' });
    await call('mon', `/agenda/${event.id}/cancel`, {}, 'POST', 403);
    await call('dir', `/agenda/${event.id}/cancel`, {});
    const announcement = (await call('dir', '/mural', { title: 'TESTE comunicado', content: 'Conteúdo de teste isolado', category: 'Comunicado Geral', priority: 'Normal', targetAudience: 'Todos', attachments: [], requireReadConfirmation: true }, 'POST', 201)).announcement;
    for (const action of ['READ', 'LIKE', 'COMMENT']) await call('mon', `/mural/${announcement.id}/action`, { action, text: 'Comentário de teste' });
    const mural = (await call('dir', '/mural')).announcements.find((a: any) => a.id === announcement.id);
    assert.equal(mural.comments.length, 1); assert.equal(mural.likes.length, 1); assert.equal(mural.readReceipts.length, 1);
    const image = 'data:image/png;base64,' + Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]).toString('base64');
    const publicationBody = { title: 'TESTE comunicado privado', content: 'Arquivos duráveis', category: 'Diretoria', priority: 'Normal', targetAudience: 'Diretoria', attachments: [{name:'documento.pdf',dataUrl:proofUpload.dataUrl}], coverImage:image };
    const publicationKey = crypto.randomUUID();
    const publication = (await call('dir', '/mural', publicationBody, 'POST', 201, publicationKey)).announcement;
    assert.equal((await call('dir', '/mural', publicationBody, 'POST', 201, publicationKey)).announcement.id, publication.id);
    assert.equal(publication.coverImage, image);
    assert.ok(!publication.attachments[0].privateAsset);
    const storedMural = (await runtime.db.collection('portal_modules').doc('mural').get()).data()!;
    assert.ok(!JSON.stringify(storedMural).includes('data:image/'));
    assert.ok(storedMural.announcements.find((a:any)=>a.id===publication.id).attachments[0].privateAsset);
    const muralFilePath = `/mural/${publication.id}/attachments/${publication.attachments[0].id}`;
    await call('mon', muralFilePath, undefined, 'GET', 404);
    const fileResponse = await fetch(base + muralFilePath, {headers:{'X-Rodovar-Session':actors.dir.sessionId}});
    assert.equal(fileResponse.status, 200); assert.deepEqual(Buffer.from(await fileResponse.arrayBuffer()), pdf);
    await call('dir', '/mural', {...publicationBody,coverImage:{$rodovarPrivateFile:{}}}, 'POST', 400);
    const rhDocument = await call('rh', `/rh-external/${external.id}/documents`, {name:'documento.pdf',dataUrl:proofUpload.dataUrl}, 'POST', 201);
    const rhPath = `/rh-external/${external.id}/documents/${rhDocument.request.documents[0].id}`;
    await call('mon', rhPath, undefined, 'GET', 403);
    const rhFile = await fetch(base + rhPath, {headers:{'X-Rodovar-Session':actors.rh2.sessionId}});
    assert.equal(rhFile.status, 200); assert.deepEqual(Buffer.from(await rhFile.arrayBuffer()), pdf);
    await call('mon', '/customer-covers', {customer:'TESTE cliente',dataUrl:image}, 'PUT');
    assert.equal((await call('mon', '/customer-covers')).covers[0].dataUrl, image);
    await call('com', '/customer-covers', {customer:'TESTE cliente',dataUrl:image}, 'PUT', 403);
    const attachedEvent = await call('dir','/agenda',{title:'TESTE agenda com anexo',category:'Reunião',dateIso:'2026-12-02',allDay:true,visibility:'Convidados',invitees:[actors.mon.uid],sectors:[],attachments:[{name:'agenda.pdf',dataUrl:proofUpload.dataUrl}]});
    assert.equal((await call('mon','/agenda')).events.find((e:any)=>e.id===attachedEvent.id).attachments[0].dataUrl,proofUpload.dataUrl);
    assert.ok(!(await call('other','/agenda')).events.some((e:any)=>e.id===attachedEvent.id));
    assert.ok(!JSON.stringify((await runtime.db.collection('portal_modules').doc('agenda').get()).data()).includes('data:application/pdf'));
    const poll = await call('dir', '/mural-polls', { question: 'TESTE enquete', options: ['Opção A', 'Opção B'], deadline: new Date(Date.now() + 86400000).toISOString(), draft: false });
    assert.equal((await call('mon', `/mural-polls/${poll.id}/vote`, { option: 0 })).total, 1);
    assert.equal((await call('mon', `/mural-polls/${poll.id}/vote`, { option: 0 })).total, 1);
    await call('mon', `/mural-polls/${poll.id}/vote`, { option: 1 }, 'POST', 409);
    const group = await call('mon', '/chat/conversations', { participants: [actors.other.uid], isGroup: true, name: 'TESTE grupo' });
    const message = await call('mon', `/chat/conversations/${group.id}/messages`, { text: 'Mensagem de teste persistida' });
    await call('other', `/chat/messages/${message.id}/decoration`, { reaction: '👍' });
    await call('other', `/chat/conversations/${group.id}`, { pinnedNotice: 'Não autorizado' }, 'PATCH', 403);
    await call('mon', `/chat/conversations/${group.id}`, { pinnedNotice: 'Aviso persistido' }, 'PATCH');
    const mediaKey = crypto.randomUUID(), mediaBody = {text:'Documento privado do chat',attachment:{name:'chat.pdf',dataUrl:proofUpload.dataUrl}};
    const mediaMessage = await call('mon',`/chat/conversations/${group.id}/messages`,mediaBody,'POST',200,mediaKey);
    assert.equal((await call('mon',`/chat/conversations/${group.id}/messages`,mediaBody,'POST',200,mediaKey)).id,mediaMessage.id);
    const messageFilePath = '/chat/messages/'+mediaMessage.id+'/attachment';
    await call('dir',messageFilePath,undefined,'GET',403);
    const mediaFile = await fetch(base+messageFilePath,{headers:{'X-Rodovar-Session':actors.other.sessionId}});
    assert.equal(mediaFile.status,200);assert.deepEqual(Buffer.from(await mediaFile.arrayBuffer()),pdf);
    const mediaPage = await call('other',`/chat/conversations/${group.id}/messages`);
    assert.ok(!JSON.stringify(mediaPage).includes('privateAsset'));
    assert.equal(mediaPage.find((m:any)=>m.id===mediaMessage.id).attachment.url,'/api/cloud'+messageFilePath);
    await call('mon',`/chat/conversations/${group.id}`,{participantIds:[actors.mon.uid,actors.dir.uid]},'PATCH');
    await call('other',messageFilePath,undefined,'GET',403);
    await call('mon',`/chat/conversations/${group.id}`,{participantIds:[actors.mon.uid,actors.other.uid]},'PATCH');
    await call('mon',`/chat/conversations/${group.id}/messages`,{text:'Inválido',attachment:{name:'chat.pdf',dataUrl:'data:application/pdf;base64,'+Buffer.from('<html>inválido</html>').toString('base64')}},'POST',400);
    await new Promise<void>(r => server.close(() => r())); server = await start();
    base = `http://127.0.0.1:${(server.address() as any).port}/api/cloud`;
    assert.equal((await call('dir','/mural')).announcements.find((a:any)=>a.id===publication.id).coverImage,image);
    const reloadedRhFile = await fetch(base+rhPath,{headers:{'X-Rodovar-Session':actors.rh.sessionId}});
    assert.deepEqual(Buffer.from(await reloadedRhFile.arrayBuffer()),pdf);
    assert.equal((await call('mon', `/meus-fretes/${f.id}`)).freight.id, f.id);
    assert.deepEqual(Buffer.from(await (await readFile()).arrayBuffer()), pdf);
    assert.deepEqual(Buffer.from(await (await downloadRequestFile()).arrayBuffer()), pdf);
    assert.equal((await call('mon', '/requests')).requests.find((r: any) => r.id === request.id).status, 'Concluída');
    assert.ok((await call('other', `/chat/conversations/${group.id}/messages`)).some((m:any)=>m.text==='Mensagem de teste persistida'));
    const reloadedMedia = await fetch(base+messageFilePath,{headers:{'X-Rodovar-Session':actors.other.sessionId}});
    assert.deepEqual(Buffer.from(await reloadedMedia.arrayBuffer()),pdf);
    await call('mon','/chat/messages/'+mediaMessage.id,undefined,'DELETE');
    await call('other',messageFilePath,undefined,'GET',404);
    const exportPath = '/admin/backups/operations/export';
    await call('dir', exportPath, {}, 'POST', 403);
    const adminHeaders = { 'Content-Type': 'application/json', 'X-Rodovar-Session': adminSession.sessionId, 'X-CSRF-Token': adminSession.csrfToken };
    const legacy=legacyDocumentCatalog[0],legacyPath='/legacy-documents/'+legacy.id;
    assert.equal((await fetch(base+legacyPath)).status,401);
    await call('mon',legacyPath,undefined,'GET',404);
    const catalog=await fetch(base+'/legacy-documents',{headers:adminHeaders});
    assert.equal(catalog.status,200);assert.equal((await catalog.json()).documents.length,15);
    const legacyFile=await fetch(base+legacyPath,{headers:adminHeaders});
    assert.equal(legacyFile.status,200);assert.equal(legacyFile.headers.get('content-type'),'application/pdf');
    const legacyBytes=Buffer.from(await legacyFile.arrayBuffer());assert.equal(crypto.createHash('sha256').update(legacyBytes).digest('hex'),legacy.sha256);
    await call('dir','/mural',{title:'TESTE documento legado vinculado',content:'Arquivo original preservado',category:'Comunicado Geral',priority:'Normal',targetAudience:'Todos',attachments:[{name:legacy.name,type:'PDF',url:legacy.source}]},'POST',201);
    assert.equal((await fetch(base+legacyPath,{headers:{'X-Rodovar-Session':actors.mon.sessionId}})).status,200);
    const exportResponse = await fetch(base + exportPath, { method: 'POST', headers: adminHeaders });
    assert.equal(exportResponse.status, 200);
    assert.equal(exportResponse.headers.get('cache-control'), 'no-store');
    assert.match(exportResponse.headers.get('content-disposition') || '', /attachment/);
    const json = await exportResponse.text();
    const backup = JSON.parse(json);
    assert.equal(backup.format, 'rodovar-homologation-operations');
    assert.deepEqual(backup.scope, ['freights', 'freightDetails', 'events', 'announcements', 'requests']);
    assert.equal(backup.collections.freights.find((row: any) => row.id === f.id).record.situacaoMonitoramento, 'FINALIZADO');
    assert.ok(backup.collections.freightDetails.some((row: any) => row.id === f.id && row.record.historico.length > 0));
    assert.ok(backup.collections.events.some((row: any) => row.id === event.id && row.cancelled));
    assert.ok(backup.collections.announcements.some((row: any) => row.id === announcement.id && row.comments.length === 1));
    assert.ok(backup.collections.requests.some((row: any) => row.id === request.id && row.status === 'Concluída'));
    assert.ok(!json.includes('Mensagem de teste persistida'));
    assert.ok(!json.includes(external.id));
    const verify = (content: string) => fetch(base + '/admin/backups/operations/validate', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ sha256: crypto.createHash('sha256').update(content).digest('hex') }),
    });
    const verified = await verify(json);
    assert.equal(verified.status, 200);
    assert.deepEqual((await verified.json()).totals, backup.totals);
    assert.equal((await verify(json + ' ')).status, 404);
    const adminCall = async(action:string,body:any,status=200)=>{
      const response=await fetch(base+'/admin/backups/operations/'+action,{method:'POST',headers:adminHeaders,body:JSON.stringify(body)});
      const result=await response.json();assert.equal(response.status,status,JSON.stringify(result));return result;
    };
    await adminCall('preview',{serialized:json+' '},404);
    assert.equal((await adminCall('preview',{serialized:json})).total,0);
    await runtime.db.collection('freight_operations').doc(f.id).delete(); // Disposable emulator fixture only.
    const agendaRef=runtime.db.collection('portal_modules').doc('agenda'),agendaState=(await agendaRef.get()).data()!;
    await agendaRef.update({events:agendaState.events.filter((e:any)=>e.id!==event.id)});
    const muralRef=runtime.db.collection('portal_modules').doc('mural'),muralState=(await muralRef.get()).data()!;
    muralState.announcements.find((a:any)=>a.id===announcement.id).title='TESTE edição posterior preservada';
    await muralRef.set(muralState);
    const plan=await adminCall('preview',{serialized:json});
    assert.equal(plan.missing.freights,1);assert.equal(plan.missing.events,1);assert.ok(plan.conflicts.announcements>=1);
    await adminCall('restore',{serialized:json,planHash:'inválido',confirmation:'RESTORE_MISSING_RECORDS'},409);
    assert.equal((await runtime.db.collection('freight_operations').doc(f.id).get()).exists,false);
    const restoreBody={serialized:json,planHash:plan.planHash,confirmation:'RESTORE_MISSING_RECORDS'};
    const restored=await adminCall('restore',restoreBody);assert.equal(restored.restored.freights,1);
    assert.deepEqual(await adminCall('restore',restoreBody),restored);
    assert.equal((await call('mon',`/meus-fretes/${f.id}`)).freight.id,f.id);
    assert.equal((await call('dir','/mural')).announcements.find((a:any)=>a.id===announcement.id).title,'TESTE edição posterior preservada');
    const slaRequest=(await call('mon','/requests',{subject:'TESTE SLA',description:'Vencimento controlado em emulador',targetDepartment:'Recursos Humanos'},'POST',201)).request;
    const queueRef=runtime.db.collection('portal_modules').doc('requests'),queue=(await queueRef.get()).data()!;
    const oldDue=new Date(Date.now()-60000).toISOString();queue.requests.find((r:any)=>r.id===slaRequest.id).currentDueAtIso=oldDue;
    await queueRef.set(queue);
    await Promise.all([call('rh','/requests'),call('rh2','/requests')]);
    const escalated=(await call('mon','/requests')).requests.find((r:any)=>r.id===slaRequest.id);
    assert.equal(escalated.slaLastEscalatedDueAtIso,oldDue);
    assert.equal(escalated.history.filter((h:any)=>h.action.startsWith('Prazo SLA vencido')).length,1);
    await sessions.logout(actors.mon.sessionId, actors.mon.csrfToken);
    await call('mon', '/meus-fretes', undefined, 'GET', 401);
  } finally { await new Promise<void>(r => server.close(() => r())); }
}

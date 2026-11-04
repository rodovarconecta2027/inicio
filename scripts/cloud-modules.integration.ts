import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { firebaseTestRuntime } from '../src/server/firebase-test/runtime';
import { createCloudApi } from '../src/server/cloud/api';
import { CloudAuthService, firebasePasswordVerifier, privateIdentifierKey } from '../src/server/cloud/authService';

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
    // Explicit emulator-only proof fixture: binary storage itself is not configured remotely.
    const detailsRef = runtime.db.collection('freight_details').doc(f.id);
    await detailsRef.update({ anexos: [{ id: 'TESTE-proof', category: 'COMPROVANTE_ENTREGA', conferido: true, name: 'TESTE-sem-arquivo-real.pdf' }] });
    f = (await call('mon', `/meus-fretes/${f.id}/monitoramento-action`, { action: 'AVANCAR_ETAPA', targetStage: 'FINALIZADO', baseRevision: f.revision })).freight;
    assert.equal(f.situacaoMonitoramento, 'FINALIZADO');
    assert.equal((await call('fin', '/pagamentos/fretes')).freights.find((r: any) => r.id === f.id).adiantamentoPago, false);
    const request = (await call('mon', '/requests', { subject: 'TESTE protocolo', description: 'Solicitação fictícia isolada', targetDepartment: 'Recursos Humanos' }, 'POST', 201)).request;
    assert.ok(!(await call('other', '/requests')).requests.some((r: any) => r.id === request.id));
    for (const rh of ['rh', 'rh2']) assert.ok((await call(rh, '/requests')).notifications.some((n: any) => n.targetId === request.id));
    await call('rh', `/requests/${request.id}/claim`, {});
    await call('rh2', `/requests/${request.id}/claim`, {}, 'POST', 409);
    await call('rh', `/requests/${request.id}/response`, { note: 'Resposta de teste persistida' });
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
    const poll = await call('dir', '/mural-polls', { question: 'TESTE enquete', options: ['Opção A', 'Opção B'], deadline: new Date(Date.now() + 86400000).toISOString(), draft: false });
    assert.equal((await call('mon', `/mural-polls/${poll.id}/vote`, { option: 0 })).total, 1);
    assert.equal((await call('mon', `/mural-polls/${poll.id}/vote`, { option: 0 })).total, 1);
    await call('mon', `/mural-polls/${poll.id}/vote`, { option: 1 }, 'POST', 409);
    const group = await call('mon', '/chat/conversations', { participants: [actors.other.uid], isGroup: true, name: 'TESTE grupo' });
    const message = await call('mon', `/chat/conversations/${group.id}/messages`, { text: 'Mensagem de teste persistida' });
    await call('other', `/chat/messages/${message.id}/decoration`, { reaction: '👍' });
    await call('other', `/chat/conversations/${group.id}`, { pinnedNotice: 'Não autorizado' }, 'PATCH', 403);
    await call('mon', `/chat/conversations/${group.id}`, { pinnedNotice: 'Aviso persistido' }, 'PATCH');
    await new Promise<void>(r => server.close(() => r())); server = await start();
    base = `http://127.0.0.1:${(server.address() as any).port}/api/cloud`;
    assert.equal((await call('mon', `/meus-fretes/${f.id}`)).freight.id, f.id);
    assert.equal((await call('mon', '/requests')).requests.find((r: any) => r.id === request.id).status, 'Concluída');
    assert.equal((await call('other', `/chat/conversations/${group.id}/messages`))[0].text, 'Mensagem de teste persistida');
    const exportPath = '/admin/backups/operations/export';
    await call('dir', exportPath, {}, 'POST', 403);
    const adminHeaders = { 'Content-Type': 'application/json', 'X-Rodovar-Session': adminSession.sessionId, 'X-CSRF-Token': adminSession.csrfToken };
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
    await sessions.logout(actors.mon.sessionId, actors.mon.csrfToken);
    await call('mon', '/meus-fretes', undefined, 'GET', 401);
  } finally { await new Promise<void>(r => server.close(() => r())); }
}

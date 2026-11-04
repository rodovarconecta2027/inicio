import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc } from 'firebase/firestore';
import { firebaseTestRuntime } from '../src/server/firebase-test/runtime';
import { FirestoreChatService, membershipId } from '../src/server/cloud/chat';
import { createCloudApi } from '../src/server/cloud/api';
import { FirestoreFreightStore } from '../src/server/cloud/freightStore';
import { CloudAuthService, firebasePasswordVerifier, privateIdentifierKey } from '../src/server/cloud/authService';
import { bootstrapAdmin } from '../src/server/cloud/bootstrapAdmin';
import { verifyRemoteModules } from './cloud-modules.integration';
import { AUTHORIZED_ROSTER } from '../src/lib/accessPolicy';
import { canConfirmFreightPayment, hasPagePermission } from '../src/lib/permissions';

let protectedAdminSession: { sessionId: string; csrfToken: string };

test('Administrador: provisionamento único, primeiro acesso e revogação', async () => {
  const runtime = firebaseTestRuntime(), uid = 'bootstrap-test';
  const password = crypto.randomBytes(24).toString('base64url');
  await runtime.auth.createUser({ uid, email: uid + '@example.test', password });
  const input = { projectId: 'demo-rodovar-conecta', uid, login: 'admin.test', name: 'Administrador Teste', confirm: `PROVISION:demo-rodovar-conecta:${uid}` };
  await assert.rejects(bootstrapAdmin(runtime, { ...input, projectId: 'production' }));
  const results = await Promise.allSettled([bootstrapAdmin(runtime, input), bootstrapAdmin(runtime, input)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const service = new CloudAuthService(runtime, firebasePasswordVerifier({ projectId: input.projectId, apiKey: 'emulator-only', emulator: true }));
  const session = await service.login({ identifier: input.login, password });
  assert.equal(session.user.mustChangePassword, true);
  await assert.rejects(service.firstPassword(session.sessionId, 'bad', password), { status: 403 });
  await assert.rejects(service.firstPassword(session.sessionId, session.csrfToken, password), { status: 400 });
  const changed = await service.firstPassword(session.sessionId, session.csrfToken, crypto.randomBytes(24).toString('base64url'));
  assert.equal(changed.user.mustChangePassword, false);
  protectedAdminSession = changed;
  await assert.rejects(service.session(session.sessionId), { status: 401 });
  assert.equal((await new CloudAuthService(runtime, async () => { throw Error(); }).session(changed.sessionId)).user.id, uid);

  const staffUid = 'access-lifecycle-test', email = staffUid + '@example.test';
  await runtime.auth.createUser({ uid: staffUid, email, password });
  await runtime.db.collection('users').doc(staffUid).set({ active: true, approvalStatus: 'APROVADO', accessLevel: 'FUNCIONARIO', accessProfile: 'RH' });
  await runtime.db.collection('employee_profiles').doc(staffUid).set({ name: 'TESTE colaborador', department: 'Recursos Humanos', roleTitle: 'RH' });
  await runtime.db.collection('auth_identifiers').doc(privateIdentifierKey(email)).set({ uid: staffUid, email });
  const old = await service.login({ identifier: email, password });
  const server = createCloudApi(runtime, { passwordVerifier: firebasePasswordVerifier({ projectId: input.projectId, apiKey: 'emulator-only', emulator: true }) }).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + (server.address() as { port: number }).port + '/api/cloud/admin';
  const decide = (target: string, action: string, authSession = changed) => fetch(base + '/access-requests/' + target + '/decision', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Rodovar-Session': authSession.sessionId, 'X-CSRF-Token': authSession.csrfToken },
    body: JSON.stringify({ action, accessLevel: 'ADMINISTRADOR', reason: 'TESTE de homologação' }),
  });
  try {
    const authHeaders = (authSession: typeof protectedAdminSession) => ({
      'Content-Type': 'application/json', 'X-Rodovar-Session': authSession.sessionId, 'X-CSRF-Token': authSession.csrfToken,
    });
    const rosterPath = base + '/roster';
    assert.equal((await fetch(rosterPath, { headers: authHeaders(old) })).status, 403);
    const readRoster = async () => {
      const response = await fetch(rosterPath, { headers: authHeaders(changed) });
      assert.equal(response.status, 200);
      return response.json();
    };
    const rosterBefore = await readRoster();
    assert.equal(rosterBefore.administratorPreserved, true);
    assert.equal(rosterBefore.roster.length, 15);
    assert.deepEqual(rosterBefore.roster.map(({ name, profile }: typeof AUTHORIZED_ROSTER[number]) => ({ name, profile })), AUTHORIZED_ROSTER);
    assert.equal(rosterBefore.unlinkedActive, 1);
    const profiles = new Map<string, any>(rosterBefore.roster.map((slot: any) => [slot.profile, slot]));
    const rhSlot = profiles.get('RH'), commercialSlot = profiles.get('COMERCIAL');
    const testUid = 'roster-staff-test', testEmail = testUid + '@example.test';
    await runtime.auth.createUser({ uid: testUid, email: testEmail, password });
    const payload = { uid: testUid, email: testEmail, login: 'roster.staff.test', slot: rhSlot.slot, confirm: true };
    const link = (body: object, authSession = changed) => fetch(rosterPath, {
      method: 'POST', headers: authHeaders(authSession), body: JSON.stringify(body),
    });
    assert.equal((await link(payload, old)).status, 403);
    assert.equal((await link({ ...payload, uid }, changed)).status, 403);
    assert.equal((await link({ ...payload, uid: 'roster-unknown' })).status, 404);
    assert.equal((await link({ ...payload, email: 'wrong@example.test' })).status, 409);
    assert.equal((await link({ ...payload, email: 'staff@rodovar.com.br' })).status, 400);
    const simultaneous = await Promise.all([link(payload), link(payload)]);
    assert.deepEqual(simultaneous.map(response => response.status), [200, 200]);
    assert.equal((await runtime.db.collection('audit_logs').where('action', '==', 'ROSTER_IDENTITY_LINKED').get()).size, 1);
    assert.equal((await link({ ...payload, slot: commercialSlot.slot })).status, 409);
    const extraUid = 'roster-collision-test', extraEmail = extraUid + '@example.test';
    await runtime.auth.createUser({ uid: extraUid, email: extraEmail, password });
    assert.equal((await link({ ...payload, uid: extraUid, email: extraEmail, slot: commercialSlot.slot })).status, 409);
    assert.equal((await link({ ...payload, uid: extraUid, email: extraEmail, login: 'other.staff.test' })).status, 409);

    const temporary = await service.login({ identifier: payload.login, password, rememberMe: true });
    const cloudPath = base.replace(/\/admin$/, '');
    const profilePath = cloudPath + '/profile';
    const change = (body: object, authSession = temporary) => fetch(profilePath, {
      method: 'PUT', headers: authHeaders(authSession), body: JSON.stringify(body),
    });
    assert.equal((await fetch(cloudPath + '/session', { headers: authHeaders(temporary) })).status, 403);
    assert.equal((await readRoster()).roster.find((entry: any) => entry.uid === testUid).mustChangePassword, true);
    const personalPassword = crypto.randomBytes(24).toString('base64url');
    const firstResponse = await change({ password: personalPassword });
    assert.equal(firstResponse.status, 200);
    const first = await firstResponse.json();
    assert.equal(first.user.mustChangePassword, false);
    assert.ok(first.expiresAt - Date.now() > 13 * 86400000);
    await assert.rejects(service.session(temporary.sessionId), { status: 401 });
    await assert.rejects(service.login({ identifier: payload.login, password }), { status: 401 });
    assert.equal((await change({ password: 'new-password-to-test' }, first)).status, 400);
    assert.equal((await change({ currentPassword: 'wrong', password: 'new-password-to-test' }, first)).status, 400);
    const secondDevice = await service.login({ identifier: testEmail, password: personalPassword });
    const nextPassword = crypto.randomBytes(24).toString('base64url');
    const rotate = await Promise.all([
      change({ currentPassword: personalPassword, password: nextPassword }, first),
      change({ currentPassword: personalPassword, password: nextPassword }, first),
    ]);
    const rotatedResponse = rotate.find(response => response.ok);
    assert.equal(rotate.filter(response => response.ok).length, 1);
    const rotated = await rotatedResponse!.json();
    await assert.rejects(service.session(first.sessionId), { status: 401 });
    await assert.rejects(service.session(secondDevice.sessionId), { status: 401 });
    assert.equal((await service.session(rotated.sessionId)).user.id, testUid);
    const applyProfile = (authSession = changed, body: object = { confirm: true }) => fetch(rosterPath + '/' + rhSlot.slot + '/profile', {
      method: 'PATCH', headers: authHeaders(authSession), body: JSON.stringify(body),
    });
    assert.equal((await applyProfile(rotated)).status, 403);
    assert.equal((await applyProfile(changed, { confirm: true, accessLevel: 'ADMINISTRADOR' })).status, 400);
    await runtime.db.collection('users').doc(testUid).update({ accessProfile: 'FINANCEIRO' });
    assert.equal((await readRoster()).roster.find((entry: any) => entry.uid === testUid).profileMatches, false);
    assert.equal((await applyProfile()).status, 200);
    await assert.rejects(service.session(rotated.sessionId), { status: 401 });
    assert.equal((await readRoster()).roster.find((entry: any) => entry.uid === testUid).profileMatches, true);
    assert.equal((await service.login({ identifier: payload.login, password: nextPassword })).user.accessProfile, 'RH');

    const expectedPages = {
      RH: ['solicitacoes'], DIRETORIA: ['fretes_ativos', 'financeiro', 'solicitacoes'],
      MONITORAMENTO: ['fretes_ativos', 'financeiro', 'solicitacoes'], COMERCIAL: ['fretes_comercial'],
      EXPEDICAO: ['fretes_expedicao'], FINANCEIRO: ['fretes_ativos', 'financeiro', 'solicitacoes'],
    };
    const checkedPages = ['administracao', 'fretes_ativos', 'fretes_comercial', 'fretes_expedicao', 'financeiro', 'solicitacoes'];
    for (const [profile, slot] of profiles) {
      const login = 'roster.' + profile.toLowerCase(), email = login + '@example.test';
      if (profile !== 'RH') {
        const uid = 'slot-' + profile;
        await runtime.auth.createUser({ uid, email, password });
        assert.equal((await link({ slot: slot.slot, uid, email, login, confirm: true })).status, 200);
      }
      const account = await service.login(profile === 'RH'
        ? { identifier: payload.login, password: nextPassword }
        : { identifier: login, password });
      assert.deepEqual(checkedPages.filter(page => hasPagePermission(account.user as any, page)), expectedPages[profile as keyof typeof expectedPages]);
      assert.equal(canConfirmFreightPayment(account.user as any), profile === 'FINANCEIRO');
    }

    const brandingPath = base.replace(/\/admin$/, '/system-config');
    const { systemConfig } = await (await fetch(brandingPath)).json();
    const publish = (payload: object, authSession = changed) => fetch(brandingPath + '/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Rodovar-Session': authSession.sessionId, 'X-CSRF-Token': authSession.csrfToken },
      body: JSON.stringify(payload),
    });
    const draft = { ...systemConfig, baseRevision: systemConfig.revision, topHeader: { ...systemConfig.topHeader, focusX: 67 } };
    assert.equal((await publish(draft, old)).status, 403);
    assert.equal((await publish({ ...draft, topHeader: { imageUrl: '/assets/../../private.png' } })).status, 400);
    assert.equal((await publish({ ...draft, welcomeBanner: { items: [] } })).status, 400);
    const concurrent = await Promise.all([publish(draft), publish(draft)]);
    assert.deepEqual(concurrent.map(response => response.status).sort(), [200, 409]);
    const version = await (await fetch(brandingPath + '/version')).json();
    assert.equal(version.revision, systemConfig.revision + 1);
    const newSession = await service.session(changed.sessionId);
    assert.equal(newSession.systemConfig?.topHeader.focusX, 67);
    assert.equal((await runtime.db.collection('audit_logs').where('action', '==', 'SYSTEM_CONFIG_PUBLISHED').get()).size, 1);

    const backupRequest = (action: string, body?: object, authSession = changed) => fetch(base + '/backups/branding/' + action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Rodovar-Session': authSession.sessionId, 'X-CSRF-Token': authSession.csrfToken },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    assert.equal((await backupRequest('export', undefined, old)).status, 403);
    const exported = await backupRequest('export');
    assert.equal(exported.status, 200);
    const backup = await exported.json();
    assert.equal(backup.config.revision, version.revision);
    assert.deepEqual(Object.keys(backup).sort(), ['config', 'format', 'schemaVersion']);
    const changedDraft = { ...draft, baseRevision: version.revision, topHeader: { ...draft.topHeader, focusX: 24 } };
    assert.equal((await publish(changedDraft)).status, 200);
    const tampered = { ...backup, config: { ...backup.config, topHeader: { ...backup.config.topHeader, focusX: 91 } } };
    assert.equal((await backupRequest('validate', { backup: tampered })).status, 400);
    const validation = await backupRequest('validate', { backup });
    assert.equal(validation.status, 200);
    const { currentRevision } = await validation.json();
    assert.equal(currentRevision, version.revision + 1);
    assert.equal((await backupRequest('restore', { backup, baseRevision: currentRevision })).status, 400);
    assert.equal((await backupRequest('restore', { backup, baseRevision: version.revision, confirm: true })).status, 409);
    const restoration = await backupRequest('restore', { backup, baseRevision: currentRevision, confirm: true });
    assert.equal(restoration.status, 200);
    const restored = await restoration.json();
    assert.equal(restored.config.revision, currentRevision + 1);
    assert.equal(restored.config.topHeader.focusX, 67);
    assert.equal((await service.session(changed.sessionId)).user.id, uid);
    assert.equal((await runtime.db.collection('branding_revisions').doc(String(currentRevision)).get()).data()?.topHeader.focusX, 24);
    assert.equal((await runtime.db.collection('audit_logs').where('action', '==', 'BRANDING_BACKUP_RESTORED').get()).size, 1);

    assert.equal((await decide(staffUid, 'SUSPENDER', old)).status, 403);
    assert.equal((await decide(uid, 'SUSPENDER')).status, 403);
    assert.equal((await decide(staffUid, 'SUSPENDER')).status, 200);
    assert.equal((await decide(staffUid, 'APROVAR')).status, 200);
    await assert.rejects(service.session(old.sessionId), { code: 'SESSION_REVOKED' });
    const fresh = await service.login({ identifier: email, password });
    assert.equal(fresh.user.accessLevel, 'FUNCIONARIO');
    assert.equal(fresh.user.accessProfile, 'RH');
    const headers = { 'X-Rodovar-Session': changed.sessionId, 'X-CSRF-Token': changed.csrfToken };
    assert.equal((await fetch(base + '/users/' + uid, { method: 'DELETE', headers })).status, 403);
    for (let i = 0; i < 2; i++) assert.equal((await fetch(base + '/users/' + staffUid, { method: 'DELETE', headers })).status, 200);
    const listing = await (await fetch(base + '/access-requests', { headers })).json();
    assert.ok(!listing.accounts.some((person: { id: string }) => person.id === staffUid));
    assert.equal(listing.decisionsHistory.filter((record: { targetUserId: string }) => record.targetUserId === staffUid).length, 3);
    assert.ok((await runtime.db.collection('employee_profiles').doc(staffUid).get()).exists);
    assert.equal((await decide(staffUid, 'APROVAR')).status, 409);
    await assert.rejects(service.session(fresh.sessionId), { status: 403 });
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('Chat Firestore: dois clientes, isolamento, reenvio, concorrência, leitura e revogação', async () => {
  const { auth, db } = firebaseTestRuntime();
  const service = new FirestoreChatService(db);
  const clients: ReturnType<typeof initializeApp>[] = [];
  const ids = ['cloud-alice', 'cloud-bob', 'cloud-outsider'];
  const stores: ReturnType<typeof getFirestore>[] = [];
  const tokens: string[] = [];
  for (const uid of ids) {
    const email = uid + '@example.test', password = crypto.randomBytes(24).toString('base64url');
    await auth.createUser({ uid, email, password });
    await db.collection('users').doc(uid).set({ active: true, approvalStatus: 'APROVADO', accessProfile: 'MONITORAMENTO' });
    const app = initializeApp({ projectId: 'demo-rodovar-conecta', apiKey: 'emulator-only' }, uid);
    clients.push(app);
    const clientAuth = getAuth(app);
    connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
    const store = getFirestore(app); connectFirestoreEmulator(store, '127.0.0.1', 8080); stores.push(store);
    const credential = await signInWithEmailAndPassword(clientAuth, email, password);
    tokens.push(await credential.user.getIdToken());
    await db.collection('employee_profiles').doc(uid).set({ name: uid, department: 'Logística', roleTitle: 'Monitoramento' });
  }
  const server = createCloudApi({ auth, db }).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;

  try {
    assert.equal((await fetch(base + '/api/cloud/session')).status, 401);
    assert.equal((await fetch(base + '/api/cloud/session', { headers: { Authorization: 'Bearer invalid' } })).status, 401);
    const session = await fetch(base + '/api/cloud/session', { headers: { Authorization: 'Bearer ' + tokens[0] } });
    assert.equal(session.status, 200);
    assert.equal((await session.json()).user.id, ids[0]);
    const input = { participants: [ids[1]], key: 'open-1' };
    const conversation = await service.create(ids[0], input);
    assert.equal((await service.create(ids[1], { participants: [ids[0]], key: 'other-key' })).id, conversation.id);
    await assert.rejects(service.send(ids[2], conversation.id, 'Invasão', 'send-1'), { status: 403 });
    await assert.rejects(getDoc(doc(stores[2], 'conversations', conversation.id)));
    await assert.rejects(setDoc(doc(stores[0], 'users', ids[0]), { accessLevel: 'ADMINISTRADOR' }, { merge: true }));

    const [first, retried] = await Promise.all([
      service.send(ids[0], conversation.id, 'Mensagem persistida', 'one-click'),
      service.send(ids[0], conversation.id, 'Mensagem persistida', 'one-click'),
    ]);
    assert.equal(first.id, retried.id);
    assert.equal((await service.messages(ids[1], conversation.id))[0].id, first.id);

    await assert.rejects(service.send(ids[0], conversation.id, 'Conteúdo diferente', 'one-click'), { status: 409 });
    const concurrent = await Promise.all([service.send(ids[0], conversation.id, 'Segunda', 'second'), service.send(ids[1], conversation.id, 'Terceira', 'third')]);
    assert.deepEqual(concurrent.map(m => (m as any).sequence).sort(), [2, 3]);
    assert.equal((await db.collection('conversations').doc(conversation.id).get()).data()!.messageCount, 3);

    const receipt = await service.read(ids[1], conversation.id, 3);
    assert.equal(receipt.lastReadSequence, 3);
    assert.equal((await service.read(ids[1], conversation.id, 1)).lastReadSequence, 3);
    await assert.rejects(service.read(ids[1], conversation.id, 99));
    assert.equal((await db.collection('message_reads').doc(membershipId(conversation.id, ids[1])).get()).data()!.lastReadSequence, 3);
    await assert.rejects(service.updateMessage(ids[1], first.id, 'Editar outro autor'), { status: 403 });
    await service.updateMessage(ids[0], first.id, 'Mensagem editada');
    assert.equal((await db.collection('messages').doc(first.id).get()).data()!.text, 'Mensagem editada');
    const reloaded = new FirestoreChatService(db);
    assert.equal((await reloaded.create(ids[0], input)).id, conversation.id);
    await assert.rejects(getDoc(doc(stores[0], 'conversations', conversation.id)));
    await assert.rejects(getDoc(doc(stores[1], 'messages', first.id)));
    assert.equal((await service.list(ids[0])).length, 1);
    assert.equal((await service.messages(ids[1], conversation.id)).length, 3);
    assert.equal((await service.messages(ids[1], conversation.id, 2)).length, 1);
    await assert.rejects(service.messages(ids[2], conversation.id), { status: 403 });
    await service.updateMessage(ids[0], first.id, null);
    assert.equal((await db.collection('messages').doc(first.id).get()).data()!.deleted, true);

    const group = await service.create(ids[0], { participants: [ids[1]], isGroup: true, name: 'Grupo de Testes', key: 'group' });
    assert.ok((await db.collection('groups').doc(group.id).get()).exists);
    assert.ok((await db.collection('group_members').doc(membershipId(group.id, ids[1])).get()).exists);
    await db.collection('users').doc(ids[2]).update({ accessProfile: 'COMERCIAL' });
    await assert.rejects(service.create(ids[2], { participants: [ids[0]], key: 'restricted' }), { status: 403 });
    await db.collection('users').doc(ids[1]).update({ active: false });
    assert.equal((await fetch(base + '/api/cloud/session', { headers: { Authorization: 'Bearer ' + tokens[1] } })).status, 403);
    await assert.rejects(service.send(ids[1], conversation.id, 'Conta suspensa', 'fourth'), { status: 403 });
    await assert.rejects(getDoc(doc(stores[1], 'conversations', conversation.id)));
  } finally {

    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await Promise.all(clients.map(deleteApp));
  }
});

test('Repositório Firestore: RDV transacional, reenvio, revisão e identidade preservada', async () => {
  const { db } = firebaseTestRuntime();
  const store = new FirestoreFreightStore(db);
  const operation = (key: string, fingerprint = key) => ({ actorId: 'cloud-test-operator', key, fingerprint });
  await assert.rejects(store.create(operation('no-counter'), () => ({ situacaoOperacional: 'RECEBIDO' })), { status: 503 });
  await db.collection('system_settings').doc('freight_sequence').set({ lastNumber: 1000 });
  const [first, repeated] = await Promise.all([
    store.create(operation('create-one'), () => ({ cliente: 'Cliente Fictício', situacaoOperacional: 'RECEBIDO' })),
    store.create(operation('create-one'), () => ({ cliente: 'Cliente Fictício', situacaoOperacional: 'RECEBIDO' })),
  ]);
  assert.equal(first.id, repeated.id);
  assert.equal(first.protocol, 'RDV-1001');
  await assert.rejects(store.create(operation('create-one', 'different'), () => ({})), { status: 409 });
  const more = await Promise.all([store.create(operation('create-two'), () => ({})), store.create(operation('create-three'), () => ({}))]);
  assert.deepEqual(more.map(f => f.protocol).sort(), ['RDV-1002', 'RDV-1003']);
  assert.equal((await db.collection('freight_operations').get()).size, 3);
  const [changed, retried] = await Promise.all([
    store.update(first.id, 1, operation('update-one'), () => ({ observacoes: 'Teste isolado' })),
    store.update(first.id, 1, operation('update-one'), () => ({ observacoes: 'Teste isolado' })),
  ]);
  assert.equal(changed.revision, 2);
  assert.equal(retried.revision, 2);
  assert.equal(changed.protocol, first.protocol);
  assert.equal(changed.createdAtIso, first.createdAtIso);
  await assert.rejects(store.update(first.id, 1, operation('stale'), () => ({})), { status: 409 });
  await assert.rejects(store.update(first.id, 2, operation('rewrite-id'), () => ({ protocol: 'RDV-999999' })), { status: 400 });
  const afterRestart = new FirestoreFreightStore(db);
  assert.equal((await afterRestart.update(first.id, 1, operation('update-one'), () => ({}))).revision, 2);
});

test('Login corporativo Firebase: sessão persistida, cinco tentativas transacionais, CSRF e suspensão', async () => {
  const runtime = firebaseTestRuntime(), uid = 'cloud-login-test', email = uid + '@example.test';
  const password = crypto.randomBytes(24).toString('base64url');
  await runtime.auth.createUser({ uid, email, password });
  await runtime.db.collection('users').doc(uid).set({ active: true, approvalStatus: 'APROVADO', accessProfile: 'MONITORAMENTO', accessLevel: 'FUNCIONARIO' });
  await runtime.db.collection('employee_profiles').doc(uid).set({ name: 'Funcionário Fictício', login: 'worker.test', department: 'Logística', roleTitle: 'Monitoramento' });
  for (const identifier of ['worker.test', email]) await runtime.db.collection('auth_identifiers').doc(privateIdentifierKey(identifier)).set({ uid, email });
  const verifier = firebasePasswordVerifier({ projectId: 'demo-rodovar-conecta', apiKey: 'emulator-only', emulator: true });
  const service = new CloudAuthService(runtime, verifier);
  const login = await service.login({ identifier: 'worker.test', password });
  assert.equal(login.user.id, uid);
  const saved = await runtime.db.collection('auth_sessions').get();
  assert.ok(saved.docs.some(doc => doc.data().uid === uid && doc.id !== login.sessionId));
  const restarted = new CloudAuthService(runtime, verifier);
  assert.equal((await restarted.session(login.sessionId)).user.id, uid);
  await assert.rejects(restarted.logout(login.sessionId, 'wrong-token'), { status: 403 });
  await restarted.logout(login.sessionId, login.csrfToken);
  await assert.rejects(restarted.session(login.sessionId), { status: 401 });

  const server = createCloudApi(runtime, { passwordVerifier: verifier }).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/cloud/auth`;
  try {
    const response = await fetch(base + '/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: 'worker.test', password }) });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('set-cookie') || '', /HttpOnly/i);
    const httpLogin = await response.json();
    assert.equal((await fetch(base + '/session', { headers: { 'X-Rodovar-Session': httpLogin.sessionId } })).status, 200);
    assert.equal((await fetch(base + '/register', { method: 'POST' })).status, 403);
    await runtime.db.collection('users').doc(uid).update({ active: false });
    assert.equal((await fetch(base + '/session', { headers: { 'X-Rodovar-Session': httpLogin.sessionId } })).status, 403);
    await runtime.db.collection('users').doc(uid).update({ active: true });
    assert.equal((await fetch(base + '/session', { headers: { 'X-Rodovar-Session': httpLogin.sessionId } })).status, 401);
    const failures = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => service.login({ identifier: i % 2 ? email : 'worker.test', password: 'invalid-password' })));
    assert.equal(failures.filter(result => result.status === 'rejected' && result.reason.status === 429).length, 1);
    assert.equal((await service.lockStatus('worker.test')).locked, true);
    assert.equal((await service.lockStatus(email)).locked, true);
    await assert.rejects(service.login({ identifier: email, password }), { status: 429 });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('APIs remotas: fretes, fila RH, agenda, mural e grupos persistentes e backup operacional', () => verifyRemoteModules(protectedAdminSession));

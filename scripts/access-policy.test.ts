import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import { archiveAccount, registerAccountDeletionRoutes } from '../src/server/accountLifecycle';
import express from 'express';
import { PROFILE_MODULES } from '../src/lib/accessPolicy';
import { hasPagePermission, canConfirmFreightPayment, canOperateMonitoring } from '../src/lib/permissions';
import { registerRequestQueue } from '../src/server/requestQueue';

const user = (id:string, accessProfile:any):any => ({id,name:id,login:id,active:true,approvalStatus:'APROVADO',accessLevel:'FUNCIONARIO',department:'Logística',accessProfile});
test('exclusão de cadastro: administrador protegido, sessão revogada, permissão restrita e histórico preservado', async () => {
  const admin={...user('admin',null),accessLevel:'ADMINISTRADOR'};
  const target={...user('target','RH'),passwordHash:'hash-private',passwordSalt:'salt-private'};
  const db:any={users:[admin,target],sessions:{old:{userId:'target'},adminSession:{userId:'admin'}},loginLocks:{'user:target':{}},passwordResetTokens:[{userId:'target'}],auditLogs:[{id:'historico-original'}],accessDecisions:[{targetUserId:'target'}],accessPolicy:{protectedAdminUid:'admin',authorizedUids:['target'],version:1}};
  const app=express();app.use(express.json());let saved=0;
  registerAccountDeletionRoutes(app,(req:any,_res:any,next:any)=>{req.sessionUser={id:req.headers['x-test-user']};next();},db,()=>saved++);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+(server.address() as any).port;
  try {
    assert.equal((await fetch(base+'/api/admin/users/admin',{method:'DELETE',headers:{'x-test-user':'admin'}})).status,409);
    assert.equal((await fetch(base+'/api/admin/users/target',{method:'DELETE',headers:{'x-test-user':'target'}})).status,403);
    assert.equal(db.users.length,2);
    assert.equal((await fetch(base+'/api/admin/users/target',{method:'DELETE',headers:{'x-test-user':'admin'}})).status,200);
    assert.equal(saved,1);assert.equal(db.users.length,1);assert.equal(db.sessions.old,undefined);assert.ok(db.sessions.adminSession);assert.equal(db.passwordResetTokens.length,0);assert.equal(db.accessPolicy.authorizedUids.length,0);
    assert.equal(db.archivedUsers[0].user.id,'target');assert.equal(db.archivedUsers[0].user.passwordHash,undefined);assert.equal(db.archivedUsers[0].user.passwordSalt,undefined);
    assert.ok(db.auditLogs.some((e:any)=>e.id==='historico-original'));assert.equal(db.accessDecisions[0].targetUserId,'target');
    assert.throws(()=>archiveAccount(db,'target','admin','Reenvio'),/não encontrado/);
  } finally {await new Promise<void>(r=>server.close(()=>r()));}
});
test('migração reaplicável preserva UID, credenciais e histórico; recusa administrador errado',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'rodovar-migration-test-'));fs.mkdirSync(path.join(root,'data'));
  const original=fs.readFileSync('data/rodovar-server-db.json','utf8');
  const target=path.join(root,'data/rodovar-server-db.json');fs.writeFileSync(target,original);
  const config=path.resolve('data/access-bindings.json');
  const run=()=>execFileSync(process.execPath,['--import','tsx','scripts/access-migration.ts',config,'--apply'],{env:{...process.env,RODOVAR_DATA_ROOT:root},stdio:'pipe'});
  run();const once=JSON.parse(fs.readFileSync(target,'utf8'));run();const twice=JSON.parse(fs.readFileSync(target,'utf8'));
  assert.deepEqual(twice.users,once.users);assert.deepEqual(twice.auditLogs,once.auditLogs);
  const before=JSON.parse(original).users.find((u:any)=>u.id==='emp-admin-master');
  const after=twice.users.find((u:any)=>u.id===before.id);assert.equal(after.passwordHash,before.passwordHash);assert.equal(after.passwordSalt,before.passwordSalt);
  assert.equal(twice.users.filter((u:any)=>u.accessLevel==='ADMINISTRADOR').length,1);
  const invalid=path.join(root,'invalid.json');fs.writeFileSync(invalid,JSON.stringify({protectedAdminUid:'wrong',protectedAdminLogin:'wrong',bindings:{}}));
  assert.throws(()=>execFileSync(process.execPath,['--import','tsx','scripts/access-migration.ts',invalid,'--apply'],{env:{...process.env,RODOVAR_DATA_ROOT:root},stdio:'pipe'}));
  assert.deepEqual(JSON.parse(fs.readFileSync(target,'utf8')),twice);
});
test('matriz positiva e negativa de todos os perfis; desativação; campos legados não elevam acesso',()=>{
  for (const [profile,modules] of Object.entries(PROFILE_MODULES)) {
    const u=user(profile,profile);
    for(const module of ['inicio','fretes_comercial','fretes_expedicao','fretes_ativos','solicitacoes','financeiro','financeiro_confirmar','administracao']) assert.equal(hasPagePermission(u,module),modules.includes(module),profile+':'+module);
    assert.equal(hasPagePermission({...u,active:false},modules[0]),false);
    assert.equal(hasPagePermission({...u,approvalStatus:'SUSPENSO'},modules[0]),false);
    assert.equal(hasPagePermission({...u,permissoesPaginas:['administracao','fretes_comercial']},'administracao'),false);
    assert.equal(canConfirmFreightPayment(u),profile==='FINANCEIRO');
    assert.equal(canOperateMonitoring(u),profile==='MONITORAMENTO');
  }
  assert.equal(hasPagePermission({...user('u',null),email:'administrador@rodovar.com.br'},'administracao'),false);
});
test('frete único: Comercial → Expedição → Monitoramento; carteira, restrições e financeiro independente',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'rodovar-freight-test-'));
  process.env.RODOVAR_DATA_ROOT=root;
  const {registerUnifiedFreightRoutes}=await import('../src/server/unifiedFreightEngine');
  const users=[user('com1','COMERCIAL'),user('com2','COMERCIAL'),user('exp','EXPEDICAO'),user('mon','MONITORAMENTO'),user('dir','DIRETORIA'),user('fin','FINANCEIRO')];
  const app=express();app.use(express.json());
  registerUnifiedFreightRoutes(app,(req:any,res:any,next:any)=>{req.sessionUser=users.find(u=>u.id===req.headers['x-test-user']);next();},()=>users,()=>{});
  const {registerPaymentReceiptRoutes}=await import('../src/server/paymentReceiptsEngine');
  registerPaymentReceiptRoutes(app,(req:any,_res:any,next:any)=>{req.sessionUser=users.find(u=>u.id===req.headers['x-test-user']);next();},()=>{});
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+(server.address() as any).port;let seq=0;
  const call=async(uid:string,p:string,body?:any,method='POST',key?:string)=>{const r=await fetch(base+'/api/meus-fretes'+p,{method:body?method:'GET',headers:{'Content-Type':'application/json','x-test-user':uid,'x-idempotency-key':key||String(++seq)},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()};};
  const ok=(r:any)=>{assert.ok(r.status<300,JSON.stringify(r));return r.body;};
  try {
    const data={cliente:'Cliente de teste',origemCidadeUf:'Salvador/BA',destinoCidadeUf:'São Paulo/SP',enderecoColeta:'Rua da coleta 123',tipoCarga:'Carga seca',valorCobradoClienteCentavos:100000,pesoKg:1000,volumes:10,veiculoNecessario:'Carreta',confirmAndSendToExpedicao:true};
    const created=ok(await call('com1','',data,'POST','create-unique'));const id=created.freight.id;
    assert.equal(ok(await call('com1','',data,'POST','create-unique')).freight.id,id);
    assert.equal((await call('com2','/'+id)).status,403);
    assert.equal((await call('dir','?area=COMERCIAL')).status,403);
    assert.equal((await call('mon','?area=EXPEDICAO')).status,403);
    ok(await call('exp','/'+id+'/claim',{}));
    const operational={motoristaNome:'Motorista de teste',motoristaCpf:'12345678901',motoristaTelefone:'11999999999',transportadorNome:'Transportador de teste',placaVeiculo:'ABC1234',valorContratadoCentavos:80000,condicoesPagamento:'70% Adiantamento / 30% Saldo',condicoesOperacionais:'Pagamento conforme contrato',checklistFechamento:{motoristaConfirmado:true,veiculoConfirmado:true,condicoesConferidas:true,documentosConferidos:true}};
    assert.equal((await call('exp','/'+id+'/operational',{enderecoEntrega:'Endereço indevido na Expedição'},'PUT')).status,403);
    assert.equal(ok(await call('exp','/'+id)).freight.enderecoEntrega||'', '');
    ok(await call('exp','/'+id+'/operational',operational,'PUT'));
    for(const action of ['REGISTRAR_VIDEOCHAMADA','EMITIR_ORDEM','CONFIRMAR_ENVIO_ORDEM_MOTORISTA','LIBERAR_PARA_MONITORAMENTO']) {
      if(action==='LIBERAR_PARA_MONITORAMENTO') {
        ok(await call('exp','/'+id+'/operational',{condicoesOperacionais:''},'PUT'));
        const blocked=await call('exp','/'+id+'/expedicao-action',{action,monitoramentoResponsavelId:'mon'});
        assert.equal(blocked.status,400);assert.match(JSON.stringify(blocked.body),/Condições operacionais/);
        ok(await call('exp','/'+id+'/operational',{condicoesOperacionais:'Condições acordadas e conferidas'},'PUT'));
      }
      const before=ok(await call('exp','/'+id)).freight;
      const body={action,monitoramentoResponsavelId:'mon',baseRevision:before.revision};
      const first=ok(await call('exp','/'+id+'/expedicao-action',body,'POST','retry-'+action));
      const retry=ok(await call('exp','/'+id+'/expedicao-action',body,'POST','retry-'+action));
      assert.deepEqual(retry,first,'Retry must return the original success, even after revision changes');
      assert.equal(ok(await call('exp','/'+id)).freight.revision,first.freight.revision);
    }
    const released=ok(await call('exp','/'+id));
    const repeated=ok(await call('exp','/'+id+'/expedicao-action',{action:'LIBERAR_PARA_MONITORAMENTO',monitoramentoResponsavelId:'mon',baseRevision:released.freight.revision},'POST','new-click-after-release'));
    assert.equal(repeated.freight.revision,released.freight.revision);
    assert.deepEqual(repeated.historico,released.historico);
    assert.equal((await call('exp','/'+id+'/monitoramento-action',{action:'AVANCAR_ETAPA',targetStage:'EM_DESLOCAMENTO_COLETA'})).status,403);
    ok(await call('mon','/'+id+'/monitoramento-action',{action:'REGISTRAR_LOCALIZACAO_ORIENTACAO',enderecoEntrega:'Rua da entrega, 456, Centro, São Paulo'}));
    for(const targetStage of ['EM_DESLOCAMENTO_COLETA','NO_LOCAL_COLETA','CARREGADO_EM_TRANSPORTE','NO_LOCAL_ENTREGA','ENTREGUE']) ok(await call('mon','/'+id+'/monitoramento-action',{action:'AVANCAR_ETAPA',targetStage}));
    const attachment=ok(await call('mon','/'+id+'/attachments',{category:'COMPROVANTE_ENTREGA',label:'Entrega',fileName:'entrega.pdf',dataUrl:'data:application/pdf;base64,'+Buffer.from('%PDF-1.4\nDocumento de teste para comprovante de entrega\n%%EOF').toString('base64')}));
    const attId=attachment.anexos.at(-1).id;
    ok(await call('mon','/'+id+'/attachments/'+attId+'/verify',{}));
    const closed=ok(await call('mon','/'+id+'/monitoramento-action',{action:'AVANCAR_ETAPA',targetStage:'FINALIZADO'}));
    assert.equal(closed.freight.situacaoMonitoramento,'FINALIZADO');assert.notEqual(closed.freight.situacaoFinanceira,'QUITADO');
    assert.equal(ok(await call('com1','/'+id)).freight.situacaoMonitoramento,'FINALIZADO');
    assert.equal(ok(await call('exp','/'+id)).freight.situacaoMonitoramento,'FINALIZADO');
    const financial=await fetch(base+'/api/pagamentos/fretes',{headers:{'x-test-user':'fin'}});assert.equal(financial.status,200);
    const projected=(await financial.json()).freights.filter((f:any)=>f.id===id);assert.equal(projected.length,1);assert.equal(projected[0].code,created.freight.protocol);assert.equal(projected[0].valorTotal,800);assert.equal(projected[0].adiantamentoPago,false);assert.equal(projected[0].saldoPago,false);
    const notices=JSON.parse(fs.readFileSync(path.join(root,'data/freights-store/_notifications.json'),'utf8')).filter((n:any)=>n.recipientId==='fin'&&n.targetId===id);
    assert.equal(notices.filter((n:any)=>n.dedupeKey==='finance-new:'+id).length,1);assert.equal(notices.filter((n:any)=>n.dedupeKey==='finance-installment:'+id+':ADIANTAMENTO').length,1);assert.equal(notices.filter((n:any)=>n.dedupeKey==='finance-installment:'+id+':SALDO').length,1);
    const saved=JSON.parse(fs.readFileSync(path.join(root,'data/freights-store',id+'.json'),'utf8'));
    assert.equal(saved.comercialResponsavelId,'com1');assert.equal(saved.expedicaoResponsavelId,'exp');assert.equal(saved.monitoramentoResponsavelId,'mon');
  } finally {await new Promise<void>(r=>server.close(()=>r()));delete process.env.RODOVAR_DATA_ROOT;}
});
test('RH: duas notificações, fila compartilhada, claim concorrente, isolamento, reenvio e persistência',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'rodovar-queue-test-'));
  process.env.RODOVAR_DATA_ROOT=root;
  const users=[user('rh1','RH'),user('rh2','RH'),user('dir','DIRETORIA'),user('com','COMERCIAL')];
  const app=express();app.use(express.json());
  registerRequestQueue(app,(req:any,res:any,next:any)=>{req.sessionUser=users.find(u=>u.id===req.headers['x-test-user']);if(!req.sessionUser)return res.sendStatus(401);next();},()=>users);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+(server.address() as any).port;
  const call=async(uid:string,p:string,body?:any,key='request-1')=>{const r=await fetch(base+p,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','x-test-user':uid,'x-idempotency-key':key},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()};};
  try {
    const data={subject:'Atendimento RH',description:'Solicitação confidencial',targetDepartment:'Administrativo'};
    const created=await call('dir','/api/requests',data);assert.equal(created.status,201);
    const id=created.body.request.id;
    const again=await call('dir','/api/requests',data);assert.equal(again.body.request.id,id);
    for(const uid of ['rh1','rh2']) {const queue=await call(uid,'/api/requests');assert.equal(queue.body.requests.length,1);assert.equal(queue.body.notifications.length,1);}
    assert.equal((await call('com','/api/requests')).status,403);
    const claims=await Promise.all(['rh1','rh2'].map(uid=>call(uid,`/api/requests/${id}/claim`,{})));
    assert.deepEqual(claims.map(r=>r.status).sort(),[200,409]);
    const winner=claims[0].status===200?'rh1':'rh2';
    const loser=winner==='rh1'?'rh2':'rh1';
    assert.equal((await call(loser,`/api/requests/${id}/status`,{status:'Em andamento'})).status,403);
    const originalDue=created.body.request.originalDueAtIso;
    assert.equal((await call(winner,`/api/requests/${id}/extend`,{hours:24,note:'Aguardando documento complementar'})).status,200);
    const reply={note:'Documento enviado para análise',attachment:{name:'comprovante.pdf',dataUrl:'data:application/pdf;base64,'+Buffer.from('%PDF-1.4\nComprovante de teste\n%%EOF').toString('base64')}};
    const response=await call('dir',`/api/requests/${id}/response`,reply,'reply-1');
    assert.equal(response.status,200);
    assert.equal((await call('dir',`/api/requests/${id}/response`,reply,'reply-1')).body.request.history.length,response.body.request.history.length);
    const attachmentId=response.body.request.attachments[0].id;
    const download=await fetch(base+`/api/requests/${id}/attachments/${attachmentId}`,{headers:{'x-test-user':winner}});
    assert.equal(download.status,200);assert.match(await download.text(),/^%PDF-/);
    const denied=await fetch(base+`/api/requests/${id}/attachments/${attachmentId}`,{headers:{'x-test-user':'com'}});assert.equal(denied.status,404);
    assert.equal((await call('rh1',`/api/requests/${id}/read`,{})).status,200);
    assert.equal((await call(winner,`/api/requests/${id}/status`,{status:'Concluída'})).status,200);
    const persisted=JSON.parse(fs.readFileSync(path.join(root,'data/requests-server.json'),'utf8'));
    assert.equal(persisted.requests.length,1);assert.equal(persisted.requests[0].status,'Concluída');
    assert.equal(persisted.requests[0].originalDueAtIso,originalDue);
    assert.equal(Date.parse(persisted.requests[0].currentDueAtIso)-Date.parse(originalDue),24*3600000);
    assert.ok(persisted.requests[0].completedAtIso);
    assert.equal(persisted.requests[0].attachments.length,1);
    assert.ok(persisted.notifications.filter((n:any)=>n.recipientId==='rh1').every((n:any)=>n.read));
    assert.equal((await call(winner,`/api/requests/${id}/response`,{note:'Não alterar histórico encerrado'},'reply-2')).status,409);
  } finally {await new Promise<void>(r=>server.close(()=>r()));delete process.env.RODOVAR_DATA_ROOT;}
});

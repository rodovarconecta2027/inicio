import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import express from 'express';
import {registerExternalRh, type RhBillingProvider} from '../src/server/externalRh';

test('RH externo: isolamento, persistência cifrada, idempotência, documentos e bloqueio bancário sem provedor',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rodovar-rh-ext-'));process.env.RODOVAR_DATA_ROOT=root;
 const make=()=>{const app=express();app.use(express.json({verify:(req:any,_res,b)=>{req.rawBody=b;}}));registerExternalRh(app,(req:any,_res:any,next:any)=>{const profile=req.headers['x-profile'];req.sessionUser={id:'test-'+profile,name:'Teste RH',accessProfile:profile,active:true,approvalStatus:'APROVADO',accessLevel:profile==='ADMIN'?'ADMINISTRADOR':'FUNCIONARIO'};next();});return app;};
 const server=make().listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base='http://127.0.0.1:'+(server.address() as any).port;
 const call=(profile:string,url='',body?:any,key='new')=>fetch(base+'/api/rh-external'+url,{method:body?'POST':'GET',headers:{'x-profile':profile,'Content-Type':'application/json','x-idempotency-key':key},body:body?JSON.stringify(body):undefined});
 const input={clientName:'Cliente de teste isolado',document:'52998224725',email:'teste@example.com',service:'Serviço de teste',reference:'TEST-ONLY',amountCents:45001,dueDate:'2027-12-01'};
 try{
  for(const p of ['ADMIN','FINANCEIRO','COMERCIAL','MONITORAMENTO'])assert.equal((await call(p)).status,403);
  const first=await call('RH','',input);assert.equal(first.status,201);const record=(await first.json()).request;
  assert.equal((await (await call('RH','',input)).json()).request.id,record.id);
  assert.equal((await call('RH','',{...input,amountCents:100})).status,409);
  assert.equal((await call('RH','',input,'other-key')).status,409);
  assert.equal((await call('RH','/'+record.id+'/action',{action:'PAID'})).status,409);
  assert.equal((await call('RH','/'+record.id+'/action',{action:'COMPLETE'})).status,409);
  assert.equal((await call('RH','/'+record.id+'/action',{action:'ANALYZE'})).status,200);
  assert.equal((await call('RH','/'+record.id+'/action',{action:'ISSUE'})).status,503);
  assert.equal((await call('RH','/webhook',{status:'PAID',chargeId:'forged'})).status,503);
  const upload={name:'comprovante.pdf',dataUrl:'data:application/pdf;base64,'+Buffer.from('%PDF-1.4\nOnly isolated test\n%%EOF').toString('base64'),kind:'Comprovante'};
  const uploaded=(await (await call('RH','/'+record.id+'/documents',upload)).json()).request;
  assert.equal(uploaded.status,'Análise');assert.equal(uploaded.bankConfirmation,undefined);
  const doc=uploaded.documents[0];assert.equal((await call('COMERCIAL','/'+record.id+'/documents/'+doc.id)).status,403);
  const downloaded=await call('RH','/'+record.id+'/documents/'+doc.id);assert.equal(downloaded.status,200);assert.ok((await downloaded.text()).startsWith('%PDF-'));
  const encrypted=fs.readFileSync(path.join(root,'data/rh-external/records.enc'));assert.ok(!encrypted.includes(Buffer.from(input.document)));assert.ok(!encrypted.includes(Buffer.from(input.clientName)));
  const restored=make().listen(0,'127.0.0.1');await new Promise<void>(r=>restored.once('listening',r));try{const result=await fetch('http://127.0.0.1:'+(restored.address() as any).port+'/api/rh-external',{headers:{'x-profile':'RH'}});const data=await result.json();assert.equal(data.requests.length,1);assert.equal(data.requests[0].documents.length,1);assert.equal(data.requests[0].amountCents,45001);}finally{await new Promise<void>(r=>restored.close(()=>r()));}
 }finally{await new Promise<void>(r=>server.close(()=>r()));delete process.env.RODOVAR_DATA_ROOT;}
});

test('contrato bancário: webhook exige verificação, consulta bancária, valor exato e proteção contra replay',async()=>{
 process.env.RODOVAR_DATA_ROOT=fs.mkdtempSync(path.join(os.tmpdir(),'rodovar-rh-bank-test-'));
 let paid=false,validAmount=true,issues=0;
 const provider:RhBillingProvider={name:'ADAPTER_TEST_ONLY',issue:async()=>{issues++;return{id:'test-charge',pdf:Buffer.from('%PDF-1.4\nTest\n%%EOF')};},lookup:async()=>({id:'test-charge',status:paid?'PAID':'OPEN',amountCents:12345,paidAmountCents:validAmount?12345:1,currency:'BRL',paidAt:new Date().toISOString()}),verifyWebhook:async(_raw,headers)=>{if(headers['x-test-signature']!=='valid')throw Error('Invalid test signature');return{eventId:'test-event',chargeId:'test-charge'};}};
 const app=express();app.use(express.json({verify:(req:any,_res,b)=>{req.rawBody=b;}}));registerExternalRh(app,(req:any,_res:any,next:any)=>{req.sessionUser={id:'test-rh',name:'Teste',accessProfile:'RH',accessLevel:'FUNCIONARIO',active:true,approvalStatus:'APROVADO'};next();},provider);
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base='http://127.0.0.1:'+(server.address() as any).port+'/api/rh-external';
 const call=(suffix:string,body:any,signature='invalid')=>fetch(base+suffix,{method:'POST',headers:{'Content-Type':'application/json','x-idempotency-key':'test','x-test-signature':signature},body:JSON.stringify(body)});
 try{const r=(await (await call('',{clientName:'Teste isolado',document:'52998224725',service:'Teste',reference:'BANK-TEST',amountCents:12345,dueDate:'2027-12-01'})).json()).request;
  await call('/'+r.id+'/action',{action:'ANALYZE'});await call('/'+r.id+'/action',{action:'ISSUE'});await call('/'+r.id+'/action',{action:'ISSUE'});assert.equal(issues,1);
  assert.equal((await call('/webhook',{status:'PAID'})).status,401);
  paid=true;validAmount=false;assert.equal((await call('/webhook',{},'valid')).status,401);
  validAmount=true;assert.equal((await call('/webhook',{},'valid')).status,200);assert.equal((await call('/webhook',{},'valid')).status,200);
  const data=await (await fetch(base)).json();assert.equal(data.requests[0].status,'Pago');assert.equal(data.requests[0].history.filter((h:any)=>h.action.includes('Pagamento confirmado')).length,1);
  assert.equal((await call('/'+r.id+'/action',{action:'COMPLETE'})).status,200);
 }finally{await new Promise<void>(r=>server.close(()=>r()));delete process.env.RODOVAR_DATA_ROOT;}
});

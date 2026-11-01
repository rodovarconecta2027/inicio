import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import {registerMural} from '../src/server/mural';
import {muralClientKey} from '../src/lib/muralClientKey';
const person=(id:string,profile:string,department:string,level='FUNCIONARIO'):any=>({id,name:id,department,accessProfile:profile,accessLevel:level,active:true,approvalStatus:'APROVADO'});
test('Mural: publicação, rascunho, edição, arquivo/restauração, público, notificações, anexos, leitura e persistência sem duplicação',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rodovar-mural-test-'));process.env.RODOVAR_DATA_ROOT=root;
 const users=[person('admin','','Administrativo','ADMINISTRADOR'),person('director','DIRETORIA','Diretoria','DIRETORIA'),person('monitor','MONITORAMENTO','Logística'),person('finance','FINANCEIRO','Financeiro'),person('sales','COMERCIAL','Logística')];
 const database:any={users},file=path.join(root,'main-database.json');let saves=0;
 const make=(db:any)=>{const app=express();app.use(express.json());registerMural(app,(req:any,_res:any,next:any)=>{req.sessionUser=users.find(u=>u.id===req.headers['x-test-user']);next();},db,()=>{fs.writeFileSync(file,JSON.stringify(db));saves++;},[]);return app;};
 const server=make(database).listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base='http://127.0.0.1:'+(server.address() as any).port;
 const call=async(user:string,url='',body?:any,key='key')=>{const response=await fetch(base+'/api/mural'+url,{method:body?'POST':'GET',headers:{'x-test-user':user,'x-idempotency-key':key,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return{status:response.status,data:await response.json()};};
 const input={title:'Publicação em teste isolado',content:'Conteúdo completo de teste\nSegunda linha.',summary:'Resumo',category:'Operacional',priority:'Importante',targetAudience:'Logística',pinned:true,featured:true,requireReadConfirmation:true,draft:true,attachments:[{name:'teste.pdf',type:'PDF',dataUrl:'data:application/pdf;base64,'+Buffer.from('%PDF-1.4\nTest only\n%%EOF').toString('base64')}]};
 try{
  assert.equal((await call('sales')).status,403);
  assert.equal((await call('monitor','',input)).status,403);
  const draft=await call('admin','',input);assert.equal(draft.status,201);const id=draft.data.announcement.id;
  assert.equal((await call('monitor')).data.announcements.length,0);assert.equal(database.mural.notifications.length,0);
  const publication={...input,id,draft:false,attachments:draft.data.announcement.attachments};
  assert.equal((await call('admin','',publication,'publish')).status,201);
  assert.equal((await call('admin','',publication,'publish')).status,200);
  assert.equal(database.mural.announcements.length,1);assert.equal(database.mural.notifications.length,1);assert.equal(database.mural.notifications[0].recipientId,'monitor');
  const financeView=await call('finance');if(financeView.status===200)assert.equal(financeView.data.announcements.length,0);else assert.equal(financeView.status,403);
  let fetched=await call('monitor');assert.equal(fetched.data.announcements[0].readReceipts.length,0);
  await call('monitor','/'+id+'/action',{action:'READ'});await call('monitor','/'+id+'/action',{action:'READ'});
  assert.equal(database.mural.announcements[0].readReceipts.length,1);assert.equal(database.mural.notifications[0].read,true);
  assert.equal((await call('monitor','/'+id+'/action',{action:'PIN'})).status,403);
  await call('monitor','/'+id+'/action',{action:'COMMENT',text:'Comentário de teste'},'comment');await call('monitor','/'+id+'/action',{action:'COMMENT',text:'Comentário de teste'},'comment');
  assert.equal(database.mural.announcements[0].comments.length,1);
  await call('monitor','/'+id+'/action',{action:'LIKE'});assert.deepEqual(database.mural.announcements[0].likes,['monitor']);
  await call('monitor','/'+id+'/action',{action:'LIKE'});assert.equal(database.mural.announcements[0].likes.length,0);
  const document=draft.data.announcement.attachments[0];
  assert.ok([403,404].includes((await fetch(base+'/api/mural/'+id+'/attachments/'+document.id,{headers:{'x-test-user':'finance'}})).status));
  const downloaded=await fetch(base+'/api/mural/'+id+'/attachments/'+document.id,{headers:{'x-test-user':'monitor'}});assert.equal(downloaded.status,200);assert.ok((await downloaded.text()).startsWith('%PDF-'));
  await call('admin','/'+id+'/action',{action:'ARCHIVE'});assert.equal(database.mural.announcements[0].archived,true);
  await call('admin','/'+id+'/action',{action:'ARCHIVE'});assert.equal(database.mural.announcements[0].archived,false);
  await call('admin','/'+id+'/action',{action:'FEATURE'});assert.equal(database.mural.announcements[0].featured,false);
  await call('monitor','/notifications/read',{ids:database.mural.notifications.map((n:any)=>n.id),dismiss:true});
  assert.equal((await call('monitor')).data.notifications.length,0);
  const updated={...publication,title:'Título editado'};await call('admin','',updated,'edit');assert.equal(database.mural.announcements[0].readReceipts.length,1);assert.equal(database.mural.announcements[0].comments.length,1);assert.equal(database.mural.notifications.length,1);
  assert.ok(database.mural.announcements[0].versions.length>=2);
  assert.equal((await call('admin','',{...input,title:'Arquivo falso',attachments:[{name:'falso.pdf',dataUrl:'data:application/pdf;base64,'+Buffer.from('not a PDF').toString('base64')}]},'bad-file')).status,400);
  const restored=JSON.parse(fs.readFileSync(file,'utf8'));const second=make(restored).listen(0,'127.0.0.1');await new Promise<void>(r=>second.once('listening',r));try{const response=await fetch('http://127.0.0.1:'+(second.address() as any).port+'/api/mural',{headers:{'x-test-user':'admin'}});const result=await response.json();assert.equal(result.announcements[0].title,'Título editado');assert.equal(result.announcements[0].readReceipts.length,1);assert.equal(result.announcements[0].comments.length,1);assert.ok(saves>0);}finally{await new Promise<void>(r=>second.close(()=>r()));}
 }finally{await new Promise<void>(r=>server.close(()=>r()));delete process.env.RODOVAR_DATA_ROOT;}
});

test('identificador de envio funciona no HTTP da rede sem crypto.randomUUID',()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis.crypto,'randomUUID');
 try{Object.defineProperty(globalThis.crypto,'randomUUID',{value:undefined,configurable:true});const first=muralClientKey(),second=muralClientKey();assert.match(first,/^[a-f0-9]{32}$/);assert.notEqual(first,second);}finally{if(descriptor)Object.defineProperty(globalThis.crypto,'randomUUID',descriptor);else delete (globalThis.crypto as any).randomUUID;}
});

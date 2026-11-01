import test from 'node:test';import assert from 'node:assert/strict';import express from 'express';import {registerCustomerCovers} from '../src/server/customerCovers';
test('Capas por cliente: autorização, validação, reutilização, atualização única e persistência',async()=>{
 const users:any={admin:{id:'admin',active:true,approvalStatus:'APROVADO',accessLevel:'ADMINISTRADOR'},mon:{id:'mon',active:true,approvalStatus:'APROVADO',accessProfile:'MONITORAMENTO'},com:{id:'com',active:true,approvalStatus:'APROVADO',accessProfile:'COMERCIAL'},dir:{id:'dir',active:true,approvalStatus:'APROVADO',accessProfile:'DIRETORIA'}};
 const db:any={};let saved='';const app=express();app.use(express.json());registerCustomerCovers(app,(req:any,res:any,next:any)=>{req.sessionUser=users[req.headers.user as string];next();},db,()=>saved=JSON.stringify(db));const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base='http://127.0.0.1:'+(server.address() as any).port;
 const call=(u:string,body?:any)=>fetch(base+'/api/customer-covers',{method:body?'PUT':'GET',headers:{user:u,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 try{
  const data={customer:'Cliente A',dataUrl:'data:image/png;base64,'+Buffer.from([137,80,78,71,13,10,26,10]).toString('base64')};
  assert.equal((await call('com',data)).status,403);assert.equal((await call('dir',data)).status,403);assert.equal((await call('mon',{...data,dataUrl:'data:image/png;base64,ZmFrZQ=='})).status,400);
  assert.equal((await call('mon',data)).status,200);assert.equal((await call('admin',{...data,customer:' CLIENTE   A '})).status,200);
  assert.equal(JSON.parse(saved).customerCovers.length,1);const read=await (await call('dir')).json();assert.equal(read.covers[0].dataUrl,data.dataUrl);assert.equal(read.canEdit,false);assert.equal(db.auditLogs.length,2);
 }finally{await new Promise<void>(r=>server.close(()=>r()));}
});

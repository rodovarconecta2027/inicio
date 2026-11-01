import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

test('modalidades persistem na API existente sem confirmar pagamento ou alterar histórico; perfil sem permissão é bloqueado', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rodovar-finance-modalities-'));
  process.env.RODOVAR_DATA_ROOT = root;
  const { registerPaymentReceiptRoutes } = await import('../src/server/paymentReceiptsEngine');
  const app = express();
  app.use(express.json({ limit: '20mb' }));
  const users: Record<string, any> = {
    finance: { id:'test-finance',name:'Teste isolado',active:true,approvalStatus:'APROVADO',accessLevel:'FUNCIONARIO',accessProfile:'FINANCEIRO',department:'Financeiro' },
    commercial: { id:'test-commercial',name:'Teste isolado',active:true,approvalStatus:'APROVADO',accessLevel:'FUNCIONARIO',accessProfile:'COMERCIAL',department:'Logística' },
  };
  registerPaymentReceiptRoutes(app, (req:any,_res:any,next:any)=>{req.sessionUser=users[String(req.headers['x-test-profile'])];next();},()=>{});
  const server=app.listen(0,'127.0.0.1');
  await new Promise<void>(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+(server.address() as any).port;
  const call=(profile:string,body?:unknown)=>fetch(base+'/api/pagamentos/fretes',{method:body?'POST':'GET',headers:{'x-test-profile':profile,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  try {
    const original=(await (await call('finance')).json()).freights;
    assert.ok(original.length);
    assert.equal((await call('finance',{freight:{...original[0],valorTotal:1}})).status,409);
    assert.equal((await call('finance',{freight:{...original[0],id:'test-forged-payment',code:'TEST-FORGED',status:'Pago',adiantamentoPago:true,saldoPago:true}})).status,409);
    const genericConfirmation=await fetch(base+'/api/pagamentos/fretes/'+original.find((f:any)=>f.status!=='Pago').id,{method:'PUT',headers:{'x-test-profile':'finance','Content-Type':'application/json'},body:JSON.stringify({status:'Pago'})});
    assert.equal(genericConfirmation.status,409);
    const file=path.join(root,'data/payment-store/freights.json');
    for (const [kind,pct] of [['70_30',70],['PERSONALIZADO',80],['INTEGRAL_100',100]] as const) {
      const totalCents=600001;
      const advanceCents=Math.round(totalCents*pct/100);
      const freight={...original[0],id:'test-only-'+kind,code:'TEST-'+pct,regraTipo:kind,regraLabel:pct+' / '+(100-pct),percentualAdiantamento:pct,percentualSaldo:100-pct,valorTotal:totalCents/100,valorAdiantamento:advanceCents/100,valorSaldo:(totalCents-advanceCents)/100,status:'Pendente Adiantamento',adiantamentoPago:false,saldoPago:false,entregaConfirmada:false};
      assert.equal((await call('commercial',{freight})).status,403);
      assert.equal((await call('finance',{freight})).status,201);
      const saved=JSON.parse(fs.readFileSync(file,'utf8')).find((f:any)=>f.id===freight.id);
      assert.equal(saved.regraTipo,kind);
      assert.equal(saved.percentualAdiantamento,pct);
      assert.equal(Math.round((saved.valorAdiantamento+saved.valorSaldo)*100),totalCents);
      assert.equal(saved.adiantamentoPago,false);
      assert.equal(saved.saldoPago,false);
      assert.equal(saved.status,'Pendente Adiantamento');
      assert.equal(saved.adiantamentoVerificacaoStatus,'SEM_COMPROVANTE');
      assert.equal((await call('finance',{freight})).status,200);
      assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).filter((f:any)=>f.id===freight.id).length,1);
    }
    const persisted=(await (await call('finance')).json()).freights;
    for(const historic of original) assert.deepEqual(persisted.find((f:any)=>f.id===historic.id),historic);
  } finally {
    await new Promise<void>(r=>server.close(()=>r()));
    delete process.env.RODOVAR_DATA_ROOT;
  }
});

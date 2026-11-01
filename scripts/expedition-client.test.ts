import test from 'node:test';
import assert from 'node:assert/strict';
import {apiExpedicaoAction, apiUpdateOperationalData,apiMonitoramentoAction} from '../src/lib/serverApi';
test('Expedição transmite chave estável por operação, frete e revisão, inclusive em reenvios',async()=>{
 const original=globalThis.fetch;const calls:any[]=[];
 globalThis.fetch=async(url:any,options:any)=>{calls.push({url,options});return {ok:true,status:200,json:async()=>({ok:true})} as any;};
 try{
  const body:any={action:'LIBERAR_PARA_MONITORAMENTO',baseRevision:4,monitoramentoResponsavelId:'mon'};
  await apiExpedicaoAction('real-id',body);await apiExpedicaoAction('real-id',body);
  assert.ok(calls[0].options.headers['X-Idempotency-Key']);
  assert.equal(calls[0].options.headers['X-Idempotency-Key'],calls[1].options.headers['X-Idempotency-Key']);
  assert.equal(calls[0].url,'/api/meus-fretes/real-id/expedicao-action');
  await apiExpedicaoAction('real-id',{...body,baseRevision:5});
  assert.notEqual(calls[0].options.headers['X-Idempotency-Key'],calls[2].options.headers['X-Idempotency-Key']);
  await apiExpedicaoAction('real-id',{...body,idempotencyKey:'existing-operation'});
  assert.equal(calls[3].options.headers['X-Idempotency-Key'],'existing-operation');
  await apiUpdateOperationalData('real-id',{baseRevision:4,checklistFechamento:{motoristaConfirmado:true}});
  await apiUpdateOperationalData('real-id',{baseRevision:4,checklistFechamento:{motoristaConfirmado:true}});
  assert.ok(calls[4].options.headers['X-Idempotency-Key']);
  assert.equal(calls[4].options.headers['X-Idempotency-Key'],calls[5].options.headers['X-Idempotency-Key']);
  const monitor:any={action:'AVANCAR_ETAPA',baseRevision:9,targetStage:'CARREGADO_EM_TRANSPORTE'};
  await apiMonitoramentoAction('real-id',monitor);await apiMonitoramentoAction('real-id',monitor);
  assert.ok(calls[6].options.headers['X-Idempotency-Key']);assert.equal(calls[6].options.headers['X-Idempotency-Key'],calls[7].options.headers['X-Idempotency-Key']);
 }finally{globalThis.fetch=original;}
});

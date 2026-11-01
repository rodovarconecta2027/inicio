import test from 'node:test';import assert from 'node:assert/strict';import {financialProjection} from '../src/server/financialProjection';
test('Projeção financeira usa UID e valores reais; Integral não significa pagamento confirmado',()=>{
 const f:any={id:'real-freight',protocol:'RDV-849',createdAtIso:'2026-11-01T00:00:00Z',situacaoMonitoramento:'CARREGADO_EM_TRANSPORTE',situacaoOperacional:'LIBERADO_MONITORAMENTO',cliente:'Cliente teste',condicoesPagamento:'Integral (100%)',valorContratadoCentavos:12345};
 const full=financialProjection(f)!;assert.equal(full.id,f.id);assert.equal(full.valorAdiantamento,123.45);assert.equal(full.valorSaldo,0);assert.equal(full.adiantamentoPago,false);assert.equal(full.saldoPago,false);assert.equal(full.status,'Pendente Adiantamento');
 const split=financialProjection({...f,condicoesPagamento:'80% Adiantamento / 20% Saldo'})!;assert.equal(split.valorAdiantamento,98.76);assert.equal(split.valorSaldo,24.69);
 const paid={...split,adiantamentoPago:true,valorTotal:777,status:'Adiantamento Pago' as const,docs:{},codigoTransacaoAdiantamento:'historical-reference'};const updated=financialProjection({...f,valorContratadoCentavos:99999},paid)!;assert.equal(updated.valorTotal,777);assert.equal(updated.adiantamentoPago,true);assert.equal(updated.codigoTransacaoAdiantamento,'historical-reference');
 assert.equal(financialProjection({...f,valorContratadoCentavos:0}),null);assert.equal(financialProjection({...f,condicoesPagamento:''}),null);assert.equal(financialProjection({...f,situacaoMonitoramento:'NAO_LIBERADO'}),null);
});

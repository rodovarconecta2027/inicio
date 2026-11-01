import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {expeditionChecklistCount,expeditionPaymentMode,expeditionVerificationIssue} from '../src/lib/expeditionValidation';
test('5/5 depende de dados salvos; modalidades não dependem de pagamento realizado',()=>{
 const f:any={motoristaNome:'Motorista Teste',motoristaCpf:'12345678901',motoristaTelefone:'11999999999',placaVeiculo:'ABC1234',veiculoNecessario:'Carreta',condicoesOperacionais:'Condições acordadas',valorContratadoCentavos:10000,ordemCarregamentoNumero:'OC-test',situacaoFinanceira:'PENDENTE_ADIANTAMENTO',checklistFechamento:{motoristaConfirmado:true,veiculoConfirmado:true,condicoesConferidas:true,documentosConferidos:true,videochamadaRealizada:true,ordemColetaEnviadaMotorista:true}};
 for(const mode of ['70% Adiantaento / 30% Saldo na Entrega','80% Adiantamento / 20% Saldo','Integral (100%)']){f.condicoesPagamento=mode;assert.equal(expeditionChecklistCount(f),5);assert.ok(expeditionPaymentMode(mode));}
 assert.equal(expeditionChecklistCount({...f,condicoesOperacionais:''}),4);assert.equal(expeditionChecklistCount({...f,condicoesPagamento:''}),4);assert.equal(expeditionChecklistCount({...f,motoristaCpf:''}),4);
});
test('RDV-847 real é apenas lido e não pode mostrar 5/5 com condições vazias',()=>{
 for(const filename of fs.readdirSync('data/freights-store').filter(f=>f.endsWith('.json')&&!f.startsWith('_'))){const f=JSON.parse(fs.readFileSync('data/freights-store/'+filename,'utf8'));if(f.protocol==='RDV-847'&&!f.condicoesOperacionais?.trim())assert.ok(expeditionChecklistCount(f)<5);}
});

test('Verificações informam o campo exato em vez de marcar e desmarcar silenciosamente',()=>{
 const f:any={motoristaNome:'Motorista Teste',motoristaCpf:'123456789',motoristaTelefone:'11999999999',condicoesPagamento:'Integral (100%)',valorContratadoCentavos:10000};
 assert.equal(expeditionVerificationIssue(f,'MOTORISTA')?.field,'exp-driver-cpf');
 f.motoristaCpf='12345678901';assert.equal(expeditionVerificationIssue(f,'MOTORISTA'),null);
 assert.equal(expeditionVerificationIssue(f,'CONDICOES_DOCS')?.field,'exp-operational-conditions');
 f.condicoesOperacionais='Condições acordadas';assert.equal(expeditionVerificationIssue(f,'CONDICOES_DOCS'),null);
 assert.match(expeditionVerificationIssue(f,'ORDEM_ENVIADA')!.message,/Gere a Ordem/);
 f.ordemCarregamentoNumero='OC-test';assert.equal(expeditionVerificationIssue(f,'ORDEM_ENVIADA'),null);
 assert.equal(expeditionVerificationIssue(f,'VIDEOCHAMADA'),null);
});

import {UnifiedFreightRecord} from '../types';
export function expeditionPaymentMode(value?:string):string {
 const v=(value||'').toLowerCase();
 if(/70\s*%?.*30\s*%?/.test(v))return '70% Adiantamento / 30% Saldo na Entrega';
 if(/80\s*%?.*20\s*%?/.test(v))return '80% Adiantamento / 20% Saldo na Entrega';
 if(/integral|100\s*%/.test(v))return 'Integral (100%)';
 return '';
}
export function effectiveExpeditionChecklist(f:UnifiedFreightRecord){
 const c=f.checklistFechamento||{} as any;
 return {...c,
 motoristaConfirmado:!!c.motoristaConfirmado&&String(f.motoristaNome||'').trim().length>=3&&String(f.motoristaCpf||'').replace(/\D/g,'').length===11&&String(f.motoristaTelefone||'').replace(/\D/g,'').length>=8,
 veiculoConfirmado:!!c.veiculoConfirmado&&String(f.placaVeiculo||'').trim().length>=6&&String(f.veiculoNecessario||'').trim().length>=2,
 condicoesConferidas:!!c.condicoesConferidas&&String(f.condicoesOperacionais||'').trim().length>=3&&!!expeditionPaymentMode(f.condicoesPagamento)&&Number(f.valorContratadoCentavos)>0,
 ordemColetaEnviadaMotorista:!!c.ordemColetaEnviadaMotorista&&!!f.ordemCarregamentoNumero};
}
export function expeditionChecklistCount(f:UnifiedFreightRecord){const c=effectiveExpeditionChecklist(f);return [c.motoristaConfirmado,c.veiculoConfirmado,c.condicoesConferidas&&c.documentosConferidos,c.videochamadaRealizada,c.ordemColetaEnviadaMotorista].filter(Boolean).length;}

export function expeditionVerificationIssue(f:UnifiedFreightRecord,key:string):{message:string;field:string}|null {
 if(key==='MOTORISTA'){
  if(String(f.motoristaNome||'').trim().length<3)return {message:'Informe o nome completo do motorista.',field:'exp-driver-name'};
  if(String(f.motoristaCpf||'').replace(/\D/g,'').length!==11)return {message:'Complete o CPF do motorista com 11 dígitos na aba Dados Operacionais.',field:'exp-driver-cpf'};
  if(String(f.motoristaTelefone||'').replace(/\D/g,'').length<8)return {message:'Informe o telefone do motorista.',field:'exp-driver-phone'};
 }
 if(key==='VEICULO'&&(String(f.placaVeiculo||'').trim().length<6||String(f.veiculoNecessario||'').trim().length<2))return {message:'Informe a placa e o tipo de veículo em Dados Operacionais.',field:'exp-vehicle-plate'};
 if(key==='CONDICOES_DOCS'){
  if(String(f.condicoesOperacionais||'').trim().length<3)return {message:'Preencha as condições operacionais antes de confirmar esta conferência.',field:'exp-operational-conditions'};
  if(!expeditionPaymentMode(f.condicoesPagamento))return {message:'Selecione as condições de pagamento (70/30, 80/20 ou Integral).',field:'exp-payment-mode'};
  if(!(f.valorContratadoCentavos>0))return {message:'Informe o valor contratado com o motorista.',field:'exp-driver-value'};
 }
 if(key==='ORDEM_ENVIADA'&&!f.ordemCarregamentoNumero)return {message:'Gere a Ordem de Coleta, envie ao motorista e depois confirme o envio.',field:''};
 return null;
}

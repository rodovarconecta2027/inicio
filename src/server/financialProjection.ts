import {FreightRecord,UnifiedFreightRecord} from '../types';
import {expeditionPaymentMode} from '../lib/expeditionValidation.js';
export function financialProjection(f:UnifiedFreightRecord,existing?:FreightRecord):FreightRecord|null{
 if(['NAO_LIBERADO','DEVOLVIDO_EXPEDICAO'].includes(f.situacaoMonitoramento||'NAO_LIBERADO')||f.situacaoOperacional==='CANCELADO')return null;
 const mode=expeditionPaymentMode(f.condicoesPagamento),cents=f.valorContratadoCentavos;
 if(!mode||!(cents>0))return null;
 const percentage=mode==='Integral (100%)'?100:mode.startsWith('80')?80:70;
 const advance=Math.round(cents*percentage/100),total=cents/100;
 if(existing)return {...existing,cliente:f.cliente,motoristaNome:f.motoristaNome,motoristaTelefone:f.motoristaTelefone,origem:f.origemCidadeUf,destino:f.destinoCidadeUf,dataEntrega:f.dataEntregaPrevistaIso||existing.dataEntrega};
 return {id:f.id,code:f.protocol,createdAtIso:f.createdAtIso,createdAtDate:new Date(f.createdAtIso).toLocaleDateString('pt-BR',{timeZone:'America/Bahia'}),empresaMarca:f.empresaMarca,cliente:f.cliente,motoristaNome:f.motoristaNome,motoristaTelefone:f.motoristaTelefone,origem:f.origemCidadeUf,destino:f.destinoCidadeUf,dataColeta:f.dataColetaIso||'',dataEntrega:f.dataEntregaPrevistaIso||'',valorFreteEmpresa:(f.valorCobradoClienteCentavos||0)/100,valorFreteMotorista:total,regraTipo:percentage===100?'INTEGRAL_100':percentage===70?'70_30':'PERSONALIZADO',regraLabel:mode,percentualAdiantamento:percentage,percentualSaldo:100-percentage,valorTotal:total,valorAdiantamento:advance/100,valorSaldo:(cents-advance)/100,favorecido:f.favorecidoPagamento||f.motoristaNome||'',banco:f.bancoPagamento||'',agencia:'',conta:'',tipoChavePix:(['CPF/CNPJ','Celular','E-mail','Chave Aleatória'].includes(f.tipoChavePix||'')?f.tipoChavePix:'CPF/CNPJ') as FreightRecord['tipoChavePix'],chavePix:f.chavePix||'',status:'Pendente Adiantamento',adiantamentoPago:false,entregaConfirmada:false,saldoPago:false,solicitanteNome:f.expedicaoResponsavelNome||f.comercialResponsavelNome||'',docs:{}};
}

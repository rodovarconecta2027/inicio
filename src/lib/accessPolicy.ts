export type AccessProfile = 'RH' | 'DIRETORIA' | 'MONITORAMENTO' | 'COMERCIAL' | 'EXPEDICAO' | 'FINANCEIRO';
export const BUSINESS_MODULES = ['inicio', 'comunicados', 'fretes_ativos', 'solicitacoes', 'financeiro', 'agenda', 'documentos', 'mensagens', 'grupos', 'diretorio'];
export const PROFILE_MODULES: Record<AccessProfile, readonly string[]> = {
  RH: ['solicitacoes'],
  DIRETORIA: BUSINESS_MODULES,
  MONITORAMENTO: BUSINESS_MODULES,
  COMERCIAL: ['fretes_comercial'],
  EXPEDICAO: ['fretes_expedicao'],
  FINANCEIRO: ['financeiro', 'financeiro_confirmar', 'solicitacoes', 'fretes_ativos'],
};
export const AUTHORIZED_ROSTER: { name: string; profile: AccessProfile }[] = [
  {name:'Juliane Vitória Silva de Aquino', profile:'RH'},
  {name:'Ana Caroline Araújo Xavier Dia', profile:'RH'},
  {name:'Vitor Lira', profile:'DIRETORIA'},
  {name:'Alexandre Caminha', profile:'DIRETORIA'},
  {name:'Jairo Bahia dos Santos e Santos', profile:'MONITORAMENTO'},
  {name:'Monica Nery', profile:'COMERCIAL'},
  {name:'Marival Jerônimo Chagas Filho', profile:'COMERCIAL'},
  {name:'Jeise Ribeiro de Souza', profile:'COMERCIAL'},
  {name:'Elinete', profile:'COMERCIAL'},
  {name:'Suellen Aranda', profile:'COMERCIAL'},
  {name:'Mariane', profile:'COMERCIAL'},
  {name:'Priscila Sousa dos Santos', profile:'EXPEDICAO'},
  {name:'Ana Claudia Anunciação da Silva', profile:'EXPEDICAO'},
  {name:'Augusto César Brito da Cruz', profile:'EXPEDICAO'},
  {name:'Petrônio', profile:'FINANCEIRO'},
];
// The authorized roster uses Petrônio's short name; the verified existing
// employee registration uses his full professional name.
export const officialRosterName = (name: string) => name === 'Petrônio' ? 'Petrônio Santos' : name;

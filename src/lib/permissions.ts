import { PROFILE_MODULES } from './accessPolicy';
import { Department, Employee, UserRole } from '../types';

export interface ModulePermissionOption {
  id: string;
  label: string;
  description: string;
  badgeCategory: string;
}

export const AVAILABLE_MODULES: ModulePermissionOption[] = [
  {
    id: 'inicio',
    label: 'Início',
    description: 'Painel principal, destaques institucionais e acessos rápidos.',
    badgeCategory: 'Visão Geral',
  },
  {
    id: 'comunicados',
    label: 'Mural de Comunicados',
    description: 'Avisos da diretoria, confirmações de leitura obrigatória e novidades.',
    badgeCategory: 'Comunicação',
  },
  {
    id: 'fretes_comercial',
    label: 'Meus Fretes — Comercial',
    description: 'Carteira individual de negociação, contratação e envio de fretes à Expedição.',
    badgeCategory: 'Comercial',
  },
  {
    id: 'fretes_expedicao',
    label: 'Meus Fretes — Expedição',
    description: 'Fila operacional individual, disponível para assumir, fechamento, coleta e conclusão.',
    badgeCategory: 'Expedição',
  },
  {
    id: 'fretes_equipe',
    label: 'Gestão de Equipe de Fretes',
    description: 'Permissão explícita para visualizar carteiras e filas de outros funcionários do setor.',
    badgeCategory: 'Gestão',
  },
  {
    id: 'fretes_transferir',
    label: 'Transferência de Responsabilidade de Frete',
    description: 'Permissão para transferir fretes entre responsáveis com justificativa auditada.',
    badgeCategory: 'Gestão',
  },
  {
    id: 'fretes_cancelar',
    label: 'Cancelamento de Frete',
    description: 'Permissão para cancelar fretes mediante motivo registrado no histórico.',
    badgeCategory: 'Gestão',
  },
  {
    id: 'fretes_ativos',
    label: 'Fretes Ativos (Visão Geral)',
    description: 'Painel geral de acompanhamento de rotas e status da operação.',
    badgeCategory: 'Operação',
  },
  {
    id: 'solicitacoes',
    label: 'Minhas Solicitações (CSI)',
    description: 'Central de solicitações internas, prazos e chamados auditáveis.',
    badgeCategory: 'Atendimento',
  },
  {
    id: 'financeiro',
    label: 'Financeiro (Gestão de Fretes)',
    description: 'Acompanhamento de fretes, validação de CT-e/MDF-e, preparação de pagamentos e envio de comprovantes.',
    badgeCategory: 'Financeiro',
  },
  {
    id: 'financeiro_confirmar',
    label: 'Confirmar Liquidação de Pagamentos',
    description: 'Permissão de conferência bancária para confirmar liquidação definitiva de Adiantamento e Saldo.',
    badgeCategory: 'Financeiro',
  },
  {
    id: 'agenda',
    label: 'Agenda',
    description: 'Eventos corporativos, reuniões e treinamentos da empresa.',
    badgeCategory: 'Organização',
  },
  {
    id: 'documentos',
    label: 'Documentos',
    description: 'Procedimentos operacionais (POPs), manuais e políticas vigentes.',
    badgeCategory: 'Normas',
  },
  {
    id: 'mensagens',
    label: 'Mensagens',
    description: 'Chat individual direto entre colaboradores.',
    badgeCategory: 'Comunicação',
  },
  {
    id: 'grupos',
    label: 'Grupos',
    description: 'Canais temáticos e operacionais da transportadora.',
    badgeCategory: 'Comunicação',
  },
  {
    id: 'diretorio',
    label: 'Diretório de Funcionários',
    description: 'Lista de contatos, telefones e departamentos autorizados.',
    badgeCategory: 'Pessoas',
  },
];

export const ALL_MODULE_IDS = AVAILABLE_MODULES.map((m) => m.id);


export function getDefaultPermissionsForDepartment(dept?: Department | string, accessLevel?: UserRole): string[] {
  if (accessLevel === 'ADMINISTRADOR') return [...ALL_MODULE_IDS];
  if (accessLevel === 'DIRETORIA') return [...PROFILE_MODULES.DIRETORIA];
  return [];
}
export function isLogisticsManager(u?:Employee|null):boolean {
  if(!u||!u.active||u.approvalStatus!=='APROVADO')return false;
  const normalize=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const role=normalize(u.roleTitle||'');
  return /gerent/.test(role)&&(/logistic/.test(normalize(u.department||''))||/logistic/.test(role));
}
export function hasPagePermission(employee: Employee | null | undefined, moduleId: string): boolean {
  if (!employee || employee.active !== true || employee.approvalStatus !== 'APROVADO') return false;
  if (moduleId === 'perfil' || moduleId === 'ajuda') return true;
  if (employee.accessLevel === 'ADMINISTRADOR') return true;
  if (moduleId === 'administracao') return false;
  if (moduleId === 'fretes_ativos' && isLogisticsManager(employee)) return true;
  if (moduleId === 'agenda') return !!employee.accessProfile || employee.accessLevel === 'DIRETORIA';
  const profile = employee.accessProfile || (employee.accessLevel === 'DIRETORIA' ? 'DIRETORIA' : undefined);
  return !!profile && PROFILE_MODULES[profile]?.includes(moduleId) === true;
}
export const canAccessComercialFreights = (u?: Employee | null) => hasPagePermission(u, 'fretes_comercial');
export const canAccessExpedicaoFreights = (u?: Employee | null) => hasPagePermission(u, 'fretes_expedicao');
export const canAccessMonitoramentoFreights = (u?: Employee | null) => hasPagePermission(u, 'fretes_ativos');
export const canAccessFinanceiroFreights = (u?: Employee | null) => hasPagePermission(u, 'financeiro');
export const canConfirmFreightPayment = (u?: Employee | null) => !!u && u.accessProfile === 'FINANCEIRO' && hasPagePermission(u, 'financeiro_confirmar');
export const canViewFreightTeam = (u?: Employee | null) => !!u && u.active && u.approvalStatus === 'APROVADO' && (u.accessLevel === 'ADMINISTRADOR' || u.accessProfile === 'DIRETORIA' || u.accessLevel === 'DIRETORIA' || u.accessProfile === 'MONITORAMENTO' || u.accessProfile === 'FINANCEIRO');
export const canTransferFreightResponsibility = (u?: Employee | null) => !!u && u.accessLevel === 'ADMINISTRADOR' && hasPagePermission(u, 'fretes_transferir');
export const canOperateMonitoring = (u?: Employee | null) => !!u && (u.accessProfile === 'MONITORAMENTO'||isLogisticsManager(u)) && hasPagePermission(u, 'fretes_ativos');
export function permittedHome(u: Employee): string {
  if (hasPagePermission(u, 'inicio')) return 'inicio';
  return ['fretes_comercial','fretes_expedicao','financeiro','solicitacoes'].find(m => hasPagePermission(u,m)) || 'perfil';
}

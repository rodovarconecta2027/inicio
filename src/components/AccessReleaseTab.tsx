import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserX,
  X,
  Trash2,
} from 'lucide-react';
import {
  AccessDecisionRecord,
  AccountApprovalStatus,
  Department,
  Employee,
  SystemConfig,
  UserRole,
} from '../types';
import {
  AVAILABLE_MODULES,
  ALL_MODULE_IDS,
  getDefaultPermissionsForDepartment,
} from '../lib/permissions';
import {
  apiFetchAdminAccessRequests,
  apiSubmitAdminDecision,
  resolveAvatarUrl,
  apiDeleteUser,
} from '../lib/serverApi';
import { CorporateModal } from './ui/CorporateModal';

interface AccessReleaseTabProps {
  currentUser: Employee;
  systemConfig?: SystemConfig;
  onPendingCountChange?: (count: number) => void;
  onAccountsUpdated?: (accounts: Employee[]) => void;
}

const STATUS_BADGE_STYLES: Record<
  AccountApprovalStatus,
  { bg: string; text: string; label: string }
> = {
  PENDENTE: {
    bg: 'bg-amber-100 border border-amber-300',
    text: 'text-amber-900',
    label: 'PENDENTE',
  },
  APROVADO: {
    bg: 'bg-emerald-100 border border-emerald-300',
    text: 'text-emerald-900',
    label: 'APROVADO',
  },
  RECUSADO: {
    bg: 'bg-red-100 border border-red-300',
    text: 'text-red-900',
    label: 'RECUSADO',
  },
  SUSPENSO: {
    bg: 'bg-gray-200 border border-gray-400',
    text: 'text-gray-900',
    label: 'SUSPENSO',
  },
};

export const AccessReleaseTab: React.FC<AccessReleaseTabProps> = ({
  currentUser,
  systemConfig,
  onPendingCountChange,
  onAccountsUpdated,
}) => {
  const [accounts, setAccounts] = useState<Employee[]>([]);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [decisionsHistory, setDecisionsHistory] = useState<AccessDecisionRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<'TODOS' | AccountApprovalStatus>('TODOS');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Modal state for explicit Role + Permissions + Reason configuration before decision
  const [decisionModal, setDecisionModal] = useState<{
    target: Employee;
    action: 'APROVAR' | 'RECUSAR' | 'SUSPENDER' | 'ALTERAR_PERMISSOES';
    accessLevel: UserRole;
    department: Department;
    roleTitle: string;
    permissoesPaginas: string[];
    reason: string;
  } | null>(null);
  const [isSubmittingDecision, setIsSubmittingDecision] = useState<boolean>(false);
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiFetchAdminAccessRequests();
      if (res.ok) {
        setAccounts(res.accounts);
        setPendingCount(res.pendingCount);
        setDecisionsHistory(res.decisionsHistory);
        onPendingCountChange?.(res.pendingCount);
        onAccountsUpdated?.(res.accounts);
      } else {
        setFeedbackBanner({
          type: 'error',
          message: res.error || 'Falha ao carregar solicitações de acesso do banco.',
        });
      }
    } catch {
      setFeedbackBanner({
        type: 'error',
        message: 'Erro de conexão com o servidor ao consultar solicitações de uso.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [onPendingCountChange, onAccountsUpdated]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openDecisionModal = (
    target: Employee,
    action: 'APROVAR' | 'RECUSAR' | 'SUSPENDER' | 'ALTERAR_PERMISSOES'
  ) => {
    setFeedbackBanner(null);
    const defaultRole: UserRole = target.accessLevel || 'FUNCIONARIO';
    const defaultPerms =
      target.permissoesPaginas && target.permissoesPaginas.length > 0 && target.approvalStatus === 'APROVADO'
        ? [...target.permissoesPaginas]
        : getDefaultPermissionsForDepartment(target.department, defaultRole);

    setDecisionModal({
      target,
      action,
      accessLevel: defaultRole,
      department: target.department,
      roleTitle: target.roleTitle || `Colaborador (${target.department})`,
      permissoesPaginas: defaultPerms,
      reason: '',
    });
  };

  const handleConfirmDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!decisionModal || isSubmittingDecision) return;

    setIsSubmittingDecision(true);
    setFeedbackBanner(null);
    try {
      const res = await apiSubmitAdminDecision(decisionModal.target.id, {
        action: decisionModal.action,
        accessLevel: decisionModal.accessLevel,
        department: decisionModal.department,
        roleTitle: decisionModal.roleTitle,
        permissoesPaginas: decisionModal.permissoesPaginas,
        reason: decisionModal.reason,
      });

      if (!res.ok) {
        setFeedbackBanner({
          type: 'error',
          message: res.error || 'O servidor recusou a operação administrativa.',
        });
        return;
      }

      setFeedbackBanner({
        type: 'success',
        message: `Decisão (${decisionModal.action}) efetivada no servidor para ${decisionModal.target.name}.`,
      });
      setDecisionModal(null);
      await loadData();
    } catch {
      setFeedbackBanner({
        type: 'error',
        message: 'Erro de comunicação ao efetivar decisão no servidor.',
      });
    } finally {
      setIsSubmittingDecision(false);
    }
  };

  const filteredAccounts = accounts.filter((acc) => {
    const status = acc.approvalStatus || 'APROVADO';
    if (statusFilter !== 'TODOS' && status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        acc.name.toLowerCase().includes(q) ||
        (acc.login || acc.email).toLowerCase().includes(q) ||
        acc.department.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const activeAdminsCount = accounts.filter(
    (a) =>
      a.accessLevel === 'ADMINISTRADOR' &&
      (a.approvalStatus || 'APROVADO') === 'APROVADO' &&
      a.active
  ).length;

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="bg-[#080B0D] text-white rounded-xl p-5 border border-[#FFD400]/40 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-[#FFD400] text-[#080B0D] flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6 stroke-[2.3]" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-extrabold text-white">Liberação de uso</h2>
              <span
                data-testid="pending-requests-badge"
                className="text-xs font-extrabold px-2.5 py-0.5 rounded-md bg-[#FFD400] text-[#080B0D]"
              >
                {pendingCount} Pendente(s) no Banco
              </span>
            </div>
            <p className="text-xs text-gray-300 mt-1">
              Aprove, recuse ou suspenda solicitações de acesso. Defina explicitamente o perfil e
              as permissões de cada conta. Senhas nunca são exibidas.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadData}
          className="bg-white/10 hover:bg-white/20 text-white border border-white/15 text-xs font-bold px-3.5 py-2 rounded-lg inline-flex items-center gap-1.5 cursor-pointer self-start md:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#FFD400] ${isLoading ? 'animate-spin' : ''}`} />
          <span>Atualizar Banco</span>
        </button>
      </div>

      {/* Feedback Banner */}
      {feedbackBanner && (
        <div
          role="alert"
          className={`p-3.5 rounded-xl border text-xs font-bold flex items-center justify-between gap-3 ${
            feedbackBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-red-50 border-red-300 text-[#E5252A]'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackBanner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-700" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 text-[#E5252A]" />
            )}
            <span>{feedbackBanner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="text-gray-400 hover:text-gray-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Status Filter Bar & Search */}
      <div className="bg-white rounded-xl p-4 border border-gray-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(['TODOS', 'PENDENTE', 'APROVADO', 'RECUSADO', 'SUSPENSO'] as const).map((st) => {
            const count =
              st === 'TODOS'
                ? accounts.length
                : accounts.filter((a) => (a.approvalStatus || 'APROVADO') === st).length;
            const active = statusFilter === st;
            return (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer inline-flex items-center gap-1.5 ${
                  active
                    ? 'bg-[#080B0D] text-[#FFD400]'
                    : 'bg-[#F3F5F7] text-gray-700 hover:bg-gray-200'
                }`}
              >
                <span>{st}</span>
                <span
                  className={`font-mono text-[10px] px-1.5 py-0.2 rounded ${
                    active ? 'bg-[#FFD400] text-[#080B0D]' : 'bg-white text-gray-600'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar nome, usuário ou setor..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[#F3F5F7] border border-gray-200 text-xs font-medium"
          />
        </div>
      </div>

      {/* Accounts Table */}
      <div className="bg-white rounded-xl border border-gray-200/80 overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#080B0D] text-white uppercase text-[10px] font-extrabold tracking-wider">
                <th className="py-3 px-4">Nome</th>
                <th className="py-3 px-3">Usuário</th>
                <th className="py-3 px-3">Setor / Perfil</th>
                <th className="py-3 px-3">Data da solicitação</th>
                <th className="py-3 px-3">Situação</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-500 font-semibold">
                    Nenhum registro encontrado para o filtro selecionado.
                  </td>
                </tr>
              ) : (
                filteredAccounts.map((acc) => {
                  const status: AccountApprovalStatus = acc.approvalStatus || 'APROVADO';
                  const badge = STATUS_BADGE_STYLES[status];
                  const isSelf = acc.id === currentUser.id;
                  const isLastActiveAdmin =
                    acc.accessLevel === 'ADMINISTRADOR' &&
                    status === 'APROVADO' &&
                    acc.active &&
                    activeAdminsCount <= 1;

                  const formattedDate = acc.requestedAt
                    ? new Date(acc.requestedAt).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : acc.joinedAt || '02/01/2020';

                  return (
                    <tr key={acc.id} className="hover:bg-gray-50/90 transition">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <img
                            src={resolveAvatarUrl(acc, systemConfig)}
                            alt={acc.name}
                            referrerPolicy="no-referrer"
                            className="w-9 h-9 rounded-full object-cover aspect-square border-2 border-[#FFD400] shrink-0 bg-[#15191D]"
                          />
                          <div>
                            <p className="font-extrabold text-[#15191D] flex items-center gap-1.5">
                              <span>{acc.name}</span>
                              {isSelf && (
                                <span className="text-[10px] font-bold bg-[#080B0D] text-[#FFD400] px-1.5 py-0.5 rounded">
                                  Você
                                </span>
                              )}
                            </p>
                            <p className="text-[11px] text-gray-500">{acc.roleTitle}</p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-3 font-mono font-bold text-[#15191D]">
                        {acc.login || acc.email}
                      </td>

                      <td className="py-3.5 px-3">
                        <p className="font-bold text-[#15191D]">{acc.department}</p>
                        <span className="inline-block mt-0.5 font-mono text-[10px] font-extrabold bg-[#080B0D] text-[#FFD400] px-1.5 py-0.5 rounded">
                          {acc.accessLevel}
                        </span>
                      </td>

                      <td className="py-3.5 px-3 font-mono text-[11px] text-gray-600">
                        {formattedDate}
                      </td>

                      <td className="py-3.5 px-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-extrabold ${badge.bg} ${badge.text}`}
                        >
                          {status === 'PENDENTE' && <Clock className="w-3 h-3" />}
                          {status === 'APROVADO' && <CheckCircle2 className="w-3 h-3" />}
                          {status === 'RECUSADO' && <UserX className="w-3 h-3" />}
                          {status === 'SUSPENSO' && <Ban className="w-3 h-3" />}
                          <span>{badge.label}</span>
                        </span>
                        {acc.approvedBy && (
                          <p className="text-[10px] text-gray-400 mt-1 truncate max-w-[180px]">
                            Por: {acc.approvedBy}
                          </p>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                          {!isSelf && !isLastActiveAdmin && <button type="button" aria-label={`Excluir cadastro de ${acc.name}`} onClick={() => {setDeleteTarget(acc);setDeleteError('');}} className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-bold text-red-700 hover:bg-red-100"><Trash2 className="h-3.5 w-3.5" />Excluir cadastro</button>}
                          {/* Permitir acesso */}
                          {status !== 'APROVADO' && (
                            <button
                              type="button"
                              disabled={isSelf}
                              onClick={() => openDecisionModal(acc, 'APROVAR')}
                              title={
                                isSelf
                                  ? 'Você não pode aprovar a própria conta'
                                  : 'Definir perfil/permissões e permitir acesso'
                              }
                              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold inline-flex items-center gap-1 transition ${
                                isSelf
                                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                  : 'bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] cursor-pointer shadow-2xs'
                              }`}
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>Permitir acesso</span>
                            </button>
                          )}

                          {/* Configurar Permissões (para contas já aprovadas) */}
                          {status === 'APROVADO' && (
                            <button
                              type="button"
                              onClick={() => openDecisionModal(acc, 'ALTERAR_PERMISSOES')}
                              className="px-2.5 py-1.5 rounded-lg bg-[#F3F5F7] hover:bg-[#FFD400]/30 text-[#15191D] border border-gray-200 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Shield className="w-3.5 h-3.5" />
                              <span>Permissões</span>
                            </button>
                          )}

                          {/* Recusar */}
                          {status !== 'RECUSADO' && (
                            <button
                              type="button"
                              disabled={isLastActiveAdmin}
                              onClick={() => openDecisionModal(acc, 'RECUSAR')}
                              title={
                                isLastActiveAdmin
                                  ? 'Não é permitido desativar o último administrador ativo'
                                  : 'Recusar acesso e bloquear conta'
                              }
                              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 transition ${
                                isLastActiveAdmin
                                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                  : 'bg-red-50 hover:bg-red-100 text-[#E5252A] border border-red-200 cursor-pointer'
                              }`}
                            >
                              <UserX className="w-3.5 h-3.5" />
                              <span>Recusar</span>
                            </button>
                          )}

                          {/* Suspender acesso */}
                          {status !== 'SUSPENSO' && (
                            <button
                              type="button"
                              disabled={isLastActiveAdmin}
                              onClick={() => openDecisionModal(acc, 'SUSPENDER')}
                              title={
                                isLastActiveAdmin
                                  ? 'Não é permitido suspender o último administrador ativo'
                                  : 'Suspender acesso e revogar sessões ativas imediatamente'
                              }
                              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 transition ${
                                isLastActiveAdmin
                                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                  : 'bg-[#080B0D] hover:bg-gray-800 text-white cursor-pointer'
                              }`}
                            >
                              <Ban className="w-3.5 h-3.5 text-[#FFD400]" />
                              <span>Suspender acesso</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Audit History of Access Release Decisions */}
      <CorporateModal isOpen={!!deleteTarget} onClose={() => {if(!isDeleting)setDeleteTarget(null);}} title="Excluir cadastro" subtitle="Exclusão do acesso com preservação do histórico" maxWidth="md" footer={<><button type="button" disabled={isDeleting} onClick={() => setDeleteTarget(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-bold">Cancelar</button><button type="button" disabled={isDeleting} className="rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50" onClick={async () => {
        if(!deleteTarget || isDeleting)return;setIsDeleting(true);setDeleteError('');
        try {const result=await apiDeleteUser(deleteTarget.id);if(!result.ok)throw Error(result.error || 'Não foi possível excluir o cadastro.');setDeleteTarget(null);setFeedbackBanner({type:'success',message:'Cadastro excluído. Sessões revogadas e histórico preservado.'});await loadData();}
        catch(e){setDeleteError((e as Error).message);}finally{setIsDeleting(false);}
      }}>{isDeleting?'Excluindo...':'Excluir cadastro'}</button></>}>
        <p className="text-sm text-gray-700">Excluir o cadastro de <strong>{deleteTarget?.name}</strong> ({deleteTarget?.login || deleteTarget?.email})?</p><p className="mt-3 text-sm text-gray-500">O usuário será removido da lista e não poderá entrar. Suas sessões serão encerradas; documentos, fretes e históricos anteriores serão preservados.</p>{deleteError && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{deleteError}</p>}
      </CorporateModal>
      <div className="bg-white rounded-xl p-5 border border-gray-200/80 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-extrabold text-[#15191D]">
              Registro Auditado de Decisões Administrativas (Liberação de uso)
            </h3>
            <p className="text-xs text-gray-500">
              Histórico imutável com administrador responsável, data real do servidor, ação e motivo
            </p>
          </div>
          <span className="font-mono text-[10px] font-bold bg-[#080B0D] text-[#FFD400] px-2.5 py-1 rounded">
            {decisionsHistory.length} decisão(ões)
          </span>
        </div>

        {decisionsHistory.length === 0 ? (
          <p className="text-xs text-gray-400 py-3">
            Nenhuma decisão manual registrada nesta sessão ainda.
          </p>
        ) : (
          <div className="divide-y divide-gray-100 max-h-60 overflow-y-auto">
            {decisionsHistory.map((d) => (
              <div
                key={d.id}
                className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div>
                  <span className="font-mono text-[10px] font-extrabold bg-[#080B0D] text-[#FFD400] px-2 py-0.5 rounded mr-2">
                    {d.action} → {d.newStatus}
                  </span>
                  <strong className="text-[#15191D]">{d.targetName}</strong>{' '}
                  <span className="text-gray-500 font-mono">({d.targetLogin})</span>
                  <span className="text-gray-500"> • Perfil definido: {d.accessLevel}</span>
                  {d.reason && (
                    <p className="text-[11px] text-gray-600 mt-0.5">
                      <strong>Motivo:</strong> {d.reason}
                    </p>
                  )}
                </div>
                <div className="text-right text-[11px] text-gray-500 shrink-0 font-mono">
                  <p className="font-bold text-[#15191D]">Admin: {d.adminName}</p>
                  <p>{d.timestampFormatted}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal: Explicit Profile, Permissions & Decision Confirmation */}
      {decisionModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmDecision}
            className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl max-h-[92vh] flex flex-col text-xs"
          >
            <div className="flex items-center justify-between pb-3 border-b border-gray-200 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#080B0D] text-[#FFD400] flex items-center justify-center">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#15191D]">
                    {decisionModal.action === 'APROVAR'
                      ? 'Permitir Acesso e Definir Permissões'
                      : decisionModal.action === 'RECUSAR'
                      ? 'Recusar Solicitação de Acesso'
                      : decisionModal.action === 'SUSPENDER'
                      ? 'Suspender Acesso e Revogar Sessões'
                      : 'Atualizar Perfil e Permissões'}
                  </h3>
                  <p className="text-gray-500">
                    Conta: <strong>{decisionModal.target.name}</strong> (
                    {decisionModal.target.login || decisionModal.target.email})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDecisionModal(null)}
                className="text-gray-400 hover:text-gray-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-3.5 overflow-y-auto flex-1 pr-1">
              {(decisionModal.action === 'APROVAR' ||
                decisionModal.action === 'ALTERAR_PERMISSOES') && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-extrabold text-[#15191D] mb-1">
                        Perfil de Acesso (RBAC) *
                      </label>
                      <select
                        value={decisionModal.accessLevel}
                        onChange={(e) => {
                          const nextRole = e.target.value as UserRole;
                          setDecisionModal({
                            ...decisionModal,
                            accessLevel: nextRole,
                            permissoesPaginas: getDefaultPermissionsForDepartment(
                              decisionModal.department,
                              nextRole
                            ),
                          });
                        }}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 font-bold"
                      >
                        <option value="FUNCIONARIO">FUNCIONÁRIO (Padrão)</option>
                        <option value="DIRETORIA">DIRETORIA</option>
                        <option value="ADMINISTRADOR">ADMINISTRADOR</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-extrabold text-[#15191D] mb-1">
                        Setor Corporativo *
                      </label>
                      <select
                        value={decisionModal.department}
                        onChange={(e) => {
                          const nextDept = e.target.value as Department;
                          setDecisionModal({
                            ...decisionModal,
                            department: nextDept,
                            permissoesPaginas: getDefaultPermissionsForDepartment(
                              nextDept,
                              decisionModal.accessLevel
                            ),
                          });
                        }}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 font-bold"
                      >
                        <option value="Operacional">Operacional</option>
                        <option value="Logística">Logística</option>
                        <option value="Administrativo">Administrativo</option>
                        <option value="Financeiro">Financeiro</option>
                        <option value="Recursos Humanos">Recursos Humanos</option>
                        <option value="Segurança">Segurança</option>
                        <option value="Diretoria">Diretoria</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block font-extrabold text-[#15191D] mb-1">
                      Cargo / Função
                    </label>
                    <input
                      type="text"
                      value={decisionModal.roleTitle}
                      onChange={(e) =>
                        setDecisionModal({ ...decisionModal, roleTitle: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 font-semibold"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="font-extrabold text-[#15191D]">
                        Permissões Explícitas de Páginas e Módulos
                      </label>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setDecisionModal({
                              ...decisionModal,
                              permissoesPaginas: [...ALL_MODULE_IDS],
                            })
                          }
                          className="text-[10px] font-bold bg-[#FFD400]/40 hover:bg-[#FFD400] text-[#080B0D] px-2 py-0.5 rounded cursor-pointer"
                        >
                          Marcar Todos
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setDecisionModal({
                              ...decisionModal,
                              permissoesPaginas: ['inicio'],
                            })
                          }
                          className="text-[10px] font-bold bg-gray-100 hover:bg-gray-200 text-gray-600 px-2 py-0.5 rounded cursor-pointer"
                        >
                          Mínimo (Início)
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-[#F8FAFC] border border-gray-200 p-2.5 rounded-xl max-h-48 overflow-y-auto">
                      {AVAILABLE_MODULES.map((mod) => {
                        const checked = decisionModal.permissoesPaginas.includes(mod.id);
                        return (
                          <label
                            key={mod.id}
                            className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer ${
                              checked
                                ? 'bg-amber-50 border-[#FFD400] font-bold text-[#15191D]'
                                : 'bg-white border-gray-200 text-gray-600'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? [...decisionModal.permissoesPaginas, mod.id]
                                  : decisionModal.permissoesPaginas.filter((id) => id !== mod.id);
                                setDecisionModal({
                                  ...decisionModal,
                                  permissoesPaginas: next.length > 0 ? next : ['inicio'],
                                });
                              }}
                              className="mt-0.5 rounded text-[#080B0D]"
                            />
                            <span>{mod.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block font-extrabold text-[#15191D] mb-1">
                  Motivo / Observação da Decisão Administrativa
                </label>
                <textarea
                  rows={2}
                  value={decisionModal.reason}
                  onChange={(e) =>
                    setDecisionModal({ ...decisionModal, reason: e.target.value })
                  }
                  placeholder="Informe o motivo ou justificativa para registro na auditoria..."
                  className="w-full px-3 py-2 rounded-lg border border-gray-300"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-gray-200 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setDecisionModal(null)}
                className="px-4 py-2 rounded-lg font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmittingDecision}
                className={`px-4 py-2 rounded-lg font-extrabold cursor-pointer ${
                  decisionModal.action === 'RECUSAR' || decisionModal.action === 'SUSPENDER'
                    ? 'bg-[#E5252A] hover:bg-red-700 text-white'
                    : 'bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D]'
                }`}
              >
                {isSubmittingDecision
                  ? 'Efetivando no servidor…'
                  : decisionModal.action === 'APROVAR'
                  ? 'Confirmar e Permitir Acesso'
                  : decisionModal.action === 'RECUSAR'
                  ? 'Confirmar Recusa'
                  : decisionModal.action === 'SUSPENDER'
                  ? 'Confirmar Suspensão e Revogar Sessões'
                  : 'Salvar Permissões'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

import {CustomerCover} from './CustomerCover';
import {CarrierBrandLogo,CARRIER_BRANDS} from '../lib/carrierLogos';
import {useGlobalLoading} from './GlobalLoading';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Calendar,
  Building2,
  Check,
  CheckCircle2,
  Download,
  Eye,
  Flag,
  MapPin,
  Navigation,
  Phone,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  Truck,
  Upload,
  User,
  X,
} from 'lucide-react';
import {
  CarrierBrand,
  Employee,
  FreightAttachmentCategory,
  FreightRecord,
  MonitoringFreightStatus,
  OperationalUnit,
  UnifiedFreightAttachment,
  UnifiedFreightHistoryEntry,
  UnifiedFreightOccurrence,
  UnifiedFreightRecord,
} from '../types';
import {
  apiDownloadFreightAttachment,
  apiFetchFreightDetails,
  apiFetchFreightOperators,
  apiFetchFreightsList,
  apiMonitoramentoAction,
  apiRegisterFreightOccurrence,
  apiResolveFreightOccurrence,
  apiTransferFreightResponsibility,
  apiUploadFreightAttachment,
  apiVerifyFreightAttachment,
  formatCentavosToBrl,
  FreightOperatorOption,
} from '../lib/serverApi';
import {
  canAccessExpedicaoFreights,
  canTransferFreightResponsibility,
  canViewFreightTeam,
} from '../lib/permissions';
import {
  formatSituacaoFinanceiraLabel,
  formatSituacaoMonitoramentoLabel,
} from './MeusFretesComercialView';
import { printIsolatedOrdemColeta } from './MeusFretesExpedicaoView';
import './FretesAtivosView.css';
import './FretesAtivosPremiumPanel.css';
import './FreightDetailsModal.css';

export type ActiveFreightStage =
  | 'Aguardando Liberação'
  | 'Em Trânsito (Adiant. Pago)'
  | 'Veículo Quebrado'
  | 'Entrega Concluída';

export interface ActiveFreightCardItem {
  id: string;
  code: string;
  empresaMarca: CarrierBrand;
  dataCarregamento: string;
  unidadeOperacional: OperationalUnit;
  comercialResponsavel: string;
  expedicaoResponsavel: string;
  cliente: string;
  telefoneCliente: string;
  motoristaNome: string;
  motoristaTelefone: string;
  emergenciaNome: string;
  emergenciaTelefone: string;
  createdAtDate: string;
  origem: string;
  destino: string;
  dataColeta: string;
  dataPrevisaoOuEntrega: string;
  stage: ActiveFreightStage;
  docsOk: ('CT-e OK' | 'MDF-e OK' | 'RPA OK')[];
  operador: string;
  valorFreteEmpresa: number;
  valorFreteMotorista: number;
  favorecido: string;
  tipoChavePix: 'CPF/CNPJ' | 'Celular' | 'E-mail' | 'Chave Aleatória';
  chavePix: string;
  banco: string;
}

export const INITIAL_ACTIVE_FREIGHTS: ActiveFreightCardItem[] = [];

const MONITORING_STAGES_ORDER: {
  id: MonitoringFreightStatus;
  label: string;
  shortLabel: string;
  badgeStyle: string;
}[] = [
  {
    id: 'NOVO_PARA_CARREGAR',
    label: 'Novo para carregar',
    shortLabel: 'Novo p/ carregar',
    badgeStyle: 'bg-blue-100 text-blue-900 border-blue-300',
  },
  {
    id: 'EM_DESLOCAMENTO_COLETA',
    label: 'Em deslocamento para coleta',
    shortLabel: 'Desloc. coleta',
    badgeStyle: 'bg-orange-100 text-orange-900 border-orange-300',
  },
  {
    id: 'NO_LOCAL_COLETA',
    label: 'No local de coleta',
    shortLabel: 'No local coleta',
    badgeStyle: 'bg-indigo-100 text-indigo-900 border-indigo-300',
  },
  {
    id: 'CARREGADO_EM_TRANSPORTE',
    label: 'Carregado / Em transporte',
    shortLabel: 'Em transporte',
    badgeStyle: 'bg-amber-100 text-amber-900 border-amber-300',
  },
  {
    id: 'NO_LOCAL_ENTREGA',
    label: 'No local de entrega',
    shortLabel: 'No local entrega',
    badgeStyle: 'bg-purple-100 text-purple-900 border-purple-300',
  },
  {
    id: 'ENTREGUE',
    label: 'Entregue',
    shortLabel: 'Entregue',
    badgeStyle: 'bg-teal-100 text-teal-900 border-teal-300',
  },
  {
    id: 'FINALIZADO',
    label: 'Finalizado',
    shortLabel: 'Finalizado',
    badgeStyle: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  },
];

function getMonitoringBadgeStyle(status?: MonitoringFreightStatus): string {
  const found = MONITORING_STAGES_ORDER.find((s) => s.id === status);
  return found ? found.badgeStyle : 'bg-gray-100 text-gray-700 border-gray-300';
}

function getNextMonitoringStage(
  current?: MonitoringFreightStatus
): MonitoringFreightStatus | null {
  switch (current) {
    case 'NAO_LIBERADO':
      return 'NOVO_PARA_CARREGAR';
    case 'NOVO_PARA_CARREGAR':
      return 'EM_DESLOCAMENTO_COLETA';
    case 'EM_DESLOCAMENTO_COLETA':
      return 'NO_LOCAL_COLETA';
    case 'NO_LOCAL_COLETA':
      return 'CARREGADO_EM_TRANSPORTE';
    case 'CARREGADO_EM_TRANSPORTE':
      return 'NO_LOCAL_ENTREGA';
    case 'NO_LOCAL_ENTREGA':
      return 'ENTREGUE';
    case 'ENTREGUE':
      return 'FINALIZADO';
    default:
      return null;
  }
}

function formatIsoDateBr(iso?: string): string {
  if (!iso) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleDateString('pt-BR');
}

function getInitials(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'OP';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function getFreightTone(status?: MonitoringFreightStatus): string {
  switch (status) {
    case 'NOVO_PARA_CARREGAR': return 'blue';
    case 'EM_DESLOCAMENTO_COLETA': return 'orange';
    case 'NO_LOCAL_COLETA': return 'indigo';
    case 'CARREGADO_EM_TRANSPORTE': return 'yellow';
    case 'NO_LOCAL_ENTREGA':
    case 'ENTREGUE': return 'teal';
    case 'FINALIZADO': return 'green';
    default: return 'gray';
  }
}

function FreightCard({ freight: f, selected, onOpen }: { freight: UnifiedFreightRecord; selected: boolean; onOpen: (event: React.SyntheticEvent<HTMLElement>) => void }) {
  const StatusIcon = f.situacaoMonitoramento === 'FINALIZADO' ? CheckCircle2 : f.situacaoMonitoramento === 'EM_DESLOCAMENTO_COLETA' ? Navigation : Truck;
  return <article tabIndex={0} onClick={event=>{if(!(event.target as HTMLElement).closest('button,a,input,select,textarea'))onOpen(event);}} onKeyDown={event=>{if(event.target===event.currentTarget&&(event.key==='Enter'||event.key===' ')){event.preventDefault();onOpen(event);}}} className="fa-freight-card" data-tone={getFreightTone(f.situacaoMonitoramento)} data-selected={selected} aria-label={`Frete ${f.protocol}`}>
    <CustomerCover customer={f.cliente}/>
    <div className="fa-card-top"><div className="fa-protocol"><span className="fa-protocol-icon"><Truck size={15} /></span>{f.protocol}</div><span className="fa-status"><StatusIcon size={13} />{formatSituacaoMonitoramentoLabel(f.situacaoMonitoramento)}</span></div>
    <div className="fa-card-customer"><span className="fa-icon-tile"><Building2 size={17} /></span><div className="min-w-0 flex-1"><span className="fa-label">Cliente</span><h2 className="fa-customer-name">{f.cliente}</h2></div></div>
    <div className="fa-card-route"><div><span className="fa-route-point" aria-hidden="true"/><div><span className="fa-label">Origem</span><strong>{f.origemCidadeUf}</strong></div></div><div><span className="fa-route-point fa-route-point--destination" aria-hidden="true"/><div><span className="fa-label">Destino</span><strong>{f.destinoCidadeUf}</strong></div></div></div>
    <div className="fa-data-grid">
      <div className="fa-data-item"><span className="fa-icon-tile"><Calendar size={15} /></span><div className="min-w-0"><span className="fa-label">Coleta</span><strong>{formatIsoDateBr(f.dataColetaIso)}</strong></div></div>
      <div className="fa-data-item"><span className="fa-icon-tile" style={{color:'#e11d48',background:'#fff1f2'}}><Flag size={15} /></span><div className="min-w-0"><span className="fa-label">Previsão de entrega</span><strong>{formatIsoDateBr(f.dataEntregaPrevistaIso)}</strong></div></div>
      <div className="fa-data-item"><span className="fa-driver-avatar"><User size={16} /></span><div className="min-w-0"><span className="fa-label">Motorista</span><strong>{f.motoristaNome || 'Não informado'}</strong>{f.motoristaTelefone ? <a className="fa-card-phone" href={`tel:${f.motoristaTelefone.replace(/\D/g,'')}`}><Phone size={10} />{f.motoristaTelefone}</a> : <span className="fa-card-phone">Telefone não informado</span>}</div></div>
      <div className="fa-data-item"><span className="fa-icon-tile"><Truck size={16} /></span><div className="min-w-0"><span className="fa-label">Veículo / Placas</span><strong className="font-mono">{f.placaVeiculo || 'Não informada'}{f.placaCarreta && <><br />{f.placaCarreta}</>}</strong></div></div>
    </div>
    <div className="fa-card-location"><MapPin size={18} /><div className="min-w-0"><span className="fa-label">Última localização informada</span><p>{f.ultimaLocalizacaoInformada || 'Localização ainda não informada'}</p>{f.ultimaLocalizacaoAtualizadaEm && <time>{f.ultimaLocalizacaoAtualizadaEm}</time>}</div></div>
    {f.ocorrenciasAbertasCount > 0 && <p className="fa-card-warning"><AlertCircle size={12} />{f.ocorrenciasAbertasCount} ocorrência(s) em aberto</p>}
    <div className="fa-card-footer"><div className="fa-card-operator"><span className="fa-label">Operador responsável</span><strong title={f.monitoramentoResponsavelNome || undefined}>{f.monitoramentoResponsavelNome || 'Não atribuído'}</strong></div><button type="button" className="fa-details-button" onClick={onOpen} aria-label={`Ver detalhes do frete ${f.protocol}`} aria-expanded={selected} aria-controls="active-freight-detail"><Eye size={14} />Ver detalhes</button></div>
  </article>;
}

function FreightOverview({ freight: f }: { freight: UnifiedFreightRecord }) {
  return <div className="space-y-3">
    <section className="fa-overview-block"><h3 className="fa-overview-title">Informações principais</h3><div className="fa-overview-grid">
      <div className="fa-data-item"><span className="fa-icon-tile"><Truck size={16} /></span><div><span className="fa-label">Protocolo</span><strong>{f.protocol}</strong></div></div>
      <div className="fa-data-item"><span className="fa-icon-tile"><Building2 size={16} /></span><div className="min-w-0"><span className="fa-label">Cliente</span><strong>{f.cliente}</strong></div></div>
      <div className="fa-data-item col-span-2"><span className="fa-icon-tile"><MapPin size={16} /></span><div className="min-w-0"><span className="fa-label">Rota</span><strong>{f.origemCidadeUf} → {f.destinoCidadeUf}</strong></div></div>
      <div className="fa-data-item"><span className="fa-icon-tile"><Calendar size={16} /></span><div><span className="fa-label">Coleta</span><strong>{formatIsoDateBr(f.dataColetaIso)}</strong></div></div>
      <div className="fa-data-item"><span className="fa-icon-tile" style={{color:'#e11d48',background:'#fff1f2'}}><Flag size={16} /></span><div><span className="fa-label">Previsão de entrega</span><strong>{formatIsoDateBr(f.dataEntregaPrevistaIso)}</strong></div></div>
    </div></section>
    <section className="fa-overview-block"><h3 className="fa-overview-title">Motorista e veículo</h3><div className="fa-overview-grid"><div className="fa-data-item"><span className="fa-driver-avatar"><User size={16} /></span><div className="min-w-0"><span className="fa-label">Motorista</span><strong>{f.motoristaNome || 'Não informado'}</strong>{f.motoristaTelefone && <a className="fa-card-phone" href={`tel:${f.motoristaTelefone.replace(/\D/g,'')}`}><Phone size={11} />{f.motoristaTelefone}</a>}</div></div><div className="fa-data-item"><span className="fa-icon-tile"><Truck size={16} /></span><div className="min-w-0"><span className="fa-label">Veículo / Placas</span><strong className="font-mono">{f.placaVeiculo || 'Não informada'}{f.placaCarreta && <><br />{f.placaCarreta}</>}</strong></div></div></div></section>
    <section className="fa-overview-block"><h3 className="fa-overview-title">Localização e acompanhamento</h3><div className="flex gap-2"><MapPin size={18} className="shrink-0 text-red-500" /><div className="min-w-0"><p className="text-xs font-semibold text-slate-700 break-words">{f.ultimaLocalizacaoInformada || 'Localização ainda não informada'}</p>{f.ultimaLocalizacaoAtualizadaEm && <p className="mt-1 text-[10px] text-slate-400">{f.ultimaLocalizacaoAtualizadaEm}</p>}</div></div><dl className="mt-3 space-y-2 border-t border-slate-100 pt-3">{[['Comercial',f.comercialResponsavelNome],['Expedição',f.expedicaoResponsavelNome],['Operador',f.monitoramentoResponsavelNome]].map(([label,name]) => <div key={label} className="flex items-start justify-between gap-3"><dt className="text-[10px] text-slate-500">{label}</dt><dd className="text-right text-[11px] font-bold text-slate-700">{name || 'Não atribuído'}</dd></div>)}</dl></section>
  </div>;
}

interface FretesAtivosViewProps {
  currentUser: Employee;
  financialFreights?: FreightRecord[];
  selectedFreightIdFromNotification?: string | null;
  onClearSelectedNotificationFreight?: () => void;
  onSwitchToExpedicao?: () => void;
  onSyncNewFreightToFinanceiro?: (item: ActiveFreightCardItem) => void;
  onSyncStageToFinanceiro?: (code: string, stage: ActiveFreightStage) => void;
}

export const FretesAtivosView: React.FC<FretesAtivosViewProps> = ({
  currentUser,
  selectedFreightIdFromNotification,
  onClearSelectedNotificationFreight,
  onSwitchToExpedicao,
}) => {
  const [freights, setFreights] = useState<UnifiedFreightRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  useGlobalLoading(loading && freights.length === 0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Scope & Filters
  const [viewScope, setViewScope] = useState<'MINE' | 'TEAM'>('MINE');
  const [responsibleFilterId, setResponsibleFilterId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [stageFilter, setStageFilter] = useState<string>('TODOS');
  const [periodFilter, setPeriodFilter] = useState<'HOJE' | 'SEMANA' | 'MES' | 'TODOS'>('TODOS');

  // Operators list
  const [monitoramentoOperators, setMonitoramentoOperators] = useState<FreightOperatorOption[]>([]);
  const [canViewTeam, setCanViewTeam] = useState<boolean>(() => canViewFreightTeam(currentUser));

  // Selected Freight & Sub-collections
  const [selectedFreight, setSelectedFreight] = useState<UnifiedFreightRecord | null>(null);
  const [detailAnexos, setDetailAnexos] = useState<UnifiedFreightAttachment[]>([]);
  const [detailOcorrencias, setDetailOcorrencias] = useState<UnifiedFreightOccurrence[]>([]);
  const [detailHistorico, setDetailHistorico] = useState<UnifiedFreightHistoryEntry[]>([]);
  const [activeTab, setActiveTab] = useState<
    'RESUMO' | 'ACOMPANHAMENTO' | 'DADOS_ORDEM' | 'ANEXOS' | 'OCORRENCIAS' | 'HISTORICO'
  >('RESUMO');

  // Monitoring Stage Advance Form
  const [targetNextStage, setTargetNextStage] =
    useState<MonitoringFreightStatus>('NOVO_PARA_CARREGAR');
  const [realEventTimeInput, setRealEventTimeInput] = useState<string>('');
  const [stageObservationInput, setStageObservationInput] = useState<string>('');
  const [deliveryAddress,setDeliveryAddress]=useState('');
  const [informedLocationInput, setInformedLocationInput] = useState<string>('');
  const [driverInstructionsInput, setDriverInstructionsInput] = useState<string>('');
  const [previsaoEntregaInput, setPrevisaoEntregaInput] = useState<string>('');
  const [actionBusy, setActionBusy] = useState<boolean>(false);

  // Return to Expedição Modal
  const [showReturnExpedicaoModal, setShowReturnExpedicaoModal] = useState<boolean>(false);
  const [returnExpedicaoReason, setReturnExpedicaoReason] = useState<string>('');

  // Occurrence creation state
  const [occTitulo, setOccTitulo] = useState<string>('');
  const [occDescricao, setOccDescricao] = useState<string>('');
  const [occSeveridade, setOccSeveridade] = useState<'BAIXA' | 'MEDIA' | 'IMPEDITIVA'>('MEDIA');
  const [occBusy, setOccBusy] = useState<boolean>(false);

  // Attachment upload state
  const [attCategory, setAttCategory] = useState<FreightAttachmentCategory>('COMPROVANTE_ENTREGA');
  const [attBusy, setAttBusy] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const detailPanelRef = useRef<HTMLElement | null>(null);
  const detailTriggerRef = useRef<HTMLElement | null>(null);
  const isDetailDocked = false;

  useEffect(() => {
    if (!selectedFreight || showReturnExpedicaoModal) return;
    const panel = detailPanelRef.current;
    const previousOverflow = document.body.style.overflow;
    if (!isDetailDocked) document.body.style.overflow = 'hidden';
    panel?.querySelector<HTMLButtonElement>('[data-detail-close]')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setSelectedFreight(null); }
      if (event.key !== 'Tab' || isDetailDocked || !panel) return;
      const controls = Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')).filter(node => node.getClientRects().length > 0);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', keydown); detailTriggerRef.current?.focus(); };
  }, [selectedFreight?.id, isDetailDocked, showReturnExpedicaoModal]);

  // Transfer responsibility state
  const [transferTargetId, setTransferTargetId] = useState<string>('');
  const [transferMotivo, setTransferMotivo] = useState<string>('');
  const [transferBusy, setTransferBusy] = useState<boolean>(false);

  const hasExpedicaoAccess = useMemo(() => canAccessExpedicaoFreights(currentUser), [currentUser]);
  const isSupervisor = useMemo(() => canTransferFreightResponsibility(currentUser), [currentUser]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  const syncMonitoringFormFromRecord = useCallback((f: UnifiedFreightRecord) => {
    const next = getNextMonitoringStage(f.situacaoMonitoramento);
    setTargetNextStage(next || f.situacaoMonitoramento || 'NOVO_PARA_CARREGAR');
    setDeliveryAddress(f.enderecoEntrega || '');
    setInformedLocationInput(f.ultimaLocalizacaoInformada || '');
    setDriverInstructionsInput(f.orientacoesMotorista || '');
    setPrevisaoEntregaInput(f.dataEntregaPrevistaIso || '');
    const nowLocal = new Date();
    const hh = String(nowLocal.getHours()).padStart(2, '0');
    const mm = String(nowLocal.getMinutes()).padStart(2, '0');
    const dd = String(nowLocal.getDate()).padStart(2, '0');
    const mo = String(nowLocal.getMonth() + 1).padStart(2, '0');
    setRealEventTimeInput(`${dd}/${mo}/${nowLocal.getFullYear()} ${hh}:${mm}`);
    setStageObservationInput('');
  }, []);

  const loadFreightFullDetails = useCallback(
    async (freightId: string) => {
      try {
        const res = await apiFetchFreightDetails(freightId);
        if (res.ok && res.freight) {
          setSelectedFreight(res.freight);
          syncMonitoringFormFromRecord(res.freight);
          setDetailAnexos(res.anexos || []);
          setDetailOcorrencias(res.ocorrencias || []);
          setDetailHistorico(res.historico || []);
        }
      } catch (err) {
        console.debug('Load monitoramento detail info:', err);
      }
    },
    [syncMonitoringFormFromRecord]
  );

  const loadOperators = useCallback(async () => {
    try {
      const res = await apiFetchFreightOperators();
      setMonitoramentoOperators(res.monitoramentoOperators || []);
      if (res.permissions) {
        const teamAllowed = Boolean(res.permissions.canViewTeam);
        setCanViewTeam(teamAllowed);
        if (teamAllowed) {
          setViewScope('TEAM');
        }
      }
    } catch (err) {
      console.debug('Load monitoramento operators info:', err);
    }
  }, []);

  const loadFreights = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await apiFetchFreightsList({
        area: 'MONITORAMENTO',
        scope: viewScope === 'TEAM' ? 'EQUIPE' : 'MEUS',
        responsavelId: viewScope === 'TEAM' && responsibleFilterId ? responsibleFilterId : undefined,
        limit: 100,
      });

      if (!res.ok) {
        setErrorMsg(res.error || 'Falha ao carregar fila de Fretes Ativos (Monitoramento).');
        return;
      }

      setFreights(res.items || []);
      setSelectedFreight((prev) => {
        if (!prev) return null;
        const updated = (res.items || []).find((f) => f.id === prev.id);
        return updated || prev;
      });
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Falha ao carregar fila de Fretes Ativos (Monitoramento).'
      );
    } finally {
      setLoading(false);
    }
  }, [viewScope, responsibleFilterId]);

  useEffect(() => {
    void loadOperators();
  }, [loadOperators]);

  useEffect(() => {
    void loadFreights();
  }, [loadFreights]);

  // Open specific freight when clicked from notification ("Novo frete para carregar — #0842...")
  useEffect(() => {
    if (!selectedFreightIdFromNotification) return;
    void loadFreightFullDetails(selectedFreightIdFromNotification).finally(() => {
      if (onClearSelectedNotificationFreight) onClearSelectedNotificationFreight();
    });
  }, [
    selectedFreightIdFromNotification,
    loadFreightFullDetails,
    onClearSelectedNotificationFreight,
  ]);

  // Filtered freights
  const filteredFreights = useMemo(() => {
    const now = new Date();
    const todayIso = now.toISOString().slice(0, 10);

    return freights.filter((f) => {
      if (f.situacaoComercial === 'CANCELADO' || f.situacaoOperacional === 'CANCELADO') {
        return false;
      }

      if (viewScope === 'MINE' && f.monitoramentoResponsavelId !== currentUser.id) {
        return false;
      }

      if (stageFilter !== 'TODOS' && f.situacaoMonitoramento !== stageFilter) {
        return false;
      }

      if (periodFilter !== 'TODOS') {
        const refDate = f.dataColetaIso || f.createdAtIso.slice(0, 10);
        if (periodFilter === 'HOJE' && refDate !== todayIso) return false;
        if (periodFilter === 'SEMANA') {
          const diffDays =
            Math.abs(new Date(refDate).getTime() - now.getTime()) / (1000 * 3600 * 24);
          if (diffDays > 7) return false;
        }
        if (periodFilter === 'MES' && refDate.slice(0, 7) !== todayIso.slice(0, 7)) {
          return false;
        }
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const match =
          f.protocol.toLowerCase().includes(q) ||
          f.cliente.toLowerCase().includes(q) ||
          f.origemCidadeUf.toLowerCase().includes(q) ||
          f.destinoCidadeUf.toLowerCase().includes(q) ||
          (f.motoristaNome || '').toLowerCase().includes(q) ||
          (f.placaVeiculo || '').toLowerCase().includes(q) ||
          (f.ultimaLocalizacaoInformada || '').toLowerCase().includes(q) ||
          (f.monitoramentoResponsavelNome || '').toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [freights, viewScope, stageFilter, periodFilter, searchQuery, currentUser.id]);

  // Summary counters
  const stats = useMemo(() => {
    const active = freights.filter(
      (f) => f.situacaoComercial !== 'CANCELADO' && f.situacaoOperacional !== 'CANCELADO'
    );
    return {
      novosParaCarregar: active.filter((f) => f.situacaoMonitoramento === 'NOVO_PARA_CARREGAR')
        .length,
      emColetaDeslocamento: active.filter(
        (f) =>
          f.situacaoMonitoramento === 'EM_DESLOCAMENTO_COLETA' ||
          f.situacaoMonitoramento === 'NO_LOCAL_COLETA'
      ).length,
      emTransporteEntrega: active.filter(
        (f) =>
          f.situacaoMonitoramento === 'CARREGADO_EM_TRANSPORTE' ||
          f.situacaoMonitoramento === 'NO_LOCAL_ENTREGA' ||
          f.situacaoMonitoramento === 'ENTREGUE'
      ).length,
      finalizados: active.filter((f) => f.situacaoMonitoramento === 'FINALIZADO').length,
      pendencias: active.filter((f) => f.ocorrenciasAbertasCount > 0).length,
    };
  }, [freights]);

  const handleSelectFreight = (f: UnifiedFreightRecord) => {
    setActiveTab('RESUMO');
    setSelectedFreight(f);
    syncMonitoringFormFromRecord(f);
    void loadFreightFullDetails(f.id);
  };

  const handleAdvanceMonitoringStage = async (
    e: React.FormEvent,
    explicitStage?: MonitoringFreightStatus
  ) => {
    e.preventDefault();
    if (!selectedFreight) return;
    const stageToApply = explicitStage || targetNextStage;
    setActionBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiMonitoramentoAction(selectedFreight.id, {
        action: 'AVANCAR_ETAPA',
        targetStage: stageToApply,
        horarioRealEvento: realEventTimeInput.trim() || undefined,
        ultimaLocalizacaoInformada: informedLocationInput.trim() || undefined,
        orientacoesMotorista: driverInstructionsInput.trim() || undefined,
        dataEntregaPrevistaIso: previsaoEntregaInput || undefined,
        observacoes: stageObservationInput.trim() || undefined,
        baseRevision: selectedFreight.revision,
      });

      if (!res.ok || !res.freight) {
        setErrorMsg(res.error || 'Erro ao avançar etapa do monitoramento.');
        return;
      }

      const updated = res.freight;
      setFreights((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      setSelectedFreight(updated);
      syncMonitoringFormFromRecord(updated);
      if (res.historico) setDetailHistorico(res.historico);
      showToast(
        `Frete ${updated.protocol} atualizado para "${formatSituacaoMonitoramentoLabel(
          updated.situacaoMonitoramento
        )}"!`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao avançar etapa do monitoramento.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleSaveLocationAndInstructions = async () => {
    if (!selectedFreight) return;
    setActionBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiMonitoramentoAction(selectedFreight.id, {
        action: 'REGISTRAR_LOCALIZACAO_ORIENTACAO',
        enderecoEntrega: deliveryAddress.trim() || undefined,
        horarioRealEvento: realEventTimeInput.trim() || undefined,
        ultimaLocalizacaoInformada: informedLocationInput.trim(),
        orientacoesMotorista: driverInstructionsInput.trim(),
        dataEntregaPrevistaIso: previsaoEntregaInput || undefined,
        observacoes: stageObservationInput.trim() || undefined,
        baseRevision: selectedFreight.revision,
      });

      if (!res.ok || !res.freight) {
        setErrorMsg(res.error || 'Erro ao registrar localização/orientação.');
        return;
      }

      const updated = res.freight;
      setFreights((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      setSelectedFreight(updated);
      syncMonitoringFormFromRecord(updated);
      if (res.historico) setDetailHistorico(res.historico);
      showToast(`Localização informada e orientações salvas no frete ${updated.protocol}.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao registrar localização/orientação.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleReturnToExpedicao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFreight) return;
    if (!returnExpedicaoReason.trim()) {
      setErrorMsg('Informe o motivo obrigatório para devolver o frete à Expedição.');
      return;
    }
    setActionBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiMonitoramentoAction(selectedFreight.id, {
        action: 'DEVOLVER_EXPEDICAO',
        motivo: returnExpedicaoReason.trim(),
        baseRevision: selectedFreight.revision,
      });
      if (!res.ok || !res.freight) {
        setErrorMsg(res.error || 'Erro ao devolver à Expedição.');
        return;
      }
      const updated = res.freight;
      setFreights((prev) => prev.filter((f) => f.id !== updated.id));
      setSelectedFreight(null);
      setShowReturnExpedicaoModal(false);
      setReturnExpedicaoReason('');
      showToast(`Frete ${updated.protocol} devolvido à Expedição para correção.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao devolver à Expedição.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleCreateOccurrence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFreight || !occTitulo.trim()) return;
    setOccBusy(true);
    try {
      const res = await apiRegisterFreightOccurrence(selectedFreight.id, {
        title: occTitulo.trim(),
        description: occDescricao.trim(),
        severity: occSeveridade,
      });
      if (!res.ok || !res.freight) {
        setErrorMsg(res.error || 'Erro ao registrar ocorrência.');
        return;
      }
      const updated = res.freight;
      setFreights((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      setSelectedFreight(updated);
      if (res.ocorrencias) setDetailOcorrencias(res.ocorrencias);
      if (res.historico) setDetailHistorico(res.historico);
      setOccTitulo('');
      setOccDescricao('');
      showToast('Ocorrência de monitoramento registrada.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao registrar ocorrência.');
    } finally {
      setOccBusy(false);
    }
  };

  const handleResolveOccurrence = async (occId: string) => {
    if (!selectedFreight) return;
    setOccBusy(true);
    try {
      const res = await apiResolveFreightOccurrence(selectedFreight.id, occId);
      if (!res.ok || !res.freight) {
        setErrorMsg(res.error || 'Erro ao resolver ocorrência.');
        return;
      }
      const updated = res.freight;
      setFreights((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      setSelectedFreight(updated);
      if (res.ocorrencias) setDetailOcorrencias(res.ocorrencias);
      if (res.historico) setDetailHistorico(res.historico);
      showToast('Ocorrência marcada como resolvida.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao resolver ocorrência.');
    } finally {
      setOccBusy(false);
    }
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedFreight) return;
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('O arquivo excede o limite de 10 MB.');
      return;
    }
    setAttBusy(true);
    setErrorMsg(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Falha ao ler arquivo.'));
        reader.readAsDataURL(file);
      });

      const res = await apiUploadFreightAttachment(selectedFreight.id, {
        category: attCategory,
        fileName: file.name,
        label: file.name,
        dataUrl,
      });

      if (!res.ok || !res.freight) {
        setErrorMsg(res.error || 'Erro ao enviar anexo.');
        return;
      }

      const updated = res.freight;
      setFreights((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      setSelectedFreight(updated);
      if (res.anexos) setDetailAnexos(res.anexos);
      if (res.historico) setDetailHistorico(res.historico);
      showToast(`Comprovante/anexo "${file.name}" enviado.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao enviar anexo.');
    } finally {
      setAttBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleVerifyAttachment = async (attId: string) => {
    if (!selectedFreight) return;
    setAttBusy(true);
    try {
      const res = await apiVerifyFreightAttachment(selectedFreight.id, attId, true);
      if (!res.ok || !res.freight) {
        setErrorMsg(res.error || 'Erro ao conferir comprovante.');
        return;
      }
      const updated = res.freight;
      setFreights((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      setSelectedFreight(updated);
      if (res.anexos) setDetailAnexos(res.anexos);
      if (res.historico) setDetailHistorico(res.historico);
      showToast('Comprovante conferido e validado.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao conferir comprovante.');
    } finally {
      setAttBusy(false);
    }
  };

  const handleTransferMonitoramento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFreight || !transferTargetId || !transferMotivo.trim()) return;
    setTransferBusy(true);
    try {
      const res = await apiTransferFreightResponsibility(selectedFreight.id, {
        sector: 'MONITORAMENTO',
        newResponsibleId: transferTargetId,
        reason: transferMotivo.trim(),
        baseRevision: selectedFreight.revision,
      });
      if (!res.ok || !res.freight) {
        setErrorMsg(res.error || 'Erro ao transferir responsabilidade.');
        return;
      }
      const updated = res.freight;
      setFreights((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      setSelectedFreight(updated);
      if (res.historico) setDetailHistorico(res.historico);
      setTransferTargetId('');
      setTransferMotivo('');
      showToast('Responsabilidade de monitoramento transferida.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao transferir responsabilidade.');
    } finally {
      setTransferBusy(false);
    }
  };

  return (
    <div className="fa-surface space-y-4">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 bg-[#080B0D] text-white border-l-4 border-[#FFD400] px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 text-xs font-bold max-w-md">
          <CheckCircle2 className="w-4 h-4 text-[#FFD400] shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* 1. HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-1">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-black text-[#15191D] tracking-tight">
              Fretes Ativos — Monitoramento Operacional
            </h1>
            {hasExpedicaoAccess && onSwitchToExpedicao && (
              <button
                type="button"
                onClick={onSwitchToExpedicao}
                className="inline-flex items-center gap-1.5 text-[11px] font-extrabold bg-[#080B0D] text-[#FFD400] px-3 py-1 rounded-lg hover:bg-gray-800 transition cursor-pointer"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span>Ir para Expedição</span>
              </button>
            )}
          </div>
          <p className="text-xs text-gray-500 font-medium mt-0.5">
            Acompanhamento em tempo real da coleta à entrega dos fretes liberados pela Expedição
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center gap-2 bg-white border border-gray-200/90 rounded-full pl-1.5 pr-3.5 py-1 shadow-2xs">
            <div className="w-7 h-7 rounded-full bg-[#FFD400] text-[#080B0D] font-black text-xs flex items-center justify-center">
              {getInitials(currentUser.name)}
            </div>
            <span className="text-xs font-extrabold text-[#15191D]">
              {currentUser.name.split(' ').slice(0, 2).join(' ')}
            </span>
            <span className="text-xs text-gray-400">•</span>
            <span className="text-xs font-semibold text-gray-500">Operador de Monitoramento</span>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-900 rounded-xl p-3 text-xs font-bold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#E5252A] shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-red-700 hover:text-red-950 font-black cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. TOP SUMMARY CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-white rounded-2xl p-3.5 border border-gray-200/80 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200/60 flex items-center justify-center text-amber-700 shrink-0">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-gray-500">Novos p/ carregar</p>
            <p className="text-xl font-black text-amber-800 tabular-nums leading-tight">
              {stats.novosParaCarregar}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-3.5 border border-gray-200/80 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200/60 flex items-center justify-center text-blue-700 shrink-0">
            <Navigation className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-gray-500">Desloc. / Na coleta</p>
            <p className="text-xl font-black text-blue-800 tabular-nums leading-tight">
              {stats.emColetaDeslocamento}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-3.5 border border-gray-200/80 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200/60 flex items-center justify-center text-sky-700 shrink-0">
            <MapPin className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-gray-500">Em trânsito / Entrega</p>
            <p className="text-xl font-black text-sky-800 tabular-nums leading-tight">
              {stats.emTransporteEntrega}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-3.5 border border-gray-200/80 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200/60 flex items-center justify-center text-emerald-700 shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-gray-500">Finalizados</p>
            <p className="text-xl font-black text-emerald-700 tabular-nums leading-tight">
              {stats.finalizados}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-3.5 border border-gray-200/80 shadow-2xs flex items-center gap-3 col-span-2 lg:col-span-1">
          <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-200/60 flex items-center justify-center text-[#E5252A] shrink-0">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-gray-500">Pendências</p>
            <p className="text-xl font-black text-[#E5252A] tabular-nums leading-tight">
              {stats.pendencias}
            </p>
          </div>
        </div>
      </div>

      {/* 3. FILTER BAR */}
      <div className="bg-white rounded-2xl p-3 border border-gray-200/80 shadow-2xs flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar protocolo, motorista, placa, localização..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#F3F5F7] border border-gray-200 text-xs text-[#15191D] placeholder-gray-400 focus:outline-none focus:border-[#FFD400]"
            />
          </div>

          <div className="inline-flex items-center gap-1.5 bg-[#F3F5F7] border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs">
            <User className="w-3.5 h-3.5 text-gray-500" />
            <select
              value={
                viewScope === 'MINE' ? 'MINE' : responsibleFilterId || 'TEAM'
              }
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'MINE') {
                  setViewScope('MINE');
                  setResponsibleFilterId('');
                } else if (val === 'TEAM') {
                  setViewScope('TEAM');
                  setResponsibleFilterId('');
                } else {
                  setViewScope('TEAM');
                  setResponsibleFilterId(val);
                }
              }}
              className="bg-transparent font-semibold text-[#15191D] focus:outline-none cursor-pointer"
            >
              <option value="MINE">
                Meus fretes em monitoramento ({currentUser.name.split(' ')[0]})
              </option>
              {canViewTeam && <option value="TEAM">Todos os Operadores (Equipe)</option>}
              {canViewTeam &&
                monitoramentoOperators.map((op) => (
                  <option key={op.id} value={op.id}>
                    Operador: {op.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="inline-flex items-center gap-1.5 bg-[#F3F5F7] border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs">
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              className="bg-transparent font-semibold text-[#15191D] focus:outline-none cursor-pointer"
            >
              <option value="TODOS">Etapa do Monitoramento: Todas</option>
              {MONITORING_STAGES_ORDER.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="inline-flex items-center gap-1.5 bg-[#F3F5F7] border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs">
            <Calendar className="w-3.5 h-3.5 text-gray-500" />
            <select
              value={periodFilter}
              onChange={(e) =>
                setPeriodFilter(e.target.value as 'HOJE' | 'SEMANA' | 'MES' | 'TODOS')
              }
              className="bg-transparent font-semibold text-[#15191D] focus:outline-none cursor-pointer"
            >
              <option value="TODOS">Todos os dias</option>
              <option value="HOJE">Coletas de hoje</option>
              <option value="SEMANA">Esta semana</option>
              <option value="MES">Este mês</option>
            </select>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void loadFreights()}
          className="inline-flex items-center gap-1.5 bg-[#F3F5F7] hover:bg-gray-200 text-[#15191D] text-xs font-bold px-3 py-2 rounded-xl border border-gray-200 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Atualizar</span>
        </button>
      </div>

      {/* 4. CARDS E PAINEL LATERAL — mesmas consultas e ações existentes */}
      <div className={`fa-workspace ${selectedFreight ? 'fa-workspace--open' : ''}`}>
        <div className="fa-card-region">
          <div className="fa-list-meta"><span>{filteredFreights.length} frete(s) nos filtros atuais</span><span>Monitoramento operacional</span></div>
          {loading && filteredFreights.length === 0 ? (
            <div className="fa-empty" role="status"><RefreshCw className="h-7 w-7 animate-spin text-slate-300" />Carregando fretes em monitoramento...</div>
          ) : filteredFreights.length === 0 ? (
            <div className="fa-empty"><Truck className="h-9 w-9 text-slate-300" /><strong className="text-sm text-slate-600">Nenhum frete ativo encontrado</strong><p>Nenhum frete ativo encontrado para os filtros selecionados.</p></div>
          ) : (
            <div className="fa-card-grid">{filteredFreights.map(f => <FreightCard key={f.id} freight={f} selected={selectedFreight?.id === f.id} onOpen={event => {detailTriggerRef.current = event.currentTarget; handleSelectFreight(f);}} />)}</div>
          )}
        </div>

        {/* RIGHT: Monitoring Operational Side Panel */}
        {selectedFreight && (
          <div className="fa-drawer-shell">
            {!isDetailDocked && <div className="fa-drawer-backdrop" aria-hidden="true" onClick={() => setSelectedFreight(null)} />}
            <aside id="active-freight-detail" ref={detailPanelRef} className="fa-detail-panel" role="dialog" aria-modal="true" aria-labelledby="active-freight-title">
            <div className="fa-detail-heading"><div className="fa-detail-banner" aria-hidden="true"><span>RODOVAR CONECTA</span><strong>Detalhes do Frete</strong><p>Acompanhe o andamento, documentos e histórico da operação.</p></div><div className="fa-carrier-identity"><span>Transportadora</span>{selectedFreight.empresaMarca&&CARRIER_BRANDS.includes(selectedFreight.empresaMarca)?<CarrierBrandLogo brand={selectedFreight.empresaMarca} size="lg"/>:<strong>Não informada no cadastro</strong>}</div>
              <div className="flex items-center justify-between gap-3"><h2 id="active-freight-title" className="text-base font-black tracking-tight text-[#15191D]">Detalhes do frete</h2><button type="button" data-detail-close onClick={() => setSelectedFreight(null)} className="fa-detail-close" aria-label="Fechar detalhes do frete"><X size={19} /></button></div>
              <div className="mt-4 flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-2 text-sm font-black text-[#15191D]"><span className="rounded-lg bg-amber-50 p-1.5 text-amber-700"><Truck size={16} /></span>{selectedFreight.protocol}</span><span className={`rounded-lg border px-2 py-1 text-[10px] font-extrabold ${getMonitoringBadgeStyle(selectedFreight.situacaoMonitoramento)}`}>{formatSituacaoMonitoramentoLabel(selectedFreight.situacaoMonitoramento)}</span></div>
              <p className="mt-3 text-xs font-extrabold text-slate-800">{selectedFreight.cliente}</p><p className="mt-1 text-[11px] leading-relaxed text-slate-500">{selectedFreight.origemCidadeUf} → {selectedFreight.destinoCidadeUf}</p>
              <p className="mt-2 text-[10px] font-medium text-slate-400">Financeiro: {formatSituacaoFinanceiraLabel(selectedFreight.situacaoFinanceira)}</p>
            </div>

            <div className="fa-modal-facts">
              <div><Calendar size={19}/><span>Data da Coleta<strong>{formatIsoDateBr(selectedFreight.dataColetaIso)}</strong></span></div>
              <div><Flag size={19}/><span>Previsão de Entrega<strong>{formatIsoDateBr(selectedFreight.dataEntregaPrevistaIso)}</strong></span></div>
              <div><Truck size={19}/><span>Veículo<strong>{selectedFreight.placaVeiculo||'Não informado'}</strong></span></div>
              <div><User size={19}/><span>Motorista<strong>{selectedFreight.motoristaNome||'Não informado'}</strong></span></div>
            </div>

            {/* Tabs */}
            <div className="fa-detail-tabs" role="group" aria-label="Seções dos detalhes do frete">
              {[
                { id: 'RESUMO', label: 'Resumo' },
                { id: 'DADOS_ORDEM', label: 'Motorista e Veículo' },
                { id: 'ACOMPANHAMENTO', label: 'Monitoramento' },
                { id: 'ANEXOS', label: `Documentos (${detailAnexos.length})` },
                { id: 'HISTORICO', label: 'Histórico' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={activeTab === tab.id}
                  aria-controls="active-freight-content"
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={`px-3 py-2 text-xs font-extrabold rounded-t-xl border-b-2 transition cursor-pointer whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'bg-[#080B0D] text-[#FFD400] border-[#FFD400]'
                      : 'text-gray-500 border-transparent hover:text-[#15191D]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Body */}
            <div id="active-freight-content" className="fa-detail-body space-y-4">
              <section className="fa-stage-progress" aria-label="Etapas do monitoramento">
                <p>Etapas do monitoramento</p>
                <ol className="fa-stage-timeline">
                  {MONITORING_STAGES_ORDER.map((st, idx) => {
                    const currentIdx = MONITORING_STAGES_ORDER.findIndex(s => s.id === selectedFreight.situacaoMonitoramento);
                    const isCurrent = st.id === selectedFreight.situacaoMonitoramento;
                    const isDone = currentIdx > idx;
                    return <li key={st.id} data-state={isCurrent ? 'current' : isDone ? 'done' : 'pending'} aria-current={isCurrent ? 'step' : undefined}><span className="fa-stage-number" aria-hidden="true">{isDone ? <Check size={14}/> : idx + 1}</span><span>{st.label}</span></li>;
                  })}
                </ol>
              </section>

              {activeTab==='RESUMO'&&<FreightOverview freight={selectedFreight}/>}
              {/* TAB 1: ACOMPANHAMENTO E AVANÇO DE ETAPA */}
              {activeTab === 'ACOMPANHAMENTO' && (
                <div className="space-y-3.5">

                  <h3 className="pt-2 text-xs font-black text-slate-700">Operação do monitoramento</h3>

                  {/* Avançar Etapa do Monitoramento */}
                  <form
                    onSubmit={(e) => void handleAdvanceMonitoringStage(e)}
                    className="fa-monitoring-form bg-[#FFFDF0] border-2 border-[#FFD400] rounded-2xl p-3.5 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-black text-[#080B0D] uppercase">
                        Avançar Etapa do Monitoramento
                      </p>
                      <span className="text-[10px] font-bold text-gray-600">
                        Atual: {formatSituacaoMonitoramentoLabel(selectedFreight.situacaoMonitoramento)}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label htmlFor="fa-next-stage" className="block text-[11px] font-extrabold text-[#15191D] mb-1">
                          Nova Etapa *
                        </label>
                        <select id="fa-next-stage"
                          value={targetNextStage}
                          onChange={(e) =>
                            setTargetNextStage(e.target.value as MonitoringFreightStatus)
                          }
                          className="w-full px-2.5 py-2 rounded-xl border border-gray-300 bg-white text-xs font-bold text-[#15191D]"
                        >
                          {MONITORING_STAGES_ORDER.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label htmlFor="fa-real-event" className="block text-[11px] font-extrabold text-[#15191D] mb-1">
                          Horário Real do Evento (informado)
                        </label>
                        <input id="fa-real-event"
                          type="text"
                          value={realEventTimeInput}
                          onChange={(e) => setRealEventTimeInput(e.target.value)}
                          placeholder="Ex.: 29/10/2026 14:30"
                          className="w-full px-2.5 py-2 rounded-xl border border-gray-300 bg-white text-xs"
                        />
                      </div>

                      <label className="block sm:col-span-2 text-[11px] font-bold text-gray-700">Endereço detalhado de entrega<input className="mt-1 block w-full rounded-xl border border-gray-300 bg-white px-2.5 py-2 text-xs" value={deliveryAddress} onChange={e=>setDeliveryAddress(e.target.value)} maxLength={240}/></label>
<div className="sm:col-span-2">
                        <label htmlFor="fa-location" className="block text-[11px] font-extrabold text-[#15191D] mb-1">
                          Localização Informada pelo Motorista (sem simulação de GPS)
                        </label>
                        <input id="fa-location"
                          type="text"
                          value={informedLocationInput}
                          onChange={(e) => setInformedLocationInput(e.target.value)}
                          placeholder="Ex.: BR-116 km 420 — Feira de Santana/BA (Posto São Gonçalo)"
                          className="w-full px-2.5 py-1.5 rounded-xl border border-gray-300 bg-white text-xs"
                        />
                      </div>

                      <div>
                        <label htmlFor="fa-expected-delivery" className="block text-[11px] font-bold text-gray-700 mb-1">
                          Previsão Atualizada de Entrega
                        </label>
                        <input id="fa-expected-delivery"
                          type="date"
                          value={previsaoEntregaInput}
                          onChange={(e) => setPrevisaoEntregaInput(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-xl border border-gray-300 bg-white text-xs"
                        />
                      </div>

                      <div>
                        <label htmlFor="fa-stage-note" className="block text-[11px] font-bold text-gray-700 mb-1">
                          Observação da Etapa
                        </label>
                        <input id="fa-stage-note"
                          type="text"
                          value={stageObservationInput}
                          onChange={(e) => setStageObservationInput(e.target.value)}
                          placeholder="Ex.: Motorista iniciou carregamento na doca 4"
                          className="w-full px-2.5 py-1.5 rounded-xl border border-gray-300 bg-white text-xs"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label htmlFor="fa-driver-guidance" className="block text-[11px] font-bold text-gray-700 mb-1">
                          Contatos e Orientações Passadas ao Motorista
                        </label>
                        <textarea id="fa-driver-guidance"
                          rows={2}
                          value={driverInstructionsInput}
                          onChange={(e) => setDriverInstructionsInput(e.target.value)}
                          placeholder="Orientações de rota, parada autorizada, envio de canhoto..."
                          className="w-full px-2.5 py-1.5 rounded-xl border border-gray-300 bg-white text-xs"
                        />
                      </div>
                    </div>

                    {/* Aviso de requisitos para Finalizar */}
                    {targetNextStage === 'FINALIZADO' && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-[11px] text-amber-950 space-y-1">
                        <p className="font-extrabold">Requisitos para Finalizar o Frete:</p>
                        <p>
                          • Etapa anterior <strong>Entregue</strong> confirmada;
                        </p>
                        <p>
                          • <strong>Comprovante de Entrega</strong> anexado e marcado como{' '}
                          <strong>Conferido</strong> na aba Comprovantes;
                        </p>
                        <p>• Nenhuma ocorrência impeditiva em aberto.</p>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        disabled={actionBusy}
                        className="flex-1 bg-[#080B0D] hover:bg-gray-800 text-[#FFD400] font-black py-2.5 px-4 rounded-xl shadow-sm transition cursor-pointer text-xs"
                      >
                        {actionBusy
                          ? 'Salvando...'
                          : `Registrar Etapa: ${formatSituacaoMonitoramentoLabel(targetNextStage)}`}
                      </button>

                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={handleSaveLocationAndInstructions}
                        className="bg-white hover:bg-gray-100 text-[#15191D] border border-gray-300 font-extrabold py-2.5 px-3 rounded-xl transition cursor-pointer text-xs"
                      >
                        Salvar Localização / Orientação
                      </button>
                    </div>
                  </form>

                  {/* Botão Devolver à Expedição para Correção */}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => printIsolatedOrdemColeta(selectedFreight)}
                      className="inline-flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-[#15191D] font-extrabold px-3 py-2 rounded-xl text-xs cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Ordem de Coleta (PDF)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowReturnExpedicaoModal(true)}
                      className="inline-flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-[#E5252A] border border-red-200 font-extrabold px-3 py-2 rounded-xl text-xs cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Devolver à Expedição p/ correção</span>
                    </button>
                  </div>

                  {/* Transferência de Responsabilidade no Monitoramento */}
                  {isSupervisor && (
                    <form
                      onSubmit={handleTransferMonitoramento}
                      className="bg-[#F8FAFC] rounded-xl p-3 border border-gray-200 space-y-2"
                    >
                      <p className="text-[11px] font-extrabold text-[#15191D] uppercase">
                        Transferir Operador de Monitoramento
                      </p>
                      <select
                        value={transferTargetId}
                        onChange={(e) => setTransferTargetId(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs bg-white"
                      >
                        <option value="">Selecione o novo Operador...</option>
                        {monitoramentoOperators.map((op) => (
                          <option key={op.id} value={op.id}>
                            {op.name} ({op.roleTitle})
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={transferMotivo}
                        onChange={(e) => setTransferMotivo(e.target.value)}
                        placeholder="Motivo da transferência de plantão/operador..."
                        className="w-full px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs"
                      />
                      <button
                        type="submit"
                        disabled={transferBusy || !transferTargetId || !transferMotivo.trim()}
                        className="bg-[#080B0D] text-[#FFD400] font-extrabold px-3 py-1.5 rounded-lg text-xs cursor-pointer disabled:opacity-50"
                      >
                        Confirmar transferência
                      </button>
                    </form>
                  )}
                </div>
              )}

              {/* TAB 2: DADOS OPERACIONAIS E ORDEM DE COLETA */}
              {activeTab === 'DADOS_ORDEM' && (
                <div className="space-y-3">
                  <div className="bg-[#F8FAFC] rounded-xl p-3.5 border border-gray-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="font-extrabold text-[#15191D] uppercase text-[11px]">
                        Dados Operacionais Recebidos da Expedição
                      </p>
                      <button
                        type="button"
                        onClick={() => printIsolatedOrdemColeta(selectedFreight)}
                        className="inline-flex items-center gap-1 bg-[#FFD400] text-[#080B0D] font-extrabold px-2.5 py-1 rounded-lg text-[11px] cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Imprimir Ordem de Coleta</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase">
                          Endereço de Coleta
                        </p>
                        <p className="font-bold text-[#15191D]">
                          {selectedFreight.enderecoColeta || '—'} ({selectedFreight.origemCidadeUf})
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase">
                          Endereço de Entrega
                        </p>
                        <p className="font-bold text-[#15191D]">
                          {selectedFreight.enderecoEntrega || '—'} ({selectedFreight.destinoCidadeUf})
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase">
                          Contato Coleta / Entrega
                        </p>
                        <p className="font-bold text-[#15191D]">
                          {selectedFreight.clienteContato || '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase">
                          Carga / Peso / Veículo
                        </p>
                        <p className="font-bold text-[#15191D]">
                          {selectedFreight.tipoCarga || '—'}{' '}
                          {selectedFreight.pesoKg ? `• ${selectedFreight.pesoKg} kg` : ''} •{' '}
                          {selectedFreight.veiculoNecessario || '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase">
                          Motorista / CPF
                        </p>
                        <p className="font-bold text-[#15191D]">
                          {selectedFreight.motoristaNome || '—'} ({selectedFreight.motoristaCpf || '—'})
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase">
                          Transportadora / Placas
                        </p>
                        <p className="font-bold text-[#15191D]">
                          {selectedFreight.transportadorNome || '—'} •{' '}
                          {selectedFreight.placaVeiculo || '—'}{' '}
                          {selectedFreight.placaCarreta ? `/ ${selectedFreight.placaCarreta}` : ''}
                        </p>
                      </div>
{(currentUser.accessProfile==='FINANCEIRO'||currentUser.accessProfile==='DIRETORIA'||currentUser.accessLevel==='ADMINISTRADOR')&&(                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase">
                          Valor Contratado Motorista
                        </p>
                        <p className="font-black text-[#15191D]">
                          {formatCentavosToBrl(selectedFreight.valorContratadoCentavos)}
                        </p>
                      </div>)}
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase">
                          Situação Financeira Independente
                        </p>
                        <p className="font-bold text-[#15191D]">
                          {formatSituacaoFinanceiraLabel(selectedFreight.situacaoFinanceira)}
                        </p>
                      </div>
                    </div>

                    {(selectedFreight.instrucoesColetaEntrega ||
                      selectedFreight.condicoesOperacionais) && (
                      <div className="pt-2 border-t border-gray-200">
                        <p className="text-[10px] font-bold text-gray-400 uppercase">
                          Instruções de Coleta e Entrega
                        </p>
                        <p className="text-gray-700 mt-0.5">
                          {selectedFreight.instrucoesColetaEntrega ||
                            selectedFreight.condicoesOperacionais}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: COMPROVANTES E ANEXOS */}
              {activeTab === 'ANEXOS' && (
                <div className="space-y-3"><button type="button" className="fa-details-order-button" onClick={()=>printIsolatedOrdemColeta(selectedFreight)}><Printer size={16}/>Ordem de Coleta</button>
                  <div className="bg-[#F8FAFC] p-3 rounded-xl border border-gray-200 space-y-2">
                    <p className="font-extrabold text-[#15191D]">
                      Anexar Comprovante de Entrega ou Documento
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={attCategory}
                        onChange={(e) =>
                          setAttCategory(e.target.value as FreightAttachmentCategory)
                        }
                        className="flex-1 px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs bg-white"
                      >
                        <option value="COMPROVANTE_ENTREGA">
                          Comprovante de Entrega / Canhoto Assinado
                        </option>
                        <option value="CTE">CT-e / Nota Fiscal</option>
                        <option value="MDFE">MDF-e</option>
                        <option value="ORDEM_CARREGAMENTO">Ordem de Coleta</option>
                        <option value="OUTRO">Outro Anexo</option>
                      </select>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,image/*"
                        onChange={handleUploadFile}
                        className="hidden"
                      />
                      <button
                        type="button"
                        disabled={attBusy}
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] font-extrabold px-3.5 py-1.5 rounded-lg cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>{attBusy ? 'Enviando...' : 'Anexar Arquivo'}</span>
                      </button>
                    </div>
                  </div>

                  {detailAnexos.length === 0 ? (
                    <p className="text-center text-gray-400 py-6">
                      Nenhum comprovante ou anexo vinculado a este frete.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {detailAnexos.map((att) => (
                        <div
                          key={att.id}
                          className="p-3 rounded-xl border border-gray-200 flex items-center justify-between gap-2 bg-white"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-extrabold bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                                {att.category}
                              </span>
                              {att.conferido ? (
                                <span className="text-[10px] font-extrabold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded">
                                  ✓ Conferido ({att.conferidoPorNome})
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold bg-amber-50 text-amber-800 px-2 py-0.5 rounded">
                                  Aguardando conferência
                                </span>
                              )}
                            </div>
                            <p className="font-bold text-[#15191D] truncate mt-1">
                              {att.fileName}
                            </p>
                            <p className="text-[10px] text-gray-400">
                              Enviado por {att.uploadedByName} em {att.uploadedAtFormatted}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                void apiDownloadFreightAttachment(
                                  selectedFreight.id,
                                  att.id,
                                  att.fileName
                                )
                              }
                              className="inline-flex items-center gap-1 text-[11px] font-bold bg-gray-100 hover:bg-gray-200 text-[#15191D] px-2.5 py-1 rounded-lg cursor-pointer"
                            >
                              <Download className="w-3 h-3" />
                              <span>Baixar</span>
                            </button>
                            {!att.conferido && (
                              <button
                                type="button"
                                disabled={attBusy}
                                onClick={() => void handleVerifyAttachment(att.id)}
                                className="text-[11px] font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-lg cursor-pointer"
                              >
                                Conferir comprovante
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: OCORRÊNCIAS */}
              {(activeTab === 'OCORRENCIAS'||activeTab === 'ACOMPANHAMENTO') && (
                <div className="space-y-3">
                  <form
                    onSubmit={handleCreateOccurrence}
                    className="bg-[#F8FAFC] p-3 rounded-xl border border-gray-200 space-y-2"
                  >
                    <p className="font-extrabold text-[#15191D]">
                      Registrar Atraso, Ocorrência ou Pendência
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="text"
                        value={occTitulo}
                        onChange={(e) => setOccTitulo(e.target.value)}
                        placeholder="Título da ocorrência *"
                        className="sm:col-span-2 px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs bg-white"
                      />
                      <select
                        value={occSeveridade}
                        onChange={(e) =>
                          setOccSeveridade(
                            e.target.value as 'BAIXA' | 'MEDIA' | 'IMPEDITIVA'
                          )
                        }
                        className="px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs bg-white font-bold"
                      >
                        <option value="BAIXA">Informativa / Baixa</option>
                        <option value="MEDIA">Atenção / Atraso</option>
                        <option value="IMPEDITIVA">Impeditiva (Bloqueia Finalização)</option>
                      </select>
                    </div>
                    <textarea
                      rows={2}
                      value={occDescricao}
                      onChange={(e) => setOccDescricao(e.target.value)}
                      placeholder="Descrição detalhada da ocorrência em rota/coleta/entrega..."
                      className="w-full px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs bg-white"
                    />
                    <button
                      type="submit"
                      disabled={occBusy || !occTitulo.trim()}
                      className="bg-[#080B0D] text-[#FFD400] font-extrabold px-3.5 py-1.5 rounded-lg text-xs cursor-pointer disabled:opacity-50"
                    >
                      Registrar Ocorrência
                    </button>
                  </form>

                  {detailOcorrencias.length === 0 ? (
                    <p className="text-center text-gray-400 py-6">
                      Nenhuma ocorrência registrada neste frete.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {detailOcorrencias.map((occ) => (
                        <div
                          key={occ.id}
                          className={`p-3 rounded-xl border ${
                            !occ.resolved
                              ? occ.severity === 'IMPEDITIVA'
                                ? 'bg-red-50 border-red-200'
                                : 'bg-amber-50 border-amber-200'
                              : 'bg-gray-50 border-gray-200'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-white border">
                                  {occ.severity}
                                </span>
                                <span className="text-[10px] font-bold text-gray-500">
                                  {occ.resolved ? 'RESOLVIDA' : 'ABERTA'}
                                </span>
                              </div>
                              <p className="font-extrabold text-[#15191D] mt-1">{occ.title}</p>
                              {occ.description && (
                                <p className="text-gray-600 mt-0.5">{occ.description}</p>
                              )}
                              <p className="text-[10px] text-gray-400 mt-1">
                                Por {occ.createdByName} em {occ.createdAtFormatted}
                              </p>
                            </div>
                            {!occ.resolved && (
                              <button
                                type="button"
                                disabled={occBusy}
                                onClick={() => void handleResolveOccurrence(occ.id)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-extrabold px-2.5 py-1 rounded-lg cursor-pointer shrink-0"
                              >
                                Resolver
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 5: HISTÓRICO COMPLETO DO ACOMPANHAMENTO */}
              {activeTab === 'HISTORICO' && (
                <div className="space-y-2">
                  {detailHistorico.map((h) => (
                    <div
                      key={h.id}
                      className="p-2.5 rounded-xl bg-[#F8FAFC] border border-gray-200"
                    >
                      <div className="flex items-center justify-between text-[10px] text-gray-400">
                        <span className="font-bold text-gray-600">
                          {h.actorName} ({h.actorSector})
                        </span>
                        <span>Reg.: {h.timestampFormatted}</span>
                      </div>
                      <p className="font-bold text-[#15191D] mt-0.5">{h.summary}</p>
                      {h.horarioRealEvento && (
                        <p className="text-[11px] font-semibold text-blue-800 mt-0.5">
                          Horário real do evento: {h.horarioRealEvento}
                        </p>
                      )}
                      {h.reason && (
                        <p className="text-[11px] text-gray-600 mt-0.5">{h.reason}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            </aside>
          </div>
        )}
      </div>

      {/* =====================================================================
          MODAL: DEVOLVER À EXPEDIÇÃO PARA CORREÇÃO
      ===================================================================== */}
      {showReturnExpedicaoModal && selectedFreight && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleReturnToExpedicao}
            className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-3"
          >
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <h3 className="text-sm font-black text-[#15191D]">
                Devolver Frete {selectedFreight.protocol} à Expedição
              </h3>
              <button
                type="button"
                onClick={() => setShowReturnExpedicaoModal(false)}
                className="text-gray-400 hover:text-gray-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gray-600">
              Informe o motivo obrigatório para que a Expedição ({selectedFreight.expedicaoResponsavelNome || 'Responsável'}) faça a correção operacional necessária.
            </p>
            <textarea
              rows={3}
              required
              value={returnExpedicaoReason}
              onChange={(e) => setReturnExpedicaoReason(e.target.value)}
              placeholder="Ex.: Placa do implemento divergente ou ajuste nos dados do motorista..."
              className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowReturnExpedicaoModal(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={actionBusy}
                className="bg-[#E5252A] hover:bg-red-700 text-white text-xs font-extrabold px-4 py-2 rounded-xl cursor-pointer"
              >
                Confirmar Devolução à Expedição
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

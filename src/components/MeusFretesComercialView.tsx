import {DriverLookupButton} from './DriverCenter';
import {useGlobalLoading} from './GlobalLoading';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Plus,
  Search,
  Calendar,
  User as UserIcon,
  LayoutGrid,
  List as ListIcon,
  MapPin,
  FileText,
  CheckSquare,
  AlertTriangle,
  Send,
  X,
  Upload,
  Download,
  RefreshCw,
  CheckCircle2,
  ArrowLeftRight,
  Ban,
  Edit3,
  Save,
  RotateCcw,
} from 'lucide-react';
import { CorporateModal } from './ui/CorporateModal';
import { FreightDocumentsManager } from './FreightDocumentsManager';
import {
  CarrierBrand,
  CommercialFreightStatus,
  Employee,
  OperationalUnit,
  UnifiedFreightAttachment,
  UnifiedFreightComment,
  UnifiedFreightHistoryEntry,
  UnifiedFreightOccurrence,
  UnifiedFreightRecord,
} from '../types';
import {
  apiAddFreightComment,
  apiCancelFreight,
  apiReactivateFreight,
  apiCommercialTransition,
  apiCreateCommercialFreight,
  apiDownloadFreightAttachment,
  apiFetchFreightDetails,
  apiFetchFreightOperators,
  apiFetchFreightsList,
  apiTransferFreightResponsibility,
  apiUpdateCommercialFreight,
  apiUploadFreightAttachment,
  formatCentavosToBrl,
  FreightOperatorOption,
  parseBrlInputToCentavos,
} from '../lib/serverApi';
import { canAccessExpedicaoFreights, canViewFreightTeam, hasPagePermission } from '../lib/permissions';

export function normalizeCnpj(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '').slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12)
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

interface MeusFretesComercialViewProps {
  currentUser: Employee;
  selectedFreightIdFromNotification?: string | null;
  onClearSelectedNotificationFreight?: () => void;
  onSwitchToExpedicao?: () => void;
  onToast?: (msg: string) => void;
}

const KANBAN_COLUMNS: Array<{
  key: CommercialFreightStatus;
  title: string;
  dotColor: string;
  topBarColor: string;
  badgeBg: string;
  badgeText: string;
}> = [
  {
    key: 'EM_NEGOCIACAO',
    title: 'Em negociação',
    dotColor: 'bg-slate-400',
    topBarColor: 'border-t-4 border-t-slate-400',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-700',
  },
  {
    key: 'AGUARDANDO_EXPEDICAO',
    title: 'Aguardando Expedição',
    dotColor: 'bg-orange-400',
    topBarColor: 'border-t-4 border-t-orange-400',
    badgeBg: 'bg-orange-50',
    badgeText: 'text-orange-700',
  },
  {
    key: 'EM_MONITORAMENTO',
    title: 'Em monitoramento',
    dotColor: 'bg-sky-500',
    topBarColor: 'border-t-4 border-t-sky-500',
    badgeBg: 'bg-sky-50',
    badgeText: 'text-sky-700',
  },
  {
    key: 'CONCLUIDO',
    title: 'Concluídos',
    dotColor: 'bg-emerald-600',
    topBarColor: 'border-t-4 border-t-emerald-600',
    badgeBg: 'bg-emerald-100/80',
    badgeText: 'text-emerald-800',
  },
];

function formatShortDate(isoDate: string): string {
  if (!isoDate) return '--/--';
  const parts = isoDate.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}`;
  }
  return isoDate;
}

function formatFullDatePtBr(isoDate: string): string {
  if (!isoDate) return '--/--/----';
  const parts = isoDate.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoDate;
}

function getInitials(name: string): string {
  const parts = String(name || 'R')
    .trim()
    .split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}

export function formatSituacaoComercialLabel(status?: string): string {
  switch (status) {
    case 'EM_NEGOCIACAO':
      return 'Em negociação';
    case 'CONTRATADO':
    case 'AGUARDANDO_EXPEDICAO':
    case 'NA_EXPEDICAO':
      return 'Aguardando Expedição';
    case 'EM_MONITORAMENTO':
    case 'EM_TRANSPORTE':
      return 'Em monitoramento';
    case 'CONCLUIDO':
    case 'FINALIZADO':
      return 'Concluído';
    case 'CANCELADO':
      return 'Cancelado';
    default:
      return status || '—';
  }
}

export function formatSituacaoOperacionalLabel(status?: string): string {
  switch (status) {
    case 'RECEBIDO':
      return 'Recebido na Expedição';
    case 'EM_PREPARACAO':
    case 'AGUARDANDO_FECHAMENTO':
      return 'Em preparação';
    case 'LIBERADO_MONITORAMENTO':
    case 'FECHADO':
    case 'AGUARDANDO_COLETA':
    case 'EM_TRANSPORTE':
      return 'Liberado ao Monitoramento';
    case 'CONCLUIDO':
      return 'Concluído';
    case 'DISPONIVEL_FILA':
      return 'Disponível na fila';
    case 'DEVOLVIDO_CORRECAO':
      return 'Devolvido para correção';
    case 'NAO_ENVIADO':
      return 'Não enviado';
    case 'CANCELADO':
      return 'Cancelado';
    default:
      return status || '—';
  }
}

export function formatSituacaoMonitoramentoLabel(status?: string): string {
  switch (status) {
    case 'NAO_LIBERADO':
      return 'Aguardando liberação da Expedição';
    case 'NOVO_PARA_CARREGAR':
      return 'Novo para carregar';
    case 'EM_DESLOCAMENTO_COLETA':
      return 'Em deslocamento para coleta';
    case 'NO_LOCAL_COLETA':
      return 'No local de coleta';
    case 'CARREGADO_EM_TRANSPORTE':
      return 'Carregado / Em transporte';
    case 'NO_LOCAL_ENTREGA':
      return 'No local de entrega';
    case 'ENTREGUE':
      return 'Entregue';
    case 'FINALIZADO':
      return 'Finalizado';
    case 'DEVOLVIDO_EXPEDICAO':
      return 'Devolvido à Expedição';
    case 'CANCELADO':
      return 'Cancelado';
    default:
      return status || '—';
  }
}

export function formatSituacaoFinanceiraLabel(status?: string): string {
  switch (status) {
    case 'NAO_INICIADO':
      return 'Não iniciado';
    case 'PENDENTE_ADIANTAMENTO':
      return 'Pendente adiantamento';
    case 'ADIANTAMENTO_PREPARADO':
      return 'Adiantamento preparado';
    case 'ADIANTAMENTO_PAGO':
      return 'Adiantamento pago';
    case 'PENDENTE_SALDO':
      return 'Pendente saldo';
    case 'SALDO_PREPARADO':
      return 'Saldo preparado';
    case 'QUITADO':
      return 'Quitado';
    case 'CANCELADO':
      return 'Cancelado';
    default:
      return status || '—';
  }
}

export const MeusFretesComercialView: React.FC<MeusFretesComercialViewProps> = ({
  currentUser,
  selectedFreightIdFromNotification,
  onClearSelectedNotificationFreight,
  onSwitchToExpedicao,
  onToast,
}) => {
  const canViewTeam = useMemo(() => canViewFreightTeam(currentUser), [currentUser]);
  const canAlsoAccessExpedicao = useMemo(
    () => canAccessExpedicaoFreights(currentUser),
    [currentUser]
  );
  const canTransfer = useMemo(
    () =>
      currentUser.accessLevel === 'ADMINISTRADOR' ||
      currentUser.accessLevel === 'DIRETORIA' ||
      hasPagePermission(currentUser, 'fretes_transferir'),
    [currentUser]
  );
  const canCancel = useMemo(
    () =>
      currentUser.accessLevel === 'ADMINISTRADOR' ||
      currentUser.accessLevel === 'DIRETORIA' ||
      hasPagePermission(currentUser, 'fretes_cancelar'),
    [currentUser]
  );

  // Filters & View State
  const [viewMode, setViewMode] = useState<'QUADRO' | 'LISTA'>('QUADRO');
  const previousViewModeRef = useRef<'QUADRO' | 'LISTA'>('QUADRO');
  const [searchRaw, setSearchRaw] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [scope, setScope] = useState<'MEUS' | 'EQUIPE'>('MEUS');
  const [periodo, setPeriodo] = useState<'TODOS' | 'HOJE' | 'ATRASADOS'>('TODOS');
  const [responsavelFilterId, setResponsavelFilterId] = useState<string>('TODOS');
  const [situacaoFilter, setSituacaoFilter] = useState<string>('TODAS');
  const [includeCanceled, setIncludeCanceled] = useState(false);
  const [columnLimit, setColumnLimit] = useState(8);

  // Reactivate Freight State (Requirement 5)
  const [reactivateFreight, setReactivateFreight] = useState<UnifiedFreightRecord | null>(null);
  const [reactivateReason, setReactivateReason] = useState('');
  const [reactivateStage, setReactivateStage] = useState<'RECEBIDO' | 'EM_PREPARACAO' | 'LIBERADO_MONITORAMENTO'>('EM_PREPARACAO');
  const [reactivating, setReactivating] = useState(false);

  const handleToggleIncludeCanceled = (checked: boolean) => {
    setIncludeCanceled(checked);
    if (checked) {
      if (viewMode !== 'LISTA') {
        previousViewModeRef.current = viewMode;
        setViewMode('LISTA');
      }
    } else {
      setViewMode(previousViewModeRef.current || 'QUADRO');
    }
  };

  // Server Data State
  const [loading, setLoading] = useState(true);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [items, setItems] = useState<UnifiedFreightRecord[]>([]);
  useGlobalLoading(loading && items.length === 0);
  const [hasMoreList, setHasMoreList] = useState(false);
  const [nextCursorList, setNextCursorList] = useState<string | null>(null);
  const [comercialCounters, setComercialCounters] = useState<Record<CommercialFreightStatus, number>>({
    EM_NEGOCIACAO: 0,
    AGUARDANDO_EXPEDICAO: 0,
    EM_MONITORAMENTO: 0,
    CONCLUIDO: 0,
    CONTRATADO: 0,
    NA_EXPEDICAO: 0,
    EM_TRANSPORTE: 0,
    FINALIZADO: 0,
    CANCELADO: 0,
  });
  const [kanbanColumns, setKanbanColumns] = useState<
    Record<
      string,
      {
        items: UnifiedFreightRecord[];
        total: number;
        hasMore: boolean;
        nextCursor: string | null;
      }
    >
  >({});

  // Operators list
  const [comercialOperators, setComercialOperators] = useState<FreightOperatorOption[]>([]);
  const [expedicaoOperators, setExpedicaoOperators] = useState<FreightOperatorOption[]>([]);

  // Active Freight Detail Drawer
  const [selectedFreightId, setSelectedFreightId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailFreight, setDetailFreight] = useState<UnifiedFreightRecord | null>(null);
  const [detailAnexos, setDetailAnexos] = useState<UnifiedFreightAttachment[]>([]);
  const [detailComentarios, setDetailComentarios] = useState<UnifiedFreightComment[]>([]);
  const [detailOcorrencias, setDetailOcorrencias] = useState<UnifiedFreightOccurrence[]>([]);
  const [detailHistorico, setDetailHistorico] = useState<UnifiedFreightHistoryEntry[]>([]);
  const [detailTab, setDetailTab] = useState<'RESUMO' | 'ANEXOS' | 'COMENTARIOS' | 'HISTORICO'>(
    'RESUMO'
  );

  // Create / Edit Modal
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingFreight, setEditingFreight] = useState<UnifiedFreightRecord | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formEditReason, setFormEditReason] = useState('');
  const [formExpedicaoAssignee, setFormExpedicaoAssignee] = useState<string>('FILA_DISPONIVEL');
  const [formState, setFormState] = useState({
    empresaMarca: 'RODOVAR' as CarrierBrand,
    unidadeOperacional: (currentUser.location || 'BA - Salvador') as OperationalUnit,
    cliente: '',
    clienteCnpj: '',
    clienteContato: '',
    origemCidadeUf: '',
    enderecoColeta: '',
    destinoCidadeUf: '',
    enderecoEntrega: '',
    instrucoesColetaEntrega: '',
    tipoCarga: '',
    pesoKg: '',
    volumes: '',
    veiculoNecessario: '',
    dataColetaIso: new Date().toISOString().slice(0, 10),
    janelaColetaInicio: '08:00',
    janelaColetaFim: '12:00',
    dataEntregaPrevistaIso: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    janelaEntregaInicio: '09:00',
    janelaEntregaFim: '17:00',
    valorCobradoReais: '',
    condicoesComerciais: '',
    condicoesOperacionais: '',
    observacoes: '',
  });

  // Client & CNPJ Autocomplete State (Requirement 1)
  const [showClientSuggestions, setShowClientSuggestions] = useState(false);
  const clientInputRef = useRef<HTMLInputElement | null>(null);

  const existingClients = useMemo(() => {
    const map = new Map<string, { cliente: string; cnpj: string; contato: string }>();
    for (const f of items) {
      if (!f.cliente) continue;
      const key = f.cliente.trim().toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          cliente: f.cliente.trim(),
          cnpj: f.clienteCnpj ? normalizeCnpj(f.clienteCnpj) : '',
          contato: f.clienteContato ? f.clienteContato.trim() : '',
        });
      }
    }
    const defaults = [
      { cliente: 'AMBEV S.A.', cnpj: '56.222.126/0001-92', contato: 'Central de Cargas / (11) 98765-4321' },
      { cliente: 'NESTLÉ BRASIL LTDA', cnpj: '60.409.075/0001-52', contato: 'Coord. Logística SP' },
      { cliente: 'BRF S.A.', cnpj: '01.838.723/0001-27', contato: 'Despacho e Frota' },
      { cliente: 'SUZANO S.A.', cnpj: '16.404.287/0001-55', contato: 'Recepção Florestal' },
      { cliente: 'CARGILL AGRÍCOLA S.A.', cnpj: '60.498.706/0001-57', contato: 'Mesa de Fretes' },
      { cliente: 'MONDELEZ BRASIL LTDA', cnpj: '33.033.028/0001-84', contato: 'Torre de Controle' },
      { cliente: 'VOTORANTIM CIMENTOS S.A.', cnpj: '01.637.895/0001-32', contato: 'Expedição Industrial' },
      { cliente: 'KLABIN S.A.', cnpj: '89.637.490/0001-45', contato: 'Logística de Bobinas' },
    ];
    for (const def of defaults) {
      const key = def.cliente.toLowerCase();
      if (!map.has(key)) map.set(key, def);
    }
    return Array.from(map.values());
  }, [items]);

  const filteredClientSuggestions = useMemo(() => {
    const q = formState.cliente.trim().toLowerCase();
    if (!q) return existingClients.slice(0, 6);
    return existingClients
      .filter(
        (c) =>
          c.cliente.toLowerCase().includes(q) ||
          c.cnpj.replace(/\D/g, '').includes(q.replace(/\D/g, ''))
      )
      .slice(0, 6);
  }, [existingClients, formState.cliente]);

  // Send to Expedição Modal (for drafts already saved)
  const [sendModalFreight, setSendModalFreight] = useState<UnifiedFreightRecord | null>(null);
  const [selectedExpedicaoAssignee, setSelectedExpedicaoAssignee] = useState<string>('FILA_DISPONIVEL');
  const [sendingToExpedicao, setSendingToExpedicao] = useState(false);

  // Drag & Drop State
  const [draggedFreight, setDraggedFreight] = useState<UnifiedFreightRecord | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<CommercialFreightStatus | null>(null);

  // Comment & Attachment upload states in Detail Drawer
  const [newCommentText, setNewCommentText] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [attachmentCategory, setAttachmentCategory] =
    useState<UnifiedFreightAttachment['category']>('COMERCIAL');
  const [attachmentLabel, setAttachmentLabel] = useState('');

  // Transfer & Cancel Modals
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferTargetUserId, setTransferTargetUserId] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  const showToast = useCallback(
    (msg: string) => {
      if (onToast) onToast(msg);
    },
    [onToast]
  );

  // Debounce search input (300ms)
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchRaw.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [searchRaw]);

  // Load operators once
  useEffect(() => {
    apiFetchFreightOperators().then((res) => {
      if (res.ok) {
        setComercialOperators(res.comercialOperators);
        setExpedicaoOperators(res.expedicaoOperators);
      }
    });
  }, []);

  // Load freights list & Kanban columns
  const fetchFreights = useCallback(
    async (resetCursor = true) => {
      setLoading(true);
      setErrorBanner(null);
      try {
        const res = await apiFetchFreightsList({
          area: 'COMERCIAL',
          scope,
          responsavelId: scope === 'EQUIPE' ? responsavelFilterId : undefined,
          search: debouncedSearch,
          periodo,
          situacao: situacaoFilter,
          includeCanceled,
          limit: 25,
          columnLimit,
          cursor: resetCursor ? undefined : nextCursorList || undefined,
        });
        if (!res.ok) {
          setErrorBanner(res.error || 'Erro ao carregar fretes do Comercial.');
        } else {
          if (resetCursor) {
            setItems(res.items || []);
          } else {
            setItems((prev) => [...prev, ...(res.items || [])]);
          }
          setHasMoreList(Boolean(res.hasMore));
          setNextCursorList(res.nextCursor || null);
          if (res.comercialCounters) setComercialCounters(res.comercialCounters);
          if (res.kanbanColumns) setKanbanColumns(res.kanbanColumns);
        }
      } catch {
        setErrorBanner('Falha de comunicação com o servidor ao consultar fretes.');
      } finally {
        setLoading(false);
      }
    },
    [scope, responsavelFilterId, debouncedSearch, periodo, situacaoFilter, includeCanceled, columnLimit, nextCursorList]
  );

  useEffect(() => {
    fetchFreights(true);
  }, [scope, responsavelFilterId, debouncedSearch, periodo, situacaoFilter, includeCanceled, columnLimit]);

  // Open detail drawer when triggered by notification
  const loadFreightDetails = useCallback(async (freightId: string) => {
    setSelectedFreightId(freightId);
    setDetailLoading(true);
    try {
      const res = await apiFetchFreightDetails(freightId);
      if (res.ok && res.freight) {
        setDetailFreight(res.freight);
        setDetailAnexos(res.anexos || []);
        setDetailComentarios(res.comentarios || []);
        setDetailOcorrencias(res.ocorrencias || []);
        setDetailHistorico(res.historico || []);
      } else {
        setErrorBanner(res.error || 'Não foi possível abrir os detalhes deste frete.');
        setSelectedFreightId(null);
      }
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedFreightIdFromNotification) {
      loadFreightDetails(selectedFreightIdFromNotification);
      if (onClearSelectedNotificationFreight) {
        onClearSelectedNotificationFreight();
      }
    }
  }, [selectedFreightIdFromNotification, loadFreightDetails, onClearSelectedNotificationFreight]);

  // Compute live preview of what Expedição will need to complete based on current formState
  const formPendingForExpedicao = useMemo(() => {
    const pending: string[] = [];
    if (!Number(formState.pesoKg) || Number(formState.pesoKg) <= 0) {
      pending.push('Peso da carga (kg)');
    }
    if (!formState.veiculoNecessario.trim()) {
      pending.push('Tipo de veículo necessário');
    }
    pending.push('Motorista, CPF, telefone, placas e videochamada');
    pending.push('Ordem de coleta e definição do Operador de Monitoramento');
    return pending;
  }, [formState.pesoKg, formState.veiculoNecessario]);

  const openCreateModal = () => {
    setEditingFreight(null);
    setFormError(null);
    setFormEditReason('');
    setFormExpedicaoAssignee('FILA_DISPONIVEL');
    setFormState({
      empresaMarca: 'RODOVAR',
      unidadeOperacional: (currentUser.location || 'BA - Salvador') as OperationalUnit,
      cliente: '',
      clienteCnpj: '',
      clienteContato: '',
      origemCidadeUf: '',
      enderecoColeta: '',
      destinoCidadeUf: '',
      enderecoEntrega: '',
      instrucoesColetaEntrega: '',
      tipoCarga: '',
      pesoKg: '',
      volumes: '',
      veiculoNecessario: '',
      dataColetaIso: new Date().toISOString().slice(0, 10),
      janelaColetaInicio: '08:00',
      janelaColetaFim: '12:00',
      dataEntregaPrevistaIso: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      janelaEntregaInicio: '09:00',
      janelaEntregaFim: '17:00',
      valorCobradoReais: '',
      condicoesComerciais: 'Frete dedicado CIF. Seguro averbado.',
      condicoesOperacionais: '',
      observacoes: '',
    });
    setIsFormOpen(true);
  };

  const openEditModal = (freight: UnifiedFreightRecord) => {
    setEditingFreight(freight);
    setFormError(null);
    setFormEditReason('');
    setFormExpedicaoAssignee(freight.expedicaoResponsavelId || 'FILA_DISPONIVEL');
    setFormState({
      empresaMarca: freight.empresaMarca,
      unidadeOperacional: freight.unidadeOperacional,
      cliente: freight.cliente,
      clienteCnpj: freight.clienteCnpj || '',
      clienteContato: freight.clienteContato || '',
      origemCidadeUf: freight.origemCidadeUf,
      enderecoColeta: freight.enderecoColeta,
      destinoCidadeUf: freight.destinoCidadeUf,
      enderecoEntrega: freight.enderecoEntrega,
      instrucoesColetaEntrega: freight.instrucoesColetaEntrega || '',
      tipoCarga: freight.tipoCarga,
      pesoKg: freight.pesoKg ? String(freight.pesoKg) : '',
      volumes: freight.volumes ? String(freight.volumes) : '',
      veiculoNecessario: freight.veiculoNecessario || '',
      dataColetaIso: freight.dataColetaIso,
      janelaColetaInicio: freight.janelaColetaInicio,
      janelaColetaFim: freight.janelaColetaFim,
      dataEntregaPrevistaIso: freight.dataEntregaPrevistaIso,
      janelaEntregaInicio: freight.janelaEntregaInicio,
      janelaEntregaFim: freight.janelaEntregaFim || '18:00',
      valorCobradoReais: freight.valorCobradoClienteCentavos
        ? (freight.valorCobradoClienteCentavos / 100).toFixed(2).replace('.', ',')
        : '',
      condicoesComerciais: freight.condicoesComerciais,
      condicoesOperacionais: freight.condicoesOperacionais,
      observacoes: freight.observacoes || '',
    });
    setIsFormOpen(true);
  };

  const handleSaveFreightForm = async (confirmAndSendToExpedicao: boolean) => {
    if (formSubmitting) return;
    setFormError(null);

    if (!formState.cliente.trim() || !formState.origemCidadeUf.trim() || !formState.destinoCidadeUf.trim()) {
      setFormError('Preencha Cliente, Origem (Cidade/UF) e Destino (Cidade/UF).');
      return;
    }

    const valorCobradoClienteCentavos = parseBrlInputToCentavos(formState.valorCobradoReais);

    if (confirmAndSendToExpedicao) {
      const missing: string[] = [];
      if (!formState.cliente.trim()) missing.push('Cliente');
      if (!formState.origemCidadeUf.trim() || !formState.destinoCidadeUf.trim())
        missing.push('Origem e Destino (Cidade/UF)');
      if (!formState.enderecoColeta.trim()) missing.push('Endereço de coleta');
      if (!formState.tipoCarga.trim()) missing.push('Material e informações da carga');
      if (!formState.dataColetaIso) missing.push('Data de coleta combinada');
      if (!valorCobradoClienteCentavos || valorCobradoClienteCentavos <= 0)
        missing.push('Valor fechado com o cliente');

      if (missing.length > 0) {
        setFormError(
          `Para confirmar contratação e enviar à Expedição, informe os dados mínimos: ${missing.join(', ')}.`
        );
        return;
      }
    }

    setFormSubmitting(true);
    try {
      const expedicaoId =
        formExpedicaoAssignee === 'FILA_DISPONIVEL' ? null : formExpedicaoAssignee;

      if (editingFreight) {
        const res = await apiUpdateCommercialFreight(editingFreight.id, {
          baseRevision: editingFreight.revision,
          empresaMarca: formState.empresaMarca,
          unidadeOperacional: formState.unidadeOperacional,
          cliente: formState.cliente.trim(),
          clienteCnpj: formState.clienteCnpj.trim(),
          clienteContato: formState.clienteContato.trim(),
          origemCidadeUf: formState.origemCidadeUf.trim(),
          enderecoColeta: formState.enderecoColeta.trim(),
          destinoCidadeUf: formState.destinoCidadeUf.trim(),
          enderecoEntrega: formState.enderecoEntrega.trim(),
          instrucoesColetaEntrega: formState.instrucoesColetaEntrega.trim(),
          tipoCarga: formState.tipoCarga.trim(),
          pesoKg: Number(formState.pesoKg) || 0,
          volumes: Number(formState.volumes) || 0,
          veiculoNecessario: formState.veiculoNecessario.trim(),
          dataColetaIso: formState.dataColetaIso,
          janelaColetaInicio: formState.janelaColetaInicio,
          janelaColetaFim: formState.janelaColetaFim,
          dataEntregaPrevistaIso: formState.dataEntregaPrevistaIso,
          janelaEntregaInicio: formState.janelaEntregaInicio,
          janelaEntregaFim: formState.janelaEntregaFim,
          valorCobradoClienteCentavos,
          condicoesComerciais: formState.condicoesComerciais.trim(),
          condicoesOperacionais: formState.condicoesOperacionais.trim(),
          observacoes: formState.observacoes.trim(),
          reason: formEditReason.trim() || undefined,
        });

        if (!res.ok || !res.freight) {
          setFormError(res.error || 'Erro ao atualizar frete.');
          return;
        }

        if (confirmAndSendToExpedicao) {
          const transRes = await apiCommercialTransition(editingFreight.id, {
            baseRevision: res.freight.revision,
            targetStatus: 'AGUARDANDO_EXPEDICAO',
            expedicaoResponsavelId: expedicaoId,
            idempotencyKey: `send-${editingFreight.id}-${res.freight.revision}`,
          });
          if (!transRes.ok) {
            setFormError(transRes.error || 'Frete salvo, mas houve erro ao enviar à Expedição.');
            return;
          }
          setIsFormOpen(false);
          showToast(
            `Contratação confirmada! Frete ${editingFreight.protocol} enviado à Expedição.`
          );
        } else {
          setIsFormOpen(false);
          if (res.reconfirmationTriggered) {
            showToast(
              `Frete ${editingFreight.protocol} atualizado. O responsável atual foi notificado.`
            );
          } else {
            showToast(`Frete ${editingFreight.protocol} atualizado com sucesso.`);
          }
        }

        await fetchFreights(true);
        if (selectedFreightId === editingFreight.id) {
          await loadFreightDetails(editingFreight.id);
        }
      } else {
        const idemKey = `create-${currentUser.id}-${Date.now()}`;
        const res = await apiCreateCommercialFreight({
          empresaMarca: formState.empresaMarca,
          unidadeOperacional: formState.unidadeOperacional,
          cliente: formState.cliente.trim(),
          clienteCnpj: formState.clienteCnpj.trim(),
          clienteContato: formState.clienteContato.trim(),
          origemCidadeUf: formState.origemCidadeUf.trim(),
          enderecoColeta: formState.enderecoColeta.trim(),
          destinoCidadeUf: formState.destinoCidadeUf.trim(),
          enderecoEntrega: formState.enderecoEntrega.trim(),
          instrucoesColetaEntrega: formState.instrucoesColetaEntrega.trim(),
          tipoCarga: formState.tipoCarga.trim(),
          pesoKg: Number(formState.pesoKg) || 0,
          volumes: Number(formState.volumes) || 0,
          veiculoNecessario: formState.veiculoNecessario.trim(),
          dataColetaIso: formState.dataColetaIso,
          janelaColetaInicio: formState.janelaColetaInicio,
          janelaColetaFim: formState.janelaColetaFim,
          dataEntregaPrevistaIso: formState.dataEntregaPrevistaIso,
          janelaEntregaInicio: formState.janelaEntregaInicio,
          janelaEntregaFim: formState.janelaEntregaFim,
          valorCobradoClienteCentavos,
          condicoesComerciais: formState.condicoesComerciais.trim(),
          condicoesOperacionais: formState.condicoesOperacionais.trim(),
          observacoes: formState.observacoes.trim(),
          confirmAndSendToExpedicao,
          expedicaoResponsavelId: confirmAndSendToExpedicao ? expedicaoId : null,
          idempotencyKey: idemKey,
        });

        if (!res.ok) {
          setFormError(res.error || 'Erro ao registrar novo frete.');
          return;
        }
        setIsFormOpen(false);
        showToast(
          confirmAndSendToExpedicao
            ? `Frete ${res.freight?.protocol || ''} contratado e enviado à Expedição!`
            : `Rascunho do frete ${res.freight?.protocol || ''} salvo em "Em negociação".`
        );
        await fetchFreights(true);
      }
    } finally {
      setFormSubmitting(false);
    }
  };

  // Handle Commercial stage transitions (Button or Drag-and-Drop)
  const handleCommercialStageChange = async (
    freight: UnifiedFreightRecord,
    targetStatus: CommercialFreightStatus
  ) => {
    if (freight.situacaoComercial === targetStatus) return;

    // Commercial tracks progress of its freights, but does not execute monitoring stages
    if (
      targetStatus === 'EM_MONITORAMENTO' ||
      targetStatus === 'EM_TRANSPORTE' ||
      targetStatus === 'CONCLUIDO' ||
      targetStatus === 'FINALIZADO'
    ) {
      setErrorBanner(
        'O Comercial acompanha o progresso dos seus fretes, mas as etapas "Em monitoramento" e "Concluídos" são atualizadas exclusivamente pela Expedição e pelo Operador de Monitoramento.'
      );
      return;
    }

    if (
      targetStatus === 'AGUARDANDO_EXPEDICAO' ||
      targetStatus === 'NA_EXPEDICAO' ||
      targetStatus === 'CONTRATADO'
    ) {
      setSendModalFreight(freight);
      setSelectedExpedicaoAssignee(freight.expedicaoResponsavelId || 'FILA_DISPONIVEL');
      return;
    }

    setActionBusy(true);
    setErrorBanner(null);
    try {
      const res = await apiCommercialTransition(freight.id, {
        baseRevision: freight.revision,
        targetStatus,
        idempotencyKey: `trans-${freight.id}-${freight.revision}-${targetStatus}`,
      });
      if (!res.ok) {
        setErrorBanner(res.error || 'Não foi possível alterar a etapa comercial.');
      } else {
        showToast(`Frete ${freight.protocol} atualizado.`);
        await fetchFreights(true);
        if (selectedFreightId === freight.id) {
          await loadFreightDetails(freight.id);
        }
      }
    } finally {
      setActionBusy(false);
    }
  };

  const handleConfirmSendToExpedicao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sendModalFreight || sendingToExpedicao) return;
    setSendingToExpedicao(true);
    setErrorBanner(null);
    try {
      const expedicaoId =
        selectedExpedicaoAssignee === 'FILA_DISPONIVEL' ? null : selectedExpedicaoAssignee;
      const res = await apiCommercialTransition(sendModalFreight.id, {
        baseRevision: sendModalFreight.revision,
        targetStatus: 'AGUARDANDO_EXPEDICAO',
        expedicaoResponsavelId: expedicaoId,
        idempotencyKey: `send-exp-${sendModalFreight.id}-${sendModalFreight.revision}`,
      });
      if (!res.ok) {
        setErrorBanner(res.error || 'Erro ao enviar frete para a Expedição.');
      } else {
        showToast(
          `Contratação confirmada! Frete ${sendModalFreight.protocol} enviado à Expedição (${
            expedicaoId ? res.freight?.expedicaoResponsavelNome : 'Fila disponível do setor'
          }).`
        );
        setSendModalFreight(null);
        await fetchFreights(true);
        if (selectedFreightId === sendModalFreight.id) {
          await loadFreightDetails(sendModalFreight.id);
        }
      }
    } finally {
      setSendingToExpedicao(false);
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailFreight || !newCommentText.trim() || postingComment) return;
    setPostingComment(true);
    try {
      const res = await apiAddFreightComment(
        detailFreight.id,
        newCommentText.trim(),
        `comment-${detailFreight.id}-${Date.now()}`
      );
      if (res.ok) {
        setNewCommentText('');
        await loadFreightDetails(detailFreight.id);
        await fetchFreights(true);
      } else {
        setErrorBanner(res.error || 'Erro ao publicar comentário.');
      }
    } finally {
      setPostingComment(false);
    }
  };

  const handleAttachmentFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !detailFreight) return;
    e.target.value = '';

    if (file.size > 5 * 1024 * 1024) {
      setErrorBanner('O arquivo excede o tamanho máximo de 5 MB.');
      return;
    }

    setUploadingAttachment(true);
    setErrorBanner(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
        reader.readAsDataURL(file);
      });

      const res = await apiUploadFreightAttachment(detailFreight.id, {
        fileName: file.name,
        label: attachmentLabel.trim() || file.name,
        category: attachmentCategory,
        dataUrl,
      });

      if (!res.ok) {
        setErrorBanner(res.error || 'Falha ao enviar anexo.');
      } else {
        setAttachmentLabel('');
        showToast(`Documento "${file.name}" anexado ao frete ${detailFreight.protocol}.`);
        await loadFreightDetails(detailFreight.id);
        await fetchFreights(true);
      }
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailFreight || !transferTargetUserId || !transferReason.trim() || actionBusy) return;
    setActionBusy(true);
    try {
      const res = await apiTransferFreightResponsibility(detailFreight.id, {
        baseRevision: detailFreight.revision,
        sector: 'COMERCIAL',
        newResponsibleId: transferTargetUserId,
        reason: transferReason.trim(),
      });
      if (!res.ok) {
        setErrorBanner(res.error || 'Erro ao transferir responsabilidade.');
      } else {
        showToast(`Responsabilidade comercial do frete ${detailFreight.protocol} transferida.`);
        setTransferModalOpen(false);
        setTransferReason('');
        await fetchFreights(true);
        await loadFreightDetails(detailFreight.id);
      }
    } finally {
      setActionBusy(false);
    }
  };

  const handleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailFreight || !cancelReason.trim() || actionBusy) return;
    setActionBusy(true);
    try {
      const res = await apiCancelFreight(detailFreight.id, {
        baseRevision: detailFreight.revision,
        reason: cancelReason.trim(),
      });
      if (!res.ok) {
        setErrorBanner(res.error || 'Erro ao cancelar frete.');
      } else {
        showToast(`Frete ${detailFreight.protocol} cancelado com registro no histórico.`);
        setCancelModalOpen(false);
        setCancelReason('');
        await fetchFreights(true);
        await loadFreightDetails(detailFreight.id);
      }
    } finally {
      setActionBusy(false);
    }
  };

  const renderCardStatusPill = (f: UnifiedFreightRecord) => {
    if (f.situacaoComercial === 'CANCELADO') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-red-100 text-red-700">
          <span className="w-2 h-2 rounded-full bg-red-600" />
          Cancelado
        </span>
      );
    }
    if (f.devolvidoParaCorrecao) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-red-100 text-red-800">
          <span className="w-2 h-2 rounded-full bg-red-600" />
          Devolvido p/ correção
        </span>
      );
    }
    if (f.situacaoComercial === 'EM_NEGOCIACAO') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700">
          <span className="w-2 h-2 rounded-full bg-slate-400" />
          Em negociação (Rascunho)
        </span>
      );
    }
    if (
      f.situacaoComercial === 'AGUARDANDO_EXPEDICAO' ||
      f.situacaoComercial === 'NA_EXPEDICAO' ||
      f.situacaoComercial === 'CONTRATADO'
    ) {
      const subLabel =
        f.situacaoOperacional === 'DISPONIVEL_FILA'
          ? 'Fila da Expedição'
          : f.situacaoOperacional === 'RECEBIDO'
          ? 'Recebido na Expedição'
          : 'Em preparação na Expedição';
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-orange-100/80 text-orange-800">
          <span className="w-2 h-2 rounded-full bg-orange-500" />
          {subLabel}
        </span>
      );
    }
    if (f.situacaoComercial === 'EM_MONITORAMENTO' || f.situacaoComercial === 'EM_TRANSPORTE') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-sky-100/80 text-sky-800">
          <span className="w-2 h-2 rounded-full bg-sky-500" />
          {formatSituacaoMonitoramentoLabel(f.situacaoMonitoramento)}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-100 text-emerald-800">
        <span className="w-2 h-2 rounded-full bg-emerald-600" />
        Concluído
      </span>
    );
  };

  return (
    <div className="min-h-full bg-[#F3F5F7] text-slate-900 p-4 md:p-6 lg:p-8">
      {/* TOP HEADER */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">
              Meus Fretes — Comercial
            </h1><DriverLookupButton/>
            {canAlsoAccessExpedicao && onSwitchToExpedicao && (
              <button
                type="button"
                onClick={onSwitchToExpedicao}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-slate-900 text-[#FFD400] hover:bg-slate-800 transition-colors cursor-pointer"
                title="Alternar para sua fila operacional na Expedição"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                Ir para Expedição
              </button>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Contratação com o cliente, encaminhamento à Expedição e acompanhamento da operação
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* User Identity Pill */}
          <div className="inline-flex items-center gap-2.5 bg-white border border-slate-200/80 rounded-full px-3.5 py-1.5 shadow-2xs">
            <div className="w-7 h-7 rounded-full bg-[#FFF3B0] text-slate-900 font-bold text-xs flex items-center justify-center">
              {getInitials(currentUser.name)}
            </div>
            <div className="text-xs">
              <span className="font-semibold text-slate-900">{currentUser.name.split(' ')[0]}</span>
              <span className="text-slate-400 mx-1">•</span>
              <span className="text-slate-600">Comercial</span>
            </div>
          </div>

          {/* Primary Action: + Novo frete */}
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#FFD400] hover:bg-[#F2C900] text-slate-950 font-semibold text-sm shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            Novo frete
          </button>
        </div>
      </div>

      {/* ERROR / FEEDBACK BANNER */}
      {errorBanner && (
        <div className="mb-5 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start justify-between gap-3 text-red-900 text-sm">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <span>{errorBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            className="text-red-500 hover:text-red-800 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 4 KPI SUMMARY CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {KANBAN_COLUMNS.map((col) => {
          const isSelected = situacaoFilter === col.key;
          const count = comercialCounters[col.key] || 0;
          return (
            <button
              key={col.key}
              type="button"
              onClick={() =>
                setSituacaoFilter((prev) => (prev === col.key ? 'TODAS' : col.key))
              }
              className={`flex items-center gap-3 px-4 py-3.5 rounded-xl bg-white border text-left transition-all cursor-pointer ${
                isSelected
                  ? 'border-slate-900 ring-2 ring-slate-900/10 shadow-xs'
                  : 'border-slate-200/90 hover:border-slate-300'
              }`}
            >
              <span className="text-2xl font-bold text-slate-900 tabular-nums">{count}</span>
              <span className={`w-3 h-3 rounded-full shrink-0 ${col.dotColor}`} />
              <span className="text-sm font-medium text-slate-700 truncate">{col.title}</span>
            </button>
          );
        })}
      </div>

      {/* FILTER & VIEW MODE TOOLBAR */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-6">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchRaw}
              onChange={(e) => setSearchRaw(e.target.value)}
              placeholder="Buscar cliente, rota ou protocolo (#0842)"
              className="w-full pl-10 pr-8 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-900"
            />
            {searchRaw && (
              <button
                type="button"
                onClick={() => setSearchRaw('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Scope Dropdown: Meus fretes vs Equipe */}
          <select
            value={scope}
            onChange={(e) => {
              const val = e.target.value as 'MEUS' | 'EQUIPE';
              setScope(val);
              if (val === 'MEUS') setResponsavelFilterId('TODOS');
            }}
            className="px-3.5 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:border-slate-900"
          >
            <option value="MEUS">Meus fretes</option>
            {canViewTeam && <option value="EQUIPE">Fretes da equipe</option>}
          </select>

          {/* Period Dropdown */}
          <div className="relative">
            <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value as 'TODOS' | 'HOJE' | 'ATRASADOS')}
              className="pl-9 pr-8 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:border-slate-900"
            >
              <option value="TODOS">Período: Todos</option>
              <option value="HOJE">Coletas de hoje</option>
              <option value="ATRASADOS">Com pendência / alerta</option>
            </select>
          </div>

          {/* Responsible Dropdown */}
          <div className="relative">
            <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={scope === 'EQUIPE' && canViewTeam ? responsavelFilterId : currentUser.id}
              disabled={!canViewTeam || scope !== 'EQUIPE'}
              onChange={(e) => setResponsavelFilterId(e.target.value)}
              className="pl-9 pr-8 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 disabled:bg-slate-50 disabled:text-slate-500 focus:outline-none focus:border-slate-900"
            >
              {canViewTeam && scope === 'EQUIPE' ? (
                <>
                  <option value="TODOS">Responsável: Todos</option>
                  {comercialOperators.map((op) => (
                    <option key={op.id} value={op.id}>
                      {op.name}
                    </option>
                  ))}
                </>
              ) : (
                <option value={currentUser.id}>Responsável: {currentUser.name.split(' ')[0]}</option>
              )}
            </select>
          </div>

          {/* Toggle canceled filter (Requirement 5: auto switches to LISTA and back) */}
          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeCanceled}
              onChange={(e) => handleToggleIncludeCanceled(e.target.checked)}
              className="rounded border-slate-300 text-slate-900 focus:ring-0"
            />
            Mostrar cancelados ({comercialCounters.CANCELADO || 0})
          </label>
        </div>

        {/* Quadro | Lista Switcher */}
        <div className="inline-flex items-center bg-white border border-slate-200 rounded-lg p-1 self-start lg:self-auto">
          <button
            type="button"
            onClick={() => setViewMode('QUADRO')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-sm font-semibold transition-colors cursor-pointer ${
              viewMode === 'QUADRO'
                ? 'bg-[#FFD400] text-slate-950 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
            Quadro
          </button>
          <button
            type="button"
            onClick={() => setViewMode('LISTA')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-sm font-semibold transition-colors cursor-pointer ${
              viewMode === 'LISTA'
                ? 'bg-[#FFD400] text-slate-950 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ListIcon className="w-4 h-4" />
            Lista
          </button>
        </div>
      </div>

      {/* KANBAN BOARD VIEW (4 COLUMNS: Em negociação -> Aguardando Expedição -> Em monitoramento -> Concluídos) */}
      {viewMode === 'QUADRO' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
          {KANBAN_COLUMNS.map((col) => {
            const colData = kanbanColumns[col.key] || {
              items: [],
              total: 0,
              hasMore: false,
              nextCursor: null,
            };
            const isDropTarget = dragOverColumn === col.key;

            return (
              <div
                key={col.key}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragOverColumn !== col.key) setDragOverColumn(col.key);
                }}
                onDragLeave={() => setDragOverColumn(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverColumn(null);
                  if (draggedFreight) {
                    handleCommercialStageChange(draggedFreight, col.key);
                    setDraggedFreight(null);
                  }
                }}
                className={`bg-[#EBEEF2]/80 rounded-xl ${col.topBarColor} p-3 flex flex-col gap-3 min-h-[540px] transition-colors ${
                  isDropTarget ? 'ring-2 ring-slate-900 bg-slate-200/70' : ''
                }`}
              >
                {/* Column Header */}
                <div className="flex items-center justify-between px-1 pt-0.5">
                  <div className="flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full ${col.dotColor}`} />
                    <h2 className="font-bold text-sm text-slate-900">{col.title}</h2>
                    <span className="text-sm font-medium text-slate-500 tabular-nums">
                      {colData.total}
                    </span>
                  </div>
                </div>

                {/* Cards Stack */}
                <div className="flex flex-col gap-3">
                  {colData.items.length === 0 ? (
                    <div className="bg-white/60 border border-dashed border-slate-300 rounded-xl p-6 text-center text-xs text-slate-400">
                      Nenhum frete nesta etapa
                    </div>
                  ) : (
                    colData.items.map((f) => {
                      const canDrag =
                        f.situacaoComercial === 'EM_NEGOCIACAO' ||
                        f.situacaoComercial === 'CONTRATADO';

                      return (
                        <div
                          key={f.id}
                          draggable={canDrag}
                          onDragStart={() => setDraggedFreight(f)}
                          onDragEnd={() => {
                            setDraggedFreight(null);
                            setDragOverColumn(null);
                          }}
                          onClick={() => loadFreightDetails(f.id)}
                          className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs hover:shadow-md hover:border-slate-300 transition-all cursor-pointer select-none flex flex-col gap-2.5"
                        >
                          {/* Top Row: Protocol & Pickup Date */}
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-base text-slate-900 tracking-tight">
                              {f.protocol}
                            </span>
                            <span className="text-xs text-slate-400 tabular-nums">
                              {formatFullDatePtBr(f.dataColetaIso)}
                            </span>
                          </div>

                          {/* Client Name */}
                          <div className="font-bold text-sm text-slate-900 leading-snug">
                            {f.cliente}
                          </div>

                          {/* Route */}
                          <div className="flex items-center gap-1.5 text-xs text-slate-600">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">
                              {f.origemCidadeUf.replace(' - BA', '').replace(' - SP', '').replace(' - PE', '')}{' '}
                              <span className="text-slate-400">→</span>{' '}
                              {f.destinoCidadeUf.replace(' - BA', '').replace(' - SP', '').replace(' - PE', '')}
                            </span>
                          </div>

                          {/* Pickup Date & Window */}
                          <div className="flex items-center gap-1.5 text-xs text-slate-500">
                            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>
                              Coleta {formatShortDate(f.dataColetaIso)} • {f.janelaColetaInicio}
                            </span>
                          </div>

                          {/* Pending fields for Expedição indicator */}
                          {f.camposPendentesExpedicao &&
                            f.camposPendentesExpedicao.length > 0 &&
                            (f.situacaoComercial === 'EM_NEGOCIACAO' ||
                              f.situacaoComercial === 'AGUARDANDO_EXPEDICAO') && (
                              <div className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600">
                                <span className="font-semibold text-slate-800">
                                  Para Expedição completar:
                                </span>{' '}
                                {f.camposPendentesExpedicao.slice(0, 2).join(', ')}
                                {f.camposPendentesExpedicao.length > 2
                                  ? ` (+${f.camposPendentesExpedicao.length - 2})`
                                  : ''}
                              </div>
                            )}

                          {/* Alert Banner if returned for correction or pending reconfirmation */}
                          {(f.devolvidoParaCorrecao ||
                            f.requerReconfirmacaoOperacional ||
                            f.ocorrenciasAbertasCount > 0) && (
                            <div className="px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] font-medium text-amber-900 flex items-center gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              <span className="truncate">
                                {f.pendenciaPrincipal || 'Atenção operacional'}
                              </span>
                            </div>
                          )}

                          {/* Divider + Responsible Row */}
                          <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-7 h-7 rounded-full bg-[#FFF3B0] text-slate-900 font-bold text-[11px] flex items-center justify-center shrink-0">
                                {getInitials(f.comercialResponsavelNome)}
                              </div>
                              <div className="leading-tight min-w-0">
                                <div className="text-[10px] text-slate-400">Comercial</div>
                                <div className="text-xs font-semibold text-slate-800 truncate">
                                  {f.comercialResponsavelNome.split(' ')[0]}
                                </div>
                              </div>
                            </div>

                            {f.valorCobradoClienteCentavos !== undefined && (
                              <div className="text-right">
                                <div className="text-[10px] text-slate-400">Valor Cliente</div>
                                <div className="text-xs font-bold text-slate-900 tabular-nums">
                                  {formatCentavosToBrl(f.valorCobradoClienteCentavos)}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Bottom Status Pill + Counters */}
                          <div className="pt-1 flex flex-wrap items-center justify-between gap-2">
                            {renderCardStatusPill(f)}

                            <div className="flex items-center gap-2.5 text-xs text-slate-500 ml-auto">
                              <span
                                className="inline-flex items-center gap-1"
                                title="Documentos anexados"
                              >
                                <FileText className="w-3.5 h-3.5 text-slate-400" />
                                {f.anexosCount}
                              </span>
                              <span
                                className="inline-flex items-center gap-1"
                                title="Verificações da Expedição"
                              >
                                <CheckSquare className="w-3.5 h-3.5 text-slate-400" />
                                {f.checklistConcluidosCount}/5
                              </span>
                            </div>
                          </div>

                          {/* Action Buttons on Card */}
                          <div
                            className="pt-2 border-t border-slate-100 flex items-center gap-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {(f.situacaoComercial === 'EM_NEGOCIACAO' ||
                              f.situacaoComercial === 'CONTRATADO') && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleCommercialStageChange(f, 'AGUARDANDO_EXPEDICAO')
                                }
                                className="flex-1 py-1.5 px-2.5 rounded-lg bg-[#FFD400] hover:bg-[#F2C900] text-slate-950 font-bold text-xs flex items-center justify-center gap-1 transition-colors cursor-pointer"
                              >
                                <Send className="w-3.5 h-3.5" />
                                {f.devolvidoParaCorrecao
                                  ? 'Reenviar à Expedição'
                                  : 'Confirmar e enviar à Expedição'}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openEditModal(f)}
                              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs"
                              title="Editar dados comerciais"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}

                  {colData.hasMore && (
                    <button
                      type="button"
                      onClick={() => setColumnLimit((prev) => prev + 8)}
                      className="w-full py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
                    >
                      Carregar mais ({colData.total - colData.items.length} restantes)
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* LIST VIEW MODE */
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-500">
                  <th className="py-3.5 px-4">Frete</th>
                  <th className="py-3.5 px-4">Cliente e rota</th>
                  <th className="py-3.5 px-4">Coleta</th>
                  <th className="py-3.5 px-4">Valor Cliente</th>
                  <th className="py-3.5 px-4">Comercial</th>
                  <th className="py-3.5 px-4">Expedição / Monitoramento</th>
                  <th className="py-3.5 px-4">Situação</th>
                  <th className="py-3.5 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 text-sm">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      Nenhum frete encontrado para os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  items.map((f) => (
                    <tr
                      key={f.id}
                      onClick={() => loadFreightDetails(f.id)}
                      className="hover:bg-slate-50/90 cursor-pointer transition-colors"
                    >
                      <td className="py-3.5 px-4 font-bold text-slate-900">{f.protocol}</td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{f.cliente}</div>
                        <div className="text-xs text-slate-500">
                          {f.origemCidadeUf} → {f.destinoCidadeUf}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-700">
                        <div className="font-semibold">{formatFullDatePtBr(f.dataColetaIso)}</div>
                        <div className="text-slate-400">{f.janelaColetaInicio}</div>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-900 tabular-nums">
                        {f.valorCobradoClienteCentavos !== undefined
                          ? formatCentavosToBrl(f.valorCobradoClienteCentavos)
                          : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-xs font-medium text-slate-700">
                        {f.comercialResponsavelNome}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600">
                        <div>Exp: {f.expedicaoResponsavelNome || 'Fila disponível'}</div>
                        {f.monitoramentoResponsavelNome && (
                          <div className="text-slate-500">
                            Mon: {f.monitoramentoResponsavelNome}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">{renderCardStatusPill(f)}</td>
                      <td
                        className="py-3.5 px-4 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center gap-1.5">
                          {(f.situacaoComercial === 'EM_NEGOCIACAO' ||
                            f.situacaoComercial === 'CONTRATADO') && (
                            <button
                              type="button"
                              onClick={() =>
                                handleCommercialStageChange(f, 'AGUARDANDO_EXPEDICAO')
                              }
                              className="px-2.5 py-1 rounded bg-[#FFD400] text-slate-950 text-xs font-semibold hover:bg-[#F2C900]"
                            >
                              Enviar Expedição
                            </button>
                          )}
                          {f.situacaoComercial === 'CANCELADO' && canCancel && (
                            <button
                              type="button"
                              onClick={() => {
                                setReactivateFreight(f);
                                setReactivateReason('');
                                setReactivateStage(
                                  (f.preCancelComercial as any) || 'EM_NEGOCIACAO'
                                );
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-semibold border border-blue-200 cursor-pointer"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Reativar</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEditModal(f)}
                            className="p-1.5 rounded border border-slate-200 hover:bg-slate-100 text-slate-600"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {hasMoreList && (
            <div className="p-4 border-t border-slate-200 text-center">
              <button
                type="button"
                onClick={() => fetchFreights(false)}
                className="px-5 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
              >
                Carregar mais fretes
              </button>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: NOVO FRETE / EDITAR CONTRATAÇÃO COMERCIAL                      */}
      {/* ===================================================================== */}
      {/* ===================================================================== */}
      {/* MODAL: NOVO FRETE / EDITAR CONTRATAÇÃO COMERCIAL (CORPORATEMODAL)     */}
      {/* ===================================================================== */}
      {isFormOpen && (
        <CorporateModal
          isOpen={isFormOpen}
          onClose={() => setIsFormOpen(false)}
          title={
            editingFreight
              ? `Editar Frete ${editingFreight.protocol} — ${editingFreight.cliente}`
              : 'Registrar Contratação de Frete — Comercial'
          }
          subtitle={`Responsável Comercial: ${currentUser.name} • Os dados de motorista e placas serão completados pela Expedição.`}
          maxWidth="2xl"
          footer={
            <div className="flex flex-wrap items-center justify-between w-full gap-3">
              <div className="text-[11px] text-gray-500">
                Campos marcados com <span className="text-[#E5252A] font-bold">*</span> são obrigatórios para contratação.
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 rounded-xl border border-gray-300 text-gray-700 font-bold text-xs hover:bg-gray-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={formSubmitting}
                  onClick={() => handleSaveFreightForm(false)}
                  className="px-4 py-2 rounded-xl border border-gray-900 bg-white hover:bg-gray-100 text-[#080B0D] font-extrabold text-xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  {editingFreight ? 'Salvar alterações' : 'Salvar rascunho'}
                </button>
                {(!editingFreight ||
                  editingFreight.situacaoComercial === 'EM_NEGOCIACAO' ||
                  editingFreight.situacaoComercial === 'CONTRATADO' ||
                  editingFreight.devolvidoParaCorrecao) && (
                  <button
                    type="button"
                    disabled={formSubmitting}
                    onClick={() => handleSaveFreightForm(true)}
                    className="px-5 py-2 rounded-xl bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] font-black text-xs shadow-xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Confirmar contratação e enviar à Expedição
                  </button>
                )}
              </div>
            </div>
          }
        >
          <div className="space-y-5 text-xs">
            {formError && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs font-bold flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-[#E5252A] shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            {editingFreight && editingFreight.situacaoOperacional !== 'NAO_ENVIADO' && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 text-xs space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <strong>Atenção (Frete em andamento operacional):</strong> Alterar valores,
                    endereço ou carga registrará o motivo no histórico de auditoria e notificará a equipe.
                  </div>
                </div>
                <input
                  type="text"
                  value={formEditReason}
                  onChange={(e) => setFormEditReason(e.target.value)}
                  placeholder="Informe a justificativa corporativa da alteração comercial..."
                  className="w-full px-3 py-1.5 bg-white border border-amber-300 rounded-lg text-xs"
                />
              </div>
            )}

            {/* CARD 1: CLIENTE E IDENTIFICAÇÃO */}
            <div className="bg-[#F8FAFC] border border-gray-200/90 rounded-2xl p-4 space-y-3.5 shadow-2xs">
              <div className="flex items-center gap-2 pb-2 border-b border-gray-200">
                <div className="w-6 h-6 rounded-lg bg-[#FFD400] text-[#080B0D] font-black flex items-center justify-center text-xs">
                  1
                </div>
                <h3 className="font-black text-sm text-[#080B0D] uppercase tracking-wide">
                  Identificação do Cliente & Contato
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Cliente with Autocomplete */}
                <div className="sm:col-span-1 relative">
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    Cliente / Embarcador <span className="text-[#E5252A]">*</span>
                  </label>
                  <input
                    ref={clientInputRef}
                    type="text"
                    required
                    value={formState.cliente}
                    onFocus={() => setShowClientSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowClientSuggestions(false), 250)}
                    onChange={(e) => {
                      setFormState((s) => ({ ...s, cliente: e.target.value }));
                      setShowClientSuggestions(true);
                    }}
                    placeholder="Ex: AMBEV S.A."
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl font-bold text-[#15191D] focus:outline-none focus:border-[#FFD400]"
                  />

                  {/* Autocomplete Dropdown */}
                  {showClientSuggestions && filteredClientSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-30 max-h-52 overflow-y-auto divide-y divide-gray-100">
                      <div className="p-2 bg-gray-50 text-[10px] font-extrabold text-gray-500 uppercase tracking-wider">
                        Cadastros existentes (Toque para preencher cliente e CNPJ):
                      </div>
                      {filteredClientSuggestions.map((c, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setFormState((prev) => ({
                              ...prev,
                              cliente: c.cliente,
                              clienteCnpj: c.cnpj || prev.clienteCnpj,
                              clienteContato: c.contato || prev.clienteContato,
                            }));
                            setShowClientSuggestions(false);
                          }}
                          className="w-full text-left p-2.5 hover:bg-amber-50/80 flex items-start justify-between gap-2 cursor-pointer transition-colors"
                        >
                          <div>
                            <p className="font-extrabold text-xs text-[#080B0D]">{c.cliente}</p>
                            {c.cnpj && (
                              <p className="text-[10px] font-mono text-gray-500">
                                CNPJ: {c.cnpj}
                              </p>
                            )}
                          </div>
                          <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                            Usar cadastro
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* CNPJ with Normalization */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    CNPJ do Cliente (Normalizado)
                  </label>
                  <input
                    type="text"
                    value={formState.clienteCnpj}
                    onChange={(e) => {
                      const normalized = normalizeCnpj(e.target.value);
                      setFormState((s) => ({ ...s, clienteCnpj: normalized }));
                    }}
                    placeholder="00.000.000/0000-00"
                    maxLength={18}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl font-mono text-xs focus:outline-none focus:border-[#FFD400]"
                  />
                </div>

                {/* Contato do Cliente */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    Contato do Cliente / Telefone
                  </label>
                  <input
                    type="text"
                    value={formState.clienteContato}
                    onChange={(e) =>
                      setFormState((s) => ({ ...s, clienteContato: e.target.value }))
                    }
                    placeholder="Nome / WhatsApp / Telefone"
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs focus:outline-none focus:border-[#FFD400]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    Transportadora do Grupo RODOVAR
                  </label>
                  <select
                    value={formState.empresaMarca}
                    onChange={(e) =>
                      setFormState((s) => ({
                        ...s,
                        empresaMarca: e.target.value as CarrierBrand,
                      }))
                    }
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-bold text-[#080B0D]"
                  >
                    <option value="RODOVAR">RODOVAR LOGÍSTICA</option>
                    <option value="VL TRANSPORTES">VL TRANSPORTES</option>
                    <option value="AXD">AXD LOGÍSTICA</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    Unidade Operacional
                  </label>
                  <select
                    value={formState.unidadeOperacional}
                    onChange={(e) =>
                      setFormState((s) => ({
                        ...s,
                        unidadeOperacional: e.target.value as OperationalUnit,
                      }))
                    }
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-bold text-[#080B0D]"
                  >
                    <option value="BA - Salvador">BA - Salvador (Matriz)</option>
                    <option value="SP - Guarulhos">SP - Guarulhos (Filial)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* CARD 2: ROTA - COLETA E DESTINO */}
            <div className="bg-[#F8FAFC] border border-gray-200/90 rounded-2xl p-4 space-y-3.5 shadow-2xs">
              <div className="flex items-center gap-2 pb-2 border-b border-gray-200">
                <div className="w-6 h-6 rounded-lg bg-[#FFD400] text-[#080B0D] font-black flex items-center justify-center text-xs">
                  2
                </div>
                <h3 className="font-black text-sm text-[#080B0D] uppercase tracking-wide">
                  Rota: Coleta e Destino
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    Cidade / UF de Origem <span className="text-[#E5252A]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formState.origemCidadeUf}
                    onChange={(e) =>
                      setFormState((s) => ({ ...s, origemCidadeUf: e.target.value }))
                    }
                    placeholder="Ex: Feira de Santana - BA"
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl font-bold text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    Endereço de Coleta <span className="text-[#E5252A]">*</span>
                  </label>
                  <input
                    type="text"
                    value={formState.enderecoColeta}
                    onChange={(e) =>
                      setFormState((s) => ({ ...s, enderecoColeta: e.target.value }))
                    }
                    placeholder="Rodovia, Km, Galpão / CD de coleta"
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    Cidade / UF de Destino <span className="text-[#E5252A]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formState.destinoCidadeUf}
                    onChange={(e) =>
                      setFormState((s) => ({ ...s, destinoCidadeUf: e.target.value }))
                    }
                    placeholder="Ex: Salvador - BA"
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl font-bold text-xs"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-bold text-gray-700">
                      Endereço Detalhado de Entrega (Opcional)
                    </label>
                    <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                      Opcional no Comercial
                    </span>
                  </div>
                  <input
                    type="text"
                    value={formState.enderecoEntrega}
                    onChange={(e) =>
                      setFormState((s) => ({ ...s, enderecoEntrega: e.target.value }))
                    }
                    placeholder="Rua, número, galpão de descarga..."
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs"
                  />
                  <p className="text-[10px] text-gray-500 mt-1 italic">
                    Se não informado, o Monitoramento solicitará e completará.
                  </p>
                </div>
              </div>

              {/* Datas e Janelas */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    Data da Coleta <span className="text-[#E5252A]">*</span>
                  </label>
                  <input
                    type="date"
                    value={formState.dataColetaIso}
                    onChange={(e) =>
                      setFormState((s) => ({ ...s, dataColetaIso: e.target.value }))
                    }
                    className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded-xl text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    Horário Coleta
                  </label>
                  <input
                    type="time"
                    value={formState.janelaColetaInicio}
                    onChange={(e) =>
                      setFormState((s) => ({ ...s, janelaColetaInicio: e.target.value }))
                    }
                    className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded-xl text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    Previsão de Entrega
                  </label>
                  <input
                    type="date"
                    value={formState.dataEntregaPrevistaIso}
                    onChange={(e) =>
                      setFormState((s) => ({
                        ...s,
                        dataEntregaPrevistaIso: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded-xl text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    Horário Entrega
                  </label>
                  <input
                    type="time"
                    value={formState.janelaEntregaInicio}
                    onChange={(e) =>
                      setFormState((s) => ({
                        ...s,
                        janelaEntregaInicio: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded-xl text-xs font-semibold"
                  />
                </div>
              </div>
            </div>

            {/* CARD 3: CARGA E ESPECIFICAÇÕES */}
            <div className="bg-[#F8FAFC] border border-gray-200/90 rounded-2xl p-4 space-y-3.5 shadow-2xs">
              <div className="flex items-center gap-2 pb-2 border-b border-gray-200">
                <div className="w-6 h-6 rounded-lg bg-[#FFD400] text-[#080B0D] font-black flex items-center justify-center text-xs">
                  3
                </div>
                <h3 className="font-black text-sm text-[#080B0D] uppercase tracking-wide">
                  Carga e Especificações
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    Material / Descrição da Carga <span className="text-[#E5252A]">*</span>
                  </label>
                  <input
                    type="text"
                    value={formState.tipoCarga}
                    onChange={(e) => setFormState((s) => ({ ...s, tipoCarga: e.target.value }))}
                    placeholder="Ex: Bebidas Paletizadas / Alimentos / Bobinas"
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    Peso Estimado (kg)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formState.pesoKg}
                    onChange={(e) => setFormState((s) => ({ ...s, pesoKg: e.target.value }))}
                    placeholder="Ex: 27000"
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    Volumes / Paletes
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formState.volumes}
                    onChange={(e) => setFormState((s) => ({ ...s, volumes: e.target.value }))}
                    placeholder="Ex: 28"
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">
                  Tipo de Veículo Sugerido (se já acordado)
                </label>
                <input
                  type="text"
                  value={formState.veiculoNecessario}
                  onChange={(e) =>
                    setFormState((s) => ({ ...s, veiculoNecessario: e.target.value }))
                  }
                  placeholder="Ex: Carreta Sider 3 Eixos / Grade Baixa"
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs"
                />
              </div>
            </div>

            {/* CARD 4: VALORES COMERCIAIS E ENCAMINHAMENTO */}
            <div className="bg-[#F8FAFC] border border-gray-200/90 rounded-2xl p-4 space-y-3.5 shadow-2xs">
              <div className="flex items-center gap-2 pb-2 border-b border-gray-200">
                <div className="w-6 h-6 rounded-lg bg-[#FFD400] text-[#080B0D] font-black flex items-center justify-center text-xs">
                  4
                </div>
                <h3 className="font-black text-sm text-[#080B0D] uppercase tracking-wide">
                  Valores Comerciais, Condições e Encaminhamento
                </h3>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">
                  Valor Fechado com o Cliente (R$) <span className="text-[#E5252A]">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs font-bold text-gray-400">R$</span>
                  <input
                    type="text"
                    value={formState.valorCobradoReais}
                    onChange={(e) =>
                      setFormState((s) => ({ ...s, valorCobradoReais: e.target.value }))
                    }
                    placeholder="8.500,00"
                    className="w-full pl-9 pr-3 py-2 bg-white border border-gray-300 rounded-xl font-black text-sm text-[#080B0D] focus:outline-none focus:border-[#FFD400]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    Condições Comerciais e Observações
                  </label>
                  <textarea
                    rows={2}
                    value={formState.condicoesComerciais}
                    onChange={(e) =>
                      setFormState((s) => ({ ...s, condicoesComerciais: e.target.value }))
                    }
                    placeholder="Ex: Pagamento 15 dias após entrega, seguro próprio..."
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    Instruções Operacionais para a Expedição
                  </label>
                  <textarea
                    rows={2}
                    value={formState.condicoesOperacionais}
                    onChange={(e) =>
                      setFormState((s) => ({ ...s, condicoesOperacionais: e.target.value }))
                    }
                    placeholder="Ex: Exigência de EPI, agendamento de doca, contato na portaria..."
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs focus:outline-none"
                  />
                </div>
              </div>

              {/* Encaminhamento para a Expedição */}
              <div className="p-3.5 bg-white border border-gray-200 rounded-xl grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                <div>
                  <label className="block text-[11px] font-extrabold text-[#080B0D] mb-1">
                    Encaminhar diretamente para na Expedição:
                  </label>
                  <select
                    value={formExpedicaoAssignee}
                    onChange={(e) => setFormExpedicaoAssignee(e.target.value)}
                    className="w-full px-3 py-2 bg-[#F8FAFC] border border-gray-300 rounded-lg text-xs font-bold text-[#080B0D]"
                  >
                    <option value="FILA_DISPONIVEL">
                      Fila Disponível da Expedição (Qualquer operador autorizado)
                    </option>
                    {expedicaoOperators.map((op) => (
                      <option key={op.id} value={op.id}>
                        Operador: {op.name} ({op.roleTitle})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="text-[11px] font-extrabold text-[#080B0D] mb-1">
                    O que a Expedição completará:
                  </p>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px] text-gray-600 font-medium">
                    {formPendingForExpedicao.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul><p className="mt-2 text-[11px] text-gray-600">Monitoramento: confirmar e registrar o endereço detalhado de entrega.</p>
                </div>
              </div>
            </div>
          </div>
        </CorporateModal>
      )}

      {/* ===================================================================== */}
      {/* MODAL: CONFIRMAR CONTRATAÇÃO E ENVIAR FRETE À EXPEDIÇÃO               */}
      {/* ===================================================================== */}
      {sendModalFreight && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Confirmar contratação e enviar à Expedição ({sendModalFreight.protocol})
                </h3>
                <p className="text-xs text-slate-500">{sendModalFreight.cliente}</p>
              </div>
              <button
                type="button"
                onClick={() => setSendModalFreight(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmSendToExpedicao} className="mt-4 space-y-4 text-sm">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1 text-slate-700">
                <div>
                  <strong>Rota:</strong> {sendModalFreight.origemCidadeUf} →{' '}
                  {sendModalFreight.destinoCidadeUf}
                </div>
                <div>
                  <strong>Endereço de coleta:</strong> {sendModalFreight.enderecoColeta || '—'}
                </div>
                <div>
                  <strong>Material:</strong> {sendModalFreight.tipoCarga || '—'}
                </div>
                <div>
                  <strong>Coleta combinada:</strong>{' '}
                  {formatFullDatePtBr(sendModalFreight.dataColetaIso)} às{' '}
                  {sendModalFreight.janelaColetaInicio}
                </div>
                <div>
                  <strong>Valor fechado com o cliente:</strong>{' '}
                  {formatCentavosToBrl(sendModalFreight.valorCobradoClienteCentavos)}
                </div>
              </div>

              {sendModalFreight.camposPendentesExpedicao &&
                sendModalFreight.camposPendentesExpedicao.length > 0 && (
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950">
                    <div className="font-bold mb-1">
                      Informações que a Expedição precisará completar:
                    </div>
                    <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                      {sendModalFreight.camposPendentesExpedicao.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Encaminhar para na Expedição
                </label>
                <select
                  value={selectedExpedicaoAssignee}
                  onChange={(e) => setSelectedExpedicaoAssignee(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm font-medium"
                >
                  <option value="FILA_DISPONIVEL">
                    Fila disponível da Expedição (Qualquer funcionário autorizado)
                  </option>
                  {expedicaoOperators.map((op) => (
                    <option key={op.id} value={op.id}>
                      Funcionário específico: {op.name} ({op.roleTitle})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  O mesmo protocolo ({sendModalFreight.protocol}) seguirá para a Expedição sem
                  duplicar cadastro.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setSendModalFreight(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={sendingToExpedicao}
                  className="px-5 py-2 rounded-lg bg-[#FFD400] hover:bg-[#F2C900] text-slate-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  {sendingToExpedicao
                    ? 'Enviando...'
                    : 'Confirmar contratação e enviar à Expedição'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SIDE DRAWER: DETALHES COMPLETOS DO FRETE (COMERCIAL)                  */}
      {/* ===================================================================== */}
      {selectedFreightId && (
        <div className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-[1px] flex justify-end">
          <div className="bg-white w-full max-w-2xl h-full shadow-2xl border-l border-slate-200 flex flex-col">
            {/* Drawer Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
              {detailLoading || !detailFreight ? (
                <div className="text-sm text-slate-500">Carregando detalhes do frete...</div>
              ) : (
                <div>
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-xl font-bold text-slate-900">
                      Frete {detailFreight.protocol}
                    </h2>
                    {renderCardStatusPill(detailFreight)}
                    {detailFreight.situacaoComercial === 'CANCELADO' && canCancel && (
                      <button
                        type="button"
                        onClick={() => {
                          setReactivateFreight(detailFreight);
                          setReactivateReason('');
                          setReactivateStage(
                            (detailFreight.preCancelComercial as any) || 'EM_NEGOCIACAO'
                          );
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] font-black text-xs rounded-lg cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reativar Frete</span>
                      </button>
                    )}
                  </div>
                  <div className="text-sm font-semibold text-slate-800 mt-0.5">
                    {detailFreight.cliente}
                  </div>
                  <div className="text-xs text-slate-500">
                    {detailFreight.origemCidadeUf} → {detailFreight.destinoCidadeUf}
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setSelectedFreightId(null);
                  setDetailFreight(null);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {detailFreight && (
              <>
                {/* Sub-navigation Tabs */}
                <div className="px-6 border-b border-slate-200 flex items-center gap-5 text-xs font-semibold">
                  {(
                    [
                      { id: 'RESUMO', label: 'Visão Geral & Progresso' },
                      { id: 'ANEXOS', label: `Documentos (${detailAnexos.length})` },
                      { id: 'COMENTARIOS', label: `Comentários (${detailComentarios.length})` },
                      { id: 'HISTORICO', label: `Histórico (${detailHistorico.length})` },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setDetailTab(t.id)}
                      className={`py-3 border-b-2 transition-colors cursor-pointer ${
                        detailTab === t.id
                          ? 'border-slate-900 text-slate-900'
                          : 'border-transparent text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* Drawer Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5 text-sm">
                  {detailTab === 'RESUMO' && (
                    <>
                      {/* Alert Box if Returned for Correction */}
                      {detailFreight.devolvidoParaCorrecao && (
                        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs space-y-2">
                          <div className="font-bold flex items-center gap-1.5">
                            <AlertTriangle className="w-4 h-4 text-red-600" />
                            Frete Devolvido para Correção
                          </div>
                          <p>
                            <strong>Motivo registrado:</strong> {detailFreight.motivoDevolucao}
                          </p>
                          <div className="pt-1 flex gap-2">
                            <button
                              type="button"
                              onClick={() => openEditModal(detailFreight)}
                              className="px-3 py-1.5 rounded-lg bg-white border border-red-300 font-semibold text-red-800 hover:bg-red-100"
                            >
                              Corrigir Dados Comerciais
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleCommercialStageChange(detailFreight, 'AGUARDANDO_EXPEDICAO')
                              }
                              className="px-3 py-1.5 rounded-lg bg-red-700 text-white font-semibold hover:bg-red-800"
                            >
                              Reenviar à Expedição
                            </button>
                          </div>
                        </div>
                      )}

                      {/* 4 Separated Statuses (Comercial / Expedição / Monitoramento / Financeiro) */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 min-w-0">
                          <div className="text-[11px] text-slate-500">Etapa Comercial</div>
                          <div className="font-bold text-slate-900 text-xs mt-0.5 break-words">
                            {formatSituacaoComercialLabel(detailFreight.situacaoComercial)}
                          </div>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 min-w-0">
                          <div className="text-[11px] text-slate-500">Etapa Expedição</div>
                          <div className="font-bold text-slate-900 text-xs mt-0.5 break-words">
                            {formatSituacaoOperacionalLabel(detailFreight.situacaoOperacional)}
                          </div>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 min-w-0">
                          <div className="text-[11px] text-slate-500">Monitoramento</div>
                          <div className="font-bold text-slate-900 text-xs mt-0.5 break-words">
                            {formatSituacaoMonitoramentoLabel(detailFreight.situacaoMonitoramento)}
                          </div>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 min-w-0">
                          <div className="text-[11px] text-slate-500">Financeiro</div>
                          <div className="font-bold text-slate-900 text-xs mt-0.5 break-words">
                            {formatSituacaoFinanceiraLabel(detailFreight.situacaoFinanceira)}
                          </div>
                        </div>
                      </div>

                      {/* Um Frete, Três Responsáveis */}
                      <div className="p-4 rounded-xl bg-slate-900 text-white grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        <div>
                          <span className="text-slate-400 block text-[11px]">
                            1. Comercial Responsável
                          </span>
                          <strong className="text-[#FFD400]">
                            {detailFreight.comercialResponsavelNome}
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[11px]">
                            2. Expedição Responsável
                          </span>
                          <strong className="text-white">
                            {detailFreight.expedicaoResponsavelNome || 'Fila disponível'}
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[11px]">
                            3. Operador de Monitoramento
                          </span>
                          <strong className="text-white">
                            {detailFreight.monitoramentoResponsavelNome || 'A definir na Expedição'}
                          </strong>
                        </div>
                      </div>

                      {/* Values Box */}
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-2 sm:grid-cols-3 gap-4">
                        <div>
                          <div className="text-xs text-slate-500">Valor Fechado com Cliente</div>
                          <div className="text-base font-bold text-slate-900 tabular-nums">
                            {formatCentavosToBrl(detailFreight.valorCobradoClienteCentavos)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">Frete Motorista (Expedição)</div>
                          <div className="text-base font-bold text-slate-900 tabular-nums">
                            {detailFreight.valorContratadoCentavos
                              ? formatCentavosToBrl(detailFreight.valorContratadoCentavos)
                              : 'A definir'}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">Margem Bruta</div>
                          <div className="text-base font-bold text-emerald-700 tabular-nums">
                            {detailFreight.valorCobradoClienteCentavos !== undefined &&
                            detailFreight.valorContratadoCentavos > 0
                              ? formatCentavosToBrl(
                                  detailFreight.valorCobradoClienteCentavos -
                                    detailFreight.valorContratadoCentavos
                                )
                              : '—'}
                          </div>
                        </div>
                      </div>

                      {/* Pending items for Expedição */}
                      {detailFreight.camposPendentesExpedicao &&
                        detailFreight.camposPendentesExpedicao.length > 0 && (
                          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950">
                            <div className="font-bold mb-1">
                              Informações pendentes para a Expedição completar:
                            </div>
                            <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                              {detailFreight.camposPendentesExpedicao.map((item, idx) => (
                                <li key={idx}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                      {/* Endereços e Carga */}
                      <div className="p-4 rounded-xl border border-slate-200 space-y-3 text-xs">
                        <h4 className="font-bold text-slate-900 text-sm">
                          Dados de Coleta, Entrega e Carga
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <span className="text-slate-400 block">Origem e Coleta</span>
                            <strong className="text-slate-900">
                              {detailFreight.origemCidadeUf}
                            </strong>
                            <p className="text-slate-600">
                              {detailFreight.enderecoColeta || 'A completar'}
                            </p>
                            <p className="text-slate-500 mt-0.5">
                              Data: {formatFullDatePtBr(detailFreight.dataColetaIso)} (
                              {detailFreight.janelaColetaInicio} - {detailFreight.janelaColetaFim})
                            </p>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Destino e Entrega</span>
                            <strong className="text-slate-900">
                              {detailFreight.destinoCidadeUf}
                            </strong>
                            <p className="text-slate-600">
                              {detailFreight.enderecoEntrega || 'A completar na Expedição'}
                            </p>
                            <p className="text-slate-500 mt-0.5">
                              Previsão: {formatFullDatePtBr(detailFreight.dataEntregaPrevistaIso)}{' '}
                              às {detailFreight.janelaEntregaInicio}
                            </p>
                          </div>
                        </div>
                        <div className="pt-2 border-t border-slate-100 grid grid-cols-3 gap-2">
                          <div>
                            <span className="text-slate-400 block">Material / Carga</span>
                            <strong className="text-slate-800">
                              {detailFreight.tipoCarga || '—'}
                            </strong>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Peso / Volumes</span>
                            <strong className="text-slate-800">
                              {detailFreight.pesoKg
                                ? `${detailFreight.pesoKg.toLocaleString('pt-BR')} kg`
                                : 'A definir'}{' '}
                              • {detailFreight.volumes || '—'} vol.
                            </strong>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Veículo</span>
                            <strong className="text-slate-800">
                              {detailFreight.veiculoNecessario || 'A definir'}
                            </strong>
                          </div>
                        </div>
                      </div>

                      {/* Dados Operacionais e Monitoramento (Somente leitura para acompanhamento do Comercial) */}
                      <div className="p-4 rounded-xl border border-slate-200 space-y-2.5 text-xs">
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-slate-900 text-sm">
                            Progresso da Expedição e Monitoramento
                          </h4>
                          {detailFreight.ordemCarregamentoNumero && (
                            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[11px]">
                              Ordem: {detailFreight.ordemCarregamentoNumero}
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                          <div>
                            <span className="text-slate-400 block">Motorista</span>
                            <strong className="text-slate-800">
                              {detailFreight.motoristaNome || 'Aguardando Expedição'}
                            </strong>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Placa Veículo</span>
                            <strong className="text-slate-800">
                              {detailFreight.placaVeiculo || '—'}
                            </strong>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Videochamada</span>
                            <strong className="text-slate-800">
                              {detailFreight.checklistFechamento?.videochamadaRealizada
                                ? 'Realizada'
                                : 'Pendente'}
                            </strong>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Verificações Exp.</span>
                            <strong className="text-slate-800">
                              {detailFreight.checklistConcluidosCount}/5 concluídas
                            </strong>
                          </div>
                        </div>
                        {detailFreight.ultimaLocalizacaoInformada && (
                          <div className="pt-2 border-t border-slate-100">
                            <span className="text-slate-400 block">
                              Última localização informada ao Monitoramento:
                            </span>
                            <strong className="text-slate-900">
                              {detailFreight.ultimaLocalizacaoInformada}
                            </strong>{' '}
                            <span className="text-slate-400">
                              ({detailFreight.ultimaLocalizacaoAtualizadaEm})
                            </span>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {detailTab === 'ANEXOS' && (
                    <FreightDocumentsManager
                      freight={detailFreight}
                      currentUser={currentUser}
                    savedAttachments={detailAnexos}
                    canVerify={false}
                    onAttachmentsUpdated={(attachments) => { setDetailAnexos(attachments); }}
                    />
                  )}

                  {detailTab === 'COMENTARIOS' && (
                    <div className="space-y-4">
                      <form onSubmit={handlePostComment} className="flex gap-2">
                        <input
                          type="text"
                          value={newCommentText}
                          onChange={(e) => setNewCommentText(e.target.value)}
                          placeholder="Escrever observação ou alinhamento para a Expedição / Monitoramento..."
                          className="flex-1 px-3.5 py-2 border border-slate-300 rounded-lg text-xs"
                        />
                        <button
                          type="submit"
                          disabled={postingComment || !newCommentText.trim()}
                          className="px-4 py-2 rounded-lg bg-[#FFD400] hover:bg-[#F2C900] text-slate-950 font-bold text-xs disabled:opacity-50 cursor-pointer"
                        >
                          Enviar
                        </button>
                      </form>

                      {detailComentarios.length === 0 ? (
                        <div className="py-8 text-center text-xs text-slate-400">
                          Nenhum comentário registrado neste frete.
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {detailComentarios.map((c) => (
                            <div
                              key={c.id}
                              className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-slate-900">
                                  {c.authorName}{' '}
                                  <span className="font-normal text-slate-500">
                                    ({c.sector})
                                  </span>
                                </span>
                                <span className="text-[11px] text-slate-400">
                                  {c.createdAtFormatted}
                                </span>
                              </div>
                              <p className="text-slate-700">{c.text}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {detailTab === 'HISTORICO' && (
                    <div className="space-y-3">
                      {detailHistorico.map((h) => (
                        <div
                          key={h.id}
                          className="flex items-start gap-3 p-3 rounded-xl border border-slate-200/80 text-xs"
                        >
                          <div className="w-2 h-2 rounded-full bg-slate-400 mt-1.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-slate-900">{h.summary}</span>
                              <span className="text-[11px] text-slate-400 shrink-0">
                                {h.timestampFormatted}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              Autor: {h.actorName} ({h.actorSector})
                              {h.horarioRealEvento &&
                                h.horarioRealEvento !== h.timestampFormatted && (
                                  <span className="ml-2 text-slate-700 font-semibold">
                                    • Horário real: {h.horarioRealEvento}
                                  </span>
                                )}
                            </div>
                            {h.reason && (
                              <div className="mt-1 p-2 rounded bg-amber-50 text-amber-900 text-[11px]">
                                <strong>Observação / Motivo:</strong> {h.reason}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Drawer Footer Actions */}
                <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditModal(detailFreight)}
                      className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Editar Comercial
                    </button>

                    {canTransfer && (
                      <button
                        type="button"
                        onClick={() => {
                          setTransferTargetUserId(comercialOperators[0]?.id || '');
                          setTransferModalOpen(true);
                        }}
                        className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800 flex items-center gap-1.5 cursor-pointer"
                      >
                        <ArrowLeftRight className="w-3.5 h-3.5" />
                        Transferir
                      </button>
                    )}

                    {canCancel && detailFreight.situacaoComercial !== 'CANCELADO' && (
                      <button
                        type="button"
                        onClick={() => setCancelModalOpen(true)}
                        className="px-3.5 py-2 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-xs font-semibold text-red-700 flex items-center gap-1.5 cursor-pointer"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        Cancelar Frete
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {(detailFreight.situacaoComercial === 'EM_NEGOCIACAO' ||
                      detailFreight.situacaoComercial === 'CONTRATADO' ||
                      detailFreight.devolvidoParaCorrecao) && (
                      <button
                        type="button"
                        onClick={() =>
                          handleCommercialStageChange(detailFreight, 'AGUARDANDO_EXPEDICAO')
                        }
                        className="px-4 py-2 rounded-lg bg-[#FFD400] hover:bg-[#F2C900] text-slate-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Confirmar contratação e enviar à Expedição
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* MODAL DE TRANSFERÊNCIA DE RESPONSABILIDADE COMERCIAL */}
      {transferModalOpen && detailFreight && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Transferir Responsabilidade Comercial ({detailFreight.protocol})
            </h3>
            <form onSubmit={handleTransferSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Novo Responsável Comercial *
                </label>
                <select
                  required
                  value={transferTargetUserId}
                  onChange={(e) => setTransferTargetUserId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                >
                  <option value="">Selecione...</option>
                  {comercialOperators.map((op) => (
                    <option key={op.id} value={op.id}>
                      {op.name} ({op.roleTitle})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Motivo da Transferência *
                </label>
                <textarea
                  rows={3}
                  required
                  value={transferReason}
                  onChange={(e) => setTransferReason(e.target.value)}
                  placeholder="Informe o motivo para registro no histórico de auditoria..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setTransferModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 font-semibold"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  disabled={actionBusy}
                  className="px-4 py-2 rounded-lg bg-slate-900 text-white font-bold"
                >
                  Confirmar Transferência
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE CANCELAMENTO DE FRETE */}
      {cancelModalOpen && detailFreight && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-red-700">
              Cancelar Frete {detailFreight.protocol}
            </h3>
            <p className="text-xs text-slate-600">
              O registro será preservado para auditoria e poderá ser consultado usando o filtro
              &ldquo;Mostrar cancelados&rdquo;.
            </p>
            <form onSubmit={handleCancelSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Motivo Obrigatório do Cancelamento *
                </label>
                <textarea
                  rows={3}
                  required
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Descreva o motivo do cancelamento (mínimo 5 caracteres)..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCancelModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 font-semibold"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  disabled={actionBusy}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white font-bold"
                >
                  Confirmar Cancelamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE REATIVAÇÃO DE FRETE COMERCIAL */}
      {reactivateFreight && (
        <CorporateModal
          isOpen={Boolean(reactivateFreight)}
          onClose={() => {
            setReactivateFreight(null);
            setReactivateReason('');
          }}
          title={`Reativar Frete ${reactivateFreight.protocol}`}
          subtitle={`Cliente: ${reactivateFreight.cliente} • Rota: ${reactivateFreight.origemCidadeUf} → ${reactivateFreight.destinoCidadeUf}`}
          maxWidth="md"
          footer={
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setReactivateFreight(null);
                  setReactivateReason('');
                }}
                className="px-3.5 py-2 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={reactivating || !reactivateReason.trim()}
                onClick={async () => {
                  if (!reactivateFreight || !reactivateReason.trim()) return;
                  setReactivating(true);
                  try {
                    const res = await apiReactivateFreight(reactivateFreight.id, {
                      reason: reactivateReason.trim(),
                      targetStage: reactivateFreight.preCancelOperacional || 'RECEBIDO',
                    });
                    if (!res.ok || !res.freight) {
                      setErrorBanner(res.error || 'Erro ao reativar frete.');
                      return;
                    }
                    const updated = res.freight;
                    setItems((prev) =>
                      prev.map((item) => (item.id === updated.id ? updated : item))
                    );
                    if (detailFreight?.id === updated.id) {
                      setDetailFreight(updated);
                    }
                    setReactivateFreight(null);
                    setReactivateReason('');
                    showToast(`Frete ${updated.protocol} reativado com sucesso.`);
                    void fetchFreights(true);
                  } catch (err) {
                    setErrorBanner(
                      err instanceof Error ? err.message : 'Erro ao reativar frete.'
                    );
                  } finally {
                    setReactivating(false);
                  }
                }}
                className="px-4 py-2 text-xs font-extrabold text-[#080B0D] bg-[#FFD400] hover:bg-[#ffdf33] rounded-lg inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{reactivating ? 'Reativando...' : 'Confirmar Reativação'}</span>
              </button>
            </div>
          }
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900">
              A reativação restaurará o frete para a etapa comercial anterior (
              <strong>{reactivateFreight.preCancelComercial || 'EM_NEGOCIACAO'}</strong>),
              preservando seu código único ({reactivateFreight.protocol}), documentos,
              responsáveis e histórico integral de auditoria.
            </div>
            <div>
              <label className="block text-xs font-bold text-[#15191D] mb-1">
                Motivo da Reativação *
              </label>
              <textarea
                rows={3}
                value={reactivateReason}
                onChange={(e) => setReactivateReason(e.target.value)}
                placeholder="Informe a justificativa corporativa para reativar este frete..."
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs focus:outline-none focus:border-[#FFD400]"
              />
            </div>
          </div>
        </CorporateModal>
      )}
    </div>
  );
};

import {useNotificationRecord} from '../hooks/useNotificationRecord';
import './PortalModernizacao.css';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clipboard,
  Clock,
  CloudUpload,
  Download,
  Edit2,
  Eye,
  EyeOff,
  FileCheck2,
  FileText,
  Loader2,
  Lock,
  Paperclip,
  Plus,
  Printer,
  RefreshCw,
  Share2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Truck,
  Upload,
  UserCheck,
  WifiOff,
  X,
} from 'lucide-react';
import {
  CarrierBrand,
  Employee,
  FreightDocumentFile,
  FreightRecord,
  FreightRuleType,
  FreightStatus,
  OperationalUnit,
  PaymentInstallmentType,
  PaymentIntentRecord,
  PaymentReceiptRecord,
  PaymentReceiptUploadState,
} from '../types';
import {
  createFreightDocumentFile,
  formatCurrencyBRL,
  formatFileSize,
  getFileDataFromIndexedDB,
  readFileAsDataUrl,
} from '../lib/freightDatabase';
import { canConfirmFreightPayment, canAccessFinanceiroFreights } from '../lib/permissions';
import { getAuthHeaders } from '../lib/serverApi';
import {
  SharedReceiptDraft,
  enqueueOfflinePendingReceipt,
  removeOfflinePendingReceipt,
  usePWAInstall,
} from '../lib/pwaShareTarget';
import { ReceberComprovanteModal } from './ReceberComprovanteModal';
import { BankCombobox } from './BankCombobox';
import { isValidBank } from '../data/brazilianBanks';
import {
  CARRIER_BRANDS,
  CarrierBrandLogo,
  getUnitShortTag,
  OPERATIONAL_UNITS,
  parseOperationalTrafficScript,
  SAMPLE_TRAFFIC_SCRIPT,
} from '../lib/carrierLogos';
import {
  FreightOrderDetailsModal,
  FreightOrderDetailViewModel,
} from './FreightOrderDetailsModal';

export type FinanceiroRoleMode = 'FINANCEIRO_ADMIN' | 'OPERADOR';

interface FinanceiroFretesViewProps {
  freights: FreightRecord[];
  currentUser: Employee;
  onAddFreight: (newFreight: FreightRecord) => void;
  onHydrateFreights?: (records: FreightRecord[]) => void;
  onUpdateFreight: (updatedFreight: FreightRecord, auditDescription: string) => void;
  initialSharedDraft?: SharedReceiptDraft | null;
  onClearInitialSharedDraft?: () => void;
}

type FilterTab =
  | 'Todos'
  | 'Pendente Adiantamento'
  | 'Pendente Saldo'
  | 'Aguardando Entrega'
  | 'Pagos';

export const FinanceiroFretesView: React.FC<FinanceiroFretesViewProps> = ({
  freights,
  currentUser,
  onAddFreight,
  onHydrateFreights,
  onUpdateFreight,
  initialSharedDraft,
  onClearInitialSharedDraft,
}) => {
  const { isInstallable, isIOS, isAndroid, installApp } = usePWAInstall();
  const canUserConfirmSettlement = canConfirmFreightPayment(currentUser);
  // RBAC Role Simulator (integrated with currentUser and quick-switchable for testing)
  const defaultRoleMode: FinanceiroRoleMode =
    currentUser.accessLevel === 'ADMINISTRADOR' ||
    currentUser.accessLevel === 'DIRETORIA' ||
    currentUser.department === 'Financeiro' ||
    currentUser.department === 'Administrativo'
      ? 'FINANCEIRO_ADMIN'
      : 'OPERADOR';

  const [roleMode, setRoleMode] = useState<FinanceiroRoleMode>(defaultRoleMode);

  useEffect(() => {
    setRoleMode(
      currentUser.accessLevel === 'ADMINISTRADOR' ||
        currentUser.accessLevel === 'DIRETORIA' ||
        currentUser.department === 'Financeiro' ||
        currentUser.department === 'Administrativo'
        ? 'FINANCEIRO_ADMIN'
        : 'OPERADOR'
    );
  }, [currentUser.accessLevel, currentUser.department]);

  // Regra de Sigilo e Proteção de Valores Financeiros:
  // Acesso estritamente validado pelo servidor (hasPagePermission financeiro / canConfirmFreightPayment)
  const isFinanceiroUser = useMemo(
    () => currentUser.accessProfile === 'FINANCEIRO',
    [currentUser]
  );

  const canExecutePayment = useMemo(
    () => canConfirmFreightPayment(currentUser),
    [currentUser]
  );

  const [showMonetaryValues, setShowMonetaryValues] = useState<boolean>(true);

  const formatProtectedCurrency = (val: number | string) => {
    if (!showMonetaryValues) {
      return 'R$ ••••••';
    }
    const num = typeof val === 'number' ? val : Number(val) || 0;
    return formatCurrencyBRL(num);
  };

  // Filter Tabs
  const [activeFilter, setActiveFilter] = useState<FilterTab>('Todos');

  // Toast Notification
  const [toastMsg, setToastMsg] = useState<{ title: string; subtitle?: string } | null>(null);
  const triggerToast = (title: string, subtitle?: string) => {
    setToastMsg({ title, subtitle });
    setTimeout(() => {
      setToastMsg((prev) => (prev?.title === title ? null : prev));
    }, 4000);
  };

  // =========================================================================
  // 1. DYNAMIC KPI CALCULATIONS FROM DATABASE
  // =========================================================================
  const kpis = useMemo(() => {
    // 1. Aguardando Adiantamento
    const aguardandoAdiantList = freights.filter(
      (f) => f.status === 'Pendente Adiantamento' && !f.adiantamentoPago
    );
    const aguardandoAdiantSum = aguardandoAdiantList.reduce(
      (acc, f) => acc + (f.valorAdiantamento || f.valorTotal),
      0
    );

    // 2. Em Trânsito (Saldos Retidos)
    const emTransitoList = freights.filter(
      (f) =>
        f.status === 'Aguardando Entrega' ||
        (f.adiantamentoPago && !f.entregaConfirmada && !f.saldoPago)
    );
    const emTransitoSum = emTransitoList.reduce((acc, f) => acc + f.valorSaldo, 0);

    // 3. Saldos Liberados (Entregues aguardando pagamento do saldo)
    const saldosLiberadosList = freights.filter(
      (f) =>
        f.status === 'Pendente Saldo' ||
        (f.status === 'Adiantamento Pago' && f.entregaConfirmada && !f.saldoPago)
    );
    const saldosLiberadosSum = saldosLiberadosList.reduce((acc, f) => acc + f.valorSaldo, 0);

    // 4. Pago (Mês Atual)
    const pagoMesSum = freights.reduce((acc, f) => {
      let paid = 0;
      if (f.adiantamentoPago) paid += f.valorAdiantamento;
      if (f.saldoPago) paid += f.valorSaldo;
      return acc + paid;
    }, 0);

    return {
      aguardandoAdiantCount: aguardandoAdiantList.length,
      aguardandoAdiantSum,
      emTransitoCount: emTransitoList.length,
      emTransitoSum,
      saldosLiberadosCount: saldosLiberadosList.length,
      saldosLiberadosSum,
      pagoMesSum,
    };
  }, [freights]);

  // Filtered list based on selected tab
  const statusFilteredFreights = useMemo(() => {
    switch (activeFilter) {
      case 'Pendente Adiantamento':
        return freights.filter((f) => f.status === 'Pendente Adiantamento');
      case 'Pendente Saldo':
        return freights.filter(
          (f) =>
            f.status === 'Pendente Saldo' ||
            (f.status === 'Adiantamento Pago' && !f.saldoPago)
        );
      case 'Aguardando Entrega':
        return freights.filter(
          (f) =>
            f.status === 'Aguardando Entrega' ||
            (f.adiantamentoPago && !f.entregaConfirmada && !f.saldoPago)
        );
      case 'Pagos':
        return freights.filter((f) => f.status === 'Pago' || (f.adiantamentoPago && f.saldoPago));
      case 'Todos':
      default:
        return freights;
    }
  }, [freights, activeFilter]);

  // =========================================================================
  // 2. MODAL "+ SOLICITAR PAGAMENTO DE FRETE" (FICHA DE CARREGAMENTO + CALCULADORA)
  // =========================================================================
  const [detailTab, setDetailTab] = useState('Resumo');
  const [showFullOrder, setShowFullOrder] = useState(false);
  const [financialLayout, setFinancialLayout] = useState<'cards' | 'table'>('cards');
  const [financialSearch, setFinancialSearch] = useState('');
  const [financialRule, setFinancialRule] = useState('all');
  const financialDraftId = useRef<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedOrderDetails, setSelectedOrderDetails] = useState<FreightRecord | null>(null);
  const notificationRecord=useNotificationRecord();
  useEffect(()=>{if(notificationRecord.id){const found=freights.find(f=>f.id===notificationRecord.id);if(found){setSelectedOrderDetails(found);setDetailTab('Resumo');}}},[notificationRecord.id,notificationRecord.revision,freights]);


  const filteredFreights = statusFilteredFreights.filter(f => {
    const term = financialSearch.trim().toLocaleLowerCase('pt-BR');
    const searchMatch = !term || [f.code,f.cliente,f.origem,f.destino,f.motoristaNome,f.favorecido].some(v => String(v || '').toLocaleLowerCase('pt-BR').includes(term));
    const ruleMatch = financialRule === 'all' || (financialRule === '100' ? f.regraTipo === 'INTEGRAL_100' : financialRule === '80' ? f.percentualAdiantamento === 80 && f.percentualSaldo === 20 : f.percentualAdiantamento === 70 && f.percentualSaldo === 30);
    return searchMatch && ruleMatch;
  });
  // Operational Loading Sheet fields
  const [empresaMarca, setEmpresaMarca] = useState<CarrierBrand>('RODOVAR');
  const [unidadeOperacional, setUnidadeOperacional] = useState<OperationalUnit>('BA - Salvador');
  const [dataCarregamento, setDataCarregamento] = useState('27/10/2026');
  const [comercialResponsavel, setComercialResponsavel] = useState('Jeise / César');
  const [expedicaoResponsavel, setExpedicaoResponsavel] = useState(
    () => `${currentUser.name.split(' ')[0]} (Expedição)`
  );
  const [cliente, setCliente] = useState('');
  const [telefoneCliente, setTelefoneCliente] = useState('(71) 99920-2476');
  const [motoristaNome, setMotoristaNome] = useState('');
  const [motoristaTelefone, setMotoristaTelefone] = useState('');
  const [contatoEmergenciaNome, setContatoEmergenciaNome] = useState('');
  const [contatoEmergenciaTelefone, setContatoEmergenciaTelefone] = useState('');
  const [origem, setOrigem] = useState('');
  const [destino, setDestino] = useState('');
  const [dataColeta, setDataColeta] = useState('27/10');
  const [dataEntrega, setDataEntrega] = useState('29/10');
  const [freteEmpresaInput, setFreteEmpresaInput] = useState<string>('8900');
  const [valorTotalInput, setValorTotalInput] = useState<string>('6000');
  const [regraTipo, setRegraTipo] = useState<FreightRuleType>('70_30');
  const [customAdiantPct, setCustomAdiantPct] = useState<number>(70);
  const [customSaldoPct, setCustomSaldoPct] = useState<number>(30);
  const [showScriptPasteBox, setShowScriptPasteBox] = useState(false);
  const [scriptText, setScriptText] = useState('');

  // Banking & PIX fields
  const [favorecido, setFavorecido] = useState('');
  const [banco, setBanco] = useState('260 - Nu Pagamentos');
  const [agencia, setAgencia] = useState('0001');
  const [conta, setConta] = useState('');
  const [tipoChavePix, setTipoChavePix] = useState<
    'CPF/CNPJ' | 'Celular' | 'E-mail' | 'Chave Aleatória'
  >('CPF/CNPJ');
  const [chavePix, setChavePix] = useState('');

  // 3 File Uploads (CT-e, MDF-e, RPA)
  const [cteFile, setCteFile] = useState<File | null>(null);
  const [mdfeFile, setMdfeFile] = useState<File | null>(null);
  const [rpaFile, setRpaFile] = useState<File | null>(null);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);

  // Smart Calculator derived values
  const numericTotal = useMemo(() => {
    const cleaned = valorTotalInput.replace(/[^\d.,]/g, '').replace(',', '.');
    const val = parseFloat(cleaned);
    return Number.isFinite(val) && val > 0 ? val : 0;
  }, [valorTotalInput]);

  const effectiveAdiantPct =
    regraTipo === '70_30' ? 70 : regraTipo === 'INTEGRAL_100' ? 100 : customAdiantPct;
  const effectiveSaldoPct =
    regraTipo === '70_30' ? 30 : regraTipo === 'INTEGRAL_100' ? 0 : customSaldoPct;

  const calculatedAdiantamento = useMemo(
    () => Number(((numericTotal * effectiveAdiantPct) / 100).toFixed(2)),
    [numericTotal, effectiveAdiantPct]
  );
  const calculatedSaldo = useMemo(
    () => Number((numericTotal - calculatedAdiantamento).toFixed(2)),
    [numericTotal, calculatedAdiantamento]
  );

  const handleAdiantPctChange = (valStr: string) => {
    const raw = Math.max(0, Math.min(100, Number(valStr) || 0));
    setCustomAdiantPct(raw);
    setCustomSaldoPct(Math.max(0, 100 - raw));
  };

  const handleSaldoPctChange = (valStr: string) => {
    const raw = Math.max(0, Math.min(100, Number(valStr) || 0));
    setCustomSaldoPct(raw);
    setCustomAdiantPct(Math.max(0, 100 - raw));
  };

  const numericFreteEmpresa = useMemo(() => {
    const cleaned = freteEmpresaInput.replace(/[^\d.,]/g, '').replace(',', '.');
    const val = parseFloat(cleaned);
    return Number.isFinite(val) && val > 0 ? val : 0;
  }, [freteEmpresaInput]);

  const handleApplyPastedScript = (rawText?: string) => {
    const target = rawText ?? scriptText;
    if (!target.trim()) {
      triggerToast('Cole o texto do script primeiro');
      return;
    }
    const parsed = parseOperationalTrafficScript(target);
    if (parsed.empresaMarca) setEmpresaMarca(parsed.empresaMarca);
    if (parsed.unidadeOperacional) setUnidadeOperacional(parsed.unidadeOperacional);
    if (parsed.dataCarregamento) {
      setDataCarregamento(parsed.dataCarregamento);
      setDataColeta(parsed.dataCarregamento.slice(0, 5));
    }
    if (parsed.comercialResponsavel) setComercialResponsavel(parsed.comercialResponsavel);
    if (parsed.expedicaoResponsavel) setExpedicaoResponsavel(parsed.expedicaoResponsavel);
    if (parsed.cliente) setCliente(parsed.cliente);
    if (parsed.telefoneCliente) setTelefoneCliente(parsed.telefoneCliente);
    if (parsed.motoristaNome) {
      setMotoristaNome(parsed.motoristaNome);
      if (!favorecido) setFavorecido(parsed.motoristaNome);
    }
    if (parsed.motoristaTelefone) setMotoristaTelefone(parsed.motoristaTelefone);
    if (parsed.emergenciaNome) setContatoEmergenciaNome(parsed.emergenciaNome);
    if (parsed.emergenciaTelefone)
      setContatoEmergenciaTelefone(parsed.emergenciaTelefone);
    if (parsed.origem) setOrigem(parsed.origem);
    if (parsed.destino) setDestino(parsed.destino);
    if (parsed.valorFreteEmpresa) setFreteEmpresaInput(String(parsed.valorFreteEmpresa));
    if (parsed.valorFreteMotorista) setValorTotalInput(String(parsed.valorFreteMotorista));
    if (parsed.favorecido) setFavorecido(parsed.favorecido);
    if (parsed.chavePix) setChavePix(parsed.chavePix);
    if (parsed.tipoChavePix) setTipoChavePix(parsed.tipoChavePix);
    if (parsed.banco) setBanco(parsed.banco);
    setShowScriptPasteBox(false);
    triggerToast(
      'Script de Tráfego importado!',
      'Os campos operacionais e financeiros foram preenchidos automaticamente.'
    );
  };

  const resetCreateModal = () => {
    setEmpresaMarca('RODOVAR');
    setUnidadeOperacional('BA - Salvador');
    setDataCarregamento('27/10/2026');
    setComercialResponsavel('Jeise / César');
    setExpedicaoResponsavel(`${currentUser.name.split(' ')[0]} (Expedição)`);
    setCliente('');
    setTelefoneCliente('(71) 99920-2476');
    setMotoristaNome('');
    setMotoristaTelefone('');
    setContatoEmergenciaNome('');
    setContatoEmergenciaTelefone('');
    setOrigem('');
    setDestino('');
    setDataColeta('27/10');
    setDataEntrega('29/10');
    setFreteEmpresaInput('8900');
    setValorTotalInput('6000');
    setRegraTipo('70_30');
    setCustomAdiantPct(70);
    setCustomSaldoPct(30);
    setFavorecido('');
    setBanco('260 - Nu Pagamentos');
    setAgencia('0001');
    setConta('');
    setTipoChavePix('CPF/CNPJ');
    setChavePix('');
    setCteFile(null);
    setMdfeFile(null);
    setRpaFile(null);
    financialDraftId.current = null;
    setScriptText('');
    setShowScriptPasteBox(false);
  };

  const handleCreateFreightSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingCreate) return;
    if (!cliente.trim() || !origem.trim() || !destino.trim() || numericTotal <= 0) {
      triggerToast(
        'Preencha os dados obrigatórios do frete',
        'Informe Cliente, Origem, Destino e Valor Total maior que R$ 0,00.'
      );
      return;
    }
    if (!favorecido.trim() || !chavePix.trim()) {
      triggerToast(
        'Dados Bancários / PIX incompletos',
        'Informe o Nome do Favorecido e a Chave PIX do motorista/transportador.'
      );
      return;
    }
    if (!isValidBank(banco)) {
      triggerToast(
        'Instituição Bancária Inválida',
        'Selecione uma instituição financeira oficial reconhecida pelo BACEN/FEBRABAN na lista suspensa.'
      );
      return;
    }

    setIsSubmittingCreate(true);
    try {
      const nextNum = 843 + freights.length;
      const code = `#0${nextNum}`;
      const now = new Date();
      const createdAtDate = now.toLocaleDateString('pt-BR');

      const docsObj: FreightRecord['docs'] = {};

      if (cteFile) {
        docsObj.cte = await createFreightDocumentFile(cteFile, 'CT-e', 'CT-e', currentUser.name);
      } else {
        docsObj.cte = {
          id: `doc-cte-${Date.now()}`,
          type: 'CT-e',
          label: 'CT-e',
          fileName: `CTe_${code.replace('#', '')}_${cliente.slice(0, 10).toUpperCase().replace(/\s+/g, '')}.pdf`,
          mimeType: 'application/pdf',
          sizeLabel: '240 KB',
          uploadedAt: now.toLocaleString('pt-BR'),
          uploadedBy: currentUser.name,
        };
      }

      if (mdfeFile) {
        docsObj.mdfe = await createFreightDocumentFile(
          mdfeFile,
          'MDF-e',
          'MDF-e',
          currentUser.name
        );
      } else {
        docsObj.mdfe = {
          id: `doc-mdfe-${Date.now()}`,
          type: 'MDF-e',
          label: 'MDF-e',
          fileName: `MDFe_${code.replace('#', '')}_Manifesto.pdf`,
          mimeType: 'application/pdf',
          sizeLabel: '185 KB',
          uploadedAt: now.toLocaleString('pt-BR'),
          uploadedBy: currentUser.name,
        };
      }

      if (rpaFile) {
        docsObj.rpa = await createFreightDocumentFile(rpaFile, 'RPA', 'RPA', currentUser.name);
      } else {
        docsObj.rpa = {
          id: `doc-rpa-${Date.now()}`,
          type: 'RPA',
          label: 'RPA',
          fileName: `RPA_${code.replace('#', '')}_Recibo.pdf`,
          mimeType: 'application/pdf',
          sizeLabel: '160 KB',
          uploadedAt: now.toLocaleString('pt-BR'),
          uploadedBy: currentUser.name,
        };
      }

      const regraLabel =
        regraTipo === '70_30'
          ? '70% / 30%'
          : regraTipo === 'INTEGRAL_100'
          ? 'Integral (100%)'
          : `${effectiveAdiantPct}% / ${effectiveSaldoPct}%`;

      const newFreight: FreightRecord = {
        id: financialDraftId.current || (financialDraftId.current = 'frete-' + crypto.randomUUID()),
        code,
        createdAtDate,
        createdAtIso: now.toISOString(),
        empresaMarca,
        dataCarregamento: dataCarregamento.trim() || createdAtDate,
        unidadeOperacional,
        comercialResponsavel: comercialResponsavel.trim() || 'Jeise / César',
        expedicaoResponsavel:
          expedicaoResponsavel.trim() || `${currentUser.name.split(' ')[0]} (Expedição)`,
        cliente: cliente.trim().toUpperCase(),
        telefoneCliente: telefoneCliente.trim() || '(71) 99920-2476',
        motoristaNome: motoristaNome.trim() || favorecido.trim(),
        motoristaTelefone: motoristaTelefone.trim() || '(71) 99920-2476',
        emergenciaNome: contatoEmergenciaNome.trim() || 'Central Operacional',
        emergenciaTelefone: contatoEmergenciaTelefone.trim() || '(71) 99920-2476',
        origem: origem.trim(),
        destino: destino.trim(),
        dataColeta: dataColeta.trim() || dataCarregamento.slice(0, 5) || 'Hoje',
        dataEntrega: dataEntrega.trim() || 'Amanhã',
        regraTipo,
        regraLabel,
        percentualAdiantamento: effectiveAdiantPct,
        percentualSaldo: effectiveSaldoPct,
        valorFreteEmpresa:
          numericFreteEmpresa > 0
            ? numericFreteEmpresa
            : Number((numericTotal * 1.38).toFixed(2)),
        valorFreteMotorista: numericTotal,
        valorTotal: numericTotal,
        valorAdiantamento: calculatedAdiantamento,
        valorSaldo: calculatedSaldo,
        favorecido: favorecido.trim(),
        banco: banco.trim() || '260 - Nu Pagamentos',
        agencia: agencia.trim() || '0001',
        conta: conta.trim() || '18670000-5',
        tipoChavePix,
        chavePix: chavePix.trim(),
        status: 'Pendente Adiantamento',
        adiantamentoPago: false,
        entregaConfirmada: false,
        saldoPago: false,
        solicitanteNome: `${currentUser.name} (${currentUser.department})`,
        docs: docsObj,
      };

      const response = await fetch('/api/pagamentos/fretes', { method:'POST', credentials:'include', headers:{...getAuthHeaders(),'Content-Type':'application/json'}, body:JSON.stringify({freight:newFreight}) });
      const saved = await response.json();
      if (!response.ok || !saved.freight) throw new Error(saved.error || 'Não foi possível salvar a solicitação no servidor.');
      onAddFreight(saved.freight);
      setShowCreateModal(false);
      resetCreateModal();
      triggerToast(
        `Solicitação de Frete ${code} registrada!`,
        `Cliente ${newFreight.cliente} • Adiantamento: ${formatCurrencyBRL(newFreight.valorAdiantamento)}`
      );
    } catch (error) {
      triggerToast('Solicitação não salva', error instanceof Error ? error.message : 'Confira a conexão e tente novamente.');
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  // =========================================================================
  // 3. MODAL / BOTTOM SHEET "REALIZAR PAGAMENTO" (DESKTOP & MOBILE PIX + INTENÇÃO + COMPROVANTE)
  // =========================================================================
  interface InstallmentLocalDraft {
    file: File;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    dataUrl: string;
    fileBase64: string;
    idempotencyKey: string;
    isScheduledProof: boolean;
  }

  const [paymentModalFreight, setPaymentModalFreight] = useState<FreightRecord | null>(null);
  const [paymentStepMode, setPaymentStepMode] = useState<PaymentInstallmentType>('ADIANTAMENTO');
  const [draftByInstallment, setDraftByInstallment] = useState<{
    ADIANTAMENTO: InstallmentLocalDraft | null;
    SALDO: InstallmentLocalDraft | null;
  }>({
    ADIANTAMENTO: null,
    SALDO: null,
  });
  const [txCodeByInstallment, setTxCodeByInstallment] = useState<{
    ADIANTAMENTO: string;
    SALDO: string;
  }>({
    ADIANTAMENTO: '',
    SALDO: '',
  });
  const [uploadStateByInstallment, setUploadStateByInstallment] = useState<{
    ADIANTAMENTO: PaymentReceiptUploadState | 'NENHUM';
    SALDO: PaymentReceiptUploadState | 'NENHUM';
  }>({
    ADIANTAMENTO: 'NENHUM',
    SALDO: 'NENHUM',
  });
  const [uploadErrorByInstallment, setUploadErrorByInstallment] = useState<{
    ADIANTAMENTO: string | null;
    SALDO: string | null;
  }>({
    ADIANTAMENTO: null,
    SALDO: null,
  });

  const [activeIntents, setActiveIntents] = useState<PaymentIntentRecord[]>([]);
  const [isPreparingIntent, setIsPreparingIntent] = useState<boolean>(false);
  const [isConfirmingSettlement, setIsConfirmingSettlement] = useState<boolean>(false);
  const [acknowledgeScheduledProof, setAcknowledgeScheduledProof] = useState<boolean>(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);
  const [shareModalDraft, setShareModalDraft] = useState<SharedReceiptDraft | null>(null);

  const [copiedPixKey, setCopiedPixKey] = useState<boolean>(false);
  const [copiedValue, setCopiedValue] = useState<boolean>(false);
  const [isSavingPayment, setIsSavingPayment] = useState<boolean>(false);
  const [previewMobileSheetOnDesktop, setPreviewMobileSheetOnDesktop] = useState<boolean>(false);
  const receiptInputRef = useRef<HTMLInputElement | null>(null);

  const fetchServerPaymentData = async () => {
    try {
      const res = await fetch('/api/pagamentos/fretes', {
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.activeIntents)) {
        setActiveIntents(data.activeIntents);
      }
      if (Array.isArray(data.freights)) {
        onHydrateFreights?.(data.freights);
        // Keep currently open paymentModalFreight synced with server state
        setPaymentModalFreight((prev) => {
          if (!prev) return null;
          const updated = data.freights.find((f: FreightRecord) => f.id === prev.id);
          return updated || prev;
        });
        // Sync updated freights into parent state
        for (const srvFreight of data.freights as FreightRecord[]) {
          const localMatch = freights.find((lf) => lf.id === srvFreight.id);
          if (
            localMatch &&
            (localMatch.status !== srvFreight.status ||
              localMatch.adiantamentoVerificacaoStatus !== srvFreight.adiantamentoVerificacaoStatus ||
              localMatch.saldoVerificacaoStatus !== srvFreight.saldoVerificacaoStatus ||
              localMatch.adiantamentoPago !== srvFreight.adiantamentoPago ||
              localMatch.saldoPago !== srvFreight.saldoPago ||
              (srvFreight.comprovantesList?.length || 0) !==
                (localMatch.comprovantesList?.length || 0))
          ) {
            onUpdateFreight(srvFreight, '');
          }
        }
      }
    } catch {
      // Offline fallback uses existing state
    }
  };

  useEffect(() => {
    void fetchServerPaymentData();
  }, [currentUser.id]);

  useEffect(() => {
    if (initialSharedDraft) {
      setShareModalDraft(initialSharedDraft);
      setIsShareModalOpen(true);
    }
  }, [initialSharedDraft]);

  const openPaymentModal = (freight: FreightRecord, initialMode: PaymentInstallmentType) => {
    if (!canExecutePayment) {
      triggerToast(
        'Acesso Restrito ao Financeiro / Diretoria',
        'O perfil Operador pode solicitar fretes, confirmar entrega e visualizar comprovantes, mas não realizar pagamentos.'
      );
      return;
    }
    setPaymentModalFreight(freight);
    setPaymentStepMode(initialMode);
    setDraftByInstallment({ ADIANTAMENTO: null, SALDO: null });
    setTxCodeByInstallment({
      ADIANTAMENTO: freight.codigoTransacaoAdiantamento || '',
      SALDO: freight.codigoTransacaoSaldo || '',
    });
    setUploadStateByInstallment({
      ADIANTAMENTO: freight.docs.comprovanteAdiantamento ? 'SALVO_NO_SERVIDOR' : 'NENHUM',
      SALDO: freight.docs.comprovanteSaldo ? 'SALVO_NO_SERVIDOR' : 'NENHUM',
    });
    setUploadErrorByInstallment({ ADIANTAMENTO: null, SALDO: null });
    setAcknowledgeScheduledProof(false);
    setCopiedPixKey(false);
    setCopiedValue(false);
    void fetchServerPaymentData();
  };

  // Requirement 1: Single Installment Selection — switching updates value, copied value, title, linked files, installment ID & summary together
  const handleSelectInstallmentMode = (nextMode: PaymentInstallmentType) => {
    setPaymentStepMode(nextMode);
    setCopiedValue(false);
    setAcknowledgeScheduledProof(false);
  };

  const handleReceiptFileSelected = async (file: File) => {
    if (!paymentModalFreight) return;
    const mode = paymentStepMode;

    if (file.size > 10 * 1024 * 1024) {
      setUploadStateByInstallment((prev) => ({ ...prev, [mode]: 'FALHA_NO_ENVIO' }));
      setUploadErrorByInstallment((prev) => ({
        ...prev,
        [mode]: 'O arquivo excede o tamanho máximo permitido de 10 MB.',
      }));
      return;
    }

    const lower = file.name.toLowerCase();
    const isAllowed =
      file.type === 'application/pdf' ||
      file.type === 'image/jpeg' ||
      file.type === 'image/png' ||
      lower.endsWith('.pdf') ||
      lower.endsWith('.jpg') ||
      lower.endsWith('.jpeg') ||
      lower.endsWith('.png');

    if (!isAllowed) {
      setUploadStateByInstallment((prev) => ({ ...prev, [mode]: 'FALHA_NO_ENVIO' }));
      setUploadErrorByInstallment((prev) => ({
        ...prev,
        [mode]: 'Formato inválido. Selecione apenas arquivos PDF, JPEG ou PNG.',
      }));
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const fileBase64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      const mimeType =
        file.type ||
        (lower.endsWith('.pdf')
          ? 'application/pdf'
          : lower.endsWith('.png')
            ? 'image/png'
            : 'image/jpeg');

      const draftItem: InstallmentLocalDraft = {
        file,
        fileName: file.name,
        mimeType,
        sizeBytes: file.size,
        dataUrl,
        fileBase64,
        idempotencyKey: `idem-${currentUser.id}-${paymentModalFreight.id}-${mode}-${Date.now()}`,
        isScheduledProof: lower.includes('agendamento'),
      };

      setDraftByInstallment((prev) => ({ ...prev, [mode]: draftItem }));
      setUploadErrorByInstallment((prev) => ({ ...prev, [mode]: null }));
      setUploadStateByInstallment((prev) => ({
        ...prev,
        [mode]:
          typeof navigator !== 'undefined' && !navigator.onLine
            ? 'AGUARDANDO_ENVIO_OFFLINE'
            : 'RECEBIDO_NO_CELULAR',
      }));
    } catch {
      setUploadStateByInstallment((prev) => ({ ...prev, [mode]: 'FALHA_NO_ENVIO' }));
      setUploadErrorByInstallment((prev) => ({
        ...prev,
        [mode]: 'Não foi possível ler o arquivo no dispositivo.',
      }));
    }
  };

  // Requirement 2: "Preparar pagamento" before opening the bank app
  const handlePreparePaymentIntent = async () => {
    if (!paymentModalFreight) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setUploadErrorByInstallment((prev) => ({
        ...prev,
        [paymentStepMode]: 'Você está sem conexão. Algumas funções precisam de internet.',
      }));
      return;
    }
    setIsPreparingIntent(true);
    setUploadErrorByInstallment((prev) => ({ ...prev, [paymentStepMode]: null }));
    try {
      // Ensure the freight exists on the server payment store first
      await fetch('/api/pagamentos/fretes', {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ freight: paymentModalFreight }),
      }).catch(() => {});

      const res = await fetch('/api/pagamentos/intencoes', {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          freightId: paymentModalFreight.id,
          installmentType: paymentStepMode,
          validityMinutes: 30,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUploadErrorByInstallment((prev) => ({
          ...prev,
          [paymentStepMode]: data.error || 'Não foi possível preparar a intenção de pagamento no servidor.',
        }));
        return;
      }

      if (data.intent) {
        setActiveIntents((prev) => [
          data.intent,
          ...prev.filter(
            (i) =>
              !(
                i.freightId === paymentModalFreight.id &&
                i.installmentType === paymentStepMode &&
                i.responsibleUserId === currentUser.id
              )
          ),
        ]);
      }

      triggerToast(
        `Pagamento Preparado (${paymentStepMode === 'ADIANTAMENTO' ? 'Adiantamento' : 'Saldo'})`,
        'Faça o pagamento no seu banco. Depois, compartilhe o comprovante com Rodovar Conecta.'
      );
      await fetchServerPaymentData();
    } catch {
      setUploadErrorByInstallment((prev) => ({
        ...prev,
        [paymentStepMode]: 'Erro de conexão ao preparar intenção de pagamento no servidor.',
      }));
    } finally {
      setIsPreparingIntent(false);
    }
  };

  const handleCopyPixKey = async (pixKey: string) => {
    try {
      await navigator.clipboard.writeText(pixKey);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = pixKey;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
    setCopiedPixKey(true);
    setTimeout(() => setCopiedPixKey(false), 3000);
  };

  const handleCopyPaymentValue = async (amount: number) => {
    const formatted = formatCurrencyBRL(amount);
    try {
      await navigator.clipboard.writeText(formatted);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = formatted;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
    setCopiedValue(true);
    setTimeout(() => setCopiedValue(false), 3000);
  };

  // Requirement 5 & 6: "Conferir e salvar" — uploads binary receipt to server and sets state to AGUARDANDO_CONFERENCIA (does NOT auto-mark as Paid!)
  const handleConfirmAndSavePayment = async () => {
    if (!paymentModalFreight) return;
    const mode = paymentStepMode;
    const currentDraft = draftByInstallment[mode];
    const currentTxCode = txCodeByInstallment[mode] || '';
    const matchingIntent = activeIntents.find(
      (i) =>
        i.freightId === paymentModalFreight.id &&
        i.installmentType === mode &&
        i.status === 'AGUARDANDO_COMPROVANTE'
    );

    if (!currentDraft) {
      setUploadErrorByInstallment((prev) => ({
        ...prev,
        [mode]: `Anexe o arquivo PDF ou imagem do ${mode === 'ADIANTAMENTO' ? 'Comprovante de Adiantamento' : 'Comprovante de Saldo'} antes de salvar no servidor.`,
      }));
      return;
    }

    // Offline queue handling (Requirement 5 & 7)
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setUploadStateByInstallment((prev) => ({ ...prev, [mode]: 'AGUARDANDO_ENVIO_OFFLINE' }));
      enqueueOfflinePendingReceipt({
        id: `offline-${Date.now()}`,
        idempotencyKey: currentDraft.idempotencyKey,
        userId: currentUser.id,
        freightId: paymentModalFreight.id,
        freightCode: paymentModalFreight.code,
        installmentType: mode,
        intentId: matchingIntent?.id,
        fileName: currentDraft.fileName,
        mimeType: currentDraft.mimeType,
        sizeBytes: currentDraft.sizeBytes,
        fileBase64: currentDraft.fileBase64,
        origin: 'ANEXACAO_MANUAL',
        transactionCode: currentTxCode.trim() || undefined,
        isScheduledProof: currentDraft.isScheduledProof,
        createdAtIso: new Date().toISOString(),
      });
      triggerToast(
        'Aguardando envio — ainda não salvo no servidor',
        'Dispositivo sem internet. O comprovante foi guardado na fila local para reenvio.'
      );
      return;
    }

    setIsSavingPayment(true);
    setUploadStateByInstallment((prev) => ({ ...prev, [mode]: 'ENVIANDO' }));
    setUploadErrorByInstallment((prev) => ({ ...prev, [mode]: null }));

    try {
      // Ensure freight is registered on server store
      await fetch('/api/pagamentos/fretes', {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ freight: paymentModalFreight }),
      }).catch(() => {});

      const res = await fetch('/api/pagamentos/comprovantes', {
        method: 'POST',
        headers: getAuthHeaders({
          'X-Idempotency-Key': currentDraft.idempotencyKey,
        }),
        credentials: 'include',
        body: JSON.stringify({
          freightId: paymentModalFreight.id,
          installmentType: mode,
          intentId: matchingIntent?.id,
          origin: 'ANEXACAO_MANUAL',
          fileName: currentDraft.fileName,
          fileBase64: currentDraft.fileBase64,
          transactionCode: currentTxCode.trim() || undefined,
          isScheduledProof: currentDraft.isScheduledProof,
          idempotencyKey: currentDraft.idempotencyKey,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUploadStateByInstallment((prev) => ({ ...prev, [mode]: 'FALHA_NO_ENVIO' }));
        setUploadErrorByInstallment((prev) => ({
          ...prev,
          [mode]:
            data.error ||
            'Falha ao enviar o comprovante para o servidor. Toque em Tentar reenviar.',
        }));
        return;
      }

      removeOfflinePendingReceipt(currentDraft.idempotencyKey);
      setUploadStateByInstallment((prev) => ({ ...prev, [mode]: 'SALVO_NO_SERVIDOR' }));
      setDraftByInstallment((prev) => ({ ...prev, [mode]: null }));

      if (data.freight) {
        setPaymentModalFreight(data.freight);
        onUpdateFreight(
          data.freight,
          `Comprovante de ${mode === 'ADIANTAMENTO' ? 'Adiantamento' : 'Saldo'} ("${currentDraft.fileName}") salvo no servidor para o frete ${paymentModalFreight.code}. Situação: Aguardando conferência.`
        );
      }

      triggerToast(
        `Comprovante Salvo no Servidor (${paymentModalFreight.code})`,
        `Arquivo "${currentDraft.fileName}" vinculado à parcela ${mode === 'ADIANTAMENTO' ? 'Adiantamento' : 'Saldo'} em estado "Aguardando conferência".`
      );
      await fetchServerPaymentData();
    } catch {
      setUploadStateByInstallment((prev) => ({ ...prev, [mode]: 'FALHA_NO_ENVIO' }));
      setUploadErrorByInstallment((prev) => ({
        ...prev,
        [mode]: 'Erro de rede ao enviar comprovante. Toque em Tentar reenviar.',
      }));
    } finally {
      setIsSavingPayment(false);
    }
  };

  // Requirement 6 & 7: Explicit Payment Settlement Confirmation by Authorized User (blocked when offline)
  const handleConfirmInstallmentSettlement = async () => {
    if (!paymentModalFreight) return;
    const mode = paymentStepMode;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setUploadErrorByInstallment((prev) => ({
        ...prev,
        [mode]: 'Você está sem conexão. Algumas funções precisam de internet.',
      }));
      return;
    }

    const receiptId =
      mode === 'ADIANTAMENTO'
        ? paymentModalFreight.adiantamentoComprovanteId ||
          paymentModalFreight.docs.comprovanteAdiantamento?.id
        : paymentModalFreight.saldoComprovanteId ||
          paymentModalFreight.docs.comprovanteSaldo?.id;

    if (!receiptId) {
      setUploadErrorByInstallment((prev) => ({
        ...prev,
        [mode]: 'Salve primeiro o comprovante no servidor antes de confirmar a liquidação.',
      }));
      return;
    }

    setIsConfirmingSettlement(true);
    setUploadErrorByInstallment((prev) => ({ ...prev, [mode]: null }));
    try {
      const res = await fetch(`/api/pagamentos/comprovantes/${receiptId}/confirmar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          transactionCode: txCodeByInstallment[mode]?.trim() || undefined,
          acknowledgeScheduledProof,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUploadErrorByInstallment((prev) => ({
          ...prev,
          [mode]: data.error || 'Não foi possível confirmar a liquidação do pagamento.',
        }));
        return;
      }

      if (data.freight) {
        setPaymentModalFreight(data.freight);
        onUpdateFreight(
          data.freight,
          `Liquidação de ${mode === 'ADIANTAMENTO' ? 'Adiantamento' : 'Saldo'} confirmada por ${currentUser.name} no frete ${paymentModalFreight.code}.`
        );
      }

      triggerToast(
        `Pagamento Confirmado (${paymentModalFreight.code})!`,
        `Parcela ${mode === 'ADIANTAMENTO' ? 'Adiantamento' : 'Saldo'} confirmada por ${currentUser.name}.`
      );
      await fetchServerPaymentData();
    } catch {
      setUploadErrorByInstallment((prev) => ({
        ...prev,
        [mode]: 'Erro de conexão ao confirmar a liquidação bancária.',
      }));
    } finally {
      setIsConfirmingSettlement(false);
    }
  };

  // Confirm Cargo Delivery (Operador or Financeiro)
  const handleConfirmDelivery = (freight: FreightRecord) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      triggerToast(
        'Você está sem conexão. Algumas funções precisam de internet.',
        'Restabeleça a conexão com a internet para confirmar a entrega da carga.'
      );
      return;
    }
    const nowStr = new Date().toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const updated: FreightRecord = {
      ...freight,
      entregaConfirmada: true,
      entregaConfirmadaEm: nowStr,
      status: freight.saldoPago ? 'Pago' : 'Pendente Saldo',
    };
    onUpdateFreight(
      updated,
      `Entrega da carga confirmada para o frete ${freight.code} (${freight.cliente}). Saldo de ${formatCurrencyBRL(freight.valorSaldo)} liberado para pagamento.`
    );
    triggerToast(
      `Entrega Confirmada (${freight.code})!`,
      `O saldo de ${formatCurrencyBRL(freight.valorSaldo)} foi liberado para pagamento.`
    );
  };

  // =========================================================================
  // 4. DOCUMENT & RECEIPT PREVIEW MODAL (PDF / IMAGE / OFFICIAL VOUCHER)
  // =========================================================================
  const [previewDocState, setPreviewDocState] = useState<{
    freight: FreightRecord;
    docFile: FreightDocumentFile;
    resolvedDataUrl: string | null;
  } | null>(null);

  const handleOpenHistoricalReceipt = async (freight: FreightRecord, receipt: PaymentReceiptRecord) => {
    try {
      const response = await fetch('/api/pagamentos/comprovantes/' + encodeURIComponent(receipt.id) + '/download', { headers: getAuthHeaders() });
      if (!response.ok) throw new Error('Não foi possível acessar o comprovante autorizado.');
      const blob = await response.blob();
      const dataUrl = await readFileAsDataUrl(new File([blob], receipt.originalFileName, { type: receipt.mimeType }));
      setPreviewDocState({ freight, resolvedDataUrl: dataUrl, docFile: { id:receipt.id, type:receipt.installmentType==='ADIANTAMENTO' ? 'COMPROVANTE_ADIANTAMENTO' : 'COMPROVANTE_SALDO', label:receipt.title, fileName:receipt.originalFileName, mimeType:receipt.mimeType, sizeLabel:receipt.sizeLabel, uploadedAt:receipt.serverCreatedAtFormatted, uploadedBy:receipt.uploadedByUserName, dataUrl } });
    } catch { triggerToast('Não foi possível abrir o comprovante. Confira sua permissão e tente novamente.'); }
  };

  const handleOpenDocPreview = async (freight: FreightRecord, docFile: FreightDocumentFile) => {
    let dataUrl = docFile.dataUrl || await getFileDataFromIndexedDB(docFile.id);
    try {
      if (dataUrl && !dataUrl.startsWith('data:')) {
        const url = new URL(dataUrl, window.location.origin);
        if (url.origin !== window.location.origin) throw new Error('Endereço de documento não autorizado.');
        const response = await fetch(url.href, {headers:getAuthHeaders(),credentials:'include'});
        if (!response.ok) {
          const detail = await response.json().catch(()=>null);
          throw new Error(detail?.code==='BINARY_NOT_FOUND' ? 'Arquivo original indisponível. Solicite ao Financeiro que anexe novamente o comprovante deste registro.' : detail?.error || 'Não foi possível acessar o arquivo.');
        }
        const blob = await response.blob();
        if (!['application/pdf','image/png','image/jpeg','image/webp'].includes(blob.type)) throw new Error('O servidor não retornou um PDF ou imagem válido.');
        dataUrl = await readFileAsDataUrl(new File([blob],docFile.fileName,{type:blob.type}));
      }
      if (!dataUrl) throw new Error('Arquivo original indisponível. Solicite o reenvio do documento.');
    } catch(error) { triggerToast((error as Error).message); return; }

    setPreviewDocState({
      freight,
      docFile,
      resolvedDataUrl: dataUrl,
    });
  };

  const handleDownloadDocument = (freight: FreightRecord, docFile: FreightDocumentFile, resolvedDataUrl: string | null) => {
    if (resolvedDataUrl) {
      const a = document.createElement('a');
      a.href = resolvedDataUrl;
      a.download = docFile.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      triggerToast(`Download concluído: ${docFile.fileName}`);
      return;
    }

    triggerToast('Arquivo original indisponível. Solicite o reenvio do documento.');
  };

  // Current payment amount & synchronized installment metadata in modal (Requirement 1)
  const activeModalAmount = useMemo(() => {
    if (!paymentModalFreight) return 0;
    return paymentStepMode === 'ADIANTAMENTO'
      ? paymentModalFreight.valorAdiantamento
      : paymentModalFreight.valorSaldo;
  }, [paymentModalFreight, paymentStepMode]);

  const activeReceiptTitle = useMemo(() => {
    return paymentStepMode === 'ADIANTAMENTO'
      ? 'Comprovante de Adiantamento'
      : 'Comprovante de Saldo';
  }, [paymentStepMode]);

  const activeInstallmentId = useMemo(() => {
    if (!paymentModalFreight) return '';
    return `${paymentModalFreight.id}:${paymentStepMode}`;
  }, [paymentModalFreight, paymentStepMode]);

  const activeDraftForInstallment = useMemo(() => {
    return draftByInstallment[paymentStepMode];
  }, [draftByInstallment, paymentStepMode]);

  const activeSavedDocForInstallment = useMemo(() => {
    if (!paymentModalFreight) return undefined;
    return paymentStepMode === 'ADIANTAMENTO'
      ? paymentModalFreight.docs.comprovanteAdiantamento
      : paymentModalFreight.docs.comprovanteSaldo;
  }, [paymentModalFreight, paymentStepMode]);

  const activeVerificationStatus = useMemo(() => {
    if (!paymentModalFreight) return 'SEM_COMPROVANTE';
    if (paymentStepMode === 'ADIANTAMENTO') {
      return (
        paymentModalFreight.adiantamentoVerificacaoStatus ||
        (paymentModalFreight.adiantamentoPago ? 'PAGAMENTO_CONFIRMADO' : 'SEM_COMPROVANTE')
      );
    }
    return (
      paymentModalFreight.saldoVerificacaoStatus ||
      (paymentModalFreight.saldoPago ? 'PAGAMENTO_CONFIRMADO' : 'SEM_COMPROVANTE')
    );
  }, [paymentModalFreight, paymentStepMode]);

  const activeIntentForInstallment = useMemo(() => {
    if (!paymentModalFreight) return undefined;
    return activeIntents.find(
      (i) =>
        i.freightId === paymentModalFreight.id &&
        i.installmentType === paymentStepMode &&
        i.status === 'AGUARDANDO_COMPROVANTE'
    );
  }, [activeIntents, paymentModalFreight, paymentStepMode]);

  const activeConfirmationSummary = useMemo(() => {
    if (!paymentModalFreight) return '';
    const parcelaNome = paymentStepMode === 'ADIANTAMENTO' ? 'Adiantamento' : 'Saldo';
    return `Salvar ${activeReceiptTitle} (${formatCurrencyBRL(activeModalAmount)}) na parcela ${parcelaNome} (${activeInstallmentId}) do Frete ${paymentModalFreight.code}`;
  }, [paymentModalFreight, paymentStepMode, activeReceiptTitle, activeModalAmount, activeInstallmentId]);

  return (
    <div className={`rv-finance space-y-4 relative rv-finance-mode-${financialLayout}`}>
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-[90] bg-[#0B0E14] text-white border-2 border-[#FACC15] rounded-2xl px-4 py-3 shadow-2xl flex items-start gap-3 max-w-md animate-in fade-in slide-in-from-bottom-4">
          <div className="w-8 h-8 rounded-xl bg-[#FACC15] text-[#080B0D] flex items-center justify-center shrink-0 mt-0.5">
            <Check className="w-5 h-5 stroke-[2.8]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-extrabold text-[#FACC15]">{toastMsg.title}</p>
            {toastMsg.subtitle && (
              <p className="text-[11px] text-gray-300 mt-0.5 leading-snug">{toastMsg.subtitle}</p>
            )}
          </div>
          <button
            onClick={() => setToastMsg(null)}
            className="text-gray-400 hover:text-white p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* =====================================================================
          1. BANNER ESCURO SUPERIOR (DESKTOP & MOBILE)
      ===================================================================== */}
      <div className="rv-finance-header bg-[#11151C] rounded-2xl px-5 py-4 text-white shadow-md border border-white/5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          {/* Desktop Title */}
          <h1 className="hidden md:block text-[20px] lg:text-[23px] font-black tracking-tight uppercase leading-tight">
            <span className="text-[#FACC15]">FINANCEIRO</span>{' '}
            <span className="text-white">- GESTÃO DE FRETES E PAGAMENTOS</span>
          </h1>
          {/* Mobile Title */}
          <h1 className="block md:hidden text-[18px] font-black tracking-tight uppercase leading-tight">
            <span className="text-[#FACC15]">FINANCEIRO</span>{' '}
            <span className="text-white">- FRETES</span>
          </h1>
          <p className="text-xs md:text-[13.5px] text-gray-300 mt-0.5">
            Acompanhamento de fretes, validação de documentos e liberação de adiantamentos/saldos.
          </p>
        </div>

        {/* Controles de Acesso e Sigilo */}
        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto shrink-0">
          {/* Controle de Sigilo dos Totalizadores do Topo (Exclusivo Função Financeiro) */}
          {isFinanceiroUser ? (
            <button
              type="button"
              onClick={() => {
                setShowMonetaryValues((prev) => !prev);
                triggerToast(
                  !showMonetaryValues ? 'Totais do Topo Visíveis' : 'Totais do Topo Ocultados',
                  !showMonetaryValues
                    ? 'Acesso habilitado para a função Financeiro.'
                    : 'Totalizadores superiores ocultados com segurança.'
                );
              }}
              title={showMonetaryValues ? 'Ocultar totais do topo' : 'Exibir totais do topo (Exclusivo Financeiro)'}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-extrabold transition cursor-pointer flex items-center gap-1.5 border shadow-2xs ${
                showMonetaryValues
                  ? 'bg-[#FACC15] text-[#080B0D] border-[#EAB308]'
                  : 'bg-white/10 text-[#FACC15] border-[#FACC15]/40 hover:bg-white/15'
              }`}
            >
              {showMonetaryValues ? (
                <>
                  <EyeOff className="w-3.5 h-3.5" />
                  <span>Ocultar Topo (R$)</span>
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5" />
                  <span>Exibir Topo (Financeiro)</span>
                </>
              )}
            </button>
          ) : (
            <div
              title="Os indicadores superiores são habilitados exclusivamente para a função Financeiro"
              className="px-2.5 py-1.5 rounded-xl text-[11px] font-semibold bg-white/5 border border-white/10 text-gray-400 flex items-center gap-1.5"
            >
              <EyeOff className="w-3.5 h-3.5 text-gray-400" />
              <span>Topo Exclusivo Financeiro</span>
            </div>
          )}

          {/* Botão Receber Comprovante Compartilhado (/receber-comprovante) & Instalar App PWA */}
          <button
            type="button"
            onClick={() => {
              setShareModalDraft(null);
              setIsShareModalOpen(true);
            }}
            className="px-3 py-1.5 rounded-xl text-[11px] font-black bg-[#FFD400] hover:bg-yellow-400 text-[#080B0D] transition cursor-pointer flex items-center gap-1.5 shadow-xs"
            title="Abrir central de recebimento de comprovantes compartilhados pelo aplicativo do banco (/receber-comprovante)"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Receber Comprovante{activeIntents.length > 0 ? ` (${activeIntents.length})` : ''}</span>
          </button>

          {isInstallable && (
            <button
              type="button"
              onClick={() => void installApp()}
              className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold bg-white/10 hover:bg-white/20 text-[#FFD400] border border-[#FFD400]/40 transition cursor-pointer flex items-center gap-1"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Instalar App</span>
            </button>
          )}

          {/* Status Real da Conta Autenticada */}
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-[11px]">
            <ShieldCheck className="w-3.5 h-3.5 text-[#FACC15] shrink-0" />
            <span className="font-bold text-white">{currentUser.name.split(' ')[0]}</span>
            <span className="text-gray-400">•</span>
            <span className="text-[#FFD400] font-semibold">{currentUser.department}</span>
            {isFinanceiroUser && (
              <span className="ml-1 bg-emerald-500/20 text-emerald-300 font-bold px-1.5 py-0.5 rounded text-[10px]">
                Validado
              </span>
            )}
          </div>
        </div>
      </div>

      {/* =====================================================================
          2. 4 CARDS DE KPI DINÂMICOS (CARROSSEL NO MOBILE / GRID NO DESKTOP)
      ===================================================================== */}
      <div className="rv-finance-kpis flex md:grid md:grid-cols-2 xl:grid-cols-4 gap-3.5 overflow-x-auto snap-x snap-mandatory pb-1 md:pb-0 -mx-1 px-1">
        {/* Card 1: Aguardando Adiantamento (#3B2F0B / #FACC15) */}
        <div className="min-w-[235px] sm:min-w-[250px] md:min-w-0 snap-start bg-[#3B2F0B] border-2 border-[#FACC15]/50 rounded-2xl p-4 shadow-md flex flex-col justify-between shrink-0">
          <div>
            <p className="text-[14px] font-extrabold text-white leading-snug">
              Aguardando Adiantamento
            </p>
            <p className="text-xs font-medium text-gray-200 mt-0.5 tabular-nums">
              {kpis.aguardandoAdiantCount}{' '}
              {kpis.aguardandoAdiantCount === 1 ? 'Solicitação' : 'Solicitações'}
            </p>
          </div>
          <p className="text-[24px] lg:text-[26px] font-black text-[#FACC15] mt-2 tabular-nums tracking-tight">
            {formatProtectedCurrency(kpis.aguardandoAdiantSum)}
          </p>
        </div>

        {/* Card 2: Em Trânsito (Saldos Retidos) (#0F2942 / #38BDF8) */}
        <div className="min-w-[235px] sm:min-w-[250px] md:min-w-0 snap-start bg-[#0F2942] border-2 border-[#38BDF8]/40 rounded-2xl p-4 shadow-md flex flex-col justify-between shrink-0">
          <div>
            <p className="text-[14px] font-extrabold text-white leading-snug">
              Em Trânsito (Saldos Retidos)
            </p>
            <p className="text-xs font-medium text-gray-200 mt-0.5 tabular-nums">
              {kpis.emTransitoCount} {kpis.emTransitoCount === 1 ? 'Frete' : 'Fretes'}
            </p>
          </div>
          <p className="text-[24px] lg:text-[26px] font-black text-[#38BDF8] mt-2 tabular-nums tracking-tight">
            {formatProtectedCurrency(kpis.emTransitoSum)}
          </p>
        </div>

        {/* Card 3: Saldos Liberados (#3B154A / #E879F9) */}
        <div className="min-w-[235px] sm:min-w-[250px] md:min-w-0 snap-start bg-[#3B154A] border-2 border-[#E879F9]/40 rounded-2xl p-4 shadow-md flex flex-col justify-between shrink-0">
          <div>
            <p className="text-[14px] font-extrabold text-white leading-snug">Saldos Liberados</p>
            <p className="text-xs font-medium text-gray-200 mt-0.5 tabular-nums">
              {kpis.saldosLiberadosCount}{' '}
              {kpis.saldosLiberadosCount === 1 ? 'Frete' : 'Fretes'}
            </p>
          </div>
          <p className="text-[24px] lg:text-[26px] font-black text-[#E879F9] mt-2 tabular-nums tracking-tight">
            {formatProtectedCurrency(kpis.saldosLiberadosSum)}
          </p>
        </div>

        {/* Card 4: Pago (Mês Atual) (#0D3B26 / #4ADE80) */}
        <div className="min-w-[235px] sm:min-w-[250px] md:min-w-0 snap-start bg-[#0D3B26] border-2 border-[#4ADE80]/40 rounded-2xl p-4 shadow-md flex flex-col justify-between shrink-0">
          <div>
            <p className="text-[14px] font-extrabold text-white leading-snug">Pago (Mês Atual)</p>
            <p className="text-xs font-medium text-emerald-200/80 mt-0.5">
              Total liquidado no período
            </p>
          </div>
          <p className="text-[24px] lg:text-[26px] font-black text-[#4ADE80] mt-2 tabular-nums tracking-tight">
            {formatProtectedCurrency(kpis.pagoMesSum)}
          </p>
        </div>
      </div>

      {/* =====================================================================
          3. BARRA DE FILTROS E BOTÃO "+ SOLICITAR PAGAMENTO DE FRETE"
      ===================================================================== */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pt-1">
        {/* Abas de Filtro */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0">
          {(
            [
              'Todos',
              'Pendente Adiantamento',
              'Pendente Saldo',
              'Aguardando Entrega',
              'Pagos',
            ] as FilterTab[]
          ).map((tab) => {
            const isActive = activeFilter === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveFilter(tab)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                  isActive
                    ? 'bg-[#11151C] text-white shadow-xs'
                    : 'bg-white text-[#15191D] border border-gray-200 hover:bg-gray-100'
                }`}
              >
                {tab}
              </button>
            );
          })}
        </div>

        {/* Botão Amarelo à Direita */}
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="bg-[#FACC15] hover:bg-[#FFD400] text-[#080B0D] font-extrabold text-xs md:text-[13.5px] px-5 py-2.5 rounded-xl shadow-sm inline-flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4 stroke-[2.8]" />
          <span>Solicitar Pagamento de Frete</span>
        </button>
      </div>

<div className="rv-finance-toolbar"><input aria-label="Pesquisar pagamentos" placeholder="Buscar protocolo, cliente, rota ou motorista..." value={financialSearch} onChange={e=>setFinancialSearch(e.target.value)} /><select aria-label="Filtrar regra de pagamento" value={financialRule} onChange={e=>setFinancialRule(e.target.value)}><option value="all">Todas as regras</option><option value="70">70% / 30%</option><option value="80">80% / 20%</option><option value="100">Integral (100%)</option></select><div className="rv-layout-toggle"><button type="button" aria-pressed={financialLayout==='cards'} onClick={()=>setFinancialLayout('cards')}>▦ Cards</button><button type="button" aria-pressed={financialLayout==='table'} onClick={()=>setFinancialLayout('table')}>☷ Tabela</button></div></div>
      {/* =====================================================================
          4. TABELA DE FRETES (DESKTOP) & CARDS EMPILHADOS (MOBILE)
      ===================================================================== */}
      <div className="bg-white rounded-2xl border border-gray-200/90 shadow-xs overflow-hidden">
        {/* DESKTOP TABLE */}
        <div className="rv-finance-table overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-[13px] font-extrabold text-[#15191D] bg-[#FAFBFD]">
                <th className="py-3.5 px-4">ID / Data</th>
                <th className="py-3.5 px-3">Cliente</th>
                <th className="py-3.5 px-3">Rota</th>
                <th className="py-3.5 px-3">Datas</th>
                <th className="py-3.5 px-3">Docs</th>
                <th className="py-3.5 px-3">Regra</th>
                <th className="py-3.5 px-3">Valores</th>
                <th className="py-3.5 px-4 text-center">Status / Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200/80 text-[13px]">
              {filteredFreights.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-500">
                    <p className="font-bold text-sm text-[#15191D]">
                      Nenhum frete encontrado no filtro "{activeFilter}"
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Clique em "+ Solicitar Pagamento de Frete" para cadastrar uma nova operação.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredFreights.map((frete) => {
                  const isPendingAdiant = frete.status === 'Pendente Adiantamento';
                  const isAdiantPagoOrSaldo =
                    frete.status === 'Adiantamento Pago' || frete.status === 'Pendente Saldo';
                  const isAguardandoEntrega = frete.status === 'Aguardando Entrega';
                  const isPago = frete.status === 'Pago';

                  return (
                    <tr
                      key={frete.id}
                      className="hover:bg-gray-50/70 transition-colors align-middle"
                    >
                      {/* Col 1: ID / Marca / Unidade */}
                      <td className="py-4 px-4 whitespace-nowrap tabular-nums">
                        <div className="flex items-center gap-1.5 mb-1">
                          <CarrierBrandLogo brand={frete.empresaMarca || 'RODOVAR'} size="sm" />
                          <span className="px-1.5 py-0.5 rounded bg-[#11151C] text-[#FACC15] font-black text-[9.5px]">
                            {getUnitShortTag(frete.unidadeOperacional)}
                          </span>
                        </div>
                        <p className="font-extrabold text-[#15191D]">
                          {frete.code} •{' '}
                          <span className="font-semibold text-gray-500 text-xs">
                            {frete.dataCarregamento || frete.createdAtDate}
                          </span>
                        </p>
                      </td>

                      {/* Col 2: Cliente & Motorista */}
                      <td className="py-4 px-3 max-w-[165px]">
                        <p className="font-extrabold text-[#15191D] leading-snug">
                          {frete.cliente}
                        </p>
                        <p className="text-[11px] text-gray-500 font-semibold mt-0.5 truncate">
                          Mot.: {frete.motoristaNome || frete.favorecido}
                        </p>
                      </td>

                      {/* Col 3: Rota */}
                      <td className="py-4 px-3 text-[#15191D] font-medium">
                        <p className="font-bold text-xs">{frete.origem}</p>
                        <p className="text-gray-700 font-extrabold text-xs mt-0.5">
                          ➔ {frete.destino}
                        </p>
                      </td>

                      {/* Col 4: Datas */}
                      <td className="py-4 px-3 text-[#15191D] whitespace-nowrap tabular-nums">
                        <p>Coleta: {frete.dataColeta} |</p>
                        <p className="mt-0.5">Entrega: {frete.dataEntrega}</p>
                      </td>

                      {/* Col 5: Docs (Green Clickable Badges with Icons) */}
                      <td className="py-4 px-3">
                        <div className="flex flex-col items-start gap-1.5">
                          {frete.docs.cte && (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenDocPreview(frete, frete.docs.cte!)}
                                className="bg-[#15803D] hover:bg-[#166534] text-white font-extrabold text-[11px] px-2.5 py-0.5 rounded-md shadow-2xs transition cursor-pointer"
                                title={`Visualizar ${frete.docs.cte.fileName}`}
                              >
                                CT-e
                              </button>
                              <FileText className="w-3.5 h-3.5 text-gray-500" />
                            </div>
                          )}
                          {frete.docs.mdfe && (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenDocPreview(frete, frete.docs.mdfe!)}
                                className="bg-[#15803D] hover:bg-[#166534] text-white font-extrabold text-[11px] px-2.5 py-0.5 rounded-md shadow-2xs transition cursor-pointer"
                                title={`Visualizar ${frete.docs.mdfe.fileName}`}
                              >
                                MDF-e
                              </button>
                              <Paperclip className="w-3.5 h-3.5 text-gray-500" />
                            </div>
                          )}
                          {frete.docs.rpa && (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenDocPreview(frete, frete.docs.rpa!)}
                                className="bg-[#15803D] hover:bg-[#166534] text-white font-extrabold text-[11px] px-2.5 py-0.5 rounded-md shadow-2xs transition cursor-pointer"
                                title={`Visualizar ${frete.docs.rpa.fileName}`}
                              >
                                RPA
                              </button>
                              <Paperclip className="w-3.5 h-3.5 text-gray-500" />
                            </div>
                          )}
                          {frete.docs.comprovanteAdiantamento && (
                            <button
                              type="button"
                              onClick={() =>
                                handleOpenDocPreview(frete, frete.docs.comprovanteAdiantamento!)
                              }
                              className="bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-[10.5px] px-2 py-0.5 rounded-md inline-flex items-center gap-1 shadow-2xs transition cursor-pointer mt-0.5"
                              title="Visualizar Comprovante de Adiantamento"
                            >
                              <span>✅ Comp. Adiant.</span>
                            </button>
                          )}
                          {frete.docs.comprovanteSaldo && (
                            <button
                              type="button"
                              onClick={() =>
                                handleOpenDocPreview(frete, frete.docs.comprovanteSaldo!)
                              }
                              className="bg-emerald-800 hover:bg-emerald-900 text-white font-extrabold text-[10.5px] px-2 py-0.5 rounded-md inline-flex items-center gap-1 shadow-2xs transition cursor-pointer"
                              title="Visualizar Comprovante de Saldo"
                            >
                              <span>✅ Comp. Saldo</span>
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Col 6: Regra */}
                      <td className="py-4 px-3 font-semibold text-[#15191D] whitespace-nowrap">
                        {frete.regraTipo === 'INTEGRAL_100' ? (
                          <div>
                            <p>Integral</p>
                            <p>(100%)</p>
                          </div>
                        ) : (
                          <span>{frete.regraLabel}</span>
                        )}
                      </td>

                      {/* Col 7: Valores (Visíveis na tabela para consulta) */}
                      <td className="py-4 px-3 text-[#15191D] tabular-nums max-w-[210px]">
                        {frete.regraTipo === 'INTEGRAL_100' ? (
                          <p className="font-semibold">
                            Total: {formatCurrencyBRL(frete.valorTotal)}
                          </p>
                        ) : (
                          <div className="space-y-0.5 leading-snug text-xs">
                            <p>
                              <span className="font-medium">Adiantamento:</span>{' '}
                              <span className="font-bold">
                                {formatCurrencyBRL(frete.valorAdiantamento)} (
                                {frete.percentualAdiantamento}%)
                              </span>{' '}
                              /
                            </p>
                            <p>
                              <span className="font-medium">Saldo:</span>{' '}
                              <span className="font-bold">
                                {formatCurrencyBRL(frete.valorSaldo)} ({frete.percentualSaldo}%)
                              </span>
                            </p>
                          </div>
                        )}
                      </td>

                      {/* Col 8: Status / Ações */}
                      <td className="py-4 px-4">
                        <div className="flex flex-col items-center justify-center gap-2">
                          {/* Status Pill */}
                          {isPendingAdiant && (
                            <span className="bg-[#FACC15] text-[#080B0D] font-extrabold text-xs px-3.5 py-1.5 rounded-full inline-flex items-center gap-1.5 shadow-2xs whitespace-nowrap">
                              <Edit2 className="w-3.5 h-3.5 stroke-[2.4]" />
                              <span className="leading-tight text-center">
                                Pendente
                                <br />
                                Adiantamento
                              </span>
                            </span>
                          )}

                          {isAdiantPagoOrSaldo && (
                            <span className="bg-[#1D4ED8] text-white font-extrabold text-xs px-3.5 py-1 rounded-full shadow-2xs whitespace-nowrap">
                              {frete.status === 'Pendente Saldo'
                                ? 'Pendente Saldo'
                                : 'Adiantamento Pago'}
                            </span>
                          )}

                          {isAguardandoEntrega && (
                            <span className="bg-[#0284C7] text-white font-extrabold text-xs px-3.5 py-1 rounded-full shadow-2xs whitespace-nowrap">
                              Aguardando Entrega
                            </span>
                          )}

                          {isPago && (
                            <span className="bg-[#15803D] text-white font-extrabold text-xs px-3.5 py-1 rounded-full inline-flex items-center gap-1 shadow-2xs whitespace-nowrap">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Pago Integralmente</span>
                            </span>
                          )}

                          {/* Action Buttons According to Status & RBAC */}
                          {isPendingAdiant &&
                            (canExecutePayment ? (
                              <button
                                type="button"
                                onClick={() => openPaymentModal(frete, 'ADIANTAMENTO')}
                                className="bg-white hover:bg-gray-100 text-[#15191D] border border-gray-300 font-bold text-xs px-3.5 py-1.5 rounded-lg shadow-2xs transition cursor-pointer whitespace-nowrap"
                              >
                                Realizar Pagamento
                              </button>
                            ) : (
                              <span className="text-[11px] font-semibold text-gray-400 inline-flex items-center gap-1">
                                <Lock className="w-3 h-3" />
                                <span>Aguardando Financeiro</span>
                              </span>
                            ))}

                          {isAguardandoEntrega && (
                            <div className="flex flex-col items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleConfirmDelivery(frete)}
                                className="bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold text-[11px] px-3 py-1 rounded-lg transition cursor-pointer whitespace-nowrap"
                              >
                                Confirmar Entrega
                              </button>
                              {canExecutePayment && (
                                <button
                                  type="button"
                                  onClick={() => openPaymentModal(frete, 'SALDO')}
                                  className="bg-white hover:bg-gray-100 text-[#15191D] border border-gray-300 font-bold text-xs px-3.5 py-1 rounded-lg shadow-2xs transition cursor-pointer whitespace-nowrap"
                                >
                                  Pagar Saldo
                                </button>
                              )}
                            </div>
                          )}

                          {isAdiantPagoOrSaldo &&
                            (canExecutePayment ? (
                              <button
                                type="button"
                                onClick={() => openPaymentModal(frete, 'SALDO')}
                                className="bg-white hover:bg-gray-100 text-[#15191D] border border-gray-300 font-bold text-xs px-5 py-1.5 rounded-lg shadow-2xs transition cursor-pointer whitespace-nowrap"
                              >
                                Pagar Saldo
                              </button>
                            ) : !frete.entregaConfirmada ? (
                              <button
                                type="button"
                                onClick={() => handleConfirmDelivery(frete)}
                                className="bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold text-[11px] px-3 py-1 rounded-lg transition cursor-pointer whitespace-nowrap"
                              >
                                Confirmar Entrega
                              </button>
                            ) : (
                              <span className="text-[11px] font-semibold text-gray-400 inline-flex items-center gap-1">
                                <Lock className="w-3 h-3" />
                                <span>Saldo c/ Financeiro</span>
                              </span>
                            ))}
                          {/* Botão 📄 Ver Detalhes Completos / Ordem de Carregamento PDF */}
                          <button
                            type="button"
                            onClick={() => setSelectedOrderDetails(frete)}
                            className="bg-[#11151C] hover:bg-black text-[#FACC15] font-extrabold text-[11px] px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 shadow-2xs transition cursor-pointer whitespace-nowrap"
                            title="Abrir Detalhes Completos da Ordem de Carregamento"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>📄 Ver Detalhes</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* MOBILE STACKED CARDS (< 768px) */}
        <div className="rv-finance-cards">{filteredFreights.length === 0 && <p className="p-8 text-center text-sm text-gray-500">Nenhum frete corresponde aos filtros selecionados.</p>}
          {filteredFreights.map((frete) => {
            const isPendingAdiant = frete.status === 'Pendente Adiantamento';
            const isAdiantPagoOrSaldo =
              frete.status === 'Adiantamento Pago' || frete.status === 'Pendente Saldo';
            const isAguardandoEntrega = frete.status === 'Aguardando Entrega';
            const isPago = frete.status === 'Pago';

            return (
              <div key={frete.id} className="p-3.5 space-y-2.5 bg-white">
                <div className="flex items-center justify-between gap-2 pb-1 border-b border-gray-100">
                  <div className="flex items-center gap-1.5">
                    <CarrierBrandLogo brand={frete.empresaMarca || 'RODOVAR'} size="sm" />
                    <span className="px-2 py-0.5 rounded bg-[#11151C] text-[#FACC15] font-black text-[10px]">
                      {getUnitShortTag(frete.unidadeOperacional)}
                    </span>
                  </div>
                  <span className="text-[11px] font-black text-gray-500 tabular-nums">
                    {frete.code} • {frete.dataCarregamento || frete.createdAtDate}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-extrabold text-[#15191D]">{frete.cliente}</h3>
                    <p className="text-xs text-[#15191D] font-bold mt-0.5">
                      {frete.origem} ➔ {frete.destino}
                    </p>
                    <p className="text-[11px] text-gray-500 font-semibold mt-0.5">
                      Motorista: {frete.motoristaNome || frete.favorecido}
                    </p>
                  </div>

                  {/* Mobile Status Pill */}
                  {isPendingAdiant && (
                    <span className="bg-[#FACC15] text-[#080B0D] font-extrabold text-[10.5px] px-2.5 py-1 rounded-full shrink-0">
                      Pendente Adiant.
                    </span>
                  )}
                  {isAdiantPagoOrSaldo && (
                    <span className="bg-[#1D4ED8] text-white font-extrabold text-[10.5px] px-2.5 py-1 rounded-full shrink-0">
                      Adiantamento Pago
                    </span>
                  )}
                  {isAguardandoEntrega && (
                    <span className="bg-[#0284C7] text-white font-extrabold text-[10.5px] px-2.5 py-1 rounded-full shrink-0">
                      Aguardando Entrega
                    </span>
                  )}
                  {isPago && (
                    <span className="bg-[#15803D] text-white font-extrabold text-[10.5px] px-2.5 py-1 rounded-full shrink-0">
                      Pago Integral
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-gray-50 rounded-xl p-2.5 border border-gray-100">
                  <div>
                    <p className="text-[11px] text-gray-500">
                      Coleta: {frete.dataColeta} | Entrega: {frete.dataEntrega}
                    </p>
                    <p className="font-bold text-[#15191D] mt-0.5 tabular-nums">
                      Regra {frete.regraLabel}: Total {formatProtectedCurrency(frete.valorTotal)}
                    </p>
                    <p className="text-[11px] text-gray-700 tabular-nums">
                      Adiant.: {formatProtectedCurrency(frete.valorAdiantamento)} • Saldo:{' '}
                      {formatProtectedCurrency(frete.valorSaldo)}
                    </p>
                  </div>
                </div>

                <div className="rv-payment-progress" aria-label="Progresso de pagamento"><progress max={frete.valorTotal || 1} value={Math.min(frete.valorTotal, (frete.adiantamentoPago ? frete.valorAdiantamento : 0) + (frete.saldoPago ? frete.valorSaldo : 0))} /><span>{frete.status}</span></div>
                {/* Docs row */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {frete.docs.cte && (
                    <button
                      type="button"
                      onClick={() => handleOpenDocPreview(frete, frete.docs.cte!)}
                      className="bg-[#15803D] text-white font-extrabold text-[10.5px] px-2.5 py-1 rounded-md inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span>CT-e</span>
                      <FileText className="w-3 h-3" />
                    </button>
                  )}
                  {frete.docs.mdfe && (
                    <button
                      type="button"
                      onClick={() => handleOpenDocPreview(frete, frete.docs.mdfe!)}
                      className="bg-[#15803D] text-white font-extrabold text-[10.5px] px-2.5 py-1 rounded-md inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span>MDF-e</span>
                      <Paperclip className="w-3 h-3" />
                    </button>
                  )}
                  {frete.docs.rpa && (
                    <button
                      type="button"
                      onClick={() => handleOpenDocPreview(frete, frete.docs.rpa!)}
                      className="bg-[#15803D] text-white font-extrabold text-[10.5px] px-2.5 py-1 rounded-md inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span>RPA</span>
                      <Paperclip className="w-3 h-3" />
                    </button>
                  )}
                  {frete.docs.comprovanteAdiantamento && (
                    <button
                      type="button"
                      onClick={() =>
                        handleOpenDocPreview(frete, frete.docs.comprovanteAdiantamento!)
                      }
                      className="bg-emerald-700 text-white font-extrabold text-[10.5px] px-2.5 py-1 rounded-md cursor-pointer"
                    >
                      ✅ Comp. Adiant.
                    </button>
                  )}
                  {frete.docs.comprovanteSaldo && (
                    <button
                      type="button"
                      onClick={() => handleOpenDocPreview(frete, frete.docs.comprovanteSaldo!)}
                      className="bg-emerald-800 text-white font-extrabold text-[10.5px] px-2.5 py-1 rounded-md cursor-pointer"
                    >
                      ✅ Comp. Saldo
                    </button>
                  )}
                </div>

                {/* Mobile Action Buttons */}
                <div className="pt-1 flex items-center gap-2">
                  {isPendingAdiant && canExecutePayment && (
                    <button
                      type="button"
                      onClick={() => openPaymentModal(frete, 'ADIANTAMENTO')}
                      className="w-full bg-[#11151C] hover:bg-black text-[#FACC15] font-extrabold text-xs py-2.5 rounded-xl shadow-xs cursor-pointer"
                    >
                      Realizar Pagamento
                    </button>
                  )}
                  {(isAdiantPagoOrSaldo || isAguardandoEntrega) && !frete.entregaConfirmada && (
                    <button
                      type="button"
                      onClick={() => handleConfirmDelivery(frete)}
                      className="flex-1 bg-amber-100 text-amber-950 border border-amber-300 font-extrabold text-xs py-2 rounded-xl cursor-pointer"
                    >
                      Confirmar Entrega
                    </button>
                  )}
                  {(isAdiantPagoOrSaldo || isAguardandoEntrega) && canExecutePayment && (
                    <button
                      type="button"
                      onClick={() => openPaymentModal(frete, 'SALDO')}
                      className="flex-1 bg-white text-[#15191D] border border-gray-300 font-extrabold text-xs py-2 rounded-xl shadow-2xs cursor-pointer"
                    >
                      Pagar Saldo
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedOrderDetails(frete)}
                    className="flex-1 bg-[#11151C] hover:bg-black text-[#FACC15] font-extrabold text-xs py-2 rounded-xl shadow-2xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>📄 Ver Detalhes</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* =====================================================================
          5. MODAL "+ SOLICITAR PAGAMENTO DE FRETE" (COM CALCULADORA INTELIGENTE)
      ===================================================================== */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 md:p-5 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl border border-gray-200 my-auto">
            {/* Dark Header */}
            <div className="bg-[#11151C] text-white px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-[#FACC15] uppercase tracking-tight">
                  + SOLICITAR PAGAMENTO DE FRETE
                </h2>
                <p className="text-xs text-gray-300 mt-0.5">
                  Cadastre a operação, calcule adiantamento/saldo e anexe CT-e, MDF-e e RPA.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 text-gray-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateFreightSubmit} className="p-5 md:p-6 space-y-5 max-h-[82vh] overflow-y-auto">
              {/* Barra de Preenchimento Rápido por Script de Tráfego */}
              <div className="bg-amber-50/90 border border-[#FACC15] rounded-2xl p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-700 shrink-0" />
                    <div>
                      <p className="text-xs font-black text-[#15191D] uppercase">
                        Preenchimento Rápido por Script de Tráfego
                      </p>
                      <p className="text-[11px] text-gray-600">
                        Cole o script operacional padrão ou carregue um exemplo completo em 1 clique.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setScriptText(SAMPLE_TRAFFIC_SCRIPT);
                        handleApplyPastedScript(SAMPLE_TRAFFIC_SCRIPT);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-gray-100 text-[#15191D] border border-gray-300 font-bold text-[11px] cursor-pointer transition"
                    >
                      Preencher Exemplo
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowScriptPasteBox((prev) => !prev)}
                      className="px-3 py-1.5 rounded-lg bg-[#11151C] hover:bg-black text-[#FACC15] font-extrabold text-[11px] cursor-pointer transition"
                    >
                      {showScriptPasteBox ? 'Fechar Caixa' : 'Colar Script'}
                    </button>
                  </div>
                </div>

                {showScriptPasteBox && (
                  <div className="mt-3 space-y-2 pt-2.5 border-t border-amber-200">
                    <textarea
                      rows={5}
                      value={scriptText}
                      onChange={(e) => setScriptText(e.target.value)}
                      placeholder="Cole aqui o script operacional (Empresa, Data Carregamento, Unidade, Comercial, Expedição, Cliente, Motorista, Emergência, Origem, Destino, Frete Empresa, Frete Motorista, PIX, Banco)..."
                      className="w-full rounded-xl border border-gray-300 bg-white p-2.5 text-xs font-mono text-[#15191D] focus:outline-none focus:border-[#11151C]"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleApplyPastedScript()}
                        className="px-4 py-1.5 rounded-xl bg-[#FACC15] hover:bg-[#FFD400] text-[#080B0D] font-black text-xs cursor-pointer"
                      >
                        Importar Campos do Script
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* A. Identificação, Marca & Dados Operacionais do Frete */}
              <div className="space-y-3.5">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-500">
                  1. Ficha Operacional de Carregamento (Marca, Unidade, Rota e Motorista)
                </h3>

                {/* Seleção de Empresa / Marca com Logos Reais */}
                <div>
                  <label className="block text-xs font-bold text-[#15191D] mb-1.5">
                    Empresa / Marca da Operação *
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {CARRIER_BRANDS.map((brandId) => {
                      const active = empresaMarca === brandId;
                      return (
                        <button
                          key={brandId}
                          type="button"
                          onClick={() => setEmpresaMarca(brandId)}
                          className={`p-2.5 rounded-xl border-2 text-left transition flex flex-col items-start justify-between gap-1.5 cursor-pointer ${
                            active
                              ? 'border-[#11151C] bg-amber-50/60 ring-2 ring-[#FACC15]/50'
                              : 'border-gray-200 bg-white hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-center justify-between w-full">
                            <CarrierBrandLogo brand={brandId} size="sm" />
                            <span
                              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                                active ? 'border-[#11151C] bg-[#FACC15]' : 'border-gray-300'
                              }`}
                            >
                              {active && <span className="w-1.5 h-1.5 rounded-full bg-[#11151C]" />}
                            </span>
                          </div>
                          <span className="text-[11px] font-black text-[#15191D]">
                            {brandId}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[#15191D] mb-1">
                      Unidade Operacional *
                    </label>
                    <select
                      value={unidadeOperacional}
                      onChange={(e) => setUnidadeOperacional(e.target.value as OperationalUnit)}
                      className="w-full border border-gray-300 bg-white rounded-xl px-3 py-2 text-xs font-bold text-[#15191D]"
                    >
                      {OPERATIONAL_UNITS.map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#15191D] mb-1">
                      Data Carregamento *
                    </label>
                    <input
                      type="text"
                      value={dataCarregamento}
                      onChange={(e) => {
                        setDataCarregamento(e.target.value);
                        if (e.target.value.length >= 5) {
                          setDataColeta(e.target.value.slice(0, 5));
                        }
                      }}
                      placeholder="27/10/2026"
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-xs font-semibold text-[#15191D] tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#15191D] mb-1">
                      Previsão Entrega
                    </label>
                    <input
                      type="text"
                      value={dataEntrega}
                      onChange={(e) => setDataEntrega(e.target.value)}
                      placeholder="29/10"
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-xs font-semibold text-[#15191D] tabular-nums"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#15191D] mb-1">
                      Comercial Responsável
                    </label>
                    <input
                      type="text"
                      value={comercialResponsavel}
                      onChange={(e) => setComercialResponsavel(e.target.value)}
                      placeholder="Ex: Jeise / César"
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-xs font-semibold text-[#15191D]"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-[#15191D] mb-1">
                      Expedição Responsável
                    </label>
                    <input
                      type="text"
                      value={expedicaoResponsavel}
                      onChange={(e) => setExpedicaoResponsavel(e.target.value)}
                      placeholder="Ex: Marcos Silva (Expedição)"
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-xs font-semibold text-[#15191D]"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-[#15191D] mb-1">
                      Cliente (Razão Social / Nome Fantasia) *
                    </label>
                    <input
                      type="text"
                      required
                      value={cliente}
                      onChange={(e) => setCliente(e.target.value)}
                      placeholder="Ex: AMBEV S.A. / BAHIA SUL LOG."
                      className="w-full border border-gray-300 rounded-xl px-3.5 py-2 text-xs font-semibold text-[#15191D] focus:outline-none focus:border-[#11151C]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#15191D] mb-1">
                      Telefone do Cliente
                    </label>
                    <input
                      type="text"
                      value={telefoneCliente}
                      onChange={(e) => setTelefoneCliente(e.target.value)}
                      placeholder="(71) 99920-2476"
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-xs font-semibold text-[#15191D] tabular-nums"
                    />
                  </div>

                  <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-[#15191D] mb-1">
                        Origem (Cidade/UF e Local) *
                      </label>
                      <input
                        type="text"
                        required
                        value={origem}
                        onChange={(e) => setOrigem(e.target.value)}
                        placeholder="Ex: SALVADOR-BA - GALPÃO RODOVAR"
                        className="w-full border border-gray-300 rounded-xl px-3.5 py-2 text-xs font-semibold text-[#15191D] focus:outline-none focus:border-[#11151C]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#15191D] mb-1">
                        Destino (Cidade/UF e Local) *
                      </label>
                      <input
                        type="text"
                        required
                        value={destino}
                        onChange={(e) => setDestino(e.target.value)}
                        placeholder="Ex: VITÓRIA DA CONQUISTA-BA"
                        className="w-full border border-gray-300 rounded-xl px-3.5 py-2 text-xs font-semibold text-[#15191D] focus:outline-none focus:border-[#11151C]"
                      />
                    </div>
                  </div>

                  {/* Motorista & Contato de Emergência */}
                  <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 bg-gray-50 p-3 rounded-xl border border-gray-200">
                    <div>
                      <label className="block text-[11px] font-bold text-[#15191D] mb-1">
                        Nome do Motorista
                      </label>
                      <input
                        type="text"
                        value={motoristaNome}
                        onChange={(e) => {
                          setMotoristaNome(e.target.value);
                          if (!favorecido) setFavorecido(e.target.value);
                        }}
                        placeholder="Ex: Carlos Eduardo"
                        className="w-full border border-gray-300 bg-white rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#15191D]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-[#15191D] mb-1">
                        Tel. Motorista (WhatsApp)
                      </label>
                      <input
                        type="text"
                        value={motoristaTelefone}
                        onChange={(e) => setMotoristaTelefone(e.target.value)}
                        placeholder="(71) 99920-2476"
                        className="w-full border border-gray-300 bg-white rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#15191D] tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-[#15191D] mb-1">
                        Contato Emergência
                      </label>
                      <input
                        type="text"
                        value={contatoEmergenciaNome}
                        onChange={(e) => setContatoEmergenciaNome(e.target.value)}
                        placeholder="Ex: Maria (Esposa)"
                        className="w-full border border-gray-300 bg-white rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#15191D]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-[#15191D] mb-1">
                        Tel. Emergência
                      </label>
                      <input
                        type="text"
                        value={contatoEmergenciaTelefone}
                        onChange={(e) => setContatoEmergenciaTelefone(e.target.value)}
                        placeholder="(75) 98811-2233"
                        className="w-full border border-gray-300 bg-white rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#15191D] tabular-nums"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* B. Calculadora Inteligente de Pagamento */}
              <div className="bg-[#FAFBFD] border border-gray-200 rounded-2xl p-4 space-y-3.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#15191D]">
                    2. Calculadora Inteligente de Pagamento
                  </h3>
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full">
                    Cálculo Automático em Tempo Real
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[#15191D] mb-1">
                      Frete Empresa / Cliente (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={freteEmpresaInput}
                      onChange={(e) => setFreteEmpresaInput(e.target.value)}
                      placeholder="8900.00"
                      className="w-full border border-gray-300 bg-white rounded-xl px-3.5 py-2 text-sm font-black text-emerald-800 tabular-nums focus:outline-none focus:border-[#11151C]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#15191D] mb-1">
                      Frete Motorista / Agregado (R$) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      required
                      value={valorTotalInput}
                      onChange={(e) => setValorTotalInput(e.target.value)}
                      placeholder="6000.00"
                      className="w-full border border-gray-300 bg-white rounded-xl px-3.5 py-2 text-sm font-black text-[#15191D] tabular-nums focus:outline-none focus:border-[#11151C]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#15191D] mb-1">
                      Regra de Liberação
                    </label>
                    <select
                      value={regraTipo === 'PERSONALIZADO' && customAdiantPct === 80 && customSaldoPct === 20 ? '80_20' : regraTipo}
                      onChange={(e) => { if (e.target.value === '80_20') { setRegraTipo('PERSONALIZADO'); setCustomAdiantPct(80); setCustomSaldoPct(20); } else { setRegraTipo(e.target.value as FreightRuleType); } }}
                      className="w-full border border-gray-300 bg-white rounded-xl px-3 py-2 text-xs font-bold text-[#15191D] focus:outline-none focus:border-[#11151C]"
                    >
                      <option value="70_30">Padrão (70% Adiantamento / 30% Saldo)</option>
                      <option value="80_20">80% Adiantamento / 20% Saldo</option>
                      <option value="INTEGRAL_100">Pagamento Integral (100%)</option>
                      <option value="PERSONALIZADO">Personalizado (% Editável)</option>
                    </select>
                  </div>
                </div>

                {regraTipo === 'PERSONALIZADO' && (
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-[11px] font-bold text-[#15191D] mb-1">
                        % Adiantamento
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={customAdiantPct}
                        onChange={(e) => handleAdiantPctChange(e.target.value)}
                        className="w-full border border-amber-400 bg-amber-50/40 rounded-xl px-3 py-1.5 text-xs font-extrabold text-[#15191D] tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-[#15191D] mb-1">
                        % Saldo (Ajuste Automático)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={customSaldoPct}
                        onChange={(e) => handleSaldoPctChange(e.target.value)}
                        className="w-full border border-sky-400 bg-sky-50/40 rounded-xl px-3 py-1.5 text-xs font-extrabold text-[#15191D] tabular-nums"
                      />
                    </div>
                  </div>
                )}

                {/* Resultado Calculado */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="bg-[#3B2F0B] text-white rounded-xl p-3 border border-[#FACC15]/40">
                    <p className="text-[11px] font-bold text-gray-200">
                      Adiantamento ({effectiveAdiantPct}%)
                    </p>
                    <p className="text-lg font-black text-[#FACC15] tabular-nums mt-0.5">
                      {formatCurrencyBRL(calculatedAdiantamento)}
                    </p>
                  </div>
                  <div className="bg-[#0F2942] text-white rounded-xl p-3 border border-[#38BDF8]/40">
                    <p className="text-[11px] font-bold text-gray-200">
                      Saldo após Entrega ({effectiveSaldoPct}%)
                    </p>
                    <p className="text-lg font-black text-[#38BDF8] tabular-nums mt-0.5">
                      {formatCurrencyBRL(calculatedSaldo)}
                    </p>
                  </div>
                </div>
              </div>

              {/* C. Dados Bancários e PIX do Motorista/Transportador */}
              <div>
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-500 mb-3">
                  3. Dados Bancários e PIX do Motorista / Transportador
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-[#15191D] mb-1">
                      Nome do Favorecido *
                    </label>
                    <input
                      type="text"
                      required
                      value={favorecido}
                      onChange={(e) => setFavorecido(e.target.value)}
                      placeholder="Ex: João Silva Transportes"
                      className="w-full border border-gray-300 rounded-xl px-3.5 py-2 text-xs font-semibold text-[#15191D]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#15191D] mb-1">
                      Instituição / Banco *
                    </label>
                    <BankCombobox
                      value={banco}
                      onChange={(val) => setBanco(val)}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#15191D] mb-1">Agência</label>
                    <input
                      type="text"
                      value={agencia}
                      onChange={(e) => setAgencia(e.target.value)}
                      placeholder="0001"
                      className="w-full border border-gray-300 rounded-xl px-3.5 py-2 text-xs font-semibold text-[#15191D] tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#15191D] mb-1">Conta</label>
                    <input
                      type="text"
                      value={conta}
                      onChange={(e) => setConta(e.target.value)}
                      placeholder="18670000-5"
                      className="w-full border border-gray-300 rounded-xl px-3.5 py-2 text-xs font-semibold text-[#15191D] tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#15191D] mb-1">
                      Tipo de Chave PIX
                    </label>
                    <select
                      value={tipoChavePix}
                      onChange={(e) =>
                        setTipoChavePix(
                          e.target.value as
                            | 'CPF/CNPJ'
                            | 'Celular'
                            | 'E-mail'
                            | 'Chave Aleatória'
                        )
                      }
                      className="w-full border border-gray-300 bg-white rounded-xl px-3 py-2 text-xs font-bold text-[#15191D]"
                    >
                      <option value="CPF/CNPJ">CPF/CNPJ</option>
                      <option value="Celular">Celular</option>
                      <option value="E-mail">E-mail</option>
                      <option value="Chave Aleatória">Chave Aleatória</option>
                    </select>
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-xs font-bold text-[#15191D] mb-1">
                      Chave PIX *
                    </label>
                    <input
                      type="text"
                      required
                      value={chavePix}
                      onChange={(e) => setChavePix(e.target.value)}
                      placeholder="Ex: 097.813.375-00"
                      className="w-full border border-gray-300 rounded-xl px-3.5 py-2 text-xs font-extrabold text-[#15191D] tabular-nums"
                    />
                  </div>
                </div>
              </div>

              {/* D. Upload Real dos 3 Documentos Obrigatórios */}
              <div>
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-500 mb-2.5">
                  4. Anexar Documentos Fiscais (CT-e, MDF-e e RPA)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* CT-e */}
                  <label className="border-2 border-dashed border-gray-300 hover:border-[#15803D] rounded-xl p-3 flex flex-col items-center justify-center text-center cursor-pointer transition bg-gray-50/60">
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      className="hidden"
                      onChange={(e) => setCteFile(e.target.files?.[0] || null)}
                    />
                    {cteFile ? (
                      <>
                        <CheckCircle2 className="w-6 h-6 text-[#15803D] mb-1" />
                        <span className="text-xs font-extrabold text-[#15803D]">CT-e Anexado ✓</span>
                        <span className="text-[10px] text-gray-600 truncate max-w-full mt-0.5">
                          {cteFile.name}
                        </span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-5 h-5 text-gray-500 mb-1" />
                        <span className="text-xs font-bold text-[#15191D]">Anexar CT-e</span>
                        <span className="text-[10px] text-gray-400">PDF ou Imagem</span>
                      </>
                    )}
                  </label>

                  {/* MDF-e */}
                  <label className="border-2 border-dashed border-gray-300 hover:border-[#15803D] rounded-xl p-3 flex flex-col items-center justify-center text-center cursor-pointer transition bg-gray-50/60">
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      className="hidden"
                      onChange={(e) => setMdfeFile(e.target.files?.[0] || null)}
                    />
                    {mdfeFile ? (
                      <>
                        <CheckCircle2 className="w-6 h-6 text-[#15803D] mb-1" />
                        <span className="text-xs font-extrabold text-[#15803D]">
                          MDF-e Anexado ✓
                        </span>
                        <span className="text-[10px] text-gray-600 truncate max-w-full mt-0.5">
                          {mdfeFile.name}
                        </span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-5 h-5 text-gray-500 mb-1" />
                        <span className="text-xs font-bold text-[#15191D]">Anexar MDF-e</span>
                        <span className="text-[10px] text-gray-400">PDF ou Imagem</span>
                      </>
                    )}
                  </label>

                  {/* RPA */}
                  <label className="border-2 border-dashed border-gray-300 hover:border-[#15803D] rounded-xl p-3 flex flex-col items-center justify-center text-center cursor-pointer transition bg-gray-50/60">
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      className="hidden"
                      onChange={(e) => setRpaFile(e.target.files?.[0] || null)}
                    />
                    {rpaFile ? (
                      <>
                        <CheckCircle2 className="w-6 h-6 text-[#15803D] mb-1" />
                        <span className="text-xs font-extrabold text-[#15803D]">RPA Anexado ✓</span>
                        <span className="text-[10px] text-gray-600 truncate max-w-full mt-0.5">
                          {rpaFile.name}
                        </span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-5 h-5 text-gray-500 mb-1" />
                        <span className="text-xs font-bold text-[#15191D]">Anexar RPA</span>
                        <span className="text-[10px] text-gray-400">PDF ou Imagem</span>
                      </>
                    )}
                  </label>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="bg-[#6B7280] hover:bg-[#4B5563] text-white font-bold text-xs px-5 py-2.5 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCreate}
                  className="bg-[#FACC15] hover:bg-[#FFD400] text-[#080B0D] font-extrabold text-xs px-6 py-2.5 rounded-xl shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingCreate ? 'Salvando Frete...' : 'Salvar e Solicitar Pagamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          6. MODAL / BOTTOM SHEET "REALIZAR PAGAMENTO" (DESKTOP & MOBILE PIX + INTENÇÃO + COMPROVANTE)
      ===================================================================== */}
      {paymentModalFreight && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-end md:items-center justify-center p-0 md:p-4 overflow-y-auto">
          {/* Hidden file input shared by Desktop Dropzone & Mobile Button (accepts PDF, JPEG, PNG up to 10 MB) */}
          <input
            ref={receiptInputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) {
                void handleReceiptFileSelected(file);
              }
            }}
          />

          {/* -----------------------------------------------------------------
              DESKTOP MODAL (IMAGEM 2) — Also supports toggling Mobile Drawer preview
          ----------------------------------------------------------------- */}
          {!previewMobileSheetOnDesktop ? (
            <div className="hidden md:block bg-white rounded-2xl max-w-[780px] w-full overflow-hidden shadow-[0_25px_70px_rgba(0,0,0,0.65)] border border-gray-200 my-auto animate-in fade-in zoom-in-95">
              {/* Cabeçalho Escuro */}
              <div className="bg-[#161920] text-white px-6 py-4 flex items-start justify-between border-b-4 border-[#FFD400]">
                <div>
                  <h2 className="text-[21px] font-black text-[#FACC15] uppercase tracking-tight leading-tight">
                    REALIZAR PAGAMENTO
                  </h2>
                  <p className="text-[20px] font-extrabold text-white leading-tight mt-0.5">
                    {paymentModalFreight.code} - {paymentModalFreight.cliente}
                  </p>
                  <p className="text-xs text-gray-300 mt-1">
                    {paymentModalFreight.origem} ➔ {paymentModalFreight.destino}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewMobileSheetOnDesktop(true)}
                    className="text-[11px] font-bold text-gray-300 hover:text-[#FACC15] bg-white/5 hover:bg-white/10 border border-white/10 px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                    title="Visualizar no formato Drawer Mobile (Imagem 3)"
                  >
                    <Smartphone className="w-3.5 h-3.5 text-[#FACC15]" />
                    <span>Ver Drawer Mobile</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentModalFreight(null)}
                    className="p-1.5 text-gray-400 hover:text-white rounded-lg cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Corpo em 2 Colunas */}
              <div className="p-6 grid grid-cols-12 gap-6">
                {/* Coluna Esquerda (5 cols): Seleção Única da Parcela + Dados PIX + Preparar Pagamento */}
                <div className="col-span-5 space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-extrabold text-[#15191D]">
                        Seleção da Parcela
                      </p>
                      <span className="text-[10px] font-mono font-bold bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                        ID: {activeInstallmentId}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {/* Radio 1: Adiantamento */}
                      <button
                        type="button"
                        onClick={() => handleSelectInstallmentMode('ADIANTAMENTO')}
                        className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2.5 transition cursor-pointer ${
                          paymentStepMode === 'ADIANTAMENTO'
                            ? 'bg-[#161920] text-[#FACC15] shadow-md ring-2 ring-[#FACC15]/40'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        <span
                          className={`w-4 h-4 rounded-full flex items-center justify-center border-2 shrink-0 ${
                            paymentStepMode === 'ADIANTAMENTO'
                              ? 'border-[#FACC15]'
                              : 'border-gray-400'
                          }`}
                        >
                          {paymentStepMode === 'ADIANTAMENTO' && (
                            <span className="w-2 h-2 rounded-full bg-[#FACC15]" />
                          )}
                        </span>
                        <span className="tabular-nums">
                          Adiantamento ({paymentModalFreight.percentualAdiantamento}%) -{' '}
                          {formatCurrencyBRL(paymentModalFreight.valorAdiantamento)}
                        </span>
                      </button>

                      {/* Radio 2: Saldo */}
                      {paymentModalFreight.percentualSaldo > 0 && (
                        <button
                          type="button"
                          onClick={() => handleSelectInstallmentMode('SALDO')}
                          className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2.5 transition cursor-pointer ${
                            paymentStepMode === 'SALDO'
                              ? 'bg-[#161920] text-[#FACC15] shadow-md ring-2 ring-[#FACC15]/40'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          <span
                            className={`w-4 h-4 rounded-full flex items-center justify-center border-2 shrink-0 ${
                              paymentStepMode === 'SALDO' ? 'border-[#FACC15]' : 'border-gray-400'
                            }`}
                          >
                            {paymentStepMode === 'SALDO' && (
                              <span className="w-2 h-2 rounded-full bg-[#FACC15]" />
                            )}
                          </span>
                          <span className="tabular-nums">
                            Saldo ({paymentModalFreight.percentualSaldo}%) -{' '}
                            {formatCurrencyBRL(paymentModalFreight.valorSaldo)}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Dados Bancários / PIX do Motorista/Transportador */}
                  <div className="space-y-1.5 pt-1 text-xs text-[#15191D]">
                    <h4 className="font-extrabold text-[13px] leading-snug text-[#15191D]">
                      Dados Bancários / PIX do Favorecido
                    </h4>
                    <div className="pt-1 space-y-1 text-[12.5px]">
                      <p>
                        <span className="text-gray-600">PIX ({paymentModalFreight.tipoChavePix}):</span>
                        <br />
                        <span className="font-extrabold tabular-nums">
                          {paymentModalFreight.chavePix}
                        </span>
                      </p>
                      <p>
                        <span className="text-gray-600">Banco:</span>{' '}
                        <span className="font-semibold">{paymentModalFreight.banco}</span>
                      </p>
                      <p>
                        <span className="text-gray-600">Agência:</span>{' '}
                        <span className="font-semibold tabular-nums">
                          {paymentModalFreight.agencia}
                        </span>{' '}
                        | <span className="text-gray-600">Conta:</span>{' '}
                        <span className="font-semibold tabular-nums">
                          {paymentModalFreight.conta}
                        </span>
                      </p>
                      <p>
                        <span className="text-gray-600">Favorecido:</span>{' '}
                        <span className="font-semibold">{paymentModalFreight.favorecido}</span>
                      </p>
                    </div>
                  </div>

                  {/* Botões de Ação Rápida PIX & Preparar Pagamento */}
                  <div className="space-y-2 pt-1">
                    <button
                      type="button"
                      disabled={isPreparingIntent}
                      onClick={() => void handlePreparePaymentIntent()}
                      className="w-full py-2.5 px-3 rounded-xl font-black text-xs bg-[#080B0D] hover:bg-slate-800 text-[#FFD400] border border-[#FFD400]/50 flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
                    >
                      {isPreparingIntent ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Clock className="w-4 h-4" />
                      )}
                      <span>Preparar pagamento</span>
                    </button>

                    {activeIntentForInstallment && (
                      <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-[11px] space-y-1">
                        <div className="flex items-center justify-between font-black">
                          <span>Estado: Aguardando comprovante</span>
                          <span>Até {activeIntentForInstallment.expiresAtFormatted}</span>
                        </div>
                        <p className="font-bold leading-snug text-amber-900">
                          Faça o pagamento no seu banco. Depois, compartilhe o comprovante com Rodovar Conecta.
                        </p>
                      </div>
                    )}
                    {uploadErrorByInstallment[paymentStepMode] && (
                      <div className="p-2.5 rounded-xl bg-red-50 border border-red-300 text-red-900 text-xs space-y-1.5">
                        <div className="flex items-start gap-1.5 font-semibold">
                          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                          <span className="break-words">{uploadErrorByInstallment[paymentStepMode]}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handlePreparePaymentIntent()}
                          className="px-2.5 py-1 rounded bg-red-600 hover:bg-red-700 text-white font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Tentar novamente</span>
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => handleCopyPixKey(paymentModalFreight.chavePix)}
                      className={`w-full py-2.5 px-4 rounded-xl font-black text-xs flex items-center justify-center gap-2 shadow-sm transition cursor-pointer ${
                        copiedPixKey
                          ? 'bg-[#16A34A] text-white'
                          : 'bg-[#FACC15] hover:bg-[#FFD400] text-[#080B0D]'
                      }`}
                    >
                      {copiedPixKey ? (
                        <>
                          <Check className="w-4 h-4 stroke-[2.8]" />
                          <span>✅ CHAVE PIX COPIADA!</span>
                        </>
                      ) : (
                        <>
                          <Clipboard className="w-4 h-4 stroke-[2.3]" />
                          <span>COPIAR CHAVE PIX</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCopyPaymentValue(activeModalAmount)}
                      className={`w-full py-2 px-3 rounded-xl font-bold text-xs transition cursor-pointer tabular-nums ${
                        copiedValue
                          ? 'bg-emerald-700 text-white'
                          : 'bg-[#4B5563] hover:bg-[#374151] text-white'
                      }`}
                    >
                      {copiedValue
                        ? `✅ Valor Copiado (${formatCurrencyBRL(activeModalAmount)})`
                        : `Copiar Valor de ${paymentStepMode === 'ADIANTAMENTO' ? 'Adiantamento' : 'Saldo'} (${formatCurrencyBRL(activeModalAmount)})`}
                    </button>
                  </div>
                </div>

                {/* Coluna Direita (7 cols): Comprovação, Estado Real do Envio e Conferência */}
                <div className="col-span-7 space-y-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-extrabold text-[#15191D]">
                        {activeReceiptTitle}
                      </p>
                      <p className="text-[11px] text-gray-500">
                        Parcela selecionada:{' '}
                        <strong>
                          {paymentStepMode === 'ADIANTAMENTO' ? 'Adiantamento' : 'Saldo'} —{' '}
                          {formatCurrencyBRL(activeModalAmount)}
                        </strong>
                      </p>
                    </div>

                    {/* Estado Real do Envio */}
                    <div>
                      {uploadStateByInstallment[paymentStepMode] === 'RECEBIDO_NO_CELULAR' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300">
                          <Smartphone className="w-3.5 h-3.5" /> Recebido no celular
                        </span>
                      )}
                      {uploadStateByInstallment[paymentStepMode] === 'AGUARDANDO_ENVIO_OFFLINE' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-extrabold bg-orange-100 text-orange-900 border border-orange-300">
                          <WifiOff className="w-3.5 h-3.5" /> Aguardando envio — ainda não salvo no servidor
                        </span>
                      )}
                      {uploadStateByInstallment[paymentStepMode] === 'ENVIANDO' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-extrabold bg-blue-100 text-blue-900 border border-blue-300">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Enviando
                        </span>
                      )}
                      {uploadStateByInstallment[paymentStepMode] === 'SALVO_NO_SERVIDOR' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-extrabold bg-emerald-100 text-emerald-900 border border-emerald-300">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Salvo no servidor
                        </span>
                      )}
                      {uploadStateByInstallment[paymentStepMode] === 'FALHA_NO_ENVIO' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-extrabold bg-red-100 text-red-900 border border-red-300">
                          <AlertTriangle className="w-3.5 h-3.5" /> Falha no envio
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Orientação de Pagamento */}
                  <div className="p-2.5 rounded-xl bg-gray-100 border border-gray-200 text-[11px] text-gray-700 leading-snug">
                    <strong>Orientação:</strong> Faça o pagamento no seu banco. Depois, compartilhe o comprovante com Rodovar Conecta ou toque em{' '}
                    <strong>“Anexar PDF ou imagem”</strong> abaixo.
                  </div>

                  {/* Área Drag & Drop / Anexar PDF ou imagem */}
                  <div
                    onClick={() => receiptInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const droppedFile = e.dataTransfer.files?.[0];
                      if (droppedFile) void handleReceiptFileSelected(droppedFile);
                    }}
                    className="border-2 border-dashed border-[#FACC15]/90 hover:border-[#FACC15] bg-[#FAFBFD] hover:bg-amber-50/20 rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition"
                  >
                    <div className="w-10 h-10 rounded-full bg-[#FACC15]/20 text-[#FACC15] flex items-center justify-center mb-1.5">
                      <CloudUpload className="w-6 h-6 fill-[#FACC15] text-[#161920]" />
                    </div>
                    <p className="text-xs font-extrabold text-[#15191D]">
                      Anexar PDF ou imagem ({activeReceiptTitle})
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Aceita PDF, JPEG ou PNG (máx. 10 MB)
                    </p>
                  </div>

                  {/* Pré-visualização do Comprovante (Rascunho Local ou Arquivo Salvo no Servidor) */}
                  {activeDraftForInstallment ? (
                    <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-300 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-9 rounded-lg bg-[#080B0D] text-[#FFD400] font-black text-[10px] flex items-center justify-center shrink-0">
                            {activeDraftForInstallment.mimeType === 'application/pdf' ? 'PDF' : 'IMG'}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-extrabold text-gray-900 truncate">
                              {activeDraftForInstallment.fileName}
                            </p>
                            <p className="text-[10px] text-amber-800 font-semibold">
                              {formatFileSize(activeDraftForInstallment.sizeBytes)} • Recebido no dispositivo — Clique em &ldquo;Conferir e salvar&rdquo;
                            </p>
                          </div>
                        </div>
                      </div>
                      {activeDraftForInstallment.mimeType.startsWith('image/') && (
                        <img
                          src={activeDraftForInstallment.dataUrl}
                          alt="Prévia do comprovante"
                          className="max-h-28 rounded-lg border border-amber-200 mx-auto object-contain"
                        />
                      )}
                    </div>
                  ) : activeSavedDocForInstallment ? (
                    <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-300 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-9 rounded-lg bg-[#15803D] text-white font-black text-[10px] flex items-center justify-center shrink-0">
                          <FileCheck2 className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-extrabold text-gray-900 truncate">
                            {activeSavedDocForInstallment.fileName}
                          </p>
                          <p className="text-[10px] text-emerald-800 font-bold">
                            Salvo no servidor •{' '}
                            {activeVerificationStatus === 'PAGAMENTO_CONFIRMADO'
                              ? 'Pagamento confirmado por usuário autorizado'
                              : 'Comprovante recebido • Aguardando conferência'}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          void handleOpenDocPreview(paymentModalFreight, activeSavedDocForInstallment)
                        }
                        className="px-2.5 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-900 font-bold text-[11px] hover:bg-emerald-100 shrink-0"
                      >
                        Visualizar
                      </button>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-500 flex items-center justify-between">
                      <span>
                        Nenhum arquivo vinculado à parcela{' '}
                        <strong>
                          {paymentStepMode === 'ADIANTAMENTO' ? 'Adiantamento' : 'Saldo'}
                        </strong>
                        .
                      </span>
                      <span className="text-[10px] font-bold uppercase text-gray-400">
                        Sem comprovante
                      </span>
                    </div>
                  )}

                  {/* Erro de Upload se houver */}
                  {uploadErrorByInstallment[paymentStepMode] && (
                    <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-bold flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                      <span>{uploadErrorByInstallment[paymentStepMode]}</span>
                    </div>
                  )}

                  {/* Input de Observações / Código da Transação */}
                  <div>
                    <label className="block text-xs font-bold text-[#15191D] mb-1">
                      Observações / Código da Transação ({paymentStepMode === 'ADIANTAMENTO' ? 'Adiantamento' : 'Saldo'})
                    </label>
                    <input
                      type="text"
                      value={txCodeByInstallment[paymentStepMode]}
                      onChange={(e) =>
                        setTxCodeByInstallment((prev) => ({
                          ...prev,
                          [paymentStepMode]: e.target.value,
                        }))
                      }
                      placeholder="Ex: E2600084220261026PIX - Comprovante Bancário"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-medium text-[#15191D] focus:outline-none focus:border-[#161920]"
                    />
                  </div>

                  {/* Resumo de Confirmação Obrigatório (Requirement 1) */}
                  <div className="p-2.5 rounded-xl bg-slate-900 text-white text-[11px]">
                    <span className="text-slate-400">Resumo de confirmação: </span>
                    <strong className="text-[#FFD400]">{activeConfirmationSummary}</strong>
                  </div>

                  {/* Etapa Separada: Confirmar Liquidação Bancária (Requirement 6) */}
                  {activeSavedDocForInstallment &&
                    activeVerificationStatus !== 'PAGAMENTO_CONFIRMADO' && (
                      <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 space-y-2">
                        <div className="flex items-center justify-between text-xs font-extrabold text-amber-950">
                          <span>Conferência do pagamento pendente</span>
                          <span className="px-2 py-0.5 rounded bg-amber-200 text-amber-900 text-[10px]">
                            Aguardando conferência
                          </span>
                        </div>
                        {canUserConfirmSettlement ? (
                          <button
                            type="button"
                            disabled={isConfirmingSettlement}
                            onClick={() => void handleConfirmInstallmentSettlement()}
                            className="w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            {isConfirmingSettlement ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <UserCheck className="w-4 h-4" />
                            )}
                            <span>
                              Confirmar Liquidação de{' '}
                              {paymentStepMode === 'ADIANTAMENTO' ? 'Adiantamento' : 'Saldo'} (
                              {formatCurrencyBRL(activeModalAmount)})
                            </span>
                          </button>
                        ) : (
                          <p className="text-[11px] text-amber-900">
                            Comprovante salvo no servidor. Aguardando usuário autorizado com
                            permissão de confirmação financeira para liquidar a parcela.
                          </p>
                        )}
                      </div>
                    )}
                </div>
              </div>

              {/* Rodapé do Modal Desktop */}
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShareModalDraft(null);
                    setIsShareModalOpen(true);
                  }}
                  className="text-xs font-extrabold text-[#080B0D] hover:underline flex items-center gap-1.5 cursor-pointer"
                >
                  <Share2 className="w-4 h-4 text-amber-600" />
                  <span>Abrir Recebimento Compartilhado (/receber-comprovante)</span>
                </button>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setPaymentModalFreight(null)}
                    className="bg-[#6E7681] hover:bg-[#57606A] text-white font-bold text-xs px-5 py-2.5 rounded-lg transition cursor-pointer"
                  >
                    Fechar
                  </button>
                  <button
                    type="button"
                    disabled={isSavingPayment || !activeDraftForInstallment}
                    onClick={() => void handleConfirmAndSavePayment()}
                    className="bg-[#FACC15] hover:bg-[#FFD400] text-[#080B0D] font-extrabold text-xs px-6 py-2.5 rounded-lg shadow-sm transition cursor-pointer disabled:opacity-50"
                  >
                    {isSavingPayment
                      ? 'Enviando...'
                      : uploadStateByInstallment[paymentStepMode] === 'FALHA_NO_ENVIO'
                        ? 'Tentar reenviar'
                        : 'Conferir e salvar'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {/* -----------------------------------------------------------------
              MOBILE BOTTOM SHEET / DRAWER (IMAGEM 3 + REQUISITOS 1 A 9)
              Shown automatically on <768px OR when previewMobileSheetOnDesktop is toggled
          ----------------------------------------------------------------- */}
          <div
            className={`${
              previewMobileSheetOnDesktop ? 'block max-w-[420px]' : 'block md:hidden'
            } w-full bg-[#22262C] text-white rounded-t-[28px] md:rounded-[28px] p-5 shadow-2xl border-t border-white/15 space-y-3.5 max-h-[92vh] overflow-y-auto`}
          >
            {/* Drag Handle */}
            <div className="w-12 h-1.5 bg-gray-500/70 rounded-full mx-auto -mt-1 mb-1" />

            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-xl font-black text-white uppercase leading-tight">
                  REALIZAR PAGAMENTO
                </h2>
                <p className="text-lg font-extrabold text-white leading-tight mt-0.5">
                  {paymentModalFreight.code} - {paymentModalFreight.cliente}
                </p>
                <p className="text-xs text-gray-300 mt-1">
                  {paymentModalFreight.origem} ➔ {paymentModalFreight.destino}
                </p>
              </div>
              {previewMobileSheetOnDesktop && (
                <button
                  type="button"
                  onClick={() => setPreviewMobileSheetOnDesktop(false)}
                  className="text-[10px] font-bold bg-white/10 hover:bg-white/20 text-[#FACC15] px-2.5 py-1 rounded-lg cursor-pointer shrink-0"
                >
                  Voltar Desktop
                </button>
              )}
            </div>

            {/* 1. Seleção Única de Parcela: Adiantamento ou Saldo */}
            <div className="bg-[#15181C] rounded-2xl p-3.5 border border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-extrabold text-gray-300 uppercase">
                  Parcela do Pagamento
                </p>
                <span className="text-[10px] font-mono text-[#FACC15] bg-white/5 px-2 py-0.5 rounded">
                  {activeInstallmentId}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => handleSelectInstallmentMode('ADIANTAMENTO')}
                  className={`flex items-center gap-2.5 text-left text-sm font-bold p-2 rounded-xl transition cursor-pointer ${
                    paymentStepMode === 'ADIANTAMENTO'
                      ? 'bg-white/10 text-[#FACC15] border border-[#FACC15]/40'
                      : 'text-gray-300 hover:bg-white/5'
                  }`}
                >
                  <span className="w-5 h-5 rounded-full border-2 border-[#FACC15] flex items-center justify-center shrink-0">
                    {paymentStepMode === 'ADIANTAMENTO' && (
                      <span className="w-2.5 h-2.5 rounded-full bg-[#FACC15]" />
                    )}
                  </span>
                  <span className="tabular-nums">
                    Adiantamento ({paymentModalFreight.percentualAdiantamento}%) -{' '}
                    {formatCurrencyBRL(paymentModalFreight.valorAdiantamento)}
                  </span>
                </button>

                {paymentModalFreight.percentualSaldo > 0 && (
                  <button
                    type="button"
                    onClick={() => handleSelectInstallmentMode('SALDO')}
                    className={`flex items-center gap-2.5 text-left text-sm font-bold p-2 rounded-xl transition cursor-pointer ${
                      paymentStepMode === 'SALDO'
                        ? 'bg-white/10 text-[#FACC15] border border-[#FACC15]/40'
                        : 'text-gray-300 hover:bg-white/5'
                    }`}
                  >
                    <span className="w-5 h-5 rounded-full border-2 border-[#FACC15] flex items-center justify-center shrink-0">
                      {paymentStepMode === 'SALDO' && (
                        <span className="w-2.5 h-2.5 rounded-full bg-[#FACC15]" />
                      )}
                    </span>
                    <span className="tabular-nums">
                      Saldo ({paymentModalFreight.percentualSaldo}%) -{' '}
                      {formatCurrencyBRL(paymentModalFreight.valorSaldo)}
                    </span>
                  </button>
                )}
              </div>
            </div>

            {/* Card Escuro: DADOS DO FAVORECIDO (MOTORISTA) */}
            <div className="bg-[#15181C] rounded-2xl p-3.5 border border-white/10 space-y-1 text-xs">
              <p className="font-extrabold text-gray-200 uppercase tracking-wide text-[11px] mb-1">
                DADOS DO FAVORECIDO (MOTORISTA)
              </p>
              <p className="text-gray-300">
                Nome: <span className="text-white font-bold">{paymentModalFreight.favorecido}</span>
              </p>
              <p className="text-gray-300">
                Banco: <span className="text-white font-bold">{paymentModalFreight.banco}</span>
              </p>
              <p className="text-gray-300">
                Chave {paymentModalFreight.tipoChavePix}:{' '}
                <span className="text-white font-bold tabular-nums">
                  {paymentModalFreight.chavePix}
                </span>
              </p>
            </div>

            {/* Botões PIX 1-Toque Sincronizados com a Parcela Selecionada */}
            <button
              type="button"
              onClick={() => handleCopyPixKey(paymentModalFreight.chavePix)}
              className={`w-full py-3 rounded-full font-black text-sm flex items-center justify-center gap-2 shadow-lg transition cursor-pointer ${
                copiedPixKey
                  ? 'bg-[#16A34A] text-white'
                  : 'bg-[#FACC15] hover:bg-[#FFD400] text-[#080B0D]'
              }`}
            >
              {copiedPixKey ? (
                <>
                  <Check className="w-4 h-4 stroke-[2.8]" />
                  <span>✅ CHAVE PIX COPIADA!</span>
                </>
              ) : (
                <>
                  <Clipboard className="w-4 h-4 stroke-[2.5]" />
                  <span>COPIAR CHAVE PIX</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleCopyPaymentValue(activeModalAmount)}
              className={`w-full py-2.5 rounded-full font-bold text-sm transition cursor-pointer tabular-nums ${
                copiedValue
                  ? 'bg-emerald-700 text-white'
                  : 'bg-[#5A6065] hover:bg-[#686E74] text-white'
              }`}
            >
              {copiedValue
                ? `✅ Valor Copiado (${formatCurrencyBRL(activeModalAmount)})`
                : `Copiar Valor (${formatCurrencyBRL(activeModalAmount)})`}
            </button>

            {/* Requirement 8: Área de Comprovante do Drawer Mobile */}
            <div className="bg-[#15181C] rounded-2xl p-3.5 border border-white/10 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-extrabold uppercase text-[#FACC15]">
                  {activeReceiptTitle}:
                </p>
                <span className="text-xs font-black text-white tabular-nums">
                  {formatCurrencyBRL(activeModalAmount)}
                </span>
              </div>

              {/* 1. Botão "Preparar pagamento" */}
              <button
                type="button"
                disabled={isPreparingIntent}
                onClick={() => void handlePreparePaymentIntent()}
                className="w-full py-2.5 px-4 rounded-full bg-[#080B0D] hover:bg-black text-[#FFD400] border border-[#FFD400]/60 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
              >
                {isPreparingIntent ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Clock className="w-4 h-4" />
                )}
                <span>Preparar pagamento</span>
              </button>

              {/* 2. Orientação de compartilhamento */}
              <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-[11px] text-gray-200 space-y-1">
                {activeIntentForInstallment && (
                  <div className="flex items-center justify-between text-[10px] font-black text-[#FFD400]">
                    <span>● Aguardando comprovante</span>
                    <span>Válido até {activeIntentForInstallment.expiresAtFormatted}</span>
                  </div>
                )}
                <p className="font-semibold leading-snug">
                  Faça o pagamento no seu banco. Depois, compartilhe o comprovante com Rodovar Conecta.
                </p>
              </div>

              {/* 3. Botão "Anexar PDF ou imagem" */}
              <button
                type="button"
                onClick={() => receiptInputRef.current?.click()}
                className="w-full py-2.5 px-4 rounded-full bg-[#5A6065] hover:bg-[#686E74] text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>Anexar PDF ou imagem</span>
              </button>

              {/* 4. Estado real do envio */}
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-gray-400">Estado do comprovante:</span>
                {uploadStateByInstallment[paymentStepMode] === 'RECEBIDO_NO_CELULAR' && (
                  <span className="font-extrabold text-amber-400">Recebido no celular</span>
                )}
                {uploadStateByInstallment[paymentStepMode] === 'AGUARDANDO_ENVIO_OFFLINE' && (
                  <span className="font-extrabold text-orange-400">
                    Aguardando envio — ainda não salvo no servidor
                  </span>
                )}
                {uploadStateByInstallment[paymentStepMode] === 'ENVIANDO' && (
                  <span className="font-extrabold text-blue-400">Enviando...</span>
                )}
                {uploadStateByInstallment[paymentStepMode] === 'SALVO_NO_SERVIDOR' && (
                  <span className="font-extrabold text-emerald-400">Salvo no servidor ✓</span>
                )}
                {uploadStateByInstallment[paymentStepMode] === 'FALHA_NO_ENVIO' && (
                  <span className="font-extrabold text-red-400">Falha no envio</span>
                )}
                {uploadStateByInstallment[paymentStepMode] === 'NENHUM' && (
                  <span className="font-semibold text-gray-400">Aguardando arquivo</span>
                )}
              </div>

              {/* 5. Pré-visualização do comprovante */}
              {activeDraftForInstallment ? (
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-400/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-200 truncate pr-2">
                      {activeDraftForInstallment.fileName} (
                      {formatFileSize(activeDraftForInstallment.sizeBytes)})
                    </span>
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-amber-400 text-black">
                      Rascunho
                    </span>
                  </div>
                  {activeDraftForInstallment.mimeType.startsWith('image/') && (
                    <img
                      src={activeDraftForInstallment.dataUrl}
                      alt="Prévia do comprovante"
                      className="max-h-28 rounded-lg mx-auto object-contain"
                    />
                  )}
                </div>
              ) : activeSavedDocForInstallment ? (
                <div className="flex items-center justify-between pt-0.5 bg-emerald-950/40 p-2.5 rounded-xl border border-emerald-500/30">
                  <div className="min-w-0 pr-2">
                    <span className="text-xs font-bold text-white block truncate">
                      {activeSavedDocForInstallment.fileName}
                    </span>
                    <span className="text-[10px] text-emerald-300 font-semibold">
                      {activeVerificationStatus === 'PAGAMENTO_CONFIRMADO'
                        ? 'Pagamento confirmado por usuário autorizado'
                        : 'Salvo no servidor • Aguardando conferência'}
                    </span>
                  </div>
                  <span className="w-5 h-5 rounded-full bg-[#22C55E] text-[#080B0D] flex items-center justify-center shrink-0">
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </span>
                </div>
              ) : null}

              {uploadErrorByInstallment[paymentStepMode] && (
                <p className="text-[11px] font-bold text-red-400">
                  {uploadErrorByInstallment[paymentStepMode]}
                </p>
              )}

              {/* Texto do Resumo de Confirmação Sincronizado */}
              <div className="p-2 rounded-lg bg-black/40 border border-white/10 text-[11px] text-gray-300">
                Resumo: <strong className="text-[#FFD400]">{activeConfirmationSummary}</strong>
              </div>
            </div>

            {/* 6. Botão "Conferir e salvar" */}
            <button
              type="button"
              disabled={isSavingPayment || !activeDraftForInstallment}
              onClick={() => void handleConfirmAndSavePayment()}
              className="w-full py-3.5 rounded-full bg-[#FACC15] hover:bg-[#FFD400] disabled:opacity-50 text-[#080B0D] font-black text-sm uppercase shadow-lg transition cursor-pointer"
            >
              {isSavingPayment
                ? 'ENVIANDO PARA O SERVIDOR...'
                : uploadStateByInstallment[paymentStepMode] === 'FALHA_NO_ENVIO'
                  ? 'TENTAR REENVIAR'
                  : 'CONFERIR E SALVAR'}
            </button>

            {/* Confirmação de Liquidação Separada (Requirement 6) */}
            {activeSavedDocForInstallment &&
              activeVerificationStatus !== 'PAGAMENTO_CONFIRMADO' &&
              canUserConfirmSettlement && (
                <button
                  type="button"
                  disabled={isConfirmingSettlement}
                  onClick={() => void handleConfirmInstallmentSettlement()}
                  className="w-full py-3 rounded-full bg-emerald-500 hover:bg-emerald-400 text-[#080B0D] font-black text-xs uppercase shadow-md transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {isConfirmingSettlement ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <UserCheck className="w-4 h-4" />
                  )}
                  <span>
                    Confirmar Liquidação ({paymentStepMode === 'ADIANTAMENTO' ? 'Adiantamento' : 'Saldo'})
                  </span>
                </button>
              )}

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => setPaymentModalFreight(null)}
                className="px-7 py-2 rounded-full border border-gray-500 text-white font-bold text-xs hover:bg-white/10 cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          7. VISUALIZADOR DE DOCUMENTOS E COMPROVANTES (PREVIEW MODAL PDF/IMG)
      ===================================================================== */}
      {previewDocState && (
        <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 md:p-6">
          <div className="bg-white rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl border border-gray-200 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="bg-[#11151C] text-white px-5 py-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-[#15803D] text-white font-black text-xs flex items-center justify-center shrink-0">
                  {previewDocState.docFile.label.slice(0, 4).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-black text-[#FACC15] truncate">
                    {previewDocState.docFile.label} — Frete {previewDocState.freight.code} (
                    {previewDocState.freight.cliente})
                  </h3>
                  <p className="text-xs text-gray-300 truncate">
                    {previewDocState.docFile.fileName} • {previewDocState.docFile.sizeLabel} •
                    Enviado em {previewDocState.docFile.uploadedAt}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    handleDownloadDocument(
                      previewDocState.freight,
                      previewDocState.docFile,
                      previewDocState.resolvedDataUrl
                    )
                  }
                  className="bg-[#FACC15] hover:bg-[#FFD400] text-[#080B0D] font-extrabold text-xs px-3.5 py-2 rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Baixar Arquivo</span>
                </button>
                
                <button
                  type="button"
                  onClick={() => setPreviewDocState(null)}
                  className="p-1.5 text-gray-400 hover:text-white rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Body: Real Uploaded File Preview (Image or PDF) OR Authentic RODOVAR Fiscal Document Sheet */}
            <div className="p-5 overflow-y-auto bg-gray-100 flex-1">
              {previewDocState.resolvedDataUrl ? (
                previewDocState.docFile.mimeType.startsWith('image/') ? (
                  <div className="bg-white p-4 rounded-xl shadow-xs border border-gray-200 flex flex-col items-center">
                    <img
                      src={previewDocState.resolvedDataUrl}
                      alt={previewDocState.docFile.fileName}
                      className="max-h-[62vh] w-auto object-contain rounded-lg"
                    />
                  </div>
                ) : (
                  <div className="bg-white rounded-xl overflow-hidden border border-gray-200 h-[62vh]">
                    <iframe
                      src={previewDocState.resolvedDataUrl}
                      title={previewDocState.docFile.fileName}
                      className="w-full h-full border-0"
                    />
                  </div>
                )
              ) : (
                /* Authentic Official RODOVAR Fiscal / PIX Receipt Preview for Seeded & Generated Documents */
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 max-w-2xl mx-auto space-y-5 text-xs text-[#15191D]">
                  <div className="flex items-start justify-between border-b-2 border-[#11151C] pb-4">
                    <div>
                      <span className="inline-block bg-[#11151C] text-[#FACC15] font-black text-[10px] px-2.5 py-1 rounded uppercase tracking-wider">
                        RODOVAR LOGÍSTICA E TRANSPORTE
                      </span>
                      <h4 className="text-lg font-black text-[#15191D] mt-2 uppercase">
                        {previewDocState.docFile.label} ({previewDocState.docFile.fileName})
                      </h4>
                      <p className="text-gray-500">
                        Operação de Frete {previewDocState.freight.code} • Emitido em{' '}
                        {previewDocState.freight.createdAtDate}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 font-extrabold text-[11px] px-3 py-1 rounded-full">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Documento Validado
                      </span>
                      <p className="text-[11px] text-gray-500 mt-1 tabular-nums">
                        Ref: {previewDocState.docFile.id.toUpperCase()}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
                    <div>
                      <p className="text-[10px] font-bold uppercase text-gray-400">
                        Cliente Embarcador
                      </p>
                      <p className="text-sm font-extrabold text-[#15191D]">
                        {previewDocState.freight.cliente}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        Rota: {previewDocState.freight.origem} ➔ {previewDocState.freight.destino}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase text-gray-400">
                        Motorista / Transportador Favorecido
                      </p>
                      <p className="text-sm font-extrabold text-[#15191D]">
                        {previewDocState.freight.favorecido}
                      </p>
                      <p className="text-xs text-gray-600 mt-1 tabular-nums">
                        Banco: {previewDocState.freight.banco} • PIX:{' '}
                        {previewDocState.freight.chavePix}
                      </p>
                    </div>
                  </div>

                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="bg-[#11151C] text-white px-4 py-2 font-extrabold text-xs flex justify-between">
                      <span>Demonstrativo Financeiro do Frete</span>
                      <span>Regra: {previewDocState.freight.regraLabel}</span>
                    </div>
                    <div className="p-4 grid grid-cols-3 gap-3 tabular-nums">
                      <div>
                        <p className="text-gray-500 text-[11px]">Valor Total do Frete</p>
                        <p className="text-base font-black text-[#15191D]">
                          {formatCurrencyBRL(previewDocState.freight.valorTotal)}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-[11px]">
                          Adiantamento ({previewDocState.freight.percentualAdiantamento}%)
                        </p>
                        <p className="text-base font-black text-amber-700">
                          {formatCurrencyBRL(previewDocState.freight.valorAdiantamento)}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-[11px]">
                          Saldo ({previewDocState.freight.percentualSaldo}%)
                        </p>
                        <p className="text-base font-black text-blue-700">
                          {formatCurrencyBRL(previewDocState.freight.valorSaldo)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-gray-500 pt-2 border-t border-gray-200">
                    <span>
                      Responsável pelo envio: <strong>{previewDocState.docFile.uploadedBy}</strong>
                    </span>
                    <span>
                      Status do Frete: <strong>{previewDocState.freight.status}</strong>
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          8. MODAL "DETALHES COMPLETOS DA ORDEM DE CARREGAMENTO" + PDF A4
      ===================================================================== */}
      {selectedOrderDetails && !showFullOrder && <div className="rv-notice-backdrop" onClick={()=>setSelectedOrderDetails(null)}><section className="rv-finance-panel" role="dialog" aria-modal="true" aria-label={'Detalhes do frete '+selectedOrderDetails.code} onClick={e=>e.stopPropagation()}>
        <button className="rv-panel-close" aria-label="Fechar detalhes" onClick={()=>setSelectedOrderDetails(null)}>Fechar ×</button>
        <h2>Frete {selectedOrderDetails.code}</h2><p>{selectedOrderDetails.cliente}</p><p>{selectedOrderDetails.origem} → {selectedOrderDetails.destino}</p>
        <div className="rv-layout-toggle">{['Resumo','Documentos','Histórico','Observações'].map(tab=><button key={tab} aria-pressed={detailTab===tab} onClick={()=>setDetailTab(tab)}>{tab}</button>)}</div>
        {detailTab==='Resumo' && <><div className="rv-detail-amount"><span>Valor do frete</span><strong>{formatProtectedCurrency(selectedOrderDetails.valorTotal)}</strong><span>Regra: {selectedOrderDetails.regraLabel}</span></div><div className="rv-detail-split"><div>Adiantamento<strong>{formatProtectedCurrency(selectedOrderDetails.valorAdiantamento)}</strong><small>{selectedOrderDetails.adiantamentoPago ? 'Confirmado' : 'Pendente'}</small></div><div>Saldo<strong>{formatProtectedCurrency(selectedOrderDetails.valorSaldo)}</strong><small>{selectedOrderDetails.saldoPago ? 'Confirmado' : 'Pendente'}</small></div></div><p>Motorista: {selectedOrderDetails.motoristaNome || selectedOrderDetails.favorecido}</p><p>Status: {selectedOrderDetails.status}</p></>}
        {detailTab==='Documentos' && <div className="rv-detail-docs">{Object.values(selectedOrderDetails.docs).filter(Boolean).map(doc=><button key={doc!.id} onClick={()=>handleOpenDocPreview(selectedOrderDetails,doc!)}><FileText size={18}/>{doc!.label} · {doc!.fileName}<Download size={16}/></button>)}{selectedOrderDetails.comprovantesList?.map(receipt=><button key={receipt.id} onClick={()=>void handleOpenHistoricalReceipt(selectedOrderDetails,receipt)}><FileText size={18}/><span>{receipt.title} · {receipt.originalFileName}<small className="block">{receipt.serverCreatedAtFormatted} · {receipt.verificationStatus}</small></span><Download size={16}/></button>)}{!Object.values(selectedOrderDetails.docs).some(Boolean) && !selectedOrderDetails.comprovantesList?.length && <p>Nenhum documento vinculado.</p>}</div>}
        {detailTab==='Histórico' && <div>{selectedOrderDetails.historicoPagamentos?.length ? selectedOrderDetails.historicoPagamentos.map((entry,index)=><article className="rv-history-entry" key={entry.id || index}><strong>{entry.summary}</strong><p>{entry.timestampFormatted} · {entry.actorName}</p><p>{entry.installmentType === 'ADIANTAMENTO' ? 'Adiantamento' : 'Saldo'}{entry.amountBRL !== undefined ? ' · ' + formatProtectedCurrency(entry.amountBRL) : ''}</p></article>) : <p>Nenhum evento de pagamento registrado.</p>}</div>}
        {detailTab==='Observações' && <p className="whitespace-pre-wrap">{selectedOrderDetails.observacoes || 'Sem observações registradas.'}</p>}
        <div className="rv-detail-actions"><button className="rv-button-dark" onClick={()=>setShowFullOrder(true)}>Ordem completa e impressão</button>{canExecutePayment && !selectedOrderDetails.adiantamentoPago && <button className="rv-button-dark" onClick={()=>openPaymentModal(selectedOrderDetails,'ADIANTAMENTO')}>Abrir pagamento do adiantamento</button>}{canExecutePayment && selectedOrderDetails.adiantamentoPago && !selectedOrderDetails.saldoPago && <button className="rv-button-dark" onClick={()=>openPaymentModal(selectedOrderDetails,'SALDO')}>Abrir pagamento do saldo</button>}</div>
      </section></div>}
      {selectedOrderDetails && showFullOrder && (
        <FreightOrderDetailsModal
          order={{
            id: selectedOrderDetails.id,
            code: selectedOrderDetails.code,
            empresaMarca: selectedOrderDetails.empresaMarca || 'RODOVAR',
            unidadeOperacional: selectedOrderDetails.unidadeOperacional || 'BA - Salvador',
            dataCarregamento:
              selectedOrderDetails.dataCarregamento || selectedOrderDetails.createdAtDate,
            comercialResponsavel:
              selectedOrderDetails.comercialResponsavel || 'Não informado',
            expedicaoResponsavel:
              selectedOrderDetails.expedicaoResponsavel || selectedOrderDetails.solicitanteNome,
            cliente: selectedOrderDetails.cliente,
            telefoneCliente: selectedOrderDetails.telefoneCliente || 'Não informado',
            motoristaNome:
              selectedOrderDetails.motoristaNome || selectedOrderDetails.favorecido,
            motoristaTelefone: selectedOrderDetails.motoristaTelefone || 'Não informado',
            emergenciaNome:
              selectedOrderDetails.emergenciaNome || 'Central Operacional',
            emergenciaTelefone:
              selectedOrderDetails.emergenciaTelefone || 'Não informado',
            origem: selectedOrderDetails.origem,
            destino: selectedOrderDetails.destino,
            stageOrStatus: selectedOrderDetails.status,
            valorFreteEmpresa:
              selectedOrderDetails.valorFreteEmpresa ?? 0,
            valorFreteMotorista:
              selectedOrderDetails.valorFreteMotorista ?? selectedOrderDetails.valorTotal,
            favorecido: selectedOrderDetails.favorecido,
            chavePix: selectedOrderDetails.chavePix,
            tipoChavePix: selectedOrderDetails.tipoChavePix,
            banco: selectedOrderDetails.banco,
            docsOk: [
              ...(selectedOrderDetails.docs.cte ? ['CT-e OK'] : []),
              ...(selectedOrderDetails.docs.mdfe ? ['MDF-e OK'] : []),
              ...(selectedOrderDetails.docs.rpa ? ['RPA OK'] : []),
            ],
          } satisfies FreightOrderDetailViewModel}
          currentUser={currentUser}
          onClose={() => setShowFullOrder(false)}
        />
      )}

      {/* =====================================================================
          9. MODAL DE RECEBIMENTO DE COMPROVANTE COMPARTILHADO (/receber-comprovante)
      ===================================================================== */}
      <ReceberComprovanteModal
        isOpen={isShareModalOpen}
        onClose={() => {
          setIsShareModalOpen(false);
          onClearInitialSharedDraft?.();
        }}
        currentUser={currentUser}
        initialDraft={shareModalDraft}
        freights={freights}
        activeIntents={activeIntents}
        onReceiptSavedOnServer={(updatedFreight, savedRec) => {
          onUpdateFreight(
            updatedFreight,
            `Comprovante ${savedRec.title} (${savedRec.originalFileName}) salvo no servidor para o frete ${updatedFreight.code}.`
          );
          if (paymentModalFreight && paymentModalFreight.id === updatedFreight.id) {
            setPaymentModalFreight(updatedFreight);
          }
        }}
        onRefreshData={fetchServerPaymentData}
      />
    </div>
  );
};

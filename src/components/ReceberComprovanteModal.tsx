import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Info,
  Loader2,
  Lock,
  MapPin,
  RefreshCw,
  Share2,
  ShieldCheck,
  Smartphone,
  Upload,
  UserCheck,
  WifiOff,
  X,
} from 'lucide-react';
import {
  Employee,
  FreightRecord,
  PaymentInstallmentType,
  PaymentIntentRecord,
  PaymentReceiptRecord,
  PaymentReceiptUploadState,
} from '../types';
import { formatCurrencyBRL, formatFileSize, readFileAsDataUrl } from '../lib/freightDatabase';
import { canAccessFinanceiroFreights, canConfirmFreightPayment } from '../lib/permissions';
import {
  SharedReceiptDraft,
  clearSharedReceiptDraft,
  enqueueOfflinePendingReceipt,
  removeOfflinePendingReceipt,
  saveSharedDraftToDevice,
  usePWAInstall,
} from '../lib/pwaShareTarget';

interface ReceberComprovanteModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: Employee;
  initialDraft?: SharedReceiptDraft | null;
  freights: FreightRecord[];
  activeIntents: PaymentIntentRecord[];
  onReceiptSavedOnServer: (updatedFreight: FreightRecord, savedReceipt: PaymentReceiptRecord) => void;
  onRefreshData: () => Promise<void>;
}

export const ReceberComprovanteModal: React.FC<ReceberComprovanteModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  initialDraft,
  freights,
  activeIntents,
  onReceiptSavedOnServer,
  onRefreshData,
}) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, installApp } = usePWAInstall();

  const [draft, setDraft] = useState<SharedReceiptDraft | null>(initialDraft || null);
  const [eligibleIntents, setEligibleIntents] = useState<PaymentIntentRecord[]>(activeIntents);
  const [associationMode, setAssociationMode] = useState<
    'SINGLE_PREFILL' | 'MULTIPLE_CHOOSE' | 'MANUAL_SELECT'
  >('MANUAL_SELECT');

  const [selectedIntentId, setSelectedIntentId] = useState<string>('');
  const [selectedFreightId, setSelectedFreightId] = useState<string>('');
  const [selectedInstallment, setSelectedInstallment] =
    useState<PaymentInstallmentType>('ADIANTAMENTO');

  const [transactionCode, setTransactionCode] = useState('');
  const [observations, setObservations] = useState('');
  const [isScheduledProof, setIsScheduledProof] = useState(false);
  const [acknowledgeScheduled, setAcknowledgeScheduled] = useState(false);

  const [uploadState, setUploadState] = useState<PaymentReceiptUploadState>('RECEBIDO_NO_CELULAR');
  const [idempotencyKey, setIdempotencyKey] = useState<string>(
    () => `idem-${currentUser.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  const [savedReceipt, setSavedReceipt] = useState<PaymentReceiptRecord | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [isConfirmingSettlement, setIsConfirmingSettlement] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const hasFinanceiroAccess = canAccessFinanceiroFreights(currentUser);
  const canConfirmSettlement = canConfirmFreightPayment(currentUser);

  // Sync eligible intents from server for the current authenticated user
  useEffect(() => {
    if (!isOpen || !hasFinanceiroAccess) return;
    let cancelled = false;

    async function fetchUserIntents() {
      try {
        const res = await fetch('/api/pagamentos/intencoes', {
          credentials: 'include',
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;

        const userIntents: PaymentIntentRecord[] = Array.isArray(data.eligibleIntents)
          ? data.eligibleIntents
          : [];
        setEligibleIntents(userIntents);

        if (userIntents.length === 1) {
          setAssociationMode('SINGLE_PREFILL');
          const only = userIntents[0];
          setSelectedIntentId(only.id);
          setSelectedFreightId(only.freightId);
          setSelectedInstallment(only.installmentType);
        } else if (userIntents.length > 1) {
          setAssociationMode('MULTIPLE_CHOOSE');
          // Require explicit user choice when >1 active intents exist
          setSelectedIntentId('');
          setSelectedFreightId('');
        } else {
          setAssociationMode('MANUAL_SELECT');
          if (!selectedFreightId && freights.length > 0) {
            setSelectedFreightId(freights[0].id);
          }
        }
      } catch {
        // Offline fallback
        const localUserIntents = activeIntents.filter(
          (i) => i.responsibleUserId === currentUser.id && i.status === 'AGUARDANDO_COMPROVANTE'
        );
        setEligibleIntents(localUserIntents);
      }
    }

    void fetchUserIntents();
    return () => {
      cancelled = true;
    };
  }, [isOpen, currentUser.id, hasFinanceiroAccess]);

  useEffect(() => {
    if (initialDraft) {
      setDraft(initialDraft);
      setSavedReceipt(null);
      setErrorMessage(initialDraft.errorMessage || null);
      setUploadState(
        typeof navigator !== 'undefined' && !navigator.onLine
          ? 'AGUARDANDO_ENVIO_OFFLINE'
          : 'RECEBIDO_NO_CELULAR'
      );
      setIdempotencyKey(
        `idem-${currentUser.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      );
    }
  }, [initialDraft, currentUser.id]);

  if (!isOpen) return null;

  const selectedFreight = freights.find((f) => f.id === selectedFreightId) || null;
  const activeInstallmentAmountBRL = selectedFreight
    ? selectedInstallment === 'ADIANTAMENTO'
      ? selectedFreight.valorAdiantamento
      : selectedFreight.valorSaldo
    : 0;

  const activeReceiptTitle =
    selectedInstallment === 'ADIANTAMENTO'
      ? 'Comprovante de Adiantamento'
      : 'Comprovante de Saldo';

  const existingInstallmentDoc = selectedFreight
    ? selectedInstallment === 'ADIANTAMENTO'
      ? selectedFreight.docs.comprovanteAdiantamento
      : selectedFreight.docs.comprovanteSaldo
    : undefined;

  const existingInstallmentVerification = selectedFreight
    ? selectedInstallment === 'ADIANTAMENTO'
      ? selectedFreight.adiantamentoVerificacaoStatus ||
        (selectedFreight.adiantamentoPago ? 'PAGAMENTO_CONFIRMADO' : 'SEM_COMPROVANTE')
      : selectedFreight.saldoVerificacaoStatus ||
        (selectedFreight.saldoPago ? 'PAGAMENTO_CONFIRMADO' : 'SEM_COMPROVANTE')
    : 'SEM_COMPROVANTE';

  const handleSelectIntentOption = (intent: PaymentIntentRecord) => {
    setSelectedIntentId(intent.id);
    setSelectedFreightId(intent.freightId);
    setSelectedInstallment(intent.installmentType);
    setErrorMessage(null);
  };

  const handleManualFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage('O arquivo excede o tamanho máximo permitido de 10 MB.');
      return;
    }

    const lower = file.name.toLowerCase();
    const validType =
      file.type === 'application/pdf' ||
      file.type === 'image/jpeg' ||
      file.type === 'image/png' ||
      lower.endsWith('.pdf') ||
      lower.endsWith('.jpg') ||
      lower.endsWith('.jpeg') ||
      lower.endsWith('.png');

    if (!validType) {
      setErrorMessage('Formato não suportado. Selecione um arquivo PDF, JPEG ou PNG.');
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      const newDraft: SharedReceiptDraft = {
        id: `manual-${Date.now()}`,
        createdAtIso: new Date().toISOString(),
        textOnly: false,
        fileName: file.name,
        mimeType:
          file.type ||
          (lower.endsWith('.pdf')
            ? 'application/pdf'
            : lower.endsWith('.png')
              ? 'image/png'
              : 'image/jpeg'),
        sizeBytes: file.size,
        dataUrl,
        fileBase64: base64,
        origin: 'ANEXACAO_MANUAL',
      };
      setDraft(newDraft);
      setSavedReceipt(null);
      setErrorMessage(null);
      setUploadState(
        typeof navigator !== 'undefined' && !navigator.onLine
          ? 'AGUARDANDO_ENVIO_OFFLINE'
          : 'RECEBIDO_NO_CELULAR'
      );
      setIdempotencyKey(
        `idem-${currentUser.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      );
      if (lower.includes('agendamento')) {
        setIsScheduledProof(true);
      }
      await saveSharedDraftToDevice(newDraft);
    } catch {
      setErrorMessage('Não foi possível ler o arquivo selecionado no dispositivo.');
    }
  };

  // Simulate Android Bank Share Target for easy testing in desktop/mobile preview
  const handleSimulateBankShare = async (mode: 'PDF_FILE' | 'TEXT_ONLY') => {
    if (mode === 'TEXT_ONLY') {
      const textDraft: SharedReceiptDraft = {
        id: `simshare-text-${Date.now()}`,
        createdAtIso: new Date().toISOString(),
        textOnly: true,
        sharedTitle: 'Comprovante PIX Banco',
        sharedText: 'Pagamento PIX realizado. Acesse https://banco-exemplo.com.br/recibo/123',
        sharedUrl: 'https://banco-exemplo.com.br/recibo/123',
        origin: 'COMPARTILHAMENTO',
      };
      setDraft(textDraft);
      setSavedReceipt(null);
      setErrorMessage(null);
      await saveSharedDraftToDevice(textDraft);
      return;
    }

    const pdfContent = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >> endobj
trailer << /Root 1 0 R >>
%%EOF`;
    const base64 = window.btoa(pdfContent);
    const dataUrl = `data:application/pdf;base64,${base64}`;
    const fileDraft: SharedReceiptDraft = {
      id: `simshare-pdf-${Date.now()}`,
      createdAtIso: new Date().toISOString(),
      textOnly: false,
      fileName: `Comprovante_PIX_${selectedFreight?.code.replace('#', '') || 'Banco'}_${selectedInstallment}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: pdfContent.length,
      dataUrl,
      fileBase64: base64,
      sharedTitle: 'Comprovante PIX Compartilhado pelo App do Banco',
      origin: 'COMPARTILHAMENTO',
    };
    setDraft(fileDraft);
    setSavedReceipt(null);
    setErrorMessage(null);
    setUploadState('RECEBIDO_NO_CELULAR');
    setIdempotencyKey(
      `idem-${currentUser.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    );
    await saveSharedDraftToDevice(fileDraft);
  };

  const handleSaveReceiptToServer = async () => {
    if (!hasFinanceiroAccess) {
      setErrorMessage('Você não possui permissão para salvar comprovantes no módulo Financeiro.');
      return;
    }
    if (!selectedFreight) {
      setErrorMessage('Selecione o frete correspondente antes de salvar o comprovante.');
      return;
    }
    if (associationMode === 'MULTIPLE_CHOOSE' && !selectedIntentId) {
      setErrorMessage(
        'Você possui mais de uma intenção de pagamento ativa. Selecione a qual intenção/frete este comprovante pertence.'
      );
      return;
    }
    if (!draft || draft.textOnly || !draft.fileBase64) {
      setErrorMessage(
        'Nenhum arquivo PDF, JPEG ou PNG válido foi anexado. Selecione um arquivo antes de salvar.'
      );
      return;
    }

    setErrorMessage(null);
    setStatusNotice(null);

    // Offline handling: Requirement 5 & 7
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setUploadState('AGUARDANDO_ENVIO_OFFLINE');
      enqueueOfflinePendingReceipt({
        id: draft.id,
        idempotencyKey,
        userId: currentUser.id,
        freightId: selectedFreight.id,
        freightCode: selectedFreight.code,
        installmentType: selectedInstallment,
        intentId: selectedIntentId || undefined,
        fileName: draft.fileName || 'comprovante.pdf',
        mimeType: draft.mimeType || 'application/pdf',
        sizeBytes: draft.sizeBytes || 0,
        fileBase64: draft.fileBase64,
        origin: draft.origin || 'COMPARTILHAMENTO',
        transactionCode: transactionCode.trim() || undefined,
        observations: observations.trim() || undefined,
        isScheduledProof,
        createdAtIso: new Date().toISOString(),
      });
      setStatusNotice(
        'Sem conexão no momento. O comprovante foi mantido como "Aguardando envio — ainda não salvo no servidor" e poderá ser enviado assim que a conexão retornar.'
      );
      return;
    }

    setUploadState('ENVIANDO');

    try {
      const res = await fetch('/api/pagamentos/comprovantes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': idempotencyKey,
        },
        credentials: 'include',
        body: JSON.stringify({
          freightId: selectedFreight.id,
          installmentType: selectedInstallment,
          intentId: selectedIntentId || undefined,
          origin: draft.origin || 'COMPARTILHAMENTO',
          fileName: draft.fileName || 'comprovante.pdf',
          fileBase64: draft.fileBase64,
          transactionCode: transactionCode.trim() || undefined,
          observations: observations.trim() || undefined,
          isScheduledProof,
          idempotencyKey,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUploadState('FALHA_NO_ENVIO');
        setErrorMessage(
          data.error ||
            'Falha ao enviar o comprovante para o servidor. Você pode tentar reenviar sem duplicar o registro.'
        );
        return;
      }

      setUploadState('SALVO_NO_SERVIDOR');
      setSavedReceipt(data.receipt);
      removeOfflinePendingReceipt(idempotencyKey);
      await clearSharedReceiptDraft(draft.id);
      setStatusNotice(
        data.message ||
          'Comprovante salvo no servidor! A parcela está registrada como "Aguardando conferência".'
      );

      if (data.freight && data.receipt) {
        onReceiptSavedOnServer(data.freight, data.receipt);
      }
      await onRefreshData();
    } catch {
      setUploadState('FALHA_NO_ENVIO');
      setErrorMessage(
        'Erro de comunicação ao salvar no servidor. Verifique sua conexão e toque em "Tentar reenviar".'
      );
    }
  };

  const handleConfirmPaymentSettlement = async () => {
    if (!savedReceipt) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setErrorMessage(
        'Você está sem conexão. Algumas funções precisam de internet. A confirmação de pagamento exige comunicação ativa com o servidor.'
      );
      return;
    }
    if (!canConfirmSettlement) {
      setErrorMessage(
        'Apenas usuários com permissão de "Confirmar Liquidação de Pagamentos" podem confirmar a baixa definitiva.'
      );
      return;
    }
    if (savedReceipt.isScheduledProof && !acknowledgeScheduled) {
      setErrorMessage(
        'Confirme a caixa de verificação atestando que o agendamento foi efetivamente liquidado no banco.'
      );
      return;
    }

    setIsConfirmingSettlement(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/pagamentos/comprovantes/${savedReceipt.id}/confirmar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          transactionCode: transactionCode.trim() || savedReceipt.transactionCode,
          acknowledgeScheduledProof: acknowledgeScheduled,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMessage(data.error || 'Não foi possível confirmar a liquidação do pagamento.');
        setIsConfirmingSettlement(false);
        return;
      }

      setSavedReceipt(data.receipt);
      setStatusNotice(
        data.message || 'Pagamento conferido e confirmado por usuário autorizado!'
      );
      if (data.freight && data.receipt) {
        onReceiptSavedOnServer(data.freight, data.receipt);
      }
      await onRefreshData();
    } catch {
      setErrorMessage('Erro de conexão ao confirmar liquidação do pagamento.');
    } finally {
      setIsConfirmingSettlement(false);
    }
  };

  const renderUploadStatusBadge = () => {
    switch (uploadState) {
      case 'RECEBIDO_NO_CELULAR':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-extrabold bg-amber-100 text-amber-900 border border-amber-300">
            <Smartphone className="w-3.5 h-3.5 text-amber-700" />
            Recebido no celular (Aguardando confirmação para salvar)
          </span>
        );
      case 'AGUARDANDO_ENVIO_OFFLINE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-extrabold bg-orange-100 text-orange-900 border border-orange-300">
            <WifiOff className="w-3.5 h-3.5 text-orange-700" />
            Aguardando envio — ainda não salvo no servidor
          </span>
        );
      case 'ENVIANDO':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-extrabold bg-blue-100 text-blue-900 border border-blue-300">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-700" />
            Enviando para o servidor...
          </span>
        );
      case 'SALVO_NO_SERVIDOR':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-extrabold bg-emerald-100 text-emerald-900 border border-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
            Salvo no servidor
          </span>
        );
      case 'FALHA_NO_ENVIO':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-extrabold bg-red-100 text-red-900 border border-red-300">
            <AlertTriangle className="w-3.5 h-3.5 text-red-700" />
            Falha no envio (Toque em Tentar reenviar)
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[94vh] flex flex-col">
        {/* Top Header Rodovar Identity: Black & Yellow */}
        <div className="bg-[#080B0D] text-white px-5 py-4 flex items-center justify-between border-b-4 border-[#FFD400] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FFD400] text-[#080B0D] flex items-center justify-center font-black shadow-sm">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-[#FFD400] text-[#080B0D]">
                  RODOVAR CONECTA • MOBILE
                </span>
                <span className="text-[11px] font-semibold text-slate-300">
                  /receber-comprovante
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black tracking-tight mt-0.5">
                Recebimento e Conferência de Comprovante Bancário
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {!hasFinanceiroAccess ? (
            <div className="p-5 rounded-xl bg-red-50 border border-red-200 text-red-900 space-y-2">
              <div className="flex items-center gap-2 font-black text-sm">
                <Lock className="w-5 h-5 text-red-600" />
                Acesso Restrito ao Setor Financeiro
              </div>
              <p className="text-xs leading-relaxed">
                Sua conta (<strong>{currentUser.name}</strong>) não possui a permissão{' '}
                <code>financeiro</code> para associar ou enviar comprovantes de pagamento de fretes.
                Solicite liberação ao Administrador.
              </p>
            </div>
          ) : (
            <>
              {/* Compatibility & PWA Install / iOS Disclosure Bar (Requirement 9) */}
              <div className="p-3.5 rounded-xl bg-slate-900 text-white border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs font-extrabold text-[#FFD400]">
                    <Smartphone className="w-4 h-4" />
                    {isAndroid
                      ? 'Android Compatível: Compartilhamento Direto do Banco (Web Share Target)'
                      : isIOS
                        ? 'iPhone (iOS): Anexação Rápida via Arquivos ou Fotos'
                        : 'Recebimento via Compartilhamento Android (PWA) ou Anexação Manual'}
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    {isIOS
                      ? 'Nota técnica transparente: no iOS/iPhone, aplicativos web instalados (PWA) não são registrados no menu nativo Compartilhar do sistema sem um app nativo com Share Extension. Utilize o botão "Anexar PDF ou imagem" (Arquivos/Fotos) abaixo.'
                      : 'No Android com o app Rodovar Conecta instalado, compartilhe o PDF ou imagem do comprovante direto do aplicativo do banco e escolha "Rodovar Conecta".'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isInstallable && (
                    <button
                      type="button"
                      onClick={() => void installApp()}
                      className="px-3 py-2 rounded-lg bg-[#FFD400] text-[#080B0D] font-black text-xs hover:bg-yellow-400 transition-colors whitespace-nowrap"
                    >
                      Instalar App Rodovar
                    </button>
                  )}
                  {!draft && (
                    <button
                      type="button"
                      onClick={() => void handleSimulateBankShare('PDF_FILE')}
                      className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-[11px] border border-white/15 transition-colors whitespace-nowrap"
                      title="Simular recebimento de PDF compartilhado pelo banco via Web Share Target"
                    >
                      Simular Compartilhamento do Banco
                    </button>
                  )}
                </div>
              </div>

              {/* Requirement 3: Warning if Bank shared ONLY text or external URL link */}
              {draft?.textOnly && (
                <div className="p-4 rounded-xl bg-amber-50 border-2 border-amber-400 text-amber-950 space-y-2.5">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="text-xs font-black uppercase tracking-wide text-amber-900">
                        Arquivo não recebido — O banco compartilhou apenas texto ou link
                      </h4>
                      <p className="text-xs leading-relaxed text-amber-900">
                        O aplicativo do banco enviou apenas texto ou link externo, sem o arquivo
                        PDF ou imagem do comprovante. Por segurança, o Rodovar Conecta{' '}
                        <strong>não baixa links externos automaticamente</strong>. Salve o PDF ou
                        imagem no celular e toque em <strong>“Anexar PDF ou imagem”</strong> abaixo.
                      </p>
                      {(draft.sharedText || draft.sharedUrl) && (
                        <div className="mt-2 p-2 rounded bg-white/80 border border-amber-200 text-[11px] font-mono text-slate-700 break-all">
                          Texto recebido: {draft.sharedText || draft.sharedUrl}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Requirement 4: Association with Eligible Intents (1, >1, or 0) */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-amber-600" />
                    1. Associação Segura ao Frete e Parcela
                  </span>
                  {associationMode === 'SINGLE_PREFILL' && (
                    <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-900 border border-emerald-300">
                      1 Intenção Ativa Encontrada (Pré-preenchida)
                    </span>
                  )}
                  {associationMode === 'MULTIPLE_CHOOSE' && (
                    <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300">
                      {eligibleIntents.length} Intenções Ativas — Escolha o Frete
                    </span>
                  )}
                  {associationMode === 'MANUAL_SELECT' && (
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-slate-200 text-slate-700">
                      0 Intenções Ativas — Seleção Manual Autorizada
                    </span>
                  )}
                </div>

                {associationMode === 'MULTIPLE_CHOOSE' && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-amber-900 bg-amber-50/80 p-2.5 rounded-lg border border-amber-200">
                      Você possui mais de um pagamento preparado aguardando comprovante. Escolha
                      abaixo a qual frete e parcela este comprovante pertence:
                    </p>
                    <div className="grid grid-cols-1 gap-2">
                      {eligibleIntents.map((intent) => {
                        const isPicked = selectedIntentId === intent.id;
                        return (
                          <button
                            key={intent.id}
                            type="button"
                            onClick={() => handleSelectIntentOption(intent)}
                            className={`text-left p-3 rounded-xl border-2 transition-all flex items-center justify-between gap-3 ${
                              isPicked
                                ? 'border-[#080B0D] bg-[#FFD400]/15 shadow-sm'
                                : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-black text-sm text-slate-900">
                                  Frete {intent.freightCode}
                                </span>
                                <span className="text-[11px] font-black px-2 py-0.5 rounded bg-[#080B0D] text-[#FFD400]">
                                  {intent.installmentType === 'ADIANTAMENTO'
                                    ? 'Adiantamento'
                                    : 'Saldo'}
                                </span>
                              </div>
                              <p className="text-xs text-slate-600 mt-0.5">
                                Favorecido: <strong>{intent.favorecido}</strong> • Válida até{' '}
                                {intent.expiresAtFormatted}
                              </p>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-black text-slate-900">
                                {formatCurrencyBRL(intent.expectedAmountBRL)}
                              </div>
                              <span className="text-[10px] font-bold text-slate-500">
                                {isPicked ? 'Selecionado ✓' : 'Selecionar'}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Freight Selector */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                      Frete Autorizado
                    </label>
                    <select
                      value={selectedFreightId}
                      onChange={(e) => {
                        setSelectedFreightId(e.target.value);
                        setSelectedIntentId('');
                      }}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#FFD400]"
                    >
                      <option value="">Selecione o frete...</option>
                      {freights.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.code} — {f.cliente} ({f.favorecido})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Single Installment Selection (Requirement 1) */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                      Seleção Única da Parcela
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {(['ADIANTAMENTO', 'SALDO'] as PaymentInstallmentType[]).map((inst) => {
                        const isSelected = selectedInstallment === inst;
                        const instValue = selectedFreight
                          ? inst === 'ADIANTAMENTO'
                            ? selectedFreight.valorAdiantamento
                            : selectedFreight.valorSaldo
                          : 0;
                        return (
                          <button
                            key={inst}
                            type="button"
                            onClick={() => setSelectedInstallment(inst)}
                            className={`px-3 py-2 rounded-xl border-2 text-left transition-all ${
                              isSelected
                                ? 'border-[#080B0D] bg-[#080B0D] text-white shadow-sm'
                                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-black uppercase">
                                {inst === 'ADIANTAMENTO' ? 'Adiantamento' : 'Saldo'}
                              </span>
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  isSelected ? 'bg-[#FFD400]' : 'bg-slate-300'
                                }`}
                              />
                            </div>
                            <div
                              className={`text-xs font-black mt-0.5 ${
                                isSelected ? 'text-[#FFD400]' : 'text-slate-900'
                              }`}
                            >
                              {formatCurrencyBRL(instValue)}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Summary of Freight, Route, Favorecido, Installment & Value before confirmation */}
                {selectedFreight && (
                  <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <div>
                        <span className="text-xs font-black text-slate-900">
                          Frete {selectedFreight.code} • {selectedFreight.cliente}
                        </span>
                        <div className="text-[11px] text-slate-600 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">
                            {selectedFreight.origem} → {selectedFreight.destino}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">
                          Valor da Parcela ({selectedInstallment === 'ADIANTAMENTO' ? 'Adiantamento' : 'Saldo'})
                        </span>
                        <span className="text-base font-black text-slate-900">
                          {formatCurrencyBRL(activeInstallmentAmountBRL)}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>
                          Favorecido: <strong>{selectedFreight.favorecido}</strong>
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>
                          Título a salvar: <strong>{activeReceiptTitle}</strong>
                        </span>
                      </div>
                    </div>

                    {existingInstallmentDoc && (
                      <div className="pt-1 flex items-center justify-between text-[11px] text-slate-600 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200">
                        <span>
                          Arquivo atualmente vinculado a esta parcela:{' '}
                          <strong>{existingInstallmentDoc.fileName}</strong> (
                          {existingInstallmentVerification === 'PAGAMENTO_CONFIRMADO'
                            ? 'Pagamento Confirmado'
                            : 'Aguardando Conferência'}
                          )
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 2. File Attachment & Preview Section */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                    2. Arquivo do Comprovante ({activeReceiptTitle})
                  </span>
                  {draft && !draft.textOnly && renderUploadStatusBadge()}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
                  onChange={(e) => void handleManualFilePick(e)}
                  className="hidden"
                />

                {!draft || draft.textOnly ? (
                  <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center bg-white space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-[#FFD400]/20 text-[#080B0D] flex items-center justify-center mx-auto">
                      <Upload className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-extrabold text-slate-900">
                        Anexe o comprovante bancário em PDF, JPEG ou PNG (máx. 10 MB)
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Compatível com compartilhamento direto no Android ou seleção manual em
                        Arquivos/Fotos no iPhone e Computador.
                      </p>
                    </div>
                    <div className="flex items-center justify-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-4 py-2.5 rounded-xl bg-[#080B0D] text-[#FFD400] font-black text-xs hover:bg-slate-800 transition-colors inline-flex items-center gap-2"
                      >
                        <Upload className="w-4 h-4" />
                        Anexar PDF ou imagem
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-slate-200 p-3.5 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-slate-900 text-[#FFD400] flex items-center justify-center shrink-0 font-black text-xs">
                          {draft.mimeType === 'application/pdf' ? 'PDF' : 'IMG'}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-black text-slate-900 truncate">
                            {draft.fileName}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {formatFileSize(draft.sizeBytes || 0)} • Origem:{' '}
                            <strong>
                              {draft.origin === 'COMPARTILHAMENTO'
                                ? 'Compartilhado pelo App do Banco'
                                : 'Anexação Manual'}
                            </strong>
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-bold shrink-0"
                      >
                        Trocar arquivo
                      </button>
                    </div>

                    {/* Visual Preview of Image or PDF */}
                    {draft.dataUrl && (
                      <div className="rounded-lg overflow-hidden border border-slate-200 bg-slate-100 max-h-52 flex items-center justify-center">
                        {draft.mimeType?.startsWith('image/') ? (
                          <img
                            src={draft.dataUrl}
                            alt="Pré-visualização do comprovante"
                            className="max-h-48 w-auto object-contain"
                          />
                        ) : (
                          <div className="p-4 text-center space-y-1.5">
                            <FileText className="w-8 h-8 text-slate-700 mx-auto" />
                            <p className="text-xs font-bold text-slate-800">
                              Documento PDF pronto para envio ({draft.fileName})
                            </p>
                            <p className="text-[11px] text-slate-500">
                              Cabeçalho binário PDF validado • Pronto para vinculação à parcela{' '}
                              {selectedInstallment === 'ADIANTAMENTO' ? 'Adiantamento' : 'Saldo'}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Optional Transaction Code & Scheduled Proof Check */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          ID / Autenticação Bancária (Opcional)
                        </label>
                        <input
                          type="text"
                          value={transactionCode}
                          onChange={(e) => setTransactionCode(e.target.value)}
                          placeholder="Ex: E2600091820261028PIX"
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          Observação da Conferência (Opcional)
                        </label>
                        <input
                          type="text"
                          value={observations}
                          onChange={(e) => setObservations(e.target.value)}
                          placeholder="Ex: PIX enviado via conta matriz"
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
                        />
                      </div>
                    </div>

                    <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={isScheduledProof}
                        onChange={(e) => setIsScheduledProof(e.target.checked)}
                        className="rounded border-slate-300"
                      />
                      <span>
                        Este arquivo é um <strong>comprovante de agendamento</strong> (exige
                        conferência posterior da compensação bancária)
                      </span>
                    </label>
                  </div>
                )}
              </div>

              {/* Error or Status Alerts */}
              {errorMessage && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs font-bold flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {statusNotice && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 text-xs font-bold flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p>{statusNotice}</p>
                    {savedReceipt?.isDuplicateHashWarning && (
                      <p className="text-amber-800 bg-amber-100 px-2 py-1 rounded border border-amber-300">
                        Aviso de Auditoria: Este arquivo possui o mesmo hash criptográfico de outro
                        comprovante ({savedReceipt.duplicateOfReceiptId}). Verifique na conferência!
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Requirement 6: Post-Upload Verification vs. Authorized Payment Settlement Confirmation */}
              {savedReceipt && (
                <div className="p-4 rounded-xl bg-slate-900 text-white space-y-3 border-l-4 border-[#FFD400]">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-[#FFD400]" />
                      <span className="text-xs font-black uppercase tracking-wider text-[#FFD400]">
                        Etapa de Conferência do Pagamento
                      </span>
                    </div>
                    <span
                      className={`text-[11px] font-black px-2.5 py-0.5 rounded ${
                        savedReceipt.verificationStatus === 'PAGAMENTO_CONFIRMADO'
                          ? 'bg-emerald-400 text-slate-950'
                          : 'bg-amber-400 text-slate-950'
                      }`}
                    >
                      {savedReceipt.verificationStatus === 'PAGAMENTO_CONFIRMADO'
                        ? 'Pagamento Confirmado por Usuário Autorizado'
                        : 'Comprovante Recebido • Aguardando Conferência'}
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">
                    O envio do comprovante salva o arquivo no servidor em estado{' '}
                    <strong>Aguardando conferência</strong> e não marca a parcela como liquidada
                    automaticamente. A baixa definitiva exige confirmação explícita por usuário
                    autorizado.
                  </p>

                  {savedReceipt.verificationStatus !== 'PAGAMENTO_CONFIRMADO' && (
                    <div className="pt-1 space-y-2.5">
                      {savedReceipt.isScheduledProof && (
                        <label className="flex items-start gap-2 text-xs text-amber-300 bg-amber-950/60 p-2.5 rounded-lg border border-amber-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={acknowledgeScheduled}
                            onChange={(e) => setAcknowledgeScheduled(e.target.checked)}
                            className="mt-0.5"
                          />
                          <span>
                            Atesto que este comprovante de agendamento já teve sua compensação
                            efetiva conferida no extrato bancário da transportadora.
                          </span>
                        </label>
                      )}

                      {canConfirmSettlement ? (
                        <button
                          type="button"
                          disabled={isConfirmingSettlement}
                          onClick={() => void handleConfirmPaymentSettlement()}
                          className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-2"
                        >
                          {isConfirmingSettlement ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <UserCheck className="w-4 h-4" />
                          )}
                          Confirmar Liquidação Bancária ({activeReceiptTitle} •{' '}
                          {formatCurrencyBRL(activeInstallmentAmountBRL)})
                        </button>
                      ) : (
                        <div className="p-2.5 rounded-lg bg-white/10 text-[11px] text-slate-300">
                          Seu perfil (<strong>{currentUser.roleTitle}</strong>) concluiu o envio do
                          comprovante. Um Coordenador Financeiro, Diretor ou Administrador fará a
                          confirmação final da liquidação.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer with Confirmation Summary Text & Action Buttons */}
        <div className="px-5 py-4 bg-slate-100 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-700">
            {selectedFreight ? (
              <span>
                Resumo de confirmação:{' '}
                <strong className="text-slate-950">
                  Salvar {activeReceiptTitle} ({formatCurrencyBRL(activeInstallmentAmountBRL)}) no
                  Frete {selectedFreight.code} ({selectedFreight.favorecido})
                </strong>
              </span>
            ) : (
              <span>Selecione um frete para habilitar a confirmação.</span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 font-bold text-xs hover:bg-slate-50"
            >
              Fechar
            </button>

            {hasFinanceiroAccess && uploadState !== 'SALVO_NO_SERVIDOR' && (
              <button
                type="button"
                disabled={uploadState === 'ENVIANDO' || !selectedFreight || !draft || draft.textOnly}
                onClick={() => void handleSaveReceiptToServer()}
                className="px-5 py-2.5 rounded-xl bg-[#FFD400] hover:bg-yellow-400 disabled:opacity-50 text-[#080B0D] font-black text-xs uppercase tracking-wider shadow-sm transition-colors inline-flex items-center justify-center gap-2"
              >
                {uploadState === 'ENVIANDO' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Enviando...
                  </>
                ) : uploadState === 'FALHA_NO_ENVIO' ? (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Tentar reenviar
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Conferir e salvar
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

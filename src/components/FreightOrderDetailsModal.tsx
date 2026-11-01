import React, { useState } from 'react';
import {
  ArrowRight,
  Building2,
  Calendar,
  Check,
  Copy,
  Eye,
  EyeOff,
  FileDown,
  Lock,
  MapPin,
  MessageCircle,
  Phone,
  Printer,
  ShieldAlert,
  ShieldCheck,
  Truck,
  User,
  Wallet,
  X,
} from 'lucide-react';
import { CarrierBrand, Employee, OperationalUnit } from '../types';
import { CarrierBrandLogo, getUnitShortTag } from '../lib/carrierLogos';
import { formatCurrencyBRL } from '../lib/freightDatabase';
import {
  FreightOrderDataForPdf,
  generateFreightOrderPdfA4,
} from '../lib/freightOrderPdfGenerator';

export interface FreightOrderDetailViewModel {
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
  origem: string;
  destino: string;
  stageOrStatus: string;
  valorFreteEmpresa: number;
  valorFreteMotorista: number;
  favorecido: string;
  tipoChavePix: string;
  chavePix: string;
  banco: string;
  docsOk?: string[];
}

interface FreightOrderDetailsModalProps {
  order: FreightOrderDetailViewModel | null;
  currentUser: Employee;
  onClose: () => void;
}

export const FreightOrderDetailsModal: React.FC<FreightOrderDetailsModalProps> = ({
  order,
  currentUser,
  onClose,
}) => {
  if (!order) return null;

  // Regra de Segurança do Bloco 4:
  // Se o usuário logado NÃO for o Petrônio (Financeiro), os valores monetários aparecem mascarados ("R$ ••••••").
  // Se for o Petrônio (ou perfil Financeiro), os valores ficam visíveis com opção de copiar chave PIX em 1 clique.
  const isPetronioOrFinanceiro =
    currentUser.department === 'Financeiro' ||
    currentUser.roleTitle?.toLowerCase().includes('financeiro') ||
    currentUser.name?.toLowerCase().includes('petrônio') ||
    currentUser.name?.toLowerCase().includes('petronio');

  const [simulatePetronioView, setSimulatePetronioView] = useState<boolean>(
    isPetronioOrFinanceiro
  );
  const [copiedPix, setCopiedPix] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const canSeeFinancialValues = isPetronioOrFinanceiro || simulatePetronioView;

  const formatDigitsForWhatsApp = (phone: string) => {
    const digits = (phone || '').replace(/\D/g, '');
    if (!digits) return '5571999202476';
    return digits.startsWith('55') ? digits : `55${digits}`;
  };

  const handleCopyPix = () => {
    if (!order.chavePix) return;
    navigator.clipboard?.writeText(order.chavePix);
    setCopiedPix(true);
    setTimeout(() => setCopiedPix(false), 2500);
  };

  const handleGeneratePdf = async () => {
    setIsGeneratingPdf(true);
    try {
      const payload: FreightOrderDataForPdf = {
        code: order.code,
        empresaMarca: order.empresaMarca,
        dataCarregamento: order.dataCarregamento,
        unidadeOperacional: order.unidadeOperacional,
        comercialResponsavel: order.comercialResponsavel,
        expedicaoResponsavel: order.expedicaoResponsavel,
        cliente: order.cliente,
        telefoneCliente: order.telefoneCliente,
        motoristaNome: order.motoristaNome,
        motoristaTelefone: order.motoristaTelefone,
        emergenciaNome: order.emergenciaNome,
        emergenciaTelefone: order.emergenciaTelefone,
        origem: order.origem,
        destino: order.destino,
        stageOrStatus: order.stageOrStatus,
        valorFreteEmpresa: order.valorFreteEmpresa,
        valorFreteMotorista: order.valorFreteMotorista,
        favorecido: order.favorecido,
        tipoChavePix: order.tipoChavePix,
        chavePix: order.chavePix,
        banco: order.banco,
        docsOk: order.docsOk,
      };
      await generateFreightOrderPdfA4(payload, canSeeFinancialValues);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const unitShortTag = getUnitShortTag(order.unidadeOperacional);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl border border-gray-200 my-auto max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ===================================================================
            CABEÇALHO ESCURO COM LOGO DA MARCA, UNIDADE E PROTOCOLO
        =================================================================== */}
        <div className="bg-[#111315] px-5 py-4 text-white flex flex-wrap items-center justify-between gap-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3.5 min-w-0">
            <CarrierBrandLogo brand={order.empresaMarca} size="md" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-[#FACC15]">
                  ORDEM DE CARREGAMENTO {order.code}
                </span>
                <span className="bg-white/10 text-white text-[10.5px] font-extrabold px-2.5 py-0.5 rounded-md border border-white/15">
                  {unitShortTag}
                </span>
                <span className="bg-[#2563EB] text-white text-[10.5px] font-bold px-2.5 py-0.5 rounded-full">
                  {order.stageOrStatus}
                </span>
              </div>
              <p className="text-xs text-gray-300 mt-0.5 truncate">
                Detalhes completos da ficha operacional de tráfego • {order.empresaMarca}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white flex items-center justify-center cursor-pointer transition shrink-0"
            title="Fechar modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ===================================================================
            CORPO DO MODAL DIVIDIDO EM 4 BLOCOS ORGANIZADOS
        =================================================================== */}
        <div className="p-5 space-y-4 overflow-y-auto text-xs flex-1 bg-[#F8FAFC]">
          {/* BLOCO 1 — IDENTIFICAÇÃO & OPERAÇÃO */}
          <div className="bg-white rounded-xl border border-gray-200/90 p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#111315]" />
                <h3 className="text-xs font-black uppercase tracking-wider text-[#111315]">
                  Bloco 1 — Identificação & Operação
                </h3>
              </div>
              <span className="text-[11px] font-bold text-gray-500">
                Unidade: <strong className="text-[#111315]">{order.unidadeOperacional}</strong>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-gray-50 rounded-xl p-2.5 border border-gray-100">
                <span className="block text-[10px] font-bold uppercase text-gray-400">
                  Empresa / Marca
                </span>
                <p className="font-extrabold text-[#111315] text-xs mt-0.5">
                  {order.empresaMarca}
                </p>
              </div>

              <div className="bg-gray-50 rounded-xl p-2.5 border border-gray-100">
                <span className="block text-[10px] font-bold uppercase text-gray-400">
                  Data Carregamento
                </span>
                <p className="font-extrabold text-[#111315] text-xs mt-0.5 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-amber-600" />
                  <span>{order.dataCarregamento}</span>
                </p>
              </div>

              <div className="bg-gray-50 rounded-xl p-2.5 border border-gray-100">
                <span className="block text-[10px] font-bold uppercase text-gray-400">
                  Comercial Responsável
                </span>
                <p className="font-extrabold text-[#111315] text-xs mt-0.5">
                  {order.comercialResponsavel || 'Jeise / César'}
                </p>
              </div>

              <div className="bg-gray-50 rounded-xl p-2.5 border border-gray-100">
                <span className="block text-[10px] font-bold uppercase text-gray-400">
                  Expedição Responsável
                </span>
                <p className="font-extrabold text-[#111315] text-xs mt-0.5">
                  {order.expedicaoResponsavel || 'Marcos Silva'}
                </p>
              </div>
            </div>
          </div>

          {/* BLOCO 2 — ROTA & CLIENTE */}
          <div className="bg-white rounded-xl border border-gray-200/90 p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#2563EB]" />
                <h3 className="text-xs font-black uppercase tracking-wider text-[#111315]">
                  Bloco 2 — Rota & Cliente
                </h3>
              </div>
              <span className="text-[11px] font-semibold text-gray-500">
                Dados de Coleta e Entrega
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                <span className="block text-[10px] font-bold uppercase text-gray-400">
                  Cliente (Razão Social / Nome Fantasia)
                </span>
                <p className="font-extrabold text-[#111315] text-sm mt-0.5">
                  {order.cliente}
                </p>
              </div>

              <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 flex items-center justify-between gap-2">
                <div>
                  <span className="block text-[10px] font-bold uppercase text-gray-400">
                    Telefone do Cliente
                  </span>
                  <p className="font-extrabold text-[#111315] text-sm mt-0.5">
                    {order.telefoneCliente || '71 9 9920-2476'}
                  </p>
                </div>
                <a
                  href={`tel:${(order.telefoneCliente || '71999202476').replace(/\D/g, '')}`}
                  className="px-2.5 py-1.5 rounded-lg bg-gray-200/80 hover:bg-gray-300 text-[#111315] font-bold text-[11px] inline-flex items-center gap-1"
                >
                  <Phone className="w-3 h-3" />
                  <span>Ligar</span>
                </a>
              </div>
            </div>

            {/* Origem -> Destino Destacados */}
            <div className="grid grid-cols-1 md:grid-cols-11 gap-2.5 items-center bg-[#111315] text-white rounded-xl p-3.5">
              <div className="md:col-span-5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#FACC15]">
                  Origem (Cidade/UF e Local)
                </span>
                <p className="text-xs sm:text-sm font-extrabold text-white mt-0.5 leading-snug">
                  {order.origem}
                </p>
              </div>

              <div className="md:col-span-1 flex justify-center">
                <div className="w-8 h-8 rounded-full bg-[#FACC15] text-[#111315] flex items-center justify-center">
                  <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                </div>
              </div>

              <div className="md:col-span-5 md:text-right">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#38BDF8]">
                  Destino (Cidade/UF e Local)
                </span>
                <p className="text-xs sm:text-sm font-extrabold text-white mt-0.5 leading-snug">
                  {order.destino}
                </p>
              </div>
            </div>
          </div>

          {/* BLOCO 3 — MOTORISTA & SEGURANÇA */}
          <div className="bg-white rounded-xl border border-gray-200/90 p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs font-black uppercase tracking-wider text-[#111315]">
                  Bloco 3 — Motorista & Segurança
                </h3>
              </div>
              <span className="text-[11px] font-semibold text-emerald-700">
                Acionamento Direto & Emergência
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Motorista + Telefone com links diretos WhatsApp/Ligação */}
              <div className="bg-emerald-50/60 rounded-xl p-3 border border-emerald-200/80 space-y-2">
                <div>
                  <span className="block text-[10px] font-bold uppercase text-emerald-800">
                    Motorista Responsável (Nome Completo)
                  </span>
                  <p className="font-extrabold text-[#111315] text-sm mt-0.5">
                    {order.motoristaNome || 'José Carlos Pereira dos Santos'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-emerald-200/60">
                  <div>
                    <span className="block text-[10px] font-bold uppercase text-emerald-800">
                      Telefone do Motorista
                    </span>
                    <p className="font-extrabold text-[#111315] text-xs">
                      {order.motoristaTelefone || '71 9 8845-1290'}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <a
                      href={`https://wa.me/${formatDigitsForWhatsApp(
                        order.motoristaTelefone || '71988451290'
                      )}?text=${encodeURIComponent(
                        `Olá ${order.motoristaNome || 'Motorista'}, contato referente à Ordem de Carregamento ${order.code} (${order.origem} -> ${order.destino}).`
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="bg-[#16A34A] hover:bg-[#15803D] text-white font-extrabold text-[11px] px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1 shadow-2xs transition"
                      title="Abrir conversa direta no WhatsApp do motorista"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>WhatsApp</span>
                    </a>
                    <a
                      href={`tel:${(order.motoristaTelefone || '71988451290').replace(
                        /\D/g,
                        ''
                      )}`}
                      className="bg-white hover:bg-gray-100 text-[#111315] border border-gray-300 font-bold text-[11px] px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1 transition"
                      title="Ligar para o motorista"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>Ligar</span>
                    </a>
                  </div>
                </div>
              </div>

              {/* Contato de Emergência */}
              <div className="bg-amber-50/60 rounded-xl p-3 border border-amber-200/80 space-y-2">
                <div>
                  <span className="block text-[10px] font-bold uppercase text-amber-900">
                    Contato de Emergência (Nome / Vínculo)
                  </span>
                  <p className="font-extrabold text-[#111315] text-sm mt-0.5 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>{order.emergenciaNome || 'Maria Helena (Familiar)'}</span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-amber-200/60">
                  <div>
                    <span className="block text-[10px] font-bold uppercase text-amber-900">
                      Telefone de Emergência
                    </span>
                    <p className="font-extrabold text-[#111315] text-xs">
                      {order.emergenciaTelefone || '71 9 9123-4567'}
                    </p>
                  </div>

                  <a
                    href={`tel:${(order.emergenciaTelefone || '71991234567').replace(
                      /\D/g,
                      ''
                    )}`}
                    className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-950 border border-amber-400/50 font-extrabold text-[11px] px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1 transition"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Acionar Emergência</span>
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* BLOCO 4 — FINANCEIRO & PAGAMENTO (BLINDADO) */}
          <div className="bg-white rounded-xl border-2 border-[#111315]/15 p-4 shadow-2xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2.5">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-[#111315]" />
                <h3 className="text-xs font-black uppercase tracking-wider text-[#111315]">
                  Bloco 4 — Financeiro & Pagamento (Blindado)
                </h3>
              </div>

              <div className="flex items-center gap-2">
                {canSeeFinancialValues ? (
                  <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10.5px] font-extrabold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Acesso Financeiro Autorizado (Petrônio)</span>
                  </span>
                ) : (
                  <span className="bg-gray-100 text-gray-700 border border-gray-300 text-[10.5px] font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                    <Lock className="w-3 h-3 text-gray-500" />
                    <span>Valores Protegidos (Exclusivo Petrônio / Financeiro)</span>
                  </span>
                )}

                {!isPetronioOrFinanceiro && (
                  <button
                    type="button"
                    onClick={() => setSimulatePetronioView((v) => !v)}
                    className="text-[10.5px] font-extrabold px-2.5 py-1 rounded-lg bg-[#111315] text-[#FACC15] hover:bg-gray-800 inline-flex items-center gap-1 cursor-pointer transition"
                    title="Simular visão do perfil Financeiro (Petrônio) para testar desbloqueio dos valores e PIX"
                  >
                    {simulatePetronioView ? (
                      <>
                        <EyeOff className="w-3 h-3" />
                        <span>Bloquear Visão Petrônio</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3 h-3" />
                        <span>Simular Visão Petrônio</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Valores Financeiros (Frete Empresa & Frete Motorista) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-[#111315] text-white rounded-xl p-3.5 flex items-center justify-between">
                <div>
                  <span className="block text-[10px] font-bold uppercase text-gray-400">
                    Frete Empresa (Valor Cobrado do Cliente)
                  </span>
                  <p className="text-lg font-black text-[#FACC15] mt-0.5 tabular-nums">
                    {canSeeFinancialValues
                      ? formatCurrencyBRL(order.valorFreteEmpresa || 0)
                      : 'R$ ••••••'}
                  </p>
                </div>
                <Truck className="w-6 h-6 text-[#FACC15]/40" />
              </div>

              <div className="bg-[#0F2942] text-white rounded-xl p-3.5 flex items-center justify-between">
                <div>
                  <span className="block text-[10px] font-bold uppercase text-sky-200/80">
                    Frete Motorista (Pago ao Terceiro/Agregado)
                  </span>
                  <p className="text-lg font-black text-[#38BDF8] mt-0.5 tabular-nums">
                    {canSeeFinancialValues
                      ? formatCurrencyBRL(order.valorFreteMotorista || 0)
                      : 'R$ ••••••'}
                  </p>
                </div>
                <Wallet className="w-6 h-6 text-[#38BDF8]/40" />
              </div>
            </div>

            {/* Favorecido, Banco e Chave PIX */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                <span className="block text-[10px] font-bold uppercase text-gray-400">
                  Favorecido (Nome p/ Pagamento)
                </span>
                <p className="font-extrabold text-[#111315] text-xs mt-0.5">
                  {order.favorecido || '-'}
                </p>
              </div>

              <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                <span className="block text-[10px] font-bold uppercase text-gray-400">
                  Banco / Instituição Financeira
                </span>
                <p className="font-extrabold text-[#111315] text-xs mt-0.5">
                  {order.banco || '260 - Nu Pagamentos'}
                </p>
              </div>

              <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="block text-[10px] font-bold uppercase text-gray-400">
                    Chave PIX ({order.tipoChavePix || 'CPF/CNPJ'})
                  </span>
                  <p className="font-mono font-extrabold text-[#111315] text-xs mt-0.5 truncate">
                    {canSeeFinancialValues
                      ? order.chavePix || '-'
                      : '•••.•••.•••-••'}
                  </p>
                </div>

                {canSeeFinancialValues && order.chavePix && (
                  <button
                    type="button"
                    onClick={handleCopyPix}
                    className={`px-2.5 py-1.5 rounded-lg font-extrabold text-[11px] inline-flex items-center gap-1 shrink-0 cursor-pointer transition ${
                      copiedPix
                        ? 'bg-emerald-600 text-white'
                        : 'bg-[#FACC15] hover:bg-[#eab308] text-[#111315]'
                    }`}
                    title="Copiar Chave PIX em 1 clique"
                  >
                    {copiedPix ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar PIX</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ===================================================================
            RODAPÉ COM BOTÃO "IMPRIMIR ORDEM DE CARREGAMENTO (PDF)" (JSPDF A4)
        =================================================================== */}
        <div className="bg-white px-5 py-3.5 border-t border-gray-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] text-gray-500">
            Documento oficial com logotipo <strong>{order.empresaMarca}</strong> em formato A4.
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs cursor-pointer transition"
            >
              Fechar
            </button>

            
          </div>
        </div>
      </div>
    </div>
  );
};

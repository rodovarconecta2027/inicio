import { jsPDF } from 'jspdf';
import { CarrierBrand, OperationalUnit } from '../types';
import { getCarrierLogoPngDataUrl, getUnitShortTag } from './carrierLogos';
import { formatCurrencyBRL } from './freightDatabase';

export interface FreightOrderDataForPdf {
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

export interface CompanyBrandInfo {
  legalName: string;
  cnpj: string;
  unitLabel: string;
  primaryColor: [number, number, number]; // RGB
  accentColor: [number, number, number]; // RGB
}

export function getCompanyBrandInfo(
  brand: CarrierBrand = 'RODOVAR',
  unit: OperationalUnit = 'BA - Salvador'
): CompanyBrandInfo {
  const isSalvador = !unit.includes('SP') && !unit.toLowerCase().includes('guarulhos');
  const unitLabel = isSalvador ? 'Unidade SSA-BA · Salvador' : 'Unidade GRU-SP · Guarulhos';

  if (brand === 'VL TRANSPORTES') {
    return {
      legalName: 'VL TRANSPORTES LTDA',
      cnpj: 'CNPJ 32.845.912/0001-44',
      unitLabel,
      primaryColor: [17, 24, 39],
      accentColor: [250, 204, 21], // #FACC15
    };
  }

  if (brand === 'AXD') {
    return {
      legalName: 'AXD LOGÍSTICA & TRANSPORTES LTDA',
      cnpj: 'CNPJ 28.719.304/0001-89',
      unitLabel,
      primaryColor: [30, 41, 59],
      accentColor: [249, 115, 22], // #F97316
    };
  }

  // Default: RODOVAR
  return {
    legalName: 'RODOVAR LTDA',
    cnpj: 'CNPJ 49.908.710/0001-03',
    unitLabel,
    primaryColor: [17, 24, 39],
    accentColor: [250, 204, 21], // #FACC15
  };
}

export async function generateFreightOrderPdfA4(
  order: FreightOrderDataForPdf,
  canViewFinancialValues: boolean
): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  const brandInfo = getCompanyBrandInfo(order.empresaMarca, order.unidadeOperacional);

  let y = 14;

  // 1. TOP HEADER: LOGO ON LEFT, CORPORATE INFO ON RIGHT
  const logoBoxWidth = 52;
  const logoBoxHeight = 18;

  try {
    const logoDataUrl = await getCarrierLogoPngDataUrl(order.empresaMarca || 'RODOVAR');
    if (logoDataUrl) {
      doc.addImage(logoDataUrl, 'PNG', margin, y, logoBoxWidth, logoBoxHeight);
    }
  } catch {
    doc.setTextColor(17, 24, 39);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(order.empresaMarca || 'RODOVAR', margin, y + 12);
  }

  // Right-aligned Corporate Info
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(17, 24, 39);
  doc.text(brandInfo.legalName, pageWidth - margin, y + 5, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(55, 65, 81);
  doc.text(brandInfo.cnpj, pageWidth - margin, y + 10.5, { align: 'right' });

  doc.setFontSize(8);
  doc.setTextColor(107, 114, 128);
  doc.text(brandInfo.unitLabel, pageWidth - margin, y + 15.5, { align: 'right' });

  y += 22;

  // Yellow / Brand Accent Line
  doc.setFillColor(brandInfo.accentColor[0], brandInfo.accentColor[1], brandInfo.accentColor[2]);
  doc.rect(margin, y, contentWidth, 2, 'F');

  y += 6;

  // 2. DOCUMENT TITLE & PROTOCOL BADGE
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(17, 24, 39);
  doc.text('ORDEM DE CARREGAMENTO', margin, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(107, 114, 128);
  doc.text('Documento operacional', margin, y + 11.5);

  // Badge on the right for protocol #
  const badgeWidth = 34;
  const badgeHeight = 10;
  const badgeX = pageWidth - margin - badgeWidth;
  doc.setFillColor(17, 24, 39);
  doc.roundedRect(badgeX, y + 1, badgeWidth, badgeHeight, 1.5, 1.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  const cleanCode = order.code.startsWith('#') ? order.code : `#${order.code}`;
  doc.text(cleanCode, badgeX + badgeWidth / 2, y + 7.8, { align: 'center' });

  y += 18;

  // 3. HIGHLIGHT BOX: ROUTE (ORIGEM / DESTINO) & STATUS
  const routeBoxHeight = 22;
  doc.setFillColor(248, 250, 252); // #F8FAFC
  doc.setDrawColor(226, 232, 240); // #E2E8F0
  doc.roundedRect(margin, y, contentWidth, routeBoxHeight, 2, 2, 'FD');

  const halfWidth = contentWidth / 2;

  // ORIGEM
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(107, 114, 128);
  doc.text('ORIGEM', margin + 5, y + 5.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(17, 24, 39);
  doc.text(doc.splitTextToSize((order.origem || '-').toUpperCase(), halfWidth - 10)[0] || '-', margin + 5, y + 10.5);

  // DESTINO
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(107, 114, 128);
  doc.text('DESTINO', margin + halfWidth + 5, y + 5.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(17, 24, 39);
  doc.text(doc.splitTextToSize((order.destino || '-').toUpperCase(), halfWidth - 10)[0] || '-', margin + halfWidth + 5, y + 10.5);

  // BOTTOM OF ROUTE BOX: DATA & STATUS
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(17, 24, 39);
  doc.text(`Carregamento: ${order.dataCarregamento || '-'}`, margin + 5, y + 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(75, 85, 99);
  doc.text(`Status: ${order.stageOrStatus || 'Em Trânsito'}`, margin + halfWidth + 5, y + 18);

  y += routeBoxHeight + 6;

  // HELPER TO RENDER A NUMBERED SECTION HEADER
  const drawNumberedSectionHeader = (numStr: string, titleStr: string) => {
    // Number in amber/gold
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(217, 119, 6); // amber-600
    doc.text(numStr, margin, y + 4);

    // Section title
    doc.setTextColor(17, 24, 39);
    doc.text(titleStr, margin + 7, y + 4);

    // Subtle underline across the content width
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.3);
    doc.line(margin, y + 6.5, pageWidth - margin, y + 6.5);

    y += 11;
  };

  const draw2ColFields = (
    label1: string,
    val1: string,
    label2: string,
    val2: string,
    rowHeight = 11
  ) => {
    // Left column
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(107, 114, 128);
    doc.text(label1.toUpperCase(), margin, y + 3.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(17, 24, 39);
    doc.text(doc.splitTextToSize(val1 || '-', halfWidth - 6)[0] || '-', margin, y + 8);

    // Right column
    const x2 = margin + halfWidth;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(107, 114, 128);
    doc.text(label2.toUpperCase(), x2, y + 3.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(17, 24, 39);
    doc.text(doc.splitTextToSize(val2 || '-', halfWidth - 6)[0] || '-', x2, y + 8);

    y += rowHeight;
  };

  // =========================================================================
  // 01 OPERAÇÃO E CLIENTE
  // =========================================================================
  drawNumberedSectionHeader('01', 'OPERAÇÃO E CLIENTE');
  draw2ColFields(
    'CLIENTE / EMBARCADOR',
    (order.cliente || '-').toUpperCase(),
    'TELEFONE DO CLIENTE',
    order.telefoneCliente || '71 9 9920-2476'
  );
  draw2ColFields(
    'COMERCIAL RESPONSÁVEL',
    order.comercialResponsavel || 'Jeise / César',
    'EXPEDIÇÃO RESPONSÁVEL',
    order.expedicaoResponsavel || 'Administrador Geral RODOVAR'
  );

  y += 2;

  // =========================================================================
  // 02 MOTORISTA E CONTATO DE EMERGÊNCIA
  // =========================================================================
  drawNumberedSectionHeader('02', 'MOTORISTA E CONTATO DE EMERGÊNCIA');
  draw2ColFields(
    'MOTORISTA',
    order.motoristaNome || '-',
    'TELEFONE / WHATSAPP',
    order.motoristaTelefone || '-'
  );
  draw2ColFields(
    'CONTATO DE EMERGÊNCIA / VÍNCULO',
    order.emergenciaNome || 'Contato Familiar',
    'TELEFONE DE EMERGÊNCIA',
    order.emergenciaTelefone || '-'
  );

  y += 2;

  // =========================================================================
  // 03 FINANCEIRO E PAGAMENTO
  // =========================================================================
  drawNumberedSectionHeader('03', 'FINANCEIRO E PAGAMENTO');

  const freteEmpresaFormatted = canViewFinancialValues
    ? formatCurrencyBRL(order.valorFreteEmpresa || 0)
    : 'R$ ••••••';
  const freteMotoristaFormatted = canViewFinancialValues
    ? formatCurrencyBRL(order.valorFreteMotorista || 0)
    : 'R$ ••••••';

  draw2ColFields(
    'FRETE EMPRESA · COBRADO DO CLIENTE',
    freteEmpresaFormatted,
    'FRETE MOTORISTA · TERCEIRO / AGREGADO',
    freteMotoristaFormatted
  );
  draw2ColFields(
    'FAVORECIDO',
    order.favorecido || '-',
    'BANCO / INSTITUIÇÃO',
    (order.banco || '-').toUpperCase()
  );
  draw2ColFields(
    'TIPO DE CHAVE PIX',
    order.tipoChavePix || 'CPF/CNPJ',
    'CHAVE PIX DO FAVORECIDO',
    order.chavePix || '-'
  );

  if (!canViewFinancialValues) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(107, 114, 128);
    doc.text('Valores financeiros preservados como ocultos no documento de origem.', margin, y + 2);
    y += 6;
  }

  // =========================================================================
  // ASSINATURAS OPERACIONAIS
  // =========================================================================
  const sigY = 260;
  const sigLineWidth = 52;
  doc.setDrawColor(156, 163, 175);
  doc.setLineWidth(0.4);

  // Line 1: Expedição / Tráfego
  doc.line(margin, sigY, margin + sigLineWidth, sigY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(75, 85, 99);
  doc.text('Expedição / Tráfego', margin + sigLineWidth / 2, sigY + 4, { align: 'center' });

  // Line 2: Motorista / Transportador
  const col2X = margin + (contentWidth - sigLineWidth) / 2;
  doc.line(col2X, sigY, col2X + sigLineWidth, sigY);
  doc.text('Motorista / Transportador', col2X + sigLineWidth / 2, sigY + 4, { align: 'center' });

  // Line 3: Conferência financeira
  const col3X = pageWidth - margin - sigLineWidth;
  doc.line(col3X, sigY, col3X + sigLineWidth, sigY);
  doc.text('Conferência financeira', col3X + sigLineWidth / 2, sigY + 4, { align: 'center' });

  // =========================================================================
  // RODAPÉ CORPORATIVO
  // =========================================================================
  const footerY = 277;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(107, 114, 128);

  const nowStr = new Date().toLocaleString('pt-BR');
  doc.text(
    `Emissão original: RODOVAR CONECTA · ${nowStr} · Protocolo ${cleanCode}`,
    margin,
    footerY
  );
  doc.text(
    'Layout atualizado e CNPJ incluído em 2027. Dados operacionais preservados.',
    margin,
    footerY + 4
  );

  const safeBrand = (order.empresaMarca || 'RODOVAR').replace(/\s+/g, '_');
  const safeCodeText = cleanCode.replace(/[^a-zA-Z0-9]/g, '');
  doc.save(`Ordem_Carregamento_${safeBrand}_${safeCodeText}.pdf`);
}

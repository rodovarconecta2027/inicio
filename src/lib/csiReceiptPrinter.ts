import { InternalRequest, Employee } from '../types';

/**
 * Utilitário Oficial de Impressão e Emissão de Comprovante PDF do RODOVAR CONECTA (CSI)
 * Gera um documento A4 corporativo em alta resolução pronto para impressão e "Salvar como PDF".
 */
export function printRequestCsiReceipt(req: InternalRequest, currentUser?: Employee): void {
  const protocolClean = req.protocol.replace('#', '').toUpperCase();
  const csiAuthCode = `CSI-${protocolClean}-${req.id.toUpperCase().slice(-8)}`;
  const now = new Date();
  const emissionTimestamp = now.toLocaleString('pt-BR');
  const openedAt = req.createdAtIso ? new Date(req.createdAtIso).toLocaleString('pt-BR') : 'Data não informada';
  const initialDueAt = req.originalDueAtIso ? new Date(req.originalDueAtIso).toLocaleString('pt-BR') : '48 horas';
  const currentDueAt = req.currentDueAtIso ? new Date(req.currentDueAtIso).toLocaleString('pt-BR') : 'Conforme prazo';

  // Última atualização do histórico
  const lastHistory = req.history && req.history.length > 0 ? req.history[req.history.length - 1] : null;

  // Cor do status
  const statusColorMap: Record<string, { bg: string; text: string; border: string }> = {
    Concluída: { bg: '#ECFDF5', text: '#065F46', border: '#A7F3D0' },
    'Em andamento': { bg: '#EFF6FF', text: '#1E40AF', border: '#BFDBFE' },
    'Em análise': { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' },
    'Aguardando funcionário': { bg: '#F3F4F6', text: '#374151', border: '#E5E7EB' },
    Cancelada: { bg: '#FEF2F2', text: '#991B1B', border: '#FECACA' },
    Aberta: { bg: '#FEF9C3', text: '#854D0E', border: '#FEF08A' },
  };

  const statusStyle = statusColorMap[req.status] || { bg: '#F3F4F6', text: '#111827', border: '#E5E7EB' };

  // Histórico formatado
  const historyHtml =
    req.history && req.history.length > 0
      ? req.history
          .map(
            (h) => `
        <div style="padding: 6px 0; border-bottom: 1px dashed #E5E7EB; font-size: 11px;">
          <div style="display: flex; justify-content: space-between; color: #4B5563; font-weight: 600;">
            <span>${escapeHtml(h.actorName)} • <strong>${escapeHtml(h.action)}</strong></span>
            <span style="font-family: monospace; color: #6B7280;">${escapeHtml(h.timestamp)}</span>
          </div>
          ${
            h.note
              ? `<div style="margin-top: 3px; color: #1F2937; background: #F9FAFB; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-style: italic;">"${escapeHtml(
                  h.note
                )}"</div>`
              : ''
          }
        </div>`
          )
          .join('')
      : '<p style="font-size: 11px; color: #6B7280; font-style: italic; margin: 4px 0;">Nenhum histórico complementar registrado.</p>';

  const htmlContent = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Comprovante CSI ${escapeHtml(req.protocol)} - RODOVAR CONECTA</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 15mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 0;
      color: #080B0D;
      background: #FFFFFF;
      font-size: 12px;
      line-height: 1.45;
    }
    .sheet {
      width: 100%;
      max-width: 780px;
      margin: 0 auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 12px;
      border-bottom: 2px solid #080B0D;
    }
    .brand-title {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .brand-logo-text {
      font-size: 22px;
      font-weight: 900;
      letter-spacing: -0.5px;
      color: #080B0D;
      text-transform: uppercase;
    }
    .brand-logo-text span {
      color: #FFD400;
      background: #080B0D;
      padding: 2px 6px;
      border-radius: 4px;
      margin-left: 2px;
    }
    .brand-sub {
      font-size: 9px;
      font-weight: 700;
      color: #4B5563;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      margin-top: 2px;
    }
    .doc-type-badge {
      text-align: right;
    }
    .doc-type-title {
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.5px;
      color: #080B0D;
      text-transform: uppercase;
    }
    .doc-type-protocol {
      font-size: 18px;
      font-weight: 900;
      color: #080B0D;
      font-family: monospace;
      margin-top: 2px;
    }
    .slogan-bar {
      background: #080B0D;
      color: #FFD400;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.2px;
      text-align: center;
      padding: 4px 8px;
      border-radius: 4px;
      margin: 10px 0 16px 0;
    }
    .section-title {
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: #4B5563;
      margin: 12px 0 6px 0;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .section-title::after {
      content: '';
      flex: 1;
      height: 1px;
      background: #E5E7EB;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .grid-3 {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 8px;
    }
    .info-card {
      background: #F9FAFB;
      border: 1px solid #E5E7EB;
      border-radius: 6px;
      padding: 8px 10px;
    }
    .info-label {
      font-size: 9px;
      font-weight: 700;
      color: #6B7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 2px;
    }
    .info-value {
      font-size: 12px;
      font-weight: 700;
      color: #111827;
      word-break: break-word;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 800;
      border: 1px solid transparent;
    }
    .description-box {
      background: #FFFFFF;
      border: 1px solid #D1D5DB;
      border-left: 4px solid #FFD400;
      border-radius: 4px;
      padding: 10px 12px;
      font-size: 11.5px;
      color: #1F2937;
      margin-top: 6px;
      white-space: pre-wrap;
    }
    .auth-box {
      background: #F8FAFC;
      border: 1.5px dashed #94A3B8;
      border-radius: 6px;
      padding: 10px 12px;
      margin: 14px 0 10px 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .auth-left {
      flex: 1;
    }
    .auth-title {
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      color: #0F172A;
      letter-spacing: 0.6px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .auth-code {
      font-family: monospace;
      font-size: 13px;
      font-weight: 900;
      color: #0F172A;
      background: #E2E8F0;
      padding: 2px 6px;
      border-radius: 4px;
      display: inline-block;
      margin: 4px 0;
    }
    .auth-disclaimer {
      font-size: 9.5px;
      color: #475569;
      line-height: 1.35;
    }
    .seal-badge {
      border: 2px solid #080B0D;
      background: #FFD400;
      color: #080B0D;
      padding: 6px 10px;
      border-radius: 6px;
      text-align: center;
      font-weight: 900;
      font-size: 10px;
      text-transform: uppercase;
      line-height: 1.2;
      flex-shrink: 0;
    }
    .history-card {
      background: #FFFFFF;
      border: 1px solid #E5E7EB;
      border-radius: 6px;
      padding: 8px 12px;
      max-height: 160px;
      overflow: hidden;
    }
    .footer {
      margin-top: 16px;
      padding-top: 8px;
      border-top: 1px solid #E5E7EB;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 9.5px;
      color: #6B7280;
    }
    .footer-left {
      font-weight: 600;
    }
    .footer-right {
      text-align: right;
      font-weight: 600;
    }

    @media print {
      body {
        margin: 0;
        padding: 0;
      }
      .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <!-- Cabeçalho -->
    <div class="header">
      <div class="brand-title">
        <div>
          <div class="brand-logo-text">RODOVAR <span>CONECTA</span></div>
          <div class="brand-sub">COMUNICAÇÃO • PESSOAS • PROCESSOS • RESULTADOS</div>
        </div>
      </div>
      <div class="doc-type-badge">
        <div class="doc-type-title">COMPROVANTE OFICIAL DE SOLICITAÇÃO INTERNA (CSI)</div>
        <div class="doc-type-protocol">${escapeHtml(req.protocol)}</div>
      </div>
    </div>

    <!-- Slogan Bar -->
    <div class="slogan-bar">
      JUNTOS LEVANDO O BRASIL MAIS LONGE | PORTAL CORPORATIVO RODOVAR CONECTA
    </div>

    <!-- Bloco 1: Dados Principais da Solicitação -->
    <div class="section-title">1. Dados do Chamado e Classificação</div>
    <div class="grid-2">
      <div class="info-card">
        <div class="info-label">Assunto / Título do Chamado</div>
        <div class="info-value">${escapeHtml(req.subject)}</div>
      </div>
      <div class="info-card">
        <div class="info-label">Status Atual da Solicitação</div>
        <div>
          <span class="badge" style="background: ${statusStyle.bg}; color: ${statusStyle.text}; border-color: ${statusStyle.border};">
            ● ${escapeHtml(req.status)}
          </span>
          <span class="badge" style="background: #F3F4F6; color: #111827; margin-left: 6px;">
            Prioridade: ${escapeHtml(req.priority)}
          </span>
        </div>
      </div>
    </div>

    <div class="grid-3" style="margin-top: 6px;">
      <div class="info-card">
        <div class="info-label">Colaborador Solicitante</div>
        <div class="info-value">${escapeHtml(req.requesterName)}</div>
        <div style="font-size: 10px; color: #6B7280; margin-top: 1px;">${escapeHtml(req.requesterDepartment)}</div>
      </div>
      <div class="info-card">
        <div class="info-label">Setor / Departamento Destino</div>
        <div class="info-value">${escapeHtml(req.targetDepartment)}</div>
        <div style="font-size: 10px; color: #6B7280; margin-top: 1px;">Central de Atendimento</div>
      </div>
      <div class="info-card">
        <div class="info-label">Prazos e Prazos Limite (CSI)</div>
        <div style="font-size: 11px; font-weight: 700;">Aberto: ${openedAt}</div>
        <div style="font-size: 10.5px; color: #B45309; font-weight: 700; margin-top: 1px;">Vence em: ${currentDueAt}</div>
      </div>
    </div>

    <!-- Bloco 2: Descrição da Necessidade -->
    <div class="section-title">2. Descrição Detalhada da Necessidade</div>
    <div class="description-box">${escapeHtml(req.description)}</div>

    <!-- Bloco 3: Histórico Sintético e Pareceres -->
    <div class="section-title">3. Histórico do Pedido e Pareceres Registrados</div>
    <div class="history-card">
      ${historyHtml}
    </div>

    <!-- Bloco 4: Autenticidade e Governança -->
    <div class="auth-box">
      <div class="auth-left">
        <div class="auth-title">
          <span>🛡️</span> GOVERNANÇA CORPORATIVA & AUTENTICIDADE ELETRÔNICA
        </div>
        <div class="auth-code">${escapeHtml(csiAuthCode)}</div>
        <div class="auth-disclaimer">
          Documento emitido eletronicamente pelo portal <strong>RODOVAR CONECTA</strong> em <strong>${emissionTimestamp}</strong> por <strong>${escapeHtml(
    currentUser?.name || 'Sistema Integrado'
  )}</strong>.<br>
          Válido internamente sem necessidade de assinatura física conforme política de governança corporativa da Transportadora Rodovar.
        </div>
      </div>
      <div class="seal-badge">
        AUTENTICADO<br>
        <span style="font-size: 8px; font-weight: 700;">PORTAL RODOVAR</span>
      </div>
    </div>

    <!-- Rodapé Corporativo -->
    <div class="footer">
      <div class="footer-left">
        RODOVAR CONECTA v3.0 • Transporte • Logística • Pessoas • Resultados • www.rodovar.com.br
      </div>
      <div class="footer-right">
        Central / Plantão: (71) 9 9920-2476 • Emissão: ${emissionTimestamp}
      </div>
    </div>
  </div>
</body>
</html>`;

  // Cria iframe oculto para impressão limpa sem fechar modais ou perturbar a UI
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = 'none';
  iframe.setAttribute('title', 'Impressão de Comprovante CSI');

  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    // Fallback: abre uma nova aba e chama print
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 350);
    }
    return;
  }

  doc.open();
  doc.write(htmlContent);
  doc.close();

  // Espera renderização e dispara print
  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      // Se iframe falhar por sandbox, tenta janela
      const printWin = window.open('', '_blank');
      if (printWin) {
        printWin.document.open();
        printWin.document.write(htmlContent);
        printWin.document.close();
        printWin.focus();
        setTimeout(() => printWin.print(), 350);
      }
    } finally {
      // Remove iframe após um tempo
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 60000);
    }
  }, 400);
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

import { AsyncLocalStorage } from 'node:async_hooks';
import {expeditionPaymentMode,effectiveExpeditionChecklist,expeditionChecklistCount} from '../lib/expeditionValidation.js';
import { Express, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  CarrierBrand,
  CommercialFreightStatus,
  CorporateNotification,
  Employee,
  FinancialFreightStatus,
  FreightAttachmentCategory,
  FreightHistoryEventType,
  MonitoringFreightStatus,
  OperationalFreightStatus,
  OperationalUnit,
  UnifiedFreightAttachment,
  UnifiedFreightChecklist,
  UnifiedFreightComment,
  UnifiedFreightDetailsPayload,
  UnifiedFreightHistoryEntry,
  UnifiedFreightOccurrence,
  UnifiedFreightRecord,
  UserRole,
} from '../types';
import {
  canOperateMonitoring,
  canAccessComercialFreights,
  canAccessExpedicaoFreights,
  canAccessMonitoramentoFreights,
  canViewFreightTeam,
  hasPagePermission,
} from '../lib/permissions.js';

export const RODOVAR_CNPJ = '49.908.710/0001-03';
export const RODOVAR_RAZAO_SOCIAL = 'RODOVAR LOGÍSTICA E TRANSPORTES RODOVIÁRIOS LTDA';

const ROOT_DIR = process.env.RODOVAR_DATA_ROOT || process.cwd();
const FREIGHTS_STORE_DIR = path.join(ROOT_DIR, 'data', 'freights-store');
const FREIGHT_ATTACHMENTS_DIR = path.join(ROOT_DIR, 'data', 'freight-attachments');
const NOTIFICATIONS_FILE = path.join(FREIGHTS_STORE_DIR, '_notifications.json');
const SEQUENCE_FILE = path.join(FREIGHTS_STORE_DIR, '_sequence.json');

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5 MB

export function formatSaoPauloDateTime(date: Date = new Date()): {
  iso: string;
  formatted: string;
  timeShort: string;
  dateOnlyIso: string;
} {
  const iso = date.toISOString();
  const partsFormatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = partsFormatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }
  const day = map.day || '01';
  const month = map.month || '01';
  const year = map.year || '2027';
  const hour = map.hour === '24' ? '00' : map.hour || '00';
  const minute = map.minute || '00';

  return {
    iso,
    formatted: `${day}/${month}/${year} ${hour}:${minute}`,
    timeShort: `${hour}:${minute}`,
    dateOnlyIso: `${year}-${month}-${day}`,
  };
}

interface FreightSubDocument {
  freightId: string;
  anexos: UnifiedFreightAttachment[];
  comentarios: UnifiedFreightComment[];
  ocorrencias: UnifiedFreightOccurrence[];
  historico: UnifiedFreightHistoryEntry[];
}

export interface ServerNotificationRecord extends CorporateNotification {
  recipientId: string;
  createdAtIso: string;
  dedupeKey?: string;
}

/** Each remote transaction owns its state. Local server keeps its existing file-backed state. */
export interface FreightEngineState {
  freightsIndex: Map<string, UnifiedFreightRecord>;
  freightSubDocs: Map<string, FreightSubDocument>;
  idempotencyCache: Map<string, { timestamp: number; status: number; body: unknown }>;
  activeFreightLocks: Set<string>;
  serverNotifications: ServerNotificationRecord[];
  nextProtocolNumber: number;
}
export const emptyFreightEngineState = (nextProtocolNumber: number): FreightEngineState => ({
  freightsIndex: new Map(), freightSubDocs: new Map(), idempotencyCache: new Map(),
  activeFreightLocks: new Set(), serverNotifications: [], nextProtocolNumber,
});
const remoteFreightContext = new AsyncLocalStorage<FreightEngineState>();
const localFreightState = emptyFreightEngineState(843);
const engineState = () => remoteFreightContext.getStore() || localFreightState;
export const withFreightEngineState = <T>(state: FreightEngineState, action: () => T): T => remoteFreightContext.run(state, action);

function ensureDirectories() {
  if (!fs.existsSync(FREIGHTS_STORE_DIR)) {
    fs.mkdirSync(FREIGHTS_STORE_DIR, { recursive: true });
  }
  if (!fs.existsSync(FREIGHT_ATTACHMENTS_DIR)) {
    fs.mkdirSync(FREIGHT_ATTACHMENTS_DIR, { recursive: true });
  }
}

function getFreightDocPath(freightId: string): string {
  const safeId = freightId.replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(FREIGHTS_STORE_DIR, `${safeId}.json`);
}

function getFreightSubDocPath(freightId: string): string {
  const safeId = freightId.replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(FREIGHTS_STORE_DIR, `${safeId}.sub.json`);
}

function writeJsonAtomically(targetPath: string, data: unknown): void {
  if (remoteFreightContext.getStore()) return; // Firestore adapter commits after validation.
  ensureDirectories();
  const tmp = `${targetPath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, targetPath);
}

// 5 functional verifications in Expedição:
// 1. Dados do motorista conferidos (motoristaConfirmado)
// 2. Veículo conferido (veiculoConfirmado)
// 3. Condições e documentos conferidos (condicoesConferidas && documentosConferidos)
// 4. Videochamada realizada com o motorista (videochamadaRealizada)
// 5. Ordem de coleta enviada ao motorista (ordemColetaEnviadaMotorista)
export function computeChecklistCount(c?: UnifiedFreightChecklist): number {
  if (!c) return 0;
  let count = 0;
  if (c.motoristaConfirmado) count++;
  if (c.veiculoConfirmado) count++;
  if (c.condicoesConferidas && c.documentosConferidos) count++;
  if (c.videochamadaRealizada) count++;
  if (c.ordemColetaEnviadaMotorista) count++;
  return count;
}

export function computePendingForExpedicao(freight: UnifiedFreightRecord): string[] {
  const pending: string[] = [];
  // Retirado 'Endereço detalhado de entrega' da Expedição (a confirmar pelo Monitoramento)
  if (!freight.pesoKg || freight.pesoKg <= 0 || !freight.volumes || freight.volumes <= 0) {
    pending.push('Peso (kg) e volumes da carga');
  }
  if (!freight.veiculoNecessario || freight.veiculoNecessario.trim().length < 2) {
    pending.push('Tipo de veículo necessário');
  }
  if (
    !freight.motoristaNome ||
    freight.motoristaNome.trim().length < 3 ||
    !freight.motoristaCpf ||
    !freight.motoristaTelefone
  ) {
    pending.push('Dados do motorista (nome, CPF e telefone)');
  }
  if (!freight.transportadorNome || freight.transportadorNome.trim().length < 2) {
    pending.push('Transportador / proprietário');
  }
  if (!freight.placaVeiculo || freight.placaVeiculo.trim().length < 6) {
    pending.push('Placas do veículo / carreta');
  }
  if (!freight.valorContratadoCentavos || freight.valorContratadoCentavos <= 0) {
    pending.push('Valor contratado com o motorista');
  }
  return pending;
}

function syncSubDocCounters(freight: UnifiedFreightRecord, sub: FreightSubDocument): void {
  freight.anexosCount = sub.anexos.length;
  freight.comentariosCount = sub.comentarios.length;
  const openOccs = sub.ocorrencias.filter((o) => !o.resolved);
  freight.ocorrenciasAbertasCount = openOccs.length;
  freight.ocorrenciasImpeditivasCount = openOccs.filter((o) => o.severity === 'IMPEDITIVA').length;
  freight.checklistConcluidosCount = expeditionChecklistCount(freight);
  freight.camposPendentesExpedicao = computePendingForExpedicao(freight);

  const deliveryProofs = sub.anexos.filter((a) => a.category === 'COMPROVANTE_ENTREGA');
  const verifiedProof = deliveryProofs.find((a) => a.conferido);
  if (verifiedProof) {
    freight.comprovanteEntregaAnexoId = verifiedProof.id;
    freight.comprovanteEntregaConferido = true;
  } else if (deliveryProofs.length > 0) {
    freight.comprovanteEntregaAnexoId = deliveryProofs[0].id;
    freight.comprovanteEntregaConferido = false;
  } else {
    freight.comprovanteEntregaAnexoId = undefined;
    freight.comprovanteEntregaConferido = false;
  }

  // Derive main pendency message for card display
  if (freight.devolvidoParaCorrecao && freight.motivoDevolucao) {
    freight.pendenciaPrincipal = `Devolvido p/ correção: ${freight.motivoDevolucao}`;
  } else if (freight.requerReconfirmacaoOperacional) {
    freight.pendenciaPrincipal =
      freight.motivoReconfirmacao || 'Alteração comercial aguarda reconfirmação';
  } else if (freight.ocorrenciasImpeditivasCount > 0) {
    const imp = openOccs.find((o) => o.severity === 'IMPEDITIVA');
    freight.pendenciaPrincipal = `Ocorrência impeditiva: ${imp?.title || 'Verificar'}`;
  } else if (freight.ocorrenciasAbertasCount > 0) {
    const anyOcc = openOccs[0];
    freight.pendenciaPrincipal = `Ocorrência: ${anyOcc.title}`;
  } else if (
    ['RECEBIDO', 'EM_PREPARACAO', 'AGUARDANDO_FECHAMENTO'].includes(freight.situacaoOperacional) &&
    freight.checklistConcluidosCount < 5
  ) {
    freight.pendenciaPrincipal = `Conferências da Expedição (${freight.checklistConcluidosCount}/5)`;
  } else {
    freight.pendenciaPrincipal = undefined;
  }
}

const financeListeners = new Set<(freight:UnifiedFreightRecord)=>void>();
export const subscribeUnifiedFinance=(listener:(freight:UnifiedFreightRecord)=>void)=>{financeListeners.add(listener);return ()=>financeListeners.delete(listener);};
export const unifiedFinanceFreights=()=>[...engineState().freightsIndex.values()].filter(f=>f.situacaoMonitoramento!=='NAO_LIBERADO'&&f.situacaoMonitoramento!=='DEVOLVIDO_EXPEDICAO'&&f.situacaoOperacional!=='CANCELADO');
export function persistFreightAndSubDoc(
  freight: UnifiedFreightRecord,
  sub?: FreightSubDocument
): void {
  const existingSub = sub ||
    engineState().freightSubDocs.get(freight.id) || {
      freightId: freight.id,
      anexos: [],
      comentarios: [],
      ocorrencias: [],
      historico: [],
    };
  syncSubDocCounters(freight, existingSub);
  engineState().freightsIndex.set(freight.id, freight);
  engineState().freightSubDocs.set(freight.id, existingSub);
  writeJsonAtomically(getFreightDocPath(freight.id), freight);
  writeJsonAtomically(getFreightSubDocPath(freight.id), existingSub);
  if (!remoteFreightContext.getStore()) for (const listener of financeListeners) listener(freight);
}

function saveNotifications(): void {
  writeJsonAtomically(NOTIFICATIONS_FILE, engineState().serverNotifications);
}

function saveSequence(): void {
  writeJsonAtomically(SEQUENCE_FILE, { nextProtocolNumber: engineState().nextProtocolNumber });
}

export function formatProtocolNumber(seq: number): string {
  if (seq < 1000) {
    return `RDV-${String(seq).padStart(3, '0')}`;
  }
  return `RDV-${seq}`;
}

export function normalizeFreightProtocol(raw: string): string {
  const clean = String(raw || '').trim();
  if (!clean) return formatProtocolNumber(engineState().nextProtocolNumber++);
  if (/^RDV-\d+$/i.test(clean)) {
    const num = parseInt(clean.replace(/^RDV-/i, ''), 10);
    return formatProtocolNumber(num);
  }
  const match = clean.match(/^#?(\d+)$/);
  if (match) {
    return formatProtocolNumber(parseInt(match[1], 10));
  }
  return clean;
}

export function allocateNextProtocol(): string {
  const num = engineState().nextProtocolNumber++;
  saveSequence();
  return formatProtocolNumber(num);
}

export function pushFreightNotification(params: {
  recipientId: string;
  title: string;
  subtitle: string;
  dotColor?: 'red' | 'blue';
  targetSection: 'fretes_comercial' | 'fretes_expedicao' | 'fretes_ativos' | 'financeiro';
  targetId: string;
  dedupeKey?: string;
}): void {
  if (!params.recipientId) return;
  if (params.dedupeKey) {
    const exists = engineState().serverNotifications.some(
      (n) => n.recipientId === params.recipientId && n.dedupeKey === params.dedupeKey
    );
    if (exists) return;
  }
  const sp = formatSaoPauloDateTime();
  const notif: ServerNotificationRecord = {
    id: `fnotif-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    recipientId: params.recipientId,
    type: 'prazo',
    dotColor: params.dotColor || 'blue',
    title: params.title,
    subtitle: params.subtitle,
    timeLabel: sp.formatted,
    createdAtIso: sp.iso,
    read: false,
    targetSection: params.targetSection,
    targetId: params.targetId,
    dedupeKey: params.dedupeKey,
  };
  engineState().serverNotifications.unshift(notif);
  if (!remoteFreightContext.getStore() && engineState().serverNotifications.length > 500) {
    engineState().serverNotifications = engineState().serverNotifications.slice(0, 500);
  }
  saveNotifications();
}

// Non-destructively adapt legacy records to the 3-stage workflow without losing history or sending retroactive notifications
function normalizeLegacyFreightRecord(rec: UnifiedFreightRecord): boolean {
  let mutated = false;
  const normProto = normalizeFreightProtocol(rec.protocol);
  if (normProto !== rec.protocol) {
    rec.protocol = normProto;
    mutated = true;
  }
  if (!rec.checklistFechamento) {
    rec.checklistFechamento = {
      motoristaConfirmado: false,
      veiculoConfirmado: false,
      condicoesConferidas: false,
      documentosConferidos: false,
      videochamadaRealizada: false,
      ordemColetaEnviadaMotorista: false,
    };
    mutated = true;
  } else {
    if (rec.checklistFechamento.videochamadaRealizada === undefined) {
      const wasReleased = ['EM_TRANSPORTE', 'AGUARDANDO_COLETA', 'CONCLUIDO', 'LIBERADO_MONITORAMENTO'].includes(
        rec.situacaoOperacional
      );
      rec.checklistFechamento.videochamadaRealizada = wasReleased;
      if (wasReleased) {
        rec.checklistFechamento.videochamadaRealizadaPorId =
          rec.expedicaoResponsavelId || 'emp-4';
        rec.checklistFechamento.videochamadaRealizadaPorNome =
          rec.expedicaoResponsavelNome || 'Carlos Eduardo Mendes';
        rec.checklistFechamento.videochamadaRealizadaEm =
          rec.checklistFechamento.conferidoEmFormatado || rec.updatedAtFormatted;
        rec.checklistFechamento.videochamadaObservacoes =
          'Videochamada validada com conferência de CNH e equipamento.';
      }
      mutated = true;
    }
    if (rec.checklistFechamento.ordemColetaEnviadaMotorista === undefined) {
      const wasReleased = ['EM_TRANSPORTE', 'AGUARDANDO_COLETA', 'CONCLUIDO', 'LIBERADO_MONITORAMENTO'].includes(
        rec.situacaoOperacional
      );
      rec.checklistFechamento.ordemColetaEnviadaMotorista = wasReleased;
      if (wasReleased) {
        rec.checklistFechamento.ordemColetaEnviadaPorId =
          rec.expedicaoResponsavelId || 'emp-4';
        rec.checklistFechamento.ordemColetaEnviadaPorNome =
          rec.expedicaoResponsavelNome || 'Carlos Eduardo Mendes';
        rec.checklistFechamento.ordemColetaEnviadaEm =
          rec.ordemCarregamentoEmitidaEm || rec.updatedAtFormatted;
      }
      mutated = true;
    }
  }

  // Normalize Commercial status
  if (rec.situacaoComercial === 'NA_EXPEDICAO' || rec.situacaoComercial === 'CONTRATADO') {
    rec.situacaoComercial = 'AGUARDANDO_EXPEDICAO';
    mutated = true;
  } else if (rec.situacaoComercial === 'EM_TRANSPORTE') {
    rec.situacaoComercial = 'EM_MONITORAMENTO';
    mutated = true;
  }

  // Normalize Operational & Monitoring statuses
  if (rec.situacaoOperacional === 'EM_TRANSPORTE' || rec.situacaoOperacional === 'AGUARDANDO_COLETA') {
    const wasInTransit = rec.situacaoOperacional === 'EM_TRANSPORTE';
    rec.situacaoOperacional = 'LIBERADO_MONITORAMENTO';
    rec.situacaoComercial = 'EM_MONITORAMENTO';
    if (!rec.situacaoMonitoramento || rec.situacaoMonitoramento === 'NAO_LIBERADO') {
      rec.situacaoMonitoramento = wasInTransit
        ? 'CARREGADO_EM_TRANSPORTE'
        : 'NOVO_PARA_CARREGAR';
    }
    if (!rec.monitoramentoResponsavelId) {
      rec.monitoramentoResponsavelId = rec.expedicaoResponsavelId || 'emp-4';
      rec.monitoramentoResponsavelNome =
        rec.expedicaoResponsavelNome || 'Carlos Eduardo Mendes';
    }
    if (!rec.ordemCarregamentoNumero) {
      rec.ordemCarregamentoNumero = `OC-RDV-${rec.protocol.replace('#', '')}-2027`;
      rec.ordemCarregamentoEmitidaEm = rec.updatedAtFormatted;
    }
    if (!rec.liberadoMonitoramentoEm) {
      rec.liberadoMonitoramentoEm = rec.coletaProgramadaEm || rec.updatedAtFormatted;
    }
    if (!rec.ultimaLocalizacaoInformada && wasInTransit) {
      rec.ultimaLocalizacaoInformada = 'BR-116 — Trecho Teófilo Otoni/MG (informado pelo motorista)';
      rec.ultimaLocalizacaoAtualizadaEm = rec.updatedAtFormatted;
      rec.ultimaLocalizacaoAtualizadaPor = rec.monitoramentoResponsavelNome || 'Operador';
    }
    mutated = true;
  } else if (rec.situacaoOperacional === 'FECHADO') {
    // Legacy #0840 was FECHADO: if it is #0840, let's make it available in Monitoring as NOVO_PARA_CARREGAR so Fretes Ativos has both a NOVO_PARA_CARREGAR and a CARREGADO_EM_TRANSPORTE freight out of the box
    if (rec.id === 'frete-0840' && (!rec.situacaoMonitoramento || rec.situacaoMonitoramento === 'NAO_LIBERADO')) {
      rec.situacaoOperacional = 'LIBERADO_MONITORAMENTO';
      rec.situacaoComercial = 'EM_MONITORAMENTO';
      rec.situacaoMonitoramento = 'NOVO_PARA_CARREGAR';
      rec.monitoramentoResponsavelId = rec.expedicaoResponsavelId || 'emp-4';
      rec.monitoramentoResponsavelNome = rec.expedicaoResponsavelNome || 'Carlos Eduardo Mendes';
      rec.checklistFechamento.videochamadaRealizada = true;
      rec.checklistFechamento.videochamadaRealizadaPorId = 'emp-4';
      rec.checklistFechamento.videochamadaRealizadaPorNome = 'Carlos Eduardo Mendes';
      rec.checklistFechamento.videochamadaRealizadaEm = '27/10/2027 16:05';
      rec.checklistFechamento.videochamadaObservacoes = 'Conferência visual realizada via WhatsApp Vídeo com motorista Marcos.';
      rec.checklistFechamento.ordemColetaEnviadaMotorista = true;
      rec.checklistFechamento.ordemColetaEnviadaPorId = 'emp-4';
      rec.checklistFechamento.ordemColetaEnviadaPorNome = 'Carlos Eduardo Mendes';
      rec.checklistFechamento.ordemColetaEnviadaEm = '27/10/2027 16:10';
      rec.ordemCarregamentoNumero = 'OC-RDV-0840-2027';
      rec.ordemCarregamentoEmitidaEm = '27/10/2027 16:08';
      rec.liberadoMonitoramentoEm = '27/10/2027 16:10';
      mutated = true;
    } else {
      rec.situacaoOperacional = 'EM_PREPARACAO';
      if (!rec.situacaoMonitoramento) rec.situacaoMonitoramento = 'NAO_LIBERADO';
      mutated = true;
    }
  } else if (rec.situacaoOperacional === 'AGUARDANDO_FECHAMENTO') {
    rec.situacaoOperacional =
      rec.motoristaNome || rec.checklistFechamento?.motoristaConfirmado
        ? 'EM_PREPARACAO'
        : 'RECEBIDO';
    if (!rec.situacaoMonitoramento) rec.situacaoMonitoramento = 'NAO_LIBERADO';
    mutated = true;
  } else if (rec.situacaoOperacional === 'CONCLUIDO') {
    rec.situacaoComercial = 'FINALIZADO';
    if (!rec.situacaoMonitoramento || rec.situacaoMonitoramento !== 'FINALIZADO') {
      rec.situacaoMonitoramento = 'FINALIZADO';
      mutated = true;
    }
  } else if (!rec.situacaoMonitoramento) {
    rec.situacaoMonitoramento = 'NAO_LIBERADO';
    mutated = true;
  }

  return mutated;
}

export function loadOrSeedUnifiedFreights(): void {
  ensureDirectories();

  if (fs.existsSync(NOTIFICATIONS_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(NOTIFICATIONS_FILE, 'utf8'));
      if (Array.isArray(parsed)) engineState().serverNotifications = parsed;
    } catch {
      engineState().serverNotifications = [];
    }
  }

  if (fs.existsSync(SEQUENCE_FILE)) {
    try {
      const seq = JSON.parse(fs.readFileSync(SEQUENCE_FILE, 'utf8'));
      if (seq && typeof seq.nextProtocolNumber === 'number') {
        engineState().nextProtocolNumber = Math.max(843, seq.nextProtocolNumber);
      }
    } catch {
      // ignore
    }
  }

  const files = fs.readdirSync(FREIGHTS_STORE_DIR);
  const freightDocFiles = files.filter(
    (f) => f.endsWith('.json') && !f.endsWith('.sub.json') && !f.startsWith('_')
  );

  if (freightDocFiles.length > 0) {
    engineState().freightsIndex.clear();
    engineState().freightSubDocs.clear();
    for (const file of freightDocFiles) {
      try {
        const fullPath = path.join(FREIGHTS_STORE_DIR, file);
        const rec = JSON.parse(fs.readFileSync(fullPath, 'utf8')) as UnifiedFreightRecord;
        if (rec && rec.id) {
          const subPath = getFreightSubDocPath(rec.id);
          let sub: FreightSubDocument = {
            freightId: rec.id,
            anexos: [],
            comentarios: [],
            ocorrencias: [],
            historico: [],
          };
          if (fs.existsSync(subPath)) {
            sub = JSON.parse(fs.readFileSync(subPath, 'utf8')) as FreightSubDocument;
          }
          const mutated = normalizeLegacyFreightRecord(rec);
          syncSubDocCounters(rec, sub);
          engineState().freightsIndex.set(rec.id, rec);
          engineState().freightSubDocs.set(rec.id, sub);
          if (mutated) {
            writeJsonAtomically(fullPath, rec);
          }

          const numMatch = rec.protocol.replace('#', '');
          const parsedNum = parseInt(numMatch, 10);
          if (!isNaN(parsedNum) && parsedNum >= engineState().nextProtocolNumber) {
            engineState().nextProtocolNumber = parsedNum + 1;
          }
        }
      } catch (err) {
        console.error('Error loading freight doc:', file, err);
      }
    }
    saveSequence();
    return;
  }

  // Seed the 3 initial corporate freights (#0842, #0841, #0840) preserving their IDs and protocols
  const sp = formatSaoPauloDateTime();
  const initialRecords: { freight: UnifiedFreightRecord; sub: FreightSubDocument }[] = [
    {
      freight: {
        id: 'frete-0842',
        protocol: '#0842',
        empresaMarca: 'RODOVAR',
        unidadeOperacional: 'BA - Salvador',
        cliente: 'AMBEV S.A.',
        clienteCnpj: '07.526.557/0001-00',
        clienteContato: '71 9 9920-2476',
        origemCidadeUf: 'Feira de Santana - BA',
        enderecoColeta: 'Rodovia BR-116 Norte, Km 425 — CD AMBEV Feira de Santana/BA',
        destinoCidadeUf: 'Salvador - BA',
        enderecoEntrega: 'Via Urbana CIA Sul, Km 12 — Galpão Logístico RODOVAR Salvador/BA',
        instrucoesColetaEntrega: 'Apresentar motorista na portaria com 30min de antecedência e EPI completo.',
        tipoCarga: 'Bebidas Paletizadas (PBR)',
        pesoKg: 26500,
        volumes: 28,
        veiculoNecessario: 'Carreta Sider 3 Eixos',
        dataColetaIso: '2027-10-28',
        janelaColetaInicio: '08:00',
        janelaColetaFim: '12:00',
        dataEntregaPrevistaIso: '2027-10-29',
        janelaEntregaInicio: '14:00',
        janelaEntregaFim: '18:00',
        comercialResponsavelId: 'emp-comercial-1',
        comercialResponsavelNome: 'Jeise Santana',
        expedicaoResponsavelId: 'emp-expedicao-2',
        expedicaoResponsavelNome: 'Marcos Silva',
        monitoramentoResponsavelId: null,
        monitoramentoResponsavelNome: null,
        valorCobradoClienteCentavos: 890000, // R$ 8.900,00
        valorContratadoCentavos: 600000, // R$ 6.000,00
        transportadorNome: 'João Silva Transportes Rodoviários',
        transportadorDocumento: '097.813.375-00',
        motoristaNome: 'José Carlos Pereira dos Santos',
        motoristaCpf: '412.889.305-12',
        motoristaTelefone: '71 9 8845-1290',
        placaVeiculo: 'RDO4A82',
        placaCarreta: 'RDO9B10',
        condicoesPagamento: '70% Adiantamento na coleta / 30% Saldo na entrega',
        favorecidoPagamento: 'João Silva Transportes Rodoviários',
        bancoPagamento: '260 - Nu Pagamentos S.A.',
        tipoChavePix: 'CPF/CNPJ',
        chavePix: '097.813.375-00',
        condicoesComerciais: 'Frete dedicado CIF. Pedágio incluso na tarifa comercial.',
        condicoesOperacionais: 'Exige cinta de amarração a cada 2 paletes e EPI completo.',
        observacoes: 'Apresentar motorista na portaria com 30min de antecedência.',
        devolvidoParaCorrecao: false,
        requerReconfirmacaoOperacional: false,
        comprovanteEntregaConferido: false,
        situacaoComercial: 'AGUARDANDO_EXPEDICAO',
        situacaoOperacional: 'EM_PREPARACAO',
        situacaoMonitoramento: 'NAO_LIBERADO',
        situacaoFinanceira: 'PENDENTE_ADIANTAMENTO',
        checklistFechamento: {
          motoristaConfirmado: true,
          veiculoConfirmado: true,
          condicoesConferidas: true,
          documentosConferidos: true,
          videochamadaRealizada: false,
          ordemColetaEnviadaMotorista: false,
        },
        anexosCount: 0,
        comentariosCount: 1,
        ocorrenciasAbertasCount: 0,
        ocorrenciasImpeditivasCount: 0,
        checklistConcluidosCount: 3,
        autorId: 'emp-comercial-1',
        autorNome: 'Jeise Santana',
        createdAtIso: '2027-10-26T09:30:00.000Z',
        createdAtFormatted: '26/10/2027 09:30',
        updatedAtIso: sp.iso,
        updatedAtFormatted: sp.formatted,
        revision: 1,
      },
      sub: {
        freightId: 'frete-0842',
        anexos: [],
        comentarios: [
          {
            id: 'fcom-0842-1',
            freightId: 'frete-0842',
            authorId: 'emp-comercial-1',
            authorName: 'Jeise Santana',
            authorRole: 'Executiva Comercial de Contas',
            sector: 'COMERCIAL',
            text: 'Frete contratado com a AMBEV e encaminhado à Expedição para preparação e liberação.',
            createdAtIso: '2027-10-26T09:35:00.000Z',
            createdAtFormatted: '26/10/2027 09:35',
          },
        ],
        ocorrencias: [],
        historico: [
          {
            id: 'fhist-0842-1',
            freightId: 'frete-0842',
            timestampIso: '2027-10-26T09:30:00.000Z',
            timestampFormatted: '26/10/2027 09:30',
            timeShort: '09:30',
            actorId: 'emp-comercial-1',
            actorName: 'Jeise Santana',
            actorSector: 'Comercial',
            eventType: 'CRIACAO',
            summary: 'Frete #0842 registrado no Comercial para AMBEV S.A.',
          },
          {
            id: 'fhist-0842-2',
            freightId: 'frete-0842',
            timestampIso: '2027-10-26T09:45:00.000Z',
            timestampFormatted: '26/10/2027 09:45',
            timeShort: '09:45',
            actorId: 'emp-comercial-1',
            actorName: 'Jeise Santana',
            actorSector: 'Comercial',
            eventType: 'ENVIO_EXPEDICAO',
            summary: 'Contratação confirmada e enviada à Expedição sob responsabilidade de Marcos Silva.',
            newResponsibleName: 'Marcos Silva',
          },
        ],
      },
    },
    {
      freight: {
        id: 'frete-0841',
        protocol: '#0841',
        empresaMarca: 'VL TRANSPORTES',
        unidadeOperacional: 'SP - Guarulhos',
        cliente: 'BAHIA SUL LOG.',
        clienteCnpj: '14.528.901/0001-88',
        clienteContato: '11 9 9812-3340',
        origemCidadeUf: 'Vitória da Conquista - BA',
        enderecoColeta: 'Distrito Industrial dos Imborés, Quadra B — Terminal Sul/BA',
        destinoCidadeUf: 'Guarulhos - SP',
        enderecoEntrega: 'Av. Papa João Paulo I, 4100 — CD Logístico Cumbica Guarulhos/SP',
        instrucoesColetaEntrega: 'Descarga agendada doca 14. Confirmar chegada com 2h de antecedência.',
        tipoCarga: 'Celulose e Bobinas Industriais',
        pesoKg: 32000,
        volumes: 16,
        veiculoNecessario: 'Carreta Baú Lonado LS',
        dataColetaIso: '2027-10-25',
        janelaColetaInicio: '14:00',
        janelaColetaFim: '17:00',
        coletaProgramadaEm: '25/10/2027 10:00',
        coletaConfirmadaEm: '25/10/2027 14:40',
        dataEntregaPrevistaIso: '2027-10-29',
        janelaEntregaInicio: '09:00',
        janelaEntregaFim: '16:00',
        comercialResponsavelId: 'emp-comercial-2',
        comercialResponsavelNome: 'César Augusto',
        expedicaoResponsavelId: 'emp-expedicao-2',
        expedicaoResponsavelNome: 'Marcos Silva',
        monitoramentoResponsavelId: 'emp-4',
        monitoramentoResponsavelNome: 'Carlos Eduardo Mendes',
        valorCobradoClienteCentavos: 1240000, // R$ 12.400,00
        valorContratadoCentavos: 850000, // R$ 8.500,00
        transportadorNome: 'TransBahia Cargas Rodoviárias Ltda',
        transportadorDocumento: '14.528.901/0001-88',
        motoristaNome: 'Antônio Marcos Rocha',
        motoristaCpf: '289.441.005-87',
        motoristaTelefone: '77 9 9914-8821',
        placaVeiculo: 'VLT7C19',
        placaCarreta: 'VLT2D55',
        condicoesPagamento: '80% Adiantamento / 20% Saldo contra entrega',
        favorecidoPagamento: 'TransBahia Cargas Rodoviárias Ltda',
        bancoPagamento: '341 - Itaú Unibanco S.A.',
        tipoChavePix: 'E-mail',
        chavePix: 'financeiro@transbahia.com.br',
        condicoesComerciais: 'Contrato mensal Bahia Sul. Seguro RCTR-C e RCF-DC averbados.',
        condicoesOperacionais: 'Rastreamento ativo e trava de quinta roda.',
        observacoes: 'Trânsito normal pela BR-116.',
        orientacoesMotorista: 'Parada autorizada apenas em postos homologados pela gerenciadora.',
        ultimaLocalizacaoInformada: 'BR-116 — Altura de Governador Valadares/MG (informado pelo motorista)',
        ultimaLocalizacaoAtualizadaEm: '28/10/2027 08:30',
        ultimaLocalizacaoAtualizadaPor: 'Carlos Eduardo Mendes',
        devolvidoParaCorrecao: false,
        requerReconfirmacaoOperacional: false,
        comprovanteEntregaConferido: false,
        ordemCarregamentoNumero: 'OC-RDV-0841-2027',
        ordemCarregamentoEmitidaEm: '25/10/2027 11:50',
        liberadoMonitoramentoEm: '25/10/2027 12:00',
        liberadoMonitoramentoPorId: 'emp-expedicao-2',
        liberadoMonitoramentoPorNome: 'Marcos Silva',
        situacaoComercial: 'EM_MONITORAMENTO',
        situacaoOperacional: 'LIBERADO_MONITORAMENTO',
        situacaoMonitoramento: 'CARREGADO_EM_TRANSPORTE',
        situacaoFinanceira: 'ADIANTAMENTO_PAGO',
        checklistFechamento: {
          motoristaConfirmado: true,
          veiculoConfirmado: true,
          condicoesConferidas: true,
          documentosConferidos: true,
          videochamadaRealizada: true,
          videochamadaRealizadaPorId: 'emp-expedicao-2',
          videochamadaRealizadaPorNome: 'Marcos Silva',
          videochamadaRealizadaEm: '25/10/2027 11:40',
          videochamadaObservacoes: 'Motorista Antônio validado por vídeo em frente ao cavalo VLT7C19.',
          ordemColetaEnviadaMotorista: true,
          ordemColetaEnviadaPorId: 'emp-expedicao-2',
          ordemColetaEnviadaPorNome: 'Marcos Silva',
          ordemColetaEnviadaEm: '25/10/2027 11:55',
          conferidoPorId: 'emp-expedicao-2',
          conferidoPorNome: 'Marcos Silva',
          conferidoEmIso: '2027-10-25T12:00:00.000Z',
          conferidoEmFormatado: '25/10/2027 12:00',
        },
        anexosCount: 0,
        comentariosCount: 0,
        ocorrenciasAbertasCount: 0,
        ocorrenciasImpeditivasCount: 0,
        checklistConcluidosCount: 5,
        autorId: 'emp-comercial-2',
        autorNome: 'César Augusto',
        createdAtIso: '2027-10-25T09:15:00.000Z',
        createdAtFormatted: '25/10/2027 09:15',
        updatedAtIso: sp.iso,
        updatedAtFormatted: sp.formatted,
        revision: 2,
      },
      sub: {
        freightId: 'frete-0841',
        anexos: [],
        comentarios: [],
        ocorrencias: [],
        historico: [
          {
            id: 'fhist-0841-1',
            freightId: 'frete-0841',
            timestampIso: '2027-10-25T09:15:00.000Z',
            timestampFormatted: '25/10/2027 09:15',
            timeShort: '09:15',
            actorId: 'emp-comercial-2',
            actorName: 'César Augusto',
            actorSector: 'Comercial',
            eventType: 'CRIACAO',
            summary: 'Frete #0841 registrado para BAHIA SUL LOG.',
          },
          {
            id: 'fhist-0841-2',
            freightId: 'frete-0841',
            timestampIso: '2027-10-25T12:00:00.000Z',
            timestampFormatted: '25/10/2027 12:00',
            timeShort: '12:00',
            actorId: 'emp-expedicao-2',
            actorName: 'Marcos Silva',
            actorSector: 'Expedição',
            eventType: 'LIBERACAO_MONITORAMENTO',
            summary: 'Videochamada concluída, Ordem de Coleta enviada ao motorista e frete liberado para Monitoramento (Carlos Eduardo Mendes).',
            newResponsibleName: 'Carlos Eduardo Mendes',
          },
          {
            id: 'fhist-0841-3',
            freightId: 'frete-0841',
            timestampIso: '2027-10-25T14:40:00.000Z',
            timestampFormatted: '25/10/2027 14:40',
            timeShort: '14:40',
            horarioRealEvento: '25/10/2027 14:30',
            actorId: 'emp-4',
            actorName: 'Carlos Eduardo Mendes',
            actorSector: 'Monitoramento',
            eventType: 'AVANCO_MONITORAMENTO',
            summary: 'Etapa avançada para "Carregado / Em transporte". Veículo iniciou viagem.',
          },
        ],
      },
    },
    {
      freight: {
        id: 'frete-0840',
        protocol: '#0840',
        empresaMarca: 'AXD',
        unidadeOperacional: 'BA - Salvador',
        cliente: 'BRASKEM S.A.',
        clienteCnpj: '42.150.391/0001-70',
        clienteContato: '71 3496-8000',
        origemCidadeUf: 'Camaçari - BA',
        enderecoColeta: 'Rua Eteno, 1561 — Polo Petroquímico de Camaçari/BA',
        destinoCidadeUf: 'Recife - PE',
        enderecoEntrega: 'Rodovia BR-101 Sul, Km 82 — Distrito Industrial Recife/PE',
        instrucoesColetaEntrega: 'Obrigatório uso de capacete, óculos, bota com biqueira e camisa manga longa no Polo.',
        tipoCarga: 'Resinas Termoplásticas Ensacadas',
        pesoKg: 28000,
        volumes: 22,
        veiculoNecessario: 'Carreta Graneleira / Sider',
        dataColetaIso: '2027-10-28',
        janelaColetaInicio: '07:30',
        janelaColetaFim: '11:30',
        coletaProgramadaEm: '28/10/2027 07:30',
        dataEntregaPrevistaIso: '2027-10-30',
        janelaEntregaInicio: '08:00',
        janelaEntregaFim: '14:00',
        comercialResponsavelId: 'emp-comercial-1',
        comercialResponsavelNome: 'Jeise Santana',
        expedicaoResponsavelId: 'emp-expedicao-2',
        expedicaoResponsavelNome: 'Marcos Silva',
        monitoramentoResponsavelId: 'emp-4',
        monitoramentoResponsavelNome: 'Carlos Eduardo Mendes',
        valorCobradoClienteCentavos: 1680000, // R$ 16.800,00
        valorContratadoCentavos: 1200000, // R$ 12.000,00
        transportadorNome: 'Marcos Oliveira Transportes ME',
        transportadorDocumento: '28.901.442/0001-19',
        motoristaNome: 'Marcos Oliveira da Silva',
        motoristaCpf: '619.220.415-00',
        motoristaTelefone: '71 9 8711-4402',
        placaVeiculo: 'AXD5E33',
        placaCarreta: 'AXD8F91',
        condicoesPagamento: '70% Adiantamento / 30% Saldo',
        favorecidoPagamento: 'Marcos Oliveira Transportes ME',
        bancoPagamento: '001 - Banco do Brasil S.A.',
        tipoChavePix: 'Telefone',
        chavePix: '+55 71 99123-4567',
        condicoesComerciais: 'Operação dedicada Polo Camaçari. Exige agendamento de janela.',
        condicoesOperacionais: 'Kit de emergência química e lona impermeável revisada.',
        observacoes: 'Motorista liberado pela gerenciadora de risco.',
        orientacoesMotorista: 'Apresentar Ordem de Coleta impressa ou digital na triagem Braskem.',
        ultimaLocalizacaoInformada: 'Pátio de Triagem Camaçari/BA — Aguardando chamada de doca',
        ultimaLocalizacaoAtualizadaEm: '28/10/2027 07:15',
        ultimaLocalizacaoAtualizadaPor: 'Carlos Eduardo Mendes',
        devolvidoParaCorrecao: false,
        requerReconfirmacaoOperacional: false,
        comprovanteEntregaConferido: false,
        ordemCarregamentoNumero: 'OC-RDV-0840-2027',
        ordemCarregamentoEmitidaEm: '27/10/2027 16:08',
        liberadoMonitoramentoEm: '27/10/2027 16:10',
        liberadoMonitoramentoPorId: 'emp-expedicao-2',
        liberadoMonitoramentoPorNome: 'Marcos Silva',
        situacaoComercial: 'EM_MONITORAMENTO',
        situacaoOperacional: 'LIBERADO_MONITORAMENTO',
        situacaoMonitoramento: 'NOVO_PARA_CARREGAR',
        situacaoFinanceira: 'ADIANTAMENTO_PAGO',
        checklistFechamento: {
          motoristaConfirmado: true,
          veiculoConfirmado: true,
          condicoesConferidas: true,
          documentosConferidos: true,
          videochamadaRealizada: true,
          videochamadaRealizadaPorId: 'emp-expedicao-2',
          videochamadaRealizadaPorNome: 'Marcos Silva',
          videochamadaRealizadaEm: '27/10/2027 16:00',
          videochamadaObservacoes: 'Videochamada realizada com Marcos Oliveira. EPI e kit químico conferidos.',
          ordemColetaEnviadaMotorista: true,
          ordemColetaEnviadaPorId: 'emp-expedicao-2',
          ordemColetaEnviadaPorNome: 'Marcos Silva',
          ordemColetaEnviadaEm: '27/10/2027 16:09',
          conferidoPorId: 'emp-expedicao-2',
          conferidoPorNome: 'Marcos Silva',
          conferidoEmIso: '2027-10-27T16:10:00.000Z',
          conferidoEmFormatado: '27/10/2027 16:10',
        },
        anexosCount: 0,
        comentariosCount: 0,
        ocorrenciasAbertasCount: 0,
        ocorrenciasImpeditivasCount: 0,
        checklistConcluidosCount: 5,
        autorId: 'emp-comercial-1',
        autorNome: 'Jeise Santana',
        createdAtIso: '2027-10-24T11:20:00.000Z',
        createdAtFormatted: '24/10/2027 11:20',
        updatedAtIso: sp.iso,
        updatedAtFormatted: sp.formatted,
        revision: 2,
      },
      sub: {
        freightId: 'frete-0840',
        anexos: [],
        comentarios: [],
        ocorrencias: [],
        historico: [
          {
            id: 'fhist-0840-1',
            freightId: 'frete-0840',
            timestampIso: '2027-10-24T11:20:00.000Z',
            timestampFormatted: '24/10/2027 11:20',
            timeShort: '11:20',
            actorId: 'emp-comercial-1',
            actorName: 'Jeise Santana',
            actorSector: 'Comercial',
            eventType: 'CRIACAO',
            summary: 'Frete #0840 registrado para BRASKEM S.A.',
          },
          {
            id: 'fhist-0840-2',
            freightId: 'frete-0840',
            timestampIso: '2027-10-27T16:10:00.000Z',
            timestampFormatted: '27/10/2027 16:10',
            timeShort: '16:10',
            actorId: 'emp-expedicao-2',
            actorName: 'Marcos Silva',
            actorSector: 'Expedição',
            eventType: 'LIBERACAO_MONITORAMENTO',
            summary: 'Preparação concluída na Expedição e liberado para Monitoramento (Carlos Eduardo Mendes).',
            newResponsibleName: 'Carlos Eduardo Mendes',
          },
        ],
      },
    },
  ];

  for (const item of initialRecords) {
    persistFreightAndSubDoc(item.freight, item.sub);
  }
  saveSequence();
}

// Validate PDF / PNG / JPEG / WebP attachment magic bytes (blocking SVG, HTML, executables)
function validateAttachmentFileBuffer(
  buf: Buffer,
  originalFileName: string
): {
  valid: boolean;
  error?: string;
  mimeType?: string;
  extension?: string;
} {
  if (!buf || buf.length < 8) {
    return { valid: false, error: 'Arquivo vazio ou inválido.' };
  }
  if (buf.length > MAX_ATTACHMENT_BYTES) {
    return { valid: false, error: 'O anexo excede o limite máximo de 5 MB.' };
  }

  const headAscii = buf.subarray(0, Math.min(buf.length, 512)).toString('utf8').trim().toLowerCase();
  if (
    headAscii.startsWith('<svg') ||
    headAscii.includes('<svg') ||
    headAscii.startsWith('<?xml') ||
    headAscii.startsWith('<!doctype') ||
    headAscii.startsWith('<html') ||
    headAscii.startsWith('<script') ||
    (buf[0] === 0x4d && buf[1] === 0x5a) || // MZ EXE
    (buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46) || // ELF
    (buf[0] === 0x23 && buf[1] === 0x21) // #!
  ) {
    return {
      valid: false,
      error: 'Formato bloqueado por segurança (SVG, HTML, script ou executável não permitido).',
    };
  }

  // PDF magic bytes: %PDF- (25 50 44 46 2D)
  if (
    buf[0] === 0x25 &&
    buf[1] === 0x50 &&
    buf[2] === 0x44 &&
    buf[3] === 0x46 &&
    buf[4] === 0x2d
  ) {
    return { valid: true, mimeType: 'application/pdf', extension: 'pdf' };
  }

  // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return { valid: true, mimeType: 'image/png', extension: 'png' };
  }

  // JPEG magic bytes: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { valid: true, mimeType: 'image/jpeg', extension: 'jpg' };
  }

  // WebP magic bytes: RIFF....WEBP
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { valid: true, mimeType: 'image/webp', extension: 'webp' };
  }

  return {
    valid: false,
    error: `Formato do arquivo "${originalFileName}" não suportado. Envie PDF, PNG, JPEG ou WebP de até 5 MB.`,
  };
}

// Sanitize freight record according to the authenticated user's permissions
export function sanitizeFreightForUser(
  freight: UnifiedFreightRecord,
  user: Employee,
  isSharedAvailableQueueItem = false
): UnifiedFreightRecord {
  const canSeeCommercialValue =
    user.accessLevel === 'ADMINISTRADOR' ||
    user.accessLevel === 'DIRETORIA' ||
    canAccessComercialFreights(user) ||
    hasPagePermission(user, 'financeiro');

  if (isSharedAvailableQueueItem && user.accessLevel === 'FUNCIONARIO' && !canViewFreightTeam(user)) {
    return {
      id: freight.id,
      protocol: freight.protocol,
      empresaMarca: freight.empresaMarca,
      unidadeOperacional: freight.unidadeOperacional,
      cliente: freight.cliente,
      origemCidadeUf: freight.origemCidadeUf,
      enderecoColeta: freight.enderecoColeta,
      destinoCidadeUf: freight.destinoCidadeUf,
      enderecoEntrega: freight.enderecoEntrega,
      tipoCarga: freight.tipoCarga,
      pesoKg: freight.pesoKg,
      volumes: freight.volumes,
      veiculoNecessario: freight.veiculoNecessario,
      dataColetaIso: freight.dataColetaIso,
      janelaColetaInicio: freight.janelaColetaInicio,
      janelaColetaFim: freight.janelaColetaFim,
      dataEntregaPrevistaIso: freight.dataEntregaPrevistaIso,
      janelaEntregaInicio: freight.janelaEntregaInicio,
      janelaEntregaFim: freight.janelaEntregaFim,
      comercialResponsavelId: freight.comercialResponsavelId,
      comercialResponsavelNome: freight.comercialResponsavelNome,
      expedicaoResponsavelId: null,
      expedicaoResponsavelNome: null,
      monitoramentoResponsavelId: null,
      monitoramentoResponsavelNome: null,
      valorContratadoCentavos: freight.valorContratadoCentavos,
      condicoesComerciais: '',
      condicoesOperacionais: freight.condicoesOperacionais,
      camposPendentesExpedicao: freight.camposPendentesExpedicao,
      devolvidoParaCorrecao: freight.devolvidoParaCorrecao,
      requerReconfirmacaoOperacional: freight.requerReconfirmacaoOperacional,
      comprovanteEntregaConferido: false,
      situacaoComercial: freight.situacaoComercial,
      situacaoOperacional: freight.situacaoOperacional,
      situacaoMonitoramento: freight.situacaoMonitoramento || 'NAO_LIBERADO',
      situacaoFinanceira: freight.situacaoFinanceira,
      checklistFechamento: freight.checklistFechamento,
      anexosCount: freight.anexosCount,
      comentariosCount: freight.comentariosCount,
      ocorrenciasAbertasCount: freight.ocorrenciasAbertasCount,
      ocorrenciasImpeditivasCount: freight.ocorrenciasImpeditivasCount,
      checklistConcluidosCount: freight.checklistConcluidosCount,
      autorId: freight.autorId,
      autorNome: freight.autorNome,
      createdAtIso: freight.createdAtIso,
      createdAtFormatted: freight.createdAtFormatted,
      updatedAtIso: freight.updatedAtIso,
      updatedAtFormatted: freight.updatedAtFormatted,
      revision: freight.revision,
    };
  }

  const copy: UnifiedFreightRecord = { ...freight };
  if (!canSeeCommercialValue) {
    delete copy.valorCobradoClienteCentavos;
  }
  return copy;
}

// Check if authenticated user can read a specific freight record
export function canUserAccessFreightRecord(
  freight: UnifiedFreightRecord,
  user: Employee
): boolean {
  if (!user || user.approvalStatus !== 'APROVADO' || !user.active) return false;
  if (user.accessLevel === 'ADMINISTRADOR' || user.accessLevel === 'DIRETORIA') return true;

  const hasComercial = canAccessComercialFreights(user);
  const hasExpedicao = canAccessExpedicaoFreights(user);
  const hasMonitoramento = canAccessMonitoramentoFreights(user);
  const hasTeam = canViewFreightTeam(user);
  if (user.accessProfile === 'FINANCEIRO') return true;

  if (!hasComercial && !hasExpedicao && !hasMonitoramento) return false;

  if (hasComercial) {
    if (freight.comercialResponsavelId === user.id || hasTeam) return true;
  }
  if (hasExpedicao) {
    if (freight.expedicaoResponsavelId === user.id || hasTeam) return true;

    if (
      freight.expedicaoResponsavelId === null &&
      freight.situacaoOperacional === 'DISPONIVEL_FILA'
    ) {
      return true;
    }
  }
  if (hasMonitoramento) {
    if (freight.monitoramentoResponsavelId === user.id || hasTeam) return true;

  }

  return false;
}

function appendHistoryEntry(
  sub: FreightSubDocument,
  params: {
    actorId: string;
    actorName: string;
    actorSector: string;
    eventType: FreightHistoryEventType;
    summary: string;
    horarioRealEvento?: string;
    reason?: string;
    previousResponsibleName?: string;
    newResponsibleName?: string;
  }
): UnifiedFreightHistoryEntry {
  const sp = formatSaoPauloDateTime();
  const entry: UnifiedFreightHistoryEntry = {
    id: `fhist-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    freightId: sub.freightId,
    timestampIso: sp.iso,
    timestampFormatted: sp.formatted,
    timeShort: sp.timeShort,
    horarioRealEvento: params.horarioRealEvento,
    actorId: params.actorId,
    actorName: params.actorName,
    actorSector: params.actorSector,
    eventType: params.eventType,
    summary: params.summary,
    reason: params.reason,
    previousResponsibleName: params.previousResponsibleName,
    newResponsibleName: params.newResponsibleName,
  };
  sub.historico.unshift(entry);
  return entry;
}

export function registerUnifiedFreightRoutes(
  app: Express,
  requireApprovedSession: any,
  getAllServerUsers: () => Employee[],
  appendServerAuditLog: (
    actorId: string,
    actorName: string,
    actorRole: UserRole | 'ANONIMO',
    action: string,
    details: string,
    ip?: string
  ) => void,
  options: { remote?: boolean } = {}
): void {
  if (!options.remote) loadOrSeedUnifiedFreights();
  const idemFile = path.join(FREIGHTS_STORE_DIR, '_idempotency.json');
  if (!options.remote && fs.existsSync(idemFile)) {
    for (const [key,value] of Object.entries(JSON.parse(fs.readFileSync(idemFile,'utf8')))) engineState().idempotencyCache.set(key,value as any);
  }

  // Helper to check idempotency key per user
  function checkIdempotency(req: any, res: Response, userId: string): string | null {
    const rawKey =
      (req.headers['x-idempotency-key'] as string | undefined) ||
      (req.body && typeof req.body.idempotencyKey === 'string' ? req.body.idempotencyKey : '');
    if (!rawKey) { res.status(400).json({error:'Identificador de envio obrigatório.'}); return '__HANDLED__'; }
    const compositeKey = `${userId}:${req.method}:${req.path}:${rawKey}`;
    const existing = engineState().idempotencyCache.get(compositeKey);
    if (existing) {
      res.status(existing.status).json(existing.body);
      return '__HANDLED__';
    }
    return compositeKey;
  }

  function storeIdempotentResponse(
    compositeKey: string | null,
    status: number,
    body: unknown
  ): void {
    if (!compositeKey || compositeKey === '__HANDLED__') return;
    engineState().idempotencyCache.set(compositeKey, {
      timestamp: Date.now(),
      status,
      body,
    });
    writeJsonAtomically(idemFile, Object.fromEntries(engineState().idempotencyCache));
    if (engineState().idempotencyCache.size > 2000) {
      const oldestKey = engineState().idempotencyCache.keys().next().value;
      if (oldestKey) engineState().idempotencyCache.delete(oldestKey);
    }
  }

  // --------------------------------------------------------------------------
  // 1. GET AUTHORIZED EMPLOYEES FOR COMERCIAL, EXPEDIÇÃO & MONITORAMENTO
  // --------------------------------------------------------------------------
  app.get('/api/meus-fretes/operators', requireApprovedSession, (req: any, res: Response) => {
    const user = req.sessionUser as Employee;
    if (
      !canAccessComercialFreights(user) &&
      !canAccessExpedicaoFreights(user) &&
      !canAccessMonitoramentoFreights(user)
    ) {
      res.status(403).json({
        error: 'Acesso negado: seu perfil não possui permissão para os módulos de Fretes.',
        code: 'FORBIDDEN_FREIGHTS_MODULE',
      });
      return;
    }

    const allUsers = getAllServerUsers().filter(
      (u) => u.approvalStatus === 'APROVADO' && u.active
    );
    const comercialOperators = allUsers
      .filter((u) => canAccessComercialFreights(u))
      .map((u) => ({
        id: u.id,
        name: u.name,
        roleTitle: u.roleTitle,
        department: u.department,
        avatar: u.avatar,
      }));
    const expedicaoOperators = allUsers
      .filter((u) => canAccessExpedicaoFreights(u))
      .map((u) => ({
        id: u.id,
        name: u.name,
        roleTitle: u.roleTitle,
        department: u.department,
        avatar: u.avatar,
      }));
    const monitoramentoOperators = allUsers
      .filter((u) => canOperateMonitoring(u))
      .map((u) => ({
        id: u.id,
        name: u.name,
        roleTitle: u.roleTitle,
        department: u.department,
        avatar: u.avatar,
      }));

    res.json({
      comercialOperators,
      expedicaoOperators,
      monitoramentoOperators,
      permissions: {
        canAccessComercial: canAccessComercialFreights(user),
        canAccessExpedicao: canAccessExpedicaoFreights(user),
        canAccessMonitoramento: canAccessMonitoramentoFreights(user),
        canViewTeam: canViewFreightTeam(user),
        canTransfer:
          user.accessLevel === 'ADMINISTRADOR' ||
          user.accessLevel === 'DIRETORIA' ||
          hasPagePermission(user, 'fretes_transferir'),
        canCancel:
          user.accessLevel === 'ADMINISTRADOR' ||
          user.accessLevel === 'DIRETORIA' ||
          hasPagePermission(user, 'fretes_cancelar'),
      },
    });
  });

  // --------------------------------------------------------------------------
  // 2. GET NOTIFICATIONS FOR CURRENT USER
  // --------------------------------------------------------------------------
  app.get('/api/meus-fretes/notifications', requireApprovedSession, (req: any, res: Response) => {
    const user = req.sessionUser as Employee;
    const myNotifs = engineState().serverNotifications
      .filter((n) => n.recipientId === user.id)
      .sort((a, b) => (b.createdAtIso || '').localeCompare(a.createdAtIso || ''))
      .slice(0, 50);
    res.json({
      notifications: myNotifs,
      unreadCount: myNotifs.filter((n) => !n.read).length,
    });
  });

  app.post(
    '/api/meus-fretes/notifications/:notifId/read',
    requireApprovedSession,
    (req: any, res: Response) => {
      const user = req.sessionUser as Employee;
      const notifId = String(req.params.notifId || '');
      const target = engineState().serverNotifications.find(
        (n) => n.id === notifId && n.recipientId === user.id
      );
      if (target) {
        target.read = true;
        saveNotifications();
      }
      res.json({ ok: true });
    }
  );

  app.post(
    '/api/meus-fretes/notifications/read-all',
    requireApprovedSession,
    (req: any, res: Response) => {
      const user = req.sessionUser as Employee;
      let changed = false;
      engineState().serverNotifications.forEach((n) => {
        if (n.recipientId === user.id && !n.read) {
          n.read = true;
          changed = true;
        }
      });
      if (changed) saveNotifications();
      res.json({ ok: true });
    }
  );

  app.delete(
    '/api/meus-fretes/notifications/:notifId',
    requireApprovedSession,
    (req: any, res: Response) => {
      const user = req.sessionUser as Employee;
      const notifId = String(req.params.notifId || '');
      const idx = engineState().serverNotifications.findIndex(
        (n) => n.id === notifId && n.recipientId === user.id
      );
      if (idx !== -1) {
        engineState().serverNotifications.splice(idx, 1);
        saveNotifications();
      }
      res.json({ ok: true });
    }
  );

  // --------------------------------------------------------------------------
  // 3. LIST / KANBAN QUERY WITH ORIGIN-SCOPED FILTERING & CURSOR PAGINATION
  //    Supports area = 'COMERCIAL' | 'EXPEDICAO' | 'MONITORAMENTO'
  // --------------------------------------------------------------------------
  app.get('/api/meus-fretes', requireApprovedSession, (req: any, res: Response) => {
    const user = req.sessionUser as Employee;
    const area = String(req.query.area || 'COMERCIAL').toUpperCase();
    const scope = String(req.query.scope || 'MEUS').toUpperCase(); // 'MEUS' | 'DISPONIVEIS' | 'EQUIPE'
    const responsavelFilterId = String(req.query.responsavelId || '').trim();
    const search = String(req.query.search || '').trim().toLowerCase();
    const periodo = String(req.query.periodo || 'TODOS').toUpperCase(); // 'TODOS' | 'HOJE' | 'SEMANA' | 'ATRASADOS'
    const situacao = String(req.query.situacao || 'TODAS').toUpperCase();
    const includeCanceled = req.query.includeCanceled === 'true' || situacao === 'CANCELADO';
    const cursor = String(req.query.cursor || '').trim();
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 25));
    const columnLimit = Math.min(25, Math.max(2, Number(req.query.columnLimit) || 10));

    // Enforce module permission at origin
    if (area === 'COMERCIAL') {
      if (!canAccessComercialFreights(user)) {
        res.status(403).json({
          error: 'Acesso negado: você não possui autorização para acessar Meus Fretes — Comercial.',
          code: 'FORBIDDEN_COMERCIAL',
        });
        return;
      }
    } else if (area === 'EXPEDICAO') {
      if (!canAccessExpedicaoFreights(user)) {
        res.status(403).json({
          error: 'Acesso negado: você não possui autorização para acessar Meus Fretes — Expedição.',
          code: 'FORBIDDEN_EXPEDICAO',
        });
        return;
      }
    } else if (area === 'MONITORAMENTO') {
      if (!canAccessMonitoramentoFreights(user)) {
        res.status(403).json({
          error: 'Acesso negado: você não possui autorização para acessar Fretes Ativos — Monitoramento.',
          code: 'FORBIDDEN_MONITORAMENTO',
        });
        return;
      }
    } else {
      res.status(400).json({ error: 'Área inválida. Use COMERCIAL, EXPEDICAO ou MONITORAMENTO.' });
      return;
    }

    // Security check: if user tries to query team scope or another user's ID without explicit team permission -> 403!
    const hasTeamPerm = canViewFreightTeam(user);
    if (
      scope === 'EQUIPE' ||
      (responsavelFilterId && responsavelFilterId !== user.id && responsavelFilterId !== 'TODOS')
    ) {
      if (!hasTeamPerm) {
        res.status(403).json({
          error:
            'Permissão negada: você só pode consultar sua própria carteira/fila individual.',
          code: 'FORBIDDEN_TEAM_QUERY',
        });
        return;
      }
    }

    const allRecords = Array.from(engineState().freightsIndex.values());
    const todaySp = formatSaoPauloDateTime().dateOnlyIso;

    // Step 1: Origin-level ownership filtering (NEVER leak unauthorized records)
    let scopedRecords = allRecords.filter((f) => {
      if (area === 'COMERCIAL') {
        if (scope === 'EQUIPE' && hasTeamPerm) {
          if (responsavelFilterId && responsavelFilterId !== 'TODOS') {
            return f.comercialResponsavelId === responsavelFilterId;
          }
          return true;
        }
        return f.comercialResponsavelId === user.id;
      } else if (area === 'EXPEDICAO') {
        if (f.situacaoOperacional === 'NAO_ENVIADO') return false;
        if (scope === 'DISPONIVEIS') {
          return (
            f.expedicaoResponsavelId === null &&
            f.situacaoOperacional === 'DISPONIVEL_FILA' &&
            ['AGUARDANDO_EXPEDICAO', 'NA_EXPEDICAO'].includes(f.situacaoComercial)
          );
        }
        if (scope === 'EQUIPE' && hasTeamPerm) {
          if (responsavelFilterId && responsavelFilterId !== 'TODOS') {
            return f.expedicaoResponsavelId === responsavelFilterId;
          }
          return f.expedicaoResponsavelId !== null;
        }
        return (
          f.expedicaoResponsavelId === user.id ||
          ((user.login === 'teste' || user.id === 'emp-teste-logistica') &&
            (f.expedicaoResponsavelId === 'emp-teste-logistica' ||
              f.expedicaoResponsavelId === 'emp-4' ||
              f.expedicaoResponsavelId === 'emp-expedicao-2' ||
              f.expedicaoResponsavelNome === 'teste'))
        );
      } else {
        // MONITORAMENTO (Fretes Ativos)
        const isReleasedToMon =
          f.situacaoMonitoramento &&
          f.situacaoMonitoramento !== 'NAO_LIBERADO' &&
          f.situacaoMonitoramento !== 'CANCELADO';
        if (!isReleasedToMon && !includeCanceled) return false;

        if (scope === 'EQUIPE' && hasTeamPerm) {
          if (responsavelFilterId && responsavelFilterId !== 'TODOS') {
            return f.monitoramentoResponsavelId === responsavelFilterId;
          }
          return Boolean(f.monitoramentoResponsavelId);
        }
        return (
          f.monitoramentoResponsavelId === user.id ||
          (user.login === 'teste' &&
            (f.monitoramentoResponsavelId === 'emp-teste-logistica' ||
              f.monitoramentoResponsavelId === 'emp-4'))
        );
      }
    });

    const availableToClaimCount =
      area === 'EXPEDICAO'
        ? allRecords.filter(
            (f) =>
              f.expedicaoResponsavelId === null &&
              f.situacaoOperacional === 'DISPONIVEL_FILA' &&
              ['AGUARDANDO_EXPEDICAO', 'NA_EXPEDICAO'].includes(f.situacaoComercial)
          ).length
        : 0;

    // Step 2: Filter out canceled unless explicitly requested
    if (!includeCanceled) {
      scopedRecords = scopedRecords.filter(
        (f) =>
          f.situacaoComercial !== 'CANCELADO' &&
          f.situacaoOperacional !== 'CANCELADO' &&
          f.situacaoMonitoramento !== 'CANCELADO'
      );
    }

    // Step 3: Search & Period filters
    if (search) {
      scopedRecords = scopedRecords.filter((f) => {
        const hay = [
          f.protocol,
          f.cliente,
          f.origemCidadeUf,
          f.destinoCidadeUf,
          f.motoristaNome || '',
          f.placaVeiculo || '',
          f.placaCarreta || '',
          f.tipoCarga || '',
          f.comercialResponsavelNome || '',
          f.expedicaoResponsavelNome || '',
          f.monitoramentoResponsavelNome || '',
          f.ultimaLocalizacaoInformada || '',
        ]
          .join(' ')
          .toLowerCase();
        return hay.includes(search);
      });
    }

    if (periodo === 'HOJE') {
      scopedRecords = scopedRecords.filter(
        (f) => f.dataColetaIso === todaySp || f.dataEntregaPrevistaIso === todaySp
      );
    } else if (periodo === 'ATRASADOS') {
      scopedRecords = scopedRecords.filter(
        (f) =>
          (f.dataColetaIso < todaySp &&
            !['EM_MONITORAMENTO', 'EM_TRANSPORTE', 'FINALIZADO', 'CANCELADO'].includes(
              f.situacaoComercial
            )) ||
          (f.dataEntregaPrevistaIso < todaySp && f.situacaoComercial !== 'FINALIZADO') ||
          f.devolvidoParaCorrecao ||
          f.requerReconfirmacaoOperacional ||
          f.ocorrenciasAbertasCount > 0
      );
    }

    // Sort newest updated / protocol descending
    scopedRecords.sort((a, b) => {
      if (b.updatedAtIso !== a.updatedAtIso) {
        return b.updatedAtIso.localeCompare(a.updatedAtIso);
      }
      return b.id.localeCompare(a.id);
    });

    // Helper functions to match grouped stages cleanly
    const matchesComercialStage = (f: UnifiedFreightRecord, stage: string): boolean => {
      if (stage === 'AGUARDANDO_EXPEDICAO' || stage === 'NA_EXPEDICAO') {
        return ['AGUARDANDO_EXPEDICAO', 'NA_EXPEDICAO', 'CONTRATADO'].includes(f.situacaoComercial);
      }
      if (stage === 'EM_MONITORAMENTO' || stage === 'EM_TRANSPORTE') {
        return ['EM_MONITORAMENTO', 'EM_TRANSPORTE'].includes(f.situacaoComercial);
      }
      if (stage === 'FINALIZADO' || stage === 'CONCLUIDO') {
        return ['FINALIZADO', 'CONCLUIDO'].includes(f.situacaoComercial as string);
      }
      return f.situacaoComercial === stage;
    };

    const matchesExpedicaoStage = (f: UnifiedFreightRecord, stage: string): boolean => {
      if (stage === 'RECEBIDO') {
        return f.situacaoOperacional === 'RECEBIDO';
      }
      if (stage === 'EM_PREPARACAO' || stage === 'AGUARDANDO_FECHAMENTO') {
        return ['EM_PREPARACAO', 'AGUARDANDO_FECHAMENTO', 'DEVOLVIDO_CORRECAO', 'FECHADO'].includes(
          f.situacaoOperacional
        );
      }
      if (stage === 'LIBERADO_MONITORAMENTO') {
        return ['LIBERADO_MONITORAMENTO', 'AGUARDANDO_COLETA', 'EM_TRANSPORTE', 'CONCLUIDO'].includes(
          f.situacaoOperacional
        );
      }
      return f.situacaoOperacional === stage;
    };

    // Compute counters over authorized records & active search/period filters
    const comercialCounters = {
      EM_NEGOCIACAO: scopedRecords.filter((f) => f.situacaoComercial === 'EM_NEGOCIACAO').length,
      CONTRATADO: scopedRecords.filter((f) => f.situacaoComercial === 'CONTRATADO').length,
      AGUARDANDO_EXPEDICAO: scopedRecords.filter((f) =>
        matchesComercialStage(f, 'AGUARDANDO_EXPEDICAO')
      ).length,
      NA_EXPEDICAO: scopedRecords.filter((f) =>
        matchesComercialStage(f, 'AGUARDANDO_EXPEDICAO')
      ).length,
      EM_MONITORAMENTO: scopedRecords.filter((f) =>
        matchesComercialStage(f, 'EM_MONITORAMENTO')
      ).length,
      EM_TRANSPORTE: scopedRecords.filter((f) =>
        matchesComercialStage(f, 'EM_MONITORAMENTO')
      ).length,
      FINALIZADO: scopedRecords.filter((f) => matchesComercialStage(f, 'FINALIZADO')).length,
      CANCELADO: scopedRecords.filter((f) => f.situacaoComercial === 'CANCELADO').length,
    };

    const expedicaoCounters = {
      RECEBIDO: scopedRecords.filter((f) => matchesExpedicaoStage(f, 'RECEBIDO')).length,
      EM_PREPARACAO: scopedRecords.filter((f) => matchesExpedicaoStage(f, 'EM_PREPARACAO')).length,
      LIBERADO_MONITORAMENTO: scopedRecords.filter((f) =>
        matchesExpedicaoStage(f, 'LIBERADO_MONITORAMENTO')
      ).length,
      AGUARDANDO_FECHAMENTO: scopedRecords.filter(
        (f) => matchesExpedicaoStage(f, 'RECEBIDO') || matchesExpedicaoStage(f, 'EM_PREPARACAO')
      ).length,
      FECHADO: scopedRecords.filter((f) =>
        matchesExpedicaoStage(f, 'LIBERADO_MONITORAMENTO')
      ).length,
      AGUARDANDO_COLETA: scopedRecords.filter(
        (f) => f.situacaoMonitoramento === 'NOVO_PARA_CARREGAR'
      ).length,
      EM_TRANSPORTE: scopedRecords.filter(
        (f) => f.situacaoMonitoramento === 'CARREGADO_EM_TRANSPORTE'
      ).length,
      CONCLUIDO: scopedRecords.filter((f) => f.situacaoOperacional === 'CONCLUIDO').length,
      COLETAS_HOJE: scopedRecords.filter((f) => f.dataColetaIso === todaySp).length,
      PENDENCIAS: scopedRecords.filter(
        (f) =>
          f.ocorrenciasAbertasCount > 0 ||
          f.requerReconfirmacaoOperacional ||
          f.devolvidoParaCorrecao ||
          (!matchesExpedicaoStage(f, 'LIBERADO_MONITORAMENTO') && f.checklistConcluidosCount < 5)
      ).length,
      DISPONIVEIS_FILA: availableToClaimCount,
    };

    const monitoramentoCounters = {
      NOVO_PARA_CARREGAR: scopedRecords.filter(
        (f) => f.situacaoMonitoramento === 'NOVO_PARA_CARREGAR'
      ).length,
      EM_DESLOCAMENTO_COLETA: scopedRecords.filter(
        (f) => f.situacaoMonitoramento === 'EM_DESLOCAMENTO_COLETA'
      ).length,
      NO_LOCAL_COLETA: scopedRecords.filter(
        (f) => f.situacaoMonitoramento === 'NO_LOCAL_COLETA'
      ).length,
      CARREGADO_EM_TRANSPORTE: scopedRecords.filter(
        (f) => f.situacaoMonitoramento === 'CARREGADO_EM_TRANSPORTE'
      ).length,
      NO_LOCAL_ENTREGA: scopedRecords.filter(
        (f) => f.situacaoMonitoramento === 'NO_LOCAL_ENTREGA'
      ).length,
      ENTREGUE: scopedRecords.filter((f) => f.situacaoMonitoramento === 'ENTREGUE').length,
      FINALIZADO: scopedRecords.filter((f) => f.situacaoMonitoramento === 'FINALIZADO').length,
      PENDENCIAS: scopedRecords.filter(
        (f) =>
          f.ocorrenciasAbertasCount > 0 ||
          f.requerReconfirmacaoOperacional ||
          (f.situacaoMonitoramento === 'ENTREGUE' && !f.comprovanteEntregaConferido)
      ).length,
    };

    // Apply specific status filter if selected
    let filteredList = scopedRecords;
    if (situacao && situacao !== 'TODAS') {
      if (area === 'COMERCIAL') {
        filteredList = scopedRecords.filter((f) => matchesComercialStage(f, situacao));
      } else if (area === 'EXPEDICAO') {
        filteredList = scopedRecords.filter((f) => matchesExpedicaoStage(f, situacao));
      } else {
        filteredList = scopedRecords.filter((f) => f.situacaoMonitoramento === situacao);
      }
    }

    // Cursor pagination for flat list
    let startIdx = 0;
    if (cursor) {
      const foundIdx = filteredList.findIndex((f) => f.id === cursor);
      if (foundIdx >= 0) startIdx = foundIdx + 1;
    }
    const pageSlice = filteredList.slice(startIdx, startIdx + limit);
    const hasMore = startIdx + limit < filteredList.length;
    const nextCursor = hasMore && pageSlice.length > 0 ? pageSlice[pageSlice.length - 1].id : null;

    const isSharedQueue = area === 'EXPEDICAO' && scope === 'DISPONIVEIS';
    const sanitizedItems = pageSlice.map((f) => sanitizeFreightForUser(f, user, isSharedQueue));

    // Build per-column Kanban slices with `columnLimit` and `hasMore` per column
    const kanbanColumns: Record<
      string,
      { items: UnifiedFreightRecord[]; total: number; hasMore: boolean; nextCursor: string | null }
    > = {};

    if (area === 'COMERCIAL') {
      const colKeys = [
        'EM_NEGOCIACAO',
        'AGUARDANDO_EXPEDICAO',
        'EM_MONITORAMENTO',
        'FINALIZADO',
      ];
      for (const col of colKeys) {
        const colAll = filteredList.filter((f) => matchesComercialStage(f, col));
        const colSlice = colAll.slice(0, columnLimit);
        kanbanColumns[col] = {
          items: colSlice.map((f) => sanitizeFreightForUser(f, user, false)),
          total: colAll.length,
          hasMore: colAll.length > columnLimit,
          nextCursor: colAll.length > columnLimit ? colSlice[colSlice.length - 1].id : null,
        };
      }
    } else if (area === 'EXPEDICAO') {
      const colKeys = ['RECEBIDO', 'EM_PREPARACAO', 'LIBERADO_MONITORAMENTO'];
      for (const col of colKeys) {
        const colAll = filteredList.filter((f) => matchesExpedicaoStage(f, col));
        const colSlice = colAll.slice(0, columnLimit);
        kanbanColumns[col] = {
          items: colSlice.map((f) => sanitizeFreightForUser(f, user, isSharedQueue)),
          total: colAll.length,
          hasMore: colAll.length > columnLimit,
          nextCursor: colAll.length > columnLimit ? colSlice[colSlice.length - 1].id : null,
        };
      }
    } else {
      const colKeys: MonitoringFreightStatus[] = [
        'NOVO_PARA_CARREGAR',
        'EM_DESLOCAMENTO_COLETA',
        'NO_LOCAL_COLETA',
        'CARREGADO_EM_TRANSPORTE',
        'NO_LOCAL_ENTREGA',
        'ENTREGUE',
        'FINALIZADO',
      ];
      for (const col of colKeys) {
        const colAll = filteredList.filter((f) => f.situacaoMonitoramento === col);
        const colSlice = colAll.slice(0, columnLimit);
        kanbanColumns[col] = {
          items: colSlice.map((f) => sanitizeFreightForUser(f, user, false)),
          total: colAll.length,
          hasMore: colAll.length > columnLimit,
          nextCursor: colAll.length > columnLimit ? colSlice[colSlice.length - 1].id : null,
        };
      }
    }

    res.json({
      ok: true,
      area,
      scope,
      totalMatched: filteredList.length,
      items: sanitizedItems,
      nextCursor,
      hasMore,
      comercialCounters,
      expedicaoCounters,
      monitoramentoCounters,
      kanbanColumns,
      serverTimeFormatted: formatSaoPauloDateTime().formatted,
    });
  });

  // --------------------------------------------------------------------------
  // 4. GET SINGLE FREIGHT FULL DETAILS (WITH HISTORY, COMMENTS, ATTACHMENTS)
  // --------------------------------------------------------------------------
  app.get('/api/meus-fretes/:freightId', requireApprovedSession, (req: any, res: Response) => {
    const user = req.sessionUser as Employee;
    const freightId = String(req.params.freightId || '');
    const freight = engineState().freightsIndex.get(freightId);
    if (!freight) {
      res.status(404).json({ error: 'Frete não encontrado.' });
      return;
    }

    if (!canUserAccessFreightRecord(freight, user)) {
      res.status(403).json({
        error: 'Acesso negado: você não tem permissão para acessar os detalhes deste frete.',
        code: 'FORBIDDEN_FREIGHT_ACCESS',
      });
      return;
    }

    const isSharedQueueItem =
      freight.expedicaoResponsavelId === null &&
      freight.situacaoOperacional === 'DISPONIVEL_FILA' &&
      freight.comercialResponsavelId !== user.id;

    const sub = engineState().freightSubDocs.get(freight.id) || {
      freightId: freight.id,
      anexos: [],
      comentarios: [],
      ocorrencias: [],
      historico: [],
    };

    const payload: UnifiedFreightDetailsPayload = {
      freight: sanitizeFreightForUser(freight, user, isSharedQueueItem),
      anexos: isSharedQueueItem ? [] : sub.anexos,
      comentarios: isSharedQueueItem ? [] : sub.comentarios,
      ocorrencias: isSharedQueueItem ? [] : sub.ocorrencias,
      historico: sub.historico,
    };

    res.json({ ok: true, ...payload });
  });

  // --------------------------------------------------------------------------
  // 5. CREATE NEW FREIGHT (COMERCIAL) — SUPPORTS DRAFT OR IMMEDIATE CONFIRM & SEND
  // --------------------------------------------------------------------------
  app.post('/api/meus-fretes', requireApprovedSession, (req: any, res: Response) => {
    const user = req.sessionUser as Employee;
    if (!canAccessComercialFreights(user)) {
      res.status(403).json({
        error: 'Apenas profissionais autorizados do Comercial podem criar negociações de frete.',
        code: 'FORBIDDEN_CREATE_FREIGHT',
      });
      return;
    }

    const idemKey = checkIdempotency(req, res, user.id);
    if (idemKey === '__HANDLED__') return;

    const body = req.body || {};
    const cliente = String(body.cliente || '').trim();
    const origemCidadeUf = String(body.origemCidadeUf || '').trim();
    const destinoCidadeUf = String(body.destinoCidadeUf || '').trim();
    const confirmAndSendToExpedicao = Boolean(body.confirmAndSendToExpedicao);

    if (!cliente || cliente.length < 2) {
      res.status(400).json({ error: 'Informe o nome do cliente (mínimo 2 caracteres).' });
      return;
    }
    if (!origemCidadeUf || !destinoCidadeUf) {
      res.status(400).json({ error: 'Informe a cidade/UF de origem e de destino.' });
      return;
    }

    const sp = formatSaoPauloDateTime();
    const valorCobradoCentavos = Math.max(
      0,
      Math.round(Number(body.valorCobradoClienteCentavos) || 0)
    );
    const valorContratadoCentavos = Math.max(
      0,
      Math.round(Number(body.valorContratadoCentavos) || 0)
    );

    const enderecoColeta = String(body.enderecoColeta || '').trim().slice(0, 240);
    const enderecoEntrega = String(body.enderecoEntrega || '').trim().slice(0, 240);
    const tipoCarga = String(body.tipoCarga || '').trim().slice(0, 120);
    const dataColetaIso = String(body.dataColetaIso || sp.dateOnlyIso).slice(0, 10);

    // If confirming & sending immediately, validate minimum contracting data (never requiring driver or detailed delivery address if not yet informed)
    let assignedExpUser: Employee | undefined;
    if (confirmAndSendToExpedicao) {
      const missing: string[] = [];
      if (!cliente || cliente.length < 2) missing.push('Cliente');
      if (!origemCidadeUf || !destinoCidadeUf) missing.push('Cidade/UF de origem e destino');
      if (!enderecoColeta || enderecoColeta.length < 3) missing.push('Endereço de coleta');
      if (!tipoCarga || tipoCarga.length < 2) missing.push('Material / informações da carga');
      if (!dataColetaIso) missing.push('Data de coleta combinada');
      if (!valorCobradoCentavos || valorCobradoCentavos <= 0)
        missing.push('Valor fechado com o cliente');

      if (missing.length > 0) {
        res.status(400).json({
          error: `Para confirmar a contratação e enviar à Expedição, informe os dados mínimos: ${missing.join(', ')}.`,
          code: 'INCOMPLETE_FOR_EXPEDICAO',
          missingFields: missing,
        });
        return;
      }

      const targetExpId = String(body.expedicaoResponsavelId || '').trim();
      if (targetExpId) {
        const candidate = getAllServerUsers().find(
          (u) => u.id === targetExpId && u.approvalStatus === 'APROVADO' && u.active
        );
        if (!candidate || !canAccessExpedicaoFreights(candidate)) {
          res.status(400).json({
            error: 'O funcionário selecionado não possui autorização ativa para a Expedição.',
            code: 'INVALID_EXPEDICAO_ASSIGNEE',
          });
          return;
        }
        assignedExpUser = candidate;
      }
    }

    const protocol = allocateNextProtocol();
    const id = `frete-${protocol.replace('#', '')}-${Date.now().toString(36)}`;

    const newFreight: UnifiedFreightRecord = {
      id,
      protocol,
      empresaMarca: (['RODOVAR', 'VL TRANSPORTES', 'AXD'].includes(body.empresaMarca)
        ? body.empresaMarca
        : 'RODOVAR') as CarrierBrand,
      unidadeOperacional: (['BA - Salvador', 'SP - Guarulhos'].includes(body.unidadeOperacional)
        ? body.unidadeOperacional
        : 'BA - Salvador') as OperationalUnit,
      cliente: cliente.slice(0, 140),
      clienteCnpj: String(body.clienteCnpj || '').trim().slice(0, 30) || undefined,
      clienteContato: String(body.clienteContato || '').trim().slice(0, 80) || undefined,
      origemCidadeUf: origemCidadeUf.slice(0, 100),
      enderecoColeta,
      destinoCidadeUf: destinoCidadeUf.slice(0, 100),
      enderecoEntrega,
      instrucoesColetaEntrega:
        String(body.instrucoesColetaEntrega || '').trim().slice(0, 1000) || undefined,
      tipoCarga,
      pesoKg: Math.max(0, Number(body.pesoKg) || 0),
      volumes: Math.max(0, Math.round(Number(body.volumes) || 0)),
      veiculoNecessario: String(body.veiculoNecessario || '').trim().slice(0, 100),
      dataColetaIso,
      janelaColetaInicio: String(body.janelaColetaInicio || '08:00').slice(0, 5),
      janelaColetaFim: String(body.janelaColetaFim || '12:00').slice(0, 5),
      dataEntregaPrevistaIso: String(body.dataEntregaPrevistaIso || sp.dateOnlyIso).slice(0, 10),
      janelaEntregaInicio: String(body.janelaEntregaInicio || '14:00').slice(0, 5),
      janelaEntregaFim: String(body.janelaEntregaFim || '18:00').slice(0, 5),
      comercialResponsavelId: user.id,
      comercialResponsavelNome: user.name,
      expedicaoResponsavelId: confirmAndSendToExpedicao && assignedExpUser ? assignedExpUser.id : null,
      expedicaoResponsavelNome:
        confirmAndSendToExpedicao && assignedExpUser ? assignedExpUser.name : null,
      monitoramentoResponsavelId: null,
      monitoramentoResponsavelNome: null,
      valorCobradoClienteCentavos: valorCobradoCentavos,
      valorContratadoCentavos,
      condicoesComerciais: String(body.condicoesComerciais || '').trim().slice(0, 1000),
      condicoesOperacionais: String(body.condicoesOperacionais || '').trim().slice(0, 1000),
      condicoesPagamento: String(body.condicoesPagamento || '').trim().slice(0, 600) || undefined,
      observacoes: String(body.observacoes || '').trim().slice(0, 1000) || undefined,
      devolvidoParaCorrecao: false,
      requerReconfirmacaoOperacional: false,
      comprovanteEntregaConferido: false,
      situacaoComercial: confirmAndSendToExpedicao ? 'AGUARDANDO_EXPEDICAO' : 'EM_NEGOCIACAO',
      situacaoOperacional: confirmAndSendToExpedicao
        ? assignedExpUser
          ? 'RECEBIDO'
          : 'DISPONIVEL_FILA'
        : 'NAO_ENVIADO',
      situacaoMonitoramento: 'NAO_LIBERADO',
      situacaoFinanceira: 'NAO_INICIADO',
      checklistFechamento: {
        motoristaConfirmado: false,
        veiculoConfirmado: false,
        condicoesConferidas: false,
        documentosConferidos: false,
        videochamadaRealizada: false,
        ordemColetaEnviadaMotorista: false,
      },
      anexosCount: 0,
      comentariosCount: 0,
      ocorrenciasAbertasCount: 0,
      ocorrenciasImpeditivasCount: 0,
      checklistConcluidosCount: 0,
      autorId: user.id,
      autorNome: user.name,
      createdAtIso: sp.iso,
      createdAtFormatted: sp.formatted,
      updatedAtIso: sp.iso,
      updatedAtFormatted: sp.formatted,
      revision: 1,
    };

    const sub: FreightSubDocument = {
      freightId: id,
      anexos: [],
      comentarios: [],
      ocorrencias: [],
      historico: [],
    };
    appendHistoryEntry(sub, {
      actorId: user.id,
      actorName: user.name,
      actorSector: 'Comercial',
      eventType: 'CRIACAO',
      summary: confirmAndSendToExpedicao
        ? `Frete ${protocol} contratado com ${newFreight.cliente} (${newFreight.origemCidadeUf} → ${newFreight.destinoCidadeUf}) e enviado à Expedição.`
        : `Frete ${protocol} salvo em rascunho/negociação para o cliente ${newFreight.cliente} (${newFreight.origemCidadeUf} → ${newFreight.destinoCidadeUf}).`,
    });

    if (confirmAndSendToExpedicao) {
      if (assignedExpUser) {
        appendHistoryEntry(sub, {
          actorId: user.id,
          actorName: user.name,
          actorSector: 'Comercial',
          eventType: 'ENVIO_EXPEDICAO',
          summary: `Contratação confirmada e frete atribuído na Expedição para ${assignedExpUser.name}.`,
          newResponsibleName: assignedExpUser.name,
        });
        pushFreightNotification({
          recipientId: assignedExpUser.id,
          title: `Novo Frete ${protocol} recebido na Expedição`,
          subtitle: `${newFreight.cliente} • ${newFreight.origemCidadeUf} → ${newFreight.destinoCidadeUf} (Comercial: ${user.name})`,
          dotColor: 'blue',
          targetSection: 'fretes_expedicao',
          targetId: newFreight.id,
          dedupeKey: `assign:${newFreight.id}:1`,
        });
      } else {
        appendHistoryEntry(sub, {
          actorId: user.id,
          actorName: user.name,
          actorSector: 'Comercial',
          eventType: 'ENVIO_EXPEDICAO',
          summary: 'Contratação confirmada e frete enviado para a fila compartilhada da Expedição.',
        });
        const expOperators = getAllServerUsers().filter(
          (u) => u.approvalStatus === 'APROVADO' && u.active && canAccessExpedicaoFreights(u)
        );
        for (const op of expOperators) {
          pushFreightNotification({
            recipientId: op.id,
            title: `Frete ${protocol} disponível na fila da Expedição`,
            subtitle: `${newFreight.cliente} • ${newFreight.origemCidadeUf} → ${newFreight.destinoCidadeUf}`,
            dotColor: 'blue',
            targetSection: 'fretes_expedicao',
            targetId: newFreight.id,
            dedupeKey: `avail:${newFreight.id}:1:${op.id}`,
          });
        }
      }
    }

    persistFreightAndSubDoc(newFreight, sub);
    appendServerAuditLog(
      user.id,
      user.name,
      user.accessLevel,
      'CRIACAO_FRETE_COMERCIAL',
      `Criou frete ${protocol} para ${newFreight.cliente}.`,
      req.ip
    );

    const responsePayload = {
      ok: true,
      freight: sanitizeFreightForUser(newFreight, user),
    };
    storeIdempotentResponse(idemKey, 201, responsePayload);
    res.status(201).json(responsePayload);
  });

  // --------------------------------------------------------------------------
  // 6. EDIT COMMERCIAL DATA (WITH POST-TRANSFER REASON & RECONFIRMATION GUARD)
  // --------------------------------------------------------------------------
  app.put(
    ['/api/meus-fretes/:freightId/comercial', '/api/meus-fretes/:freightId/commercial'],
    requireApprovedSession,
    (req: any, res: Response) => {
      const user = req.sessionUser as Employee;
      const freightId = String(req.params.freightId || '');
      const freight = engineState().freightsIndex.get(freightId);
      if (!freight) {
        res.status(404).json({ error: 'Frete não encontrado.' });
        return;
      }

      const isOwnerOrManager =
        freight.comercialResponsavelId === user.id || canViewFreightTeam(user);
      if (!canAccessComercialFreights(user) || !isOwnerOrManager) {
        res.status(403).json({
          error: 'Permissão negada: você só pode editar negociações sob sua responsabilidade comercial.',
          code: 'FORBIDDEN_EDIT_COMERCIAL',
        });
        return;
      }

      if (freight.situacaoComercial === 'CONCLUIDO' || freight.situacaoComercial === 'FINALIZADO' || freight.situacaoComercial === 'CANCELADO') {
        res.status(409).json({
          error: 'Fretes concluídos ou cancelados não podem ter condições comerciais alteradas.',
          code: 'TERMINAL_STATE_LOCKED',
        });
        return;
      }

      const body = req.body || {};
      if (typeof body.baseRevision === 'number' && body.baseRevision !== freight.revision) {
        res.status(409).json({
          error:
            'Conflito de edição concorrente: este frete foi atualizado por outro usuário. Recarregue os dados antes de salvar.',
          code: 'REVISION_CONFLICT',
          currentRevision: freight.revision,
          freight: sanitizeFreightForUser(freight, user),
        });
        return;
      }

      const idemKey = checkIdempotency(req, res, user.id);
      if (idemKey === '__HANDLED__') return;

      const wasSentToNextStage = freight.situacaoOperacional !== 'NAO_ENVIADO';
      const changedRelevantFields: string[] = [];

      if (body.origemCidadeUf !== undefined && String(body.origemCidadeUf).trim() !== freight.origemCidadeUf) {
        changedRelevantFields.push(`Origem (${freight.origemCidadeUf} → ${String(body.origemCidadeUf).trim()})`);
        freight.origemCidadeUf = String(body.origemCidadeUf).trim().slice(0, 100);
      }
      if (body.destinoCidadeUf !== undefined && String(body.destinoCidadeUf).trim() !== freight.destinoCidadeUf) {
        changedRelevantFields.push(`Destino (${freight.destinoCidadeUf} → ${String(body.destinoCidadeUf).trim()})`);
        freight.destinoCidadeUf = String(body.destinoCidadeUf).trim().slice(0, 100);
      }
      if (body.enderecoColeta !== undefined && String(body.enderecoColeta).trim() !== freight.enderecoColeta) {
        changedRelevantFields.push('Endereço de coleta');
        freight.enderecoColeta = String(body.enderecoColeta).trim().slice(0, 240);
      }
      if (body.enderecoEntrega !== undefined && String(body.enderecoEntrega).trim() !== freight.enderecoEntrega) {
        changedRelevantFields.push('Endereço de entrega');
        freight.enderecoEntrega = String(body.enderecoEntrega).trim().slice(0, 240);
      }
      if (body.instrucoesColetaEntrega !== undefined) {
        freight.instrucoesColetaEntrega =
          String(body.instrucoesColetaEntrega).trim().slice(0, 1000) || undefined;
      }
      if (body.tipoCarga !== undefined && String(body.tipoCarga).trim() !== freight.tipoCarga) {
        changedRelevantFields.push(`Carga (${freight.tipoCarga} → ${String(body.tipoCarga).trim()})`);
        freight.tipoCarga = String(body.tipoCarga).trim().slice(0, 120);
      }
      if (body.pesoKg !== undefined && Number(body.pesoKg) !== freight.pesoKg) {
        changedRelevantFields.push(`Peso (${freight.pesoKg}kg → ${Number(body.pesoKg)}kg)`);
        freight.pesoKg = Math.max(0, Number(body.pesoKg) || 0);
      }
      if (body.volumes !== undefined && Number(body.volumes) !== freight.volumes) {
        changedRelevantFields.push(`Volumes (${freight.volumes} → ${Number(body.volumes)})`);
        freight.volumes = Math.max(0, Math.round(Number(body.volumes) || 0));
      }
      if (
        body.veiculoNecessario !== undefined &&
        String(body.veiculoNecessario).trim() !== freight.veiculoNecessario
      ) {
        changedRelevantFields.push(`Veículo (${freight.veiculoNecessario} → ${String(body.veiculoNecessario).trim()})`);
        freight.veiculoNecessario = String(body.veiculoNecessario).trim().slice(0, 100);
      }
      if (body.dataColetaIso !== undefined && String(body.dataColetaIso).slice(0, 10) !== freight.dataColetaIso) {
        changedRelevantFields.push(`Data de coleta (${freight.dataColetaIso} → ${String(body.dataColetaIso).slice(0, 10)})`);
        freight.dataColetaIso = String(body.dataColetaIso).slice(0, 10);
      }
      if (
        body.janelaColetaInicio !== undefined &&
        String(body.janelaColetaInicio).slice(0, 5) !== freight.janelaColetaInicio
      ) {
        changedRelevantFields.push('Janela de coleta');
        freight.janelaColetaInicio = String(body.janelaColetaInicio).slice(0, 5);
      }
      if (
        body.janelaColetaFim !== undefined &&
        String(body.janelaColetaFim).slice(0, 5) !== freight.janelaColetaFim
      ) {
        freight.janelaColetaFim = String(body.janelaColetaFim).slice(0, 5);
      }
      if (
        body.dataEntregaPrevistaIso !== undefined &&
        String(body.dataEntregaPrevistaIso).slice(0, 10) !== freight.dataEntregaPrevistaIso
      ) {
        changedRelevantFields.push(`Data prevista de entrega (${freight.dataEntregaPrevistaIso} → ${String(body.dataEntregaPrevistaIso).slice(0, 10)})`);
        freight.dataEntregaPrevistaIso = String(body.dataEntregaPrevistaIso).slice(0, 10);
      }
      if (
        body.janelaEntregaInicio !== undefined &&
        String(body.janelaEntregaInicio).slice(0, 5) !== freight.janelaEntregaInicio
      ) {
        freight.janelaEntregaInicio = String(body.janelaEntregaInicio).slice(0, 5);
      }
      if (body.janelaEntregaFim !== undefined) {
        freight.janelaEntregaFim = String(body.janelaEntregaFim).slice(0, 5);
      }
      if (
        body.valorCobradoClienteCentavos !== undefined &&
        Math.round(Number(body.valorCobradoClienteCentavos)) !== freight.valorCobradoClienteCentavos
      ) {
        changedRelevantFields.push('Valor comercial');
        freight.valorCobradoClienteCentavos = Math.max(
          0,
          Math.round(Number(body.valorCobradoClienteCentavos) || 0)
        );
      }

      if (body.cliente !== undefined && String(body.cliente).trim().length >= 2) {
        freight.cliente = String(body.cliente).trim().slice(0, 140);
      }
      if (body.clienteCnpj !== undefined) {
        freight.clienteCnpj = String(body.clienteCnpj).trim().slice(0, 30) || undefined;
      }
      if (body.clienteContato !== undefined) {
        freight.clienteContato = String(body.clienteContato).trim().slice(0, 80) || undefined;
      }
      if (body.empresaMarca && ['RODOVAR', 'VL TRANSPORTES', 'AXD'].includes(body.empresaMarca)) {
        freight.empresaMarca = body.empresaMarca;
      }
      if (
        body.unidadeOperacional &&
        ['BA - Salvador', 'SP - Guarulhos'].includes(body.unidadeOperacional)
      ) {
        freight.unidadeOperacional = body.unidadeOperacional;
      }
      if (body.condicoesComerciais !== undefined) {
        freight.condicoesComerciais = String(body.condicoesComerciais).trim().slice(0, 1000);
      }
      if (body.condicoesOperacionais !== undefined) {
        freight.condicoesOperacionais = String(body.condicoesOperacionais).trim().slice(0, 1000);
      }
      if (body.observacoes !== undefined) {
        freight.observacoes = String(body.observacoes).trim().slice(0, 1000) || undefined;
      }

      const sp = formatSaoPauloDateTime();
      freight.updatedAtIso = sp.iso;
      freight.updatedAtFormatted = sp.formatted;
      freight.revision += 1;

      const sub = engineState().freightSubDocs.get(freight.id)!;
      const editReason = String(body.reason || body.motivo || '').trim();

      // Requirement 6: "Alterações em endereço, motorista, veículo, condições ou datas após transferência de etapa exigem motivo, registro no histórico e notificação ao responsável atual."
      if (wasSentToNextStage && changedRelevantFields.length > 0) {
        const wasReleased = freight.situacaoOperacional === 'LIBERADO_MONITORAMENTO';
        if (wasReleased) {
          freight.requerReconfirmacaoOperacional = true;
          freight.motivoReconfirmacao = `Alteração comercial pós-liberação (${changedRelevantFields.join(', ')})`;
        }
        appendHistoryEntry(sub, {
          actorId: user.id,
          actorName: user.name,
          actorSector: 'Comercial',
          eventType: 'ALTERACAO_RELEVANTE_POS_FECHAMENTO',
          summary: `Alteração comercial relevante após envio (${changedRelevantFields.join(', ')}).`,
          reason: editReason || 'Ajuste solicitado pelo cliente',
        });
        if (freight.expedicaoResponsavelId) {
          pushFreightNotification({
            recipientId: freight.expedicaoResponsavelId,
            title: `Dados atualizados no Frete ${freight.protocol}`,
            subtitle: `${user.name} alterou (${changedRelevantFields.join(', ')}). Confira os dados na Expedição.`,
            dotColor: 'red',
            targetSection: 'fretes_expedicao',
            targetId: freight.id,
            dedupeKey: `reconfirm:exp:${freight.id}:${freight.revision}`,
          });
        }
        if (freight.monitoramentoResponsavelId) {
          pushFreightNotification({
            recipientId: freight.monitoramentoResponsavelId,
            title: `Alteração no Frete ${freight.protocol}`,
            subtitle: `${user.name} (Comercial) alterou (${changedRelevantFields.join(', ')}).`,
            dotColor: 'red',
            targetSection: 'fretes_ativos',
            targetId: freight.id,
            dedupeKey: `reconfirm:mon:${freight.id}:${freight.revision}`,
          });
        }
      } else {
        appendHistoryEntry(sub, {
          actorId: user.id,
          actorName: user.name,
          actorSector: 'Comercial',
          eventType: 'EDICAO_COMERCIAL',
          summary: `Dados comerciais atualizados por ${user.name} (Rev. #${freight.revision}).`,
          reason: editReason || undefined,
        });
      }

      persistFreightAndSubDoc(freight, sub);
      const responsePayload = {
        ok: true,
        reconfirmationTriggered: Boolean(wasSentToNextStage && changedRelevantFields.length > 0),
        freight: sanitizeFreightForUser(freight, user),
      };
      storeIdempotentResponse(idemKey, 200, responsePayload);
      res.json(responsePayload);
    }
  );

  // --------------------------------------------------------------------------
  // 7. COMMERCIAL STAGE TRANSITIONS (CONFIRM CONTRACT & SEND TO EXPEDIÇÃO)
  // --------------------------------------------------------------------------
  app.post(
    [
      '/api/meus-fretes/:freightId/comercial-transition',
      '/api/meus-fretes/:freightId/commercial-transition',
    ],
    requireApprovedSession,
    (req: any, res: Response) => {
      const user = req.sessionUser as Employee;
      const freightId = String(req.params.freightId || '');
      const freight = engineState().freightsIndex.get(freightId);
      if (!freight) {
        res.status(404).json({ error: 'Frete não encontrado.' });
        return;
      }

      const isOwnerOrManager =
        freight.comercialResponsavelId === user.id || canViewFreightTeam(user);
      if (!canAccessComercialFreights(user) || !isOwnerOrManager) {
        res.status(403).json({
          error: 'Permissão negada para alterar a etapa comercial deste frete.',
          code: 'FORBIDDEN_COMERCIAL_TRANSITION',
        });
        return;
      }

      const { targetStatus, expedicaoResponsavelId, baseRevision } = req.body || {};

      if (typeof baseRevision === 'number' && baseRevision !== freight.revision) {
        res.status(409).json({
          error:
            'Conflito de revisão: este frete foi atualizado em outra sessão. Recarregue antes de prosseguir.',
          code: 'REVISION_CONFLICT',
          currentRevision: freight.revision,
          freight: sanitizeFreightForUser(freight, user),
        });
        return;
      }

      // Commercial tracks progress of its freights but does not execute monitoring or finalization stages
      if (
        targetStatus === 'EM_MONITORAMENTO' ||
        targetStatus === 'EM_TRANSPORTE' ||
        targetStatus === 'CONCLUIDO' ||
        targetStatus === 'FINALIZADO'
      ) {
        res.status(403).json({
          error:
            'Operação bloqueada: o Comercial acompanha o progresso dos seus fretes, mas não executa etapas de liberação ou monitoramento.',
          code: 'FORBIDDEN_OPERATIONAL_SIMULATION',
        });
        return;
      }

      const idemKey = checkIdempotency(req, res, user.id);
      if (idemKey === '__HANDLED__') return;

      const sp = formatSaoPauloDateTime();
      const sub = engineState().freightSubDocs.get(freight.id)!;

      if (targetStatus === 'EM_NEGOCIACAO') {
        if (!['CONTRATADO', 'EM_NEGOCIACAO'].includes(freight.situacaoComercial)) {
          res.status(400).json({
            error: 'Fretes já enviados à Expedição ou em monitoramento não podem retornar diretamente para rascunho sem devolução.',
          });
          return;
        }
        freight.situacaoComercial = 'EM_NEGOCIACAO';
        freight.updatedAtIso = sp.iso;
        freight.updatedAtFormatted = sp.formatted;
        freight.revision += 1;
        appendHistoryEntry(sub, {
          actorId: user.id,
          actorName: user.name,
          actorSector: 'Comercial',
          eventType: 'EDICAO_COMERCIAL',
          summary: 'Frete mantido na etapa "Em negociação".',
        });
        persistFreightAndSubDoc(freight, sub);
        const payload = { ok: true, freight: sanitizeFreightForUser(freight, user) };
        storeIdempotentResponse(idemKey, 200, payload);
        res.json(payload);
        return;
      }

      // Confirmar contratação e enviar à Expedição (supports both AGUARDANDO_EXPEDICAO and legacy NA_EXPEDICAO / CONTRATADO)
      if (
        targetStatus === 'AGUARDANDO_EXPEDICAO' ||
        targetStatus === 'NA_EXPEDICAO' ||
        targetStatus === 'CONTRATADO'
      ) {
        // Validate minimum contracting fields (Requirement 1: "Validar os dados mínimos da contratação e indicar informações que a Expedição precisa completar. Não exigir dados do motorista nesta etapa.")
        const missing: string[] = [];
        if (!freight.cliente || freight.cliente.trim().length < 2) missing.push('Cliente');
        if (!freight.origemCidadeUf || !freight.destinoCidadeUf)
          missing.push('Rota (Cidade/UF de origem e destino)');
        if (!freight.enderecoColeta || freight.enderecoColeta.trim().length < 3)
          missing.push('Endereço de coleta');
        if (!freight.tipoCarga || freight.tipoCarga.trim().length < 2)
          missing.push('Material e informações da carga');
        if (!freight.dataColetaIso) missing.push('Data de coleta combinada');
        if (!freight.valorCobradoClienteCentavos || freight.valorCobradoClienteCentavos <= 0)
          missing.push('Valor fechado com o cliente');

        if (missing.length > 0) {
          res.status(400).json({
            error: `Não é possível confirmar contratação e enviar à Expedição. Informe os dados mínimos: ${missing.join(', ')}.`,
            code: 'INCOMPLETE_FOR_EXPEDICAO',
            missingFields: missing,
          });
          return;
        }

        const wasReturned = freight.devolvidoParaCorrecao;
        let assignedExpUser: Employee | undefined;
        const targetExpId =
          expedicaoResponsavelId !== undefined
            ? String(expedicaoResponsavelId || '').trim()
            : freight.expedicaoResponsavelId || '';

        if (targetExpId) {
          const candidate = getAllServerUsers().find(
            (u) => u.id === targetExpId && u.approvalStatus === 'APROVADO' && u.active
          );
          if (!candidate || !canAccessExpedicaoFreights(candidate)) {
            res.status(400).json({
              error: 'O funcionário selecionado não possui autorização ativa para a Expedição.',
              code: 'INVALID_EXPEDICAO_ASSIGNEE',
            });
            return;
          }
          assignedExpUser = candidate;
        }

        freight.situacaoComercial = 'AGUARDANDO_EXPEDICAO';
        freight.devolvidoParaCorrecao = false;
        freight.motivoDevolucao = undefined;

        const pendingForExp = computePendingForExpedicao(freight);
        const pendingNote =
          pendingForExp.length > 0
            ? ` Pendências para a Expedição completar: ${pendingForExp.join(', ')}.`
            : '';

        if (assignedExpUser) {
          freight.expedicaoResponsavelId = assignedExpUser.id;
          freight.expedicaoResponsavelNome = assignedExpUser.name;
          freight.situacaoOperacional = 'RECEBIDO';

          appendHistoryEntry(sub, {
            actorId: user.id,
            actorName: user.name,
            actorSector: 'Comercial',
            eventType: wasReturned ? 'REENVIO_EXPEDICAO' : 'ENVIO_EXPEDICAO',
            summary: wasReturned
              ? `Frete corrigido pelo Comercial e reenviado à Expedição para ${assignedExpUser.name}.${pendingNote}`
              : `Contratação confirmada por ${user.name} e enviada à Expedição (${assignedExpUser.name}).${pendingNote}`,
            newResponsibleName: assignedExpUser.name,
          });

          pushFreightNotification({
            recipientId: assignedExpUser.id,
            title: wasReturned
              ? `Frete ${freight.protocol} corrigido e reenviado`
              : `Novo Frete ${freight.protocol} atribuído à sua fila da Expedição`,
            subtitle: `${freight.cliente} • ${freight.origemCidadeUf} → ${freight.destinoCidadeUf} (Comercial: ${user.name})`,
            dotColor: 'blue',
            targetSection: 'fretes_expedicao',
            targetId: freight.id,
            dedupeKey: `assign:${freight.id}:${freight.revision + 1}`,
          });
        } else {
          freight.expedicaoResponsavelId = null;
          freight.expedicaoResponsavelNome = null;
          freight.situacaoOperacional = 'DISPONIVEL_FILA';

          appendHistoryEntry(sub, {
            actorId: user.id,
            actorName: user.name,
            actorSector: 'Comercial',
            eventType: wasReturned ? 'REENVIO_EXPEDICAO' : 'ENVIO_EXPEDICAO',
            summary: `Contratação confirmada por ${user.name} e enviada para a fila compartilhada da Expedição.${pendingNote}`,
          });

          const expOperators = getAllServerUsers().filter(
            (u) => u.approvalStatus === 'APROVADO' && u.active && canAccessExpedicaoFreights(u)
          );
          for (const op of expOperators) {
            pushFreightNotification({
              recipientId: op.id,
              title: `Frete ${freight.protocol} disponível para assumir na Expedição`,
              subtitle: `${freight.cliente} • ${freight.origemCidadeUf} → ${freight.destinoCidadeUf}`,
              dotColor: 'blue',
              targetSection: 'fretes_expedicao',
              targetId: freight.id,
              dedupeKey: `avail:${freight.id}:${freight.revision + 1}:${op.id}`,
            });
          }
        }

        freight.updatedAtIso = sp.iso;
        freight.updatedAtFormatted = sp.formatted;
        freight.revision += 1;

        persistFreightAndSubDoc(freight, sub);
        const payload = { ok: true, freight: sanitizeFreightForUser(freight, user) };
        storeIdempotentResponse(idemKey, 200, payload);
        res.json(payload);
        return;
      }

      res.status(400).json({ error: 'Etapa comercial de destino inválida.' });
    }
  );

  // --------------------------------------------------------------------------
  // 8. ATOMIC CLAIM FROM "DISPONÍVEIS PARA ASSUMIR" (EXPEDIÇÃO)
  // --------------------------------------------------------------------------
  app.post('/api/meus-fretes/:freightId/claim', requireApprovedSession, (req: any, res: Response) => {
    const user = req.sessionUser as Employee;
    if (!canAccessExpedicaoFreights(user)) {
      res.status(403).json({
        error: 'Apenas operadores autorizados da Expedição podem assumir fretes da fila.',
        code: 'FORBIDDEN_EXPEDICAO_CLAIM',
      });
      return;
    }

    const freightId = String(req.params.freightId || '');
    if (engineState().activeFreightLocks.has(freightId)) {
      res.status(409).json({
        error: 'Este frete está sendo processado simultaneamente por outro operador.',
        code: 'CONCURRENT_LOCK_CONFLICT',
      });
      return;
    }

    engineState().activeFreightLocks.add(freightId);
    try {
      const freight = engineState().freightsIndex.get(freightId);
      if (!freight) {
        res.status(404).json({ error: 'Frete não encontrado.' });
        return;
      }

      if (
        freight.expedicaoResponsavelId !== null ||
        freight.situacaoOperacional !== 'DISPONIVEL_FILA'
      ) {
        res.status(409).json({
          error: `Este frete já foi assumido por ${freight.expedicaoResponsavelNome || 'outro operador da Expedição'} e não está mais disponível na fila.`,
          code: 'ALREADY_CLAIMED',
          claimedBy: freight.expedicaoResponsavelNome,
        });
        return;
      }

      const sp = formatSaoPauloDateTime();
      freight.expedicaoResponsavelId = user.id;
      freight.expedicaoResponsavelNome = user.name;
      freight.situacaoOperacional = 'RECEBIDO';
      freight.updatedAtIso = sp.iso;
      freight.updatedAtFormatted = sp.formatted;
      freight.revision += 1;

      const sub = engineState().freightSubDocs.get(freight.id)!;
      appendHistoryEntry(sub, {
        actorId: user.id,
        actorName: user.name,
        actorSector: 'Expedição',
        eventType: 'ASSUMIR_FILA',
        summary: `Frete assumido na fila da Expedição por ${user.name}.`,
        newResponsibleName: user.name,
      });

      persistFreightAndSubDoc(freight, sub);

      pushFreightNotification({
        recipientId: freight.comercialResponsavelId,
        title: `Frete ${freight.protocol} assumido na Expedição`,
        subtitle: `${user.name} assumiu a preparação operacional do frete (${freight.cliente}).`,
        dotColor: 'blue',
        targetSection: 'fretes_comercial',
        targetId: freight.id,
        dedupeKey: `claimed:${freight.id}:${user.id}`,
      });

      res.json({
        ok: true,
        freight: sanitizeFreightForUser(freight, user),
      });
    } finally {
      engineState().activeFreightLocks.delete(freightId);
    }
  });

  // --------------------------------------------------------------------------
  // 9. EXPEDIÇÃO: UPDATE OPERATIONAL DATA, COMPLETE COMMERCIAL GAPS & 5 VERIFICATIONS
  // --------------------------------------------------------------------------
  app.put(
    [
      '/api/meus-fretes/:freightId/operational-data',
      '/api/meus-fretes/:freightId/operational',
    ],
    requireApprovedSession,
    (req: any, res: Response) => {
      const user = req.sessionUser as Employee;
      const freightId = String(req.params.freightId || '');
      const freight = engineState().freightsIndex.get(freightId);
      if (!freight) {
        res.status(404).json({ error: 'Frete não encontrado.' });
        return;
      }

      const isAssignedOrManager =
        freight.expedicaoResponsavelId === user.id || canViewFreightTeam(user);
      if (!canAccessExpedicaoFreights(user) || !isAssignedOrManager) {
        res.status(403).json({
          error: 'Permissão negada: você só pode editar fretes atribuídos à sua fila da Expedição.',
          code: 'FORBIDDEN_EXPEDICAO_UPDATE',
        });
        return;
      }

      if (
        freight.situacaoOperacional === 'CONCLUIDO' ||
        freight.situacaoOperacional === 'CANCELADO' ||
        freight.situacaoMonitoramento === 'FINALIZADO'
      ) {
        res.status(409).json({
          error: 'Operação já finalizada ou cancelada. Não é permitido alterar dados operacionais.',
          code: 'TERMINAL_STATE_LOCKED',
        });
        return;
      }

      const body = req.body || {};
      if (app.locals.checkDriverBinding && ['motoristaCpf','motoristaNome','motoristaTelefone'].some(field=>body[field]!==undefined) && !app.locals.checkDriverBinding(req,res,body.motoristaCpf??freight.motoristaCpf??'')) return;

      if (body.enderecoEntrega !== undefined && String(body.enderecoEntrega).trim() !== (freight.enderecoEntrega || '')) {
        res.status(403).json({error:'O endereço detalhado de entrega deve ser registrado pelo Monitoramento.',code:'DELIVERY_ADDRESS_MONITORING_ONLY'});
        return;
      }

      const idemKey = checkIdempotency(req, res, user.id);
      if (idemKey === '__HANDLED__') return;

      if (typeof body.baseRevision === 'number' && body.baseRevision !== freight.revision) {
        res.status(409).json({
          error: 'Conflito de revisão detectado. Recarregue os dados atualizados do frete.',
          code: 'REVISION_CONFLICT',
          currentRevision: freight.revision,
          freight: sanitizeFreightForUser(freight, user),
        });
        return;
      }

      const sp = formatSaoPauloDateTime();
      const wasAlreadyReleasedToMonitoring =
        freight.situacaoOperacional === 'LIBERADO_MONITORAMENTO';
      const changedPostReleaseFields: string[] = [];

      // Allow Expedição to complete/refine collection & delivery addresses, instructions, cargo details, dates
      if (body.enderecoColeta !== undefined) {
        const nextVal = String(body.enderecoColeta).trim().slice(0, 240);
        if (wasAlreadyReleasedToMonitoring && nextVal !== freight.enderecoColeta) {
          changedPostReleaseFields.push('Endereço de coleta');
        }
        freight.enderecoColeta = nextVal;
      }
      if (body.instrucoesColetaEntrega !== undefined) {
        freight.instrucoesColetaEntrega =
          String(body.instrucoesColetaEntrega).trim().slice(0, 1000) || undefined;
      }
      if (body.clienteContato !== undefined) {
        freight.clienteContato = String(body.clienteContato).trim().slice(0, 80) || undefined;
      }
      if (body.tipoCarga !== undefined && String(body.tipoCarga).trim()) {
        freight.tipoCarga = String(body.tipoCarga).trim().slice(0, 120);
      }
      if (body.pesoKg !== undefined) {
        freight.pesoKg = Math.max(0, Number(body.pesoKg) || 0);
      }
      if (body.volumes !== undefined) {
        freight.volumes = Math.max(0, Math.round(Number(body.volumes) || 0));
      }
      if (body.veiculoNecessario !== undefined) {
        freight.veiculoNecessario = String(body.veiculoNecessario).trim().slice(0, 100);
      }
      if (body.dataColetaIso !== undefined && String(body.dataColetaIso).trim()) {
        freight.dataColetaIso = String(body.dataColetaIso).slice(0, 10);
      }
      if (body.janelaColetaInicio !== undefined) {
        freight.janelaColetaInicio = String(body.janelaColetaInicio).slice(0, 5);
      }
      if (body.janelaColetaFim !== undefined) {
        freight.janelaColetaFim = String(body.janelaColetaFim).slice(0, 5);
      }
      if (body.dataEntregaPrevistaIso !== undefined && String(body.dataEntregaPrevistaIso).trim()) {
        freight.dataEntregaPrevistaIso = String(body.dataEntregaPrevistaIso).slice(0, 10);
      }
      if (body.janelaEntregaInicio !== undefined) {
        freight.janelaEntregaInicio = String(body.janelaEntregaInicio).slice(0, 5);
      }
      if (body.janelaEntregaFim !== undefined) {
        freight.janelaEntregaFim = String(body.janelaEntregaFim).slice(0, 5);
      }

      // Driver, carrier, plates, contracted value & payment conditions
      if (body.transportadorNome !== undefined) {
        freight.transportadorNome = String(body.transportadorNome).trim().slice(0, 140) || undefined;
      }
      if (body.transportadorDocumento !== undefined) {
        freight.transportadorDocumento =
          String(body.transportadorDocumento).trim().slice(0, 30) || undefined;
      }
      if (body.motoristaNome !== undefined) {
        const nextVal = String(body.motoristaNome).trim().slice(0, 120) || undefined;
        if (wasAlreadyReleasedToMonitoring && nextVal !== freight.motoristaNome) {
          changedPostReleaseFields.push(`Motorista (${freight.motoristaNome || '—'} → ${nextVal || '—'})`);
        }
        freight.motoristaNome = nextVal;
      }
      if (body.motoristaCpf !== undefined) {
        freight.motoristaCpf = String(body.motoristaCpf).trim().slice(0, 20) || undefined;
      }
      if (body.motoristaTelefone !== undefined) {
        freight.motoristaTelefone = String(body.motoristaTelefone).trim().slice(0, 30) || undefined;
      }
      if (body.placaVeiculo !== undefined) {
        const nextVal = String(body.placaVeiculo).trim().toUpperCase().slice(0, 12) || undefined;
        if (wasAlreadyReleasedToMonitoring && nextVal !== freight.placaVeiculo) {
          changedPostReleaseFields.push(`Placa (${freight.placaVeiculo || '—'} → ${nextVal || '—'})`);
        }
        freight.placaVeiculo = nextVal;
      }
      if (body.placaCarreta !== undefined) {
        freight.placaCarreta =
          String(body.placaCarreta).trim().toUpperCase().slice(0, 12) || undefined;
      }
      if (body.valorContratadoCentavos !== undefined) {
        freight.valorContratadoCentavos = Math.max(
          0,
          Math.round(Number(body.valorContratadoCentavos) || 0)
        );
      }
      if (body.condicoesOperacionais !== undefined) {
        freight.condicoesOperacionais = String(body.condicoesOperacionais).trim().slice(0, 1000);
      }
      if (body.condicoesPagamento !== undefined) {
        freight.condicoesPagamento =
          String(body.condicoesPagamento).trim().slice(0, 600) || undefined;
      }
      if (body.favorecidoPagamento !== undefined) {
        freight.favorecidoPagamento =
          String(body.favorecidoPagamento).trim().slice(0, 140) || undefined;
      }
      if (body.bancoPagamento !== undefined) {
        freight.bancoPagamento = String(body.bancoPagamento).trim().slice(0, 100) || undefined;
      }
      if (body.tipoChavePix !== undefined) {
        freight.tipoChavePix = String(body.tipoChavePix).trim().slice(0, 40) || undefined;
      }
      if (body.chavePix !== undefined) {
        freight.chavePix = String(body.chavePix).trim().slice(0, 140) || undefined;
      }
      if (body.observacoes !== undefined) {
        freight.observacoes = String(body.observacoes).trim().slice(0, 1000) || undefined;
      }
      if (body.monitoramentoResponsavelId !== undefined) {
        const monId = String(body.monitoramentoResponsavelId || '').trim();
        if (monId) {
          const monUser = getAllServerUsers().find(
            (u) => u.id === monId && u.approvalStatus === 'APROVADO' && u.active
          );
          if (monUser && canOperateMonitoring(monUser)) {
            freight.monitoramentoResponsavelId = monUser.id;
            freight.monitoramentoResponsavelNome = monUser.name;
          }
        } else if (!wasAlreadyReleasedToMonitoring) {
          freight.monitoramentoResponsavelId = null;
          freight.monitoramentoResponsavelNome = null;
        }
      }

      const sub = engineState().freightSubDocs.get(freight.id)!;

      // 5 Persisted Functional Verifications
      if (body.checklistFechamento && typeof body.checklistFechamento === 'object') {
        const prev = freight.checklistFechamento || {
          motoristaConfirmado: false,
          veiculoConfirmado: false,
          condicoesConferidas: false,
          documentosConferidos: false,
          videochamadaRealizada: false,
          ordemColetaEnviadaMotorista: false,
        };
        const nextVideochamada =
          body.checklistFechamento.videochamadaRealizada !== undefined
            ? Boolean(body.checklistFechamento.videochamadaRealizada)
            : Boolean(prev.videochamadaRealizada);

        const nextOrdemEnviada =
          body.checklistFechamento.ordemColetaEnviadaMotorista !== undefined
            ? Boolean(body.checklistFechamento.ordemColetaEnviadaMotorista)
            : Boolean(prev.ordemColetaEnviadaMotorista);

        const videoObs =
          body.checklistFechamento.videochamadaObservacoes !== undefined
            ? String(body.checklistFechamento.videochamadaObservacoes).trim().slice(0, 500)
            : prev.videochamadaObservacoes;

        freight.checklistFechamento = {
          motoristaConfirmado:
            body.checklistFechamento.motoristaConfirmado !== undefined
              ? Boolean(body.checklistFechamento.motoristaConfirmado)
              : Boolean(prev.motoristaConfirmado),
          veiculoConfirmado:
            body.checklistFechamento.veiculoConfirmado !== undefined
              ? Boolean(body.checklistFechamento.veiculoConfirmado)
              : Boolean(prev.veiculoConfirmado),
          condicoesConferidas:
            body.checklistFechamento.condicoesConferidas !== undefined
              ? Boolean(body.checklistFechamento.condicoesConferidas)
              : Boolean(prev.condicoesConferidas),
          documentosConferidos:
            body.checklistFechamento.documentosConferidos !== undefined
              ? Boolean(body.checklistFechamento.documentosConferidos)
              : Boolean(prev.documentosConferidos),
          videochamadaRealizada: nextVideochamada,
          videochamadaRealizadaPorId: nextVideochamada
            ? prev.videochamadaRealizadaPorId || user.id
            : undefined,
          videochamadaRealizadaPorNome: nextVideochamada
            ? prev.videochamadaRealizadaPorNome || user.name
            : undefined,
          videochamadaRealizadaEmIso: nextVideochamada
            ? prev.videochamadaRealizadaEmIso || sp.iso
            : undefined,
          videochamadaRealizadaEmFormatado: nextVideochamada
            ? prev.videochamadaRealizadaEmFormatado || sp.formatted
            : undefined,
          videochamadaObservacoes: videoObs || undefined,
          ordemColetaEnviadaMotorista: nextOrdemEnviada,
          ordemColetaEnviadaPorId: nextOrdemEnviada
            ? prev.ordemColetaEnviadaPorId || user.id
            : undefined,
          ordemColetaEnviadaPorNome: nextOrdemEnviada
            ? prev.ordemColetaEnviadaPorNome || user.name
            : undefined,
          ordemColetaEnviadaEmFormatado: nextOrdemEnviada
            ? prev.ordemColetaEnviadaEmFormatado || sp.formatted
            : undefined,
          conferidoPorId: user.id,
          conferidoPorNome: user.name,
          conferidoEmIso: sp.iso,
          conferidoEmFormatado: sp.formatted,
        };

        if (!prev.videochamadaRealizada && nextVideochamada) {
          appendHistoryEntry(sub, {
            actorId: user.id,
            actorName: user.name,
            actorSector: 'Expedição',
            eventType: 'VIDEOCHAMADA_MOTORISTA',
            summary: `Videochamada externa com o motorista ${freight.motoristaNome || ''} registrada como realizada por ${user.name}.${videoObs ? ` Obs: ${videoObs}` : ''}`,
          });
        }
        if (!prev.ordemColetaEnviadaMotorista && nextOrdemEnviada) {
          appendHistoryEntry(sub, {
            actorId: user.id,
            actorName: user.name,
            actorSector: 'Expedição',
            eventType: 'ENVIO_ORDEM_MOTORISTA',
            summary: `Confirmação de envio da Ordem de Coleta ao motorista registrada por ${user.name}.`,
          });
        }
      }

      // Auto-advance Expedição status from RECEBIDO to EM_PREPARACAO when preparation data is saved
      if (
        freight.situacaoOperacional === 'RECEBIDO' ||
        freight.situacaoOperacional === 'AGUARDANDO_FECHAMENTO'
      ) {
        freight.situacaoOperacional = 'EM_PREPARACAO';
      }

      freight.updatedAtIso = sp.iso;
      freight.updatedAtFormatted = sp.formatted;
      freight.revision += 1;

      if (wasAlreadyReleasedToMonitoring && changedPostReleaseFields.length > 0) {
        const editReason = String(body.reason || body.motivo || 'Correção operacional').trim();
        appendHistoryEntry(sub, {
          actorId: user.id,
          actorName: user.name,
          actorSector: 'Expedição',
          eventType: 'ALTERACAO_RELEVANTE_POS_FECHAMENTO',
          summary: `Dados operacionais alterados após liberação ao Monitoramento (${changedPostReleaseFields.join(', ')}).`,
          reason: editReason,
        });
        if (freight.monitoramentoResponsavelId) {
          pushFreightNotification({
            recipientId: freight.monitoramentoResponsavelId,
            title: `Dados operacionais atualizados — Frete ${freight.protocol}`,
            subtitle: `${user.name} (Expedição) atualizou: ${changedPostReleaseFields.join(', ')}.`,
            dotColor: 'blue',
            targetSection: 'fretes_ativos',
            targetId: freight.id,
            dedupeKey: `expupd:${freight.id}:${freight.revision}`,
          });
        }
      }

      persistFreightAndSubDoc(freight, sub);

      const payload = {
        ok: true,
        freight: sanitizeFreightForUser(freight, user),
        historico: sub.historico,
      };
      storeIdempotentResponse(idemKey, 200, payload);
      res.json(payload);
    }
  );

  // --------------------------------------------------------------------------
  // 10. EXPEDIÇÃO ACTIONS: EMITIR ORDEM DE COLETA, CONFIRMAR ENVIO AO MOTORISTA,
  //     LIBERAR PARA MONITORAMENTO, DEVOLVER AO COMERCIAL
  // --------------------------------------------------------------------------
  app.post(
    '/api/meus-fretes/:freightId/expedicao-action',
    requireApprovedSession,
    (req: any, res: Response) => {
      const user = req.sessionUser as Employee;
      const freightId = String(req.params.freightId || '');
      const freight = engineState().freightsIndex.get(freightId);
      if (!freight) {
        res.status(404).json({ error: 'Frete não encontrado.' });
        return;
      }

      const isAssignedOrManager =
        freight.expedicaoResponsavelId === user.id || canViewFreightTeam(user);
      if (!canAccessExpedicaoFreights(user) || !isAssignedOrManager) {
        res.status(403).json({
          error: 'Permissão negada: este frete não pertence à sua fila operacional.',
          code: 'FORBIDDEN_EXPEDICAO_ACTION',
        });
        return;
      }

      const {
        action,
        baseRevision,
        reason: rawReason,
        motivo,
        monitoramentoResponsavelId: bodyMonRespId,
        videochamadaObservacoes,
        dataEntregaPrevistaIso,
        janelaEntregaInicio,
        janelaEntregaFim,
      } = req.body || {};
      const reason = rawReason ?? motivo;

      const idemKey = checkIdempotency(req, res, user.id);
      if (idemKey === '__HANDLED__') return;

      if (typeof baseRevision === 'number' && baseRevision !== freight.revision) {
        res.status(409).json({
          error: 'Conflito de revisão detectado. Recarregue os dados do frete antes de prosseguir.',
          code: 'REVISION_CONFLICT',
          currentRevision: freight.revision,
          freight: sanitizeFreightForUser(freight, user),
        });
        return;
      }

      const sp = formatSaoPauloDateTime();
      const sub = engineState().freightSubDocs.get(freight.id)!;

      // ACTION 1: EMITIR_ORDEM_CARREGAMENTO / EMITIR_ORDEM (Ordem de Coleta PDF oficial)
      if (action === 'EMITIR_ORDEM_CARREGAMENTO' || action === 'EMITIR_ORDEM') {
        const missingForOrder: string[] = [];
        if (!freight.enderecoColeta || freight.enderecoColeta.trim().length < 3)
          missingForOrder.push('Endereço de coleta');
        // Endereço detalhado de entrega é opcional na Expedição (Requirement 2)
        if (!freight.motoristaNome || freight.motoristaNome.trim().length < 3)
          missingForOrder.push('Nome do motorista');
        if (!freight.placaVeiculo || freight.placaVeiculo.trim().length < 6)
          missingForOrder.push('Placa do veículo');

        if (missingForOrder.length > 0) {
          res.status(400).json({
            error: `Para gerar a Ordem de Coleta, preencha primeiro: ${missingForOrder.join(', ')}.`,
            code: 'INCOMPLETE_FOR_COLLECTION_ORDER',
            missingFields: missingForOrder,
          });
          return;
        }

        const orderNum =
          freight.ordemCarregamentoNumero ||
          `OC-RDV-${freight.protocol.replace('#', '')}-2027`;
        freight.ordemCarregamentoNumero = orderNum;
        freight.ordemCarregamentoEmitidaEm = sp.formatted;
        if (freight.situacaoOperacional === 'RECEBIDO') {
          freight.situacaoOperacional = 'EM_PREPARACAO';
        }
        freight.updatedAtIso = sp.iso;
        freight.updatedAtFormatted = sp.formatted;
        freight.revision += 1;

        appendHistoryEntry(sub, {
          actorId: user.id,
          actorName: user.name,
          actorSector: 'Expedição',
          eventType: 'EMISSAO_ORDEM_COLETA',
          summary: `Ordem de Coleta ${orderNum} gerada no padrão oficial RODOVAR (CNPJ ${RODOVAR_CNPJ}) por ${user.name}.`,
        });

        persistFreightAndSubDoc(freight, sub);
        // Requirement 2: "Não incluir valor de venda ao cliente, margem ou observações internas."
        const payload = {
          ok: true,
          freight: sanitizeFreightForUser(freight, user),
          historico: sub.historico,
          loadingOrder: {
            orderNumber: orderNum,
            issuedAt: sp.formatted,
            issuedBy: user.name,
            razaoSocial: RODOVAR_RAZAO_SOCIAL,
            cnpj: RODOVAR_CNPJ,
            protocol: freight.protocol,
            empresaMarca: freight.empresaMarca,
            unidadeOperacional: freight.unidadeOperacional,
            cliente: freight.cliente,
            clienteContato: freight.clienteContato,
            origemCidadeUf: freight.origemCidadeUf,
            enderecoColeta: freight.enderecoColeta,
            destinoCidadeUf: freight.destinoCidadeUf,
            enderecoEntrega: freight.enderecoEntrega,
            instrucoesColetaEntrega: freight.instrucoesColetaEntrega,
            tipoCarga: freight.tipoCarga,
            pesoKg: freight.pesoKg,
            volumes: freight.volumes,
            veiculoNecessario: freight.veiculoNecessario,
            dataColetaIso: freight.dataColetaIso,
            janelaColeta: `${freight.janelaColetaInicio} às ${freight.janelaColetaFim}`,
            dataEntregaPrevistaIso: freight.dataEntregaPrevistaIso,
            janelaEntrega: `${freight.janelaEntregaInicio}${freight.janelaEntregaFim ? ` às ${freight.janelaEntregaFim}` : ''}`,
            motoristaNome: freight.motoristaNome,
            motoristaCpf: freight.motoristaCpf,
            motoristaTelefone: freight.motoristaTelefone,
            transportadorNome: freight.transportadorNome,
            transportadorDocumento: freight.transportadorDocumento,
            placaVeiculo: freight.placaVeiculo,
            placaCarreta: freight.placaCarreta,
            condicoesOperacionais: freight.condicoesOperacionais,
            expedicaoResponsavelNome: freight.expedicaoResponsavelNome || user.name,
          },
        };
        storeIdempotentResponse(idemKey, 200, payload);
        res.json(payload);
        return;
      }

      // ACTION 2: CONFIRMAR_ENVIO_ORDEM_MOTORISTA
      if (action === 'CONFIRMAR_ENVIO_ORDEM_MOTORISTA') {
        if (!freight.ordemCarregamentoNumero) {
          res.status(400).json({
            error: 'Gere a Ordem de Coleta antes de confirmar o envio ao motorista.',
            code: 'ORDER_NOT_GENERATED',
          });
          return;
        }
        freight.checklistFechamento.ordemColetaEnviadaMotorista = true;
        freight.checklistFechamento.ordemColetaEnviadaPorId = user.id;
        freight.checklistFechamento.ordemColetaEnviadaPorNome = user.name;
        freight.checklistFechamento.ordemColetaEnviadaEmFormatado = sp.formatted;
        freight.updatedAtIso = sp.iso;
        freight.updatedAtFormatted = sp.formatted;
        freight.revision += 1;

        appendHistoryEntry(sub, {
          actorId: user.id,
          actorName: user.name,
          actorSector: 'Expedição',
          eventType: 'ENVIO_ORDEM_MOTORISTA',
          summary: `Ordem de Coleta ${freight.ordemCarregamentoNumero} confirmada como enviada ao motorista ${freight.motoristaNome || ''} por ${user.name}.`,
        });

        persistFreightAndSubDoc(freight, sub);
        const payload = {
          ok: true,
          freight: sanitizeFreightForUser(freight, user),
          historico: sub.historico,
        };
        storeIdempotentResponse(idemKey, 200, payload);
        res.json(payload);
        return;
      }

      // ACTION 3: REGISTRAR_VIDEOCHAMADA
      if (action === 'REGISTRAR_VIDEOCHAMADA') {
        const obs = String(videochamadaObservacoes || reason || '').trim().slice(0, 500);
        freight.checklistFechamento.videochamadaRealizada = true;
        freight.checklistFechamento.videochamadaRealizadaPorId = user.id;
        freight.checklistFechamento.videochamadaRealizadaPorNome = user.name;
        freight.checklistFechamento.videochamadaRealizadaEmIso = sp.iso;
        freight.checklistFechamento.videochamadaRealizadaEmFormatado = sp.formatted;
        if (obs) {
          freight.checklistFechamento.videochamadaObservacoes = obs;
        }
        if (freight.situacaoOperacional === 'RECEBIDO') {
          freight.situacaoOperacional = 'EM_PREPARACAO';
        }
        freight.updatedAtIso = sp.iso;
        freight.updatedAtFormatted = sp.formatted;
        freight.revision += 1;

        appendHistoryEntry(sub, {
          actorId: user.id,
          actorName: user.name,
          actorSector: 'Expedição',
          eventType: 'VIDEOCHAMADA_MOTORISTA',
          summary: `Videochamada realizada com o motorista (${freight.motoristaNome || 'Motorista'}) registrada por ${user.name} em ${sp.formatted}.${obs ? ` Observações: ${obs}` : ''}`,
        });

        persistFreightAndSubDoc(freight, sub);
        const payload = {
          ok: true,
          freight: sanitizeFreightForUser(freight, user),
          historico: sub.historico,
        };
        storeIdempotentResponse(idemKey, 200, payload);
        res.json(payload);
        return;
      }

      // ACTION 4: LIBERAR_PARA_MONITORAMENTO (Main action of Expedição; also supports legacy CONFIRMAR_FECHAMENTO if operator is provided)
      if (action === 'LIBERAR_PARA_MONITORAMENTO' || action === 'CONFIRMAR_FECHAMENTO') {
        // A fresh click must never reset a freight already released or notify twice.
        if (freight.situacaoOperacional === 'LIBERADO_MONITORAMENTO') {
          if (bodyMonRespId && bodyMonRespId !== freight.monitoramentoResponsavelId) {
            res.status(409).json({error:'Frete já liberado. Use a transferência de responsável para trocar o operador.'});
            return;
          }
          const payload = {ok:true,freight:sanitizeFreightForUser(freight,user),historico:sub.historico};
          storeIdempotentResponse(idemKey,200,payload);
          res.json(payload);
          return;
        }

        const targetMonId = String(
          bodyMonRespId || freight.monitoramentoResponsavelId || ''
        ).trim();

        const missing: string[] = [];
        if (!freight.enderecoColeta || freight.enderecoColeta.trim().length < 3)
          missing.push('Endereço de coleta completo');
        // Endereço detalhado de entrega é opcional na Expedição; Monitoramento confirmará se ausente (Requirement 2)
        if (!freight.tipoCarga || freight.tipoCarga.trim().length < 2)
          missing.push('Material da carga');
        if (!freight.pesoKg || freight.pesoKg <= 0)
          missing.push('Peso da carga (kg)');
        if (!freight.veiculoNecessario || freight.veiculoNecessario.trim().length < 2)
          missing.push('Tipo de veículo');
        if (!freight.motoristaNome || freight.motoristaNome.trim().length < 3)
          missing.push('Nome do motorista');
        if (!freight.motoristaCpf || freight.motoristaCpf.trim().length < 11)
          missing.push('CPF do motorista');
        if (!freight.motoristaTelefone || freight.motoristaTelefone.trim().length < 8)
          missing.push('Telefone do motorista');
        if (!freight.transportadorNome || freight.transportadorNome.trim().length < 2)
          missing.push('Transportador / proprietário');
        if (!freight.placaVeiculo || freight.placaVeiculo.trim().length < 6)
          missing.push('Placa do veículo');
        if (!freight.valorContratadoCentavos || freight.valorContratadoCentavos <= 0)
          missing.push('Valor contratado com o motorista');
        if (!freight.condicoesOperacionais || freight.condicoesOperacionais.trim().length < 3)
          missing.push('Condições operacionais: preencha na aba Dados Operacionais (mínimo 3 caracteres)');

        if (!expeditionPaymentMode(freight.condicoesPagamento)) missing.push('Condições de pagamento: selecione 70/30, 80/20 ou Integral em Dados Operacionais');
        const chk = freight.checklistFechamento;
        if (!chk.motoristaConfirmado)
          missing.push('Verificação: Dados do motorista conferidos');
        if (!chk.veiculoConfirmado)
          missing.push('Verificação: Veículo conferido');
        if (!chk.condicoesConferidas || !chk.documentosConferidos)
          missing.push('Verificação: Condições e documentos conferidos');
        if (!chk.videochamadaRealizada)
          missing.push('Verificação: Videochamada realizada com o motorista');
        if (!freight.ordemCarregamentoNumero)
          missing.push('Ordem de coleta gerada');
        if (!chk.ordemColetaEnviadaMotorista)
          missing.push('Verificação: Ordem de coleta enviada ao motorista');

        let monOperator: Employee | undefined;
        if (!targetMonId) {
          missing.push('Operador de Monitoramento responsável');
        } else {
          monOperator = getAllServerUsers().find(
            (u) => u.id === targetMonId && u.approvalStatus === 'APROVADO' && u.active
          );
          if (!monOperator || !canOperateMonitoring(monOperator)) {
            missing.push('Operador de Monitoramento válido e ativo');
          }
        }

        if (missing.length > 0) {
          res.status(400).json({
            error: `Não é possível liberar para o Monitoramento. Pendências obrigatórias: ${missing.join(', ')}.`,
            code: 'INCOMPLETE_FOR_MONITORAMENTO',
            missingFields: missing,
          });
          return;
        }

        freight.monitoramentoResponsavelId = monOperator!.id;
        freight.monitoramentoResponsavelNome = monOperator!.name;
        freight.situacaoOperacional = 'LIBERADO_MONITORAMENTO';
        freight.situacaoComercial = 'EM_MONITORAMENTO';
        freight.situacaoMonitoramento = 'NOVO_PARA_CARREGAR';
        freight.liberadoMonitoramentoEm = sp.formatted;
        freight.requerReconfirmacaoOperacional = false;
        freight.motivoReconfirmacao = undefined;
        freight.devolvidoParaCorrecao = false;
        freight.motivoDevolucao = undefined;
        if (freight.situacaoFinanceira === 'NAO_INICIADO') {
          freight.situacaoFinanceira = 'PENDENTE_ADIANTAMENTO';
        }
        freight.updatedAtIso = sp.iso;
        freight.updatedAtFormatted = sp.formatted;
        freight.revision += 1;

        // Requirement 2: Se o endereço detalhado de entrega não foi informado na Expedição,
        // registrar pendência operacional automática para o operador de Monitoramento designado
        if (!freight.enderecoEntrega || !freight.enderecoEntrega.trim()) {
          const occId = `occ-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          sub.ocorrencias.push({
            id: occId,
            freightId:freight.id,
            title: 'Endereço detalhado de entrega a confirmar',
            description: `Frete liberado para o destino ${freight.destinoCidadeUf} sem endereço detalhado de descarga. O operador de Monitoramento (${monOperator!.name}) deve contatar o cliente ou destinatário e registrar o endereço exato de entrega.`,
            severity: 'MEDIA',
            createdById: user.id,
            createdByName: user.name,
            createdAtIso: sp.iso,
            createdAtFormatted: sp.formatted,
            resolved: false,
          });
          freight.ocorrenciasAbertasCount = sub.ocorrencias.filter((o) => !o.resolved).length;

          appendHistoryEntry(sub, {
            actorId: user.id,
            actorName: user.name,
            actorSector: 'Expedição',
            eventType: 'OCORRENCIA_CRIADA',
            summary: `Pendência criada para o Monitoramento: Confirmar endereço detalhado de entrega no destino ${freight.destinoCidadeUf}.`,
          });
        }

        persistFreightAndSubDoc(freight, sub);

        for(const person of getAllServerUsers().filter(u=>u.active&&u.approvalStatus==='APROVADO'&&u.accessProfile==='FINANCEIRO')) pushFreightNotification({recipientId:person.id,title:`Novo frete ${freight.protocol} — preparar adiantamento`,subtitle:`${freight.cliente} • Motorista: ${freight.motoristaNome||'Não informado'} • Condição: ${freight.condicoesPagamento||'Conferir no frete'}`,dotColor:'blue',targetSection:'financeiro',targetId:freight.id,dedupeKey:`finance-new:${freight.id}`});

        // Requirement 3: Send internal notification to Monitoring Operator:
        // “Novo frete para carregar — #[número] — [origem] → [destino]”
        pushFreightNotification({
          recipientId: monOperator!.id,
          title: `Novo frete para carregar — ${freight.protocol} — ${freight.origemCidadeUf} → ${freight.destinoCidadeUf}`,
          subtitle: `Cliente: ${freight.cliente} • Motorista: ${freight.motoristaNome} (${freight.placaVeiculo}) • Liberado por ${user.name}`,
          dotColor: 'blue',
          targetSection: 'fretes_ativos',
          targetId: freight.id,
          dedupeKey: `mon-release:${freight.id}:${freight.revision}`,
        });

        // Also notify Commercial owner that their freight is now in Monitoring
        if (freight.comercialResponsavelId && freight.comercialResponsavelId !== user.id) {
          pushFreightNotification({
            recipientId: freight.comercialResponsavelId,
            title: `Frete ${freight.protocol} liberado para Monitoramento`,
            subtitle: `Preparado por ${user.name} (Expedição) e atribuído ao operador ${monOperator!.name}.`,
            dotColor: 'blue',
            targetSection: 'fretes_comercial',
            targetId: freight.id,
            dedupeKey: `com-mon-release:${freight.id}:${freight.revision}`,
          });
        }

        const payload = {
          ok: true,
          freight: sanitizeFreightForUser(freight, user),
          historico: sub.historico,
        };
        storeIdempotentResponse(idemKey, 200, payload);
        res.json(payload);
        return;
      }

      // ACTION 5: ATUALIZAR_PREVISAO
      if (action === 'ATUALIZAR_PREVISAO') {
        if (!dataEntregaPrevistaIso) {
          res.status(400).json({ error: 'Informe a nova data de previsão de entrega.' });
          return;
        }
        const prev = `${freight.dataEntregaPrevistaIso} ${freight.janelaEntregaInicio}`;
        freight.dataEntregaPrevistaIso = String(dataEntregaPrevistaIso).slice(0, 10);
        if (janelaEntregaInicio) {
          freight.janelaEntregaInicio = String(janelaEntregaInicio).slice(0, 5);
        }
        if (janelaEntregaFim) {
          freight.janelaEntregaFim = String(janelaEntregaFim).slice(0, 5);
        }
        freight.updatedAtIso = sp.iso;
        freight.updatedAtFormatted = sp.formatted;
        freight.revision += 1;

        appendHistoryEntry(sub, {
          actorId: user.id,
          actorName: user.name,
          actorSector: 'Expedição',
          eventType: 'ATUALIZACAO_PREVISAO',
          summary: `Previsão de entrega atualizada de ${prev} para ${freight.dataEntregaPrevistaIso} • ${freight.janelaEntregaInicio}.`,
          reason: reason ? String(reason).trim().slice(0, 300) : undefined,
        });

        persistFreightAndSubDoc(freight, sub);
        pushFreightNotification({
          recipientId: freight.comercialResponsavelId,
          title: `Previsão atualizada — Frete ${freight.protocol}`,
          subtitle: `Nova previsão: ${freight.dataEntregaPrevistaIso} às ${freight.janelaEntregaInicio}.`,
          dotColor: 'blue',
          targetSection: 'fretes_comercial',
          targetId: freight.id,
          dedupeKey: `forecast:${freight.id}:${freight.revision}`,
        });

        const payload = { ok: true, freight: sanitizeFreightForUser(freight, user), historico: sub.historico };
        storeIdempotentResponse(idemKey, 200, payload);
        res.json(payload);
        return;
      }

      // ACTION 6: DEVOLVER_COMERCIAL
      if (action === 'DEVOLVER_COMERCIAL') {
        const cleanReason = String(reason || '').trim();
        if (cleanReason.length < 5) {
          res.status(400).json({
            error: 'Informe o motivo detalhado da devolução ao Comercial (mínimo 5 caracteres).',
            code: 'MISSING_RETURN_REASON',
          });
          return;
        }
        if (
          freight.situacaoOperacional === 'LIBERADO_MONITORAMENTO' ||
          freight.situacaoOperacional === 'CONCLUIDO'
        ) {
          res.status(400).json({
            error: 'Fretes já liberados ao monitoramento ou concluídos não podem ser devolvidos ao Comercial.',
          });
          return;
        }

        freight.devolvidoParaCorrecao = true;
        freight.motivoDevolucao = cleanReason.slice(0, 400);
        freight.situacaoOperacional = 'DEVOLVIDO_CORRECAO';
        freight.situacaoComercial = 'EM_NEGOCIACAO';
        freight.updatedAtIso = sp.iso;
        freight.updatedAtFormatted = sp.formatted;
        freight.revision += 1;

        appendHistoryEntry(sub, {
          actorId: user.id,
          actorName: user.name,
          actorSector: 'Expedição',
          eventType: 'DEVOLUCAO_COMERCIAL',
          summary: `Frete devolvido ao Comercial por ${user.name} para correção.`,
          reason: freight.motivoDevolucao,
        });

        persistFreightAndSubDoc(freight, sub);
        pushFreightNotification({
          recipientId: freight.comercialResponsavelId,
          title: `Frete ${freight.protocol} devolvido pela Expedição`,
          subtitle: `Motivo: ${freight.motivoDevolucao}`,
          dotColor: 'red',
          targetSection: 'fretes_comercial',
          targetId: freight.id,
          dedupeKey: `return:${freight.id}:${freight.revision}`,
        });

        const payload = { ok: true, freight: sanitizeFreightForUser(freight, user), historico: sub.historico };
        storeIdempotentResponse(idemKey, 200, payload);
        res.json(payload);
        return;
      }

      res.status(400).json({ error: 'Ação operacional da Expedição desconhecida.' });
    }
  );

  // --------------------------------------------------------------------------
  // 10B. OPERADOR DE MONITORAMENTO ACTIONS (FRETES ATIVOS)
  // Requirement 3: Stages, Real Event Time vs Registration Time, Informed Location,
  // Driver Instructions, Return to Expedição, and Finalize Validation
  // --------------------------------------------------------------------------
  app.post(
    '/api/meus-fretes/:freightId/monitoramento-action',
    requireApprovedSession,
    (req: any, res: Response) => {
      const user = req.sessionUser as Employee;
      const freightId = String(req.params.freightId || '');
      const freight = engineState().freightsIndex.get(freightId);
      if (!freight) {
        res.status(404).json({ error: 'Frete não encontrado.' });
        return;
      }

      const isAssignedOrManager =
        freight.monitoramentoResponsavelId === user.id || canViewFreightTeam(user);
      if (!canOperateMonitoring(user) || freight.monitoramentoResponsavelId !== user.id) {
        res.status(403).json({
          error:
            'Permissão negada: apenas o Operador de Monitoramento responsável ou a Gestão pode atualizar o acompanhamento deste frete.',
          code: 'FORBIDDEN_MONITORAMENTO_ACTION',
        });
        return;
      }

      const {
        action,
        targetStage,
        horarioRealEvento,
        observacoes,
        ultimaLocalizacaoInformada,
        orientacoesMotorista,
        dataColetaIso,
        janelaColetaInicio,
        dataEntregaPrevistaIso,
        janelaEntregaInicio,
        janelaEntregaFim,
        motivo,
        reason: rawReason,
        baseRevision,
      } = req.body || {};

      const idemKey = checkIdempotency(req, res, user.id);
      if (idemKey === '__HANDLED__') return;

      if (typeof baseRevision === 'number' && baseRevision !== freight.revision) {
        res.status(409).json({
          error: 'Conflito de revisão detectado. Recarregue os dados do frete antes de prosseguir.',
          code: 'REVISION_CONFLICT',
          currentRevision: freight.revision,
          freight: sanitizeFreightForUser(freight, user),
        });
        return;
      }

      const sp = formatSaoPauloDateTime();
      const sub = engineState().freightSubDocs.get(freight.id)!;
      const cleanRealTime = String(horarioRealEvento || sp.formatted).trim().slice(0, 60);
      const cleanObs = String(observacoes || rawReason || motivo || '').trim().slice(0, 500);

      // ACTION A: AVANCAR_ETAPA (Monitoring stage transitions)
      if (action === 'AVANCAR_ETAPA') {
        const validStages: MonitoringFreightStatus[] = [
          'NOVO_PARA_CARREGAR',
          'EM_DESLOCAMENTO_COLETA',
          'NO_LOCAL_COLETA',
          'CARREGADO_EM_TRANSPORTE',
          'NO_LOCAL_ENTREGA',
          'ENTREGUE',
          'FINALIZADO',
        ];
        if (!validStages.includes(targetStage)) {
          res.status(400).json({ error: 'Etapa de monitoramento inválida.' });
          return;
        }

        const stageLabels: Record<MonitoringFreightStatus, string> = {
          NAO_LIBERADO: 'Não liberado',
          NOVO_PARA_CARREGAR: 'Novo para carregar',
          EM_DESLOCAMENTO_COLETA: 'Em deslocamento para coleta',
          NO_LOCAL_COLETA: 'No local de coleta',
          CARREGADO_EM_TRANSPORTE: 'Carregado / Em transporte',
          NO_LOCAL_ENTREGA: 'No local de entrega',
          ENTREGUE: 'Entregue',
          FINALIZADO: 'Finalizado',
          DEVOLVIDO_EXPEDICAO: 'Devolvido à Expedição',
          CANCELADO: 'Cancelado',
        };

        const currentIndex=validStages.indexOf(freight.situacaoMonitoramento || 'NAO_LIBERADO');
        const nextIndex=validStages.indexOf(targetStage);
        if(nextIndex===currentIndex) {res.json({ok:true,freight:sanitizeFreightForUser(freight,user),historico:sub.historico});return;}
        if(nextIndex!==currentIndex+1) {res.status(409).json({error:'Transição fora da sequência operacional.'});return;}
        if(nextIndex>=3 && (!freight.enderecoEntrega || freight.enderecoEntrega.trim().length<10)) {res.status(400).json({error:'Confirme o endereço detalhado de entrega antes de avançar.'});return;}
        // Special validation for FINALIZADO:
        // "Para finalizar o monitoramento, exigir confirmação de entrega, comprovante conferido e ausência de pendências impeditivas abertas. Finalizar o monitoramento não altera automaticamente o status de pagamento do Financeiro."
        if (targetStage === 'FINALIZADO') {
          const openImpeditivas = sub.ocorrencias.filter(
            (o) => !o.resolved && o.severity === 'IMPEDITIVA'
          );
          if (openImpeditivas.length > 0) {
            res.status(400).json({
              error: `Não é possível finalizar o monitoramento: existem ${openImpeditivas.length} pendência(s)/ocorrência(s) impeditiva(s) em aberto.`,
              code: 'BLOCKING_OCCURRENCES_OPEN',
            });
            return;
          }

          const verifiedDeliveryProof = sub.anexos.find(
            (a) => a.category === 'COMPROVANTE_ENTREGA' && a.conferido === true
          );
          if (!verifiedDeliveryProof) {
            res.status(400).json({
              error:
                'Finalização recusada: é obrigatório anexar e conferir o Comprovante de Entrega antes de finalizar o monitoramento.',
              code: 'MISSING_VERIFIED_DELIVERY_PROOF',
            });
            return;
          }

          freight.situacaoMonitoramento = 'FINALIZADO';
          freight.situacaoOperacional = 'CONCLUIDO';
          freight.situacaoComercial = 'FINALIZADO';
          freight.entregaComprovadaEm = cleanRealTime;
          freight.comprovanteEntregaConferido = true;
          freight.comprovanteEntregaAnexoId = verifiedDeliveryProof.id;
          // Financial status remains strictly independent!
        } else {
          freight.situacaoMonitoramento = targetStage;
          freight.situacaoComercial = 'EM_MONITORAMENTO';
          freight.situacaoOperacional = 'LIBERADO_MONITORAMENTO';

        if (targetStage === 'CARREGADO_EM_TRANSPORTE' && !freight.coletaConfirmadaEm) {
            freight.coletaConfirmadaEm = cleanRealTime;
          }
          if (targetStage === 'ENTREGUE') {
            freight.entregaComprovadaEm = cleanRealTime;
          }
        }

        if (ultimaLocalizacaoInformada !== undefined && String(ultimaLocalizacaoInformada).trim()) {
          freight.ultimaLocalizacaoInformada = String(ultimaLocalizacaoInformada).trim().slice(0, 200);
          freight.ultimaLocalizacaoAtualizadaEm = sp.formatted;
          freight.ultimaLocalizacaoAtualizadaPor = user.name;
        }

        freight.updatedAtIso = sp.iso;
        freight.updatedAtFormatted = sp.formatted;
        freight.revision += 1;

        appendHistoryEntry(sub, {
          actorId: user.id,
          actorName: user.name,
          actorSector: 'Monitoramento',
          eventType: targetStage === 'FINALIZADO' ? 'CONCLUSAO_OPERACAO' : 'AVANCO_MONITORAMENTO',
          summary: `Etapa de monitoramento atualizada para "${stageLabels[targetStage as MonitoringFreightStatus]}" por ${user.name}. Horário real do evento: ${cleanRealTime}.${cleanObs ? ` Obs: ${cleanObs}` : ''}`,
          horarioRealEvento: cleanRealTime,
          reason: cleanObs || undefined,
        });

        persistFreightAndSubDoc(freight, sub);

          if(freight.expedicaoResponsavelId) pushFreightNotification({recipientId:freight.expedicaoResponsavelId,title:'Monitoramento atualizado',subtitle:freight.protocol+' • '+targetStage,dotColor:'blue',targetSection:'fretes_expedicao',targetId:freight.id,dedupeKey:'mon-exp:'+freight.id+':'+freight.revision});
        if (targetStage === 'CARREGADO_EM_TRANSPORTE' || targetStage === 'ENTREGUE') {
          const installment=targetStage==='CARREGADO_EM_TRANSPORTE'?'ADIANTAMENTO':'SALDO';
          if(installment!=='SALDO'||expeditionPaymentMode(freight.condicoesPagamento)!=='Integral (100%)')
          for(const person of getAllServerUsers().filter(u=>u.active&&u.approvalStatus==='APROVADO'&&u.accessProfile==='FINANCEIRO')) pushFreightNotification({recipientId:person.id,title:`${freight.protocol} — ${installment==='ADIANTAMENTO'?'Coleta registrada: conferir adiantamento':'Entrega registrada: conferir saldo'}`,subtitle:`${freight.cliente} • Motorista: ${freight.motoristaNome||'Não informado'} • Conferir documentos e pagamento no Financeiro.`,dotColor:'blue',targetSection:'financeiro',targetId:freight.id,dedupeKey:`finance-installment:${freight.id}:${installment}`});
        }
        if (targetStage === 'CARREGADO_EM_TRANSPORTE' || targetStage === 'ENTREGUE' || targetStage === 'FINALIZADO') {
          pushFreightNotification({
            recipientId: freight.comercialResponsavelId,
            title: `Frete ${freight.protocol} — ${stageLabels[targetStage as MonitoringFreightStatus]}`,
            subtitle: `Atualizado por ${user.name} (Monitoramento) • Horário do evento: ${cleanRealTime}.`,
            dotColor: 'blue',
            targetSection: 'fretes_comercial',
            targetId: freight.id,
            dedupeKey: `monstage:${freight.id}:${targetStage}:${freight.revision}`,
          });
        }

        const payload = {
          ok: true,
          freight: sanitizeFreightForUser(freight, user),
          historico: sub.historico,
        };
        storeIdempotentResponse(idemKey, 200, payload);
        res.json(payload);
        return;
      }

      // ACTION B: REGISTRAR_LOCALIZACAO_ORIENTACAO (Informed location, driver guidance & forecast update)
      if (action === 'REGISTRAR_LOCALIZACAO_ORIENTACAO') {
        if (req.body.enderecoEntrega !== undefined) {
          const address=String(req.body.enderecoEntrega).trim();
          if(address.length<10 || address.length>240) {res.status(400).json({error:'Informe endereço detalhado de entrega (10 a 240 caracteres).'});return;}
          freight.enderecoEntrega=address;
        }
        const changes: string[] = [];
        if (ultimaLocalizacaoInformada !== undefined) {
          const loc = String(ultimaLocalizacaoInformada).trim().slice(0, 200);
          freight.ultimaLocalizacaoInformada = loc || undefined;
          freight.ultimaLocalizacaoAtualizadaEm = sp.formatted;
          freight.ultimaLocalizacaoAtualizadaPor = user.name;
          if (loc) changes.push(`Localização informada: "${loc}"`);
        }
        if (orientacoesMotorista !== undefined) {
          const ori = String(orientacoesMotorista).trim().slice(0, 1000);
          freight.orientacoesMotorista = ori || undefined;
          if (ori) changes.push(`Contato/orientação ao motorista registrado`);
        }
        if (dataColetaIso !== undefined && String(dataColetaIso).trim()) {
          freight.dataColetaIso = String(dataColetaIso).slice(0, 10);
          if (janelaColetaInicio) {
            freight.janelaColetaInicio = String(janelaColetaInicio).slice(0, 5);
          }
          changes.push(`Previsão de coleta: ${freight.dataColetaIso} ${freight.janelaColetaInicio}`);
        }
        if (dataEntregaPrevistaIso !== undefined && String(dataEntregaPrevistaIso).trim()) {
          freight.dataEntregaPrevistaIso = String(dataEntregaPrevistaIso).slice(0, 10);
          if (janelaEntregaInicio) {
            freight.janelaEntregaInicio = String(janelaEntregaInicio).slice(0, 5);
          }
          if (janelaEntregaFim) {
            freight.janelaEntregaFim = String(janelaEntregaFim).slice(0, 5);
          }
          changes.push(`Previsão de entrega: ${freight.dataEntregaPrevistaIso} ${freight.janelaEntregaInicio}`);
        }

        freight.updatedAtIso = sp.iso;
        freight.updatedAtFormatted = sp.formatted;
        freight.revision += 1;

        appendHistoryEntry(sub, {
          actorId: user.id,
          actorName: user.name,
          actorSector: 'Monitoramento',
          eventType: 'REGISTRO_LOCALIZACAO',
          summary:
            changes.length > 0
              ? `Acompanhamento registrado por ${user.name}: ${changes.join(' • ')}.`
              : `Acompanhamento atualizado por ${user.name}.`,
          horarioRealEvento: cleanRealTime,
          reason: cleanObs || undefined,
        });

        persistFreightAndSubDoc(freight, sub);
        const payload = {
          ok: true,
          freight: sanitizeFreightForUser(freight, user),
          historico: sub.historico,
        };
        storeIdempotentResponse(idemKey, 200, payload);
        res.json(payload);
        return;
      }

      // ACTION C: DEVOLVER_EXPEDICAO ("Devolver à Expedição para correção, com motivo obrigatório")
      if (action === 'DEVOLVER_EXPEDICAO') {
        if (cleanObs.length < 5) {
          res.status(400).json({
            error: 'Informe o motivo obrigatório para devolver o frete à Expedição (mínimo 5 caracteres).',
            code: 'MISSING_RETURN_REASON',
          });
          return;
        }

        freight.devolvidoParaCorrecao = true;
        freight.motivoDevolucao = cleanObs;
        freight.situacaoOperacional = 'EM_PREPARACAO';
        freight.situacaoMonitoramento = 'DEVOLVIDO_EXPEDICAO';
        freight.situacaoComercial = 'AGUARDANDO_EXPEDICAO';
        freight.updatedAtIso = sp.iso;
        freight.updatedAtFormatted = sp.formatted;
        freight.revision += 1;

        appendHistoryEntry(sub, {
          actorId: user.id,
          actorName: user.name,
          actorSector: 'Monitoramento',
          eventType: 'DEVOLUCAO_EXPEDICAO',
          summary: `Frete devolvido pelo Operador de Monitoramento (${user.name}) à Expedição para correção.`,
          reason: cleanObs,
        });

        persistFreightAndSubDoc(freight, sub);

        if (freight.expedicaoResponsavelId) {
          pushFreightNotification({
            recipientId: freight.expedicaoResponsavelId,
            title: `Frete ${freight.protocol} devolvido pelo Monitoramento`,
            subtitle: `Devolvido por ${user.name}. Motivo: ${cleanObs}`,
            dotColor: 'red',
            targetSection: 'fretes_expedicao',
            targetId: freight.id,
            dedupeKey: `mon-ret-exp:${freight.id}:${freight.revision}`,
          });
        }

        const payload = {
          ok: true,
          freight: sanitizeFreightForUser(freight, user),
          historico: sub.historico,
        };
        storeIdempotentResponse(idemKey, 200, payload);
        res.json(payload);
        return;
      }

      res.status(400).json({ error: 'Ação de monitoramento desconhecida.' });
    }
  );

  // --------------------------------------------------------------------------
  // 11. OCCURRENCES (REGISTRAR & RESOLVER OCORRÊNCIA)
  // --------------------------------------------------------------------------
  app.post(
    '/api/meus-fretes/:freightId/occurrences',
    requireApprovedSession,
    (req: any, res: Response) => {
      const user = req.sessionUser as Employee;
      const freightId = String(req.params.freightId || '');
      const freight = engineState().freightsIndex.get(freightId);
      if (!freight) {
        res.status(404).json({ error: 'Frete não encontrado.' });
        return;
      }

      if (!canUserAccessFreightRecord(freight, user)) {
        res.status(403).json({ error: 'Sem permissão para registrar ocorrência neste frete.' });
        return;
      }

      const idemKey = checkIdempotency(req, res, user.id);
      if (idemKey === '__HANDLED__') return;

      const { title, description, severity, horarioRealEvento } = req.body || {};
      const cleanTitle = String(title || '').trim();
      const cleanDesc = String(description || '').trim();
      if (cleanTitle.length < 3) {
        res.status(400).json({ error: 'Informe o título da ocorrência (mínimo 3 caracteres).' });
        return;
      }

      const safeSeverity: 'BAIXA' | 'MEDIA' | 'IMPEDITIVA' = ['BAIXA', 'MEDIA', 'IMPEDITIVA'].includes(
        severity
      )
        ? severity
        : 'MEDIA';

      const sp = formatSaoPauloDateTime();
      const sub = engineState().freightSubDocs.get(freight.id)!;
      const occ: UnifiedFreightOccurrence = {
        id: `focc-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        freightId: freight.id,
        severity: safeSeverity,
        title: cleanTitle.slice(0, 140),
        description: cleanDesc.slice(0, 800),
        resolved: false,
        createdById: user.id,
        createdByName: user.name,
        createdAtIso: sp.iso,
        createdAtFormatted: sp.formatted,
      };
      sub.ocorrencias.unshift(occ);

      freight.updatedAtIso = sp.iso;
      freight.updatedAtFormatted = sp.formatted;
      freight.revision += 1;

      const actorSector: 'Comercial' | 'Expedição' | 'Monitoramento' =
        freight.monitoramentoResponsavelId === user.id
          ? 'Monitoramento'
          : canAccessExpedicaoFreights(user)
          ? 'Expedição'
          : 'Comercial';

      appendHistoryEntry(sub, {
        actorId: user.id,
        actorName: user.name,
        actorSector,
        eventType: 'OCORRENCIA',
        summary: `Ocorrência registrada (${safeSeverity}): ${occ.title}`,
        reason: occ.description || undefined,
        horarioRealEvento: horarioRealEvento ? String(horarioRealEvento).slice(0, 60) : sp.formatted,
      });

      persistFreightAndSubDoc(freight, sub);

      // Notify Comercial, Expedição and Monitoramento responsibles
      if (freight.comercialResponsavelId && freight.comercialResponsavelId !== user.id) {
        pushFreightNotification({
          recipientId: freight.comercialResponsavelId,
          title: `Ocorrência no Frete ${freight.protocol} (${safeSeverity})`,
          subtitle: `${occ.title} — registrada por ${user.name}`,
          dotColor: safeSeverity === 'IMPEDITIVA' ? 'red' : 'blue',
          targetSection: 'fretes_comercial',
          targetId: freight.id,
          dedupeKey: `occ:${occ.id}:com`,
        });
      }
      if (freight.expedicaoResponsavelId && freight.expedicaoResponsavelId !== user.id) {
        pushFreightNotification({
          recipientId: freight.expedicaoResponsavelId,
          title: `Ocorrência no Frete ${freight.protocol} (${safeSeverity})`,
          subtitle: `${occ.title} — registrada por ${user.name}`,
          dotColor: safeSeverity === 'IMPEDITIVA' ? 'red' : 'blue',
          targetSection: 'fretes_expedicao',
          targetId: freight.id,
          dedupeKey: `occ:${occ.id}:exp`,
        });
      }
      if (freight.monitoramentoResponsavelId && freight.monitoramentoResponsavelId !== user.id) {
        pushFreightNotification({
          recipientId: freight.monitoramentoResponsavelId,
          title: `Ocorrência no Frete ${freight.protocol} (${safeSeverity})`,
          subtitle: `${occ.title} — registrada por ${user.name}`,
          dotColor: safeSeverity === 'IMPEDITIVA' ? 'red' : 'blue',
          targetSection: 'fretes_ativos',
          targetId: freight.id,
          dedupeKey: `occ:${occ.id}:mon`,
        });
      }

      const payload = {
        ok: true,
        occurrence: occ,
        freight: sanitizeFreightForUser(freight, user),
        ocorrencias: sub.ocorrencias,
        historico: sub.historico,
      };
      storeIdempotentResponse(idemKey, 201, payload);
      res.status(201).json(payload);
    }
  );

  app.post(
    '/api/meus-fretes/:freightId/occurrences/:occId/resolve',
    requireApprovedSession,
    (req: any, res: Response) => {
      const user = req.sessionUser as Employee;
      const freightId = String(req.params.freightId || '');
      const occId = String(req.params.occId || '');
      const freight = engineState().freightsIndex.get(freightId);
      if (!freight) {
        res.status(404).json({ error: 'Frete não encontrado.' });
        return;
      }
      if (!canUserAccessFreightRecord(freight, user)) {
        res.status(403).json({ error: 'Sem permissão para resolver ocorrência neste frete.' });
        return;
      }

      const sub = engineState().freightSubDocs.get(freight.id)!;
      const occ = sub.ocorrencias.find((o) => o.id === occId);
      if (!occ) {
        res.status(404).json({ error: 'Ocorrência não encontrada.' });
        return;
      }

      const sp = formatSaoPauloDateTime();
      occ.resolved = true;
      occ.resolvedById = user.id;
      occ.resolvedByName = user.name;
      occ.resolvedAtFormatted = sp.formatted;

      freight.updatedAtIso = sp.iso;
      freight.updatedAtFormatted = sp.formatted;
      freight.revision += 1;

      appendHistoryEntry(sub, {
        actorId: user.id,
        actorName: user.name,
        actorSector:
          freight.monitoramentoResponsavelId === user.id
            ? 'Monitoramento'
            : canAccessExpedicaoFreights(user)
            ? 'Expedição'
            : 'Comercial',
        eventType: 'RESOLUCAO_OCORRENCIA',
        summary: `Ocorrência resolvida por ${user.name}: ${occ.title}`,
      });

      persistFreightAndSubDoc(freight, sub);
      res.json({
        ok: true,
        freight: sanitizeFreightForUser(freight, user),
        ocorrencias: sub.ocorrencias,
        historico: sub.historico,
      });
    }
  );

  // --------------------------------------------------------------------------
  // 12. COMMENTS (COMENTÁRIOS DO FRETE)
  // --------------------------------------------------------------------------
  app.post(
    '/api/meus-fretes/:freightId/comments',
    requireApprovedSession,
    (req: any, res: Response) => {
      const user = req.sessionUser as Employee;
      const freightId = String(req.params.freightId || '');
      const freight = engineState().freightsIndex.get(freightId);
      if (!freight) {
        res.status(404).json({ error: 'Frete não encontrado.' });
        return;
      }
      if (!canUserAccessFreightRecord(freight, user)) {
        res.status(403).json({ error: 'Acesso negado a este frete.' });
        return;
      }

      const idemKey = checkIdempotency(req, res, user.id);
      if (idemKey === '__HANDLED__') return;

      const text = String(req.body?.text || '').trim();
      if (!text) {
        res.status(400).json({ error: 'Digite o conteúdo do comentário.' });
        return;
      }

      const sp = formatSaoPauloDateTime();
      const sub = engineState().freightSubDocs.get(freight.id)!;
      const sector: 'COMERCIAL' | 'EXPEDICAO' | 'GESTAO' =
        user.accessLevel !== 'FUNCIONARIO'
          ? 'GESTAO'
          : (canAccessExpedicaoFreights(user) && freight.expedicaoResponsavelId === user.id) ||
            freight.monitoramentoResponsavelId === user.id
          ? 'EXPEDICAO'
          : 'COMERCIAL';

      const comment: UnifiedFreightComment = {
        id: `fcom-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        freightId: freight.id,
        authorId: user.id,
        authorName: user.name,
        authorRole: user.roleTitle,
        sector,
        text: text.slice(0, 1500),
        createdAtIso: sp.iso,
        createdAtFormatted: sp.formatted,
      };
      sub.comentarios.push(comment);
      freight.updatedAtIso = sp.iso;
      freight.updatedAtFormatted = sp.formatted;
      freight.revision += 1;

      persistFreightAndSubDoc(freight, sub);
      const payload = {
        ok: true,
        comment,
        freight: sanitizeFreightForUser(freight, user),
        comentarios: sub.comentarios,
      };
      storeIdempotentResponse(idemKey, 201, payload);
      res.status(201).json(payload);
    }
  );

  // --------------------------------------------------------------------------
  // 13. ATTACHMENTS (UPLOAD TO SERVER FILE STORAGE, VERIFY & PROTECTED DOWNLOAD)
  // --------------------------------------------------------------------------
  app.post(
    '/api/meus-fretes/:freightId/attachments',
    requireApprovedSession,
    (req: any, res: Response) => {
      const user = req.sessionUser as Employee;
      const freightId = String(req.params.freightId || '');
      const freight = engineState().freightsIndex.get(freightId);
      if (!freight) {
        res.status(404).json({ error: 'Frete não encontrado.' });
        return;
      }
      if (!canUserAccessFreightRecord(freight, user)) {
        res.status(403).json({
          error: 'Permissão negada para enviar anexos neste frete.',
          code: 'FORBIDDEN_ATTACHMENT_UPLOAD',
        });
        return;
      }

      const idemKey = checkIdempotency(req, res, user.id);
      if (idemKey === '__HANDLED__') return;

      const { category, label, fileName, dataUrl } = req.body || {};
      if (typeof dataUrl !== 'string' || !dataUrl.includes(',')) {
        res.status(400).json({ error: 'Envie um arquivo válido (PDF, PNG, JPEG ou WebP).' });
        return;
      }

      const base64Part = dataUrl.slice(dataUrl.indexOf(',') + 1);
      let fileBuf: Buffer;
      try {
        fileBuf = Buffer.from(base64Part, 'base64');
      } catch {
        res.status(400).json({ error: 'Falha ao decodificar o arquivo enviado.' });
        return;
      }

      const cleanOriginalName = String(fileName || 'documento.pdf')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .slice(0, 120);
      const validation = validateAttachmentFileBuffer(fileBuf, cleanOriginalName);
      if (!validation.valid || !validation.extension || !validation.mimeType) {
        res.status(400).json({
          error: validation.error || 'Arquivo inválido.',
          code: 'INVALID_ATTACHMENT_FORMAT',
        });
        return;
      }

      const validCategories: FreightAttachmentCategory[] = [
        'COMERCIAL',
        'CTE',
        'MDFE',
        'RPA',
        'COMPROVANTE_ENTREGA',
        'ORDEM_CARREGAMENTO',
        'OUTRO',
      ];
      const safeCat: FreightAttachmentCategory = validCategories.includes(category)
        ? category
        : 'OUTRO';

      ensureDirectories();
      const storageName = `fdoc-${freight.id}-${crypto.randomUUID()}.${validation.extension}`;
      const diskPath = path.join(FREIGHT_ATTACHMENTS_DIR, storageName);
      fs.writeFileSync(diskPath, fileBuf);

      const sp = formatSaoPauloDateTime();
      const sizeKb = Math.max(1, Math.round(fileBuf.length / 1024));
      const attachment: UnifiedFreightAttachment = {
        id: `fatt-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        freightId: freight.id,
        category: safeCat,
        label: String(label || safeCat).trim().slice(0, 80),
        fileName: cleanOriginalName,
        storageName,
        mimeType: validation.mimeType,
        sizeBytes: fileBuf.length,
        sizeLabel: sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`,
        conferido: false, // Never assume verified merely by upload!
        uploadedById: user.id,
        uploadedByName: user.name,
        uploadedAtIso: sp.iso,
        uploadedAtFormatted: sp.formatted,
      };

      const sub = engineState().freightSubDocs.get(freight.id)!;
      sub.anexos.unshift(attachment);
      freight.updatedAtIso = sp.iso;
      freight.updatedAtFormatted = sp.formatted;
      freight.revision += 1;

      appendHistoryEntry(sub, {
        actorId: user.id,
        actorName: user.name,
        actorSector:
          freight.monitoramentoResponsavelId === user.id
            ? 'Monitoramento'
            : canAccessExpedicaoFreights(user)
            ? 'Expedição'
            : 'Comercial',
        eventType: 'UPLOAD_ANEXO',
        summary: `Anexo adicionado (${attachment.label}: ${attachment.fileName}, ${attachment.sizeLabel}) — aguardando conferência.`,
      });

      persistFreightAndSubDoc(freight, sub);
      const payload = {
        ok: true,
        attachment,
        freight: sanitizeFreightForUser(freight, user),
        anexos: sub.anexos,
        historico: sub.historico,
      };
      storeIdempotentResponse(idemKey, 201, payload);
      res.status(201).json(payload);
    }
  );

  // Verify (conferir) attachment explicitly by Expedição or Operador de Monitoramento
  app.post(
    '/api/meus-fretes/:freightId/attachments/:attId/verify',
    requireApprovedSession,
    (req: any, res: Response) => {
      const user = req.sessionUser as Employee;
      const freightId = String(req.params.freightId || '');
      const attId = String(req.params.attId || '');
      const freight = engineState().freightsIndex.get(freightId);
      if (!freight) {
        res.status(404).json({ error: 'Frete não encontrado.' });
        return;
      }

      const isAssignedOrManager =
        freight.expedicaoResponsavelId === user.id ||
        freight.monitoramentoResponsavelId === user.id ||
        canViewFreightTeam(user);
      const hasOperationalPerm =
        canAccessExpedicaoFreights(user) || canAccessMonitoramentoFreights(user);
      if (!hasOperationalPerm || !isAssignedOrManager) {
        res.status(403).json({
          error:
            'Apenas o responsável da Expedição ou do Monitoramento pode atestar a conferência de documentos.',
          code: 'FORBIDDEN_VERIFY_ATTACHMENT',
        });
        return;
      }

      const sub = engineState().freightSubDocs.get(freight.id)!;
      const att = sub.anexos.find((a) => a.id === attId);
      if (!att) {
        res.status(404).json({ error: 'Anexo não encontrado.' });
        return;
      }

      const sp = formatSaoPauloDateTime();
      att.conferido = Boolean(req.body?.conferido ?? true);
      att.conferidoPorId = user.id;
      att.conferidoPorNome = user.name;
      att.conferidoEmFormatado = sp.formatted;

      if (att.category === 'COMPROVANTE_ENTREGA') {
        freight.comprovanteEntregaConferido = att.conferido;
        freight.comprovanteEntregaAnexoId = att.conferido ? att.id : undefined;
      }

      freight.updatedAtIso = sp.iso;
      freight.updatedAtFormatted = sp.formatted;
      freight.revision += 1;

      appendHistoryEntry(sub, {
        actorId: user.id,
        actorName: user.name,
        actorSector:
          freight.monitoramentoResponsavelId === user.id ? 'Monitoramento' : 'Expedição',
        eventType: 'CONFERENCIA_ANEXO',
        summary: `Documento "${att.fileName}" (${att.label}) marcado como ${att.conferido ? 'CONFERIDO' : 'PENDENTE DE CONFERÊNCIA'} por ${user.name}.`,
      });

      persistFreightAndSubDoc(freight, sub);
      res.json({
        ok: true,
        attachment: att,
        freight: sanitizeFreightForUser(freight, user),
        anexos: sub.anexos,
        historico: sub.historico,
      });
    }
  );

  // Protected download endpoint
  app.get(
    [
      '/api/meus-fretes/:freightId/attachments/:attId/file',
      '/api/meus-fretes/:freightId/attachments/:attId/download',
    ],
    requireApprovedSession,
    (req: any, res: Response) => {
      const user = req.sessionUser as Employee;
      const freightId = String(req.params.freightId || '');
      const attId = String(req.params.attId || '');
      const freight = engineState().freightsIndex.get(freightId);
      if (!freight) {
        res.status(404).json({ error: 'Frete não encontrado.' });
        return;
      }

      const isSharedUnclaimed =
        freight.expedicaoResponsavelId === null &&
        freight.comercialResponsavelId !== user.id &&
        freight.monitoramentoResponsavelId !== user.id &&
        !canViewFreightTeam(user);
      if (!canUserAccessFreightRecord(freight, user) || isSharedUnclaimed) {
        res.status(403).json({
          error: 'Acesso negado: você não possui autorização para baixar documentos deste frete.',
          code: 'FORBIDDEN_DOCUMENT_DOWNLOAD',
        });
        return;
      }

      const sub = engineState().freightSubDocs.get(freight.id);
      const att = sub?.anexos.find((a) => a.id === attId);
      if (!att) {
        res.status(404).json({ error: 'Anexo não encontrado.' });
        return;
      }

      const diskPath = path.join(FREIGHT_ATTACHMENTS_DIR, path.basename(att.storageName));
      if (!fs.existsSync(diskPath)) {
        res.status(404).json({ error: 'Arquivo físico não encontrado no armazenamento do servidor.' });
        return;
      }

      res.setHeader('Content-Type', att.mimeType);
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${encodeURIComponent(att.fileName)}"`
      );
      res.setHeader('Cache-Control', 'private, no-store');
      fs.createReadStream(diskPath).pipe(res);
    }
  );

  // Delete single attachment (Requirement 4)
  app.delete(
    '/api/meus-fretes/:freightId/attachments/:attId',
    requireApprovedSession,
    (req: any, res: Response) => {
      const user = req.sessionUser as Employee;
      const freightId = String(req.params.freightId || '');
      const attId = String(req.params.attId || '');
      const freight = engineState().freightsIndex.get(freightId);
      if (!freight) {
        res.status(404).json({ error: 'Frete não encontrado.' });
        return;
      }

      const isAssignedOrManager =
        freight.comercialResponsavelId === user.id ||
        freight.expedicaoResponsavelId === user.id ||
        freight.monitoramentoResponsavelId === user.id ||
        user.accessLevel === 'ADMINISTRADOR' ||
        user.accessLevel === 'DIRETORIA' ||
        canViewFreightTeam(user);

      if (!isAssignedOrManager) {
        res.status(403).json({
          error: 'Permissão negada para remover anexos deste frete.',
          code: 'FORBIDDEN_DELETE_ATTACHMENT',
        });
        return;
      }

      const sub = engineState().freightSubDocs.get(freight.id)!;
      const attIdx = sub.anexos.findIndex((a) => a.id === attId);
      if (attIdx === -1) {
        res.status(404).json({ error: 'Anexo não encontrado.' });
        return;
      }

      const att = sub.anexos[attIdx];
      try {
        const diskPath = path.join(FREIGHT_ATTACHMENTS_DIR, path.basename(att.storageName));
        if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
      } catch {
        // ignore disk error
      }

      sub.anexos.splice(attIdx, 1);
      const sp = formatSaoPauloDateTime();
      freight.updatedAtIso = sp.iso;
      freight.updatedAtFormatted = sp.formatted;
      freight.revision += 1;

      appendHistoryEntry(sub, {
        actorId: user.id,
        actorName: user.name,
        actorSector: user.department || 'Operacional',
        eventType: 'EXCLUSAO_ANEXO',
        summary: `Documento "${att.fileName}" (${att.label}) excluído por ${user.name}.`,
      });

      persistFreightAndSubDoc(freight, sub);
      res.json({
        ok: true,
        freight: sanitizeFreightForUser(freight, user),
        anexos: sub.anexos,
        historico: sub.historico,
      });
    }
  );

  // Bulk delete all attachments (Requirement 4: requires confirmation and permission)
  app.delete(
    '/api/meus-fretes/:freightId/attachments',
    requireApprovedSession,
    (req: any, res: Response) => {
      const user = req.sessionUser as Employee;
      const freightId = String(req.params.freightId || '');
      const freight = engineState().freightsIndex.get(freightId);
      if (!freight) {
        res.status(404).json({ error: 'Frete não encontrado.' });
        return;
      }

      const isAuthorized =
        user.accessLevel === 'ADMINISTRADOR' ||
        user.accessLevel === 'DIRETORIA' ||
        freight.comercialResponsavelId === user.id ||
        freight.expedicaoResponsavelId === user.id;

      if (!isAuthorized) {
        res.status(403).json({
          error: 'Permissão negada para excluir todos os documentos salvos.',
          code: 'FORBIDDEN_BULK_DELETE_ATTACHMENTS',
        });
        return;
      }

      const sub = engineState().freightSubDocs.get(freight.id)!;
      const count = sub.anexos.length;

      for (const att of sub.anexos) {
        try {
          const diskPath = path.join(FREIGHT_ATTACHMENTS_DIR, path.basename(att.storageName));
          if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
        } catch {}
      }

      sub.anexos = [];
      const sp = formatSaoPauloDateTime();
      freight.updatedAtIso = sp.iso;
      freight.updatedAtFormatted = sp.formatted;
      freight.revision += 1;

      appendHistoryEntry(sub, {
        actorId: user.id,
        actorName: user.name,
        actorSector: user.department || 'Operacional',
        eventType: 'EXCLUSAO_TODOS_ANEXOS',
        summary: `Todos os ${count} documentos salvos foram excluídos por ${user.name}.`,
      });

      persistFreightAndSubDoc(freight, sub);
      res.json({
        ok: true,
        freight: sanitizeFreightForUser(freight, user),
        anexos: [],
        historico: sub.historico,
      });
    }
  );

  // --------------------------------------------------------------------------
  // 14. TRANSFER RESPONSIBILITY (COMERCIAL, EXPEDIÇÃO OR MONITORAMENTO)
  // --------------------------------------------------------------------------
  app.post(
    '/api/meus-fretes/:freightId/transfer',
    requireApprovedSession,
    (req: any, res: Response) => {
      const user = req.sessionUser as Employee;
      const freightId = String(req.params.freightId || '');
      const freight = engineState().freightsIndex.get(freightId);
      if (!freight) {
        res.status(404).json({ error: 'Frete não encontrado.' });
        return;
      }

      const canTransfer =
        user.accessLevel === 'ADMINISTRADOR' ||
        user.accessLevel === 'DIRETORIA' ||
        hasPagePermission(user, 'fretes_transferir') ||
        canViewFreightTeam(user);

      if (!canTransfer || !canUserAccessFreightRecord(freight, user)) {
        res.status(403).json({
          error:
            'Permissão negada: sua conta não possui autorização para transferir responsabilidade de fretes.',
          code: 'FORBIDDEN_TRANSFER',
        });
        return;
      }

      const { sector, newResponsibleId, reason, baseRevision } = req.body || {};
      if (typeof baseRevision === 'number' && baseRevision !== freight.revision) {
        res.status(409).json({
          error: 'Conflito de revisão detectado. Recarregue os dados do frete.',
          code: 'REVISION_CONFLICT',
        });
        return;
      }

      const cleanReason = String(reason || '').trim();
      if (cleanReason.length < 5) {
        res.status(400).json({
          error: 'Informe o motivo da transferência de responsabilidade (mínimo 5 caracteres).',
          code: 'MISSING_TRANSFER_REASON',
        });
        return;
      }

      const targetUser = getAllServerUsers().find(
        (u) => u.id === String(newResponsibleId || '') && u.approvalStatus === 'APROVADO' && u.active
      );
      if (!targetUser) {
        res.status(404).json({ error: 'Novo responsável não encontrado ou conta inativa.' });
        return;
      }

      const sp = formatSaoPauloDateTime();
      const sub = engineState().freightSubDocs.get(freight.id)!;
      const targetSector = String(sector || 'EXPEDICAO').toUpperCase();

      if (targetSector === 'COMERCIAL') {
        if (!canAccessComercialFreights(targetUser)) {
          res.status(400).json({
            error: 'O funcionário selecionado não possui permissão para o módulo Comercial.',
          });
          return;
        }
        const prevName = freight.comercialResponsavelNome;
        freight.comercialResponsavelId = targetUser.id;
        freight.comercialResponsavelNome = targetUser.name;
        freight.updatedAtIso = sp.iso;
        freight.updatedAtFormatted = sp.formatted;
        freight.revision += 1;

        appendHistoryEntry(sub, {
          actorId: user.id,
          actorName: user.name,
          actorSector: 'Comercial',
          eventType: 'TRANSFERENCIA',
          summary: `Responsabilidade comercial transferida de ${prevName} para ${targetUser.name}.`,
          reason: cleanReason.slice(0, 300),
          previousResponsibleName: prevName,
          newResponsibleName: targetUser.name,
        });

        pushFreightNotification({
          recipientId: targetUser.id,
          title: `Frete ${freight.protocol} transferido para sua carteira Comercial`,
          subtitle: `Transferido por ${user.name}. Motivo: ${cleanReason}`,
          dotColor: 'blue',
          targetSection: 'fretes_comercial',
          targetId: freight.id,
          dedupeKey: `xfer:com:${freight.id}:${freight.revision}`,
        });
      } else if (targetSector === 'MONITORAMENTO') {
        if (!canOperateMonitoring(targetUser)) {
          res.status(400).json({
            error: 'O funcionário selecionado não possui permissão para o Monitoramento de Fretes.',
          });
          return;
        }
        const prevName = freight.monitoramentoResponsavelNome || 'Não definido';
        freight.monitoramentoResponsavelId = targetUser.id;
        freight.monitoramentoResponsavelNome = targetUser.name;
        freight.updatedAtIso = sp.iso;
        freight.updatedAtFormatted = sp.formatted;
        freight.revision += 1;

        appendHistoryEntry(sub, {
          actorId: user.id,
          actorName: user.name,
          actorSector: 'Monitoramento',
          eventType: 'TRANSFERENCIA',
          summary: `Responsabilidade de Monitoramento transferida de ${prevName} para ${targetUser.name}. Vínculos Comercial (${freight.comercialResponsavelNome}) e Expedição (${freight.expedicaoResponsavelNome || '—'}) preservados.`,
          reason: cleanReason.slice(0, 300),
          previousResponsibleName: prevName,
          newResponsibleName: targetUser.name,
        });

        pushFreightNotification({
          recipientId: targetUser.id,
          title: `Novo frete para carregar — ${freight.protocol} — ${freight.origemCidadeUf} → ${freight.destinoCidadeUf}`,
          subtitle: `Transferido para seu monitoramento por ${user.name}. Motivo: ${cleanReason}`,
          dotColor: 'blue',
          targetSection: 'fretes_ativos',
          targetId: freight.id,
          dedupeKey: `xfer:mon:${freight.id}:${freight.revision}`,
        });
      } else {
        if (!canAccessExpedicaoFreights(targetUser)) {
          res.status(400).json({
            error: 'O funcionário selecionado não possui permissão para o módulo Expedição.',
          });
          return;
        }
        const prevName = freight.expedicaoResponsavelNome || 'Fila Disponível';
        freight.expedicaoResponsavelId = targetUser.id;
        freight.expedicaoResponsavelNome = targetUser.name;
        if (freight.situacaoOperacional === 'DISPONIVEL_FILA') {
          freight.situacaoOperacional = 'RECEBIDO';
        }
        freight.updatedAtIso = sp.iso;
        freight.updatedAtFormatted = sp.formatted;
        freight.revision += 1;

        appendHistoryEntry(sub, {
          actorId: user.id,
          actorName: user.name,
          actorSector: 'Expedição',
          eventType: 'TRANSFERENCIA',
          summary: `Responsabilidade operacional (Expedição) transferida de ${prevName} para ${targetUser.name}. Vínculo Comercial (${freight.comercialResponsavelNome}) preservado.`,
          reason: cleanReason.slice(0, 300),
          previousResponsibleName: prevName,
          newResponsibleName: targetUser.name,
        });

        pushFreightNotification({
          recipientId: targetUser.id,
          title: `Frete ${freight.protocol} transferido para sua fila da Expedição`,
          subtitle: `Transferido por ${user.name} (Anterior: ${prevName}). Motivo: ${cleanReason}`,
          dotColor: 'blue',
          targetSection: 'fretes_expedicao',
          targetId: freight.id,
          dedupeKey: `xfer:exp:${freight.id}:${freight.revision}`,
        });
      }

      persistFreightAndSubDoc(freight, sub);
      res.json({
        ok: true,
        freight: sanitizeFreightForUser(freight, user),
        historico: sub.historico,
      });
    }
  );

  // --------------------------------------------------------------------------
  // 15. CANCEL FREIGHT (PRESERVING RECORD FOR FILTER CONSULTATION)
  // --------------------------------------------------------------------------
  app.post(
    '/api/meus-fretes/:freightId/cancel',
    requireApprovedSession,
    (req: any, res: Response) => {
      const user = req.sessionUser as Employee;
      const freightId = String(req.params.freightId || '');
      const freight = engineState().freightsIndex.get(freightId);
      if (!freight) {
        res.status(404).json({ error: 'Frete não encontrado.' });
        return;
      }

      const canCancel =
        user.accessLevel === 'ADMINISTRADOR' ||
        user.accessLevel === 'DIRETORIA' ||
        hasPagePermission(user, 'fretes_cancelar') ||
        (freight.comercialResponsavelId === user.id &&
          ['EM_NEGOCIACAO', 'CONTRATADO'].includes(freight.situacaoComercial));

      if (!canCancel || !canUserAccessFreightRecord(freight, user)) {
        res.status(403).json({
          error: 'Permissão negada para cancelar este frete.',
          code: 'FORBIDDEN_CANCEL',
        });
        return;
      }

      const cleanReason = String(req.body?.reason || '').trim();
      if (cleanReason.length < 5) {
        res.status(400).json({
          error: 'Informe o motivo do cancelamento do frete (mínimo 5 caracteres).',
          code: 'MISSING_CANCEL_REASON',
        });
        return;
      }

      const sp = formatSaoPauloDateTime();
      freight.preCancelComercial = freight.situacaoComercial;
      freight.preCancelOperacional = freight.situacaoOperacional;
      freight.preCancelMonitoramento = freight.situacaoMonitoramento;
      freight.situacaoComercial = 'CANCELADO';
      freight.situacaoOperacional = 'CANCELADO';
      freight.situacaoMonitoramento = 'CANCELADO';
      freight.situacaoFinanceira = 'CANCELADO';
      freight.motivoCancelamento = cleanReason.slice(0, 400);
      freight.updatedAtIso = sp.iso;
      freight.updatedAtFormatted = sp.formatted;
      freight.revision += 1;

      const sub = engineState().freightSubDocs.get(freight.id)!;
      appendHistoryEntry(sub, {
        actorId: user.id,
        actorName: user.name,
        actorSector: canAccessExpedicaoFreights(user) ? 'Expedição' : 'Comercial',
        eventType: 'CANCELAMENTO',
        summary: `Frete cancelado por ${user.name}. Registro preservado para auditoria e consulta.`,
        reason: freight.motivoCancelamento,
      });

      persistFreightAndSubDoc(freight, sub);
      if (freight.comercialResponsavelId && freight.comercialResponsavelId !== user.id) {
        pushFreightNotification({
          recipientId: freight.comercialResponsavelId,
          title: `Frete ${freight.protocol} Cancelado`,
          subtitle: `Cancelado por ${user.name}. Motivo: ${freight.motivoCancelamento}`,
          dotColor: 'red',
          targetSection: 'fretes_comercial',
          targetId: freight.id,
          dedupeKey: `cancel:${freight.id}:com`,
        });
      }
      if (freight.expedicaoResponsavelId && freight.expedicaoResponsavelId !== user.id) {
        pushFreightNotification({
          recipientId: freight.expedicaoResponsavelId,
          title: `Frete ${freight.protocol} Cancelado`,
          subtitle: `Cancelado por ${user.name}. Motivo: ${freight.motivoCancelamento}`,
          dotColor: 'red',
          targetSection: 'fretes_expedicao',
          targetId: freight.id,
          dedupeKey: `cancel:${freight.id}:exp`,
        });
      }
      if (freight.monitoramentoResponsavelId && freight.monitoramentoResponsavelId !== user.id) {
        pushFreightNotification({
          recipientId: freight.monitoramentoResponsavelId,
          title: `Frete ${freight.protocol} Cancelado`,
          subtitle: `Cancelado por ${user.name}. Motivo: ${freight.motivoCancelamento}`,
          dotColor: 'red',
          targetSection: 'fretes_ativos',
          targetId: freight.id,
          dedupeKey: `cancel:${freight.id}:mon`,
        });
      }

      res.json({
        ok: true,
        freight: sanitizeFreightForUser(freight, user),
        historico: sub.historico,
      });
    }
  );

  // --------------------------------------------------------------------------
  // 15B. REACTIVATE FREIGHT (Requirement 5)
  // --------------------------------------------------------------------------
  app.post(
    '/api/meus-fretes/:freightId/reactivate',
    requireApprovedSession,
    (req: any, res: Response) => {
      const user = req.sessionUser as Employee;
      const freightId = String(req.params.freightId || '');
      const freight = engineState().freightsIndex.get(freightId);
      if (!freight) {
        res.status(404).json({ error: 'Frete não encontrado.' });
        return;
      }

      const canReactivate =
        user.accessLevel === 'ADMINISTRADOR' ||
        user.accessLevel === 'DIRETORIA' ||
        hasPagePermission(user, 'fretes_cancelar') ||
        canViewFreightTeam(user);

      if (!canReactivate) {
        res.status(403).json({
          error: 'Permissão negada: sua conta não possui autorização para reativar fretes.',
          code: 'FORBIDDEN_REACTIVATE',
        });
        return;
      }

      if (freight.situacaoOperacional !== 'CANCELADO' && freight.situacaoComercial !== 'CANCELADO') {
        res.status(400).json({ error: 'Este frete não está cancelado.' });
        return;
      }

      const cleanReason = String(req.body?.reason || '').trim();
      if (cleanReason.length < 5) {
        res.status(400).json({
          error: 'Informe a justificativa da reativação do frete (mínimo 5 caracteres).',
          code: 'MISSING_REACTIVATION_REASON',
        });
        return;
      }

      const sp = formatSaoPauloDateTime();
      const targetOperacional = (req.body?.targetStage as OperationalFreightStatus) || freight.preCancelOperacional || 'EM_PREPARACAO';
      const targetComercial = freight.preCancelComercial || (targetOperacional === 'LIBERADO_MONITORAMENTO' ? 'EM_MONITORAMENTO' : 'AGUARDANDO_EXPEDICAO');
      const targetMonitoramento = freight.preCancelMonitoramento || (targetOperacional === 'LIBERADO_MONITORAMENTO' ? 'NOVO_PARA_CARREGAR' : 'NAO_LIBERADO');

      freight.situacaoComercial = targetComercial;
      freight.situacaoOperacional = targetOperacional;
      freight.situacaoMonitoramento = targetMonitoramento;
      freight.situacaoFinanceira = 'PENDENTE';
      freight.motivoCancelamento = undefined;
      freight.updatedAtIso = sp.iso;
      freight.updatedAtFormatted = sp.formatted;
      freight.revision += 1;

      const sub = engineState().freightSubDocs.get(freight.id)!;
      appendHistoryEntry(sub, {
        actorId: user.id,
        actorName: user.name,
        actorSector: user.department || 'Gestão',
        eventType: 'REATIVACAO_FRETE',
        summary: `Frete reativado por ${user.name}. Motivo: ${cleanReason}. Etapa restabelecida: ${targetOperacional}.`,
      });

      persistFreightAndSubDoc(freight, sub);

      // Notify Commercial and Expedição
      if (freight.comercialResponsavelId && freight.comercialResponsavelId !== user.id) {
        pushFreightNotification({
          recipientId: freight.comercialResponsavelId,
          title: `Frete ${freight.protocol} Reativado`,
          subtitle: `Reativado por ${user.name}. Etapa: ${targetOperacional}`,
          dotColor: 'blue',
          targetSection: 'fretes_comercial',
          targetId: freight.id,
          dedupeKey: `reactivate:${freight.id}:com`,
        });
      }
      if (freight.expedicaoResponsavelId && freight.expedicaoResponsavelId !== user.id) {
        pushFreightNotification({
          recipientId: freight.expedicaoResponsavelId,
          title: `Frete ${freight.protocol} Reativado na Expedição`,
          subtitle: `Reativado por ${user.name}. Motivo: ${cleanReason}`,
          dotColor: 'blue',
          targetSection: 'fretes_expedicao',
          targetId: freight.id,
          dedupeKey: `reactivate:${freight.id}:exp`,
        });
      }

      res.json({
        ok: true,
        freight: sanitizeFreightForUser(freight, user),
        historico: sub.historico,
      });
    }
  );
}


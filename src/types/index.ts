export type UserRole = 'FUNCIONARIO' | 'ADMINISTRADOR' | 'DIRETORIA';

export type AccountApprovalStatus = 'PENDENTE' | 'APROVADO' | 'RECUSADO' | 'SUSPENSO';

export type Department =
  | 'Administrativo'
  | 'Operacional'
  | 'Recursos Humanos'
  | 'Financeiro'
  | 'Segurança'
  | 'Diretoria'
  | 'Logística';

export type MenuSection =
  | 'inicio'
  | 'comunicados'
  | 'fretes_comercial'
  | 'fretes_expedicao'
  | 'fretes_ativos'
  | 'mensagens'
  | 'grupos'
  | 'solicitacoes'
  | 'financeiro'
  | 'agenda'
  | 'documentos'
  | 'diretorio'
  | 'perfil'
  | 'administracao'
  | 'ajuda';

export interface Employee {
  accessProfile?: import('../lib/accessPolicy').AccessProfile;
  id: string;
  name: string;
  email: string;
  login?: string;
  password?: string;
  mustChangePassword?: boolean;
  roleTitle: string;
  department: Department;
  accessLevel: UserRole;
  avatar: string;
  hasCustomAvatar?: boolean;
  approvalStatus?: AccountApprovalStatus;
  requestedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  statusReason?: string;
  migratedFromGoogle?: boolean;
  phoneExt: string;
  joinedAt: string;
  active: boolean;
  location?: string;
  phone?: string;
  role?: string;
  permissoesPaginas?: string[];
}

export interface AccessDecisionRecord {
  id: string;
  targetUserId: string;
  targetName: string;
  targetLogin: string;
  adminId: string;
  adminName: string;
  action: 'APROVAR' | 'RECUSAR' | 'SUSPENDER' | 'ALTERAR_PERMISSOES';
  newStatus: AccountApprovalStatus;
  accessLevel: UserRole;
  permissoesPaginas: string[];
  reason?: string;
  timestampIso: string;
  timestampFormatted: string;
}

export interface WelcomeBannerItem {
  id: string;
  imageUrl: string;
  altText: string;
  isDecorative: boolean;
  focusX: number; // 0 to 100
  focusY: number; // 0 to 100
  width?: number;
  height?: number;
}

export interface SystemConfig {
  revision: number;
  updatedAtIso: string;
  updatedBy: string;
  sidebarPoster: {
    imageUrl: string;
    focusX: number;
    focusY: number;
    width?: number;
    height?: number;
  };
  topHeader: {
    imageUrl: string;
    focusX: number;
    focusY: number;
    width?: number;
    height?: number;
  };
  welcomeBanner: {
    carouselEnabled: boolean;
    intervalSeconds: number; // 3 to 15, default 5
    items: WelcomeBannerItem[]; // 1 to 5 items
  };
  defaultAvatar: {
    imageUrl: string;
    width?: number;
    height?: number;
  };
}

export type AnnouncementCategory =
  | 'Comunicado Geral'
  | 'Importante'
  | 'Urgente'
  | 'Recursos Humanos'
  | 'Segurança'
  | 'Operacional'
  | 'Eventos'
  | 'Diretoria';

export interface AnnouncementComment {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  authorAvatar: string;
  content: string;
  createdAt: string;
}

export interface AnnouncementReadReceipt {
  userId: string;
  userName: string;
  department: Department;
  confirmedAt: string;
}

export interface AnnouncementEditEntry {
  id: string;
  editedAt: string;
  editorName: string;
  editorRole: string;
  note: string;
}

export interface AnnouncementAttachment {
  name: string;
  size: string;
  type: string;
  url?: string;
}

export interface Announcement {
  id: string;
  title: string;
  summary: string;
  content: string;
  authorName: string;
  department: Department;
  dateFormatted: string;
  createdAtIso: string;
  coverImage?: string;
  category: AnnouncementCategory;
  priority: 'Normal' | 'Importante' | 'Urgente';
  targetAudience: Department | 'Todos';
  requireReadConfirmation: boolean;
  pinned?: boolean;
  archived?: boolean;
  likes: string[]; // array of userIds
  comments: AnnouncementComment[];
  readReceipts: AnnouncementReadReceipt[];
  attachments?: AnnouncementAttachment[];
  editHistory?: AnnouncementEditEntry[];
  pdfUrl?: string;
}

export type RequestStatus =
  | 'Aberta'
  | 'Em análise'
  | 'Em andamento'
  | 'Aguardando funcionário'
  | 'Concluída'
  | 'Cancelada';

export interface RequestHistoryEntry {
  id: string;
  timestamp: string;
  actorName: string;
  action: string;
  note?: string;
}

export interface InternalRequest {
  completedAtIso?: string;
  attachments?: RequestAttachment[];
  assignedToId?: string;
  assignedToName?: string;
  id: string;
  protocol: string;
  requesterId: string;
  requesterName: string;
  requesterDepartment: Department;
  targetDepartment: Department;
  subject: string;
  description: string;
  priority: 'Baixa' | 'Média' | 'Alta' | 'Urgente';
  status: RequestStatus;
  createdAtIso: string;
  originalDueAtIso: string; // 48 hours from creation
  currentDueAtIso: string;
  attachmentName?: string;
  escalatedToDiretoria?: boolean;
  history: RequestHistoryEntry[];
}

export interface RequestAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  uploadedById: string;
  createdAtIso: string;
}

export interface CorporateNotification {
  id: string;
  type: 'comunicado' | 'solicitacao' | 'evento' | 'documento' | 'mensagem' | 'prazo' | 'alerta_sla';
  dotColor: 'red' | 'blue';
  title: string;
  subtitle: string;
  timeLabel: string;
  read: boolean;
  targetSection: MenuSection;
  targetId?: string;
  recipientId?: string;
  publicationId?: string;
  createdAtIso?: string;
}

export interface CorporateEvent {
  id: string;
  day: string;
  monthShort: string;
  dateIso: string;
  time: string;
  location: string;
  title: string;
  organizer: string;
  department: Department | 'Empresa';
  badgeLabel:
    | 'Importante'
    | 'Evento'
    | 'Reunião'
    | 'Treinamento'
    | 'TREINAMENTO SSMA'
    | 'REUNIÃO EXECUTIVA'
    | 'INTEGRAÇÃO RH';
  badgeColor: 'red' | 'blue' | 'gray';
  description: string;
  attendees: string[]; // userIds
  pdfUrl?: string;
}

export type DocumentCategory =
  | 'Políticas da Empresa'
  | 'Manual do Colaborador'
  | 'Recursos Humanos'
  | 'Segurança do Trabalho'
  | 'Formulários'
  | 'Treinamentos'
  | 'Documentos Administrativos';

export interface DocumentAttachmentItem {
  id: string;
  name: string;
  size: string;
  fileType: 'PDF' | 'DOC' | 'DOCX' | 'XLS' | 'XLSX' | string;
  url?: string;
  dataBase64?: string;
}

export interface CorporateDocument {
  id: string;
  title: string;
  category: DocumentCategory;
  version: string;
  updatedAt: string;
  author: string;
  size: string;
  fileType: 'PDF' | 'DOCX' | 'XLSX' | 'DOC' | 'XLS' | string;
  allowedDepartments: 'Todos' | Department[];
  description: string;
  contentPreview: string;
  pdfUrl?: string;
  attachments?: DocumentAttachmentItem[];
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole?: string;
  text: string;
  timestamp: string;
  status: 'delivered' | 'read';
  attachment?: string;
  attachmentSize?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  mediaUrl?: string;
  audioDuration?: string;
  forwardedFrom?: string;
  reactions?: string[];
  pinned?: boolean;
}

export interface ChatThread {
  id: string;
  isGroup: boolean;
  name: string;
  roleOrDept: string;
  department?: Department | 'Todos';
  avatar?: string;
  unreadCount: number;
  participantsCount?: number;
  participantIds?: string[];
  pinnedNotice?: string;
  time?: string;
  messages: ChatMessage[];
}

export interface EmployeeInvite {
  id: string;
  fullName: string;
  email: string;
  roleTitle: string;
  department: Department;
  accessLevel: UserRole;
  token: string;
  createdAt?: string;
  expiresAt: string;
  status: 'Pendente' | 'Ativado' | 'Expirado';
}

export interface AuditLog {
  id: string;
  timestamp: string;
  actor: string;
  role: UserRole;
  action: string;
  details: string;
}

export type CarrierBrand = 'RODOVAR' | 'VL TRANSPORTES' | 'AXD';

export type OperationalUnit = 'BA - Salvador' | 'SP - Guarulhos';

export type FreightRuleType = '70_30' | 'INTEGRAL_100' | 'PERSONALIZADO';

export type FreightStatus =
  | 'Pendente Adiantamento'
  | 'Adiantamento Pago'
  | 'Aguardando Entrega'
  | 'Pendente Saldo'
  | 'Pago';

export interface FreightDocumentFile {
  id: string;
  type: 'CT-e' | 'MDF-e' | 'RPA' | 'COMPROVANTE_ADIANTAMENTO' | 'COMPROVANTE_SALDO';
  label: string;
  fileName: string;
  mimeType: string;
  sizeLabel: string;
  uploadedAt: string;
  uploadedBy: string;
  dataUrl?: string;
}

export interface FreightRecord {
  id: string;
  code: string; // e.g., "#0842"
  createdAtDate: string; // e.g., "26/10/2026"
  createdAtIso: string;
  // Campos da Ficha Padrão de Carregamento Operacional (Script de Tráfego)
  empresaMarca?: CarrierBrand; // 'RODOVAR' | 'VL TRANSPORTES' | 'AXD'
  dataCarregamento?: string; // e.g., "27/10/2026"
  unidadeOperacional?: OperationalUnit; // 'BA - Salvador' | 'SP - Guarulhos'
  comercialResponsavel?: string; // e.g., "Jeise / César"
  expedicaoResponsavel?: string; // e.g., "Marcos Silva"
  cliente: string;
  telefoneCliente?: string;
  motoristaNome?: string;
  motoristaTelefone?: string;
  emergenciaNome?: string;
  emergenciaTelefone?: string;
  origem: string;
  destino: string;
  dataColeta: string; // e.g., "26/10"
  dataEntrega: string; // e.g., "27/10"
  valorFreteEmpresa?: number; // Valor Cobrado do Cliente
  valorFreteMotorista?: number; // Valor Pago ao Terceiro/Agregado
  regraTipo: FreightRuleType;
  regraLabel: string; // e.g., "70% / 30%" or "Integral (100%)"
  percentualAdiantamento: number;
  percentualSaldo: number;
  valorTotal: number;
  valorAdiantamento: number;
  valorSaldo: number;
  favorecido: string;
  banco: string;
  agencia: string;
  conta: string;
  tipoChavePix: 'CPF/CNPJ' | 'Celular' | 'E-mail' | 'Chave Aleatória';
  chavePix: string;
  status: FreightStatus;
  adiantamentoPago: boolean;
  adiantamentoPagoEm?: string;
  codigoTransacaoAdiantamento?: string;
  entregaConfirmada: boolean;
  entregaConfirmadaEm?: string;
  saldoPago: boolean;
  saldoPagoEm?: string;
  codigoTransacaoSaldo?: string;
  observacoes?: string;
  solicitanteNome: string;
  docs: {
    cte?: FreightDocumentFile;
    mdfe?: FreightDocumentFile;
    rpa?: FreightDocumentFile;
    comprovanteAdiantamento?: FreightDocumentFile;
    comprovanteSaldo?: FreightDocumentFile;
  };
  adiantamentoVerificacaoStatus?: PaymentVerificationStatus;
  adiantamentoComprovanteId?: string;
  adiantamentoConfirmadoPorId?: string;
  adiantamentoConfirmadoPorNome?: string;
  adiantamentoConfirmadoEm?: string;
  saldoVerificacaoStatus?: PaymentVerificationStatus;
  saldoComprovanteId?: string;
  saldoConfirmadoPorId?: string;
  saldoConfirmadoPorNome?: string;
  saldoConfirmadoEm?: string;
  comprovantesList?: PaymentReceiptRecord[];
  historicoPagamentos?: PaymentAuditHistoryEntry[];
}

// ============================================================================
// MÓDULO DE PAGAMENTOS MOBILE, INTENÇÃO DE PAGAMENTO & WEB SHARE TARGET
// ============================================================================
export type PaymentInstallmentType = 'ADIANTAMENTO' | 'SALDO';

export type PaymentIntentStatus =
  | 'AGUARDANDO_COMPROVANTE'
  | 'COMPROVANTE_VINCULADO'
  | 'CONCLUIDA'
  | 'EXPIRADA'
  | 'CANCELADA';

export type PaymentReceiptOrigin = 'COMPARTILHAMENTO' | 'ANEXACAO_MANUAL';

export type PaymentReceiptUploadState =
  | 'RECEBIDO_NO_CELULAR'
  | 'AGUARDANDO_ENVIO_OFFLINE'
  | 'ENVIANDO'
  | 'SALVO_NO_SERVIDOR'
  | 'FALHA_NO_ENVIO';

export type PaymentVerificationStatus =
  | 'SEM_COMPROVANTE'
  | 'COMPROVANTE_RECEBIDO'
  | 'AGUARDANDO_CONFERENCIA'
  | 'PAGAMENTO_CONFIRMADO'
  | 'REJEITADO';

export interface PaymentIntentRecord {
  id: string;
  freightId: string;
  freightCode: string;
  installmentId: string; // e.g., "frete-0842:ADIANTAMENTO"
  installmentType: PaymentInstallmentType;
  expectedAmountCentavos: number;
  expectedAmountBRL: number;
  favorecido: string;
  chavePix?: string;
  banco?: string;
  origem: string;
  destino: string;
  cliente: string;
  responsibleUserId: string;
  responsibleUserName: string;
  responsibleUserEmail: string;
  createdAtIso: string;
  createdAtFormatted: string;
  expiresAtIso: string;
  expiresAtFormatted: string;
  validityMinutes: number;
  status: PaymentIntentStatus;
  linkedReceiptId?: string;
}

export interface PaymentReceiptRecord {
  id: string;
  freightId: string;
  freightCode: string;
  installmentId: string;
  installmentType: PaymentInstallmentType;
  title: string; // "Comprovante de Adiantamento" | "Comprovante de Saldo"
  expectedAmountCentavos: number;
  expectedAmountBRL: number;
  favorecido: string;
  uploadedByUserId: string;
  uploadedByUserName: string;
  uploadedByUserEmail: string;
  originalFileName: string;
  storageFileName: string;
  storageRelativePath: string;
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png';
  sizeBytes: number;
  sizeLabel: string;
  sha256Hash: string;
  idempotencyKey: string;
  origin: PaymentReceiptOrigin;
  isScheduledProof?: boolean; // Comprovante de agendamento (exige conferência adicional)
  transactionCode?: string;
  observations?: string;
  intentId?: string;
  uploadStatus: PaymentReceiptUploadState;
  verificationStatus: PaymentVerificationStatus;
  verifiedByUserId?: string;
  verifiedByUserName?: string;
  verifiedAtIso?: string;
  verifiedAtFormatted?: string;
  rejectionReason?: string;
  isDuplicateHashWarning?: boolean;
  duplicateOfReceiptId?: string;
  replacedReceiptId?: string;
  serverCreatedAtIso: string;
  serverCreatedAtFormatted: string;
  downloadUrl: string;
}

export type PaymentAuditEventType =
  | 'INTENCAO_CRIADA'
  | 'INTENCAO_EXPIRADA'
  | 'INTENCAO_CANCELADA'
  | 'COMPROVANTE_ANEXADO'
  | 'COMPROVANTE_SUBSTITUIDO'
  | 'PAGAMENTO_CONFIRMADO'
  | 'COMPROVANTE_REJEITADO';

export interface PaymentAuditHistoryEntry {
  id: string;
  freightId: string;
  freightCode: string;
  installmentType: PaymentInstallmentType;
  eventType: PaymentAuditEventType;
  actorId: string;
  actorName: string;
  actorRole: string;
  timestampIso: string;
  timestampFormatted: string;
  summary: string;
  receiptId?: string;
  intentId?: string;
  previousReceiptId?: string;
  amountBRL?: number;
}


// ============================================================================
// MEUS FRETES — COMERCIAL, EXPEDIÇÃO & MONITORAMENTO (UNIFIED SERVER RECORD)
// ============================================================================
export type CommercialFreightStatus =
  | 'CONCLUIDO' // Compatibility with existing completed commercial records.
  | 'EM_NEGOCIACAO'
  | 'CONTRATADO'
  | 'AGUARDANDO_EXPEDICAO'
  | 'NA_EXPEDICAO'
  | 'EM_MONITORAMENTO'
  | 'EM_TRANSPORTE'
  | 'FINALIZADO'
  | 'CANCELADO';

export type OperationalFreightStatus =
  | 'NAO_ENVIADO'
  | 'DISPONIVEL_FILA'
  | 'RECEBIDO'
  | 'EM_PREPARACAO'
  | 'AGUARDANDO_FECHAMENTO'
  | 'DEVOLVIDO_CORRECAO'
  | 'FECHADO'
  | 'LIBERADO_MONITORAMENTO'
  | 'AGUARDANDO_COLETA'
  | 'EM_TRANSPORTE'
  | 'CONCLUIDO'
  | 'CANCELADO';

export type MonitoringFreightStatus =
  | 'DEVOLVIDO_EXPEDICAO'
  | 'NAO_LIBERADO'
  | 'NOVO_PARA_CARREGAR'
  | 'EM_DESLOCAMENTO_COLETA'
  | 'NO_LOCAL_COLETA'
  | 'CARREGADO_EM_TRANSPORTE'
  | 'NO_LOCAL_ENTREGA'
  | 'ENTREGUE'
  | 'FINALIZADO'
  | 'CANCELADO';

export type FinancialFreightStatus =
  | 'PENDENTE' // Existing reactivation records.
  | 'NAO_INICIADO'
  | 'PENDENTE_ADIANTAMENTO'
  | 'ADIANTAMENTO_PAGO'
  | 'PENDENTE_SALDO'
  | 'PAGO'
  | 'CANCELADO';

export interface UnifiedFreightChecklist {
  videochamadaRealizadaEmIso?: string;
  videochamadaRealizadaEmFormatado?: string;
  ordemColetaEnviadaEmFormatado?: string;
  motoristaConfirmado: boolean;
  veiculoConfirmado: boolean;
  condicoesConferidas: boolean;
  documentosConferidos: boolean;
  videochamadaRealizada?: boolean;
  videochamadaRealizadaPorId?: string;
  videochamadaRealizadaPorNome?: string;
  videochamadaRealizadaEm?: string;
  videochamadaObservacoes?: string;
  ordemColetaEnviadaMotorista?: boolean;
  ordemColetaEnviadaPorId?: string;
  ordemColetaEnviadaPorNome?: string;
  ordemColetaEnviadaEm?: string;
  conferidoPorId?: string;
  conferidoPorNome?: string;
  conferidoEmIso?: string;
  conferidoEmFormatado?: string;
}

export type FreightAttachmentCategory =
  | 'COMERCIAL'
  | 'CTE'
  | 'MDFE'
  | 'RPA'
  | 'COMPROVANTE_ENTREGA'
  | 'ORDEM_CARREGAMENTO'
  | 'OUTRO';

export interface UnifiedFreightAttachment {
  id: string;
  freightId: string;
  category: FreightAttachmentCategory;
  label: string;
  fileName: string;
  storageName: string;
  mimeType: string;
  sizeBytes: number;
  sizeLabel: string;
  conferido: boolean;
  conferidoPorId?: string;
  conferidoPorNome?: string;
  conferidoEmFormatado?: string;
  uploadedById: string;
  uploadedByName: string;
  uploadedAtIso: string;
  uploadedAtFormatted: string;
}

export interface UnifiedFreightComment {
  id: string;
  freightId: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  sector: 'COMERCIAL' | 'EXPEDICAO' | 'MONITORAMENTO' | 'GESTAO';
  text: string;
  createdAtIso: string;
  createdAtFormatted: string;
}

export interface UnifiedFreightOccurrence {
  id: string;
  freightId: string;
  severity: 'BAIXA' | 'MEDIA' | 'IMPEDITIVA';
  title: string;
  description: string;
  resolved: boolean;
  resolvedById?: string;
  resolvedByName?: string;
  resolvedAtFormatted?: string;
  createdById: string;
  createdByName: string;
  createdAtIso: string;
  createdAtFormatted: string;
}

export type FreightHistoryEventType =
  | 'EMISSAO_ORDEM_COLETA'
  | 'OCORRENCIA_CRIADA'
  | 'REGISTRO_LOCALIZACAO'
  | 'EXCLUSAO_ANEXO'
  | 'EXCLUSAO_TODOS_ANEXOS'
  | 'REATIVACAO_FRETE'
  | 'CRIACAO'
  | 'EDICAO_COMERCIAL'
  | 'CONTRATACAO'
  | 'ENVIO_EXPEDICAO'
  | 'ASSUMIR_FILA'
  | 'TRANSFERENCIA'
  | 'FECHAMENTO'
  | 'VIDEOCHAMADA_MOTORISTA'
  | 'ENVIO_ORDEM_MOTORISTA'
  | 'LIBERACAO_MONITORAMENTO'
  | 'AVANCO_MONITORAMENTO'
  | 'ATUALIZACAO_LOCALIZACAO'
  | 'DEVOLUCAO_EXPEDICAO'
  | 'PROGRAMACAO_COLETA'
  | 'CONFIRMACAO_COLETA'
  | 'ATUALIZACAO_PREVISAO'
  | 'OCORRENCIA'
  | 'RESOLUCAO_OCORRENCIA'
  | 'DEVOLUCAO_COMERCIAL'
  | 'REENVIO_EXPEDICAO'
  | 'UPLOAD_ANEXO'
  | 'CONFERENCIA_ANEXO'
  | 'CONCLUSAO_OPERACAO'
  | 'ALTERACAO_RELEVANTE_POS_FECHAMENTO'
  | 'CANCELAMENTO';

export interface UnifiedFreightHistoryEntry {
  id: string;
  freightId: string;
  timestampIso: string;
  timestampFormatted: string;
  timeShort: string;
  horarioRealEvento?: string;
  actorId: string;
  actorName: string;
  actorSector: string;
  eventType: FreightHistoryEventType;
  summary: string;
  reason?: string;
  previousResponsibleName?: string;
  newResponsibleName?: string;
}

export interface UnifiedFreightRecord {
  id: string;
  protocol: string; // e.g., "#0842"
  empresaMarca: CarrierBrand;
  unidadeOperacional: OperationalUnit;
  // Cliente e Rota
  cliente: string;
  clienteCnpj?: string;
  clienteContato?: string;
  origemCidadeUf: string;
  enderecoColeta: string;
  destinoCidadeUf: string;
  enderecoEntrega: string;
  instrucoesColetaEntrega?: string;
  // Carga e Veículo Necessário
  tipoCarga: string;
  pesoKg: number;
  volumes: number;
  veiculoNecessario: string;
  // Datas e Janelas (America/Sao_Paulo)
  dataColetaIso: string; // YYYY-MM-DD
  janelaColetaInicio: string; // HH:mm
  janelaColetaFim: string; // HH:mm
  coletaProgramadaEm?: string;
  coletaConfirmadaEm?: string;
  dataEntregaPrevistaIso: string; // YYYY-MM-DD
  janelaEntregaInicio: string; // HH:mm
  janelaEntregaFim?: string;
  entregaComprovadaEm?: string;
  // Três Responsáveis no Mesmo Registro
  comercialResponsavelId: string;
  comercialResponsavelNome: string;
  expedicaoResponsavelId: string | null;
  expedicaoResponsavelNome: string | null;
  monitoramentoResponsavelId?: string | null;
  monitoramentoResponsavelNome?: string | null;
  // Valores Monetários em Centavos Inteiros
  valorCobradoClienteCentavos?: number; // Protegido por permissão comercial/financeira/admin
  valorContratadoCentavos: number;
  // Motorista, Transportador, Veículo e Carreta
  transportadorNome?: string;
  transportadorDocumento?: string;
  motoristaNome?: string;
  motoristaCpf?: string;
  motoristaTelefone?: string;
  placaVeiculo?: string;
  placaCarreta?: string;
  // Condições Financeiras / Solicitação ao Financeiro
  condicoesPagamento?: string;
  favorecidoPagamento?: string;
  bancoPagamento?: string;
  tipoChavePix?: string;
  chavePix?: string;
  // Condições, Observações, Monitoramento e Pendências
  condicoesComerciais: string;
  condicoesOperacionais: string;
  observacoes?: string;
  orientacoesMotorista?: string;
  ultimaLocalizacaoInformada?: string;
  ultimaLocalizacaoAtualizadaEm?: string;
  ultimaLocalizacaoAtualizadaPor?: string;
  camposPendentesExpedicao?: string[];
  pendenciaPrincipal?: string;
  devolvidoParaCorrecao: boolean;
  motivoDevolucao?: string;
  requerReconfirmacaoOperacional: boolean;
  motivoReconfirmacao?: string;
  motivoCancelamento?: string;
  preCancelComercial?: CommercialFreightStatus;
  preCancelOperacional?: OperationalFreightStatus;
  preCancelMonitoramento?: MonitoringFreightStatus;
  comprovanteEntregaAnexoId?: string;
  comprovanteEntregaConferido: boolean;
  ordemCarregamentoEmitidaEm?: string;
  ordemCarregamentoNumero?: string;
  liberadoMonitoramentoEm?: string;
  liberadoMonitoramentoPorId?: string;
  liberadoMonitoramentoPorNome?: string;
  // Situações separadas por setor
  situacaoComercial: CommercialFreightStatus;
  situacaoOperacional: OperationalFreightStatus;
  situacaoMonitoramento?: MonitoringFreightStatus;
  situacaoFinanceira: FinancialFreightStatus;
  // Checklist de Fechamento e Conferências da Expedição (5 itens)
  checklistFechamento: UnifiedFreightChecklist;
  // Contadores leves para listagem e Kanban (evita trafegar histórico/anexos pesados)
  anexosCount: number;
  comentariosCount: number;
  ocorrenciasAbertasCount: number;
  ocorrenciasImpeditivasCount: number;
  checklistConcluidosCount: number;
  // Auditoria e Controle de Concorrência
  autorId: string;
  autorNome: string;
  createdAtIso: string;
  createdAtFormatted: string;
  updatedAtIso: string;
  updatedAtFormatted: string;
  revision: number;
}

export interface UnifiedFreightDetailsPayload {
  freight: UnifiedFreightRecord;
  anexos: UnifiedFreightAttachment[];
  comentarios: UnifiedFreightComment[];
  ocorrencias: UnifiedFreightOccurrence[];
  historico: UnifiedFreightHistoryEntry[];
}




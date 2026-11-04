import { portalFetch as fetch } from './apiTransport';
import { PREVIEW_FREIGHT_FILE_LIMIT } from './freightFileLimits';
import {newRequestKey} from './requestKey';
import {
  AccessDecisionRecord,
  AccountApprovalStatus,
  CommercialFreightStatus,
  Department,
  Employee,
  MonitoringFreightStatus,
  OperationalFreightStatus,
  SystemConfig,
  UnifiedFreightAttachment,
  UnifiedFreightChecklist,
  UnifiedFreightComment,
  UnifiedFreightDetailsPayload,
  UnifiedFreightOccurrence,
  UnifiedFreightRecord,
  UserRole,
} from '../types';

const cloudAuth = (import.meta as any).env?.VITE_CLOUD_AUTH === 'true';
const authUrl = (path: string) => cloudAuth ? path.replace('/api/auth/', '/api/cloud/auth/') : path;
const tokenStorageKey = cloudAuth ? 'rodovar_cloud_security_tokens_v1' : 'rodovar_security_tokens_v2';

export const freightAttachmentLimitMb = cloudAuth ? PREVIEW_FREIGHT_FILE_LIMIT / (1024 * 1024) : 5;

export const DEFAULT_NEUTRAL_AVATAR_URL = '/assets/default-avatar.png';

let currentCsrfToken: string | null = null;
let currentSessionId: string | null = null;

export function setAuthTokens(csrfToken: string | null, sessionId: string | null) {
  currentCsrfToken = csrfToken;
  currentSessionId = sessionId;
  try {
    if (csrfToken && sessionId) {
      const serialized = JSON.stringify({ csrfToken, sessionId });
      sessionStorage.setItem(tokenStorageKey, serialized);
      localStorage.setItem(tokenStorageKey, serialized);
    } else {
      sessionStorage.removeItem(tokenStorageKey);
      localStorage.removeItem(tokenStorageKey);
    }
  } catch {
    // ignore storage errors
  }
}

export function loadStoredAuthTokens(): { csrfToken: string | null; sessionId: string | null } {
  if (currentCsrfToken && currentSessionId) {
    return { csrfToken: currentCsrfToken, sessionId: currentSessionId };
  }
  try {
    const raw =
      sessionStorage.getItem(tokenStorageKey) ||
      localStorage.getItem(tokenStorageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      currentCsrfToken = parsed.csrfToken || null;
      currentSessionId = parsed.sessionId || null;
    }
  } catch {
    // ignore
  }
  return { csrfToken: currentCsrfToken, sessionId: currentSessionId };
}

export function getAuthHeaders(
  extra: Record<string, string> | boolean = {}
): Record<string, string> {
  const { csrfToken, sessionId } = loadStoredAuthTokens();
  const extraHeaders = typeof extra === 'object' && extra !== null ? extra : {};
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  };
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  if (sessionId) headers['X-Rodovar-Session'] = sessionId;
  return headers;
}

export function withRevisionParam(url: string | undefined, revision: number = 1): string {
  const clean = (url || DEFAULT_NEUTRAL_AVATAR_URL).trim();
  if (!clean || clean.startsWith('data:')) return clean || DEFAULT_NEUTRAL_AVATAR_URL;
  const base = clean.split('?')[0];
  return `${base}?rev=${revision}`;
}

export function resolveAvatarUrl(
  _emp?: Partial<Employee> | null,
  systemConfig?: SystemConfig | null
): string {
  const rev = systemConfig?.revision || 1;
  const defaultAvatarBase = systemConfig?.defaultAvatar?.imageUrl || DEFAULT_NEUTRAL_AVATAR_URL;
  return withRevisionParam(defaultAvatarBase, rev);
}

export async function apiFetchSession(): Promise<{
  authenticated: boolean;
  user?: Employee;
  csrfToken?: string;
  sessionId?: string;
  systemConfig?: SystemConfig;
  pendingAccessRequestsCount?: number;
}> {
  const { sessionId } = loadStoredAuthTokens();
  const headers: Record<string, string> = {};
  if (sessionId) headers['X-Rodovar-Session'] = sessionId;

  const res = await fetch(authUrl('/api/auth/session'), {
    method: 'GET',
    credentials: 'include',
    headers,
  });
  if (cloudAuth && !res.ok && ![401, 403].includes(res.status)) throw Error('Não foi possível verificar a sessão no servidor.');
  const data = await res.json();
  if (res.ok && data.authenticated && data.csrfToken && data.sessionId) {
    setAuthTokens(data.csrfToken, data.sessionId);
  } else if (res.status === 401 || res.status === 403) {
    setAuthTokens(null, null);
  }
  return data;
}

export async function apiCheckLockStatus(identifier: string): Promise<{
  locked: boolean;
  blockedUntil: number | null;
  serverNow: number;
  remainingSeconds: number;
  message?: string;
}> {
  const res = await fetch(
    authUrl(`/api/auth/lock-status?identifier=${encodeURIComponent(identifier.trim())}`),
    {
      method: 'GET',
      credentials: 'include',
    }
  );
  return res.json();
}

export async function apiLogin(
  identifier: string,
  password: string,
  rememberMe: boolean
): Promise<{
  ok: boolean;
  status: number;
  user?: Employee;
  csrfToken?: string;
  sessionId?: string;
  systemConfig?: SystemConfig;
  error?: string;
  code?: string;
  locked?: boolean;
  blockedUntil?: number | null;
  serverNow?: number;
  remainingSeconds?: number;
  remainingAttempts?: number;
  approvalStatus?: AccountApprovalStatus;
}> {
  const res = await fetch(authUrl('/api/auth/login'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password, rememberMe }),
  });
  const data = await res.json();
  if (res.ok && data.ok && data.csrfToken && data.sessionId) {
    setAuthTokens(data.csrfToken, data.sessionId);
  }
  return {
    ...data,
    ok: Boolean(res.ok && data.ok),
    status: res.status,
  };
}

export async function apiRequestAccess(payload: {
  name: string;
  username: string;
  department: Department;
  password: string;
}): Promise<{
  ok: boolean;
  status: number;
  message?: string;
  error?: string;
}> {
  const res = await fetch(authUrl('/api/auth/request-access'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  return {
    ok: Boolean(res.ok && data.ok),
    status: res.status,
    message: data.message,
    error: data.error,
  };
}

export async function apiLogout(): Promise<void> {
  try {
    await fetch(authUrl('/api/auth/logout'), {
      method: 'POST',
      credentials: 'include',
      headers: getAuthHeaders(),
    });
  } finally {
    setAuthTokens(null, null);
  }
}

export async function apiRequestPasswordReset(identifier: string): Promise<{
  ok: boolean;
  message?: string;
  resetToken?: string;
  error?: string;
}> {
  const res = await fetch(authUrl('/api/auth/request-password-reset'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier }),
  });
  const data = await res.json();
  return {
    ok: Boolean(res.ok && data.ok),
    message: data.message,
    resetToken: data.resetToken,
    error: data.error,
  };
}

export async function apiResetPasswordWithToken(
  token: string,
  newPassword: string
): Promise<{
  ok: boolean;
  message?: string;
  error?: string;
}> {
  const res = await fetch(authUrl('/api/auth/reset-password'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword }),
  });
  const data = await res.json();
  return {
    ok: Boolean(res.ok && data.ok),
    message: data.message,
    error: data.error,
  };
}

export async function apiFetchAdminAccessRequests(): Promise<{
  ok: boolean;
  pendingCount: number;
  accounts: Employee[];
  decisionsHistory: AccessDecisionRecord[];
  error?: string;
}> {
  const res = await fetch('/api/admin/access-requests', {
    method: 'GET',
    credentials: 'include',
    headers: getAuthHeaders(),
  });
  const data = await res.json();
  return {
    ok: res.ok,
    pendingCount: data.pendingCount ?? 0,
    accounts: data.accounts ?? [],
    decisionsHistory: data.decisionsHistory ?? [],
    error: data.error,
  };
}

export async function apiSubmitAdminDecision(
  targetUserId: string,
  payload: {
    action: 'APROVAR' | 'RECUSAR' | 'SUSPENDER' | 'ALTERAR_PERMISSOES';
    accessLevel: UserRole;
    permissoesPaginas: string[];
    department?: Department;
    roleTitle?: string;
    reason?: string;
  }
): Promise<{
  ok: boolean;
  pendingCount?: number;
  user?: Employee;
  decision?: AccessDecisionRecord;
  error?: string;
}> {
  const res = await fetch(`/api/admin/access-requests/${encodeURIComponent(targetUserId)}/decision`, {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  return {
    ok: Boolean(res.ok && data.ok),
    pendingCount: data.pendingCount,
    user: data.user,
    decision: data.decision,
    error: data.error,
  };
}

export async function apiUploadProfileAvatar(
  dataUrl: string,
  targetUserId?: string
): Promise<{
  ok: boolean;
  avatarUrl?: string;
  user?: Employee;
  error?: string;
}> {
  const res = await fetch('/api/profile/avatar', {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(),
    body: JSON.stringify({ dataUrl, targetUserId }),
  });
  const data = await res.json();
  return {
    ok: Boolean(res.ok && data.ok),
    avatarUrl: data.avatarUrl,
    user: data.user,
    error: data.error,
  };
}

export async function apiRestoreDefaultAvatar(targetUserId?: string): Promise<{
  ok: boolean;
  user?: Employee;
  error?: string;
}> {
  const res = await fetch('/api/profile/restore-default-avatar', {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(),
    body: JSON.stringify({ targetUserId }),
  });
  const data = await res.json();
  return {
    ok: Boolean(res.ok && data.ok),
    user: data.user,
    error: data.error,
  };
}

export async function apiUpdateProfile(payload: {
  name?: string;
  phoneExt?: string;
  login?: string;
  password?: string;
}): Promise<{
  ok: boolean;
  user?: Employee;
  error?: string;
}> {
  const res = await fetch(cloudAuth ? '/api/cloud/profile' : '/api/profile', {
    method: 'PUT',
    credentials: 'include',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (res.ok && data.sessionId && data.csrfToken) setAuthTokens(data.csrfToken, data.sessionId);
  return {
    ok: Boolean(res.ok && data.ok),
    user: data.user,
    error: data.error,
  };
}

export async function apiDeleteUser(userId: string): Promise<{ok: boolean; error?: string}> {
  const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE', credentials: 'include', headers: getAuthHeaders() });
  const data = await response.json();
  return {ok: response.ok && data.ok === true, error: data.error};
}

export async function apiFetchSystemConfig(): Promise<{
  systemConfig: SystemConfig;
  defaults: SystemConfig;
}> {
  const res = await fetch('/api/system-config', {
    method: 'GET',
    credentials: 'include',
  });
  return res.json();
}

export async function apiUploadSystemConfigImage(
  slot: 'sidebarPoster' | 'topHeader' | 'welcomeBanner' | 'defaultAvatar',
  dataUrl: string
): Promise<{
  ok: boolean;
  imageUrl?: string;
  width?: number;
  height?: number;
  mimeType?: string;
  sizeBytes?: number;
  recommendedWidth?: number;
  recommendedHeight?: number;
  lowResolutionWarning?: boolean;
  error?: string;
}> {
  const res = await fetch('/api/system-config/upload', {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(),
    body: JSON.stringify({ slot, dataUrl }),
  });
  const data = await res.json();
  return {
    ...data,
    ok: Boolean(res.ok && data.ok),
  };
}

export async function apiPublishSystemConfig(payload: {
  baseRevision: number;
  sidebarPoster: SystemConfig['sidebarPoster'];
  topHeader: SystemConfig['topHeader'];
  welcomeBanner: SystemConfig['welcomeBanner'];
  defaultAvatar: SystemConfig['defaultAvatar'];
}): Promise<{
  ok: boolean;
  status: number;
  message?: string;
  systemConfig?: SystemConfig;
  currentRevision?: number;
  error?: string;
}> {
  const res = await fetch('/api/system-config/publish', {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  return {
    ok: Boolean(res.ok && data.ok),
    status: res.status,
    message: data.message,
    systemConfig: data.systemConfig,
    currentRevision: data.currentRevision,
    error: data.error,
  };
}

// ============================================================================
// MEUS FRETES — COMERCIAL & EXPEDIÇÃO API HELPERS
// ============================================================================

export function formatCentavosToBrl(centavos: number | undefined | null): string {
  if (centavos === undefined || centavos === null || isNaN(centavos)) return 'R$ 0,00';
  return (centavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function parseBrlInputToCentavos(raw: string | number): number {
  if (typeof raw === 'number') {
    return Math.max(0, Math.round(raw));
  }
  const clean = String(raw || '')
    .replace(/[R$\s]/g, '')
    .trim();
  if (!clean) return 0;
  // Support Brazilian format "6.000,50" or standard decimal "6000.50"
  if (clean.includes(',')) {
    const normalized = clean.replace(/\./g, '').replace(',', '.');
    const val = parseFloat(normalized);
    return isNaN(val) ? 0 : Math.max(0, Math.round(val * 100));
  }
  const val = parseFloat(clean);
  return isNaN(val) ? 0 : Math.max(0, Math.round(val * 100));
}

export interface FreightOperatorOption {
  id: string;
  name: string;
  roleTitle: string;
  department: string;
  avatar: string;
}

export async function apiFetchFreightOperators(): Promise<{
  ok: boolean;
  comercialOperators: FreightOperatorOption[];
  expedicaoOperators: FreightOperatorOption[];
  monitoramentoOperators: FreightOperatorOption[];
  permissions?: {
    canAccessComercial: boolean;
    canAccessExpedicao: boolean;
    canAccessMonitoramento: boolean;
    canViewTeam: boolean;
    canTransfer: boolean;
    canCancel: boolean;
  };
  error?: string;
}> {
  try {
    const res = await fetch('/api/meus-fretes/operators', {
      method: 'GET',
      credentials: 'include',
      headers: getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    return {
      ok: res.ok,
      comercialOperators: data.comercialOperators || [],
      expedicaoOperators: data.expedicaoOperators || [],
      monitoramentoOperators: data.monitoramentoOperators || [],
      permissions: data.permissions,
      error: data.error,
    };
  } catch (err: any) {
    return {
      ok: false,
      comercialOperators: [],
      expedicaoOperators: [],
      monitoramentoOperators: [],
      error: err?.message || 'Falha ao consultar operadores.',
    };
  }
}

export async function apiFetchFreightsList(params: {
  area: 'COMERCIAL' | 'EXPEDICAO' | 'MONITORAMENTO';
  scope?: 'MEUS' | 'DISPONIVEIS' | 'EQUIPE';
  responsavelId?: string;
  search?: string;
  periodo?: 'TODOS' | 'HOJE' | 'SEMANA' | 'ATRASADOS';
  situacao?: string;
  includeCanceled?: boolean;
  cursor?: string;
  limit?: number;
  columnLimit?: number;
}): Promise<{
  ok: boolean;
  status: number;
  totalMatched: number;
  items: UnifiedFreightRecord[];
  nextCursor: string | null;
  hasMore: boolean;
  comercialCounters: Record<CommercialFreightStatus, number>;
  expedicaoCounters: {
    RECEBIDO: number;
    EM_PREPARACAO: number;
    LIBERADO_MONITORAMENTO: number;
    AGUARDANDO_FECHAMENTO: number;
    FECHADO: number;
    AGUARDANDO_COLETA: number;
    EM_TRANSPORTE: number;
    CONCLUIDO: number;
    COLETAS_HOJE: number;
    PENDENCIAS: number;
    DISPONIVEIS_FILA: number;
  };
  monitoramentoCounters?: {
    NOVO_PARA_CARREGAR: number;
    EM_DESLOCAMENTO_COLETA: number;
    NO_LOCAL_COLETA: number;
    CARREGADO_EM_TRANSPORTE: number;
    NO_LOCAL_ENTREGA: number;
    ENTREGUE: number;
    FINALIZADO: number;
    COLETAS_HOJE: number;
    PENDENCIAS: number;
    TOTAL_ATIVOS: number;
  };
  kanbanColumns: Record<
    string,
    {
      items: UnifiedFreightRecord[];
      total: number;
      hasMore: boolean;
      nextCursor: string | null;
    }
  >;
  serverTimeFormatted?: string;
  error?: string;
}> {
  const qs = new URLSearchParams();
  qs.set('area', params.area);
  if (params.scope) qs.set('scope', params.scope);
  if (params.responsavelId) qs.set('responsavelId', params.responsavelId);
  if (params.search) qs.set('search', params.search);
  if (params.periodo) qs.set('periodo', params.periodo);
  if (params.situacao) qs.set('situacao', params.situacao);
  if (params.includeCanceled) qs.set('includeCanceled', 'true');
  if (params.cursor) qs.set('cursor', params.cursor);
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.columnLimit) qs.set('columnLimit', String(params.columnLimit));

  const emptyComercialCounters: Record<CommercialFreightStatus, number> = {
    EM_NEGOCIACAO: 0,
    AGUARDANDO_EXPEDICAO: 0,
    EM_MONITORAMENTO: 0,
    CONCLUIDO: 0,
    CONTRATADO: 0,
    NA_EXPEDICAO: 0,
    EM_TRANSPORTE: 0,
    FINALIZADO: 0,
    CANCELADO: 0,
  };
  const emptyExpedicaoCounters = {
    RECEBIDO: 0,
    EM_PREPARACAO: 0,
    LIBERADO_MONITORAMENTO: 0,
    AGUARDANDO_FECHAMENTO: 0,
    FECHADO: 0,
    AGUARDANDO_COLETA: 0,
    EM_TRANSPORTE: 0,
    CONCLUIDO: 0,
    COLETAS_HOJE: 0,
    PENDENCIAS: 0,
    DISPONIVEIS_FILA: 0,
  };

  try {
    const res = await fetch(`/api/meus-fretes?${qs.toString()}`, {
      method: 'GET',
      credentials: 'include',
      headers: getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    return {
      items: [],
      comercialCounters: emptyComercialCounters,
      expedicaoCounters: emptyExpedicaoCounters,
      kanbanColumns: {},
      ...data,
      ok: Boolean(res.ok && data.ok),
      status: res.status,
      error: data.error || (!res.ok ? `Erro HTTP ${res.status} ao consultar fretes.` : undefined),
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      totalMatched: 0,
      items: [],
      nextCursor: null,
      hasMore: false,
      comercialCounters: emptyComercialCounters,
      expedicaoCounters: emptyExpedicaoCounters,
      kanbanColumns: {},
      error: err?.message || 'Falha de comunicação com o servidor.',
    };
  }
}

export async function apiFetchFreightDetails(freightId: string): Promise<{
  ok: boolean;
  status: number;
  freight?: UnifiedFreightRecord;
  anexos?: UnifiedFreightAttachment[];
  comentarios?: UnifiedFreightComment[];
  ocorrencias?: UnifiedFreightOccurrence[];
  historico?: UnifiedFreightDetailsPayload['historico'];
  error?: string;
}> {
  try {
    const res = await fetch(`/api/meus-fretes/${encodeURIComponent(freightId)}`, {
      method: 'GET',
      credentials: 'include',
      headers: getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    return {
      ...data,
      ok: Boolean(res.ok && data.ok),
      status: res.status,
      error: data.error || (!res.ok ? 'Não foi possível carregar os detalhes do frete.' : undefined),
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      error: err?.message || 'Falha de conexão ao buscar detalhes do frete.',
    };
  }
}

export async function apiCreateCommercialFreight(
  payload: Partial<UnifiedFreightRecord> & {
    cliente: string;
    origemCidadeUf: string;
    destinoCidadeUf: string;
    confirmAndSendToExpedicao?: boolean;
    expedicaoResponsavelId?: string | null;
    initialComment?: string;
    idempotencyKey?: string;
  }
): Promise<{
  ok: boolean;
  status: number;
  freight?: UnifiedFreightRecord;
  missingFields?: string[];
  error?: string;
}> {
  const headers = getAuthHeaders(
    payload.idempotencyKey ? { 'X-Idempotency-Key': payload.idempotencyKey } : {}
  );
  const res = await fetch('/api/meus-fretes', {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if(data.code==='DRIVER_BLOCKED'&&typeof window!=='undefined')window.dispatchEvent(new CustomEvent('rodovar:driver-blocked',{detail:data.driver}));
  return {
    ...data,
    ok: Boolean(res.ok && data.ok),
    status: res.status,
  };
}

export async function apiUpdateCommercialFreight(
  freightId: string,
  payload: Partial<UnifiedFreightRecord> & { baseRevision: number; reason?: string }
): Promise<{
  ok: boolean;
  status: number;
  freight?: UnifiedFreightRecord;
  reconfirmationTriggered?: boolean;
  currentRevision?: number;
  error?: string;
}> {
  const res = await fetch(`/api/meus-fretes/${encodeURIComponent(freightId)}/commercial`, {
    method: 'PUT',
    credentials: 'include',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if(data.code==='DRIVER_BLOCKED'&&typeof window!=='undefined')window.dispatchEvent(new CustomEvent('rodovar:driver-blocked',{detail:data.driver}));
  return {
    ...data,
    ok: Boolean(res.ok && data.ok),
    status: res.status,
  };
}

export async function apiCommercialTransition(
  freightId: string,
  payload: {
    baseRevision: number;
    targetStatus: CommercialFreightStatus;
    expedicaoResponsavelId?: string | null;
    idempotencyKey?: string;
  }
): Promise<{
  ok: boolean;
  status: number;
  freight?: UnifiedFreightRecord;
  currentRevision?: number;
  missingFields?: string[];
  error?: string;
}> {
  const headers = getAuthHeaders(
    payload.idempotencyKey ? { 'X-Idempotency-Key': payload.idempotencyKey } : {}
  );
  const res = await fetch(
    `/api/meus-fretes/${encodeURIComponent(freightId)}/commercial-transition`,
    {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify(payload),
    }
  );
  const data = await res.json();
  return {
    ...data,
    ok: Boolean(res.ok && data.ok),
    status: res.status,
  };
}

export async function apiClaimFreightFromQueue(
  freightId: string,
  idempotencyKey?: string
): Promise<{
  ok: boolean;
  status: number;
  freight?: UnifiedFreightRecord;
  error?: string;
  code?: string;
}> {
  const headers = getAuthHeaders(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {});
  const res = await fetch(`/api/meus-fretes/${encodeURIComponent(freightId)}/claim`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify({ idempotencyKey }),
  });
  const data = await res.json();
  return {
    ...data,
    ok: Boolean(res.ok && data.ok),
    status: res.status,
  };
}

// A retry refers to the same authenticated operation, freight and revision.
const expeditionRequestKeys = new Map<string, string>();
function expeditionRequestKey(freightId: string, operation: string, payload: unknown): string {
  const fingerprint = JSON.stringify([currentSessionId, freightId, operation, payload]);
  let key = expeditionRequestKeys.get(fingerprint);
  const storageKey = 'rodovar:expedition-retries:v1';
  let persisted: [string,string][] = [];
  try { persisted = JSON.parse(sessionStorage.getItem(storageKey) || '[]'); key ||= persisted.find(([f])=>f===fingerprint)?.[1]; } catch { /* Storage unavailable: memory retry protection remains active. */ }
  if (!key) {
    key = newRequestKey();
    expeditionRequestKeys.set(fingerprint, key);
    try { sessionStorage.setItem(storageKey, JSON.stringify([...persisted.filter(([f])=>f!==fingerprint),[fingerprint,key]].slice(-100))); } catch { /* Storage full or disabled. */ }
    if (expeditionRequestKeys.size > 500) expeditionRequestKeys.delete(expeditionRequestKeys.keys().next().value!);
  }
  return key;
}

export async function apiUpdateOperationalData(
  freightId: string,
  payload: {
    baseRevision: number;
    enderecoColeta?: string;
    enderecoEntrega?: string;
    instrucoesColetaEntrega?: string;
    clienteContato?: string;
    tipoCarga?: string;
    pesoKg?: number;
    volumes?: number;
    veiculoNecessario?: string;
    dataColetaIso?: string;
    janelaColetaInicio?: string;
    janelaColetaFim?: string;
    dataEntregaPrevistaIso?: string;
    janelaEntregaInicio?: string;
    janelaEntregaFim?: string;
    transportadorNome?: string;
    transportadorDocumento?: string;
    motoristaNome?: string;
    motoristaCpf?: string;
    motoristaTelefone?: string;
    placaVeiculo?: string;
    placaCarreta?: string;
    valorContratadoCentavos?: number;
    condicoesOperacionais?: string;
    condicoesPagamento?: string;
    favorecidoPagamento?: string;
    bancoPagamento?: string;
    tipoChavePix?: string;
    chavePix?: string;
    observacoes?: string;
    monitoramentoResponsavelId?: string | null;
    reason?: string;
    checklistFechamento?: Partial<UnifiedFreightChecklist>;
  }
): Promise<{
  ok: boolean;
  status: number;
  freight?: UnifiedFreightRecord;
  historico?: UnifiedFreightDetailsPayload['historico'];
  currentRevision?: number;
  error?: string;
}> {
  const res = await fetch(`/api/meus-fretes/${encodeURIComponent(freightId)}/operational`, {
    method: 'PUT',
    credentials: 'include',
    headers: getAuthHeaders({'X-Idempotency-Key': expeditionRequestKey(freightId, 'operational', payload)}),
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if(data.code==='DRIVER_BLOCKED'&&typeof window!=='undefined')window.dispatchEvent(new CustomEvent('rodovar:driver-blocked',{detail:data.driver}));
  return {
    ...data,
    ok: Boolean(res.ok && data.ok),
    status: res.status,
  };
}

export async function apiExpedicaoAction(
  freightId: string,
  payload: {
    baseRevision: number;
    action:
      | 'EMITIR_ORDEM'
      | 'CONFIRMAR_ENVIO_ORDEM_MOTORISTA'
      | 'REGISTRAR_VIDEOCHAMADA'
      | 'LIBERAR_PARA_MONITORAMENTO'
      | 'CONFIRMAR_FECHAMENTO'
      | 'ATUALIZAR_PREVISAO'
      | 'DEVOLVER_COMERCIAL';
    monitoramentoResponsavelId?: string | null;
    videochamadaObservacoes?: string;
    dataColetaIso?: string;
    janelaColetaInicio?: string;
    janelaColetaFim?: string;
    dataEntregaPrevistaIso?: string;
    janelaEntregaInicio?: string;
    janelaEntregaFim?: string;
    motivo?: string;
    idempotencyKey?: string;
  }
): Promise<{
  ok: boolean;
  status: number;
  freight?: UnifiedFreightRecord;
  historico?: UnifiedFreightDetailsPayload['historico'];
  loadingOrder?: any;
  missingFields?: string[];
  currentRevision?: number;
  error?: string;
  code?: string;
}> {
  const headers = getAuthHeaders(
    { 'X-Idempotency-Key': payload.idempotencyKey || expeditionRequestKey(freightId, 'expedicao-action', payload) }
  );
  const res = await fetch(`/api/meus-fretes/${encodeURIComponent(freightId)}/expedicao-action`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  return {
    ...data,
    ok: Boolean(res.ok && data.ok),
    status: res.status,
  };
}

export async function apiMonitoramentoAction(
  freightId: string,
  payload: {
    baseRevision: number;
    action:
      | 'AVANCAR_ETAPA'
      | 'REGISTRAR_LOCALIZACAO_ORIENTACAO'
      | 'DEVOLVER_EXPEDICAO';
    targetStage?: MonitoringFreightStatus;
    horarioRealEvento?: string;
    observacoes?: string;
    enderecoEntrega?: string;
    ultimaLocalizacaoInformada?: string;
    orientacoesMotorista?: string;
    dataColetaIso?: string;
    janelaColetaInicio?: string;
    dataEntregaPrevistaIso?: string;
    janelaEntregaInicio?: string;
    janelaEntregaFim?: string;
    motivo?: string;
    idempotencyKey?: string;
  }
): Promise<{
  ok: boolean;
  status: number;
  freight?: UnifiedFreightRecord;
  historico?: UnifiedFreightDetailsPayload['historico'];
  currentRevision?: number;
  error?: string;
  code?: string;
}> {
  const headers = getAuthHeaders(
    {'X-Idempotency-Key':payload.idempotencyKey || expeditionRequestKey(freightId,'monitoramento-action',payload)}
  );
  const res = await fetch(
    `/api/meus-fretes/${encodeURIComponent(freightId)}/monitoramento-action`,
    {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify(payload),
    }
  );
  const data = await res.json();
  return {
    ...data,
    ok: Boolean(res.ok && data.ok),
    status: res.status,
  };
}

export async function apiRegisterFreightOccurrence(
  freightId: string,
  payload: {
    title: string;
    description?: string;
    severity: 'BAIXA' | 'MEDIA' | 'IMPEDITIVA';
    horarioRealEvento?: string;
    idempotencyKey?: string;
  }
): Promise<{
  ok: boolean;
  status: number;
  freight?: UnifiedFreightRecord;
  occurrence?: UnifiedFreightOccurrence;
  ocorrencias?: UnifiedFreightOccurrence[];
  historico?: UnifiedFreightDetailsPayload['historico'];
  error?: string;
}> {
  const headers = getAuthHeaders(
    {'X-Idempotency-Key':payload.idempotencyKey || expeditionRequestKey(freightId,'occurrence',payload)}
  );
  const res = await fetch(`/api/meus-fretes/${encodeURIComponent(freightId)}/occurrences`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  return {
    ...data,
    ok: Boolean(res.ok && data.ok),
    status: res.status,
  };
}

export async function apiResolveFreightOccurrence(
  freightId: string,
  occId: string
): Promise<{
  ok: boolean;
  status: number;
  freight?: UnifiedFreightRecord;
  occurrence?: UnifiedFreightOccurrence;
  ocorrencias?: UnifiedFreightOccurrence[];
  historico?: UnifiedFreightDetailsPayload['historico'];
  error?: string;
}> {
  const res = await fetch(
    `/api/meus-fretes/${encodeURIComponent(freightId)}/occurrences/${encodeURIComponent(occId)}/resolve`,
    {
      method: 'POST',
      credentials: 'include',
      headers: getAuthHeaders(),
    }
  );
  const data = await res.json();
  return {
    ...data,
    ok: Boolean(res.ok && data.ok),
    status: res.status,
  };
}

export async function apiAddFreightComment(
  freightId: string,
  text: string,
  idempotencyKey?: string
): Promise<{
  ok: boolean;
  status: number;
  freight?: UnifiedFreightRecord;
  comment?: UnifiedFreightComment;
  error?: string;
}> {
  const headers = getAuthHeaders(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {});
  const res = await fetch(`/api/meus-fretes/${encodeURIComponent(freightId)}/comments`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify({ text, idempotencyKey }),
  });
  const data = await res.json();
  return {
    ...data,
    ok: Boolean(res.ok && data.ok),
    status: res.status,
  };
}

export async function apiUploadFreightAttachment(
  freightId: string,
  payload: {
    fileName: string;
    label?: string;
    category: UnifiedFreightAttachment['category'];
    dataUrl: string;
    conferido?: boolean;
    idempotencyKey?: string;
  }
): Promise<{
  ok: boolean;
  status: number;
  freight?: UnifiedFreightRecord;
  attachment?: UnifiedFreightAttachment;
  anexos?: UnifiedFreightAttachment[];
  historico?: UnifiedFreightDetailsPayload['historico'];
  error?: string;
}> {
  const res = await fetch(`/api/meus-fretes/${encodeURIComponent(freightId)}/attachments`, {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders({'X-Idempotency-Key':payload.idempotencyKey||newRequestKey()}),
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  return {
    ...data,
    ok: Boolean(res.ok && data.ok),
    status: res.status,
  };
}

export async function apiVerifyFreightAttachment(
  freightId: string,
  attId: string,
  conferido: boolean
): Promise<{
  ok: boolean;
  status: number;
  freight?: UnifiedFreightRecord;
  attachment?: UnifiedFreightAttachment;
  anexos?: UnifiedFreightAttachment[];
  historico?: UnifiedFreightDetailsPayload['historico'];
  error?: string;
}> {
  const res = await fetch(
    `/api/meus-fretes/${encodeURIComponent(freightId)}/attachments/${encodeURIComponent(attId)}/verify`,
    {
      method: 'POST',
      credentials: 'include',
      headers: getAuthHeaders(),
      body: JSON.stringify({ conferido }),
    }
  );
  const data = await res.json();
  return {
    ...data,
    ok: Boolean(res.ok && data.ok),
    status: res.status,
  };
}

export async function apiDownloadFreightAttachment(
  freightId: string,
  attId: string,
  fallbackFileName: string
): Promise<{ ok: boolean; error?: string }> {
  const { sessionId } = loadStoredAuthTokens();
  const headers: Record<string, string> = {};
  if (sessionId) headers['X-Rodovar-Session'] = sessionId;

  const res = await fetch(
    `/api/meus-fretes/${encodeURIComponent(freightId)}/attachments/${encodeURIComponent(attId)}/download`,
    {
      method: 'GET',
      credentials: 'include',
      headers,
    }
  );
  if (!res.ok) {
    let errMsg = 'Não foi possível baixar o anexo.';
    try {
      const json = await res.json();
      if (json.error) errMsg = json.error;
    } catch {
      // ignore
    }
    return { ok: false, error: errMsg };
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fallbackFileName || 'documento-rodovar';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return { ok: true };
}

export async function apiTransferFreightResponsibility(
  freightId: string,
  payload: {
    baseRevision: number;
    sector: 'COMERCIAL' | 'EXPEDICAO' | 'MONITORAMENTO';
    newResponsibleId: string;
    reason: string;
  }
): Promise<{
  ok: boolean;
  status: number;
  freight?: UnifiedFreightRecord;
  historico?: UnifiedFreightDetailsPayload['historico'];
  error?: string;
}> {
  const res = await fetch(`/api/meus-fretes/${encodeURIComponent(freightId)}/transfer`, {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  return {
    ...data,
    ok: Boolean(res.ok && data.ok),
    status: res.status,
  };
}

export async function apiCancelFreight(
  freightId: string,
  payload: {
    baseRevision: number;
    reason: string;
  }
): Promise<{
  ok: boolean;
  status: number;
  freight?: UnifiedFreightRecord;
  error?: string;
}> {
  const res = await fetch(`/api/meus-fretes/${encodeURIComponent(freightId)}/cancel`, {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  return {
    ...data,
    ok: Boolean(res.ok && data.ok),
    status: res.status,
  };
}

export async function apiDeleteFreightAttachment(
  freightId: string,
  attId: string
): Promise<{
  ok: boolean;
  status: number;
  freight?: UnifiedFreightRecord;
  anexos?: UnifiedFreightAttachment[];
  historico?: UnifiedFreightDetailsPayload['historico'];
  error?: string;
}> {
  const res = await fetch(
    `/api/meus-fretes/${encodeURIComponent(freightId)}/attachments/${encodeURIComponent(attId)}`,
    {
      method: 'DELETE',
      credentials: 'include',
      headers: getAuthHeaders(),
    }
  );
  const data = await res.json().catch(() => ({}));
  return {
    ...data,
    ok: Boolean(res.ok && data.ok),
    status: res.status,
  };
}

export async function apiDeleteAllFreightAttachments(
  freightId: string
): Promise<{
  ok: boolean;
  status: number;
  freight?: UnifiedFreightRecord;
  anexos?: UnifiedFreightAttachment[];
  historico?: UnifiedFreightDetailsPayload['historico'];
  error?: string;
}> {
  const res = await fetch(
    `/api/meus-fretes/${encodeURIComponent(freightId)}/attachments`,
    {
      method: 'DELETE',
      credentials: 'include',
      headers: getAuthHeaders(),
    }
  );
  const data = await res.json().catch(() => ({}));
  return {
    ...data,
    ok: Boolean(res.ok && data.ok),
    status: res.status,
  };
}

export async function apiReactivateFreight(
  freightId: string,
  payload: {
    reason: string;
    targetStage?: string;
  }
): Promise<{
  ok: boolean;
  status: number;
  freight?: UnifiedFreightRecord;
  historico?: UnifiedFreightDetailsPayload['historico'];
  error?: string;
}> {
  const res = await fetch(
    `/api/meus-fretes/${encodeURIComponent(freightId)}/reactivate`,
    {
      method: 'POST',
      credentials: 'include',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    }
  );
  const data = await res.json().catch(() => ({}));
  return {
    ...data,
    ok: Boolean(res.ok && data.ok),
    status: res.status,
  };
}

export async function apiFetchFreightNotifications(): Promise<{
  notifications: Array<{
    id: string;
    recipientId: string;
    type: 'comunicado' | 'prazo';
    dotColor: 'red' | 'blue';
    title: string;
    subtitle: string;
    timeLabel: string;
    read: boolean;
    targetSection: 'fretes_comercial' | 'fretes_expedicao' | 'fretes_ativos';
    targetId: string;
  }>;
  unreadCount: number;
  unavailable?: boolean;
}> {
  try {
    const res = await fetch('/api/meus-fretes/notifications', {
      method: 'GET',
      credentials: 'include',
      headers: getAuthHeaders(),
    });
    if (!res.ok) return { notifications: [], unreadCount: 0, unavailable: true };
    return await res.json();
  } catch {
    return { notifications: [], unreadCount: 0, unavailable: true };
  }
}

export async function apiMarkFreightNotificationRead(notifId: string): Promise<void> {
  try {
    await fetch(`/api/meus-fretes/notifications/${encodeURIComponent(notifId)}/read`, {
      method: 'POST',
      credentials: 'include',
      headers: getAuthHeaders(),
    });
  } catch {
    // ignore
  }
}

export async function apiUploadDocumentAttachments(files: Array<{
  name: string;
  dataUrl: string;
  size: number;
  type?: string;
}>): Promise<{
  ok: boolean;
  attachments?: Array<{
    id: string;
    name: string;
    size: string;
    fileType: string;
    url: string;
  }>;
  error?: string;
}> {
  try {
    const res = await fetch('/api/documentos/upload-anexos', {
      method: 'POST',
      credentials: 'include',
      headers: getAuthHeaders(true),
      body: JSON.stringify({ files }),
    });
    const data = await res.json().catch(() => ({}));
    return {
      ok: Boolean(res.ok && data.ok),
      attachments: data.attachments || [],
      error: data.error || (!res.ok ? `Erro HTTP ${res.status} ao enviar anexos.` : undefined),
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err.message || 'Falha de comunicação ao enviar anexos para o servidor.',
    };
  }
}


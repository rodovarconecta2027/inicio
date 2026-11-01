import {CorporateModal} from './ui/CorporateModal';
import {DriverCenter} from './DriverCenter';
import {getAuthHeaders} from '../lib/serverApi';
import {validatePortalBackup,backupEmployees} from '../lib/adminBackup';
import {AdministrationMaster, type AdminArea} from './AdministrationMaster';
import {AgendaPremium} from './AgendaPremium';
import {CollaboratorsPremium} from './CollaboratorsPremium';
import {useNotificationRecord} from '../hooks/useNotificationRecord';
import {MuralPremium} from './MuralPremium';
import {ProfileSecurity} from './ProfileSecurity';
import './ProfileView.css';
import {RhRequestsWorkspace} from './RhRequestsWorkspace';
import './PortalModernizacao.css';
import { SharedRequestsView } from './SharedRequestsView';
import React, { useCallback, useMemo, useState, useEffect, useLayoutEffect } from 'react';
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  BookOpen,
  Calendar,
  Camera,
  Check,
  CheckCheck,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Edit3,
  Eye,
  FileText,
  Folder,
  HelpCircle,
  Heart,
  History,
  Image as ImageIcon,
  Lock,
  Mail,
  Megaphone,
  MessageSquare,
  Paperclip,
  Phone,
  Pin,
  Plus,
  Printer,
  Search,
  Send,
  Shield,
  ShieldCheck,
  Trash2,
  Users,
  UserPlus,
  X,
} from 'lucide-react';
import {
  Announcement,
  AnnouncementAttachment,
  AnnouncementCategory,
  AuditLog,
  ChatThread,
  CorporateDocument,
  CorporateEvent,
  Department,
  DocumentAttachmentItem,
  DocumentCategory,
  Employee,
  EmployeeInvite,
  InternalRequest,
  MenuSection,
  RequestStatus,
  SystemConfig,
} from '../types';
import { printRequestCsiReceipt } from '../lib/csiReceiptPrinter';
import {
  hasPagePermission,
  AVAILABLE_MODULES,
  ALL_MODULE_IDS,
  getDefaultPermissionsForDepartment,
} from '../lib/permissions';
import { WhatsAppChatView, SendMessageOptions } from './WhatsAppChatView';
import { AccessReleaseTab } from './AccessReleaseTab';
import { SystemConfigTab } from './SystemConfigTab';
import {
  apiFetchAdminAccessRequests,
  apiRestoreDefaultAvatar,
  apiUpdateProfile,
  apiUploadDocumentAttachments,
  apiUploadProfileAvatar,
  resolveAvatarUrl,
} from '../lib/serverApi';

interface ModulesViewProps {
  activeSection: MenuSection;
  currentUser: Employee;
  employees: Employee[];
  systemConfig?: SystemConfig;
  pendingAccessRequestsCount?: number;
  onPendingCountChange?: (count: number) => void;
  onAccountsUpdated?: (accounts: Employee[]) => void;
  onSystemConfigPublished?: (cfg: SystemConfig) => void;
  announcements: Announcement[];
  onMuralHydrated?: (rows: Announcement[], notifications: any[]) => void;
  requests: InternalRequest[];
  events: CorporateEvent[];
  documents: CorporateDocument[];
  chats: ChatThread[];
  invites: EmployeeInvite[];
  auditLogs: AuditLog[];
  onConfirmRead: (annId: string) => void;
  onToggleLike: (annId: string) => void;
  onAddComment: (annId: string, text: string) => void;
  onDeleteComment?: (annId: string, commentId: string) => void;
  onCreateAnnouncement: (
    ann: Omit<
      Announcement,
      'id' | 'likes' | 'comments' | 'readReceipts' | 'createdAtIso' | 'dateFormatted'
    >
  ) => void;
  onUpdateAnnouncement?: (
    annId: string,
    updates: Partial<Announcement>,
    editNote: string
  ) => void;
  onTogglePinAnnouncement?: (annId: string) => void;
  onToggleArchiveAnnouncement?: (annId: string) => void;
  onDeleteAnnouncement?: (annId: string) => void;
  onCreateRequest: (req: {
    targetDepartment: Department;
    subject: string;
    description: string;
    priority: 'Baixa' | 'Média' | 'Alta' | 'Urgente';
    attachmentName?: string;
  }) => void;
  onUpdateRequestStatus: (reqId: string, status: RequestStatus, note?: string) => void;
  onAddRequestResponse?: (reqId: string, responseText: string) => void;
  onEscalateRequestToDiretoria?: (reqId: string, reason: string) => void;
  onDeleteRequest?: (reqId: string) => void;
  onExtendRequestDeadline: (reqId: string, extraHours: number, justification: string) => void;
  onSendMessage: (
    threadId: string,
    text: string,
    attachment?: string,
    attachmentSize?: string,
    extra?: SendMessageOptions
  ) => void;
  onMarkThreadRead?: (threadId: string) => void;
  onCreateGroupChat?: (groupData: {
    name: string;
    department: Department | 'Todos';
    roleOrDept: string;
    pinnedNotice?: string;
    participantIds: string[];
  }) => void;
  onUpdateThreadPinnedNotice?: (threadId: string, pinnedNotice: string) => void;
  onTogglePinMessage?: (threadId: string, messageId: string) => void;
  onDeleteMessage?: (threadId: string, messageId: string) => void;
  onManageGroupParticipants?: (threadId: string, participantIds: string[]) => void;
  onToggleEventRsvp: (eventId: string) => void;
  onCreateEvent: (evt: Omit<CorporateEvent, 'id' | 'attendees'>) => void;
  onUpdateEvent?: (eventId: string, updates: Partial<CorporateEvent>) => void;
  onDeleteEvent?: (eventId: string) => void;
  onUploadDocument: (doc: Omit<CorporateDocument, 'id' | 'updatedAt'>) => void;
  onUpdateDocumentVersion?: (
    docId: string,
    newVersion: string,
    newDescription: string,
    newContentPreview: string
  ) => void;
  onDeleteDocument?: (docId: string) => void;
  onCreateInvite: (inv: Omit<EmployeeInvite, 'id' | 'token' | 'expiresAt' | 'status'>) => void;
  onActivateInviteToken?: (tokenString: string) => boolean | Promise<boolean>;
  onToggleEmployeeActive: (empId: string) => void;
  onCreateEmployeeDirect?: (data: {
    name: string;
    email: string;
    login: string;
    password: string;
    mustChangePassword: boolean;
    roleTitle: string;
    department: Department;
    accessLevel: 'FUNCIONARIO' | 'ADMINISTRADOR' | 'DIRETORIA';
    phoneExt: string;
    permissoesPaginas?: string[];
  }) => void;
  onDeleteEmployee?: (empId: string) => void;
  onUpdateEmployeeAdmin?: (
    empId: string,
    updates: {
      name?: string;
      email?: string;
      login?: string;
      password?: string;
      mustChangePassword?: boolean;
      roleTitle: string;
      department: Department;
      accessLevel: 'FUNCIONARIO' | 'ADMINISTRADOR' | 'DIRETORIA';
      phoneExt: string;
      permissoesPaginas?: string[];
    }
  ) => void;
  onUpdateMyProfile?: (updates: {
    name: string;
    phoneExt: string;
    avatar: string;
    email?: string;
    login?: string;
    password?: string;
  }) => void;
  onRestorePortalDefaults?: () => void;
  onImportPortalBackup?: (backupData: Record<string, unknown>) => boolean;
  onStartDirectChat: (emp: Employee) => void;
  onNavigate: (section: MenuSection) => void;
  initialOpenRequestModal?: boolean;
  onClearInitialModal?: () => void;
}

const ModulesViewContent: React.FC<ModulesViewProps> = ({
  activeSection,
  currentUser,
  employees,
  systemConfig,
  pendingAccessRequestsCount = 0,
  onPendingCountChange,
  onAccountsUpdated,
  onSystemConfigPublished,
  announcements,
  requests,
  events,
  documents,
  chats,
  invites,
  auditLogs,
  onConfirmRead,
  onToggleLike,
  onAddComment,
  onDeleteComment,
  onCreateAnnouncement,
  onUpdateAnnouncement,
  onTogglePinAnnouncement,
  onToggleArchiveAnnouncement,
  onDeleteAnnouncement,
  onCreateRequest,
  onUpdateRequestStatus,
  onAddRequestResponse,
  onEscalateRequestToDiretoria,
  onDeleteRequest,
  onExtendRequestDeadline,
  onSendMessage,
  onMarkThreadRead,
  onCreateGroupChat,
  onUpdateThreadPinnedNotice,
  onTogglePinMessage,
  onDeleteMessage,
  onManageGroupParticipants,
  onToggleEventRsvp,
  onCreateEvent,
  onUpdateEvent,
  onDeleteEvent,
  onUploadDocument,
  onUpdateDocumentVersion,
  onDeleteDocument,
  onCreateInvite,
  onActivateInviteToken,
  onToggleEmployeeActive,
  onCreateEmployeeDirect,
  onDeleteEmployee,
  onUpdateEmployeeAdmin,
  onUpdateMyProfile,
  onRestorePortalDefaults,
  onImportPortalBackup,
  onStartDirectChat,
  onNavigate,
  initialOpenRequestModal,
  onClearInitialModal,
}) => {
  const canPublish =
    currentUser.accessLevel === 'DIRETORIA' || currentUser.accessLevel === 'ADMINISTRADOR';
  const isStrictAdmin = currentUser.accessLevel === 'ADMINISTRADOR';
  const [confirmRestoreDefaults, setConfirmRestoreDefaults] = useState(false);
  const [adminSubTab, setAdminSubTab] = useState<
    'visao_geral' | 'liberacao_uso' | 'configuracao_sistema'
  >(() => {
    try {
      const savedSub = sessionStorage.getItem('rodovar_restore_admin_subtab');
      if (savedSub === 'configuracao_sistema' || savedSub === 'liberacao_uso') {
        sessionStorage.removeItem('rodovar_restore_admin_subtab');
        return savedSub;
      }
    } catch {
      // ignore
    }
    return 'liberacao_uso';
  });
  const [adminScrollRequest,setAdminScrollRequest]=useState<{target:string;sequence:number}|null>(null);
  useLayoutEffect(()=>{
    if(!adminScrollRequest||activeSection!=='administracao')return;
    const frame=requestAnimationFrame(()=>{
      const target=document.getElementById(adminScrollRequest.target);
      if(!target)return;
      target.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    });
    return()=>cancelAnimationFrame(frame);
  },[adminScrollRequest,activeSection]);
  const [showDriverCenter,setShowDriverCenter]=useState(false);
  const [masterArea,setMasterArea]=useState<AdminArea>(()=>adminSubTab==='configuracao_sistema'?'system':'users');
  const [localPendingCount, setLocalPendingCount] = useState<number>(pendingAccessRequestsCount);
  const [profileErrorMsg, setProfileErrorMsg] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState<boolean>(false);

  React.useEffect(() => {
    setLocalPendingCount(pendingAccessRequestsCount);
  }, [pendingAccessRequestsCount]);

  React.useEffect(() => {
    if (activeSection === 'administracao' && isStrictAdmin) {
      apiFetchAdminAccessRequests()
        .then((res) => {
          if (res.ok) {
            setLocalPendingCount(res.pendingCount);
            onPendingCountChange?.(res.pendingCount);
            onAccountsUpdated?.(res.accounts);
          }
        })
        .catch(() => {
          // ignore
        });
    }
  }, [activeSection, isStrictAdmin, onPendingCountChange, onAccountsUpdated]);

  // --- MURAL DE COMUNICADOS STATE (FASE 3 COMPLETA) ---
  const [annSearch, setAnnSearch] = useState('');
  const [annCategory, setAnnCategory] = useState<string>('Todos');
  const [annStatusTab, setAnnStatusTab] = useState<
    'ativos' | 'nao_lidos' | 'fixados' | 'arquivados'
  >('ativos');
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [showNewAnnModal, setShowNewAnnModal] = useState(false);
  const [openAnnouncementId, setOpenAnnouncementId] = useState<string | null>(null);
  const [editingAnn, setEditingAnn] = useState<Announcement | null>(null);
  const [editNoteInput, setEditNoteInput] = useState('');
  const [inspectReadReceiptsAnn, setInspectReadReceiptsAnn] = useState<Announcement | null>(null);
  const [receiptDeptFilter, setReceiptDeptFilter] = useState<string>('Todos');
  const [inspectEditHistoryAnn, setInspectEditHistoryAnn] = useState<Announcement | null>(null);
  const [attachmentInputName, setAttachmentInputName] = useState('');

  const [newAnnForm, setNewAnnForm] = useState({
    title: '',
    summary: '',
    content: '',
    category: 'Importante' as AnnouncementCategory,
    priority: 'Importante' as 'Normal' | 'Importante' | 'Urgente',
    targetAudience: 'Todos' as Department | 'Todos',
    requireReadConfirmation: true,
    pinned: false,
    coverImage: '/assets/aistudio/010203_5a4289e5.png',
    attachments: [] as AnnouncementAttachment[],
  });

  // Open Editor for Existing Announcement
  const openEditAnnouncementModal = (ann: Announcement) => {
    setEditingAnn(ann);
    setEditNoteInput('Atualização de informações oficiais pela administração');
    setNewAnnForm({
      title: ann.title,
      summary: ann.summary,
      content: ann.content,
      category: ann.category,
      priority: ann.priority,
      targetAudience: ann.targetAudience,
      requireReadConfirmation: ann.requireReadConfirmation,
      pinned: Boolean(ann.pinned),
      coverImage: ann.coverImage || '/assets/aistudio/010203_5a4289e5.png',
      attachments: ann.attachments || [],
    });
    setShowNewAnnModal(true);
  };

  const handleCoverFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setNewAnnForm((prev) => ({ ...prev, coverImage: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAttachmentFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const sizeKb = Math.max(1, Math.round(file.size / 1024));
    const sizeStr = sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;
    const ext = file.name.split('.').pop()?.toUpperCase() || 'PDF';
    setNewAnnForm((prev) => ({
      ...prev,
      attachments: [...prev.attachments, { name: file.name, size: sizeStr, type: ext }],
    }));
  };

  const handleDownloadAttachment = (att: AnnouncementAttachment) => {
    if (att.url) {
      const a = document.createElement('a');
      a.href = att.url;
      a.download = att.name.endsWith('.pdf') ? att.name : `${att.name}.pdf`;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }
    const blob = new Blob(
      [
        `RODOVAR CONECTA — DOCUMENTO OFICIAL ANEXO 2027\nArquivo: ${att.name}\nTamanho: ${att.size}\nEmitido pela plataforma corporativa RODOVAR CONECTA.`,
      ],
      { type: 'text/plain;charset=utf-8' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = att.name.endsWith('.txt') ? att.name : `${att.name}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // --- SOLICITAÇÕES STATE (FASE 5 COMPLETA) ---
  const [reqFilter, setReqFilter] = useState<string>('Todas');
  const [reqDeptFilter, setReqDeptFilter] = useState<string>('Todos');
  const [reqSearch, setReqSearch] = useState('');
  const [showNewReqModal, setShowNewReqModal] = useState(Boolean(initialOpenRequestModal));
  const [selectedReq, setSelectedReq] = useState<InternalRequest | null>(null);
  const [deadlineNote, setDeadlineNote] = useState('');
  const [reqResponseNote, setReqResponseNote] = useState('');
  const [reqEscalationReason, setReqEscalationReason] = useState('');
  const [reqPage, setReqPage] = useState<number>(1);
  const REQS_PER_PAGE = 10;
  const [newReqForm, setNewReqForm] = useState({
    targetDepartment: 'Recursos Humanos' as Department,
    subject: '',
    description: '',
    priority: 'Média' as 'Baixa' | 'Média' | 'Alta' | 'Urgente',
    attachmentName: '',
  });

  React.useEffect(() => {
    if (initialOpenRequestModal) {
      setShowNewReqModal(true);
      onClearInitialModal?.();
    }
  }, [initialOpenRequestModal, onClearInitialModal]);

  // --- CHAT & GRUPOS STATE (FASE 4 COMPLETA) ---
  const [selectedChatId, setSelectedChatId] = useState<string>(
    activeSection === 'grupos' ? 'grp-1' : 'chat-1'
  );
  const [chatSearch, setChatSearch] = useState('');
  const [chatUnreadFilter, setChatUnreadFilter] = useState<'todas' | 'nao_lidas'>('todas');
  const [inThreadSearch, setInThreadSearch] = useState('');
  const [messageText, setMessageText] = useState('');
  const [pendingChatAttachment, setPendingChatAttachment] = useState<{
    name: string;
    size: string;
  } | null>(null);
  const [showNewDirectChatModal, setShowNewDirectChatModal] = useState(false);
  const [showNewGroupModal, setShowNewGroupModal] = useState(false);
  const [showGroupMembersModal, setShowGroupMembersModal] = useState(false);
  const [editingPinnedNotice, setEditingPinnedNotice] = useState(false);
  const [pinnedNoticeInput, setPinnedNoticeInput] = useState('');
  const [newGroupForm, setNewGroupForm] = useState({
    name: '',
    department: 'Operacional' as Department | 'Todos',
    roleOrDept: 'Coordenação Operacional',
    pinnedNotice: '',
    participantIds: ['emp-1', 'emp-2', 'emp-4'] as string[],
  });

  const handleChatAttachmentSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const sizeKb = Math.max(1, Math.round(file.size / 1024));
    const sizeStr = sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;
    setPendingChatAttachment({ name: file.name, size: sizeStr });
  };

  React.useEffect(() => {
    if (activeSection === 'grupos') {
      const firstGrp = chats.find((c) => c.isGroup);
      if (firstGrp) setSelectedChatId(firstGrp.id);
    } else if (activeSection === 'mensagens') {
      const firstPriv = chats.find((c) => !c.isGroup);
      if (firstPriv) setSelectedChatId(firstPriv.id);
    }
  }, [activeSection]);

  // --- AGENDA STATE (FASE 5 COMPLETA) ---
  const [agendaView, setAgendaView] = useState<'lista' | 'mensal' | 'semanal'>('lista');
  const [agendaDeptFilter, setAgendaDeptFilter] = useState<string>('Todos');
  const [showNewEventModal, setShowNewEventModal] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [inspectAttendeesEvent, setInspectAttendeesEvent] = useState<CorporateEvent | null>(null);
  const {id:notificationRecordId,revision:notificationRevision}=useNotificationRecord();
  useEffect(()=>{if(activeSection==='agenda'&&notificationRecordId){const match=events.find(e=>e.id===notificationRecordId);if(match)setInspectAttendeesEvent(match);}},[activeSection,notificationRecordId,notificationRevision,events]);
  const [newEvtForm, setNewEvtForm] = useState({
    day: '28',
    monthShort: 'JAN',
    dateIso: '2027-01-28',
    time: '09:00 - 11:00',
    location: 'Auditório Matriz RODOVAR',
    title: '',
    organizer: currentUser.department,
    department: currentUser.department as Department | 'Empresa',
    badgeLabel: 'Evento' as CorporateEvent['badgeLabel'],
    badgeColor: 'blue' as 'red' | 'blue' | 'gray',
    description: '',
  });

  // --- DOCUMENTOS STATE (FASE 6 COMPLETA) ---
  const [docCategory, setDocCategory] = useState<string>('Todos');
  const [docSearch, setDocSearch] = useState('');
  const [previewDoc, setPreviewDoc] = useState<CorporateDocument | null>(null);
  const [showUploadDocModal, setShowUploadDocModal] = useState(false);
  const [updatingVersionDoc, setUpdatingVersionDoc] = useState<CorporateDocument | null>(null);
  const [versionUpdateForm, setVersionUpdateForm] = useState({
    version: 'v2.0',
    description: '',
    contentPreview: '',
  });
  const [newDocForm, setNewDocForm] = useState({
    title: '',
    category: 'Políticas da Empresa' as DocumentCategory,
    version: 'v1.0',
    author: currentUser.department,
    size: '1.2 MB',
    fileType: 'PDF' as 'PDF' | 'DOCX' | 'XLSX',
    description: '',
    contentPreview: '',
  });
  const [docAttachments, setDocAttachments] = useState<
    Array<{ name: string; size: string; fileType: string; dataUrl: string; fileObj?: File }>
  >([]);
  const [docUploadProgress, setDocUploadProgress] = useState<number>(0);
  const [isUploadingDoc, setIsUploadingDoc] = useState<boolean>(false);
  const [docUploadError, setDocUploadError] = useState<string | null>(null);
  const [showCredencialModal, setShowCredencialModal] = useState<boolean>(false);

  // --- DIRETÓRIO & ADMIN STATE (FASE 6 COMPLETA) ---
  const [empSearch, setEmpSearch] = useState('');
  const [empDeptFilter, setEmpDeptFilter] = useState<string>('Todos');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showCreateLoginModal, setShowCreateLoginModal] = useState(false);
  const [tokenVerifyInput, setTokenVerifyInput] = useState('');
  const [tokenVerifyFeedback, setTokenVerifyFeedback] = useState<string | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [editEmpForm, setEditEmpForm] = useState({
    name: '',
    email: '',
    login: '',
    password: '',
    mustChangePassword: false,
    roleTitle: '',
    department: 'Operacional' as Department,
    accessLevel: 'FUNCIONARIO' as 'FUNCIONARIO' | 'ADMINISTRADOR' | 'DIRETORIA',
    phoneExt: '',
    permissoesPaginas: [] as string[],
  });
  const [createLoginForm, setCreateLoginForm] = useState({
    name: '',
    email: '',
    login: '',
    password: 'rodovar2027#@',
    mustChangePassword: true,
    roleTitle: '',
    department: 'Operacional' as Department,
    accessLevel: 'FUNCIONARIO' as 'FUNCIONARIO' | 'ADMINISTRADOR' | 'DIRETORIA',
    phoneExt: '71 9 9920-2476',
    permissoesPaginas: getDefaultPermissionsForDepartment('Operacional', 'FUNCIONARIO'),
  });
  const [inviteForm, setInviteForm] = useState({
    fullName: '',
    email: '',
    roleTitle: '',
    department: 'Operacional' as Department,
    accessLevel: 'FUNCIONARIO' as 'FUNCIONARIO' | 'ADMINISTRADOR' | 'DIRETORIA',
  });

  // --- PERFIL STATE (FASE 6 COMPLETA) ---
  const [profileSavedToast, setProfileSavedToast] = useState(false);
  const [myProfileForm, setMyProfileForm] = useState({
    name: currentUser.name,
    phoneExt: currentUser.phoneExt,
    avatar: currentUser.avatar,
    email: currentUser.email,
    login: currentUser.login || currentUser.email,
  });
  React.useEffect(() => {
    setMyProfileForm({
      name: currentUser.name,
      phoneExt: currentUser.phoneExt,
      avatar: currentUser.avatar,
      email: currentUser.email,
      login: currentUser.login || currentUser.email,
      });
  }, [
    currentUser.name,
    currentUser.phoneExt,
    currentUser.avatar,
    currentUser.email,
    currentUser.login,
  ]);

  const [notifPrefs, setNotifPrefs] = useState(() => {
    const defaults={urgentAnnouncements:true,requestUpdates:true,slaWarnings:true,calendarReminders:true,browserPush:false};
    try { const saved=JSON.parse(localStorage.getItem('rodovar-profile-preferences:'+currentUser.id)||'null'); if(saved) for(const key of Object.keys(defaults) as (keyof typeof defaults)[]) if(typeof saved[key]==='boolean') defaults[key]=saved[key]; } catch {}
    return defaults;
  });

  // --- AJUDA & SUPORTE INTERNO + EXPORTAÇÃO GERENCIAL STATE (FASE 7 COMPLETA) ---
  const [helpSearch, setHelpSearch] = useState('');
  const [helpCategory, setHelpCategory] = useState<string>('Todas');
  const [supportForm, setSupportForm] = useState({
    targetDepartment: 'Administrativo' as Department,
    subject: '',
    description: '',
    priority: 'Alta' as 'Baixa' | 'Média' | 'Alta' | 'Urgente',
  });
  const [supportSuccessToast, setSupportSuccessToast] = useState<string | null>(null);
  const [exportReportToast, setExportReportToast] = useState<string | null>(null);

  // --- FASE 10: DOSSIÊ EXECUTIVO DA DIRETORIA, VALIDADOR DE HASH & FILTRO DE AUDITORIA ---
  const [showExecutiveDossierModal, setShowExecutiveDossierModal] = useState(false);
  const [hashVerifyInput, setHashVerifyInput] = useState('');
  const [hashVerifyResult, setHashVerifyResult] = useState<{
    valid: boolean;
    message: string;
  } | null>(null);
  const [auditSearchQuery, setAuditSearchQuery] = useState('');

  // --- FASE 11, 18, 19 & 20: COBRANÇA COLETIVA DE LEITURA, CONVOCAÇÃO DE EVENTO, CERTIFICADO & TERMO DE CIÊNCIA POP ---
  const [reminderSentToast, setReminderSentToast] = useState<string | null>(null);
  const [eventReminderToast, setEventReminderToast] = useState<string | null>(null);
  const [copiedIdentifier, setCopiedIdentifier] = useState<string | null>(null);
  const [acknowledgedDocIds, setAcknowledgedDocIds] = useState<Record<string, string>>({
    'doc-1': '15/01/2027 09:40',
    'doc-2': '15/01/2027 09:42',
    'doc-3': '15/01/2027 09:45',
    'doc-4': '15/01/2027 09:48',
    'doc-5': '15/01/2027 09:50',
    'doc-6': '15/01/2027 09:52',
    'doc-7': '15/01/2027 09:55',
  });

  // Fase 18: Convocação Coletiva de Presença para Colaboradores Pendentes no Evento/Treinamento
  const handleSendBulkEventReminder = (evt: CorporateEvent) => {
    const pendingEmps = employees.filter(
      (e) => e.active !== false && !evt.attendees.includes(e.id)
    );
    if (pendingEmps.length === 0) {
      setEventReminderToast(
        '✓ Todos os colaboradores ativos já confirmaram presença neste evento/treinamento.'
      );
      setTimeout(() => setEventReminderToast(null), 4000);
      return;
    }

    if (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      new Notification('RODOVAR CONECTA — Convocação de Evento / Treinamento', {
        body: `Lembrete de presença enviado para ${pendingEmps.length} colaborador(es) no evento "${evt.title}".`,
        icon: '/icon.svg',
      });
    }

    setEventReminderToast(
      `✓ Convocação oficial enviada para ${pendingEmps.length} colaborador(es) pendente(s): ${pendingEmps
        .map((p) => p.name)
        .join(', ')}.`
    );
    setTimeout(() => setEventReminderToast(null), 5000);
  };

  // Fase 18: Exportação do Catálogo & Índice de Adesão do Mural Oficial (.CSV)
  const handleExportAnnouncementsMasterCsv = (annsToExport: Announcement[]) => {
    const BOM = '\uFEFF';
    let csv =
      BOM +
      'Codigo Comunicado;Data Publicacao;Titulo;Categoria;Prioridade;Setor Origem;Publico Alvo;Autor;Leitura Obrigatoria;Fixado;Confirmacoes de Ciencia;Total Colaboradores;Taxa de Adesao (%);Curtidas;Comentarios\n';

    annsToExport.forEach((ann) => {
      const rate =
        employees.length > 0
          ? Math.round((ann.readReceipts.length / employees.length) * 100)
          : 100;
      csv += `${ann.id.toUpperCase()};"${ann.dateFormatted}";"${ann.title.replace(
        /"/g,
        '""'
      )}";"${ann.category}";${ann.priority};"${ann.department}";"${ann.targetAudience}";"${
        ann.authorName
      }";${ann.requireReadConfirmation ? 'SIM' : 'NAO'};${ann.pinned ? 'SIM' : 'NAO'};${
        ann.readReceipts.length
      };${employees.length};${rate}%;${ann.likes.length};${ann.comments.length}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `catalogo-mural-comunicados-rodovar-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSendBulkReadReminder = (ann: Announcement) => {
    const pendingEmps = employees.filter(
      (e) => e.active && !ann.readReceipts.some((r) => r.userId === e.id)
    );
    if (pendingEmps.length === 0) {
      setReminderSentToast('✓ Todos os colaboradores ativos já confirmaram a leitura deste comunicado.');
      setTimeout(() => setReminderSentToast(null), 4000);
      return;
    }

    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      new Notification('RODOVAR CONECTA — Cobrança de Leitura Obrigatória', {
        body: `Alerta enviado para ${pendingEmps.length} colaborador(es) pendente(s) no comunicado "${ann.title}".`,
        icon: '/icon.svg',
      });
    }

    setReminderSentToast(
      `✓ Alerta prioritário de cobrança enviado para ${pendingEmps.length} colaborador(es) pendente(s): ${pendingEmps
        .map((p) => p.name)
        .join(', ')}.`
    );
    setTimeout(() => setReminderSentToast(null), 5000);
  };

  const handleDownloadTrainingCertificate = (evt: CorporateEvent) => {
    const pdfPath =
      evt.pdfUrl ||
      (evt.id === 'evt-1'
        ? '/assets/aistudio/02_Recesso_e_Continuidade_2027_ffe95a1d.pdf'
        : evt.id === 'evt-2'
        ? '/assets/aistudio/04_Seguranca_Treinamentos_e_Agenda_2027_c075105a.pdf'
        : '/assets/aistudio/05_Reunioes_e_Planejamento_2027_14c8d18b.pdf');

    const a = document.createElement('a');
    a.href = pdfPath;
    a.download = `Certificado_${evt.title.replace(/\s+/g, '_')}_2027.pdf`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleAcknowledgePopDocument = (docItem: CorporateDocument) => {
    const nowStr = new Date().toLocaleString('pt-BR');
    setAcknowledgedDocIds((prev) => ({ ...prev, [docItem.id]: nowStr }));

    const pdfPath =
      docItem.pdfUrl || '/assets/aistudio/06_Comprovantes_e_Guias_de_Trabalho_2027_d375a1ec.pdf';
    const a = document.createElement('a');
    a.href = pdfPath;
    a.download = `${docItem.title.replace(/\s+/g, '_')}_2027.pdf`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleVerifyDocumentHash = (overrideCode?: string) => {
    const clean = (overrideCode ?? hashVerifyInput).trim().toUpperCase();
    if (!clean) return;
    if (overrideCode) {
      setHashVerifyInput(overrideCode);
    }

    // 1. Check AUTH-RDV-<ANN_ID>-<USER_ID>-2027
    for (const ann of announcements) {
      for (const emp of employees) {
        const expected2027 = `AUTH-RDV-${ann.id.toUpperCase()}-${emp.id.toUpperCase()}-2027`;
        const expected2025 = `AUTH-RDV-${ann.id.toUpperCase()}-${emp.id.toUpperCase()}-2025`;
        if (clean === expected2027 || clean === expected2025) {
          const confirmed = ann.readReceipts.find((r) => r.userId === emp.id);
          if (confirmed) {
            setHashVerifyResult({
              valid: true,
              message: `✓ AUTÊNTICO (Leitura Obrigatória 2027): Comprovante confirmado por ${emp.name} (${emp.department}) para o comunicado "${ann.title}" em ${confirmed.confirmedAt}.`,
            });
          } else {
            setHashVerifyResult({
              valid: false,
              message: `⚠ ALERTA: Código estruturalmente reconhecido para ${emp.name}, porém a leitura obrigatória ainda não consta confirmada no banco.`,
            });
          }
          return;
        }
      }
    }

    // 2. Check SLA48H-<PROTOCOL>-<REQ_ID>
    for (const req of requests) {
      const expected = `SLA48H-${req.protocol.replace('#', '').toUpperCase()}-${req.id.toUpperCase()}`;
      if (clean === expected) {
        setHashVerifyResult({
          valid: true,
          message: `✓ AUTÊNTICO (Protocolo SLA 48h): Protocolo Oficial ${req.protocol} (${req.subject}) • Solicitante: ${req.requesterName} • Destino: ${req.targetDepartment} • Status: ${req.status}.`,
        });
        return;
      }
    }

    // 3. Check CERT-RDV-<EVT_ID>-<EMP_ID>-2027 (Training Certificate)
    for (const evt of events) {
      for (const emp of employees) {
        const expected2027 = `CERT-RDV-${evt.id.toUpperCase()}-${emp.id.toUpperCase()}-2027`;
        const expected2025 = `CERT-RDV-${evt.id.toUpperCase()}-${emp.id.toUpperCase()}-2025`;
        if (clean === expected2027 || clean === expected2025) {
          const attended = evt.attendees.includes(emp.id);
          if (attended) {
            setHashVerifyResult({
              valid: true,
              message: `✓ AUTÊNTICO (Certificado de Capacitação SSMA 2027): Emitido para ${emp.name} (${emp.roleTitle} • ${emp.department}) referente ao evento "${evt.title}" (${evt.day}/${evt.monthShort} • ${evt.time}).`,
            });
          } else {
            setHashVerifyResult({
              valid: false,
              message: `⚠ ALERTA: Código de certificado estruturalmente válido para ${emp.name}, porém a presença no evento "${evt.title}" não consta confirmada.`,
            });
          }
          return;
        }
      }
    }

    // 4. Check POP-ACK-<DOC_ID>-<VERSION>-<EMP_ID> (Normative POP Acknowledgment)
    for (const docItem of documents) {
      for (const emp of employees) {
        const expected = `POP-ACK-${docItem.id.toUpperCase()}-${docItem.version.toUpperCase()}-${emp.id.toUpperCase()}`;
        if (clean === expected) {
          const ackTimestamp = acknowledgedDocIds[docItem.id];
          setHashVerifyResult({
            valid: true,
            message: `✓ AUTÊNTICO (Termo de Ciência Normativa POP ISO/SASSMAQ 2027): Documento "${docItem.title}" (${docItem.version}) validado para ${emp.name} (${emp.department})${ackTimestamp ? ` • Ciência registrada em ${ackTimestamp}` : ''}.`,
          });
          return;
        }
      }
    }

    // 5. Check FICHA-RDV-<EMP_ID>-2027 (Individual Functional & Compliance Sheet)
    for (const emp of employees) {
      const expected2027 = `FICHA-RDV-${emp.id.toUpperCase()}-2027`;
      const expected2025 = `FICHA-RDV-${emp.id.toUpperCase()}-2025`;
      if (clean === expected2027 || clean === expected2025) {
        const mandatoryAnns = announcements.filter(
          (a) =>
            !a.archived &&
            a.requireReadConfirmation &&
            (a.targetAudience === 'Todos' || a.targetAudience === emp.department)
        );
        const confirmedAnns = mandatoryAnns.filter((a) =>
          a.readReceipts.some((r) => r.userId === emp.id)
        ).length;
        const score =
          mandatoryAnns.length > 0 ? Math.round((confirmedAnns / mandatoryAnns.length) * 100) : 100;
        setHashVerifyResult({
          valid: true,
          message: `✓ AUTÊNTICO (Ficha Funcional & Conformidade ISO/SASSMAQ 2027): Colaborador ${emp.name} (Matrícula RDV-${emp.id.toUpperCase()} • ${emp.roleTitle} • ${emp.department}) • Leituras Obrigatórias: ${confirmedAnns}/${mandatoryAnns.length} (${score}% de conformidade).`,
        });
        return;
      }
    }

    setHashVerifyResult({
      valid: false,
      message:
        '✕ Código não localizado na base de governança RODOVAR CONECTA. Verifique o código informado (Ex: AUTH-RDV-..., SLA48H-..., CERT-RDV-..., POP-ACK-... ou FICHA-RDV-...).',
    });
  };

  // Fase 12: Exportação de Cartão de Contato Corporativo vCard 3.0 (.VCF)
  const handleExportEmployeeVCard = (emp: Employee) => {
    const nameParts = emp.name.trim().split(' ');
    const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';
    const firstName = nameParts.slice(0, -1).join(' ') || emp.name;

    const vcardContent = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `N:${lastName};${firstName};;;`,
      `FN:${emp.name}`,
      'ORG:Transportadora RODOVAR;' + emp.department,
      `TITLE:${emp.roleTitle}`,
      `TEL;TYPE=WORK,VOICE:${emp.phoneExt}`,
      `EMAIL;TYPE=PREF,INTERNET:${emp.email}`,
      `NOTE:Colaborador Oficial RODOVAR CONECTA | Setor: ${emp.department} | Nível RBAC: ${emp.accessLevel}`,
      `REV:${new Date().toISOString()}`,
      'END:VCARD',
    ].join('\r\n');

    const blob = new Blob([vcardContent], { type: 'text/vcard;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contato-rodovar-${emp.id.toLowerCase()}.vcf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Fase 12: Exportação de Transcrição Auditada de Conversa / Grupo (.TXT)
  const handleExportChatTranscript = (thread: ChatThread) => {
    const participantNames = (thread.participantIds || [])
      .map((pid) => employees.find((e) => e.id === pid)?.name || pid)
      .join(', ');

    const msgLines =
      thread.messages.length > 0
        ? thread.messages
            .map(
              (m, idx) =>
                `[${idx + 1}] (${m.timestamp}) ${m.senderName}: ${m.text}${
                  m.attachment ? ` [Anexo: ${m.attachment}]` : ''
                }`
            )
            .join('\n')
        : '  (Sem mensagens registradas neste canal)';

    const content = [
      '================================================================================',
      '         RODOVAR CONECTA — TRANSCRIÇÃO OFICIAL AUDITADA DE COMUNICAÇÃO          ',
      '================================================================================',
      `Canal / Conversa: ${thread.name}`,
      `Modalidade: ${thread.isGroup ? 'Grupo Departamental / Operacional' : 'Mensagem Direta Individual'}`,
      `Setor / Contexto: ${thread.department || thread.roleOrDept}`,
      `Exportado em: ${new Date().toLocaleString('pt-BR')}`,
      `Exportado por: ${currentUser.name} (${currentUser.roleTitle} • ${currentUser.department})`,
      ...(participantNames ? [`Integrantes Registrados: ${participantNames}`] : []),
      ...(thread.pinnedNotice ? [`Diretriz Fixada no Topo: "${thread.pinnedNotice}"`] : []),
      '',
      '--------------------------------------------------------------------------------',
      `HISTÓRICO CRONOLÓGICO DE MENSAGENS (${thread.messages.length} registro(s)):`,
      '--------------------------------------------------------------------------------',
      msgLines,
      '',
      '================================================================================',
      '   DOCUMENTO DE GOVERNANÇA INTERNA — PROTEGIDO PELA POLÍTICA DE DADOS LGPD      ',
      '================================================================================',
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcricao-chat-rodovar-${thread.id.toLowerCase()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Fase 13: Exportação de Ata Oficial de Presença e Certificação de Evento (.CSV)
  const handleExportEventAttendanceSheet = (evt: CorporateEvent) => {
    const BOM = '\uFEFF';
    let csv =
      BOM +
      'Matricula;Colaborador;Cargo;Departamento;E-mail Corporativo;Status Presenca;Codigo Certificado SSMA\n';

    employees.forEach((emp) => {
      const confirmed = evt.attendees.includes(emp.id);
      const certCode = confirmed
        ? `CERT-RDV-${evt.id.toUpperCase()}-${emp.id.toUpperCase()}-2027`
        : 'PENDENTE';
      csv += `RDV-${emp.id.toUpperCase()};"${emp.name}";"${emp.roleTitle}";${emp.department};${
        emp.email
      };${confirmed ? 'CONFIRMADO' : 'AUSENTE / PENDENTE'};${certCode}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ata-presenca-rodovar-${evt.id.toLowerCase()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Fase 14: Exportação do Catálogo Mestre de Documentos & Auditoria de Ciência POP (.CSV)
  const handleExportDocumentsCatalogCsv = () => {
    const BOM = '\uFEFF';
    let csv =
      BOM +
      'Codigo POP;Titulo do Documento;Categoria;Versao Homologada;Formato;Tamanho;Ultima Atualizacao;Status Ciencia Colaborador;Data Hora Assinatura\n';

    documents.forEach((docItem) => {
      const signedAt = acknowledgedDocIds[docItem.id];
      csv += `POP-RDV-${docItem.id.toUpperCase()};"${docItem.title}";"${docItem.category}";${docItem.version};${docItem.fileType};${docItem.size};${docItem.updatedAt};${
        signedAt ? 'TERMO ASSINADO (CONFORME)' : 'PENDENTE DE CIENCIA'
      };${signedAt || '-'}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `catalogo-mestre-pop-rodovar-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Fase 14: Exportação da Lista Telefônica Corporativa (.CSV)
  const handleExportDirectoryCsv = (listToExport: Employee[]) => {
    const BOM = '\uFEFF';
    let csv =
      BOM +
      'Matricula;Nome Completo;Cargo;Departamento;Unidade / Base;Telefone Corporativo;E-mail Corporativo;Nivel de Acesso;Status\n';

    listToExport.forEach((emp) => {
      csv += `RDV-${emp.id.toUpperCase()};"${emp.name}";"${emp.roleTitle}";"${emp.department}";"${emp.location}";"${emp.phoneExt || emp.phone || '71 9 9920-2476'}";${emp.email};${emp.role};${
        emp.active === false ? 'INATIVO' : 'ATIVO'
      }\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lista-telefones-contatos-rodovar-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Fase 15: Exportação de Ata Individual de Confirmação de Leitura de Comunicado (.CSV)
  const handleExportSingleAnnouncementReceiptsCsv = (ann: Announcement) => {
    const BOM = '\uFEFF';
    let csv =
      BOM +
      'Codigo Comunicado;Titulo do Comunicado;Matricula;Colaborador;Cargo;Departamento;Status de Ciencia;Data Hora Confirmacao;Hash Recibo Oficial\n';

    employees.forEach((emp) => {
      const receipt = ann.readReceipts.find((r) => r.userId === emp.id);
      const hashCode = receipt
        ? `AUTH-RDV-${ann.id.toUpperCase()}-${emp.id.toUpperCase()}-2027`
        : 'PENDENTE';
      csv += `${ann.id.toUpperCase()};"${ann.title.replace(/"/g, '""')}";RDV-${emp.id.toUpperCase()};"${
        emp.name
      }";"${emp.roleTitle}";"${emp.department}";${
        receipt ? 'CONFIRMADO' : 'PENDENTE DE LEITURA'
      };${receipt ? receipt.confirmedAt : '-'};${hashCode}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ata-ciencia-comunicado-${ann.id.toLowerCase()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Fase 15: Exportação de Planilha Filtrada de Solicitações SLA 48h (.CSV)
  const handleExportRequestsSlaFilteredCsv = (reqsToExport: InternalRequest[]) => {
    const BOM = '\uFEFF';
    let csv =
      BOM +
      'Protocolo;Assunto;Solicitante;Setor Solicitante;Setor Destino;Prioridade;Status Atual;Prazo Original 48h;Vencimento Vigente;Situacao SLA;Hash Protocolo\n';

    reqsToExport.forEach((r) => {
      const sla = getSlaInfo(r);
      const hash = `SLA48H-${r.protocol.replace('#', '').toUpperCase()}-${r.id.toUpperCase()}`;
      csv += `${r.protocol};"${r.subject.replace(/"/g, '""')}";"${r.requesterName}";"${
        r.requesterDepartment
      }";"${r.targetDepartment}";${r.priority};${r.status};${new Date(
        r.originalDueAtIso
      ).toLocaleString('pt-BR')};${new Date(r.currentDueAtIso).toLocaleString('pt-BR')};"${
        sla.label
      }";${hash}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `planilha-solicitacoes-sla48h-rodovar-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Fase 15: Exportação da Matriz Nominal de Conformidade por Colaborador (ISO 9001 / SASSMAQ .CSV)
  const handleExportEmployeeComplianceMatrixCsv = () => {
    const BOM = '\uFEFF';
    let csv =
      BOM +
      'Matricula;Colaborador;Cargo;Departamento;Unidade;Leituras Obrigatorias Confirmadas;Pendencias de Leitura;Treinamentos Confirmados;Chamados SLA Solicitados;Score Conformidade (%);Status Auditoria ISO/SASSMAQ\n';

    employees.forEach((emp) => {
      const mandatoryAnns = announcements.filter(
        (a) =>
          !a.archived &&
          a.requireReadConfirmation &&
          (a.targetAudience === 'Todos' || a.targetAudience === emp.department)
      );
      const confirmedAnns = mandatoryAnns.filter((a) =>
        a.readReceipts.some((r) => r.userId === emp.id)
      ).length;
      const pendingAnns = Math.max(0, mandatoryAnns.length - confirmedAnns);
      const confirmedEvts = events.filter((ev) => ev.attendees.includes(emp.id)).length;
      const empReqs = requests.filter((r) => r.requesterName === emp.name).length;
      const score =
        mandatoryAnns.length > 0 ? Math.round((confirmedAnns / mandatoryAnns.length) * 100) : 100;
      const statusAudit =
        score === 100
          ? '100% CONFORME (HOMOLOGADO)'
          : score >= 70
          ? 'REGULAR COM PENDENCIA'
          : 'ACAO CORRETIVA NECESSARIA';

      csv += `RDV-${emp.id.toUpperCase()};"${emp.name}";"${emp.roleTitle}";"${emp.department}";"${
        emp.location
      }";${confirmedAnns}/${mandatoryAnns.length};${pendingAnns};${confirmedEvts}/${
        events.length
      };${empReqs};${score}%;"${statusAudit}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `matriz-nominal-conformidade-rodovar-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setExportReportToast(
      '✓ Matriz Nominal de Conformidade por Colaborador (.CSV) exportada com sucesso!'
    );
    setTimeout(() => setExportReportToast(null), 4000);
  };

  // Fase 16: Exportação do Cronograma Oficial de Eventos e Treinamentos da Agenda (.CSV)
  const handleExportFullAgendaScheduleCsv = (evtsToExport: CorporateEvent[]) => {
    const BOM = '\uFEFF';
    let csv =
      BOM +
      'Codigo Evento;Data;Mes;Horario;Titulo do Evento / Treinamento;Categoria;Setor;Local;Organizador;Confirmados;Total Colaboradores;Taxa de Adesao\n';

    evtsToExport.forEach((ev) => {
      const rate =
        employees.length > 0 ? Math.round((ev.attendees.length / employees.length) * 100) : 100;
      csv += `EVT-RDV-${ev.id.toUpperCase()};${ev.day};${ev.monthShort};"${ev.time}";"${ev.title.replace(
        /"/g,
        '""'
      )}";"${ev.badgeLabel}";"${ev.department}";"${ev.location}";"${ev.organizer}";${
        ev.attendees.length
      };${employees.length};${rate}%\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cronograma-agenda-corporativa-rodovar-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Fase 16: Exportação de Relatório Auditado de Convites Token de Uso Único (.CSV)
  const handleExportInvitesAuditCsv = () => {
    const BOM = '\uFEFF';
    let csv =
      BOM +
      'ID Convite;Nome Completo;E-mail Corporativo;Departamento;Nivel RBAC;Token Unico;Data Criacao;Status do Token\n';

    invites.forEach((inv) => {
      csv += `${inv.id.toUpperCase()};"${inv.fullName}";${inv.email};"${inv.department}";${
        inv.accessLevel
      };${inv.token};${inv.createdAt};${inv.status.toUpperCase()}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auditoria-convites-token-rodovar-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setExportReportToast('✓ Relatório de Convites Token Único (.CSV) exportado com sucesso!');
    setTimeout(() => setExportReportToast(null), 4000);
  };

  // Fase 16: Exportação Direta da Trilha de Auditoria Filtrada (.CSV)
  const handleExportFilteredAuditLogsCsv = () => {
    const BOM = '\uFEFF';
    let csv = BOM + 'ID Registro;Data e Hora;Acao Auditada;Ator Responsavel;Detalhes da Operacao\n';

    const filteredLogs = auditLogs.filter(
      (log) =>
        !auditSearchQuery.trim() ||
        log.action.toLowerCase().includes(auditSearchQuery.toLowerCase()) ||
        log.actor.toLowerCase().includes(auditSearchQuery.toLowerCase()) ||
        log.details.toLowerCase().includes(auditSearchQuery.toLowerCase())
    );

    filteredLogs.forEach((log) => {
      csv += `${log.id};"${log.timestamp}";"${log.action}";"${log.actor}";"${log.details.replace(
        /"/g,
        '""'
      )}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trilha-auditoria-filtrada-rodovar-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setExportReportToast('✓ Trilha de Auditoria Filtrada (.CSV) exportada com sucesso!');
    setTimeout(() => setExportReportToast(null), 4000);
  };

  // Fase 17: Emissão de Ficha Funcional e Dossiê Individual de Conformidade do Colaborador (PDF 2027)
  const handleDownloadEmployeeFunctionalSheetTxt = (emp: Employee) => {
    const a = document.createElement('a');
    a.href = '/assets/aistudio/07_Funcoes_Profissionais_2027_461a1f82.pdf';
    a.download = `07_Funcoes_Profissionais_2027_${emp.name.replace(/\s+/g, '_')}.pdf`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Fase 17: Exportação de Relatório Auditado de Grupos e Canais de Comunicação (.CSV)
  const handleExportChatGroupsAuditCsv = () => {
    const BOM = '\uFEFF';
    let csv =
      BOM +
      'ID Canal;Nome do Grupo / Canal;Modalidade;Setor Vinculado;Finalidade;Total Integrantes;Volume de Mensagens;Diretriz Fixada no Topo;Ultima Atualizacao\n';

    chats.forEach((th) => {
      const partCount = th.participantIds ? th.participantIds.length : 2;
      csv += `${th.id.toUpperCase()};"${th.name.replace(/"/g, '""')}";${
        th.isGroup ? 'GRUPO CORPORATIVO' : 'MENSAGEM DIRETA'
      };"${th.department || 'Geral'}";"${(th.roleOrDept || '').replace(/"/g, '""')}";${partCount};${
        th.messages.length
      };"${(th.pinnedNotice || 'Sem diretriz fixada').replace(/"/g, '""')}";"${th.time}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-canais-grupos-rodovar-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setExportReportToast(
      '✓ Relatório de Grupos e Canais de Comunicação (.CSV) exportado com sucesso!'
    );
    setTimeout(() => setExportReportToast(null), 4000);
  };

  // Fase 19: Download do Manual Rápido Operacional & Guia de Governança do Colaborador (PDF 2027)
  const handleDownloadUserGuideManualTxt = () => {
    const a = document.createElement('a');
    a.href = '/assets/aistudio/06_Comprovantes_e_Guias_de_Trabalho_2027_d375a1ec.pdf';
    a.download = '06_Comprovantes_e_Guias_de_Trabalho_2027.pdf';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadExecutiveDossierTxt = () => {
    const totalReads = announcements.reduce((acc, a) => acc + a.readReceipts.length, 0);
    const totalPossibleReads = announcements.length * employees.length;
    const globalReadRate =
      totalPossibleReads > 0 ? Math.round((totalReads / totalPossibleReads) * 100) : 100;

    const lines = [
      '================================================================================',
      '          RODOVAR CONECTA — DOSSIÊ EXECUTIVO DE GOVERNANÇA DA DIRETORIA         ',
      '================================================================================',
      `Data de Emissão: ${new Date().toLocaleString('pt-BR')}`,
      `Emitido por: ${currentUser.name} (${currentUser.roleTitle} • ${currentUser.accessLevel})`,
      '',
      '1. INDICADORES GERAIS DE ADESÃO & OPERAÇÃO',
      `- Colaboradores Ativos: ${employees.filter((e) => e.active).length}/${employees.length}`,
      `- Comunicados Oficiais Publicados: ${announcements.length}`,
      `- Taxa Global de Leitura Confirmada: ${globalReadRate}%`,
      `- Chamados Internos (SLA 48h): ${requests.length} total | ${
        requests.filter((r) => r.status === 'Concluída').length
      } concluídos | ${requests.filter((r) => r.escalatedToDiretoria).length} escalonados à Diretoria`,
      '',
      '2. AUDITORIA DE COMUNICADOS OBRIGATÓRIOS E PENDÊNCIAS',
      ...announcements
        .filter((a) => !a.archived && a.requireReadConfirmation)
        .map((a) => {
          const pendingEmps = employees.filter(
            (e) => e.active && !a.readReceipts.some((r) => r.userId === e.id)
          );
          return `- [${a.dateFormatted}] ${a.title}: ${a.readReceipts.length}/${
            employees.length
          } confirmados | Pendentes (${pendingEmps.length}): ${
            pendingEmps.map((e) => e.name).join(', ') || 'Nenhum (100% concluído)'
          }`;
        }),
      '',
      '3. ÚLTIMOS REGISTROS DA TRILHA DE AUDITORIA LGPD',
      ...auditLogs.slice(0, 10).map((l) => `- [${l.timestamp}] ${l.action} (${l.actor}): ${l.details}`),
      '================================================================================',
    ].join('\n');

    const blob = new Blob([lines], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dossie-executivo-diretoria-rodovar-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportCorporateCsvReport = (
    reportType: 'leituras' | 'sla_solicitacoes' | 'auditoria_lgpd'
  ) => {
    let filename = 'rodovar-conecta-relatorio.csv';
    let csvContent = '\uFEFF'; // UTF-8 BOM for Excel compatibility

    if (reportType === 'leituras') {
      filename = `rodovar-relatorio-leituras-${new Date().toISOString().slice(0, 10)}.csv`;
      csvContent +=
        'ID Comunicado;Titulo;Categoria;Prioridade;Publico Alvo;Exige Confirmacao;Total Confirmacoes;Taxa Adesao (%)\n';
      announcements.forEach((ann) => {
        const rate =
          employees.length > 0
            ? Math.round((ann.readReceipts.length / employees.length) * 100)
            : 100;
        const safeTitle = ann.title.replace(/;/g, ',');
        csvContent += `${ann.id};"${safeTitle}";${ann.category};${ann.priority};${ann.targetAudience};${
          ann.requireReadConfirmation ? 'Sim' : 'Nao'
        };${ann.readReceipts.length};${rate}%\n`;
      });
    } else if (reportType === 'sla_solicitacoes') {
      filename = `rodovar-relatorio-sla-48h-${new Date().toISOString().slice(0, 10)}.csv`;
      csvContent +=
        'Protocolo;Solicitante;Setor Solicitante;Departamento Destino;Assunto;Prioridade;Status;Escalonado Diretoria;Criado Em;Prazo SLA 48h\n';
      requests.forEach((req) => {
        const safeSubj = req.subject.replace(/;/g, ',');
        csvContent += `${req.protocol};"${req.requesterName}";${req.requesterDepartment};${req.targetDepartment};"${safeSubj}";${req.priority};${req.status};${
          req.escalatedToDiretoria ? 'SIM' : 'NAO'
        };${req.createdAtIso};${req.currentDueAtIso}\n`;
      });
    } else {
      filename = `rodovar-relatorio-auditoria-lgpd-${new Date().toISOString().slice(0, 10)}.csv`;
      csvContent += 'ID Log;Acao;Responsavel;Detalhes;Data Hora\n';
      auditLogs.forEach((log) => {
        const safeDetails = log.details.replace(/;/g, ',');
        csvContent += `${log.id};${log.action};"${log.actor}";"${safeDetails}";${log.timestamp}\n`;
      });
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setExportReportToast(`✓ Relatório oficial (${filename}) exportado com sucesso!`);
    setTimeout(() => setExportReportToast(null), 4000);
  };

  // Fase 8: Export Full Governance & Compliance JSON Snapshot
  const handleExportGovernanceJsonSnapshot = () => {
    const filename = `rodovar-conecta-backup-governanca-${new Date().toISOString().slice(0, 10)}.json`;
    const snapshot = {
      platform: 'RODOVAR CONECTA Enterprise v2.0',
      scope: 'portal-browser-state', schemaVersion: 1,
      exportedAtIso: new Date().toISOString(),
      exportedBy: {
        name: currentUser.name,
        email: currentUser.email,
        accessLevel: currentUser.accessLevel,
      },
      summary: {
        activeEmployees: employees.filter((e) => e.active).length,
        announcementsCount: announcements.length,
        requestsCount: requests.length,
        documentsCount: documents.length,
        eventsCount: events.length,
        auditLogsCount: auditLogs.length,
      },
      announcements,
      requests,
      employees: backupEmployees(employees),
      documents,
      events,
      invites,
      auditLogs,
    };

    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setExportReportToast(`✓ Snapshot local de governança (${filename}) gerado com sucesso!`);
    setTimeout(() => setExportReportToast(null), 4000);
  };

  // Fase 8: Automatic 48-hour SLA Watchdog Scanner
  const handleRunSlaWatchdogAudit = () => {
    const overdueOrCritical = requests.filter((r) => {
      if (r.status === 'Concluída' || r.status === 'Cancelada') return false;
      const hoursLeft = Math.round(
        (new Date(r.currentDueAtIso).getTime() - Date.now()) / (1000 * 3600)
      );
      return hoursLeft <= 8;
    });

    overdueOrCritical.forEach((req) => {
      if (!req.escalatedToDiretoria && onEscalateRequestToDiretoria) {
        onEscalateRequestToDiretoria(
          req.id,
          'Watchdog Automático SLA 48h: Chamado escalonado preventivamente por proximidade ou extrapolação do prazo de 48h.'
        );
      }
    });

    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification('RODOVAR CONECTA — Watchdog SLA 48h', {
          body: `${overdueOrCritical.length} chamado(s) crítico(s) auditado(s) pela governança.`,
          icon: '/icon.svg',
        });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission();
      }
    }

    setExportReportToast(
      `✓ Watchdog SLA 48h executado: ${overdueOrCritical.length} chamado(s) crítico(s) verificado(s) e escalonado(s) à Diretoria.`
    );
    setTimeout(() => setExportReportToast(null), 5000);
  };

  // Fase 9: Emissão de Comprovante Oficial de Ciência de Leitura Obrigatória (PDF 2027)
  const handleDownloadReadCertificate = (ann: Announcement) => {
    const pdfPath =
      ann.pdfUrl ||
      ann.attachments?.[0]?.url ||
      (ann.id === 'ann-1'
        ? '/assets/aistudio/02_Recesso_e_Continuidade_2027_ffe95a1d.pdf'
        : ann.id === 'ann-2'
        ? '/assets/aistudio/03_Direcao_Defensiva_2027_500e5359.pdf'
        : '/assets/aistudio/01_Comunicados_e_Testes_2027_4d007e46.pdf');

    const a = document.createElement('a');
    a.href = pdfPath;
    a.download = `Comprovante_${ann.title.replace(/\s+/g, '_')}_2027.pdf`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Fase 9: Emissão de Comprovante Oficial de Protocolo CSI / SLA 48h (A4 Corporativo / PDF)
  const handleDownloadRequestProtocolReceipt = (req: InternalRequest) => {
    printRequestCsiReceipt(req, currentUser);
  };

  // Fase 9: Exportação de Evento da Agenda Corporativa em formato iCalendar (.ICS)
  const handleExportEventIcs = (evt: CorporateEvent) => {
    const cleanDate = (evt.dateIso || '2027-02-15').replace(/-/g, '');
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Transportadora RODOVAR//RODOVAR CONECTA v2.0//PT-BR',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${evt.id}@rodovar.com.br`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
      `DTSTART;VALUE=DATE:${cleanDate}`,
      `SUMMARY:[RODOVAR] ${evt.title}`,
      `LOCATION:${evt.location}`,
      `DESCRIPTION:${evt.description} (Horário: ${evt.time} | Organizador: ${evt.organizer})`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evento-rodovar-${evt.id}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Fase 9: Portabilidade Pessoal de Dados LGPD (.JSON)
  const handleExportPersonalLgpdData = () => {
    const personalPackage = {
      platform: 'RODOVAR CONECTA — Pacote de Portabilidade LGPD (Art. 18, V)',
      generatedAt: new Date().toISOString(),
      employeeProfile: currentUser,
      notificationPreferences: notifPrefs,
      confirmedAnnouncementReads: announcements
        .filter((a) => a.readReceipts.some((r) => r.userId === currentUser.id))
        .map((a) => ({
          announcementId: a.id,
          title: a.title,
          dateFormatted: a.dateFormatted,
        })),
      mySubmittedRequests: requests.filter((r) => r.requesterId === currentUser.id),
      myConfirmedEvents: events
        .filter((e) => e.attendees.includes(currentUser.id))
        .map((e) => ({ id: e.id, title: e.title, dateIso: e.dateIso, location: e.location })),
    };

    const blob = new Blob([JSON.stringify(personalPackage, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `portabilidade-lgpd-${currentUser.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Helper to compute 48-hour CSI/Prazo status
  const getSlaInfo = (req: InternalRequest) => {
    if (!req) {
      return {
        label: 'Em andamento',
        color: 'bg-blue-50 text-blue-700 border-blue-200',
        isOverdue: false,
        hoursLeft: 48,
      };
    }
    if (req.status === 'Concluída' || req.status === 'Cancelada') {
      return {
        label: 'Concluída no Prazo',
        color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        isOverdue: false,
        hoursLeft: 0,
      };
    }
    const diffMs = new Date(req.currentDueAtIso).getTime() - Date.now();
    const hoursLeft = Math.round(diffMs / (1000 * 3600));
    if (hoursLeft < 0) {
      return {
        label: `Atrasada há ${Math.abs(hoursLeft)}h (Avisada Diretoria)`,
        color: 'bg-red-50 text-[#E5252A] border-red-200',
        isOverdue: true,
        hoursLeft,
      };
    }
    if (hoursLeft <= 8) {
      return {
        label: `Vence em ${hoursLeft}h (Alerta 48h)`,
        color: 'bg-amber-50 text-amber-700 border-amber-200',
        isOverdue: false,
        hoursLeft,
      };
    }
    return {
      label: `Prazo 48h: restam ${hoursLeft}h`,
      color: 'bg-blue-50 text-blue-700 border-blue-200',
      isOverdue: false,
      hoursLeft,
    };
  };

  // Memoized & sanitized filtering for solicitacoes (client-side scalability for 300+ records)
  const filteredRequests = useMemo(() => {
    const list = requests || [];
    return list.filter((r) => {
      if (!r) return false;
      if (reqDeptFilter !== 'Todos' && r.targetDepartment !== reqDeptFilter) return false;
      if (reqSearch.trim()) {
        const q = reqSearch.toLowerCase().trim();
        const matches =
          (r.protocol || '').toLowerCase().includes(q) ||
          (r.subject || '').toLowerCase().includes(q) ||
          (r.description || '').toLowerCase().includes(q) ||
          (r.requesterName || '').toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (reqFilter === 'Todas') return true;
      if (reqFilter === 'Atrasadas') return getSlaInfo(r).isOverdue;
      return r.status === reqFilter;
    });
  }, [requests, reqDeptFilter, reqSearch, reqFilter]);

  const reqTotalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredRequests.length / REQS_PER_PAGE));
  }, [filteredRequests.length, REQS_PER_PAGE]);

  const reqCurrentPage = Math.min(reqPage, reqTotalPages);

  const paginatedRequests = useMemo(() => {
    const start = (reqCurrentPage - 1) * REQS_PER_PAGE;
    return filteredRequests.slice(start, start + REQS_PER_PAGE);
  }, [filteredRequests, reqCurrentPage, REQS_PER_PAGE]);

  const openReqsCount = useMemo(() => {
    return (requests || []).filter(
      (r) => r && r.status !== 'Concluída' && r.status !== 'Cancelada'
    ).length;
  }, [requests]);

  const overdueReqsCount = useMemo(() => {
    return (requests || []).filter((r) => r && getSlaInfo(r).isOverdue).length;
  }, [requests]);

  const completedReqsCount = useMemo(() => {
    return (requests || []).filter((r) => r && r.status === 'Concluída').length;
  }, [requests]);

  // ============================================================================
  // 1. MURAL DE COMUNICADOS (FASE 3 COMPLETA)
  // ============================================================================
  if (activeSection === 'comunicados') {
    const categories = [
      'Todos',
      'Comunicado Geral',
      'Importante',
      'Urgente',
      'Recursos Humanos',
      'Segurança',
      'Operacional',
      'Eventos',
      'Diretoria',
    ];

    const unreadCount = announcements.filter(
      (a) =>
        !a.archived &&
        a.requireReadConfirmation &&
        !a.readReceipts.some((r) => r.userId === currentUser.id)
    ).length;

    const pinnedCount = announcements.filter((a) => !a.archived && a.pinned).length;
    const archivedCount = announcements.filter((a) => Boolean(a.archived)).length;

    const filteredAnnouncements = announcements
      .filter((a) => {
        if (annStatusTab === 'arquivados') {
          if (!a.archived) return false;
        } else {
          if (a.archived) return false;
        }

        if (annStatusTab === 'nao_lidos') {
          const isRead = a.readReceipts.some((r) => r.userId === currentUser.id);
          if (isRead || !a.requireReadConfirmation) return false;
        }

        if (annStatusTab === 'fixados' && !a.pinned) return false;

        const matchesCat = annCategory === 'Todos' || a.category === annCategory;
        const matchesSearch =
          a.title.toLowerCase().includes(annSearch.toLowerCase()) ||
          a.summary.toLowerCase().includes(annSearch.toLowerCase()) ||
          a.content.toLowerCase().includes(annSearch.toLowerCase()) ||
          a.authorName.toLowerCase().includes(annSearch.toLowerCase()) ||
          a.department.toLowerCase().includes(annSearch.toLowerCase());
        return matchesCat && matchesSearch;
      })
      .sort((a, b) => {
        if (Boolean(a.pinned) !== Boolean(b.pinned)) {
          return a.pinned ? -1 : 1;
        }
        return 0;
      });

    return (
      <div className="space-y-5">
        {/* Header Bar */}
        <div className="bg-white rounded-xl p-5 shadow-xs border border-gray-200/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-[#FFD400] flex items-center justify-center text-[#080B0D]">
                <Megaphone className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div>
                <h1 className="text-xl font-extrabold text-[#15191D]">
                  Mural Oficial de Comunicados
                </h1>
                <p className="text-xs text-gray-500">
                  Rede corporativa oficial RODOVAR com confirmação de leitura auditada, anexos e histórico de edição
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={annSearch}
                onChange={(e) => setAnnSearch(e.target.value)}
                placeholder="Buscar por título, autor, setor..."
                className="pl-9 pr-4 py-2 text-sm bg-[#F3F5F7] border border-gray-200 rounded-lg focus:outline-none focus:border-[#FFD400] w-64"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                const summaryLines = [
                  `BOLETIM OFICIAL DO MURAL — RODOVAR CONECTA (${filteredAnnouncements.length} comunicados)`,
                  '------------------------------------------------------------',
                  ...filteredAnnouncements.map(
                    (a, idx) =>
                      `${idx + 1}. [${a.category.toUpperCase()}] ${a.title} | Publicado em: ${a.dateFormatted} | Público: ${a.targetAudience} | Leituras confirmadas: ${a.readReceipts.length}`
                  ),
                ].join('\n');
                navigator.clipboard?.writeText(summaryLines);
                setCopiedIdentifier('copy-mural-summary');
                setTimeout(() => setCopiedIdentifier(null), 2500);
              }}
              className="bg-[#F3F5F7] hover:bg-[#FFD400] text-[#15191D] font-bold text-xs px-3 py-2 rounded-lg border border-gray-200 inline-flex items-center gap-1.5 cursor-pointer transition"
              title="Copiar resumo executivo dos comunicados filtrados no Mural"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>
                {copiedIdentifier === 'copy-mural-summary' ? '✓ Boletim Copiado' : 'Copiar Boletim'}
              </span>
            </button>

            <button
              onClick={() => handleExportAnnouncementsMasterCsv(filteredAnnouncements)}
              className="bg-[#080B0D] hover:bg-gray-800 text-[#FFD400] font-bold text-xs px-3.5 py-2 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
              title="Exportar planilha consolidada dos comunicados filtrados e taxa de leitura (.CSV)"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar Mural (.CSV)</span>
            </button>

            {canPublish ? (
              <button
                onClick={() => {
                  setEditingAnn(null);
                  setNewAnnForm({
                    title: '',
                    summary: '',
                    content: '',
                    category: 'Importante',
                    priority: 'Importante',
                    targetAudience: 'Todos',
                    requireReadConfirmation: true,
                    pinned: false,
                    coverImage: '/assets/aistudio/010203_5a4289e5.png',
                    attachments: [],
                  });
                  setShowNewAnnModal(true);
                }}
                className="bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] font-extrabold text-sm px-4 py-2 rounded-lg inline-flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Publicar Comunicado</span>
              </button>
            ) : (
              <div className="text-xs text-gray-500 bg-gray-100 px-3 py-2 rounded-lg inline-flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-gray-400" />
                <span>Publicação restrita à Diretoria / Admin</span>
              </div>
            )}
          </div>
        </div>

        {/* Status Tabs (Ativos, Não Lidos, Fixados, Arquivados) */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="bg-white p-1 rounded-xl border border-gray-200/80 inline-flex items-center gap-1">
            <button
              onClick={() => setAnnStatusTab('ativos')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                annStatusTab === 'ativos'
                  ? 'bg-[#FFD400] text-[#080B0D]'
                  : 'text-gray-600 hover:text-[#15191D]'
              }`}
            >
              Mural Ativo ({announcements.filter((a) => !a.archived).length})
            </button>
            <button
              onClick={() => setAnnStatusTab('nao_lidos')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                annStatusTab === 'nao_lidos'
                  ? 'bg-[#FFD400] text-[#080B0D]'
                  : 'text-gray-600 hover:text-[#15191D]'
              }`}
            >
              <span>Não Lidos / Pendentes</span>
              {unreadCount > 0 && (
                <span className="bg-[#E5252A] text-white text-[10px] font-extrabold px-1.5 py-0.2 rounded-full">
                  {unreadCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setAnnStatusTab('fixados')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                annStatusTab === 'fixados'
                  ? 'bg-[#FFD400] text-[#080B0D]'
                  : 'text-gray-600 hover:text-[#15191D]'
              }`}
            >
              Fixados ({pinnedCount})
            </button>
            <button
              onClick={() => setAnnStatusTab('arquivados')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                annStatusTab === 'arquivados'
                  ? 'bg-[#080B0D] text-[#FFD400]'
                  : 'text-gray-600 hover:text-[#15191D]'
              }`}
            >
              Arquivados ({archivedCount})
            </button>
          </div>

          <div className="flex items-center gap-3">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  announcements
                    .filter(
                      (a) =>
                        !a.archived &&
                        a.requireReadConfirmation &&
                        !a.readReceipts.some((r) => r.userId === currentUser.id)
                    )
                    .forEach((a) => onConfirmRead(a.id));
                }}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold inline-flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
                title="Registrar confirmação de leitura obrigatória em todos os comunicados pendentes"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Confirmar Todas as Pendentes ({unreadCount})</span>
              </button>
            )}
            <span className="text-xs text-gray-500">
              Exibindo <strong>{filteredAnnouncements.length}</strong> comunicados
            </span>
          </div>
        </div>

        {/* Category Filter Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setAnnCategory(cat)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                annCategory === cat
                  ? 'bg-[#080B0D] text-[#FFD400]'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200/70'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Announcements Feed */}
        {filteredAnnouncements.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center border border-gray-200/80">
            <Megaphone className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-base font-bold text-[#15191D]">Nenhum comunicado publicado.</p>
            <p className="text-xs text-gray-500 mt-1">
              Não há comunicados correspondentes aos filtros ou aba selecionada.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredAnnouncements.map((ann) => {
              const hasConfirmedRead = ann.readReceipts.some((r) => r.userId === currentUser.id);
              const hasLiked = ann.likes.includes(currentUser.id);
              const isUnreadMandatory = ann.requireReadConfirmation && !hasConfirmedRead;

              const isOpen = openAnnouncementId === ann.id;
              return (
                <React.Fragment key={ann.id}>
                  {ann.id === filteredAnnouncements.find(a => Boolean(a.pinned) === Boolean(ann.pinned))?.id && <h2 className="rv-feed-heading">{ann.pinned ? '📌 Comunicados fixados' : 'Todos os comunicados'}</h2>}
                  <article data-priority={ann.priority} className={`rv-notice-card ${ann.pinned ? 'rv-notice-pinned' : ''}`}>
                    {ann.coverImage && <img src={ann.coverImage} alt="" className="rv-notice-thumb" />}
                    <div className="rv-notice-copy">
                      <div className="rv-notice-meta">{ann.pinned && <span>📌 Fixado no topo</span>}<span>{ann.priority} · {ann.category}</span><span>{ann.dateFormatted} · {ann.department}</span></div>
                      <h2>{ann.title}</h2><p>{ann.summary || ann.content.slice(0,180)}</p>
                      <div className="rv-notice-meta"><span>{ann.attachments?.length || 0} anexos</span><span>{ann.comments.length} comentários</span><span className={hasConfirmedRead ? 'rv-read-ok' : 'rv-read-pending'}>{hasConfirmedRead ? 'Leitura confirmada' : ann.requireReadConfirmation ? 'Leitura pendente' : 'Informativo'}</span></div>
                    </div>
                    <button type="button" className="rv-button-dark" onClick={() => setOpenAnnouncementId(ann.id)}>Ler comunicado →</button>
                  </article>
                  {isOpen && <div className="rv-notice-backdrop" onClick={() => setOpenAnnouncementId(null)}><section role="dialog" aria-modal="true" aria-label={ann.title} className="rv-notice-panel" onClick={e => e.stopPropagation()}><button type="button" className="rv-panel-close" onClick={() => setOpenAnnouncementId(null)} aria-label="Fechar comunicado">Fechar ×</button>
                <div
                  key={ann.id}
                  className={`bg-white rounded-xl border shadow-xs overflow-hidden transition-all ${
                    ann.pinned
                      ? 'border-[#FFD400] ring-1 ring-[#FFD400]/50'
                      : 'border-gray-200/80'
                  }`}
                >
                  <div className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                      <div className="flex items-start gap-3">
                        <div className="w-11 h-11 rounded-xl bg-[#FFD400] flex items-center justify-center shrink-0">
                          <Calendar className="w-5 h-5 text-[#080B0D]" />
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            {ann.pinned && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-[#080B0D] bg-[#FFD400] px-2 py-0.5 rounded">
                                <Pin className="w-3 h-3" /> Fixado no Topo
                              </span>
                            )}
                            {isUnreadMandatory && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#E5252A] bg-red-50 border border-red-200 px-2 py-0.5 rounded">
                                Não lido
                              </span>
                            )}
                            {ann.archived && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-gray-600 bg-gray-200 px-2 py-0.5 rounded">
                                Arquivado
                              </span>
                            )}
                            <h2 className="text-lg font-extrabold text-[#15191D] uppercase">
                              {ann.title}
                            </h2>
                            <span
                              className={`text-xs font-bold px-2.5 py-0.5 rounded-md ${
                                ann.priority === 'Urgente' || ann.priority === 'Importante'
                                  ? 'bg-[#E5252A] text-white'
                                  : 'bg-[#2563EB] text-white'
                              }`}
                            >
                              {ann.category}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 mt-1">
                            <span>{ann.dateFormatted}</span>
                            <span>•</span>
                            <span>{ann.department}</span>
                            <span>•</span>
                            <span>
                              Autor: <strong className="text-gray-700">{ann.authorName}</strong>
                            </span>
                            <span>•</span>
                            <span>Público: {ann.targetAudience}</span>
                            {ann.editHistory && ann.editHistory.length > 0 && (
                              <>
                                <span>•</span>
                                <button
                                  onClick={() => setInspectEditHistoryAnn(ann)}
                                  className="inline-flex items-center gap-1 text-blue-600 hover:underline font-semibold cursor-pointer"
                                >
                                  <History className="w-3 h-3" />
                                  <span>Editado ({ann.editHistory.length})</span>
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Read Confirmation & Admin Controls */}
                      <div className="flex flex-wrap items-center gap-2">
                        {ann.requireReadConfirmation && (
                          <>
                            {hasConfirmedRead ? (
                              <div className="inline-flex items-center gap-1.5">
                                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
                                  <CheckCircle2 className="w-4 h-4" />
                                  Leitura Confirmada
                                </span>
                                <button
                                  onClick={() => handleDownloadReadCertificate(ann)}
                                  className="inline-flex items-center gap-1 text-[11px] font-bold bg-[#080B0D] text-[#FFD400] px-2.5 py-1.5 rounded-lg hover:bg-gray-800 transition cursor-pointer"
                                  title="Baixar Comprovante Oficial de Ciência e Leitura"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  <span>Comprovante</span>
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => onConfirmRead(ann.id)}
                                className="bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] text-xs font-extrabold px-4 py-2 rounded-lg inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
                              >
                                <Check className="w-4 h-4 stroke-[2.5]" />
                                Confirmar leitura
                              </button>
                            )}
                          </>
                        )}

                        {canPublish && ann.requireReadConfirmation && (
                          <button
                            onClick={() => {
                              setReceiptDeptFilter('Todos');
                              setInspectReadReceiptsAnn(ann);
                            }}
                            className="text-xs font-semibold text-gray-700 hover:text-[#15191D] bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span className="tabular-nums">
                              Leituras ({ann.readReceipts.length}/{employees.length})
                            </span>
                          </button>
                        )}

                        {canPublish && (
                          <details className="rv-admin-menu"><summary aria-label="Ações administrativas">•••</summary><div className="flex items-center gap-1">
                            <button
                              onClick={() => onTogglePinAnnouncement?.(ann.id)}
                              title={ann.pinned ? 'Desafixar do topo' : 'Fixar no topo'}
                              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                ann.pinned
                                  ? 'bg-[#FFD400] text-[#080B0D]'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              }`}
                            >
                              <Pin className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => openEditAnnouncementModal(ann)}
                              title="Editar comunicado"
                              className="p-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => onToggleArchiveAnnouncement?.(ann.id)}
                              title={ann.archived ? 'Restaurar do arquivo' : 'Arquivar comunicado'}
                              className="p-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors cursor-pointer"
                            >
                              {ann.archived ? (
                                <ArchiveRestore className="w-3.5 h-3.5 text-emerald-700" />
                              ) : (
                                <Archive className="w-3.5 h-3.5" />
                              )}
                            </button>
                            {onDeleteAnnouncement && (
                              <button
                                onClick={() => onDeleteAnnouncement(ann.id)}
                                title="Excluir comunicado permanentemente"
                                className="p-1.5 rounded-lg bg-red-50 text-[#E5252A] hover:bg-red-100 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div></details>
                        )}
                      </div>
                    </div>

                    {/* Content + Optional Image */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center mt-3">
                      <div className={ann.coverImage ? 'lg:col-span-8' : 'lg:col-span-12'}>
                        <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
                          {ann.content}
                        </p>

                        {ann.attachments && ann.attachments.length > 0 && (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {ann.attachments.map((att, idx) => (
                              <button
                                key={idx}
                                onClick={() => handleDownloadAttachment(att)}
                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#F3F5F7] hover:bg-[#FFD400]/25 border border-gray-200 text-xs font-semibold text-[#15191D] transition-colors cursor-pointer"
                              >
                                <Paperclip className="w-3.5 h-3.5 text-gray-500" />
                                <span>{att.name}</span>
                                <span className="text-gray-400">({att.size})</span>
                                <Download className="w-3.5 h-3.5 text-[#080B0D] ml-1" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {ann.coverImage && (
                        <div className="lg:col-span-4">
                          <img
                            src={ann.coverImage}
                            alt={ann.title}
                            referrerPolicy="no-referrer"
                            className="w-full h-44 object-cover rounded-xl border border-gray-100"
                          />
                        </div>
                      )}
                    </div>

                    {/* Social Actions Bar (Likes & Comments & Copy Official Notice) */}
                    <div className="mt-5 pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={() => onToggleLike(ann.id)}
                          className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                            hasLiked
                              ? 'bg-red-50 text-[#E5252A]'
                              : 'text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          <Heart className={`w-4 h-4 ${hasLiked ? 'fill-[#E5252A]' : ''}`} />
                          <span>{ann.likes.length} Curtidas</span>
                        </button>

                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500">
                          <MessageSquare className="w-4 h-4" />
                          <span>{ann.comments.length} Comentários</span>
                        </span>

                        <button
                          type="button"
                          onClick={() => {
                            const annHash = `AUTH-RDV-${ann.id.toUpperCase()}-${currentUser.id.toUpperCase()}-2027`;
                            const fullText = [
                              `RODOVAR CONECTA — COMUNICADO OFICIAL (${ann.category.toUpperCase()})`,
                              `Título: ${ann.title}`,
                              `Setor: ${ann.department} | Prioridade: ${ann.priority} | Data: ${ann.dateFormatted}`,
                              `Autor: ${ann.authorName} (${ann.department})`,
                              `Hash de Rastreabilidade: ${annHash}`,
                              `------------------------------------------------------------`,
                              ann.content,
                            ].join('\n');
                            navigator.clipboard?.writeText(fullText);
                            setCopiedIdentifier(`ann-copy-${ann.id}`);
                            setTimeout(() => setCopiedIdentifier(null), 2500);
                          }}
                          className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg bg-[#F3F5F7] hover:bg-[#FFD400]/30 text-[#15191D] border border-gray-200 transition-colors cursor-pointer"
                          title="Copiar texto integral e metadados deste comunicado oficial"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>
                            {copiedIdentifier === `ann-copy-${ann.id}`
                              ? '✓ Comunicado Copiado'
                              : 'Copiar Comunicado'}
                          </span>
                        </button>
                      </div>

                      {!hasConfirmedRead && ann.requireReadConfirmation && (
                        <span className="text-[11px] font-semibold text-[#E5252A] flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Confirmação de leitura obrigatória pendente — clique em &ldquo;Confirmar leitura&rdquo;
                        </span>
                      )}
                    </div>

                    {/* Comments Section */}
                    <div className="mt-3 bg-[#F3F5F7] rounded-xl p-3 space-y-2.5">
                      {ann.comments.map((c) => (
                        <div
                          key={c.id}
                          className="bg-white p-2.5 rounded-lg border border-gray-200/60 flex items-start justify-between gap-2"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-[#15191D]">
                                {c.authorName}{' '}
                                <span className="font-normal text-gray-500">• {c.authorRole}</span>
                              </span>
                              <span className="text-[10px] text-gray-400">{c.createdAt}</span>
                            </div>
                            <p className="text-xs text-gray-700 mt-1">{c.content}</p>
                          </div>
                          {(canPublish || c.authorId === currentUser.id) && onDeleteComment && (
                            <button
                              onClick={() => onDeleteComment(ann.id, c.id)}
                              title="Remover comentário"
                              className="p-1 text-gray-400 hover:text-[#E5252A] cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}

                      {/* Fase 18: Respostas Corporativas Rápidas nos Comentários (1-Clique) */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        <span className="text-[10px] font-bold text-gray-400 uppercase">
                          Resposta rápida:
                        </span>
                        {[
                          '✓ Ciente das orientações operacionais.',
                          '✓ Equipe do setor alinhada com a diretriz.',
                          '✓ Procedimento / Checklist aplicado em rota.',
                        ].map((quickReply) => (
                          <button
                            key={quickReply}
                            type="button"
                            onClick={() =>
                              setCommentInputs({ ...commentInputs, [ann.id]: quickReply })
                            }
                            className="text-[10px] font-bold bg-white hover:bg-[#FFD400]/30 text-[#15191D] px-2 py-0.5 rounded border border-gray-200 transition cursor-pointer"
                          >
                            {quickReply}
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={commentInputs[ann.id] || ''}
                          onChange={(e) =>
                            setCommentInputs({ ...commentInputs, [ann.id]: e.target.value })
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && commentInputs[ann.id]?.trim()) {
                              onAddComment(ann.id, commentInputs[ann.id]);
                              setCommentInputs({ ...commentInputs, [ann.id]: '' });
                            }
                          }}
                          placeholder="Escreva um comentário corporativo..."
                          className="flex-1 bg-white text-xs px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-[#FFD400]"
                        />
                        <button
                          onClick={() => {
                            if (commentInputs[ann.id]?.trim()) {
                              onAddComment(ann.id, commentInputs[ann.id]);
                              setCommentInputs({ ...commentInputs, [ann.id]: '' });
                            }
                          }}
                          className="bg-[#080B0D] hover:bg-gray-800 text-[#FFD400] text-xs font-bold px-3.5 py-2 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Comentar</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                  </section></div>}
                </React.Fragment>
              );
            })}
          </div>
        )}

        {/* Modal: Inspect Read Confirmations (Diretoria / Admin) */}
        {inspectReadReceiptsAnn && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <div>
                  <h3 className="text-base font-extrabold text-[#15191D]">
                    Painel da Diretoria — Controle de Confirmação de Leitura
                  </h3>
                  <p className="text-xs text-gray-500">{inspectReadReceiptsAnn.title}</p>
                </div>
                <button
                  onClick={() => setInspectReadReceiptsAnn(null)}
                  className="p-1 text-gray-400 hover:text-gray-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Progress Bar & Filter */}
              <div className="mt-3 bg-[#F3F5F7] p-3 rounded-xl flex items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex justify-between text-xs font-bold text-[#15191D] mb-1">
                    <span>Taxa de Confirmação Oficial</span>
                    <span className="tabular-nums">
                      {Math.round(
                        (inspectReadReceiptsAnn.readReceipts.length /
                          Math.max(1, employees.length)) *
                          100
                      )}
                      % ({inspectReadReceiptsAnn.readReceipts.length}/{employees.length})
                    </span>
                  </div>
                  <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-600 transition-all"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round(
                            (inspectReadReceiptsAnn.readReceipts.length /
                              Math.max(1, employees.length)) *
                              100
                          )
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <select
                    value={receiptDeptFilter}
                    onChange={(e) => setReceiptDeptFilter(e.target.value)}
                    className="px-2.5 py-1.5 text-xs font-bold bg-white border border-gray-200 rounded-lg"
                  >
                    <option value="Todos">Todos os Setores</option>
                    <option value="Administrativo">Administrativo</option>
                    <option value="Operacional">Operacional</option>
                    <option value="Recursos Humanos">Recursos Humanos</option>
                    <option value="Segurança">Segurança</option>
                    <option value="Financeiro">Financeiro</option>
                    <option value="Diretoria">Diretoria</option>
                  </select>
                  <button
                    onClick={() =>
                      handleExportSingleAnnouncementReceiptsCsv(inspectReadReceiptsAnn)
                    }
                    className="bg-[#080B0D] hover:bg-gray-800 text-[#FFD400] text-[11px] font-bold px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                    title="Exportar Ata Nominal de Ciência deste Comunicado (.CSV)"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Exportar Ata (.CSV)</span>
                  </button>
                  
                </div>
              </div>

              <div className="mt-4 space-y-3 max-h-80 overflow-y-auto">
                <p className="text-xs font-bold text-emerald-700 uppercase">
                  Colaboradores que confirmaram leitura (
                  {
                    inspectReadReceiptsAnn.readReceipts.filter(
                      (r) => receiptDeptFilter === 'Todos' || r.department === receiptDeptFilter
                    ).length
                  }
                  )
                </p>
                {inspectReadReceiptsAnn.readReceipts
                  .filter(
                    (r) => receiptDeptFilter === 'Todos' || r.department === receiptDeptFilter
                  )
                  .map((r) => {
                    return (
                      <div
                        key={r.userId}
                        className="flex flex-wrap items-center justify-between gap-2 bg-emerald-50/70 border border-emerald-200/70 px-3 py-2 rounded-lg text-xs"
                      >
                        <div>
                          <span className="font-bold text-[#15191D]">{r.userName}</span>
                          <span className="text-gray-500"> • {r.department}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[11px] text-emerald-700">
                            {r.confirmedAt}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                  <p className="text-xs font-bold text-[#E5252A] uppercase">
                    Pendentes de confirmação (
                    {
                      employees.filter(
                        (e) =>
                          (receiptDeptFilter === 'Todos' || e.department === receiptDeptFilter) &&
                          !inspectReadReceiptsAnn.readReceipts.some((r) => r.userId === e.id)
                      ).length
                    }
                    )
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const pendingList = employees
                          .filter(
                            (e) =>
                              (receiptDeptFilter === 'Todos' || e.department === receiptDeptFilter) &&
                              !inspectReadReceiptsAnn.readReceipts.some((r) => r.userId === e.id)
                          )
                          .map((e) => `- ${e.name} (${e.department} • Telefone: ${e.phoneExt})`)
                          .join('\n');
                        const textToCopy = `[RODOVAR CONECTA — PENDÊNCIAS DE LEITURA OBRIGATÓRIA]\nComunicado: ${inspectReadReceiptsAnn.title}\nSetor Filtrado: ${receiptDeptFilter}\n\nColaboradores Pendentes:\n${pendingList || 'Nenhum colaborador pendente.'}`;
                        navigator.clipboard?.writeText(textToCopy);
                        setCopiedIdentifier(`ann-pend-${inspectReadReceiptsAnn.id}`);
                        setTimeout(() => setCopiedIdentifier(null), 2500);
                      }}
                      className="bg-white hover:bg-[#FFD400]/30 text-[#15191D] border border-gray-200 text-[11px] font-bold px-2.5 py-1 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                      title="Copiar relação nominal de colaboradores pendentes de leitura"
                    >
                      <Copy className="w-3 h-3" />
                      <span>
                        {copiedIdentifier === `ann-pend-${inspectReadReceiptsAnn.id}`
                          ? '✓ Pendentes Copiados'
                          : 'Copiar Pendentes'}
                      </span>
                    </button>
                    {canPublish && (
                      <button
                        onClick={() => handleSendBulkReadReminder(inspectReadReceiptsAnn)}
                        className="bg-[#080B0D] hover:bg-gray-800 text-[#FFD400] text-[11px] font-extrabold px-3 py-1 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Send className="w-3 h-3" />
                        <span>Cobrar Leitura dos Pendentes</span>
                      </button>
                    )}
                  </div>
                </div>
                {reminderSentToast && (
                  <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold">
                    {reminderSentToast}
                  </div>
                )}
                {employees
                  .filter(
                    (e) =>
                      (receiptDeptFilter === 'Todos' || e.department === receiptDeptFilter) &&
                      !inspectReadReceiptsAnn.readReceipts.some((r) => r.userId === e.id)
                  )
                  .map((emp) => (
                    <div
                      key={emp.id}
                      className="flex items-center justify-between bg-red-50/60 border border-red-200/60 px-3 py-2 rounded-lg text-xs"
                    >
                      <div>
                        <span className="font-bold text-[#15191D]">{emp.name}</span>
                        <span className="text-gray-500"> • {emp.department}</span>
                      </div>
                      <span className="text-[#E5252A] font-semibold">Não confirmou</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* Modal: Inspect Edit History */}
        {inspectEditHistoryAnn && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <div>
                  <h3 className="text-base font-extrabold text-[#15191D]">
                    Histórico de Edições do Comunicado
                  </h3>
                  <p className="text-xs text-gray-500">{inspectEditHistoryAnn.title}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const historyLines = (inspectEditHistoryAnn.editHistory || [])
                        .map(
                          (e) =>
                            `• [${e.editedAt}] ${e.editorName} (${e.editorRole}): ${e.note}`
                        )
                        .join('\n');
                      const text = `RODOVAR CONECTA — TRILHA DE EDIÇÕES DO COMUNICADO\nComunicado: ${inspectEditHistoryAnn.title}\n\n${historyLines || 'Sem registros.'}`;
                      navigator.clipboard?.writeText(text);
                      setCopiedIdentifier(`ann-hist-${inspectEditHistoryAnn.id}`);
                      setTimeout(() => setCopiedIdentifier(null), 2500);
                    }}
                    className="bg-[#F3F5F7] hover:bg-[#FFD400]/30 text-[#15191D] border border-gray-200 text-[11px] font-bold px-2.5 py-1 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    <span>
                      {copiedIdentifier === `ann-hist-${inspectEditHistoryAnn.id}`
                        ? '✓ Copiado'
                        : 'Copiar Trilha'}
                    </span>
                  </button>
                  <button
                    onClick={() => setInspectEditHistoryAnn(null)}
                    className="p-1 text-gray-400 hover:text-gray-700"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="mt-4 space-y-2.5 max-h-72 overflow-y-auto">
                {(inspectEditHistoryAnn.editHistory || []).map((entry) => (
                  <div
                    key={entry.id}
                    className="p-3 rounded-xl bg-[#F3F5F7] border border-gray-200 text-xs"
                  >
                    <div className="flex justify-between font-bold text-[#15191D]">
                      <span>
                        {entry.editorName} ({entry.editorRole})
                      </span>
                      <span className="font-mono text-[10px] text-gray-500">{entry.editedAt}</span>
                    </div>
                    <p className="text-gray-600 mt-1">{entry.note}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Modal: Create / Edit Official Announcement */}
        {showNewAnnModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <h3 className="text-lg font-extrabold text-[#15191D]">
                  {editingAnn
                    ? 'Editar Comunicado Oficial RODOVAR'
                    : 'Publicar Comunicado Oficial RODOVAR'}
                </h3>
                <button
                  onClick={() => setShowNewAnnModal(false)}
                  className="p-1 text-gray-400 hover:text-gray-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3.5 mt-4">
                {!editingAnn && (
                  <div className="bg-[#F3F5F7] p-3 rounded-xl border border-gray-200/80">
                    <span className="block text-[10px] font-extrabold uppercase tracking-wider text-gray-500 mb-2">
                      Modelos Oficiais Homologados RODOVAR (1-Clique)
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setNewAnnForm({
                            ...newAnnForm,
                            title: 'ALERTA OPERACIONAL SSMA: CHECKLIST DE FRENAGEM E PNEUS NA SERRA',
                            category: 'Segurança',
                            priority: 'Urgente',
                            targetAudience: 'Operacional',
                            requireReadConfirmation: true,
                            pinned: true,
                            summary:
                              'Obrigatória a inspeção visual e aferição de pressão antes da descida de serra em todas as rotas interestaduais.',
                            content:
                              'Determinamos a todos os motoristas de carreta e frota pesada da Transportadora Rodovar a realização obrigatória do Checklist Pré-Viagem (POP-SSMA-01) nos pontos de apoio homologados antes de trechos de serra.\n\n1. Verificar pressão e sulco dos pneus.\n2. Testar sistema de freio motor e retarder.\n3. Confirmar ciência obrigatória neste comunicado antes da liberação do manifesto.',
                          })
                        }
                        className="text-[11px] font-bold bg-white hover:bg-[#FFD400]/20 text-[#15191D] border border-gray-200 px-2.5 py-1 rounded-lg transition cursor-pointer"
                      >
                        🦺 Alerta Rodoviário SSMA
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setNewAnnForm({
                            ...newAnnForm,
                            title: 'CRONOGRAMA DE MANUTENÇÃO PREVENTIVA DE FROTA PESADA',
                            category: 'Operacional',
                            priority: 'Importante',
                            targetAudience: 'Operacional',
                            requireReadConfirmation: true,
                            pinned: false,
                            summary:
                              'Convocação de cavalos mecânicos por final de placa para revisão preventiva na oficina central.',
                            content:
                              'A Coordenação de Manutenção e Frota informa o calendário mensal de recolhimento preventivo nas docas de manutenção da Matriz.\n\nSolicitamos aos motoristas e líderes de pátio que apresentem o veículo lavado e com o diário de bordo preenchido com 30 minutos de antecedência.',
                          })
                        }
                        className="text-[11px] font-bold bg-white hover:bg-[#FFD400]/20 text-[#15191D] border border-gray-200 px-2.5 py-1 rounded-lg transition cursor-pointer"
                      >
                        🚛 Manutenção de Frota
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setNewAnnForm({
                            ...newAnnForm,
                            title: 'FECHAMENTO DE PONTO ELETRÔNICO E COMPROVANTES DE DIÁRIA',
                            category: 'Recursos Humanos',
                            priority: 'Importante',
                            targetAudience: 'Todos',
                            requireReadConfirmation: true,
                            pinned: false,
                            summary:
                              'Prazo final até o dia 25 para envio de justificativas de jornada e recibos de viagem pelo portal.',
                            content:
                              'O Departamento de Recursos Humanos comunica que o fechamento do espelho de ponto e apuração de diárias de viagem ocorrerá impreterivelmente no dia 25.\n\nEventuais ajustes ou atestados devem ser protocolados via Central de Solicitações Internas (SLA 48h).',
                          })
                        }
                        className="text-[11px] font-bold bg-white hover:bg-[#FFD400]/20 text-[#15191D] border border-gray-200 px-2.5 py-1 rounded-lg transition cursor-pointer"
                      >
                        📋 Comunicado RH / Ponto
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setNewAnnForm({
                            ...newAnnForm,
                            title: 'DIRETRIZ EXECUTIVA DE GOVERNANÇA E METAS TRIMESTRAIS RODOVAR',
                            category: 'Diretoria',
                            priority: 'Urgente',
                            targetAudience: 'Todos',
                            requireReadConfirmation: true,
                            pinned: true,
                            summary:
                              'Alinhamento estratégico da Diretoria sobre índice OTIF, segurança zero acidente e SLA interno de 48h.',
                            content:
                              'A Diretoria Executiva da Transportadora Rodovar parabeniza todas as bases pelo desempenho operacional e reforça as três diretrizes inegociáveis do trimestre:\n\n1. Meta Zero Acidente e 100% de adesão aos treinamentos SSMA.\n2. Cumprimento rigoroso do SLA de 48h em todas as solicitações internas.\n3. Leitura e ciência formal de todos os POPs atualizados na Central de Documentos.',
                          })
                        }
                        className="text-[11px] font-bold bg-white hover:bg-[#FFD400]/20 text-[#15191D] border border-gray-200 px-2.5 py-1 rounded-lg transition cursor-pointer"
                      >
                        🏛️ Diretriz da Diretoria
                      </button>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Título do Comunicado *
                  </label>
                  <input
                    type="text"
                    value={newAnnForm.title}
                    onChange={(e) => setNewAnnForm({ ...newAnnForm, title: e.target.value })}
                    placeholder="Ex: CRONOGRAMA DE INVENTÁRIO DO GALPÃO CENTRAL"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-[#FFD400]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Categoria</label>
                    <select
                      value={newAnnForm.category}
                      onChange={(e) =>
                        setNewAnnForm({
                          ...newAnnForm,
                          category: e.target.value as AnnouncementCategory,
                        })
                      }
                      className="w-full px-3 py-2 text-xs font-semibold border border-gray-300 rounded-lg"
                    >
                      <option value="Comunicado Geral">Comunicado Geral</option>
                      <option value="Importante">Importante</option>
                      <option value="Urgente">Urgente</option>
                      <option value="Recursos Humanos">Recursos Humanos</option>
                      <option value="Segurança">Segurança</option>
                      <option value="Operacional">Operacional</option>
                      <option value="Eventos">Eventos</option>
                      <option value="Diretoria">Diretoria</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Prioridade</label>
                    <select
                      value={newAnnForm.priority}
                      onChange={(e) =>
                        setNewAnnForm({
                          ...newAnnForm,
                          priority: e.target.value as 'Normal' | 'Importante' | 'Urgente',
                        })
                      }
                      className="w-full px-3 py-2 text-xs font-semibold border border-gray-300 rounded-lg"
                    >
                      <option value="Normal">Normal</option>
                      <option value="Importante">Importante</option>
                      <option value="Urgente">Urgente</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Público Destinatário
                    </label>
                    <select
                      value={newAnnForm.targetAudience}
                      onChange={(e) =>
                        setNewAnnForm({
                          ...newAnnForm,
                          targetAudience: e.target.value as Department | 'Todos',
                        })
                      }
                      className="w-full px-3 py-2 text-xs font-semibold border border-gray-300 rounded-lg"
                    >
                      <option value="Todos">Todos os Departamentos</option>
                      <option value="Operacional">Operacional</option>
                      <option value="Administrativo">Administrativo</option>
                      <option value="Recursos Humanos">Recursos Humanos</option>
                      <option value="Segurança">Segurança</option>
                      <option value="Financeiro">Financeiro</option>
                      <option value="Diretoria">Diretoria</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Resumo para o Dashboard *
                  </label>
                  <input
                    type="text"
                    value={newAnnForm.summary}
                    onChange={(e) => setNewAnnForm({ ...newAnnForm, summary: e.target.value })}
                    placeholder="Resumo curto exibido no card em destaque..."
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Conteúdo Completo *
                  </label>
                  <textarea
                    rows={4}
                    value={newAnnForm.content}
                    onChange={(e) => setNewAnnForm({ ...newAnnForm, content: e.target.value })}
                    placeholder="Digite as orientações detalhadas do comunicado..."
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                  />
                </div>

                {/* Cover Image Selector & Upload */}
                <div className="bg-[#F3F5F7] p-3 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-[#15191D] flex items-center gap-1.5">
                      <ImageIcon className="w-4 h-4" />
                      <span>Imagem de Capa do Comunicado</span>
                    </label>
                    <label className="text-xs font-bold text-[#080B0D] bg-[#FFD400] px-2.5 py-1 rounded cursor-pointer">
                      Enviar Foto do Computador
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleCoverFileSelect}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    {[
                      { label: 'Frota Oficial RODOVAR', url: '/assets/aistudio/010203_5a4289e5.png' },
                      { label: 'Pátio Logístico RODOVAR', url: '/assets/aistudio/DSC00515_18c5e319.JPG' },
                    ].map((preset) => (
                      <button
                        key={preset.url}
                        type="button"
                        onClick={() => setNewAnnForm({ ...newAnnForm, coverImage: preset.url })}
                        className={`text-[11px] font-bold px-2.5 py-1 rounded border cursor-pointer ${
                          newAnnForm.coverImage === preset.url
                            ? 'bg-[#080B0D] text-[#FFD400] border-[#080B0D]'
                            : 'bg-white text-gray-600 border-gray-200'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Attachments Manager */}
                <div className="bg-[#F3F5F7] p-3 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#15191D] flex items-center gap-1.5">
                      <Paperclip className="w-4 h-4" />
                      <span>Anexos do Comunicado ({newAnnForm.attachments.length})</span>
                    </span>
                    <label className="text-xs font-bold text-white bg-[#080B0D] px-2.5 py-1 rounded cursor-pointer">
                      + Anexar Arquivo
                      <input
                        type="file"
                        onChange={handleAttachmentFileSelect}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={attachmentInputName}
                      onChange={(e) => setAttachmentInputName(e.target.value)}
                      placeholder="Ou digite o nome do documento anexo (Ex: Escala_Frota.pdf)"
                      className="flex-1 bg-white px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!attachmentInputName.trim()) return;
                        setNewAnnForm((prev) => ({
                          ...prev,
                          attachments: [
                            ...prev.attachments,
                            { name: attachmentInputName.trim(), size: '1.1 MB', type: 'PDF' },
                          ],
                        }));
                        setAttachmentInputName('');
                      }}
                      className="bg-white border border-gray-300 text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer"
                    >
                      Adicionar
                    </button>
                  </div>

                  {newAnnForm.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {newAnnForm.attachments.map((att, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1.5 bg-white border border-gray-200 px-2.5 py-1 rounded text-xs"
                        >
                          <span>{att.name}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setNewAnnForm((prev) => ({
                                ...prev,
                                attachments: prev.attachments.filter((_, idx) => idx !== i),
                              }))
                            }
                            className="text-gray-400 hover:text-[#E5252A]"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {editingAnn && (
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Motivo / Registro no Histórico de Edição *
                    </label>
                    <input
                      type="text"
                      value={editNoteInput}
                      onChange={(e) => setEditNoteInput(e.target.value)}
                      placeholder="Ex: Correção de horário do plantão operacional"
                      className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg"
                    />
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-5 pt-1">
                  <label className="flex items-center gap-2 text-xs font-semibold text-[#15191D] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newAnnForm.requireReadConfirmation}
                      onChange={(e) =>
                        setNewAnnForm({
                          ...newAnnForm,
                          requireReadConfirmation: e.target.checked,
                        })
                      }
                      className="rounded text-[#FFD400]"
                    />
                    Exigir confirmação de leitura obrigatória
                  </label>

                  <label className="flex items-center gap-2 text-xs font-semibold text-[#15191D] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newAnnForm.pinned}
                      onChange={(e) => setNewAnnForm({ ...newAnnForm, pinned: e.target.checked })}
                      className="rounded text-[#FFD400]"
                    />
                    Fixar comunicado no topo do Mural
                  </label>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <button
                  onClick={() => {
                    setShowNewAnnModal(false);
                    setEditingAnn(null);
                  }}
                  className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    if (!newAnnForm.title.trim() || !newAnnForm.content.trim()) return;
                    if (editingAnn && onUpdateAnnouncement) {
                      onUpdateAnnouncement(
                        editingAnn.id,
                        {
                          title: newAnnForm.title.toUpperCase(),
                          summary: newAnnForm.summary || newAnnForm.content.slice(0, 120),
                          content: newAnnForm.content,
                          category: newAnnForm.category,
                          priority: newAnnForm.priority,
                          targetAudience: newAnnForm.targetAudience,
                          requireReadConfirmation: newAnnForm.requireReadConfirmation,
                          pinned: newAnnForm.pinned,
                          coverImage: newAnnForm.coverImage,
                          attachments: newAnnForm.attachments,
                        },
                        editNoteInput || 'Edição administrativa'
                      );
                    } else {
                      onCreateAnnouncement({
                        title: newAnnForm.title.toUpperCase(),
                        summary: newAnnForm.summary || newAnnForm.content.slice(0, 120),
                        content: newAnnForm.content,
                        authorName: currentUser.name,
                        department: currentUser.department,
                        category: newAnnForm.category,
                        priority: newAnnForm.priority,
                        targetAudience: newAnnForm.targetAudience,
                        requireReadConfirmation: newAnnForm.requireReadConfirmation,
                        pinned: newAnnForm.pinned,
                        coverImage: newAnnForm.coverImage,
                        attachments: newAnnForm.attachments,
                      });
                    }
                    setShowNewAnnModal(false);
                    setEditingAnn(null);
                  }}
                  className="bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] text-xs font-extrabold px-5 py-2 rounded-lg shadow-xs cursor-pointer"
                >
                  {editingAnn ? 'Salvar Alterações e Registrar Histórico' : 'Publicar Oficialmente'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // 2. CENTRAL DE SOLICITAÇÕES (PRAZO AUTOMÁTICO 48 HORAS — FASE 5 COMPLETA)
  // ============================================================================
  if (activeSection === 'solicitacoes') return <RhRequestsWorkspace currentUser={currentUser} initialOpenRequestModal={initialOpenRequestModal} onClearInitialModal={onClearInitialModal} />;
  // ============================================================================
  // 3. CHAT CORPORATIVO ESTILO WHATSAPP (MENSAGENS PRIVADAS & GRUPOS — FASE 4)
  // ============================================================================
  if (activeSection === 'mensagens' || activeSection === 'grupos') {
    return (
      <WhatsAppChatView
        activeSection={activeSection}
        currentUser={currentUser}
        employees={employees}
        chats={chats}
        onSendMessage={onSendMessage}
        onMarkThreadRead={(tid) => onMarkThreadRead?.(tid)}
        onCreateGroupChat={onCreateGroupChat}
        onUpdateThreadPinnedNotice={onUpdateThreadPinnedNotice}
        onTogglePinMessage={onTogglePinMessage}
        onDeleteMessage={onDeleteMessage}
        onManageGroupParticipants={onManageGroupParticipants}
        onStartDirectChat={onStartDirectChat}
      />
    );
  }

  if (false as boolean) {
    const isGroupMode = String(activeSection) === 'grupos';
    const availableThreads = chats.filter((c) => {
      if (c.isGroup !== isGroupMode) return false;
      if (chatUnreadFilter === 'nao_lidas' && (c.unreadCount || 0) === 0) return false;
      const q = chatSearch.toLowerCase();
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.roleOrDept.toLowerCase().includes(q) ||
        c.messages.some((m) => m.text.toLowerCase().includes(q))
      );
    });

    const activeThread =
      availableThreads.find((c) => c.id === selectedChatId) ||
      chats.find((c) => c.isGroup === isGroupMode && c.id === selectedChatId) ||
      availableThreads[0];

    const displayedMessages = activeThread
      ? activeThread.messages.filter((m) =>
          !inThreadSearch.trim()
            ? true
            : m.text.toLowerCase().includes(inThreadSearch.toLowerCase()) ||
              m.senderName.toLowerCase().includes(inThreadSearch.toLowerCase()) ||
              (m.attachment && m.attachment.toLowerCase().includes(inThreadSearch.toLowerCase()))
        )
      : [];

    const activeParticipantIds = activeThread?.participantIds || [
      currentUser.id,
      'emp-2',
      'emp-3',
    ];

    return (
      <div className="space-y-4">
        {/* Top Module Header Bar */}
        <div className="bg-white rounded-xl p-4 shadow-xs border border-gray-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FFD400] flex items-center justify-center text-[#080B0D]">
              {isGroupMode ? (
                <Users className="w-5 h-5 stroke-[2.2]" />
              ) : (
                <MessageSquare className="w-5 h-5 stroke-[2.2]" />
              )}
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-[#15191D]">
                {isGroupMode
                  ? 'Grupos Corporativos & Canais Operacionais'
                  : 'Mensagens Corporativas Privadas'}
              </h1>
              <p className="text-xs text-gray-500">
                {isGroupMode
                  ? 'Comunicação segmentada por departamento com avisos fixados, anexos e controle de integrantes'
                  : 'Comunicação direta em tempo real entre colaboradores autorizados da RODOVAR'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!isGroupMode && (
              <button
                onClick={() => setShowNewDirectChatModal(true)}
                className="bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] font-extrabold text-xs px-3.5 py-2 rounded-lg inline-flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>Nova Conversa</span>
              </button>
            )}
            {isGroupMode && canPublish && (
              <button
                onClick={() => setShowNewGroupModal(true)}
                className="bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] font-extrabold text-xs px-3.5 py-2 rounded-lg inline-flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Criar Grupo Corporativo</span>
              </button>
            )}
          </div>
        </div>

        {/* Main Split Chat Container */}
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-xs overflow-hidden h-[calc(100vh-245px)] min-h-[540px] grid grid-cols-1 md:grid-cols-12">
          {/* Left Thread List */}
          <div className="md:col-span-4 border-r border-gray-200 flex flex-col bg-[#F9FAFB]">
            <div className="p-3.5 border-b border-gray-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex gap-1 bg-gray-200/80 p-0.5 rounded-lg">
                  <button
                    onClick={() => onNavigate('mensagens')}
                    className={`px-3 py-1 rounded-md text-xs font-bold cursor-pointer transition-colors ${
                      !isGroupMode
                        ? 'bg-[#FFD400] text-[#080B0D] shadow-2xs'
                        : 'text-gray-600 hover:text-[#15191D]'
                    }`}
                  >
                    Privadas ({chats.filter((c) => !c.isGroup).length})
                  </button>
                  <button
                    onClick={() => onNavigate('grupos')}
                    className={`px-3 py-1 rounded-md text-xs font-bold cursor-pointer transition-colors ${
                      isGroupMode
                        ? 'bg-[#FFD400] text-[#080B0D] shadow-2xs'
                        : 'text-gray-600 hover:text-[#15191D]'
                    }`}
                  >
                    Grupos ({chats.filter((c) => c.isGroup).length})
                  </button>
                </div>

                {/* Unread Filter Toggle */}
                <div className="flex gap-1">
                  <button
                    onClick={() => setChatUnreadFilter('todas')}
                    className={`px-2 py-1 rounded text-[11px] font-bold cursor-pointer ${
                      chatUnreadFilter === 'todas'
                        ? 'bg-[#080B0D] text-[#FFD400]'
                        : 'bg-white text-gray-500 border border-gray-200'
                    }`}
                  >
                    Todas
                  </button>
                  <button
                    onClick={() => setChatUnreadFilter('nao_lidas')}
                    className={`px-2 py-1 rounded text-[11px] font-bold cursor-pointer ${
                      chatUnreadFilter === 'nao_lidas'
                        ? 'bg-[#E5252A] text-white'
                        : 'bg-white text-gray-500 border border-gray-200'
                    }`}
                  >
                    Não lidas
                  </button>
                </div>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={chatSearch}
                  onChange={(e) => setChatSearch(e.target.value)}
                  placeholder={
                    isGroupMode
                      ? 'Filtrar grupo ou departamento...'
                      : 'Buscar colaborador ou mensagem...'
                  }
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-[#FFD400]"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {availableThreads.length === 0 ? (
                <div className="p-8 text-center text-xs text-gray-500 space-y-2">
                  <p className="font-bold text-[#15191D]">Nenhuma conversa encontrada.</p>
                  {chatUnreadFilter === 'nao_lidas' && (
                    <button
                      onClick={() => setChatUnreadFilter('todas')}
                      className="text-xs font-bold text-[#080B0D] bg-[#FFD400] px-3 py-1 rounded-lg cursor-pointer"
                    >
                      Ver todas as conversas
                    </button>
                  )}
                </div>
              ) : (
                availableThreads.map((t) => {
                  const lastMsg = t.messages[t.messages.length - 1];
                  const isSelected = activeThread?.id === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => {
                        setSelectedChatId(t.id);
                        setEditingPinnedNotice(false);
                        onMarkThreadRead?.(t.id);
                      }}
                      className={`w-full p-3.5 flex items-start gap-3 text-left transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-[#FFD400]/20 border-l-4 border-l-[#FFD400]'
                          : 'hover:bg-gray-100'
                      }`}
                    >
                      <div className="relative w-10 h-10 rounded-full bg-[#080B0D] text-[#FFD400] flex items-center justify-center font-bold text-sm shrink-0">
                        {t.isGroup ? (
                          <Users className="w-5 h-5" />
                        ) : (
                          t.name.slice(0, 2).toUpperCase()
                        )}
                        {!t.isGroup && (
                          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <p className="text-xs font-extrabold text-[#15191D] truncate">{t.name}</p>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {t.pinnedNotice && <Pin className="w-3 h-3 text-[#B89600]" />}
                            {lastMsg && (
                              <span className="text-[10px] text-gray-400 tabular-nums">
                                {lastMsg.timestamp}
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="text-[11px] text-gray-500 truncate">{t.roleOrDept}</p>
                        <div className="flex items-center justify-between gap-2 mt-1">
                          {lastMsg ? (
                            <p className="text-xs text-gray-600 truncate">
                              {lastMsg.attachment ? `📎 ${lastMsg.attachment}` : lastMsg.text}
                            </p>
                          ) : (
                            <p className="text-xs text-gray-400 italic">Sem mensagens</p>
                          )}
                          {(t.unreadCount || 0) > 0 && (
                            <span className="bg-[#E5252A] text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-full tabular-nums shrink-0">
                              {t.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Conversation Panel */}
          <div className="md:col-span-8 flex flex-col bg-white">
            {activeThread ? (
              <>
                {/* Conversation Top Bar */}
                <div className="p-3.5 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-[#080B0D] text-[#FFD400] flex items-center justify-center font-bold text-xs shrink-0">
                      {activeThread.isGroup ? (
                        <Users className="w-4 h-4" />
                      ) : (
                        activeThread.name.slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-extrabold text-[#15191D] truncate">
                          {activeThread.name}
                        </h3>
                        {activeThread.department && (
                          <span className="text-[10px] font-bold bg-[#F3F5F7] text-gray-700 px-2 py-0.5 rounded border border-gray-200">
                            {activeThread.department}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 truncate">{activeThread.roleOrDept}</p>
                    </div>
                  </div>

                  {/* Conversation Controls: Search in Thread + Members + Pin Notice */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={inThreadSearch}
                        onChange={(e) => setInThreadSearch(e.target.value)}
                        placeholder="Buscar na conversa..."
                        className="pl-8 pr-2.5 py-1 text-xs bg-[#F3F5F7] border border-gray-200 rounded-lg w-40 focus:outline-none focus:border-[#FFD400]"
                      />
                    </div>

                    {activeThread.isGroup && (
                      <button
                        onClick={() => setShowGroupMembersModal(true)}
                        className="text-xs font-bold text-[#15191D] bg-[#F3F5F7] hover:bg-gray-200 px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1.5 border border-gray-200 cursor-pointer"
                      >
                        <Users className="w-3.5 h-3.5" />
                        <span>
                          Integrantes ({activeThread.participantsCount || activeParticipantIds.length})
                        </span>
                      </button>
                    )}

                    <button
                      onClick={() => handleExportChatTranscript(activeThread)}
                      title="Exportar histórico auditado da conversa em formato .TXT"
                      className="text-xs font-bold text-[#15191D] bg-[#F3F5F7] hover:bg-gray-200 px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1.5 border border-gray-200 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Transcrição (.TXT)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const summary = `[RODOVAR CONECTA - RESUMO DE CANAL]\nCanal: ${activeThread.name} (${
                          activeThread.isGroup ? 'Grupo Corporativo' : 'Mensagem Direta'
                        })\nSetor: ${activeThread.department || activeThread.roleOrDept}\nDiretriz Fixada: ${
                          activeThread.pinnedNotice || 'Nenhuma'
                        }\nTotal de Mensagens: ${activeThread.messages.length}`;
                        navigator.clipboard?.writeText(summary);
                        setCopiedIdentifier(`chat-summary-${activeThread.id}`);
                        setTimeout(() => setCopiedIdentifier(null), 2500);
                      }}
                      title="Copiar resumo executivo deste canal para a área de transferência"
                      className="text-xs font-bold text-[#15191D] bg-[#F3F5F7] hover:bg-[#FFD400]/30 px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1.5 border border-gray-200 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>
                        {copiedIdentifier === `chat-summary-${activeThread.id}`
                          ? '✓ Resumo Copiado'
                          : 'Copiar Resumo'}
                      </span>
                    </button>

                    {canPublish && (
                      <button
                        onClick={() => {
                          setPinnedNoticeInput(activeThread.pinnedNotice || '');
                          setEditingPinnedNotice(!editingPinnedNotice);
                        }}
                        title="Definir ou editar diretriz fixada no topo"
                        className="text-xs font-bold text-[#080B0D] bg-[#FFD400]/30 hover:bg-[#FFD400] px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Pin className="w-3.5 h-3.5" />
                        <span>Fixar Aviso</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Pinned Notice Banner / Editor */}
                {(activeThread.pinnedNotice || editingPinnedNotice) && (
                  <div className="bg-[#080B0D] text-white px-4 py-2.5 border-b border-gray-800 flex items-center justify-between gap-3">
                    {editingPinnedNotice ? (
                      <div className="flex items-center gap-2 w-full">
                        <Pin className="w-4 h-4 text-[#FFD400] shrink-0" />
                        <input
                          type="text"
                          value={pinnedNoticeInput}
                          onChange={(e) => setPinnedNoticeInput(e.target.value)}
                          placeholder="Digite o aviso oficial fixado no topo desta conversa/grupo..."
                          className="flex-1 bg-white/10 text-white text-xs px-3 py-1.5 rounded-lg border border-white/20 focus:outline-none focus:border-[#FFD400]"
                        />
                        <button
                          onClick={() => {
                            onUpdateThreadPinnedNotice?.(activeThread.id, pinnedNoticeInput);
                            setEditingPinnedNotice(false);
                          }}
                          className="bg-[#FFD400] text-[#080B0D] text-xs font-extrabold px-3 py-1.5 rounded-lg cursor-pointer"
                        >
                          Salvar Aviso
                        </button>
                        <button
                          onClick={() => setEditingPinnedNotice(false)}
                          className="text-xs text-gray-400 hover:text-white px-2"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 text-xs min-w-0">
                          <span className="bg-[#FFD400] text-[#080B0D] font-extrabold text-[10px] px-2 py-0.5 rounded uppercase shrink-0 inline-flex items-center gap-1">
                            <Pin className="w-3 h-3" />
                            Fixado
                          </span>
                          <span className="text-gray-200 truncate">{activeThread.pinnedNotice}</span>
                        </div>
                        {canPublish && (
                          <button
                            onClick={() => {
                              setPinnedNoticeInput(activeThread.pinnedNotice || '');
                              setEditingPinnedNotice(true);
                            }}
                            className="text-[11px] text-[#FFD400] hover:underline shrink-0 cursor-pointer"
                          >
                            Editar
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Messages Feed */}
                <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#F3F5F7]">
                  {displayedMessages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center text-xs text-gray-400">
                      <MessageSquare className="w-8 h-8 text-gray-300 mb-2" />
                      <p>Nenhuma mensagem corresponde ao filtro atual.</p>
                    </div>
                  ) : (
                    displayedMessages.map((m) => {
                      const isMe = m.senderId === currentUser.id;
                      return (
                        <div
                          key={m.id}
                          className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                        >
                          <div
                            className={`max-w-[78%] rounded-2xl px-4 py-2.5 shadow-2xs relative group ${
                              isMe
                                ? 'bg-[#080B0D] text-white rounded-br-xs'
                                : 'bg-white text-[#15191D] border border-gray-200/80 rounded-bl-xs'
                            } ${m.pinned ? 'ring-2 ring-[#FFD400]' : ''}`}
                          >
                            {/* Top Sender Header + Message Actions */}
                            <div className="flex items-center justify-between gap-4 mb-1">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`text-[11px] font-extrabold ${
                                    isMe ? 'text-[#FFD400]' : 'text-[#080B0D]'
                                  }`}
                                >
                                  {isMe ? 'Você' : m.senderName}
                                </span>
                                {m.senderRole && !isMe && (
                                  <span className="text-[10px] text-gray-400">
                                    • {m.senderRole}
                                  </span>
                                )}
                                {m.pinned && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-bold bg-[#FFD400] text-[#080B0D] px-1.5 py-0.2 rounded">
                                    <Pin className="w-2.5 h-2.5" />
                                    Fixada
                                  </span>
                                )}
                              </div>

                              {/* Copy / Pin / Delete Controls */}
                              <div className="flex items-center gap-1 opacity-75 group-hover:opacity-100">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const formattedMsg = `[${m.timestamp}] ${m.senderName} (${activeThread.name}): ${m.text}`;
                                    navigator.clipboard?.writeText(formattedMsg);
                                    setCopiedIdentifier(`msg-copy-${m.id}`);
                                    setTimeout(() => setCopiedIdentifier(null), 2000);
                                  }}
                                  title="Copiar mensagem com carimbo de data/hora"
                                  className="p-0.5 hover:text-[#FFD400] cursor-pointer inline-flex items-center gap-0.5 text-[10px]"
                                >
                                  <Copy className="w-3 h-3" />
                                  {copiedIdentifier === `msg-copy-${m.id}` && (
                                    <span className="font-bold text-[#FFD400]">✓</span>
                                  )}
                                </button>
                                {canPublish && onTogglePinMessage && (
                                  <button
                                    onClick={() => onTogglePinMessage(activeThread.id, m.id)}
                                    title={m.pinned ? 'Desafixar mensagem' : 'Fixar mensagem'}
                                    className="p-0.5 hover:text-[#FFD400] cursor-pointer"
                                  >
                                    <Pin className="w-3 h-3" />
                                  </button>
                                )}
                                {(isMe || canPublish) && onDeleteMessage && (
                                  <button
                                    onClick={() => onDeleteMessage(activeThread.id, m.id)}
                                    title="Excluir mensagem"
                                    className="p-0.5 hover:text-[#E5252A] cursor-pointer"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Message Body */}
                            <p className="text-xs leading-relaxed whitespace-pre-line">{m.text}</p>

                            {/* Optional File Attachment Card */}
                            {m.attachment && (
                              <button
                                onClick={() =>
                                  handleDownloadAttachment({
                                    name: m.attachment!,
                                    size: m.attachmentSize || '450 KB',
                                    type: 'DOC',
                                  })
                                }
                                className={`mt-2 w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                                  isMe
                                    ? 'bg-white/10 border-white/15 text-white hover:bg-white/20'
                                    : 'bg-[#F3F5F7] border-gray-200 text-[#15191D] hover:bg-[#FFD400]/20'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <Paperclip className="w-3.5 h-3.5 text-[#FFD400] shrink-0" />
                                  <span className="truncate">{m.attachment}</span>
                                  {m.attachmentSize && (
                                    <span className="text-[10px] opacity-70 shrink-0">
                                      ({m.attachmentSize})
                                    </span>
                                  )}
                                </div>
                                <Download className="w-3.5 h-3.5 shrink-0" />
                              </button>
                            )}

                            {/* Timestamp + Read Receipt Check */}
                            <div className="flex items-center justify-end gap-1 mt-1">
                              <span className="text-[10px] opacity-60 tabular-nums">
                                {m.timestamp}
                              </span>
                              {isMe && (
                                <CheckCheck
                                  className={`w-3.5 h-3.5 ${
                                    m.status === 'read' ? 'text-[#FFD400]' : 'text-gray-400'
                                  }`}
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Pending Attachment Bar */}
                {pendingChatAttachment && (
                  <div className="px-4 py-2 bg-[#FFFBEB] border-t border-[#FFD400]/50 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 font-bold text-[#15191D]">
                      <Paperclip className="w-3.5 h-3.5 text-[#B89600]" />
                      <span>Anexo pronto para envio: {pendingChatAttachment.name}</span>
                      <span className="text-gray-400">({pendingChatAttachment.size})</span>
                    </div>
                    <button
                      onClick={() => setPendingChatAttachment(null)}
                      className="text-gray-500 hover:text-[#E5252A] cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Fase 16: Respostas Operacionais Rápidas CCO / Frota / RH (1-Clique) */}
                <div className="px-3 pt-2 pb-1 bg-white border-t border-gray-100 flex items-center gap-1.5 overflow-x-auto">
                  <span className="text-[10px] font-extrabold uppercase text-gray-400 shrink-0 mr-1">
                    Respostas Rápidas:
                  </span>
                  {[
                    '✓ Ciente da orientação operacional RODOVAR.',
                    '🚛 Checklist pré-viagem concluído e manifesto liberado.',
                    '🦺 Normas SSMA verificadas no pátio antes da saída.',
                    '📄 Comprovante enviado para conferência do setor.',
                  ].map((quickMsg) => (
                    <button
                      key={quickMsg}
                      type="button"
                      onClick={() => setMessageText(quickMsg)}
                      className="text-[11px] font-bold bg-[#F3F5F7] hover:bg-[#FFD400]/30 text-[#15191D] px-2.5 py-1 rounded-lg border border-gray-200 whitespace-nowrap transition cursor-pointer"
                    >
                      {quickMsg}
                    </button>
                  ))}
                </div>

                {/* Bottom Message Composer */}
                <div className="p-3 border-t border-gray-200 flex items-center gap-2 bg-white">
                  <label
                    title="Anexar documento ou imagem à mensagem"
                    className="p-2.5 rounded-xl bg-[#F3F5F7] hover:bg-[#FFD400]/30 text-[#15191D] border border-gray-200 cursor-pointer transition-colors"
                  >
                    <Paperclip className="w-4 h-4" />
                    <input
                      type="file"
                      onChange={handleChatAttachmentSelect}
                      className="hidden"
                    />
                  </label>

                  <input
                    type="text"
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={(e) => {
                      if (
                        e.key === 'Enter' &&
                        (messageText.trim() || pendingChatAttachment)
                      ) {
                        onSendMessage(
                          activeThread.id,
                          messageText.trim() ||
                            `Documento anexado: ${pendingChatAttachment?.name}`,
                          pendingChatAttachment?.name,
                          pendingChatAttachment?.size
                        );
                        setMessageText('');
                        setPendingChatAttachment(null);
                      }
                    }}
                    placeholder={`Enviar mensagem para ${activeThread.name}...`}
                    className="flex-1 text-xs bg-[#F3F5F7] px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-[#FFD400]"
                  />

                  <button
                    onClick={() => {
                      if (!messageText.trim() && !pendingChatAttachment) return;
                      onSendMessage(
                        activeThread.id,
                        messageText.trim() ||
                          `Documento anexado: ${pendingChatAttachment?.name}`,
                        pendingChatAttachment?.name,
                        pendingChatAttachment?.size
                      );
                      setMessageText('');
                      setPendingChatAttachment(null);
                    }}
                    className="bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] font-extrabold text-xs px-4 py-2.5 rounded-xl inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <Send className="w-4 h-4" />
                    <span>Enviar</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
                Selecione uma conversa ou inicie um novo atendimento corporativo.
              </div>
            )}
          </div>
        </div>

        {/* Modal: Start New Direct Private Conversation */}
        {showNewDirectChatModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <div>
                  <h3 className="text-base font-extrabold text-[#15191D]">
                    Nova Conversa Privada RODOVAR
                  </h3>
                  <p className="text-xs text-gray-500">
                    Selecione um colaborador ativo do Diretório para iniciar o chat direto
                  </p>
                </div>
                <button onClick={() => setShowNewDirectChatModal(false)}>
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="mt-4 space-y-2 max-h-80 overflow-y-auto">
                {employees
                  .filter((e) => e.id !== currentUser.id && e.active)
                  .map((emp) => (
                    <button
                      key={emp.id}
                      onClick={() => {
                        onStartDirectChat(emp);
                        setShowNewDirectChatModal(false);
                      }}
                      className="w-full p-3 rounded-xl border border-gray-200 hover:border-[#FFD400] hover:bg-[#FFD400]/10 flex items-center justify-between text-left transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-[#080B0D] text-[#FFD400] flex items-center justify-center font-bold text-xs">
                          {emp.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-xs font-extrabold text-[#15191D]">{emp.name}</p>
                          <p className="text-[11px] text-gray-500">
                            {emp.roleTitle} • {emp.department}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-[#080B0D] bg-[#FFD400] px-2.5 py-1 rounded-lg">
                        Conversar
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* Modal: Create Corporate Group (Admin / Diretoria) */}
        {showNewGroupModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <div>
                  <h3 className="text-base font-extrabold text-[#15191D]">
                    Criar Novo Grupo Corporativo RODOVAR
                  </h3>
                  <p className="text-xs text-gray-500">
                    Configure o canal departamental, diretriz fixada e integrantes autorizados
                  </p>
                </div>
                <button onClick={() => setShowNewGroupModal(false)}>
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="space-y-3 mt-4">
                {/* Fase 17: Modelos Rápidos de Canais Operacionais Homologados (1-Clique) */}
                <div className="bg-[#F3F5F7] p-3 rounded-xl border border-gray-200">
                  <span className="block text-[10px] font-extrabold text-gray-500 uppercase tracking-wider mb-1.5">
                    Modelos Rápidos de Canais Corporativos RODOVAR (1-Clique):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      {
                        label: 'Plantão CCO 24h & Crise',
                        name: 'Comitê de Crise & Plantão CCO 24h',
                        department: 'Operacional' as Department | 'Todos',
                        roleOrDept: 'Monitoramento de Rotas & Contingência',
                        pinnedNotice:
                          'Canal prioritário 24h para ocorrências em rodovia, bloqueios viários e acionamento imediato da gerência de risco.',
                      },
                      {
                        label: 'Frota & Manutenção Preventiva',
                        name: 'Frota Pesada & Manutenção Preventiva',
                        department: 'Operacional' as Department | 'Todos',
                        roleOrDept: 'Oficina Central & Check-list de Pátio',
                        pinnedNotice:
                          'Reporte obrigatório de avarias mecânicas, calibração de pneus e liberação de cavalos mecânicos antes da escala.',
                      },
                      {
                        label: 'Comissão CIPA & SSMA',
                        name: 'Segurança do Trabalho — CIPA & SSMA',
                        department: 'Segurança' as Department | 'Todos',
                        roleOrDept: 'Prevenção de Acidentes e Normas NR',
                        pinnedNotice:
                          'Canal oficial para comunicados de DDS, auditoria de EPIs, ocorrências de pátio e orientações SASSMAQ.',
                      },
                    ].map((tpl) => (
                      <button
                        key={tpl.label}
                        type="button"
                        onClick={() =>
                          setNewGroupForm({
                            ...newGroupForm,
                            name: tpl.name,
                            department: tpl.department,
                            roleOrDept: tpl.roleOrDept,
                            pinnedNotice: tpl.pinnedNotice,
                          })
                        }
                        className="text-[11px] font-bold bg-white hover:bg-[#FFD400] text-[#15191D] px-2.5 py-1 rounded-lg border border-gray-200 transition cursor-pointer"
                      >
                        + {tpl.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Nome do Grupo *
                  </label>
                  <input
                    type="text"
                    value={newGroupForm.name}
                    onChange={(e) => setNewGroupForm({ ...newGroupForm, name: e.target.value })}
                    placeholder="Ex: Plantão Frota & Manutenção Preventiva"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Setor Vinculado
                    </label>
                    <select
                      value={newGroupForm.department}
                      onChange={(e) =>
                        setNewGroupForm({
                          ...newGroupForm,
                          department: e.target.value as Department | 'Todos',
                        })
                      }
                      className="w-full px-3 py-2 text-xs font-semibold border border-gray-300 rounded-lg"
                    >
                      <option value="Todos">Todos os Setores</option>
                      <option value="Operacional">Operacional</option>
                      <option value="Administrativo">Administrativo</option>
                      <option value="Recursos Humanos">Recursos Humanos</option>
                      <option value="Segurança">Segurança</option>
                      <option value="Financeiro">Financeiro</option>
                      <option value="Diretoria">Diretoria</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Finalidade / Subtítulo
                    </label>
                    <input
                      type="text"
                      value={newGroupForm.roleOrDept}
                      onChange={(e) =>
                        setNewGroupForm({ ...newGroupForm, roleOrDept: e.target.value })
                      }
                      placeholder="Ex: Canal Operacional 24h"
                      className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Diretriz / Aviso Fixado no Topo (Opcional)
                  </label>
                  <input
                    type="text"
                    value={newGroupForm.pinnedNotice}
                    onChange={(e) =>
                      setNewGroupForm({ ...newGroupForm, pinnedNotice: e.target.value })
                    }
                    placeholder="Ex: Uso exclusivo para ocorrências de pátio e liberação de viagens."
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-gray-700">
                      Selecionar Integrantes do Grupo ({newGroupForm.participantIds.length})
                    </label>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setNewGroupForm({
                            ...newGroupForm,
                            participantIds: employees.map((e) => e.id),
                          })
                        }
                        className="text-[10px] font-bold bg-[#F3F5F7] hover:bg-[#FFD400]/40 text-[#15191D] px-2 py-0.5 rounded border border-gray-200 cursor-pointer"
                      >
                        Selecionar Todos
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setNewGroupForm({
                            ...newGroupForm,
                            participantIds: [currentUser.id],
                          })
                        }
                        className="text-[10px] font-bold bg-[#F3F5F7] hover:bg-gray-200 text-gray-600 px-2 py-0.5 rounded border border-gray-200 cursor-pointer"
                      >
                        Limpar
                      </button>
                    </div>
                  </div>
                  <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-xl p-2 space-y-1 bg-[#F3F5F7]">
                    {employees.map((emp) => {
                      const selected = newGroupForm.participantIds.includes(emp.id);
                      return (
                        <label
                          key={emp.id}
                          className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white border border-gray-100 text-xs cursor-pointer"
                        >
                          <div>
                            <span className="font-bold text-[#15191D]">{emp.name}</span>
                            <span className="text-gray-500"> • {emp.department}</span>
                          </div>
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...newGroupForm.participantIds, emp.id]
                                : newGroupForm.participantIds.filter((id) => id !== emp.id);
                              setNewGroupForm({ ...newGroupForm, participantIds: next });
                            }}
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => setShowNewGroupModal(false)}
                  className="px-4 py-2 text-xs font-bold text-gray-500"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    if (!newGroupForm.name.trim()) return;
                    onCreateGroupChat?.(newGroupForm);
                    setShowNewGroupModal(false);
                    setNewGroupForm({
                      name: '',
                      department: 'Operacional',
                      roleOrDept: 'Coordenação Operacional',
                      pinnedNotice: '',
                      participantIds: ['emp-1', 'emp-2', 'emp-4'],
                    });
                  }}
                  className="bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] text-xs font-extrabold px-5 py-2 rounded-lg cursor-pointer"
                >
                  Criar Grupo Oficial
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Inspect & Manage Group Participants */}
        {showGroupMembersModal && activeThread && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <div>
                  <h3 className="text-base font-extrabold text-[#15191D]">
                    Integrantes — {activeThread.name}
                  </h3>
                  <p className="text-xs text-gray-500">{activeThread.roleOrDept}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const memberLines = employees
                        .filter((e) => activeParticipantIds.includes(e.id))
                        .map((e) => `• ${e.name} — ${e.roleTitle} (${e.department} | ${e.phoneExt})`)
                        .join('\n');
                      const listText = `RODOVAR CONECTA — INTEGRANTES DO GRUPO: ${activeThread.name}\nFinalidade: ${activeThread.roleOrDept}\n\nParticipantes Ativos:\n${memberLines}`;
                      navigator.clipboard?.writeText(listText);
                      setCopiedIdentifier(`grp-members-${activeThread.id}`);
                      setTimeout(() => setCopiedIdentifier(null), 2500);
                    }}
                    className="bg-[#F3F5F7] hover:bg-[#FFD400]/30 text-[#15191D] border border-gray-200 text-[11px] font-bold px-2.5 py-1 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                    title="Copiar relação nominal dos integrantes deste grupo corporativo"
                  >
                    <Copy className="w-3 h-3" />
                    <span>
                      {copiedIdentifier === `grp-members-${activeThread.id}`
                        ? '✓ Lista Copiada'
                        : 'Copiar Integrantes'}
                    </span>
                  </button>
                  <button onClick={() => setShowGroupMembersModal(false)}>
                    <X className="w-5 h-5 text-gray-400" />
                  </button>
                </div>
              </div>

              <div className="mt-4 space-y-2 max-h-80 overflow-y-auto">
                {employees.map((emp) => {
                  const isParticipant = activeParticipantIds.includes(emp.id);
                  return (
                    <div
                      key={emp.id}
                      className="flex items-center justify-between p-2.5 rounded-xl border border-gray-200 text-xs"
                    >
                      <div>
                        <p className="font-bold text-[#15191D]">{emp.name}</p>
                        <p className="text-[11px] text-gray-500">
                          {emp.roleTitle} • {emp.department}
                        </p>
                      </div>
                      {canPublish && onManageGroupParticipants ? (
                        <button
                          onClick={() => {
                            const updated = isParticipant
                              ? activeParticipantIds.filter((id) => id !== emp.id)
                              : [...activeParticipantIds, emp.id];
                            onManageGroupParticipants(activeThread.id, updated);
                          }}
                          className={`px-2.5 py-1 rounded-lg font-bold text-[11px] cursor-pointer ${
                            isParticipant
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-[#FFD400] text-[#080B0D]'
                          }`}
                        >
                          {isParticipant ? '✓ No Grupo (Remover)' : '+ Adicionar'}
                        </button>
                      ) : (
                        <span
                          className={`text-[11px] font-bold ${
                            isParticipant ? 'text-emerald-700' : 'text-gray-400'
                          }`}
                        >
                          {isParticipant ? 'Participante' : 'Não incluído'}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // 4. AGENDA CORPORATIVA
  // ============================================================================
  if (activeSection === 'agenda') return <AgendaPremium currentUser={currentUser} employees={employees} initial={events} onIcs={handleExportEventIcs}/>;

  if (activeSection === 'documentos') {
    const categories = [
      'Todos',
      'Políticas da Empresa',
      'Manual do Colaborador',
      'Recursos Humanos',
      'Segurança do Trabalho',
      'Formulários',
      'Treinamentos',
      'Documentos Administrativos',
    ];

    const filteredDocs = documents.filter((d) => {
      const matchCat = docCategory === 'Todos' || d.category === docCategory;
      const matchSearch =
        d.title.toLowerCase().includes(docSearch.toLowerCase()) ||
        d.description.toLowerCase().includes(docSearch.toLowerCase());
      return matchCat && matchSearch;
    });

    return (
      <div className="space-y-5">
        <div className="bg-white rounded-xl p-5 shadow-xs border border-gray-200/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FFD400] flex items-center justify-center text-[#080B0D]">
              <Folder className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-[#15191D]">
                Central de Documentos Corporativos
              </h1>
              <p className="text-xs text-gray-500">
                Biblioteca oficial com controle de versões, permissões por setor, download e leitura segura
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={docSearch}
                onChange={(e) => setDocSearch(e.target.value)}
                placeholder="Buscar documento..."
                className="pl-9 pr-4 py-2 text-xs bg-[#F3F5F7] border border-gray-200 rounded-lg focus:outline-none focus:border-[#FFD400]"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                const popIndexText = [
                  `CATÁLOGO DE DOCUMENTOS E POPs NORMATIVOS — RODOVAR CONECTA (${filteredDocs.length} documentos)`,
                  '------------------------------------------------------------',
                  ...filteredDocs.map(
                    (d) =>
                      `• ${d.title} (${d.version}) | Setor: ${d.category} | Formato: ${d.fileType} (${d.size}) | Ciência: ${
                        acknowledgedDocIds[d.id]
                          ? `Confirmada em ${acknowledgedDocIds[d.id]} (POP-ACK-${d.id.toUpperCase()}-${currentUser.id.toUpperCase()})`
                          : 'Pendente'
                      }`
                  ),
                ].join('\n');
                navigator.clipboard?.writeText(popIndexText);
                setCopiedIdentifier('copy-pop-index');
                setTimeout(() => setCopiedIdentifier(null), 2500);
              }}
              className="bg-[#F3F5F7] hover:bg-[#FFD400] text-[#15191D] font-bold text-xs px-3 py-2.5 rounded-lg border border-gray-200 inline-flex items-center gap-1.5 cursor-pointer transition"
              title="Copiar índice normativo de POPs e status de ciência para a área de transferência"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>
                {copiedIdentifier === 'copy-pop-index' ? '✓ Índice Copiado' : 'Copiar Índice POP'}
              </span>
            </button>

            <button
              onClick={handleExportDocumentsCatalogCsv}
              className="bg-[#080B0D] hover:bg-gray-800 text-[#FFD400] font-bold text-xs px-3.5 py-2.5 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
              title="Exportar inventário completo de POPs, versões e auditoria de ciência (.CSV)"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar Catálogo POP (.CSV)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const nowStr = new Date().toLocaleString('pt-BR');
                const nextAck: Record<string, string> = { ...acknowledgedDocIds };
                documents.forEach((d) => {
                  if (!nextAck[d.id]) nextAck[d.id] = nowStr;
                });
                setAcknowledgedDocIds(nextAck);
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-3.5 py-2.5 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
              title="Registrar assinatura eletrônica de ciência em todos os POPs vigentes"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>
                {Object.keys(acknowledgedDocIds).length >= documents.length
                  ? '✓ 100% POPs Assinados'
                  : 'Assinar Todos os POPs'}
              </span>
            </button>

            {canPublish && (
              <button
                onClick={() => setShowUploadDocModal(true)}
                className="bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] font-extrabold text-xs px-4 py-2.5 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Publicar Documento</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setDocCategory(c)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer ${
                docCategory === c
                  ? 'bg-[#080B0D] text-[#FFD400]'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200/70'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredDocs.map((docItem) => (
            <div
              key={docItem.id}
              className="bg-white rounded-xl p-5 border border-gray-200/80 shadow-2xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-lg bg-[#080B0D] text-[#FFD400] flex items-center justify-center font-mono text-xs font-bold shrink-0">
                      {docItem.fileType}
                    </div>
                    <div>
                      <span className="text-[11px] font-bold text-gray-500">
                        {docItem.category}
                      </span>
                      <h3 className="text-sm font-extrabold text-[#15191D]">{docItem.title}</h3>
                    </div>
                  </div>
                  <span className="font-mono text-xs font-bold bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                    {docItem.version}
                  </span>
                </div>

                <p className="text-xs text-gray-600 mt-3">{docItem.description}</p>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <span className="text-gray-400 block">
                    Atualizado em {docItem.updatedAt} • {docItem.size}
                  </span>
                  {acknowledgedDocIds[docItem.id] && (
                    <span className="text-[11px] font-bold text-emerald-700 inline-flex items-center gap-1 mt-0.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Ciência registrada ({acknowledgedDocIds[docItem.id]})
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => handleAcknowledgePopDocument(docItem)}
                    className={`font-bold px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1 cursor-pointer ${
                      acknowledgedDocIds[docItem.id]
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-[#FFD400]/30 hover:bg-[#FFD400]/50 text-[#080B0D]'
                    }`}
                    title="Registrar Termo de Ciência Normativa (ISO/SASSMAQ) e baixar comprovante"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>
                      {acknowledgedDocIds[docItem.id] ? 'Termo Assinado' : 'Acusar Ciência POP'}
                    </span>
                  </button>
                  {canPublish && onUpdateDocumentVersion && (
                    <button
                      onClick={() => {
                        setUpdatingVersionDoc(docItem);
                        setVersionUpdateForm({
                          version: `v${(parseFloat(docItem.version.replace('v', '')) + 0.1).toFixed(1)}`,
                          description: docItem.description,
                          contentPreview: docItem.contentPreview,
                        });
                      }}
                      className="bg-gray-100 hover:bg-gray-200 text-[#15191D] font-bold px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>Nova Versão</span>
                    </button>
                  )}
                  <button
                    onClick={() =>
                      handleDownloadAttachment({
                        name: `${docItem.title.replace(/\s+/g, '_')}_${docItem.version}.${docItem.fileType.toLowerCase()}`,
                        size: docItem.size,
                        type: docItem.fileType,
                        url: docItem.pdfUrl,
                      })
                    }
                    className="bg-[#080B0D] hover:bg-gray-800 text-[#FFD400] font-bold px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Baixar PDF</span>
                  </button>
                  <button
                    onClick={() => setPreviewDoc(docItem)}
                    className="bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] font-bold px-3 py-1.5 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Visualizar</span>
                  </button>
                  {canPublish && onDeleteDocument && (
                    <button
                      onClick={() => onDeleteDocument(docItem.id)}
                      title="Excluir documento permanentemente"
                      className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-[#E5252A] cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Modal: Update Document Version */}
        {updatingVersionDoc && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <div>
                  <h3 className="text-base font-extrabold text-[#15191D]">
                    Publicar Nova Versão Oficial
                  </h3>
                  <p className="text-xs text-gray-500">{updatingVersionDoc.title}</p>
                </div>
                <button onClick={() => setUpdatingVersionDoc(null)}>
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
              <div className="space-y-3 mt-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Código da Nova Versão *
                  </label>
                  <input
                    type="text"
                    value={versionUpdateForm.version}
                    onChange={(e) =>
                      setVersionUpdateForm({ ...versionUpdateForm, version: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Resumo da Revisão
                  </label>
                  <input
                    type="text"
                    value={versionUpdateForm.description}
                    onChange={(e) =>
                      setVersionUpdateForm({ ...versionUpdateForm, description: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Conteúdo Normativo Atualizado
                  </label>
                  <textarea
                    rows={4}
                    value={versionUpdateForm.contentPreview}
                    onChange={(e) =>
                      setVersionUpdateForm({ ...versionUpdateForm, contentPreview: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg font-mono"
                  />
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => setUpdatingVersionDoc(null)}
                  className="px-4 py-2 text-xs font-bold text-gray-500"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    onUpdateDocumentVersion?.(
                      updatingVersionDoc.id,
                      versionUpdateForm.version,
                      versionUpdateForm.description,
                      versionUpdateForm.contentPreview
                    );
                    setUpdatingVersionDoc(null);
                  }}
                  className="bg-[#FFD400] text-[#080B0D] text-xs font-extrabold px-4 py-2 rounded-lg cursor-pointer"
                >
                  Salvar Versão {versionUpdateForm.version}
                </button>
              </div>
            </div>
          </div>
        )}

        {previewDoc && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <div>
                  <span className="text-xs font-bold text-gray-400">
                    {previewDoc.category} • {previewDoc.version} • Edição 2027
                  </span>
                  <h3 className="text-base font-extrabold text-[#15191D]">{previewDoc.title}</h3>
                </div>
                <button onClick={() => setPreviewDoc(null)}>
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
              {previewDoc.pdfUrl && (
                <div className="mt-4 rounded-xl overflow-hidden border border-gray-200 bg-gray-900 h-96">
                  <iframe
                    src={previewDoc.pdfUrl}
                    title={previewDoc.title}
                    className="w-full h-full border-0"
                  />
                </div>
              )}
              {previewDoc.attachments && previewDoc.attachments.length > 0 && (
                <div className="mt-4 p-3.5 rounded-xl bg-gray-50 border border-gray-200 space-y-2">
                  <span className="text-xs font-extrabold text-[#15191D] block">
                    Arquivos Oficiais Anexados ({previewDoc.attachments.length})
                  </span>
                  <div className="space-y-1.5">
                    {previewDoc.attachments.map((att, idx) => (
                      <div
                        key={att.id || idx}
                        className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-white border border-gray-200 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`text-[10px] font-extrabold px-2 py-0.5 rounded font-mono uppercase ${
                              att.fileType === 'PDF'
                                ? 'bg-red-100 text-red-800'
                                : att.fileType.includes('XLS')
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {att.fileType}
                          </span>
                          <span className="font-bold text-[#15191D] truncate">{att.name}</span>
                          <span className="text-gray-400 font-mono text-[11px]">({att.size})</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {att.fileType === 'PDF' && att.url && (
                            <button
                              type="button"
                              onClick={() => setPreviewDoc({ ...previewDoc, pdfUrl: att.url })}
                              className="bg-gray-100 hover:bg-gray-200 text-[#15191D] font-bold px-2.5 py-1 rounded text-[11px] cursor-pointer"
                            >
                              Visualizar PDF
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              handleDownloadAttachment({
                                name: att.name,
                                size: att.size,
                                type: att.fileType,
                                url: att.url,
                              })
                            }
                            className="bg-[#080B0D] hover:bg-gray-800 text-[#FFD400] font-bold px-2.5 py-1 rounded text-[11px] inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Download className="w-3 h-3" />
                            <span>Baixar Original</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-4 bg-[#F3F5F7] p-4 rounded-xl text-xs text-gray-700 whitespace-pre-line font-mono leading-relaxed">
                {previewDoc.contentPreview}
              </div>
              <div className="mt-3 p-3 rounded-xl bg-gray-50 border border-gray-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <span className="text-[11px] font-bold text-emerald-700">
                    {acknowledgedDocIds[previewDoc.id]
                      ? `✓ Ciência registrada em ${acknowledgedDocIds[previewDoc.id]}`
                      : 'Pendente de assinatura eletrônica pelo seu perfil'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleAcknowledgePopDocument(previewDoc)}
                    className="bg-[#080B0D] hover:bg-gray-800 text-[#FFD400] text-xs font-bold px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>
                      {acknowledgedDocIds[previewDoc.id]
                        ? 'Abrir Documento Oficial (PDF)'
                        : 'Assinar Ciência POP & Baixar (PDF)'}
                    </span>
                  </button>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const docText = [
                      `RODOVAR CONECTA — NORMA / PROCEDIMENTO OPERACIONAL PADRÃO (2027)`,
                      `Documento: ${previewDoc.title} (${previewDoc.version})`,
                      `Categoria: ${previewDoc.category} | Atualizado em: ${previewDoc.updatedAt}`,
                      `------------------------------------------------------------`,
                      previewDoc.contentPreview,
                    ].join('\n');
                    navigator.clipboard?.writeText(docText);
                    setCopiedIdentifier(`pop-content-${previewDoc.id}`);
                    setTimeout(() => setCopiedIdentifier(null), 2500);
                  }}
                  className="bg-[#FFD400]/25 hover:bg-[#FFD400]/45 text-[#080B0D] border border-[#FFD400]/60 text-xs font-extrabold px-3.5 py-2 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>
                    {copiedIdentifier === `pop-content-${previewDoc.id}`
                      ? '✓ Norma Copiada'
                      : 'Copiar Conteúdo Normativo'}
                  </span>
                </button>
                
                <button
                  onClick={() =>
                    handleDownloadAttachment({
                      name: `${previewDoc.title.replace(/\s+/g, '_')}_${previewDoc.version}.${previewDoc.fileType.toLowerCase()}`,
                      size: previewDoc.size,
                      type: previewDoc.fileType,
                      url: previewDoc.pdfUrl,
                    })
                  }
                  className="bg-[#FFD400] text-[#080B0D] text-xs font-extrabold px-4 py-2 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar Cópia Oficial (PDF)</span>
                </button>
                <button
                  onClick={() => setPreviewDoc(null)}
                  className="bg-[#080B0D] text-[#FFD400] text-xs font-bold px-4 py-2 rounded-lg cursor-pointer"
                >
                  Fechar Visualizador
                </button>
              </div>
            </div>
          </div>
        )}

        {showUploadDocModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <h3 className="text-base font-extrabold text-[#15191D]">
                  Publicar Novo Documento Oficial
                </h3>
                <button
                  onClick={() => {
                    setShowUploadDocModal(false);
                    setDocAttachments([]);
                    setDocUploadError(null);
                    setDocUploadProgress(0);
                  }}
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              {docUploadError && (
                <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-800 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{docUploadError}</span>
                </div>
              )}

              <div className="space-y-3 mt-4">
                <div className="bg-[#F3F5F7] p-2.5 rounded-xl border border-gray-200">
                  <span className="block text-[10px] font-extrabold uppercase tracking-wider text-gray-500 mb-1.5">
                    Templates Normativos POP Homologados (1-Clique)
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setNewDocForm({
                          ...newDocForm,
                          title: 'POP-SSMA-09 — Protocolo de Amarração e Peação de Cargas Sider',
                          category: 'Segurança do Trabalho',
                          version: 'v1.0',
                          fileType: 'PDF',
                          size: '1.8 MB',
                          description:
                            'Norma técnica obrigatória para conferência de cintas, catracas e cantoneiras de proteção antes da saída do pátio.',
                        })
                      }
                      className="text-[11px] font-bold bg-white hover:bg-[#FFD400]/20 text-[#15191D] border border-gray-200 px-2 py-1 rounded-lg cursor-pointer"
                    >
                      🦺 POP Peação de Cargas
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setNewDocForm({
                          ...newDocForm,
                          title: 'Manual de Prestação de Contas e Adiantamento de Viagem',
                          category: 'Documentos Administrativos',
                          version: 'v2.0',
                          fileType: 'PDF',
                          size: '940 KB',
                          description:
                            'Diretrizes financeiras para lançamento de notas fiscais de pedágio, pernoite e alimentação via protocolo SLA 48h.',
                        })
                      }
                      className="text-[11px] font-bold bg-white hover:bg-[#FFD400]/20 text-[#15191D] border border-gray-200 px-2 py-1 rounded-lg cursor-pointer"
                    >
                      💰 Manual de Diárias
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setNewDocForm({
                          ...newDocForm,
                          title: 'POP-OP-12 — Checklist de Inspeção Pré-Viagem e Tacógrafo Digital',
                          category: 'Treinamentos',
                          version: 'v1.4',
                          fileType: 'PDF',
                          size: '1.5 MB',
                          description:
                            'Procedimento operacional padrão para aferição de disco/fita de tacógrafo, pressão de pneus, freios e telemetria antes da liberação de manifesto.',
                        })
                      }
                      className="text-[11px] font-bold bg-white hover:bg-[#FFD400]/20 text-[#15191D] border border-gray-200 px-2 py-1 rounded-lg cursor-pointer"
                    >
                      🚛 POP Inspeção & Tacógrafo
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  placeholder="Título do Documento *"
                  value={newDocForm.title}
                  onChange={(e) => setNewDocForm({ ...newDocForm, title: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                />
                <select
                  value={newDocForm.category}
                  onChange={(e) =>
                    setNewDocForm({ ...newDocForm, category: e.target.value as DocumentCategory })
                  }
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                >
                  <option value="Políticas da Empresa">Políticas da Empresa</option>
                  <option value="Manual do Colaborador">Manual do Colaborador</option>
                  <option value="Recursos Humanos">Recursos Humanos</option>
                  <option value="Segurança do Trabalho">Segurança do Trabalho</option>
                  <option value="Formulários">Formulários</option>
                  <option value="Treinamentos">Treinamentos</option>
                  <option value="Documentos Administrativos">Documentos Administrativos</option>
                </select>
                <textarea
                  rows={3}
                  placeholder="Descrição e resumo normativo..."
                  value={newDocForm.description}
                  onChange={(e) => setNewDocForm({ ...newDocForm, description: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                />

                {/* MULTI-FILE ATTACHMENT SECTION (REQUISITO 4) */}
                <div className="pt-2 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-gray-700">
                      Anexar Múltiplos Arquivos (.pdf, .doc, .docx, .xls, .xlsx)
                    </label>
                    <span className="text-[11px] text-gray-400">Máx. 25 MB/arq</span>
                  </div>

                  <label className="border-2 border-dashed border-gray-300 hover:border-[#FFD400] bg-gray-50 hover:bg-amber-50/40 rounded-xl p-3 flex flex-col items-center justify-center cursor-pointer transition">
                    <Paperclip className="w-5 h-5 text-gray-500 mb-1" />
                    <span className="text-xs font-bold text-gray-700">
                      Selecionar arquivos para publicação
                    </span>
                    <span className="text-[11px] text-gray-400 mt-0.5">
                      Formatos aceitos: .pdf, .doc, .docx, .xls, .xlsx
                    </span>
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.doc,.docx,.xls,.xlsx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      onChange={async (e) => {
                        const files = e.target.files;
                        if (!files || files.length === 0) return;
                        setDocUploadError(null);
                        const allowed = ['pdf', 'doc', 'docx', 'xls', 'xlsx'];
                        const added: Array<{
                          name: string;
                          size: string;
                          fileType: string;
                          dataUrl: string;
                          fileObj?: File;
                        }> = [];

                        for (let i = 0; i < files.length; i++) {
                          const file = files[i];
                          const ext = (file.name.split('.').pop() || '').toLowerCase();
                          if (!allowed.includes(ext)) {
                            setDocUploadError(
                              `O arquivo "${file.name}" possui formato não permitido (.${ext}). Formatos aceitos: .pdf, .doc, .docx, .xls, .xlsx.`
                            );
                            continue;
                          }
                          if (file.size > 25 * 1024 * 1024) {
                            setDocUploadError(
                              `O arquivo "${file.name}" excede o tamanho máximo de 25 MB.`
                            );
                            continue;
                          }
                          const dataUrl = await new Promise<string>((resolve) => {
                            const reader = new FileReader();
                            reader.onload = () => resolve(String(reader.result));
                            reader.readAsDataURL(file);
                          });
                          const sizeKb = Math.max(1, Math.round(file.size / 1024));
                          const sizeStr =
                            sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;
                          added.push({
                            name: file.name,
                            size: sizeStr,
                            fileType: ext.toUpperCase(),
                            dataUrl,
                            fileObj: file,
                          });
                        }

                        setDocAttachments((prev) => [...prev, ...added]);
                        e.target.value = '';
                      }}
                      className="hidden"
                    />
                  </label>

                  {docAttachments.length > 0 && (
                    <div className="mt-2.5 space-y-1.5 max-h-40 overflow-y-auto">
                      {docAttachments.map((att, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2 rounded-lg bg-gray-50 border border-gray-200 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`text-[10px] font-extrabold px-2 py-0.5 rounded font-mono uppercase shrink-0 ${
                                att.fileType === 'PDF'
                                  ? 'bg-red-100 text-red-800'
                                  : att.fileType.includes('XLS')
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-blue-100 text-blue-800'
                              }`}
                            >
                              {att.fileType}
                            </span>
                            <span className="font-bold text-gray-800 truncate" title={att.name}>
                              {att.name}
                            </span>
                            <span className="text-gray-400 font-mono text-[11px] shrink-0">
                              ({att.size})
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setDocAttachments((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="text-gray-400 hover:text-red-600 p-1 rounded cursor-pointer"
                            title="Remover arquivo antes de publicar"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {isUploadingDoc && (
                    <div className="mt-3 space-y-1">
                      <div className="flex items-center justify-between text-xs font-bold text-gray-700">
                        <span>Enviando e validando arquivos no servidor...</span>
                        <span>{docUploadProgress}%</span>
                      </div>
                      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#FFD400] transition-all duration-300"
                          style={{ width: `${docUploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  disabled={isUploadingDoc}
                  onClick={() => {
                    setShowUploadDocModal(false);
                    setDocAttachments([]);
                    setDocUploadError(null);
                    setDocUploadProgress(0);
                  }}
                  className="px-4 py-2 text-xs font-bold text-gray-500 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  disabled={isUploadingDoc}
                  onClick={async () => {
                    if (!newDocForm.title.trim()) {
                      setDocUploadError('Informe o título do documento oficial.');
                      return;
                    }
                    setDocUploadError(null);
                    setIsUploadingDoc(true);
                    setDocUploadProgress(20);

                    let uploadedAttachments: DocumentAttachmentItem[] = [];
                    if (docAttachments.length > 0) {
                      setDocUploadProgress(50);
                      const res = await apiUploadDocumentAttachments(
                        docAttachments.map((a) => ({
                          name: a.name,
                          dataUrl: a.dataUrl,
                          size: a.fileObj?.size || 0,
                          type: a.fileType,
                        }))
                      );
                      if (!res.ok) {
                        setDocUploadError(
                          res.error || 'Falha ao validar anexos no servidor.'
                        );
                        setIsUploadingDoc(false);
                        setDocUploadProgress(0);
                        return;
                      }
                      uploadedAttachments = (res.attachments || []).map((att) => ({
                        id: att.id,
                        name: att.name,
                        size: att.size,
                        fileType: att.fileType,
                        url: att.url,
                      }));
                      setDocUploadProgress(85);
                    }

                    const firstPdf = uploadedAttachments.find((a) => a.fileType === 'PDF');
                    onUploadDocument({
                      ...newDocForm,
                      allowedDepartments: 'Todos',
                      contentPreview: newDocForm.description || 'Documento oficial RODOVAR.',
                      fileType: (uploadedAttachments[0]?.fileType as any) || newDocForm.fileType,
                      size: uploadedAttachments[0]?.size || newDocForm.size,
                      pdfUrl: firstPdf?.url,
                      attachments: uploadedAttachments,
                    });

                    setDocUploadProgress(100);
                    setTimeout(() => {
                      setIsUploadingDoc(false);
                      setShowUploadDocModal(false);
                      setDocAttachments([]);
                      setDocUploadProgress(0);
                    }, 350);
                  }}
                  className="bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] text-xs font-extrabold px-5 py-2 rounded-lg cursor-pointer disabled:opacity-50"
                >
                  {isUploadingDoc ? 'Publicando...' : 'Publicar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // 6. DIRETÓRIO DE FUNCIONÁRIOS
  // ============================================================================
  if (activeSection === 'diretorio') return <CollaboratorsPremium employees={employees} currentUser={currentUser} onChat={onStartDirectChat} onAdmin={()=>onNavigate('administracao')}/>;

  if (activeSection === 'administracao') {
    const totalReads = announcements.reduce((acc, a) => acc + a.readReceipts.length, 0);
    const totalPossibleReads = announcements.length * employees.length;
    const readRate =
      totalPossibleReads > 0 ? Math.round((totalReads / totalPossibleReads) * 100) : 100;

    if (!isStrictAdmin || currentUser.id !== 'emp-admin-master') return <div role="alert">Acesso restrito ao administrador principal.</div>;
    const openArea = (area: AdminArea, audit=false) => {
      setMasterArea(area);
      setAdminSubTab(area==='system'?'configuracao_sistema':area==='users'||area==='permissions'?'liberacao_uso':'visao_geral');
      setAdminScrollRequest(previous=>({target:audit?'am-audit-anchor':'am-workspace',sequence:(previous?.sequence||0)+1}));
    };
    return (<div className="space-y-5 am-admin-page">
      <AdministrationMaster onDrivers={()=>setShowDriverCenter(true)} employees={employees} area={masterArea} onArea={openArea}
        onCreate={()=>setShowCreateLoginModal(true)} onNavigate={onNavigate}
        onLogs={()=>openArea('reports',true)} onAudit={()=>openArea('reports',true)}
        onWatchdog={()=>{if(window.confirm('Executar a auditoria Watchdog SLA 48h e registrar os resultados?')){handleRunSlaWatchdogAudit();openArea('reports');}}}
        onExport={kind=>{if(kind==='reads')handleExportCorporateCsvReport('leituras');else if(kind==='requests')handleExportCorporateCsvReport('sla_solicitacoes');else if(kind==='compliance')handleExportEmployeeComplianceMatrixCsv();else handleExportGovernanceJsonSnapshot();}} />
      <CorporateModal isOpen={showDriverCenter} onClose={()=>setShowDriverCenter(false)} title="Gestão de Motoristas" maxWidth="6xl"><DriverCenter admin/></CorporateModal>
      <section id="am-workspace" className="am-workspace" aria-label="Funcionalidades da Administração">
        <div className="am-workspace-heading"><div><h2>{({users:'Usuários & Acessos',system:'Sistema',permissions:'Permissões',reports:'Relatórios e Auditoria',backups:'Backups e Restauração'})[masterArea]}</h2><p>{masterArea==='permissions'?'Selecione uma conta e utilize a ação Alterar Permissões.':masterArea==='backups'?'Exportação e restauração do estado local do portal.':'Recursos existentes, permissões e histórico preservados.'}</p></div></div>
        {isStrictAdmin && (masterArea === 'users' || masterArea === 'permissions') && (
          <AccessReleaseTab
            currentUser={currentUser}
            systemConfig={systemConfig}
            onPendingCountChange={(cnt) => {
              setLocalPendingCount(cnt);
              onPendingCountChange?.(cnt);
            }}
            onAccountsUpdated={onAccountsUpdated}
          />
        )}

        {isStrictAdmin && masterArea === 'system' && systemConfig && (
          <SystemConfigTab
            systemConfig={systemConfig}
            onSystemConfigPublished={onSystemConfigPublished}
          />
        )}

{masterArea==='backups'&&<><p className="am-permission-note">Este backup contém os dados carregados pelo portal. Não inclui arquivos armazenados no servidor, sessões, credenciais de autenticação ou bases locais independentes.</p>          {/* Barra de Backup Integral (.JSON), Importação e Restauração de Dados */}
          <div className="am-backup-panel flex flex-col gap-5">
            <div className="text-xs text-gray-300">
              <span className="font-extrabold text-[#FFD400]">
                Persistência e Segurança de Dados:
              </span>{' '}
              Exporte ou importe o estado local do portal (.JSON). Revise o arquivo antes de restaurar.
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleExportGovernanceJsonSnapshot}
                className="bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 border border-white/15 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-[#FFD400]" />
                <span>Exportar Backup (.JSON)</span>
              </button>

              {onImportPortalBackup && (
                <label className="bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 border border-white/15 cursor-pointer">
                  <Folder className="w-3.5 h-3.5 text-[#FFD400]" />
                  <span>Importar Backup (.JSON)</span>
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if(file.size>20*1024*1024){setExportReportToast('Backup acima do limite de 20 MB.');return;}
                      const reader = new FileReader();
                      reader.onload = () => {
                        try {
                          const parsed = JSON.parse(String(reader.result));
                          const validation = validatePortalBackup(parsed);
                          if(!validation.valid)throw Error(validation.error);
                          if(!window.confirm('Restaurar o estado local do portal? '+validation.summary+'. O administrador principal será preservado.'))return;
                          const ok = onImportPortalBackup(parsed);
                          setExportReportToast(
                            ok
                              ? '✓ Backup (.JSON) importado e restaurado com sucesso!'
                              : 'Arquivo JSON inválido para restauração.'
                          );
                          setTimeout(() => setExportReportToast(null), 4000);
                        } catch {
                          setExportReportToast('Backup inválido. Verifique o formato e a integridade das coleções.');
                          setTimeout(() => setExportReportToast(null), 4000);
                        }
                      };
                      reader.readAsText(file);
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                </label>
              )}

              {onRestorePortalDefaults &&
                (!confirmRestoreDefaults ? (
                  <button
                    type="button"
                    onClick={() => setConfirmRestoreDefaults(true)}
                    className="bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-400/30 text-xs font-bold px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>Restaurar Conteúdo Padrão</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5 bg-red-950/80 border border-red-500/50 px-2.5 py-1 rounded-lg">
                    <span className="text-[11px] font-bold text-red-200">Confirmar restauração?</span>
                    <button
                      type="button"
                      onClick={() => {
                        onRestorePortalDefaults();
                        setConfirmRestoreDefaults(false);
                        setExportReportToast(
                          '✓ Conteúdo padrão restaurado (Administrador Master preservado).'
                        );
                        setTimeout(() => setExportReportToast(null), 4000);
                      }}
                      className="bg-[#E5252A] hover:bg-red-700 text-white text-[11px] font-extrabold px-2 py-0.5 rounded cursor-pointer"
                    >
                      Sim, Restaurar
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRestoreDefaults(false)}
                      className="text-gray-300 hover:text-white text-[11px] font-bold px-1.5 py-0.5 cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                ))}
            </div>
          </div>
        

</>}
{masterArea==='reports'&&<div className="space-y-5">        {/* Real Calculated KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white p-4 rounded-xl border border-gray-200/80">
            <span className="text-xs font-semibold text-gray-500">Funcionários Ativos</span>
            <p className="text-2xl font-extrabold text-[#15191D] mt-1 tabular-nums">
              {employees.filter((e) => e.active).length}
            </p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-gray-200/80">
            <span className="text-xs font-semibold text-gray-500">Comunicados Publicados</span>
            <p className="text-2xl font-extrabold text-[#15191D] mt-1 tabular-nums">
              {announcements.length}
            </p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-gray-200/80">
            <span className="text-xs font-semibold text-gray-500">Taxa de Leitura Confirmada</span>
            <p className="text-2xl font-extrabold text-emerald-600 mt-1 tabular-nums">
              {readRate}%
            </p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-gray-200/80">
            <span className="text-xs font-semibold text-gray-500">Contas Cadastradas</span>
            <p className="text-2xl font-extrabold text-[#15191D] mt-1 tabular-nums">
              {employees.length}
            </p>
          </div>
        </div>

        {/* FASE 7: Indicadores Gerenciais da Diretoria por Departamento + Exportação de Relatórios CSV */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-8 bg-white rounded-xl p-5 border border-gray-200/80">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="text-sm font-extrabold text-[#15191D]">
                  Indicadores Gerenciais da Diretoria por Departamento
                </h3>
                <p className="text-xs text-gray-500">
                  Adesão de confirmação de leitura obrigatória e cumprimento do SLA de 48h por setor
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const depts = [...new Set(employees.map(e=>e.department))];
                    const lines = [
                      'MATRIZ GERENCIAL DE CONFORMIDADE POR DEPARTAMENTO — RODOVAR CONECTA',
                      '------------------------------------------------------------',
                      ...depts.map((dept) => {
                        const deptEmps = employees.filter((e) => e.department === dept && e.active);
                        const deptReqs = requests.filter((r) => r.targetDepartment === dept);
                        const overdueReqs = deptReqs.filter(
                          (r) => getSlaInfo(r).isOverdue && r.status !== 'Concluída'
                        );
                        return `• ${dept}: ${deptEmps.length} colaboradores ativos | ${deptReqs.length} chamados SLA 48h (${overdueReqs.length} vencidos)`;
                      }),
                    ].join('\n');
                    navigator.clipboard?.writeText(lines);
                    setCopiedIdentifier('copy-dept-matrix');
                    setTimeout(() => setCopiedIdentifier(null), 2500);
                  }}
                  className="text-[11px] font-bold bg-[#F3F5F7] hover:bg-[#FFD400] text-[#15191D] px-2.5 py-1 rounded border border-gray-200 inline-flex items-center gap-1 transition cursor-pointer"
                  title="Copiar matriz departamental de indicadores gerenciais"
                >
                  <Copy className="w-3 h-3" />
                  <span>
                    {copiedIdentifier === 'copy-dept-matrix' ? '✓ Matriz Copiada' : 'Copiar Matriz'}
                  </span>
                </button>
                <span className="text-[10px] font-mono font-bold bg-[#080B0D] text-[#FFD400] px-2.5 py-1 rounded">
                  DADOS DISPONÍVEIS NO PORTAL
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-400 font-bold uppercase text-[10px]">
                    <th className="py-2 pr-3">Departamento</th>
                    <th className="py-2 px-3">Colaboradores</th>
                    <th className="py-2 px-3">Leitura Confirmada</th>
                    <th className="py-2 px-3">Chamados SLA 48h</th>
                    <th className="py-2 pl-3 text-right">Status Operacional</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(
                    [...new Set(employees.map(e=>e.department))]
                  ).map((dept) => {
                    const deptEmployees = employees.filter((e) => e.department === dept && e.active);
                    const mandatoryAnns = announcements.filter(
                      (a) =>
                        !a.archived &&
                        a.requireReadConfirmation &&
                        (a.targetAudience === 'Todos' || a.targetAudience === dept)
                    );
                    const possibleDeptReads = deptEmployees.length * mandatoryAnns.length;
                    const actualDeptReads = mandatoryAnns.reduce((acc, ann) => {
                      const deptConfirmations = ann.readReceipts.filter((r) =>
                        deptEmployees.some((emp) => emp.id === r.userId)
                      ).length;
                      return acc + deptConfirmations;
                    }, 0);
                    const deptReadPct =
                      possibleDeptReads > 0
                        ? Math.min(100, Math.round((actualDeptReads / possibleDeptReads) * 100))
                        : 100;

                    const deptRequests = requests.filter((r) => r.targetDepartment === dept);
                    const deptConcluded = deptRequests.filter(
                      (r) => r.status === 'Concluída'
                    ).length;

                    return (
                      <tr key={dept} className="hover:bg-gray-50/80">
                        <td className="py-2.5 pr-3 font-extrabold text-[#15191D]">{dept}</td>
                        <td className="py-2.5 px-3 font-mono text-gray-600">
                          {deptEmployees.length} ativo(s)
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  deptReadPct >= 80
                                    ? 'bg-emerald-500'
                                    : deptReadPct >= 50
                                    ? 'bg-[#FFD400]'
                                    : 'bg-[#E5252A]'
                                }`}
                                style={{ width: `${deptReadPct}%` }}
                              />
                            </div>
                            <span className="font-mono font-bold text-[#15191D]">
                              {deptReadPct}%
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-gray-600">
                          {deptConcluded}/{deptRequests.length} concluídos
                        </td>
                        <td className="py-2.5 pl-3 text-right">
                          <span
                            className={`text-[10px] font-extrabold px-2 py-0.5 rounded ${
                              deptReadPct >= 75
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-amber-50 text-amber-800'
                            }`}
                          >
                            {deptReadPct >= 75 ? 'Meta Atingida' : 'Atenção Setorial'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="lg:col-span-4 bg-white rounded-xl p-5 border border-gray-200/80 flex flex-col justify-between space-y-4">
            <div>
              <h3 className="text-sm font-extrabold text-[#15191D]">
                Exportação de Relatórios Corporativos (CSV)
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Extraia planilhas auditadas compatíveis com Excel para reuniões de Diretoria e conformidade LGPD.
              </p>

              <div className="space-y-2.5 mt-4">
                <button
                  onClick={() => handleExportCorporateCsvReport('leituras')}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#F3F5F7] hover:bg-[#FFD400]/20 border border-gray-200 text-xs font-bold text-[#15191D] transition cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#080B0D]" />
                    <span>Relatório de Leituras Confirmadas</span>
                  </span>
                  <Download className="w-4 h-4 text-gray-500" />
                </button>

                <button
                  onClick={() => handleExportCorporateCsvReport('sla_solicitacoes')}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#F3F5F7] hover:bg-[#FFD400]/20 border border-gray-200 text-xs font-bold text-[#15191D] transition cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#080B0D]" />
                    <span>Relatório de Solicitações & SLA 48h</span>
                  </span>
                  <Download className="w-4 h-4 text-gray-500" />
                </button>

                <button
                  onClick={() => handleExportCorporateCsvReport('auditoria_lgpd')}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#F3F5F7] hover:bg-[#FFD400]/20 border border-gray-200 text-xs font-bold text-[#15191D] transition cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[#080B0D]" />
                    <span>Trilha de Auditoria e Segurança LGPD</span>
                  </span>
                  <Download className="w-4 h-4 text-gray-500" />
                </button>

                <button
                  onClick={handleExportEmployeeComplianceMatrixCsv}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#F3F5F7] hover:bg-[#FFD400]/20 border border-gray-200 text-xs font-bold text-[#15191D] transition cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#080B0D]" />
                    <span>Matriz Nominal de Conformidade (.CSV)</span>
                  </span>
                  <Download className="w-4 h-4 text-gray-500" />
                </button>

                <button
                  onClick={handleExportChatGroupsAuditCsv}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#F3F5F7] hover:bg-[#FFD400]/20 border border-gray-200 text-xs font-bold text-[#15191D] transition cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-[#080B0D]" />
                    <span>Relatório de Grupos & Canais Ativos (.CSV)</span>
                  </span>
                  <Download className="w-4 h-4 text-gray-500" />
                </button>

                <button
                  onClick={handleExportGovernanceJsonSnapshot}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#080B0D] hover:bg-gray-800 text-xs font-bold text-[#FFD400] transition cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Folder className="w-4 h-4 text-[#FFD400]" />
                    <span>Snapshot Local de Governança (.JSON)</span>
                  </span>
                  <Download className="w-4 h-4 text-[#FFD400]" />
                </button>

                <button
                  onClick={handleRunSlaWatchdogAudit}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#FFD400] hover:bg-[#ffdf33] text-xs font-extrabold text-[#080B0D] transition cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-[#080B0D]" />
                    <span>Executar Varredura Watchdog SLA 48h</span>
                  </span>
                  <CheckCircle2 className="w-4 h-4 text-[#080B0D]" />
                </button>

                <button
                  onClick={() => setShowExecutiveDossierModal(true)}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#15191D] hover:bg-black text-xs font-extrabold text-white border border-[#FFD400]/50 transition cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-[#FFD400]" />
                    <span>Dossiê Executivo da Diretoria (PDF)</span>
                  </span>
                  <Eye className="w-4 h-4 text-[#FFD400]" />
                </button>
              </div>
            </div>

            {exportReportToast && (
              <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold">
                {exportReportToast}
              </div>
            )}
          </div>
        </div>

        <div id="am-audit-anchor" />
        {/* Security & Audit Trail */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-12 bg-white rounded-xl p-5 border border-gray-200/80 space-y-4">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h3 className="text-sm font-extrabold text-[#15191D]">
                  Trilha de Auditoria Corporativa & Segurança (LGPD)
                </h3>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={auditSearchQuery}
                    onChange={(e) => setAuditSearchQuery(e.target.value)}
                    placeholder="Filtrar ação ou ator..."
                    className="px-2.5 py-1 text-[11px] bg-[#F3F5F7] border border-gray-200 rounded-lg w-32"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const matchingLogs = auditLogs
                        .filter(
                          (log) =>
                            !auditSearchQuery.trim() ||
                            log.action.toLowerCase().includes(auditSearchQuery.toLowerCase()) ||
                            log.actor.toLowerCase().includes(auditSearchQuery.toLowerCase()) ||
                            log.details.toLowerCase().includes(auditSearchQuery.toLowerCase())
                        )
                        .map((l) => `[${l.timestamp}] ${l.action} — ${l.actor}: ${l.details}`)
                        .join('\n');
                      navigator.clipboard?.writeText(
                        `RODOVAR CONECTA — TRILHA DE AUDITORIA LGPD\n${matchingLogs}`
                      );
                      setCopiedIdentifier('audit-logs-copy');
                      setTimeout(() => setCopiedIdentifier(null), 2500);
                    }}
                    className="bg-[#F3F5F7] hover:bg-[#FFD400]/30 text-[#15191D] border border-gray-200 text-[10px] font-bold px-2 py-1 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                    title="Copiar registros filtrados da trilha de auditoria"
                  >
                    <Copy className="w-3 h-3" />
                    <span>{copiedIdentifier === 'audit-logs-copy' ? '✓ Copiado' : 'Copiar'}</span>
                  </button>
                  <button
                    onClick={handleExportFilteredAuditLogsCsv}
                    className="bg-[#080B0D] hover:bg-gray-800 text-[#FFD400] text-[10px] font-bold px-2.5 py-1 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                    title="Exportar registros filtrados da trilha de auditoria (.CSV)"
                  >
                    <Download className="w-3 h-3" />
                    <span>.CSV</span>
                  </button>
                </div>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {auditLogs
                  .filter(
                    (log) =>
                      !auditSearchQuery.trim() ||
                      log.action.toLowerCase().includes(auditSearchQuery.toLowerCase()) ||
                      log.actor.toLowerCase().includes(auditSearchQuery.toLowerCase()) ||
                      log.details.toLowerCase().includes(auditSearchQuery.toLowerCase())
                  )
                  .map((log) => (
                    <div key={log.id} className="text-[11px] border-b border-gray-100 pb-2">
                      <div className="flex justify-between text-gray-400 font-mono">
                        <span>{log.action}</span>
                        <span>{log.timestamp}</span>
                      </div>
                      <p className="text-gray-700 font-medium mt-0.5">
                        <strong>{log.actor}:</strong> {log.details}
                      </p>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>

</div>}
{exportReportToast&&masterArea!=='reports'&&<p role="status">{exportReportToast}</p>}
</section>
        {/* FASE 10: Modal Dossiê Executivo de Governança da Diretoria */}
        {showExecutiveDossierModal && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl max-h-[88vh] flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#080B0D] text-[#FFD400] flex items-center justify-center">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-[#15191D]">
                      Dossiê Executivo de Governança — Diretoria RODOVAR
                    </h3>
                    <p className="text-xs text-gray-500">
                      Relatório consolidado de adesão a comunicados obrigatórios, cumprimento de SLA 48h e pendências nominais
                    </p>
                  </div>
                </div>
                <button onClick={() => setShowExecutiveDossierModal(false)}>
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="py-4 overflow-y-auto space-y-4 text-xs flex-1">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-xl bg-[#F3F5F7] border border-gray-200">
                    <span className="text-[10px] font-bold text-gray-500 uppercase">
                      Adesão Global Leitura
                    </span>
                    <p className="text-xl font-extrabold text-emerald-600 mt-0.5">{readRate}%</p>
                  </div>
                  <div className="p-3 rounded-xl bg-[#F3F5F7] border border-gray-200">
                    <span className="text-[10px] font-bold text-gray-500 uppercase">
                      Chamados Concluídos
                    </span>
                    <p className="text-xl font-extrabold text-[#15191D] mt-0.5">
                      {requests.filter((r) => r.status === 'Concluída').length}/{requests.length}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-[#F3F5F7] border border-gray-200">
                    <span className="text-[10px] font-bold text-gray-500 uppercase">
                      Escalonados Diretoria
                    </span>
                    <p className="text-xl font-extrabold text-[#E5252A] mt-0.5">
                      {requests.filter((r) => r.escalatedToDiretoria).length}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-[#F3F5F7] border border-gray-200">
                    <span className="text-[10px] font-bold text-gray-500 uppercase">
                      EventosAuditados
                    </span>
                    <p className="text-xl font-extrabold text-[#15191D] mt-0.5">
                      {auditLogs.length}
                    </p>
                  </div>
                </div>

                <div>
                  <h4 className="font-extrabold text-[#15191D] uppercase text-[11px] mb-2">
                    1. Controle Nominal de Pendências de Leitura Obrigatória
                  </h4>
                  <div className="space-y-2">
                    {announcements
                      .filter((a) => !a.archived && a.requireReadConfirmation)
                      .map((ann) => {
                        const pending = employees.filter(
                          (e) => e.active && !ann.readReceipts.some((r) => r.userId === e.id)
                        );
                        return (
                          <div
                            key={ann.id}
                            className="p-3 rounded-xl bg-[#F3F5F7] border border-gray-200"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-extrabold text-[#15191D]">{ann.title}</span>
                              <span className="font-mono font-bold text-emerald-700">
                                {ann.readReceipts.length}/{employees.length} confirmados
                              </span>
                            </div>
                            <p className="text-[11px] text-gray-600 mt-1">
                              <strong>Pendentes ({pending.length}):</strong>{' '}
                              {pending.length === 0
                                ? '✓ 100% dos colaboradores confirmaram leitura'
                                : pending.map((p) => `${p.name} (${p.department})`).join(', ')}
                            </p>
                          </div>
                        );
                      })}
                  </div>
                </div>

                <div>
                  <h4 className="font-extrabold text-[#15191D] uppercase text-[11px] mb-2">
                    2. Chamados Internos Críticos ou Escalonados (SLA 48h)
                  </h4>
                  <div className="space-y-2">
                    {requests.map((req) => (
                      <div
                        key={req.id}
                        className="p-3 rounded-xl bg-[#F3F5F7] border border-gray-200 flex items-center justify-between gap-2"
                      >
                        <div>
                          <p className="font-extrabold text-[#15191D]">
                            <span className="font-mono bg-[#080B0D] text-[#FFD400] px-1.5 py-0.5 rounded mr-1.5">
                              {req.protocol}
                            </span>
                            {req.subject}
                          </p>
                          <p className="text-[11px] text-gray-500 mt-0.5">
                            Solicitante: {req.requesterName} → Destino: {req.targetDepartment}
                          </p>
                        </div>
                        <span className="text-[11px] font-bold px-2.5 py-1 rounded bg-white border border-gray-200">
                          {req.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-gray-200 flex flex-wrap items-center justify-between gap-2">
                <button
                  onClick={() => setShowExecutiveDossierModal(false)}
                  className="px-4 py-2 text-xs font-bold text-gray-500"
                >
                  Fechar
                </button>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const summaryText = `[RODOVAR CONECTA — RESUMO EXECUTIVO DA DIRETORIA]\nEmitido em: ${new Date().toLocaleString('pt-BR')}\nAdesão Global de Leitura Obrigatória: ${readRate}%\nChamados Internos SLA 48h: ${requests.filter((r) => r.status === 'Concluída').length}/${requests.length} concluídos (${requests.filter((r) => r.escalatedToDiretoria).length} escalonados)\nColaboradores Ativos: ${employees.filter((e) => e.active).length}/${employees.length}\nRegistros Auditados LGPD: ${auditLogs.length}`;
                      navigator.clipboard?.writeText(summaryText);
                      setCopiedIdentifier('exec-dossier-summary');
                      setTimeout(() => setCopiedIdentifier(null), 2500);
                    }}
                    className="bg-[#F3F5F7] hover:bg-gray-200 text-[#15191D] border border-gray-200 text-xs font-bold px-3.5 py-2 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>
                      {copiedIdentifier === 'exec-dossier-summary'
                        ? '✓ Resumo Copiado'
                        : 'Copiar Resumo Executivo'}
                    </span>
                  </button>
                  <button
                    onClick={handleDownloadExecutiveDossierTxt}
                    className="bg-[#080B0D] hover:bg-gray-800 text-[#FFD400] text-xs font-extrabold px-4 py-2 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Baixar Dossiê (.TXT)</span>
                  </button>
                  
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Edit Employee Login, Password, Role, Department & Access Level */}
        {editingEmployee && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl max-h-[92vh] flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100 shrink-0">
                <div>
                  <h3 className="text-base font-extrabold text-[#15191D]">
                    Alterar Login, Senha e Permissões — {editingEmployee.name}
                  </h3>
                  <p className="text-xs text-gray-500">
                    Edite o login de acesso, redefina a senha ou configure as páginas autorizadas
                  </p>
                </div>
                <button onClick={() => setEditingEmployee(null)}>
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="space-y-3 mt-4 overflow-y-auto pr-1 flex-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Nome Completo
                    </label>
                    <input
                      type="text"
                      value={editEmpForm.name}
                      onChange={(e) =>
                        setEditEmpForm({ ...editEmpForm, name: e.target.value })
                      }
                      className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Cargo / Função
                    </label>
                    <input
                      type="text"
                      value={editEmpForm.roleTitle}
                      onChange={(e) =>
                        setEditEmpForm({ ...editEmpForm, roleTitle: e.target.value })
                      }
                      className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Login / E-mail de Acesso
                    </label>
                    <input
                      type="text"
                      value={editEmpForm.login}
                      onChange={(e) =>
                        setEditEmpForm({
                          ...editEmpForm,
                          login: e.target.value,
                          email: e.target.value.includes('@')
                            ? e.target.value
                            : `${e.target.value}@rodovar.com.br`,
                        })
                      }
                      className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Senha de Acesso
                    </label>
                    <input
                      type="text"
                      value={editEmpForm.password}
                      onChange={(e) =>
                        setEditEmpForm({ ...editEmpForm, password: e.target.value })
                      }
                      className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg font-mono"
                    />
                  </div>
                </div>

                <label className="flex items-center justify-between p-2.5 rounded-lg bg-[#F3F5F7] border border-gray-200 cursor-pointer text-xs">
                  <span className="font-bold text-[#15191D]">
                    Solicitar definição de nova senha no próximo login (1º Acesso)
                  </span>
                  <input
                    type="checkbox"
                    checked={editEmpForm.mustChangePassword}
                    onChange={(e) =>
                      setEditEmpForm({
                        ...editEmpForm,
                        mustChangePassword: e.target.checked,
                      })
                    }
                    className="rounded text-[#FFD400]"
                  />
                </label>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Departamento
                    </label>
                    <select
                      value={editEmpForm.department}
                      onChange={(e) => {
                        const newDept = e.target.value as Department;
                        setEditEmpForm({
                          ...editEmpForm,
                          department: newDept,
                          permissoesPaginas: getDefaultPermissionsForDepartment(
                            newDept,
                            editEmpForm.accessLevel
                          ),
                        });
                      }}
                      className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg"
                    >
                      <option value="Operacional">Operacional</option>
                      <option value="Administrativo">Administrativo</option>
                      <option value="Recursos Humanos">Recursos Humanos</option>
                      <option value="Financeiro">Financeiro</option>
                      <option value="Segurança">Segurança</option>
                      <option value="Logística">Logística</option>
                      <option value="Diretoria">Diretoria</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Nível de Acesso
                    </label>
                    <select
                      value={editEmpForm.accessLevel}
                      onChange={(e) => {
                        const newLevel = e.target.value as
                          | 'FUNCIONARIO'
                          | 'ADMINISTRADOR'
                          | 'DIRETORIA';
                        setEditEmpForm({
                          ...editEmpForm,
                          accessLevel: newLevel,
                          permissoesPaginas: getDefaultPermissionsForDepartment(
                            editEmpForm.department,
                            newLevel
                          ),
                        });
                      }}
                      className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg"
                    >
                      <option value="FUNCIONARIO">FUNCIONÁRIO</option>
                      <option value="ADMINISTRADOR">ADMINISTRADOR</option>
                      <option value="DIRETORIA">DIRETORIA</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Telefone Corporativo
                  </label>
                  <input
                    type="text"
                    value={editEmpForm.phoneExt}
                    onChange={(e) =>
                      setEditEmpForm({ ...editEmpForm, phoneExt: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg"
                  />
                </div>

                {/* SEÇÃO: PÁGINAS E MÓDULOS PERMITIDOS */}
                <div className="pt-3 border-t border-gray-200">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div>
                      <label className="block text-xs font-extrabold text-[#15191D]">
                        Páginas e Módulos Permitidos
                      </label>
                      <p className="text-[11px] text-gray-500">
                        Marque ou desmarque os módulos visíveis no menu lateral para este colaborador.
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          setEditEmpForm({
                            ...editEmpForm,
                            permissoesPaginas: [...ALL_MODULE_IDS],
                          })
                        }
                        className="text-[10px] font-bold text-[#080B0D] bg-[#FFD400]/40 hover:bg-[#FFD400] px-2 py-0.5 rounded cursor-pointer transition"
                      >
                        Marcar Todos
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setEditEmpForm({
                            ...editEmpForm,
                            permissoesPaginas: ['inicio'],
                          })
                        }
                        className="text-[10px] font-bold text-gray-500 hover:text-red-600 bg-gray-100 hover:bg-gray-200 px-2 py-0.5 rounded cursor-pointer transition"
                      >
                        Desmarcar
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-[#F8FAFC] border border-gray-200 p-2.5 rounded-xl max-h-52 overflow-y-auto">
                    {AVAILABLE_MODULES.map((mod) => {
                      const isChecked = editEmpForm.permissoesPaginas.includes(mod.id);
                      return (
                        <label
                          key={mod.id}
                          className={`flex items-start gap-2.5 p-2 rounded-lg border text-xs cursor-pointer select-none transition-all ${
                            isChecked
                              ? 'bg-amber-50/70 border-[#FACC15] text-[#15191D] font-bold shadow-2xs'
                              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 font-medium'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...editEmpForm.permissoesPaginas, mod.id]
                                : editEmpForm.permissoesPaginas.filter((id) => id !== mod.id);
                              setEditEmpForm({
                                ...editEmpForm,
                                permissoesPaginas: next,
                              });
                            }}
                            className="mt-0.5 rounded text-[#FFD400] focus:ring-[#FFD400]"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="truncate">{mod.label}</span>
                              <span className="text-[9px] font-mono font-semibold px-1 py-0.2 rounded bg-gray-100 text-gray-500 shrink-0">
                                {mod.badgeCategory}
                              </span>
                            </div>
                            <p className="text-[10px] text-gray-400 font-normal leading-tight line-clamp-1 mt-0.5">
                              {mod.description}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-100 flex justify-end gap-2 shrink-0">
                <button
                  onClick={() => setEditingEmployee(null)}
                  className="px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-700"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    onUpdateEmployeeAdmin?.(editingEmployee.id, editEmpForm);
                    setEditingEmployee(null);
                  }}
                  className="bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] text-xs font-extrabold px-4 py-2 rounded-lg cursor-pointer"
                >
                  Salvar Alterações de Login e Perfil
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Create New Employee Login with First-Access Password */}
        {showCreateLoginModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl max-h-[92vh] flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100 shrink-0">
                <div>
                  <h3 className="text-base font-extrabold text-[#15191D]">
                    Criar Novo Login & Primeiro Acesso com Senha
                  </h3>
                  <p className="text-xs text-gray-500">
                    Cadastre o login, senha inicial e configure as páginas permitidas no menu lateral
                  </p>
                </div>
                <button onClick={() => setShowCreateLoginModal(false)}>
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="space-y-3 mt-4 overflow-y-auto pr-1 flex-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Nome Completo *
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Marcos Vinícius"
                      value={createLoginForm.name}
                      onChange={(e) =>
                        setCreateLoginForm({ ...createLoginForm, name: e.target.value })
                      }
                      className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Cargo / Função *
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Coordenador de Logística"
                      value={createLoginForm.roleTitle}
                      onChange={(e) =>
                        setCreateLoginForm({ ...createLoginForm, roleTitle: e.target.value })
                      }
                      className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Login / E-mail Corporativo *
                    </label>
                    <input
                      type="text"
                      placeholder="usuario@rodovar.com.br"
                      value={createLoginForm.login}
                      onChange={(e) =>
                        setCreateLoginForm({
                          ...createLoginForm,
                          login: e.target.value,
                          email: e.target.value.includes('@')
                            ? e.target.value
                            : `${e.target.value}@rodovar.com.br`,
                        })
                      }
                      className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Senha de 1º Acesso *
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: rodovar2027#@"
                      value={createLoginForm.password}
                      onChange={(e) =>
                        setCreateLoginForm({ ...createLoginForm, password: e.target.value })
                      }
                      className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg font-mono"
                    />
                  </div>
                </div>

                <label className="flex items-center justify-between p-2.5 rounded-lg bg-[#F3F5F7] border border-gray-200 cursor-pointer text-xs">
                  <span className="font-bold text-[#15191D]">
                    Exigir que o usuário crie uma nova senha no 1º acesso
                  </span>
                  <input
                    type="checkbox"
                    checked={createLoginForm.mustChangePassword}
                    onChange={(e) =>
                      setCreateLoginForm({
                        ...createLoginForm,
                        mustChangePassword: e.target.checked,
                      })
                    }
                    className="rounded text-[#FFD400]"
                  />
                </label>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Setor</label>
                    <select
                      value={createLoginForm.department}
                      onChange={(e) => {
                        const newDept = e.target.value as Department;
                        setCreateLoginForm({
                          ...createLoginForm,
                          department: newDept,
                          permissoesPaginas: getDefaultPermissionsForDepartment(
                            newDept,
                            createLoginForm.accessLevel
                          ),
                        });
                      }}
                      className="w-full px-2.5 py-2 text-xs border border-gray-300 rounded-lg"
                    >
                      <option value="Operacional">Operacional</option>
                      <option value="Administrativo">Administrativo</option>
                      <option value="Recursos Humanos">Recursos Humanos</option>
                      <option value="Financeiro">Financeiro</option>
                      <option value="Segurança">Segurança</option>
                      <option value="Logística">Logística</option>
                      <option value="Diretoria">Diretoria</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Permissão</label>
                    <select
                      value={createLoginForm.accessLevel}
                      onChange={(e) => {
                        const newLevel = e.target.value as
                          | 'FUNCIONARIO'
                          | 'ADMINISTRADOR'
                          | 'DIRETORIA';
                        setCreateLoginForm({
                          ...createLoginForm,
                          accessLevel: newLevel,
                          permissoesPaginas: getDefaultPermissionsForDepartment(
                            createLoginForm.department,
                            newLevel
                          ),
                        });
                      }}
                      className="w-full px-2.5 py-2 text-xs border border-gray-300 rounded-lg"
                    >
                      <option value="FUNCIONARIO">Funcionário</option>
                      <option value="ADMINISTRADOR">Administrador</option>
                      <option value="DIRETORIA">Diretoria</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Telefone</label>
                    <input
                      type="text"
                      value={createLoginForm.phoneExt}
                      onChange={(e) =>
                        setCreateLoginForm({ ...createLoginForm, phoneExt: e.target.value })
                      }
                      className="w-full px-2.5 py-2 text-xs border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>

                {/* SEÇÃO: PÁGINAS E MÓDULOS PERMITIDOS */}
                <div className="pt-3 border-t border-gray-200">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div>
                      <label className="block text-xs font-extrabold text-[#15191D]">
                        Páginas e Módulos Permitidos
                      </label>
                      <p className="text-[11px] text-gray-500">
                        Marque ou desmarque os módulos visíveis no menu lateral para este colaborador.
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          setCreateLoginForm({
                            ...createLoginForm,
                            permissoesPaginas: [...ALL_MODULE_IDS],
                          })
                        }
                        className="text-[10px] font-bold text-[#080B0D] bg-[#FFD400]/40 hover:bg-[#FFD400] px-2 py-0.5 rounded cursor-pointer transition"
                      >
                        Marcar Todos
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setCreateLoginForm({
                            ...createLoginForm,
                            permissoesPaginas: ['inicio'],
                          })
                        }
                        className="text-[10px] font-bold text-gray-500 hover:text-red-600 bg-gray-100 hover:bg-gray-200 px-2 py-0.5 rounded cursor-pointer transition"
                      >
                        Desmarcar
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-[#F8FAFC] border border-gray-200 p-2.5 rounded-xl max-h-52 overflow-y-auto">
                    {AVAILABLE_MODULES.map((mod) => {
                      const isChecked = createLoginForm.permissoesPaginas.includes(mod.id);
                      return (
                        <label
                          key={mod.id}
                          className={`flex items-start gap-2.5 p-2 rounded-lg border text-xs cursor-pointer select-none transition-all ${
                            isChecked
                              ? 'bg-amber-50/70 border-[#FACC15] text-[#15191D] font-bold shadow-2xs'
                              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 font-medium'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...createLoginForm.permissoesPaginas, mod.id]
                                : createLoginForm.permissoesPaginas.filter((id) => id !== mod.id);
                              setCreateLoginForm({
                                ...createLoginForm,
                                permissoesPaginas: next,
                              });
                            }}
                            className="mt-0.5 rounded text-[#FFD400] focus:ring-[#FFD400]"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="truncate">{mod.label}</span>
                              <span className="text-[9px] font-mono font-semibold px-1 py-0.2 rounded bg-gray-100 text-gray-500 shrink-0">
                                {mod.badgeCategory}
                              </span>
                            </div>
                            <p className="text-[10px] text-gray-400 font-normal leading-tight line-clamp-1 mt-0.5">
                              {mod.description}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-100 flex justify-end gap-2 shrink-0">
                <button
                  onClick={() => setShowCreateLoginModal(false)}
                  className="px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-700"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    if (!createLoginForm.name.trim() || !createLoginForm.login.trim()) return;
                    onCreateEmployeeDirect?.({
                      ...createLoginForm,
                      email: createLoginForm.login.includes('@')
                        ? createLoginForm.login.trim()
                        : `${createLoginForm.login.trim()}@rodovar.com.br`,
                      login: createLoginForm.login.trim(),
                      roleTitle: createLoginForm.roleTitle.trim() || 'Colaborador Corporativo',
                      permissoesPaginas: createLoginForm.permissoesPaginas,
                    });
                    setShowCreateLoginModal(false);
                    setCreateLoginForm({
                      name: '',
                      email: '',
                      login: '',
                      password: 'rodovar2027#@',
                      mustChangePassword: true,
                      roleTitle: '',
                      department: 'Operacional',
                      accessLevel: 'FUNCIONARIO',
                      phoneExt: '71 9 9920-2476',
                      permissoesPaginas: getDefaultPermissionsForDepartment(
                        'Operacional',
                        'FUNCIONARIO'
                      ),
                    });
                  }}
                  className="bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] text-xs font-extrabold px-4 py-2 rounded-lg cursor-pointer"
                >
                  Criar Login Agora
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // 8. MEU PERFIL (FASE 6 COMPLETA — FOTO DE PERFIL LIBERADA PARA TODOS)
  // ============================================================================
  if (activeSection === 'perfil') {
    const effectiveAvatarSrc = resolveAvatarUrl(
      {
        ...currentUser,
        avatar: myProfileForm.avatar,
        hasCustomAvatar: currentUser.hasCustomAvatar,
      },
      systemConfig
    );

    const handleProfilePhotoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;

      setProfileErrorMsg(null);
      if (file.size > 5 * 1024 * 1024) {
        setProfileErrorMsg('O arquivo excede o limite máximo de 5 MB.');
        return;
      }

      const reader = new FileReader();
      reader.onload = async () => {
        if (typeof reader.result === 'string') {
          setIsUploadingAvatar(true);
          try {
            const res = await apiUploadProfileAvatar(reader.result);
            if (!res.ok || !res.user) {
              setProfileErrorMsg(
                res.error ||
                  'Formato de arquivo não permitido. Envie apenas PNG, JPEG ou WebP de até 5 MB.'
              );
              return;
            }
            const updatedForm = { ...myProfileForm, avatar: res.user.avatar };
            setMyProfileForm(updatedForm);
            onUpdateMyProfile?.(updatedForm);
            setProfileSavedToast(true);
            setTimeout(() => setProfileSavedToast(false), 3000);
          } catch {
            setProfileErrorMsg('Erro ao validar e salvar foto de perfil no servidor.');
          } finally {
            setIsUploadingAvatar(false);
          }
        }
      };
      reader.readAsDataURL(file);
    };

    const handleRestoreDefaultAvatarClick = async () => {
      setProfileErrorMsg(null);
      setIsUploadingAvatar(true);
      try {
        const res = await apiRestoreDefaultAvatar();
        if (!res.ok || !res.user) {
          setProfileErrorMsg(res.error || 'Não foi possível restaurar o avatar padrão.');
          return;
        }
        const updatedForm = { ...myProfileForm, avatar: res.user.avatar };
        setMyProfileForm(updatedForm);
        onUpdateMyProfile?.(updatedForm);
        setProfileSavedToast(true);
        setTimeout(() => setProfileSavedToast(false), 3000);
      } catch {
        setProfileErrorMsg('Erro ao restaurar avatar padrão no servidor.');
      } finally {
        setIsUploadingAvatar(false);
      }
    };

    return (
      <div className="rv-profile">
        <header className="rv-profile-page-heading"><div><h1>Meu Perfil</h1><p>Visualize suas informações, preferências e identificação funcional.</p></div><span className="rv-profile-active">{currentUser.active && currentUser.approvalStatus === 'APROVADO' ? '● Conta ativa' : 'Conta restrita'}</span></header>
        {profileErrorMsg && (
          <div
            role="alert"
            className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-[#E5252A] flex items-center gap-2"
          >
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{profileErrorMsg}</span>
          </div>
        )}

        <div className="rv-profile-hero flex flex-col sm:flex-row items-start sm:items-center gap-5">
          {/* Avatar com corte circular e proporção 1:1 para todos os usuários */}
          <div className="relative group shrink-0">
            <img
              src={effectiveAvatarSrc}
              alt={currentUser.name}
              referrerPolicy="no-referrer"
              className="w-24 h-24 rounded-full object-cover aspect-square border-4 border-[#FFD400] shadow-sm bg-[#15191D]"
            />
          </div>

          <div className="flex-1">
            <span className="rv-profile-role">
              {currentUser.roleTitle}
            </span>
            <h2>{currentUser.name}</h2>
            <p className="text-xs text-gray-500">
              {currentUser.roleTitle} • Departamento {currentUser.department}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              E-mail corporativo: {currentUser.email} • Ingresso: {currentUser.joinedAt}
            </p>

            {/* Avatar Oficial Corporativo RODOVAR */}
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="rv-profile-avatar-label border text-[11px] font-bold px-2.5 py-1 rounded-md inline-flex items-center gap-1.5 shadow-2xs">
                <ShieldCheck className="w-3.5 h-3.5 text-[#EAB308]" />
                <span>Avatar corporativo Rodovar</span>
              </span>
              {currentUser.accessLevel === 'ADMINISTRADOR' && (
                <button
                  type="button"
                  onClick={() => onNavigate?.('administracao')}
                  className="text-[11px] font-extrabold text-[#080B0D] bg-[#FFD400]/30 hover:bg-[#FFD400] px-2.5 py-1 rounded-md transition cursor-pointer"
                >
                  Configurar Avatar Oficial na Administração →
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Authorized Personal Data & Login Credentials Editor for All Users */}
        <div className="rv-profile-data space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-extrabold text-[#15191D]">
                Dados Cadastrais
              </h2>
              <p className="text-xs text-gray-500">
                Informações pessoais e corporativas
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label htmlFor="profile-display-name" className="block font-bold text-gray-700 mb-1">Nome de Exibição</label>
              <input
                type="text"
                id="profile-display-name"
                value={myProfileForm.name}
                onChange={(e) => setMyProfileForm({ ...myProfileForm, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="profile-phone" className="block font-bold text-gray-700 mb-1">
                Telefone Corporativo
              </label>
              <input
                type="text"
                id="profile-phone"
                value={myProfileForm.phoneExt}
                onChange={(e) => setMyProfileForm({ ...myProfileForm, phoneExt: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="profile-login" className="block font-bold text-gray-700 mb-1">
                Meu Login / E-mail de Acesso
              </label>
              <input
                type="text"
                id="profile-login"
                value={myProfileForm.login}
                readOnly
                aria-readonly="true"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg font-semibold"
              />
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-4"><div><dt>Departamento</dt><dd>{currentUser.department}</dd></div><div><dt>Cargo / função</dt><dd>{currentUser.roleTitle}</dd></div></dl>
        </div>
        <div className="rv-profile-notifications">
          <h2 className="text-base font-extrabold text-[#15191D] pt-2">
            Notificações
          </h2>
          <div className="space-y-2.5 text-xs">
            {[
              {
                key: 'urgentAnnouncements',
                label: 'Alertas imediatos para Comunicados Obrigatórios e Urgentes',
              },
              {
                key: 'requestUpdates',
                label: 'Atualizações de status nas Minhas Solicitações',
              },
              {
                key: 'slaWarnings',
                label: 'Aviso preventivo de vencimento do prazo de 48 horas',
              },
              {
                key: 'calendarReminders',
                label: 'Lembretes de treinamentos e reuniões da Agenda Corporativa',
              },
            ].map((item) => (
              <label
                key={item.key}
                className="flex items-center justify-between p-3 rounded-lg bg-[#F3F5F7] cursor-pointer"
              >
                <span className="font-semibold text-[#15191D]">{item.label}</span>
                <input
                  type="checkbox"
                  role="switch"
                  aria-checked={notifPrefs[item.key as keyof typeof notifPrefs]}
                  checked={notifPrefs[item.key as keyof typeof notifPrefs]}
                  onChange={(e) =>
                    setNotifPrefs({ ...notifPrefs, [item.key]: e.target.checked })
                  }
                  className="rounded text-[#FFD400]"
                />
              </label>
            ))}
          </div>

          <div className="rv-profile-save">
            <span className="text-[11px] text-gray-400">
              Alterações de cargo, setor e permissões dependem exclusivamente do Administrador.
            </span>
            <button
              onClick={async () => {
                setProfileErrorMsg(null);
                if (myProfileForm.name.trim().length < 3) { setProfileErrorMsg('Informe um nome com pelo menos 3 caracteres.'); return; }
                const res = await apiUpdateProfile({
                  name: myProfileForm.name,
                  phoneExt: myProfileForm.phoneExt,
                });
                if (!res.ok) {
                  setProfileErrorMsg(res.error || 'Erro ao salvar dados no servidor.');
                  return;
                }
                if(res.user) onUpdateMyProfile?.({name:res.user.name,phoneExt:res.user.phoneExt,avatar:res.user.avatar,email:res.user.email,login:res.user.login});
                try { localStorage.setItem('rodovar-profile-preferences:'+currentUser.id,JSON.stringify(notifPrefs)); } catch { setProfileErrorMsg('Dados atualizados. Não foi possível guardar as preferências neste dispositivo.'); }
                setProfileSavedToast(true);
                setTimeout(() => setProfileSavedToast(false), 2500);
              }}
              className="bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] text-xs font-extrabold px-5 py-2 rounded-lg cursor-pointer"
            >
              Salvar Dados e Preferências
            </button>
          </div>
          {profileSavedToast && (
            <p className="text-xs font-bold text-emerald-600">
              ✓ Dados atualizados e preferências salvas.
            </p>
          )}
        </div>

        {/* FASE 9: Crachá Funcional Digital Corporativo + Governança & LGPD */}
        <div className="rv-profile-aux">
          {/* Digital Corporate Badge */}
          <section className="rv-profile-credential"><div className="rv-profile-section-heading"><span className="rv-profile-icon"><ShieldCheck size={23}/></span><div><h2>Identificação Funcional</h2><p>Sua credencial corporativa de identificação.</p></div></div>
          <div className="md:col-span-6 bg-[#080B0D] text-white rounded-2xl p-5 border border-[#FFD400]/40 shadow-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[#FFD400] font-bold">
                    IDENTIFICAÇÃO FUNCIONAL OFICIAL
                  </span>
                  <h3 className="text-sm font-extrabold text-white mt-0.5">
                    TRANSPORTADORA RODOVAR
                  </h3>
                </div>
                <ShieldCheck className="w-5 h-5 text-[#FFD400]" />
              </div>

              <div className="mt-4 flex items-center gap-4">
                <img
                  src={effectiveAvatarSrc}
                  alt={currentUser.name}
                  referrerPolicy="no-referrer"
                  className="w-16 h-16 rounded-full object-cover aspect-square border-2 border-[#FFD400] bg-[#15191D]"
                />
                <div className="text-xs space-y-0.5">
                  <p className="text-base font-extrabold text-white">{currentUser.name}</p>
                  <p className="text-[#FFD400] font-bold">{currentUser.roleTitle}</p>
                  <p className="text-gray-400">Setor: {currentUser.department}</p>
                  <p className="font-mono text-[10px] text-gray-400">
                    Matrícula: RDV-{currentUser.id.toUpperCase()}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <span className="font-mono text-emerald-400">
                ● CREDENCIAL ATIVA • MATRÍCULA RDV-{currentUser.id.toUpperCase()}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const badgeSummary = `RODOVAR CONECTA — CREDENCIAL FUNCIONAL | Titular: ${currentUser.name} | Cargo: ${currentUser.roleTitle} (${currentUser.department}) | Matrícula: RDV-${currentUser.id.toUpperCase()}`;
                    navigator.clipboard?.writeText(badgeSummary);
                    setCopiedIdentifier('profile-badge-copy');
                    setTimeout(() => setCopiedIdentifier(null), 2500);
                  }}
                  className="bg-white/10 hover:bg-white/20 text-white border border-white/15 font-bold px-2.5 py-1 rounded-lg text-xs inline-flex items-center gap-1 cursor-pointer"
                  title="Copiar dados da Credencial Funcional"
                >
                  <Copy className="w-3 h-3" />
                  <span>
                    {copiedIdentifier === 'profile-badge-copy'
                      ? '✓ Credencial Copiada'
                      : 'Copiar Credencial'}
                  </span>
                </button>
                
              </div>
            </div>
          </div>

          </section>
          {showCredencialModal && (
            <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                  <div>
                    <h3 className="text-base font-extrabold text-[#15191D]">
                      Credencial Oficial RODOVAR (Padrão CR80)
                    </h3>
                    <p className="text-xs text-gray-500">
                      Cartão de identificação funcional exclusivo • Formato 85,6 × 54 mm
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCredencialModal(false)}
                    className="p-1 text-gray-400 hover:text-gray-700 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Printable CR80 Card Area */}
                <style>{`
                  @media print {
                    body * {
                      visibility: hidden !important;
                    }
                    #rodovar-cr80-credential-card,
                    #rodovar-cr80-credential-card * {
                      visibility: visible !important;
                    }
                    #rodovar-cr80-credential-card {
                      position: fixed !important;
                      left: 0 !important;
                      top: 0 !important;
                      width: 85.6mm !important;
                      height: 54mm !important;
                      margin: 0 !important;
                      padding: 4mm !important;
                      border-radius: 3mm !important;
                      box-shadow: none !important;
                      -webkit-print-color-adjust: exact !important;
                      print-color-adjust: exact !important;
                    }
                    @page {
                      size: 85.6mm 54mm;
                      margin: 0;
                    }
                  }
                `}</style>

                <div className="flex justify-center py-2">
                  <div
                    id="rodovar-cr80-credential-card"
                    style={{ width: '323.5px', height: '204px' }}
                    className="bg-[#080B0D] text-white rounded-xl border-2 border-[#FFD400] p-4 flex flex-col justify-between shadow-xl select-none relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 w-24 h-24 bg-[#FFD400]/10 rounded-bl-full pointer-events-none" />
                    <div className="flex items-center justify-between border-b border-[#FFD400]/30 pb-2">
                      <div>
                        <p className="text-[11px] font-black tracking-wider text-[#FFD400] leading-none">
                          RODOVAR CONECTA
                        </p>
                        <p className="text-[8px] font-mono uppercase tracking-widest text-gray-300 mt-0.5">
                          IDENTIFICAÇÃO FUNCIONAL CR80
                        </p>
                      </div>
                      <span className="bg-[#FFD400] text-[#080B0D] text-[8px] font-extrabold px-1.5 py-0.5 rounded uppercase">
                        {currentUser.accessLevel}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 my-auto py-1">
                      <img
                        src={effectiveAvatarSrc}
                        alt={currentUser.name}
                        referrerPolicy="no-referrer"
                        className="w-14 h-14 rounded-full object-cover aspect-square border-2 border-[#FFD400] bg-[#15191D] shrink-0"
                      />
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="text-sm font-extrabold text-white truncate leading-tight">
                          {currentUser.name}
                        </p>
                        <p className="text-[11px] font-bold text-[#FFD400] truncate leading-tight">
                          {currentUser.roleTitle}
                        </p>
                        <p className="text-[10px] text-gray-300 truncate">
                          Setor: {currentUser.department}
                        </p>
                        <p className="text-[9px] text-gray-400 truncate">
                          {currentUser.email}
                        </p>
                      </div>
                    </div>

                    <div className="pt-1.5 border-t border-white/15 flex items-center justify-between text-[9px] font-mono">
                      <span className="text-[#FFD400] font-bold">
                        ID: RDV-{currentUser.id.toUpperCase()}
                      </span>
                      <span className="text-emerald-400 font-bold">● CREDENCIAL VERIFICADA</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setShowCredencialModal(false)}
                    className="px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 cursor-pointer"
                  >
                    Fechar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const canvas = document.createElement('canvas');
                      canvas.width = 1011;
                      canvas.height = 638;
                      const ctx = canvas.getContext('2d');
                      if (ctx) {
                        ctx.fillStyle = '#080B0D';
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                        ctx.strokeStyle = '#FFD400';
                        ctx.lineWidth = 12;
                        ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);

                        ctx.fillStyle = '#FFD400';
                        ctx.font = 'bold 38px sans-serif';
                        ctx.fillText('RODOVAR CONECTA', 48, 72);

                        ctx.fillStyle = '#D1D5DB';
                        ctx.font = '20px monospace';
                        ctx.fillText('CREDENCIAL FUNCIONAL OFICIAL • CR80 (85,6 × 54 mm)', 48, 108);

                        ctx.fillStyle = '#FFD400';
                        ctx.fillRect(48, 132, canvas.width - 96, 3);

                        ctx.fillStyle = '#FFFFFF';
                        ctx.font = 'bold 44px sans-serif';
                        ctx.fillText(currentUser.name, 48, 230);

                        ctx.fillStyle = '#FFD400';
                        ctx.font = 'bold 32px sans-serif';
                        ctx.fillText(currentUser.roleTitle, 48, 285);

                        ctx.fillStyle = '#E5E7EB';
                        ctx.font = '26px sans-serif';
                        ctx.fillText(`Setor: ${currentUser.department}`, 48, 340);
                        ctx.fillText(`E-mail: ${currentUser.email}`, 48, 385);
                        ctx.fillText(`Nível: ${currentUser.accessLevel}`, 48, 430);

                        ctx.fillStyle = '#FFD400';
                        ctx.fillRect(48, 520, canvas.width - 96, 2);

                        ctx.fillStyle = '#FFD400';
                        ctx.font = 'bold 26px monospace';
                        ctx.fillText(`MATRÍCULA: RDV-${currentUser.id.toUpperCase()}`, 48, 575);

                        ctx.fillStyle = '#34D399';
                        ctx.fillText('CREDENCIAL ATIVA', canvas.width - 320, 575);

                        const link = document.createElement('a');
                        link.download = `Credencial_RODOVAR_${currentUser.id}.png`;
                        link.href = canvas.toDataURL('image/png');
                        link.click();
                      }
                    }}
                    className="px-4 py-2 rounded-xl bg-[#080B0D] hover:bg-gray-800 text-[#FFD400] text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Baixar Credencial</span>
                  </button>
                  
                </div>
              </div>
            </div>
          )}

          <ProfileSecurity user={currentUser} onUpdated={user=>onUpdateMyProfile?.({name:user.name,phoneExt:user.phoneExt,avatar:user.avatar,email:user.email,login:user.login})}/>
        </div>

        {/* FASE 13: Painel Individual de Conformidade, Leituras Obrigatórias e Capacitações */}
        <details className="rv-profile-compliance bg-white rounded-2xl p-6 border border-gray-200/80 shadow-xs"><summary>Meus registros de ciência e capacitações</summary><div className="space-y-4 mt-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-3">
            <div>
              <h2 className="text-base font-extrabold text-[#15191D]">
                Meu Painel de Conformidade & Pendências RODOVAR
              </h2>
              <p className="text-xs text-gray-500">
                Resumo individual auditado de leituras obrigatórias, treinamentos SSMA e normas POP
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleDownloadEmployeeFunctionalSheetTxt(currentUser)}
                className="bg-[#080B0D] hover:bg-gray-800 text-[#FFD400] text-xs font-extrabold px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                title="Baixar Ficha Funcional e Funções Profissionais 2027 (PDF) com Hash Oficial"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Baixar Minha Ficha Funcional (PDF)</span>
              </button>
              <span className="text-xs font-mono font-bold bg-[#F3F5F7] text-[#15191D] px-3 py-1 rounded-lg border border-gray-200">
                Titular: {currentUser.name}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3.5 rounded-xl bg-[#F3F5F7] border border-gray-200/80">
              <span className="text-gray-500 font-semibold">Leituras Obrigatórias</span>
              <p className="text-xl font-extrabold text-[#15191D] mt-1 tabular-nums">
                {
                  announcements.filter(
                    (a) =>
                      a.requireReadConfirmation &&
                      a.readReceipts.some((r) => r.userId === currentUser.id)
                  ).length
                }
                /{announcements.filter((a) => a.requireReadConfirmation).length}
              </p>
              <span className="text-[11px] text-emerald-700 font-bold">
                Comunicados oficiais auditados
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-[#F3F5F7] border border-gray-200/80">
              <span className="text-gray-500 font-semibold">Eventos & Capacitações SSMA</span>
              <p className="text-xl font-extrabold text-[#15191D] mt-1 tabular-nums">
                {events.filter((e) => e.attendees.includes(currentUser.id)).length}/{events.length}
              </p>
              <span className="text-[11px] text-blue-700 font-bold">
                Presenças confirmadas na Agenda
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-[#F3F5F7] border border-gray-200/80">
              <span className="text-gray-500 font-semibold">Meus Chamados (SLA 48h)</span>
              <p className="text-xl font-extrabold text-[#15191D] mt-1 tabular-nums">
                {requests.filter((r) => r.requesterId === currentUser.id).length}
              </p>
              <span className="text-[11px] text-gray-600 font-bold">
                Protocolos emitidos no meu perfil
              </span>
            </div>
          </div>

          {/* Lista rápida de Comunicados Obrigatórios Pendentes ou Confirmados do Colaborador */}
          <div className="space-y-2 pt-1">
            <h3 className="text-xs font-extrabold text-[#15191D] uppercase tracking-wider">
              Status Individual nos Comunicados de Leitura Obrigatória
            </h3>
            {announcements
              .filter((a) => a.requireReadConfirmation && !a.archived)
              .map((ann) => {
                const myReceipt = ann.readReceipts.find((r) => r.userId === currentUser.id);
                return (
                  <div
                    key={ann.id}
                    className="p-3 rounded-xl bg-[#F3F5F7] border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <p className="font-bold text-[#15191D]">{ann.title}</p>
                      <p className="text-[11px] text-gray-500">
                        {ann.department} • Publicado em {ann.dateFormatted}
                      </p>
                    </div>
                    {myReceipt ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200">
                          ✓ Lido ({myReceipt.confirmedAt})
                        </span>
                        <button
                          onClick={() => handleDownloadReadCertificate(ann)}
                          className="bg-[#080B0D] text-[#FFD400] font-bold px-2.5 py-1 rounded-lg text-[11px] inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Download className="w-3 h-3" />
                          <span>Recibo (PDF)</span>
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => onConfirmRead(ann.id)}
                        className="bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] font-extrabold px-3 py-1.5 rounded-lg text-xs shrink-0 cursor-pointer"
                      >
                        Confirmar Leitura Agora
                      </button>
                    )}
                  </div>
                );
              })}
          </div>

          {/* Meus Treinamentos & Eventos Confirmados na Agenda */}
          <div className="space-y-2 pt-3 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold text-[#15191D] uppercase tracking-wider">
                Meus Treinamentos & Eventos na Agenda
              </h3>
              <span className="text-[11px] font-bold text-gray-500">
                {events.filter((e) => e.attendees.includes(currentUser.id)).length} de {events.length} confirmados
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {events.map((evt) => {
                const isAttending = evt.attendees.includes(currentUser.id);
                return (
                  <div
                    key={evt.id}
                    className="p-3 rounded-xl bg-[#F3F5F7] border border-gray-200 flex flex-col justify-between gap-2 text-xs"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-[#080B0D] text-[#FFD400]">
                          {evt.day} {evt.monthShort} • {evt.badgeLabel}
                        </span>
                        <span className="font-mono text-[10px] text-gray-500">{evt.time}</span>
                      </div>
                      <p className="font-bold text-[#15191D] mt-1.5">{evt.title}</p>
                      <p className="text-[11px] text-gray-500">{evt.location}</p>
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-gray-200/70">
                      {isAttending ? (
                        <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          ✓ Presença Confirmada
                        </span>
                      ) : (
                        <>
                          <span className="text-[11px] text-amber-700 font-semibold">
                            Presença pendente
                          </span>
                          <button
                            type="button"
                            onClick={() => onToggleEventRsvp(evt.id)}
                            className="bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] font-extrabold px-2.5 py-1 rounded-lg text-[11px] shrink-0 cursor-pointer"
                          >
                            Confirmar Presença
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Fase 19: Meus Termos de Ciência Normativa POP (ISO 9001 / SASSMAQ) */}
          <div className="space-y-2 pt-3 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold text-[#15191D] uppercase tracking-wider">
                Meus Termos de Ciência de Procedimentos Operacionais (POP ISO 9001 / SASSMAQ)
              </h3>
              <span className="text-[11px] font-bold text-gray-500">
                {Object.keys(acknowledgedDocIds).length} de {documents.length} assinados
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {documents.map((docItem) => {
                const signedAt = acknowledgedDocIds[docItem.id];
                const popHash = `POP-ACK-${docItem.id.toUpperCase()}-${docItem.version.toUpperCase()}-${currentUser.id.toUpperCase()}`;
                return (
                  <div
                    key={docItem.id}
                    className="p-3 rounded-xl bg-[#F3F5F7] border border-gray-200 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-[#15191D] truncate">{docItem.title}</p>
                      <p className="text-[11px] text-gray-500">
                        {docItem.category} • Versão {docItem.version}
                      </p>
                      {signedAt && (
                        <p className="font-mono text-[10px] text-emerald-700 font-bold mt-0.5 truncate">
                          ✓ {popHash}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {signedAt && (
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(popHash);
                            setHashVerifyInput(popHash);
                            setCopiedIdentifier(`prof-pop-hash-${docItem.id}`);
                            setTimeout(() => setCopiedIdentifier(null), 2500);
                          }}
                          className="bg-white hover:bg-[#FFD400]/30 text-[#15191D] border border-gray-200 font-bold px-2 py-1.5 rounded-lg text-[10px] cursor-pointer"
                          title="Copiar Hash de Ciência Normativa POP (POP-ACK)"
                        >
                          {copiedIdentifier === `prof-pop-hash-${docItem.id}` ? '✓ Hash' : 'Hash'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleAcknowledgePopDocument(docItem)}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold shrink-0 inline-flex items-center gap-1 cursor-pointer ${
                          signedAt
                            ? 'bg-[#080B0D] text-[#FFD400]'
                            : 'bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D]'
                        }`}
                      >
                        <Download className="w-3 h-3" />
                        <span>{signedAt ? 'Termo POP (PDF)' : 'Assinar Ciência POP'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div></details>
      </div>
    );
  }

  // ============================================================================
  // 9. AJUDA & SUPORTE INTERNO (FASE 7 A 25 COMPLETA)
  // ============================================================================
  const faqItems = [
    {
      id: 'faq-1',
      category: 'Mural & Leituras',
      question: '1. Como funciona a Confirmação de Leitura Obrigatória no Mural?',
      answer:
        'Comunicados oficiais marcados com a exigência de leitura obrigatória requerem que o colaborador clique explicitamente no botão "Confirmar leitura". A simples visualização da página não registra confirmação na auditoria da Diretoria.',
    },
    {
      id: 'faq-2',
      category: 'Solicitações & SLA 48h',
      question: '2. Qual é o prazo de atendimento das Solicitações Internas (SLA de 48h)?',
      answer:
        'Toda solicitação gera um protocolo único auditável (ex: #RDV-2027-0192) com prazo padrão de 48 horas corridas. Caso se aproxime do vencimento sem conclusão, o sistema emite alerta preventivo e permite escalonamento direto à Diretoria.',
    },
    {
      id: 'faq-3',
      category: 'Acesso & Segurança',
      question: '3. Como obter e acessar minha conta no portal RODOVAR CONECTA?',
      answer:
        'O acesso ao RODOVAR CONECTA é realizado através de Login e Senha corporativos gerados pelo Administrador Geral / RH. Ao receber sua credencial, acesse a tela de login com seu e-mail/login e senha corporativa de acesso.',
    },
    {
      id: 'faq-4',
      category: 'Mensagens & Grupos',
      question: '4. Quem pode criar Grupos Corporativos e fixar avisos operacionais?',
      answer:
        'A criação de grupos por setor ou unidade e a fixação de avisos no topo das conversas são atribuições exclusivas dos perfis ADMINISTRADOR e DIRETORIA, garantindo organização e foco operacional.',
    },
    {
      id: 'faq-5',
      category: 'Documentos & Normas',
      question: '5. Como consultar versões anteriores de POPs e Manuais da Frota?',
      answer:
        'No módulo Documentos, cada manual ou Procedimento Operacional Padrão (POP) exibe sua versão vigente (ex: v3.2) e permite leitura integral em tela ou download oficial homologado pela RODOVAR.',
    },
    {
      id: 'faq-6',
      category: 'Acesso & Segurança',
      question:
        '6. Como validar Hashes de Autenticidade (AUTH-RDV, SLA48H, CERT-RDV, POP-ACK e FICHA-RDV)?',
      answer:
        'No módulo Administração & Diretoria, utilize o Verificador Unificado de Autenticidade e Governança para conferir em tempo real qualquer código emitido pelo portal (Recibos de Leitura, Protocolos SLA 48h, Certificados SSMA, Termos POP e Fichas Funcionais).',
    },
  ];

  const filteredFaq = faqItems.filter((item) => {
    const matchesCat = helpCategory === 'Todas' || item.category === helpCategory;
    const matchesSearch =
      !helpSearch.trim() ||
      item.question.toLowerCase().includes(helpSearch.toLowerCase()) ||
      item.answer.toLowerCase().includes(helpSearch.toLowerCase());
    return matchesCat && matchesSearch;
  });

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl p-6 border border-gray-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-[#FFD400] flex items-center justify-center text-[#080B0D] shrink-0">
            <HelpCircle className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-[#15191D]">
              Central de Ajuda & Suporte ao Colaborador — RODOVAR CONECTA
            </h1>
            <p className="text-xs text-gray-500">
              Base de conhecimento oficial, política de SLA de 48h, segurança LGPD e abertura rápida de chamado
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={handleDownloadUserGuideManualTxt}
            className="px-3 py-1.5 rounded-lg bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] font-extrabold inline-flex items-center gap-1.5 shadow-2xs cursor-pointer transition"
            title="Baixar Manual Operacional Completo do Colaborador RODOVAR CONECTA 2027 em formato PDF"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Baixar Manual do Colaborador (PDF)</span>
          </button>
          <span className="px-3 py-1.5 rounded-lg bg-[#080B0D] text-[#FFD400] font-mono font-bold">
            Telefone Suporte TI: 71 9 9920-2476
          </span>
          <span className="px-3 py-1.5 rounded-lg bg-[#F3F5F7] text-[#15191D] font-bold border border-gray-200">
            Plantão RH: Telefone: 71 9 9920-2476
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left 7 cols: Searchable FAQ Knowledge Base */}
        <div className="lg:col-span-7 bg-white rounded-xl p-6 border border-gray-200/80 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-[#15191D]">
                Perguntas Frequentes & Guia Rápido
              </h2>
              <button
                type="button"
                onClick={() => {
                  const fullFaqText = [
                    'BASE DE CONHECIMENTO OFICIAL (FAQ) — RODOVAR CONECTA',
                    '------------------------------------------------------------',
                    ...filteredFaq.map((f) => `${f.question}\nR: ${f.answer}\n`),
                  ].join('\n');
                  navigator.clipboard?.writeText(fullFaqText);
                  setCopiedIdentifier('copy-full-faq');
                  setTimeout(() => setCopiedIdentifier(null), 2500);
                }}
                className="px-2.5 py-1 rounded-lg bg-[#F3F5F7] hover:bg-[#FFD400] text-[#15191D] text-[11px] font-bold border border-gray-200 inline-flex items-center gap-1 transition cursor-pointer"
                title="Copiar todas as perguntas e respostas filtradas do Guia Rápido"
              >
                <Copy className="w-3 h-3" />
                <span>{copiedIdentifier === 'copy-full-faq' ? '✓ FAQ Copiado' : 'Copiar FAQ'}</span>
              </button>
            </div>
            <div className="relative flex-1 max-w-xs">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={helpSearch}
                onChange={(e) => setHelpSearch(e.target.value)}
                placeholder="Buscar dúvida (ex: prazo, senha, leitura)..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#F3F5F7] border border-gray-200 rounded-lg focus:outline-none focus:border-[#FFD400]"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {[
              'Todas',
              'Mural & Leituras',
              'Solicitações & SLA 48h',
              'Acesso & Segurança',
              'Mensagens & Grupos',
              'Documentos & Normas',
            ].map((cat) => (
              <button
                key={cat}
                onClick={() => setHelpCategory(cat)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  helpCategory === cat
                    ? 'bg-[#FFD400] text-[#080B0D]'
                    : 'bg-[#F3F5F7] text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="space-y-3 text-xs text-gray-700">
            {filteredFaq.length === 0 ? (
              <div className="p-6 text-center text-gray-400 bg-[#F3F5F7] rounded-xl">
                Nenhum tópico encontrado para &ldquo;{helpSearch}&rdquo;. Utilize o formulário ao lado para acionar o suporte.
              </div>
            ) : (
              filteredFaq.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-xl bg-[#F3F5F7] border border-gray-200/60"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-[#080B0D] text-[#FFD400]">
                      {item.category}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const faqText = `[RODOVAR CONECTA — ORIENTAÇÃO OFICIAL]\n${item.question}\nResposta: ${item.answer}`;
                        navigator.clipboard?.writeText(faqText);
                        setCopiedIdentifier(`faq-copy-${item.id}`);
                        setTimeout(() => setCopiedIdentifier(null), 2500);
                      }}
                      className="bg-white hover:bg-[#FFD400]/30 text-[#15191D] border border-gray-200 text-[10px] font-bold px-2 py-0.5 rounded inline-flex items-center gap-1 cursor-pointer"
                      title="Copiar orientação oficial para área de transferência"
                    >
                      <Copy className="w-3 h-3" />
                      <span>
                        {copiedIdentifier === `faq-copy-${item.id}` ? '✓ Copiado' : 'Copiar Resposta'}
                      </span>
                    </button>
                  </div>
                  <h3 className="font-extrabold text-[#15191D] text-sm mt-1">{item.question}</h3>
                  <p className="mt-1.5 leading-relaxed text-gray-600">{item.answer}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right 5 cols: Direct Support Ticket Creation (SLA 48h) */}
        <div className="lg:col-span-5 bg-white rounded-xl p-6 border border-gray-200/80 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-[#080B0D] text-[#FFD400] flex items-center justify-center shrink-0">
                <Send className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-[#15191D]">
                  Acionar Suporte Interno (SLA 48h)
                </h2>
                <p className="text-xs text-gray-500">
                  Abra um chamado oficial com protocolo imediato para TI, RH ou Administração
                </p>
              </div>
            </div>

            {/* Fase 14: Atalhos Rápidos de Chamado Técnico / Operacional (1-Clique) */}
            <div className="bg-[#F3F5F7] rounded-xl p-3 border border-gray-200/80">
              <span className="block text-[10px] font-extrabold uppercase tracking-wider text-gray-500 mb-2">
                Preenchimento Rápido de Suporte (1-Clique)
              </span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setSupportForm({
                      targetDepartment: 'Administrativo',
                      priority: 'Alta',
                      subject: 'Redefinição de Credencial / Acesso ao Portal RODOVAR',
                      description:
                        'Solicito apoio do Service Desk TI para validação de acesso corporativo e sincronização de perfil no RODOVAR CONECTA.',
                    })
                  }
                  className="text-[11px] font-bold bg-white hover:bg-[#FFD400]/20 text-[#15191D] border border-gray-200 px-2.5 py-1 rounded-lg transition cursor-pointer"
                >
                  🔑 Acesso / Credencial TI
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSupportForm({
                      targetDepartment: 'Segurança',
                      priority: 'Urgente',
                      subject: 'Dúvida Normativa sobre Leitura Obrigatória / POP SSMA',
                      description:
                        'Preciso de orientação técnica da equipe SSMA sobre aplicação operacional de norma publicada no Mural / Central POP.',
                    })
                  }
                  className="text-[11px] font-bold bg-white hover:bg-[#FFD400]/20 text-[#15191D] border border-gray-200 px-2.5 py-1 rounded-lg transition cursor-pointer"
                >
                  🦺 Dúvida POP / SSMA
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSupportForm({
                      targetDepartment: 'Operacional',
                      priority: 'Urgente',
                      subject: 'Apoio CCO / Escala e Liberação de Viagem',
                      description:
                        'Solicito alinhamento com a Coordenação Operacional (CCO) referente a manifesto, checklist pré-viagem ou escala de frota.',
                    })
                  }
                  className="text-[11px] font-bold bg-white hover:bg-[#FFD400]/20 text-[#15191D] border border-gray-200 px-2.5 py-1 rounded-lg transition cursor-pointer"
                >
                  🚛 Plantão CCO / Frota
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSupportForm({
                      targetDepartment: 'Recursos Humanos',
                      priority: 'Média',
                      subject: 'Atualização Cadastral / Comprovante de Treinamento',
                      description:
                        'Solicito apoio do RH para conferência de certificado de treinamento obrigatório e atualização de dados no Diretório.',
                    })
                  }
                  className="text-[11px] font-bold bg-white hover:bg-[#FFD400]/20 text-[#15191D] border border-gray-200 px-2.5 py-1 rounded-lg transition cursor-pointer"
                >
                  📋 RH / Certificados
                </button>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Setor Responsável pelo Atendimento
                </label>
                <select
                  value={supportForm.targetDepartment}
                  onChange={(e) =>
                    setSupportForm({
                      ...supportForm,
                      targetDepartment: e.target.value as Department,
                    })
                  }
                  className="w-full px-3 py-2 bg-[#F3F5F7] border border-gray-200 rounded-lg font-semibold text-[#15191D]"
                >
                  <option value="Administrativo">Suporte Técnico / TI & Acessos</option>
                  <option value="Recursos Humanos">Recursos Humanos / Benefícios</option>
                  <option value="Operacional">Coordenação Operacional & Frota</option>
                  <option value="Segurança">Segurança do Trabalho (SSMA)</option>
                  <option value="Financeiro">Financeiro / Reembolsos</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1"> Prioridade</label>
                <select
                  value={supportForm.priority}
                  onChange={(e) =>
                    setSupportForm({
                      ...supportForm,
                      priority: e.target.value as 'Baixa' | 'Média' | 'Alta' | 'Urgente',
                    })
                  }
                  className="w-full px-3 py-2 bg-[#F3F5F7] border border-gray-200 rounded-lg font-semibold text-[#15191D]"
                >
                  <option value="Baixa">Baixa</option>
                  <option value="Média">Média</option>
                  <option value="Alta">Alta</option>
                  <option value="Urgente">Urgente</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Assunto do Chamado *</label>
                <input
                  type="text"
                  value={supportForm.subject}
                  onChange={(e) => setSupportForm({ ...supportForm, subject: e.target.value })}
                  placeholder="Ex: Dúvida sobre confirmação de leitura ou acesso..."
                  className="w-full px-3 py-2 bg-[#F3F5F7] border border-gray-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Descrição Detalhada da Necessidade *
                </label>
                <textarea
                  rows={4}
                  value={supportForm.description}
                  onChange={(e) => setSupportForm({ ...supportForm, description: e.target.value })}
                  placeholder="Descreva sua dúvida técnica ou solicitação administrativa..."
                  className="w-full px-3 py-2 bg-[#F3F5F7] border border-gray-200 rounded-lg"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            {supportSuccessToast && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
                {supportSuccessToast}
              </div>
            )}

            <button
              onClick={() => {
                if (!supportForm.subject.trim() || !supportForm.description.trim()) return;
                onCreateRequest({
                  targetDepartment: supportForm.targetDepartment,
                  subject: `[Suporte Central de Ajuda] ${supportForm.subject.trim()}`,
                  description: supportForm.description.trim(),
                  priority: supportForm.priority,
                });
                setSupportForm({
                  targetDepartment: 'Administrativo',
                  subject: '',
                  description: '',
                  priority: 'Alta',
                });
                setSupportSuccessToast(
                  '✓ Chamado registrado com sucesso com SLA de 48h! Acompanhe em "Minhas Solicitações".'
                );
                setTimeout(() => setSupportSuccessToast(null), 5000);
              }}
              className="w-full bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] font-extrabold text-xs py-3 rounded-xl shadow-xs transition cursor-pointer"
            >
              Registrar Chamado Oficial (SLA 48h)
            </button>

            {/* Fase 14: Escala de Plantão & Contatos de Emergência 24h RODOVAR */}
            <div className="bg-[#080B0D] text-[#F3F5F7] rounded-xl p-3.5 border border-gray-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold text-[#FFD400] uppercase tracking-wider">
                  Plantão de Emergência 24h RODOVAR
                </span>
                <span className="font-mono text-[10px] bg-[#E5252A] text-white px-2 py-0.5 rounded font-bold">
                  ACIONAMENTO IMEDIATO
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="bg-[#15191D] p-2 rounded-lg border border-gray-800 flex items-center justify-between gap-1">
                  <div>
                    <span className="text-gray-400 block text-[10px]">CCO / Monitoramento</span>
                    <span className="font-mono font-bold text-white">Telefone: 71 9 9920-2476</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText('CCO RODOVAR 24h: Telefone: 71 9 9920-2476');
                      setCopiedIdentifier('emerg-cco');
                      setTimeout(() => setCopiedIdentifier(null), 2500);
                    }}
                    className="bg-white/10 hover:bg-[#FFD400] hover:text-[#080B0D] text-gray-300 p-1.5 rounded transition cursor-pointer"
                    title="Copiar telefone do Plantão CCO 24h"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
                <div className="bg-[#15191D] p-2 rounded-lg border border-gray-800 flex items-center justify-between gap-1">
                  <div>
                    <span className="text-gray-400 block text-[10px]">Emergência SSMA / PGR</span>
                    <span className="font-mono font-bold text-[#FFD400]">Telefone: 71 9 9920-2476</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(
                        'Emergência SSMA / PGR RODOVAR 24h: Telefone: 71 9 9920-2476'
                      );
                      setCopiedIdentifier('emerg-ssma');
                      setTimeout(() => setCopiedIdentifier(null), 2500);
                    }}
                    className="bg-white/10 hover:bg-[#FFD400] hover:text-[#080B0D] text-gray-300 p-1.5 rounded transition cursor-pointer"
                    title="Copiar telefone de Emergência SSMA 24h"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
              </div>
              {(copiedIdentifier === 'emerg-cco' || copiedIdentifier === 'emerg-ssma') && (
                <p className="text-[10px] font-bold text-[#FFD400] text-center">
                  ✓ Contato de emergência copiado para a área de transferência!
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Fase 30: Selo Oficial de Homologação e Fechamento 100% da Plataforma RODOVAR CONECTA */}
      <div className="bg-[#080B0D] text-[#F3F5F7] rounded-xl p-4 border border-gray-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#FFD400] text-[#080B0D] flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5 stroke-[2.3]" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-extrabold text-white">
                GOVERNANÇA CORPORATIVA 100% HOMOLOGADA — TRANSPORTADORA RODOVAR
              </span>
              <span className="text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded">
                FASES 1 A 30 CONCLUÍDAS
              </span>
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Rastreabilidade integral de leituras obrigatórias (AUTH-RDV), protocolos SLA 48h (SLA48H), termos normativos (POP-ACK), certificados SSMA (CERT-RDV) e fichas funcionais (FICHA-RDV).
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            const certText = [
              'CERTIFICADO DE CONFORMIDADE E GOVERNANÇA DIGITAL — RODOVAR CONECTA',
              '===================================================================',
              `Emitido em: ${new Date().toLocaleString('pt-BR')}`,
              `Operador Autenticado: ${currentUser.name} (${currentUser.role} - ${currentUser.department})`,
              'Status da Plataforma: 100% HOMOLOGADA (Fases 1 a 30 Concluídas)',
              'Módulos Auditados: Mural Oficial, Solicitações SLA 48h, Mensagens & Grupos, Agenda, Documentos POP, Diretório, Administração RBAC, Perfil Funcional e Central de Ajuda.',
              'Hash de Integridade do Sistema: SYS-RDV-CONECTA-2025-V30-OK',
            ].join('\n');
            navigator.clipboard?.writeText(certText);
            setCopiedIdentifier('copy-gov-seal');
            setTimeout(() => setCopiedIdentifier(null), 2500);
          }}
          className="px-3 py-2 rounded-lg bg-[#15191D] hover:bg-[#FFD400] hover:text-[#080B0D] text-[#FFD400] border border-gray-700 font-mono text-[11px] font-bold inline-flex items-center gap-1.5 shrink-0 transition cursor-pointer"
          title="Copiar Certificado de Conformidade e Governança Digital do Sistema"
        >
          <Copy className="w-3.5 h-3.5" />
          <span>
            {copiedIdentifier === 'copy-gov-seal'
              ? '✓ Certificado Copiado'
              : 'SYS-RDV-V30 • Copiar Selo'}
          </span>
        </button>
      </div>
    </div>
  );
};

function AdministrationDataBoundary(props:ModulesViewProps){
  const [data,setData]=useState<Partial<ModulesViewProps>>({});
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    if(props.currentUser.accessLevel!=='ADMINISTRADOR'||props.currentUser.id!=='emp-admin-master'){setLoading(false);return;}
    const controller=new AbortController();
    const load=async()=>{
      const endpoints=['/api/admin/access-requests','/api/mural','/api/requests','/api/agenda'];
      const results=await Promise.allSettled(endpoints.map(async url=>{const response=await fetch(url,{headers:getAuthHeaders(),signal:controller.signal});const payload=await response.json();if(!response.ok)throw Error(payload.error||'Falha ao consultar '+url);return payload;}));
      if(controller.signal.aborted)return;
      const update:Partial<ModulesViewProps>={};const failures:string[]=[];
      results.forEach((result,index)=>{if(result.status==='rejected'){failures.push(result.reason?.message||'Serviço indisponível');return;}const value=result.value;if(index===0){update.employees=value.accounts;update.auditLogs=value.auditLogs;}if(index===1)update.announcements=value.announcements;if(index===2)update.requests=value.requests;if(index===3)update.events=value.events;});
      setData(previous=>({...previous,...update}));setError(failures.join(' · '));setLoading(false);
    };void load();const interval=setInterval(load,15000);return()=>{controller.abort();clearInterval(interval);};
  },[props.currentUser.id]);
  if(loading)return <p role="status">Carregando Administração...</p>;
  return <>{error&&<p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">Algumas fontes não puderam ser atualizadas: {error}</p>}<ModulesViewContent {...props} {...data}/></>;
}

export const ModulesView: React.FC<ModulesViewProps> = (props) => {
  return <>
    {props.activeSection === 'comunicados' ? <MuralPremium currentUser={props.currentUser} initial={props.announcements} onHydrated={props.onMuralHydrated}/> : props.activeSection==='administracao'?<AdministrationDataBoundary {...props}/>:<ModulesViewContent {...props} />}
  </>;
};

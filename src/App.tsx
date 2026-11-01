import {HomePremium} from './components/HomePremium';
import {validatePortalBackup} from './lib/adminBackup';
import {portalLoading} from './lib/portalLoading';
import {usePortalInitialized, useAuthenticatedPanelLoading} from './components/GlobalLoading';
import {notificationUrl,notificationRecord,notificationMatches,orderedNotifications} from './lib/notificationNavigation';
import './components/NotificationsClean.css';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef } from 'react';
import { FirstAccessPassword } from './components/FirstAccessPassword';
import {
  Bell,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Cloud,
  Download,
  FileText,
  Folder,
  HelpCircle,
  Home,
  Link2,
  LogIn,
  LogOut,
  Megaphone,
  MessageSquare,
  Phone,
  Search,
  Shield,
  ShieldCheck,
  Truck,
  User,
  Users,
  Wallet,
  WifiOff,
  X,
} from 'lucide-react';
import { RodovarLogo } from './components/RodovarLogo';
import { MobileDeviceView } from './components/MobileSimulatorModal';
import { ModulesView } from './components/ModulesView';
import { LoginScreen } from './components/LoginScreen';
import { FinanceiroFretesView } from './components/FinanceiroFretesView';
import { FretesAtivosView } from './components/FretesAtivosView';
import { MeusFretesComercialView } from './components/MeusFretesComercialView';
import { MeusFretesExpedicaoView } from './components/MeusFretesExpedicaoView';
import { hasPagePermission, permittedHome, getDefaultPermissionsForDepartment } from './lib/permissions';
import {
  INITIAL_FREIGHTS,
  loadFreightsFromStorage,
  saveFreightsToStorage,
} from './lib/freightDatabase';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  provisionAuthenticatedUserInFirestore,
  seedCorporateDatabaseInFirestore,
} from './lib/databaseSeeder';
import {
  useOnlineStatus,
  usePWAInstall,
  useServiceWorkerUpdate,
  clearSensitiveDataOnLogout,
} from './hooks/usePWA';
import { PWAInstallModal } from './components/PWAInstallModal';
import {
  INITIAL_ANNOUNCEMENTS,
  INITIAL_AUDIT_LOGS,
  INITIAL_CHATS,
  INITIAL_DOCUMENTS,
  INITIAL_EMPLOYEES,
  INITIAL_EVENTS,
  INITIAL_INVITES,
  INITIAL_NOTIFICATIONS,
  INITIAL_REQUESTS,
} from './data/initialData';
import {
  Announcement,
  AuditLog,
  ChatThread,
  CorporateDocument,
  CorporateEvent,
  CorporateNotification,
  Department,
  Employee,
  EmployeeInvite,
  FreightRecord,
  InternalRequest,
  MenuSection,
  RequestStatus,
  SystemConfig,
  UserRole,
} from './types';
import {
  auth,
  db,
  firebaseSignOut,
  onAuthStateChanged,
  FirebaseUser,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  OperationType,
  handleFirestoreError,
} from './lib/firebase';
import {
  apiFetchSession,
  apiFetchSystemConfig,
  apiFetchAdminAccessRequests,
  apiFetchFreightNotifications,
  apiMarkFreightNotificationRead,
  apiLogout,
  resolveAvatarUrl,
  withRevisionParam,
  getAuthHeaders,
} from './lib/serverApi';
import { WelcomeBannerCarousel } from './components/WelcomeBannerCarousel';
import {
  SharedReceiptDraft,
  getSavedSessionDraft,
  readSharedReceiptFromIdb,
  saveSharedDraftToDevice,
  clearSharedReceiptDraft,
  clearOfflinePendingReceiptsForUser,
} from './lib/pwaShareTarget';

const SECTION_TO_PATH: Record<MenuSection, string> = {
  inicio: '/',
  comunicados: '/comunicados',
  fretes_comercial: '/comercial',
  fretes_expedicao: '/expedicao',
  fretes_ativos: '/fretes-ativos',
  solicitacoes: '/solicitacoes',
  financeiro: '/financeiro',
  agenda: '/agenda',
  documentos: '/documentos',
  mensagens: '/mensagens',
  grupos: '/grupos',
  diretorio: '/diretorio',
  perfil: '/perfil',
  administracao: '/administracao',
  ajuda: '/ajuda',
};

function getSectionFromPathname(pathname: string): MenuSection | null {
  const clean = (pathname || '/').toLowerCase().replace(/\/+$/, '') || '/';
  if (clean === '/') return 'inicio';
  if (clean === '/comunicados') return 'comunicados';
  if (clean === '/comercial' || clean === '/fretes-comercial') return 'fretes_comercial';
  if (clean === '/expedicao' || clean === '/fretes-expedicao') return 'fretes_expedicao';
  if (clean === '/fretes-ativos') return 'fretes_ativos';
  if (clean === '/solicitacoes') return 'solicitacoes';
  if (clean === '/financeiro' || clean === '/receber-comprovante') return 'financeiro';
  if (clean === '/agenda') return 'agenda';
  if (clean === '/documentos') return 'comunicados';
  if (clean === '/mensagens') return 'mensagens';
  if (clean === '/grupos') return 'grupos';
  if (clean === '/diretorio') return 'diretorio';
  if (clean === '/perfil') return 'perfil';
  if (clean === '/administracao' || clean === '/liberacao') return 'administracao';
  if (clean === '/ajuda') return 'ajuda';
  return null;
}

export default function App() {
  useEffect(() => {
    const receive = (event: Event) => {
      const notices = (event as CustomEvent).detail;
      if (Array.isArray(notices)) setNotifications(prev => {
        const merged = new Map(prev.map(n => [n.id,n]));
        notices.forEach(n => merged.set(n.id,n)); return [...merged.values()];
      });
    };
    window.addEventListener('rodovar:agenda-notifications',receive);
    return () => window.removeEventListener('rodovar:agenda-notifications',receive);
  }, []);
  // Navigation & View Mode
  const [activeSection, setActiveSection] = useState<MenuSection>(() => {
    if (typeof window !== 'undefined') {
      const initialSection = getSectionFromPathname(window.location.pathname);
      if (initialSection && initialSection !== 'inicio') {
        try {
          sessionStorage.setItem('rodovar_intended_section_v1', initialSection);
        } catch {
          // ignore
        }
        return initialSection;
      }
    }
    return 'inicio';
  });
  const [preparingAuthenticatedPanel, setPreparingAuthenticatedPanel] = useState(false);
  const authenticatedPanelRelease = useRef<(() => void) | null>(null);
  useAuthenticatedPanelLoading(preparingAuthenticatedPanel, authenticatedPanelRelease);
  const [featuredIndex, setFeaturedIndex] = useState<number>(0);
  const [pendingSharedDraft, setPendingSharedDraft] = useState<SharedReceiptDraft | null>(null);

  // Firebase Auth & Portal Session Gate State
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [portalInitialized,setPortalInitialized]=useState(false);
  usePortalInitialized(portalInitialized);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  useEffect(() => {
    if (!isAuthenticated) return;
    const controller = new AbortController();
    const update = async () => {
      try { const response = await fetch('/api/agenda', {headers:getAuthHeaders(),signal:controller.signal});
        if (!response.ok) return;
        const data = await response.json();
        if (!controller.signal.aborted) window.dispatchEvent(new CustomEvent('rodovar:agenda-notifications',{detail:data.notifications}));
      } catch { /* Existing notification state remains available on network failure. */ }
    };
    void update(); const interval = setInterval(update,15000);
    return () => {controller.abort();clearInterval(interval);};
  }, [isAuthenticated]);
  const [systemConfig, setSystemConfig] = useState<SystemConfig | null>(null);
  const [pendingAccessRequestsCount, setPendingAccessRequestsCount] = useState<number>(0);
  const [notificationNavigationError,setNotificationNavigationError]=useState('');
  const [selectedNotificationFreightId, setSelectedNotificationFreightId] = useState<string | null>(
    new URLSearchParams(window.location.search).get('registro')
  );

  // Stateful Corporate Data (with persisted credentials & guaranteed Master Admin)
  const [employees, setEmployees] = useState<Employee[]>([]);
  const normalizeYearStr = (str?: string): string => {
    if (!str) return '';
    return str.replace(/\b(2024|2025|2026)\b/g, '2027');
  };

  const normalizeAnnouncementTo2027 = (ann: Announcement): Announcement => {
    const upperTitle = (ann.title || '').toUpperCase();
    let pdfUrl = ann.pdfUrl;
    let defaultAttName = '01_Comunicados_e_Testes_2027.pdf';
    let defaultAttSize = '420 KB';

    if (ann.id === 'ann-1' || upperTitle.includes('RECESSO')) {
      pdfUrl = '/assets/aistudio/02_Recesso_e_Continuidade_2027_ffe95a1d.pdf';
      defaultAttName = '02_Recesso_e_Continuidade_2027.pdf';
      defaultAttSize = '1.4 MB';
    } else if (ann.id === 'ann-2' || upperTitle.includes('DIREÇÃO DEFENSIVA') || upperTitle.includes('DIRECAO DEFENSIVA')) {
      pdfUrl = '/assets/aistudio/03_Direcao_Defensiva_2027_500e5359.pdf';
      defaultAttName = '03_Direcao_Defensiva_2027.pdf';
      defaultAttSize = '3.2 MB';
    } else if (ann.id === 'ann-3' || upperTitle.includes('MANUAL') || upperTitle.includes('BENEFÍCIOS')) {
      pdfUrl = '/assets/aistudio/07_Funcoes_Profissionais_2027_461a1f82.pdf';
      defaultAttName = '07_Funcoes_Profissionais_2027.pdf';
      defaultAttSize = '2.1 MB';
    } else {
      pdfUrl = pdfUrl || '/assets/aistudio/01_Comunicados_e_Testes_2027_4d007e46.pdf';
      defaultAttName = '01_Comunicados_e_Testes_2027.pdf';
      defaultAttSize = '420 KB';
    }

    const cleanTitle = normalizeYearStr(ann.title);
    return {
      ...ann,
      title: cleanTitle,
      summary: normalizeYearStr(ann.summary),
      content: normalizeYearStr(ann.content),
      dateFormatted: normalizeYearStr(ann.dateFormatted || '27/10/2027'),
      createdAtIso: normalizeYearStr(ann.createdAtIso),
      pdfUrl,
      readReceipts: (ann.readReceipts || []).map((r) => ({
        ...r,
        confirmedAt: normalizeYearStr(r.confirmedAt),
      })),
      comments: (ann.comments || []).map((c) => ({
        ...c,
        createdAt: normalizeYearStr(c.createdAt),
      })),
      attachments: [
        {
          name: defaultAttName,
          size: defaultAttSize,
          type: 'PDF',
          url: pdfUrl,
        },
      ],
    };
  };

  const normalizeEventTo2027 = (evt: CorporateEvent): CorporateEvent => {
    const upper = (evt.title || '').toUpperCase();
    let pdfUrl = evt.pdfUrl;
    if (evt.id === 'evt-1' || upper.includes('RECESSO')) {
      pdfUrl = '/assets/aistudio/02_Recesso_e_Continuidade_2027_ffe95a1d.pdf';
    } else if (evt.id === 'evt-2' || upper.includes('SEGURANÇA') || upper.includes('SEGURANCA')) {
      pdfUrl = '/assets/aistudio/04_Seguranca_Treinamentos_e_Agenda_2027_c075105a.pdf';
    } else {
      pdfUrl = pdfUrl || '/assets/aistudio/05_Reunioes_e_Planejamento_2027_14c8d18b.pdf';
    }
    const baseTitle = normalizeYearStr(evt.title);
    const titleWithYear = baseTitle.includes('2027') ? baseTitle : `${baseTitle} 2027`;
    return {
      ...evt,
      title: titleWithYear,
      dateIso: normalizeYearStr(evt.dateIso || '2027-01-15'),
      description: normalizeYearStr(evt.description),
      pdfUrl,
    };
  };

  const normalizeDocumentsTo2027 = (docs: CorporateDocument[]): CorporateDocument[] => {
    const initialMap = new Map(INITIAL_DOCUMENTS.map((d) => [d.id, d]));
    const updatedExisting = docs.map((d) => {
      const canonical = initialMap.get(d.id);
      if (canonical) {
        return {
          ...d,
          title: canonical.title,
          category: canonical.category,
          version: canonical.version,
          updatedAt: canonical.updatedAt,
          fileType: 'PDF' as const,
          size: canonical.size,
          description: canonical.description,
          contentPreview: canonical.contentPreview,
          pdfUrl: canonical.pdfUrl,
        };
      }
      return {
        ...d,
        title: normalizeYearStr(d.title),
        updatedAt: normalizeYearStr(d.updatedAt),
        fileType: 'PDF' as const,
        pdfUrl: d.pdfUrl || '/assets/aistudio/06_Comprovantes_e_Guias_de_Trabalho_2027_d375a1ec.pdf',
      };
    });
    const existingIds = new Set(updatedExisting.map((d) => d.id));
    const missingInitial = INITIAL_DOCUMENTS.filter((d) => !existingIds.has(d.id));
    return [...updatedExisting, ...missingInitial];
  };

  const [currentUserId, setCurrentUserId] = useState<string>('emp-admin-master');
  const [announcements, setAnnouncements] = useState<Announcement[]>(() => {
    try {
      const saved = localStorage.getItem('rodovar_conecta_announcements_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map(normalizeAnnouncementTo2027);
        }
      }
    } catch (err) {
      console.debug('Announcements storage load info:', err);
    }
    return INITIAL_ANNOUNCEMENTS.map(normalizeAnnouncementTo2027);
  });
  const [notifications, setNotifications] = useState<CorporateNotification[]>(() => {
    try {
      const saved = localStorage.getItem('rodovar_conecta_notifications_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (err) {
      console.debug('Notifications storage load info:', err);
    }
    return INITIAL_NOTIFICATIONS;
  });
  const [events, setEvents] = useState<CorporateEvent[]>(() => {
    try {
      const saved = localStorage.getItem('rodovar_conecta_events_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map(normalizeEventTo2027);
        }
      }
    } catch (err) {
      console.debug('Events storage load info:', err);
    }
    return INITIAL_EVENTS.map(normalizeEventTo2027);
  });
  const [requests, setRequests] = useState<InternalRequest[]>([]);

  const [documents, setDocuments] = useState<CorporateDocument[]>(() => {
    try {
      const saved = localStorage.getItem('rodovar_conecta_documents_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return normalizeDocumentsTo2027(parsed);
        }
      }
    } catch (err) {
      console.debug('Documents storage load info:', err);
    }
    return normalizeDocumentsTo2027(INITIAL_DOCUMENTS);
  });
  const [chats, setChats] = useState<ChatThread[]>(() => {
    try {
      const saved = localStorage.getItem('rodovar_conecta_chats_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (err) {
      console.debug('Chats storage load info:', err);
    }
    return INITIAL_CHATS;
  });
  const [invites, setInvites] = useState<EmployeeInvite[]>(() => {
    try {
      const saved = localStorage.getItem('rodovar_conecta_invites_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (err) {
      console.debug('Invites storage load info:', err);
    }
    return INITIAL_INVITES;
  });
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => {
    try {
      const saved = localStorage.getItem('rodovar_conecta_audit_logs_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (err) {
      console.debug('AuditLogs storage load info:', err);
    }
    return INITIAL_AUDIT_LOGS;
  });
  const [freights, setFreights] = useState<FreightRecord[]>(() => loadFreightsFromStorage());

  // Interactive Modals on Dashboard
  const [selectedAnnouncementModal, setSelectedAnnouncementModal] =
    useState<Announcement | null>(null);
  const [showProfileDropdown, setShowProfileDropdown] = useState<boolean>(false);
  const [showNotificationsPopover, setShowNotificationsPopover] = useState<boolean>(false);
  const [showNotificationsCenterModal, setShowNotificationsCenterModal] = useState<boolean>(false);
  const [notifCenterFilter, setNotifCenterFilter] = useState<string>('todas');
  const [openRequestModalOnLoad, setOpenRequestModalOnLoad] = useState<boolean>(false);
  const [quickAccessModal, setQuickAccessModal] = useState<{
    title: string;
    subtitle: string;
    body: string;
  } | null>(null);

  // Fase 8: Global Command Palette (Ctrl+K), PWA Install & Offline Resilience
  const [showCommandPalette, setShowCommandPalette] = useState<boolean>(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState<string>('');
  const [globalSearchFilter, setGlobalSearchFilter] = useState<
    'tudo' | 'comunicados' | 'solicitacoes' | 'funcionarios' | 'documentos' | 'agenda'
  >('tudo');
  const [showPWAInstallGuideModal, setShowPWAInstallGuideModal] = useState<boolean>(false);
  const {
    canPromptInstall,
    isInstalled,
    isIOS,
    isAndroid,
    isSafariIOS,
    isInAppBrowser,
    inAppBrowserName,
    isInIframe,
    installOutcome,
    install: triggerPWAInstall,
    postponeInstall,
    resetInstallOutcome,
  } = usePWAInstall();
  const { updateAvailable, isUpdating, applyUpdate, dismissUpdate } = useServiceWorkerUpdate();
  const isOnline = useOnlineStatus();

  const currentUser =
    employees.find((e) => e && e.id === currentUserId) ||
    employees.find((e) => e && e.id) ||
    INITIAL_EMPLOYEES[0];

  // Global keyboard shortcut Ctrl+K / Cmd+K for Unified Corporate Search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowCommandPalette((prev) => !prev);
      } else if (e.key === 'Escape') {
        setShowCommandPalette(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Persist employees (stripping any plaintext password) in localStorage
  useEffect(() => {
    try {
      const sanitized = employees
        .filter((e) => e && typeof e === 'object' && e.id)
        .map(({ password: _pw, ...rest }) => rest);
      localStorage.setItem('rodovar_conecta_employees_v1', JSON.stringify(sanitized));
    } catch (err) {
      console.debug('Employees storage save info:', err);
    }
  }, [employees]);

  useEffect(() => {
    try {
      localStorage.setItem('rodovar_conecta_announcements_v1', JSON.stringify(announcements));
      localStorage.setItem('rodovar_conecta_notifications_v1', JSON.stringify(notifications));
      localStorage.setItem('rodovar_conecta_events_v1', JSON.stringify(events));
      // Legacy browser requests are preserved for administrator review, never overwritten by a filtered queue.
      localStorage.setItem('rodovar_conecta_documents_v1', JSON.stringify(documents));
      localStorage.setItem('rodovar_conecta_chats_v1', JSON.stringify(chats));
      localStorage.setItem('rodovar_conecta_invites_v1', JSON.stringify(invites));
      localStorage.setItem('rodovar_conecta_audit_logs_v1', JSON.stringify(auditLogs));
    } catch (err) {
      console.debug('Corporate collections storage save info:', err);
    }
  }, [announcements, notifications, events, requests, documents, chats, invites, auditLogs]);

  useEffect(() => {
    saveFreightsToStorage(freights);
  }, [freights]);

  // 0. Restore & Validate Corporate Session and System Config from Server
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cfg = await apiFetchSystemConfig();
        if (mounted && cfg?.systemConfig) {
          setSystemConfig(cfg.systemConfig);
        }
      } catch (err) {
        console.debug('System config load info:', err);
      }

      try {
        const sessionRes = await apiFetchSession();
        if (!mounted) return;
        if (sessionRes.authenticated && sessionRes.user) {
          if (sessionRes.systemConfig) {
            setSystemConfig(sessionRes.systemConfig);
          }
          if (typeof sessionRes.pendingAccessRequestsCount === 'number') {
            setPendingAccessRequestsCount(sessionRes.pendingAccessRequestsCount);
          }
          const serverUser = sessionRes.user;
          setEmployees((prev) => {
            const exists = prev.some((e) => e.id === serverUser.id);
            if (exists) {
              return prev.map((e) => (e.id === serverUser.id ? { ...e, ...serverUser } : e));
            }
            return [serverUser, ...prev];
          });
          setCurrentUserId(serverUser.id);
          setIsAuthenticated(true);

          try {
            const restoreSection =
              sessionStorage.getItem('rodovar_restore_section_after_publish') ||
              sessionStorage.getItem('rodovar_intended_section_v1');
            if (restoreSection) {
              sessionStorage.removeItem('rodovar_restore_section_after_publish');
              sessionStorage.removeItem('rodovar_intended_section_v1');
              const targetSec = restoreSection as MenuSection;
              if (
                targetSec === 'inicio' ||
                targetSec === 'perfil' ||
                targetSec === 'ajuda' ||
                hasPagePermission(serverUser, targetSec)
              ) {
                setActiveSection(targetSec);
              }
            }
          } catch {
            // ignore
          }

          if (
            serverUser.accessLevel === 'ADMINISTRADOR'
          ) {
            try {
              const adminData = await apiFetchAdminAccessRequests();
              if (mounted && adminData.ok) {
                setPendingAccessRequestsCount(adminData.pendingCount);
                setEmployees(adminData.accounts);
              }
            } catch {
              // ignore
            }
          }
        } else {
          setIsAuthenticated(false);
        }
      } catch (err) {
        console.debug('Server session check info:', err);
      } finally {
        if(mounted)setPortalInitialized(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Synchronize URL pathname & browser Back button (popstate) in standalone PWA & browser
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = (event: PopStateEvent) => {
      const stateSec = event.state?.section as MenuSection | undefined;
      const pathSec = getSectionFromPathname(window.location.pathname);
      const nextSec = stateSec || pathSec || 'inicio';
      setActiveSection(nextSec);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !isAuthenticated) return;
    const currentPath = window.location.pathname;
    if (currentPath === '/receber-comprovante' && pendingSharedDraft) {
      return;
    }
    const targetPath = SECTION_TO_PATH[activeSection] || '/';
    if (currentPath !== targetPath) {
      try {
        window.history.pushState({ section: activeSection }, '', targetPath);
      } catch {
        // ignore in restricted environments
      }
    }
  }, [activeSection, isAuthenticated, pendingSharedDraft]);

  // The server owns the user directory; browser caches cannot restore deleted accounts.
  useEffect(() => {
    if(!isAuthenticated || currentUser.mustChangePassword)return;
    const controller=new AbortController();
    const load=async()=>{try{const response=await fetch('/api/employees',{headers:getAuthHeaders(),signal:controller.signal});if(response.ok){const data=await response.json();if(!controller.signal.aborted)setEmployees(data.employees);}}catch{}};
    load();const timer=setInterval(load,10000);return()=>{controller.abort();clearInterval(timer);};
  },[isAuthenticated,currentUserId,currentUser.mustChangePassword]);

  // Poll systemConfig revision periodically so other active tabs/sessions stay updated
  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/system-config/version', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (
            data &&
            typeof data.revision === 'number' &&
            systemConfig &&
            data.revision > systemConfig.revision
          ) {
            const fresh = await apiFetchSystemConfig();
            if (fresh?.systemConfig) {
              setSystemConfig(fresh.systemConfig);
            }
          }
        }
      } catch {
        // ignore network hiccup
      }
      // Also poll server freight notifications for current user
      try {
        const fNotifs = await apiFetchFreightNotifications();
        if (fNotifs.notifications && fNotifs.notifications.length > 0) {
          setNotifications((prev) => {
            const map = new Map(prev.map((n) => [n.id, n]));
            for (const fn of fNotifs.notifications) {
              map.set(fn.id, fn);
            }
            return Array.from(map.values());
          });
        }
      } catch {
        // ignore
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [isAuthenticated, systemConfig]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const timer=setInterval(async()=>{
      try {const session=await apiFetchSession(); if(session.authenticated === false) setIsAuthenticated(false);}
      catch { /* A temporary connection failure does not revoke the server session. */ }
    },15000);
    return()=>clearInterval(timer);
  },[isAuthenticated]);
  useEffect(()=>{
    if(!isAuthenticated || !hasPagePermission(currentUser,'solicitacoes')) {setRequests([]);return;}
    let cancelled=false;
    const load=async()=>{try{const r=await fetch('/api/requests',{headers:getAuthHeaders()});if(r.ok){const d=await r.json();if(!cancelled){
          setRequests(d.requests);
          setNotifications(prev => [...prev.filter(n => n.type!=='solicitacao'), ...d.notifications.map((n:any) => ({id:'queue:'+n.id,type:'solicitacao' as const,dotColor:'blue' as const,title:n.title,subtitle:'Atualização no atendimento interno',timeLabel:'Solicitações',read:n.read,targetSection:'solicitacoes' as const,targetId:n.targetId,recipientId:n.recipientId,publicationId:'queue:'+n.id,createdAtIso:n.createdAtIso}))]);
        }}}catch{}};
    load();const timer=setInterval(load,5000);return()=>{cancelled=true;clearInterval(timer);};
  },[isAuthenticated,currentUser.id,currentUser.accessProfile]);

  // Redirecionamento automático caso a página ativa seja desabilitada nas permissões do colaborador
  useEffect(() => {
    if (activeSection === 'administracao') {
      if (
        !hasPagePermission(currentUser, 'administracao')
      ) {
        setActiveSection(permittedHome(currentUser) as MenuSection);
      }
      return;
    }
    if (activeSection !== 'perfil' && activeSection !== 'ajuda') {
      if (!hasPagePermission(currentUser, activeSection)) {
        setActiveSection(permittedHome(currentUser) as MenuSection);
      }
    }
  }, [currentUser, activeSection]);

  // Helper to record Audit Logs locally and persist to Cloud Firestore when Admin
  const recordAuditLog = async (
    action: string,
    details: string,
    customActor?: string,
    customRole?: UserRole
  ) => {
    const logId = `aud-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const timestamp = new Date().toLocaleString('pt-BR');
    const actor = customActor || currentUser.name;
    const role = customRole || currentUser.accessLevel;

    setAuditLogs((prev) => [
      {
        id: logId,
        timestamp,
        actor,
        role,
        action,
        details,
      },
      ...prev,
    ]);

    if (
      firebaseUser &&
      firebaseUser.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()
    ) {
      try {
        await setDoc(doc(db, 'audit_logs', logId), {
          timestamp: timestamp.slice(0, 40),
          actorId: firebaseUser.uid,
          actor: actor.slice(0, 120),
          role,
          action: action.slice(0, 80),
          details: details.slice(0, 500),
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        console.debug('Audit log Firestore sync info:', err);
      }
    }
  };

  // The local server session is the sole authority. Legacy Firebase sessions must not replace it.
  useEffect(() => { setFirebaseUser(null); setAuthReady(true); }, []);

  // 2. Real-Time Firestore Listeners (when authenticated)
  useEffect(() => {
    if (!authReady || !firebaseUser) return;

    const allowedAudiences = [
      'Todos',
      'Administrativo',
      'Operacional',
      'Recursos Humanos',
      'Financeiro',
      'Segurança',
      'Diretoria',
      'Logística',
    ];

    // Announcements listener (preserving existing likes, comments, and readReceipts)
    const annQuery = query(
      collection(db, 'announcements'),
      where('targetAudience', 'in', allowedAudiences)
    );
    const unsubAnn = onSnapshot(
      annQuery,
      (snapshot) => {
        if (!snapshot.empty) {
          setAnnouncements((prev) => {
            const prevMap = new Map(prev.map((p) => [p.id, p]));
            const loaded: Announcement[] = snapshot.docs.map((d) => {
              const data = d.data();
              const existing = prevMap.get(d.id);
              return normalizeAnnouncementTo2027({
                id: d.id,
                title: data.title,
                summary: data.summary,
                content: data.content,
                authorName: data.authorName,
                department: data.department,
                dateFormatted: data.dateFormatted,
                createdAtIso: existing?.createdAtIso || new Date().toISOString(),
                coverImage: data.coverImage || '/assets/aistudio/010203_5a4289e5.png',
                category: data.category,
                priority: data.priority,
                targetAudience: data.targetAudience,
                requireReadConfirmation: Boolean(data.requireReadConfirmation),
                pinned: Boolean(data.pinned),
                archived: existing?.archived || false,
                attachments: existing?.attachments,
                likes: existing?.likes || [],
                comments: existing?.comments || [],
                readReceipts: existing?.readReceipts || [],
              });
            });
            const existingIds = new Set(loaded.map((l) => l.id));
            return [
              ...loaded,
              ...prev.filter((p) => !existingIds.has(p.id)).map(normalizeAnnouncementTo2027),
            ];
          });
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'announcements')
    );

    // Events listener (preserving existing attendees list)
    const evtQuery = query(
      collection(db, 'events'),
      where('department', 'in', ['Empresa', ...allowedAudiences.slice(1)])
    );
    const unsubEvt = onSnapshot(
      evtQuery,
      (snapshot) => {
        if (!snapshot.empty) {
          setEvents((prev) => {
            const prevMap = new Map(prev.map((p) => [p.id, p]));
            const loaded: CorporateEvent[] = snapshot.docs.map((d) => {
              const data = d.data();
              const existing = prevMap.get(d.id);
              return normalizeEventTo2027({
                id: d.id,
                day: data.day,
                monthShort: data.monthShort,
                dateIso: data.dateIso,
                time: data.time,
                location: data.location,
                title: data.title,
                organizer: data.organizer,
                department: data.department,
                badgeLabel: data.badgeLabel,
                badgeColor: data.badgeColor,
                description: data.description,
                attendees: existing?.attendees || [firebaseUser.uid],
              });
            });
            const existingIds = new Set(loaded.map((l) => l.id));
            return [
              ...loaded,
              ...prev.filter((p) => !existingIds.has(p.id)).map(normalizeEventTo2027),
            ];
          });
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'events')
    );

    // Documents listener
    const docQuery = query(
      collection(db, 'documents'),
      where('allowedDepartments', 'in', allowedAudiences)
    );
    const unsubDoc = onSnapshot(
      docQuery,
      (snapshot) => {
        if (!snapshot.empty) {
          const loaded: CorporateDocument[] = snapshot.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              title: data.title,
              category: data.category,
              version: data.version,
              updatedAt: data.updatedAt,
              author: data.author,
              size: data.size,
              fileType: data.fileType,
              allowedDepartments: data.allowedDepartments || 'Todos',
              description: data.description,
              contentPreview: data.contentPreview,
              pdfUrl: data.pdfUrl,
              attachments: Array.isArray(data.attachments) ? data.attachments : undefined,
            };
          });
          setDocuments((prev) => {
            const existingIds = new Set(loaded.map((l) => l.id));
            return normalizeDocumentsTo2027([
              ...loaded,
              ...prev.filter((p) => !existingIds.has(p.id)),
            ]);
          });
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'documents')
    );

    // Requests listener (scoped to current user's requests, preserving history)
    const reqQuery = query(
      collection(db, 'requests'),
      where('requesterId', '==', firebaseUser.uid)
    );
    const unsubReq = onSnapshot(
      reqQuery,
      (snapshot) => {
        if (!snapshot.empty) {
          setRequests((prev) => {
            const prevMap = new Map(prev.map((p) => [p.id, p]));
            const loaded: InternalRequest[] = snapshot.docs.map((d) => {
              const data = d.data();
              const existing = prevMap.get(d.id);
              return {
                id: d.id,
                protocol: data.protocol,
                requesterId: data.requesterId,
                requesterName: data.requesterName,
                requesterDepartment: data.requesterDepartment,
                targetDepartment: data.targetDepartment,
                subject: data.subject,
                description: data.description,
                priority: data.priority,
                status: data.status,
                createdAtIso: data.createdAtIso,
                originalDueAtIso: data.originalDueAtIso,
                currentDueAtIso: data.currentDueAtIso,
                attachmentName: data.attachmentName,
                history: existing?.history || [
                  {
                    id: `h-${d.id}`,
                    timestamp: 'Registrado no Firestore',
                    actorName: data.requesterName,
                    action: `Protocolo ${data.protocol} sincronizado com SLA de 48h.`,
                  },
                ],
              };
            });
            const existingIds = new Set(loaded.map((l) => l.id));
            return [...loaded, ...prev.filter((p) => !existingIds.has(p.id))];
          });
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'requests')
    );

    // Chats & Corporate Groups listener
    const chatsQuery = query(
      collection(db, 'chats'),
      where('department', 'in', allowedAudiences)
    );
    const unsubChats = onSnapshot(
      chatsQuery,
      (snapshot) => {
        if (!snapshot.empty) {
          const loadedThreads: ChatThread[] = snapshot.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              isGroup: Boolean(data.isGroup),
              name: data.name,
              roleOrDept: data.roleOrDept,
              department: data.department,
              pinnedNotice: data.pinnedNotice,
              participantsCount: data.participantsCount || 2,
              unreadCount: 0,
              messages: [],
            };
          });
          setChats((prev) => {
            const prevMap = new Map(prev.map((p) => [p.id, p]));
            const merged = loadedThreads.map((lt) => {
              const existing = prevMap.get(lt.id);
              return existing
                ? {
                    ...existing,
                    name: lt.name,
                    roleOrDept: lt.roleOrDept,
                    pinnedNotice: lt.pinnedNotice ?? existing.pinnedNotice,
                    participantsCount: lt.participantsCount ?? existing.participantsCount,
                  }
                : lt;
            });
            const loadedIds = new Set(loadedThreads.map((l) => l.id));
            return [...merged, ...prev.filter((p) => !loadedIds.has(p.id))];
          });
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'chats')
    );

    // Notifications listener (scoped to current user or ALL)
    const notifQuery = query(
      collection(db, 'notifications'),
      where('recipientId', 'in', [firebaseUser.uid, 'ALL'])
    );
    const unsubNotif = onSnapshot(
      notifQuery,
      (snapshot) => {
        if (!snapshot.empty) {
          const loadedNotifs: CorporateNotification[] = snapshot.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              type: data.type,
              dotColor: data.dotColor,
              title: data.title,
              subtitle: data.subtitle,
              timeLabel: data.timeLabel,
              read: Boolean(data.read),
              targetSection: data.targetSection as MenuSection,
              targetId: data.targetId,
              recipientId: data.recipientId,
              publicationId: data.publicationId || data.targetId || d.id,
              createdAtIso: data.createdAtIso || '2026-10-28T12:00:00.000Z',
            };
          });
          setNotifications((prev) => {
            const prevMap = new Map(prev.map((p) => [p.id, p]));
            const merged = loadedNotifs.map((ln) => {
              const existing = prevMap.get(ln.id);
              return existing ? { ...ln, read: existing.read || ln.read } : ln;
            });
            const existingIds = new Set(loadedNotifs.map((l) => l.id));
            return [...merged, ...prev.filter((p) => !existingIds.has(p.id))];
          });
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
    );

    // Admin-scoped listeners for Invites & Audit Logs when authenticated as Bootstrapped Admin
    let unsubInvites: (() => void) | null = null;
    let unsubAuditLogs: (() => void) | null = null;

    if (firebaseUser.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()) {
      const invQuery = query(
        collection(db, 'invites'),
        where('status', 'in', ['Pendente', 'Ativado', 'Expirado'])
      );
      unsubInvites = onSnapshot(
        invQuery,
        (snapshot) => {
          if (!snapshot.empty) {
            const loadedInvites: EmployeeInvite[] = snapshot.docs.map((d) => {
              const data = d.data();
              return {
                id: d.id,
                fullName: data.fullName,
                email: data.email,
                roleTitle: data.roleTitle,
                department: data.department,
                accessLevel: data.accessLevel,
                token: data.token,
                expiresAt: data.expiresAt,
                status: data.status,
              };
            });
            setInvites((prev) => {
              const existingIds = new Set(loadedInvites.map((l) => l.id));
              return [...loadedInvites, ...prev.filter((p) => !existingIds.has(p.id))];
            });
          }
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'invites')
      );

      const logsQuery = query(
        collection(db, 'audit_logs'),
        where('role', 'in', ['FUNCIONARIO', 'ADMINISTRADOR', 'DIRETORIA'])
      );
      unsubAuditLogs = onSnapshot(
        logsQuery,
        (snapshot) => {
          if (!snapshot.empty) {
            const loadedLogs: AuditLog[] = snapshot.docs.map((d) => {
              const data = d.data();
              return {
                id: d.id,
                timestamp: data.timestamp,
                actor: data.actor,
                role: data.role,
                action: data.action,
                details: data.details,
              };
            });
            setAuditLogs((prev) => {
              const existingIds = new Set(loadedLogs.map((l) => l.id));
              return [...loadedLogs, ...prev.filter((p) => !existingIds.has(p.id))];
            });
          }
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'audit_logs')
      );
    }

    // Fretes Financeiro listener (real-time synchronized operations)
    const fretesQuery = query(
      collection(db, 'fretes_financeiro'),
      where('status', 'in', [
        'Pendente Adiantamento',
        'Adiantamento Pago',
        'Aguardando Entrega',
        'Pendente Saldo',
        'Pago',
      ])
    );
    const unsubFretes = onSnapshot(
      fretesQuery,
      (snapshot) => {
        if (!snapshot.empty) {
          setFreights((prev) => {
            const prevMap = new Map(prev.map((f) => [f.id, f]));
            const loaded: FreightRecord[] = snapshot.docs.map((d) => {
              const data = d.data();
              const existing = prevMap.get(d.id);
              return {
                id: d.id,
                code: data.code,
                createdAtDate: data.createdAtDate,
                createdAtIso: data.createdAtIso,
                empresaMarca: data.empresaMarca || existing?.empresaMarca || 'RODOVAR',
                dataCarregamento: data.dataCarregamento || existing?.dataCarregamento,
                unidadeOperacional: data.unidadeOperacional || existing?.unidadeOperacional || 'BA - Salvador',
                comercialResponsavel: data.comercialResponsavel || existing?.comercialResponsavel,
                expedicaoResponsavel: data.expedicaoResponsavel || existing?.expedicaoResponsavel,
                cliente: data.cliente,
                telefoneCliente: data.telefoneCliente || existing?.telefoneCliente,
                motoristaNome: data.motoristaNome || existing?.motoristaNome,
                motoristaTelefone: data.motoristaTelefone || existing?.motoristaTelefone,
                emergenciaNome: data.emergenciaNome || existing?.emergenciaNome,
                emergenciaTelefone: data.emergenciaTelefone || existing?.emergenciaTelefone,
                origem: data.origem,
                destino: data.destino,
                dataColeta: data.dataColeta,
                dataEntrega: data.dataEntrega,
                valorFreteEmpresa: data.valorFreteEmpresa || existing?.valorFreteEmpresa,
                valorFreteMotorista: data.valorFreteMotorista || existing?.valorFreteMotorista,
                regraTipo: data.regraTipo,
                regraLabel: data.regraLabel,
                percentualAdiantamento: data.percentualAdiantamento,
                percentualSaldo: data.percentualSaldo,
                valorTotal: data.valorTotal,
                valorAdiantamento: data.valorAdiantamento,
                valorSaldo: data.valorSaldo,
                favorecido: data.favorecido,
                banco: data.banco,
                agencia: data.agencia,
                conta: data.conta,
                tipoChavePix: data.tipoChavePix,
                chavePix: data.chavePix,
                status: data.status,
                adiantamentoPago: Boolean(data.adiantamentoPago),
                adiantamentoPagoEm: data.adiantamentoPagoEm || existing?.adiantamentoPagoEm,
                codigoTransacaoAdiantamento: data.codigoTransacaoAdiantamento || existing?.codigoTransacaoAdiantamento,
                entregaConfirmada: Boolean(data.entregaConfirmada),
                entregaConfirmadaEm: data.entregaConfirmadaEm || existing?.entregaConfirmadaEm,
                saldoPago: Boolean(data.saldoPago),
                saldoPagoEm: data.saldoPagoEm || existing?.saldoPagoEm,
                codigoTransacaoSaldo: data.codigoTransacaoSaldo || existing?.codigoTransacaoSaldo,
                observacoes: data.observacoes || existing?.observacoes,
                solicitanteNome: data.solicitanteNome,
                docs: existing?.docs || {},
              };
            });
            const existingIds = new Set(loaded.map((l) => l.id));
            return [...loaded, ...prev.filter((p) => !existingIds.has(p.id))];
          });
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'fretes_financeiro')
    );

    return () => {
      unsubAnn();
      unsubEvt();
      unsubDoc();
      unsubReq();
      unsubChats();
      unsubNotif();
      unsubFretes();
      if (unsubInvites) unsubInvites();
      if (unsubAuditLogs) unsubAuditLogs();
    };
  }, [authReady, firebaseUser]);

  const handleMarkNotificationRead = async (notifId: string) => {
    if(notifId.startsWith('agenda:')){const response=await fetch('/api/agenda/read',{method:'POST',headers:getAuthHeaders(),body:JSON.stringify({ids:[notifId]})});if(!response.ok)return;}
    if(notifId.startsWith('mural:')){const response=await fetch('/api/mural/notifications/read',{method:'POST',headers:getAuthHeaders(),body:JSON.stringify({ids:[notifId]})});if(!response.ok)return;}
    setNotifications((prev) =>
      prev.map((item) => (item.id === notifId ? { ...item, read: true } : item))
    );
    if (notifId.startsWith('queue:')) {
      const notification=notifications.find(n=>n.id===notifId);
      if(notification?.targetId) await fetch('/api/requests/'+notification.targetId+'/read',{method:'POST',headers:getAuthHeaders(),body:'{}'});
    }
    if (notifId.startsWith('fnotif-')) {
      void apiMarkFreightNotificationRead(notifId);
    }
    if (firebaseUser) {
      try {
        await updateDoc(doc(db, 'notifications', notifId), { read: true });
      } catch (err) {
        console.debug('Notification read sync info:', err);
      }
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    const agendaIds=notifications.filter(n=>n.id.startsWith('agenda:')&&!n.read).map(n=>n.id);if(agendaIds.length)await fetch('/api/agenda/read',{method:'POST',headers:getAuthHeaders(),body:JSON.stringify({ids:agendaIds})});
    const muralIds=notifications.filter(n=>n.id.startsWith('mural:')&&!n.read).map(n=>n.id);if(muralIds.length){const response=await fetch('/api/mural/notifications/read',{method:'POST',headers:getAuthHeaders(),body:JSON.stringify({ids:muralIds})});if(!response.ok)return;}
    await Promise.all(notifications.filter(n=>n.id.startsWith('fnotif-')&&!n.read).map(n=>apiMarkFreightNotificationRead(n.id)));
    await Promise.all(notifications.filter(n=>n.id.startsWith('queue:') && !n.read && n.targetId).map(n=>fetch('/api/requests/'+n.targetId+'/read',{method:'POST',headers:getAuthHeaders(),body:'{}'})));
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const handleAccessNotification = (n:CorporateNotification) => {
    const url=notificationUrl(n,SECTION_TO_PATH);
    if(!url || !hasPagePermission(currentUser,n.targetSection)){setNotificationNavigationError('Este aviso não possui um registro acessível vinculado.');return;}
    setNotificationNavigationError('');
    void handleMarkNotificationRead(n.id);
    window.history.pushState({section:n.targetSection},'',url);
    if(n.targetSection.startsWith('fretes_'))setSelectedNotificationFreightId(notificationRecord(n)||null);
    setActiveSection(n.targetSection);
    window.dispatchEvent(new Event('rodovar:record'));
    setShowNotificationsPopover(false);setShowNotificationsCenterModal(false);
  };
  const handleDeleteNotification = async (notifId: string) => {
    if(notifId.startsWith('mural:')){const response=await fetch('/api/mural/notifications/read',{method:'POST',headers:getAuthHeaders(),body:JSON.stringify({ids:[notifId],dismiss:true})});if(!response.ok)return;}
    setNotifications((prev) => prev.filter((n) => n.id !== notifId));
    if (firebaseUser) {
      try {
        await deleteDoc(doc(db, 'notifications', notifId));
      } catch (err) {
        console.debug('Delete notification sync info:', err);
      }
    }
  };

  // Server-Validated Credential Login Handler
  const handleServerAuthenticated = async (
    userOrPayload:
      | Employee
      | {
          user: Employee;
          systemConfig?: SystemConfig;
          pendingAccessRequestsCount?: number;
        },
    _rememberMe?: boolean,
    configArg?: SystemConfig
  ) => {
    const emp =
      userOrPayload && 'user' in userOrPayload ? userOrPayload.user : (userOrPayload as Employee);
    if (!emp || !emp.id) return;
    // Called only after server-validated authentication.
    authenticatedPanelRelease.current?.();
    authenticatedPanelRelease.current = portalLoading.begin();
    setPreparingAuthenticatedPanel(true);
    try {

    const resolvedConfig =
      userOrPayload && 'user' in userOrPayload ? userOrPayload.systemConfig : configArg;
    if (resolvedConfig) {
      setSystemConfig(resolvedConfig);
    }
    if (
      userOrPayload &&
      'user' in userOrPayload &&
      typeof userOrPayload.pendingAccessRequestsCount === 'number'
    ) {
      setPendingAccessRequestsCount(userOrPayload.pendingAccessRequestsCount);
    }

    setEmployees((prev) => {
      const cleanPrev = prev.filter((e) => e && typeof e === 'object' && e.id);
      const exists = cleanPrev.some((e) => e.id === emp.id);
      return exists
        ? cleanPrev.map((e) => (e.id === emp.id ? { ...e, ...emp } : e))
        : [emp, ...cleanPrev];
    });
    setCurrentUserId(emp.id);
    setIsAuthenticated(true);

    let nextSection: MenuSection = permittedHome(emp) as MenuSection;
    try {
      const intended = sessionStorage.getItem('rodovar_intended_section_v1') as MenuSection | null;
      if (intended) {
        sessionStorage.removeItem('rodovar_intended_section_v1');
        if (
          intended === 'inicio' ||
          intended === 'perfil' ||
          intended === 'ajuda' ||
          hasPagePermission(emp, intended)
        ) {
          nextSection = intended;
        }
      }
    } catch {
      // ignore
    }
    setActiveSection(nextSection);

    if (emp.accessLevel === 'ADMINISTRADOR') {
      try {
        const adminData = await apiFetchAdminAccessRequests();
        if(adminData.ok){setPendingAccessRequestsCount(adminData.pendingCount);
        setEmployees(adminData.accounts);}
      } catch {
        // ignore
      }
    }

    await recordAuditLog(
      'LOGIN_CREDENCIAL_CORPORATIVA',
      `Acesso autenticado via servidor (${emp.email} • ${emp.department}).`,
      emp.name,
      emp.accessLevel
    );
    } finally { setPreparingAuthenticatedPanel(false); }
  };

  const handleLogout = async () => {
    try {
      await apiLogout();
      await clearSensitiveDataOnLogout();
      await clearSharedReceiptDraft();
      clearOfflinePendingReceiptsForUser(currentUser.id);
      setPendingSharedDraft(null);
    } catch (err) {
      console.debug('Session clear info:', err);
    }
    if (firebaseUser) {
      await firebaseSignOut(auth);
    }
    setIsAuthenticated(false);
    setShowProfileDropdown(false);
    try {
      if (typeof window !== 'undefined' && window.location.pathname !== '/') {
        window.history.replaceState({}, '', '/');
      }
    } catch {
      // ignore
    }
  };

  // Deduplicated and newest-first sorted notifications (Requirement 10)
  const sortedUniqueNotifications = orderedNotifications(notifications,currentUser.id).filter(n=>hasPagePermission(currentUser,n.targetSection));

  // Derived Badges
  const unreadAnnouncementsCount = announcements.filter(
    (a) =>
      !a.archived &&
      a.requireReadConfirmation &&
      !a.readReceipts.some((r) => r.userId === currentUser.id)
  ).length;

  const openRequestsCount = requests.filter(
    (r) =>
      r.status !== 'Concluída' &&
      r.status !== 'Cancelada'
  ).length;

  const unreadNotificationsCount = sortedUniqueNotifications.filter((n) => !n.read).length;

  const featuredAnnouncement =
    announcements[featuredIndex % Math.max(1, announcements.length)] ||
    INITIAL_ANNOUNCEMENTS[0];

  // Handlers with Cloud Firestore Persistence
  const handleConfirmRead = async (annId: string) => {
    const nowStr = new Date().toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    setAnnouncements((prev) =>
      prev.map((a) => {
        if (a.id !== annId) return a;
        if (a.readReceipts.some((r) => r.userId === currentUser.id)) return a;
        return {
          ...a,
          readReceipts: [
            ...a.readReceipts,
            {
              userId: currentUser.id,
              userName: currentUser.name,
              department: currentUser.department,
              confirmedAt: nowStr,
            },
          ],
        };
      })
    );

    if (selectedAnnouncementModal?.id === annId) {
      setSelectedAnnouncementModal((prev) =>
        prev
          ? {
              ...prev,
              readReceipts: [
                ...prev.readReceipts,
                {
                  userId: currentUser.id,
                  userName: currentUser.name,
                  department: currentUser.department,
                  confirmedAt: nowStr,
                },
              ],
            }
          : null
      );
    }

    if (firebaseUser) {
      const readPath = `announcements/${annId}/reads/${firebaseUser.uid}`;
      try {
        await setDoc(doc(db, 'announcements', annId, 'reads', firebaseUser.uid), {
          announcementId: annId,
          userId: firebaseUser.uid,
          userName: currentUser.name.slice(0, 120),
          department: currentUser.department.slice(0, 60),
          confirmedAt: nowStr.slice(0, 40),
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        console.debug('Read receipt saved locally:', readPath, err);
      }
    }
  };

  const handleToggleLike = async (annId: string) => {
    const targetAnn = announcements.find((a) => a.id === annId);
    const alreadyLiked = targetAnn?.likes.includes(currentUser.id);

    setAnnouncements((prev) =>
      prev.map((a) => {
        if (a.id !== annId) return a;
        const exists = a.likes.includes(currentUser.id);
        return {
          ...a,
          likes: exists
            ? a.likes.filter((id) => id !== currentUser.id)
            : [...a.likes, currentUser.id],
        };
      })
    );

    if (firebaseUser) {
      const likeRef = doc(db, 'announcements', annId, 'likes', firebaseUser.uid);
      try {
        if (alreadyLiked) {
          await deleteDoc(likeRef);
        } else {
          await setDoc(likeRef, {
            announcementId: annId,
            userId: firebaseUser.uid,
            createdAt: serverTimestamp(),
          });
        }
      } catch (err) {
        console.debug('Like sync info:', err);
      }
    }
  };

  const handleAddComment = async (annId: string, text: string) => {
    const nowStr = new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const commentId = `c-${Date.now()}`;
    const createdAtFormatted = `Hoje às ${nowStr}`;

    setAnnouncements((prev) =>
      prev.map((a) => {
        if (a.id !== annId) return a;
        return {
          ...a,
          comments: [
            ...a.comments,
            {
              id: commentId,
              authorId: currentUser.id,
              authorName: currentUser.name,
              authorRole: currentUser.roleTitle,
              authorAvatar: currentUser.avatar,
              content: text,
              createdAt: createdAtFormatted,
            },
          ],
        };
      })
    );

    if (firebaseUser) {
      try {
        await setDoc(doc(db, 'announcements', annId, 'comments', commentId), {
          announcementId: annId,
          authorId: firebaseUser.uid,
          authorName: currentUser.name.slice(0, 120),
          authorRole: currentUser.roleTitle.slice(0, 120),
          authorAvatar: currentUser.avatar.slice(0, 300),
          content: text.slice(0, 1000),
          createdAtFormatted: createdAtFormatted.slice(0, 40),
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        console.debug('Comment sync info:', err);
      }
    }
  };

  const handleDeleteComment = async (annId: string, commentId: string) => {
    setAnnouncements((prev) =>
      prev.map((a) => {
        if (a.id !== annId) return a;
        return {
          ...a,
          comments: a.comments.filter((c) => c.id !== commentId),
        };
      })
    );

    if (firebaseUser) {
      try {
        await deleteDoc(doc(db, 'announcements', annId, 'comments', commentId));
      } catch (err) {
        console.debug('Delete comment sync info:', err);
      }
    }
  };

  const handleUpdateAnnouncement = async (
    annId: string,
    updates: Partial<Announcement>,
    editNote: string
  ) => {
    const nowStr = new Date().toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    setAnnouncements((prev) =>
      prev.map((a) => {
        if (a.id !== annId) return a;
        const newEntry = {
          id: `ed-${Date.now()}`,
          editedAt: nowStr,
          editorName: currentUser.name,
          editorRole: currentUser.accessLevel,
          note: editNote,
        };
        return {
          ...a,
          ...updates,
          editHistory: [newEntry, ...(a.editHistory || [])],
        };
      })
    );

    setAuditLogs((prev) => [
      {
        id: `aud-${Date.now()}`,
        timestamp: nowStr,
        actor: currentUser.name,
        role: currentUser.accessLevel,
        action: 'EDICAO_COMUNICADO',
        details: `Editou comunicado "${updates.title || annId}": ${editNote}`,
      },
      ...prev,
    ]);

    if (firebaseUser) {
      try {
        const fsUpdates: Record<string, unknown> = {};
        if (updates.title) fsUpdates.title = updates.title.slice(0, 180);
        if (updates.summary) fsUpdates.summary = updates.summary.slice(0, 400);
        if (updates.content) fsUpdates.content = updates.content.slice(0, 5000);
        if (updates.category) fsUpdates.category = updates.category;
        if (updates.priority) fsUpdates.priority = updates.priority;
        if (updates.targetAudience)
          fsUpdates.targetAudience = String(updates.targetAudience).slice(0, 60);
        if (typeof updates.requireReadConfirmation === 'boolean')
          fsUpdates.requireReadConfirmation = updates.requireReadConfirmation;
        if (typeof updates.pinned === 'boolean') fsUpdates.pinned = updates.pinned;
        if (updates.coverImage && updates.coverImage.length <= 300)
          fsUpdates.coverImage = updates.coverImage;

        await updateDoc(doc(db, 'announcements', annId), fsUpdates);
      } catch (err) {
        console.debug('Announcement update local/Firestore info:', err);
      }
    }
  };

  const handleTogglePinAnnouncement = async (annId: string) => {
    let nextPinned = false;
    setAnnouncements((prev) =>
      prev.map((a) => {
        if (a.id !== annId) return a;
        nextPinned = !a.pinned;
        return { ...a, pinned: nextPinned };
      })
    );

    if (firebaseUser) {
      try {
        await updateDoc(doc(db, 'announcements', annId), { pinned: nextPinned });
      } catch (err) {
        console.debug('Pin sync info:', err);
      }
    }
  };

  const handleToggleArchiveAnnouncement = async (annId: string) => {
    let nextArchived = false;
    setAnnouncements((prev) =>
      prev.map((a) => {
        if (a.id !== annId) return a;
        nextArchived = !a.archived;
        return { ...a, archived: nextArchived };
      })
    );

    if (firebaseUser) {
      try {
        await updateDoc(doc(db, 'announcements', annId), { archived: nextArchived });
      } catch (err) {
        console.debug('Archive sync info:', err);
      }
    }
  };

  const handleDeleteAnnouncement = async (annId: string) => {
    const target = announcements.find((a) => a.id === annId);
    setAnnouncements((prev) => prev.filter((a) => a.id !== annId));
    if (selectedAnnouncementModal?.id === annId) {
      setSelectedAnnouncementModal(null);
    }
    if (target) {
      await recordAuditLog(
        'EXCLUSAO_COMUNICADO',
        `Excluiu o comunicado oficial: "${target.title}"`
      );
    }
    if (firebaseUser) {
      try {
        await deleteDoc(doc(db, 'announcements', annId));
      } catch (err) {
        console.debug('Delete announcement sync info:', err);
      }
    }
  };

  const handleCreateAnnouncement = async (
    newAnn: Omit<
      Announcement,
      'id' | 'likes' | 'comments' | 'readReceipts' | 'createdAtIso' | 'dateFormatted'
    >
  ) => {
    const now = new Date();
    const annId = `ann-${Date.now()}`;
    const dateFormatted = now.toLocaleDateString('pt-BR');

    const created: Announcement = {
      ...newAnn,
      id: annId,
      dateFormatted,
      createdAtIso: now.toISOString(),
      likes: [],
      comments: [],
      readReceipts: [],
    };
    setAnnouncements((prev) => {
      if (prev.some((a) => a.id === created.id || a.title.trim() === created.title.trim())) {
        return prev;
      }
      return [created, ...prev];
    });
    setNotifications((prev) => {
      const pubId = `pub-ann-${created.id}`;
      if (prev.some((n) => n.publicationId === pubId || n.targetId === created.id)) {
        return prev;
      }
      return [
        {
          id: `not-${created.id}`,
          type: 'comunicado',
          dotColor: 'red',
          title: 'Novo comunicado publicado',
          subtitle: created.title,
          timeLabel: 'Agora',
          read: false,
          targetSection: 'comunicados',
          targetId: created.id,
          recipientId: currentUser.id,
          publicationId: pubId,
          createdAtIso: now.toISOString(),
        },
        ...prev,
      ];
    });
    setAuditLogs((prev) => [
      {
        id: `aud-${Date.now()}`,
        timestamp: now.toLocaleString('pt-BR'),
        actor: currentUser.name,
        role: currentUser.accessLevel,
        action: 'PUBLICACAO_COMUNICADO',
        details: `Publicou comunicado oficial: "${created.title}"`,
      },
      ...prev,
    ]);

    if (firebaseUser) {
      try {
        await setDoc(doc(db, 'announcements', annId), {
          title: created.title.slice(0, 180),
          summary: created.summary.slice(0, 400),
          content: created.content.slice(0, 5000),
          authorId: firebaseUser.uid,
          authorName: currentUser.name.slice(0, 120),
          department: created.department.slice(0, 60),
          dateFormatted: dateFormatted.slice(0, 30),
          coverImage: (created.coverImage || '/assets/aistudio/010203_5a4289e5.png').slice(0, 300),
          category: created.category,
          priority: created.priority,
          targetAudience: String(created.targetAudience).slice(0, 60),
          requireReadConfirmation: Boolean(created.requireReadConfirmation),
          pinned: Boolean(created.pinned),
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `announcements/${annId}`);
      }
    }
  };

  const handleCreateRequest = async (reqData: {
    targetDepartment: Department;
    subject: string;
    description: string;
    priority: 'Baixa' | 'Média' | 'Alta' | 'Urgente';
    attachmentName?: string;
  }) => {
    const now = new Date();
    const due48h = new Date(now.getTime() + 48 * 3600 * 1000);
    const nextProtocolNum = 1026 + requests.length;
    const protocol = `#${nextProtocolNum}`;
    const reqId = `req-${nextProtocolNum}`;

    const newReq: InternalRequest = {
      id: reqId,
      protocol,
      requesterId: currentUser.id,
      requesterName: currentUser.name,
      requesterDepartment: currentUser.department,
      targetDepartment: reqData.targetDepartment,
      subject: reqData.subject,
      description: reqData.description,
      priority: reqData.priority,
      status: 'Aberta',
      createdAtIso: now.toISOString(),
      originalDueAtIso: due48h.toISOString(),
      currentDueAtIso: due48h.toISOString(),
      attachmentName: reqData.attachmentName,
      history: [
        {
          id: `h-${Date.now()}`,
          timestamp: 'Agora',
          actorName: currentUser.name,
          action: `Solicitação aberta com protocolo ${protocol} e prazo automático de 48h corridas.`,
        },
      ],
    };

    setRequests((prev) => [newReq, ...prev]);
    setNotifications((prev) => {
      const pubId = `pub-req-${newReq.id}`;
      if (prev.some((n) => n.publicationId === pubId || n.targetId === newReq.id)) {
        return prev;
      }
      return [
        {
          id: `not-${newReq.id}`,
          type: 'solicitacao',
          dotColor: 'blue',
          title: 'Nova solicitação registrada',
          subtitle: `Protocolo ${protocol} • Prazo 48h`,
          timeLabel: 'Agora',
          read: false,
          targetSection: 'solicitacoes',
          targetId: newReq.id,
          recipientId: currentUser.id,
          publicationId: pubId,
          createdAtIso: now.toISOString(),
        },
        ...prev,
      ];
    });

    if (firebaseUser) {
      try {
        const payload: Record<string, unknown> = {
          protocol: protocol.slice(0, 30),
          requesterId: firebaseUser.uid,
          requesterName: currentUser.name.slice(0, 120),
          requesterDepartment: currentUser.department.slice(0, 60),
          targetDepartment: reqData.targetDepartment.slice(0, 60),
          subject: reqData.subject.slice(0, 200),
          description: reqData.description.slice(0, 3000),
          priority: reqData.priority,
          status: 'Aberta',
          createdAtIso: newReq.createdAtIso.slice(0, 40),
          originalDueAtIso: newReq.originalDueAtIso.slice(0, 40),
          currentDueAtIso: newReq.currentDueAtIso.slice(0, 40),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (reqData.attachmentName) {
          payload.attachmentName = reqData.attachmentName.slice(0, 200);
        }
        await setDoc(doc(db, 'requests', reqId), payload);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `requests/${reqId}`);
      }
    }
  };

  const handleUpdateRequestStatus = async (
    reqId: string,
    status: RequestStatus,
    note?: string
  ) => {
    setRequests((prev) =>
      prev.map((r) => {
        if (r.id !== reqId) return r;
        return {
          ...r,
          status,
          history: [
            ...r.history,
            {
              id: `h-${Date.now()}`,
              timestamp: 'Agora',
              actorName: `${currentUser.name} (${currentUser.department})`,
              action: `Status atualizado para ${status}`,
              note,
            },
          ],
        };
      })
    );

    if (firebaseUser) {
      try {
        await updateDoc(doc(db, 'requests', reqId), {
          status,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        console.debug('Status update local/Firestore info:', err);
      }
    }
  };

  const handleExtendRequestDeadline = async (
    reqId: string,
    extraHours: number,
    justification: string
  ) => {
    let updatedDueIso = '';
    setRequests((prev) =>
      prev.map((r) => {
        if (r.id !== reqId) return r;
        updatedDueIso = new Date(
          new Date(r.currentDueAtIso).getTime() + extraHours * 3600 * 1000
        ).toISOString();
        return {
          ...r,
          currentDueAtIso: updatedDueIso,
          history: [
            ...r.history,
            {
              id: `h-${Date.now()}`,
              timestamp: 'Agora',
              actorName: currentUser.name,
              action: `Prazo prorrogado em +${extraHours}h (Prazo original preservado)`,
              note: justification,
            },
          ],
        };
      })
    );

    if (firebaseUser && updatedDueIso) {
      try {
        await updateDoc(doc(db, 'requests', reqId), {
          currentDueAtIso: updatedDueIso.slice(0, 40),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        console.debug('Deadline extension info:', err);
      }
    }
  };

  const handleAddRequestResponse = async (reqId: string, responseNote: string) => {
    const histId = `h-${Date.now()}`;
    const nowStr = new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const timestamp = `Hoje às ${nowStr}`;

    setRequests((prev) =>
      prev.map((r) => {
        if (r.id !== reqId) return r;
        return {
          ...r,
          history: [
            ...r.history,
            {
              id: histId,
              timestamp,
              actorName: `${currentUser.name} (${currentUser.department})`,
              action: 'Parecer / Acompanhamento registrado no protocolo',
              note: responseNote,
            },
          ],
        };
      })
    );

    if (firebaseUser) {
      try {
        await setDoc(doc(db, 'requests', reqId, 'history', histId), {
          requestId: reqId,
          actorId: firebaseUser.uid,
          actorName: currentUser.name.slice(0, 120),
          action: 'Parecer / Acompanhamento registrado no protocolo',
          note: responseNote.slice(0, 500),
          timestamp: timestamp.slice(0, 40),
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        console.debug('Request history sync info:', err);
      }
    }
  };

  const handleEscalateRequestToDiretoria = async (reqId: string, reason: string) => {
    const histId = `h-${Date.now()}`;
    const nowStr = new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });

    setRequests((prev) =>
      prev.map((r) => {
        if (r.id !== reqId) return r;
        return {
          ...r,
          targetDepartment: 'Diretoria',
          priority: 'Urgente',
          status: 'Em análise',
          history: [
            ...r.history,
            {
              id: histId,
              timestamp: `Hoje às ${nowStr}`,
              actorName: `${currentUser.name} (${currentUser.accessLevel})`,
              action: 'Solicitação escalonada oficialmente para a Diretoria Executiva',
              note: reason,
            },
          ],
        };
      })
    );

    setAuditLogs((prev) => [
      {
        id: `aud-${Date.now()}`,
        timestamp: new Date().toLocaleString('pt-BR'),
        actor: currentUser.name,
        role: currentUser.accessLevel,
        action: 'ESCALONAMENTO_DIRETORIA',
        details: `Escalonou chamado ${reqId} para a Diretoria: ${reason}`,
      },
      ...prev,
    ]);

    if (firebaseUser) {
      try {
        await updateDoc(doc(db, 'requests', reqId), {
          targetDepartment: 'Diretoria',
          priority: 'Urgente',
          status: 'Em análise',
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        console.debug('Escalate request sync info:', err);
      }
    }
  };

  const handleDeleteRequest = async (reqId: string) => {
    const target = requests.find((r) => r.id === reqId);
    setRequests((prev) => prev.filter((r) => r.id !== reqId));
    if (target) {
      await recordAuditLog(
        'EXCLUSAO_PROTOCOLO_SLA',
        `Excluiu protocolo interno ${target.protocol} ("${target.subject}")`
      );
    }
    if (firebaseUser) {
      try {
        await deleteDoc(doc(db, 'requests', reqId));
      } catch (err) {
        console.debug('Delete request sync info:', err);
      }
    }
  };

  const handleRestorePortalDefaults = async () => {
    // Account records are restored only through an authenticated server operation.
    setAnnouncements(INITIAL_ANNOUNCEMENTS);
    setNotifications(INITIAL_NOTIFICATIONS);
    setEvents(INITIAL_EVENTS);
    setRequests(INITIAL_REQUESTS);
    setDocuments(INITIAL_DOCUMENTS);
    setChats(INITIAL_CHATS);
    setInvites(INITIAL_INVITES);
    setFreights(INITIAL_FREIGHTS);
    await recordAuditLog(
      'RESTAURACAO_PADRAO_PORTAL',
      'Restaurou o conteúdo demonstrativo original do portal preservando o Administrador Master.'
    );
  };

  const handleAddFreight = async (newFreight: FreightRecord) => {
    setFreights((prev) => [newFreight, ...prev]);
    await recordAuditLog(
      'SOLICITACAO_PAGAMENTO_FRETE',
      `Registrou frete ${newFreight.code} (${newFreight.cliente}) • Rota ${newFreight.origem} ➔ ${newFreight.destino} • Total R$ ${newFreight.valorTotal.toFixed(2)}`
    );
    if (firebaseUser) {
      try {
        const payload: Record<string, unknown> = {
          code: newFreight.code.slice(0, 20),
          createdAtDate: newFreight.createdAtDate.slice(0, 20),
          createdAtIso: newFreight.createdAtIso.slice(0, 40),
          empresaMarca: newFreight.empresaMarca || 'RODOVAR',
          dataCarregamento: (newFreight.dataCarregamento || newFreight.createdAtDate).slice(0, 20),
          unidadeOperacional: newFreight.unidadeOperacional || 'BA - Salvador',
          comercialResponsavel: (newFreight.comercialResponsavel || 'Jeise / César').slice(0, 120),
          expedicaoResponsavel: (newFreight.expedicaoResponsavel || 'Marcos Silva').slice(0, 120),
          cliente: newFreight.cliente.slice(0, 120),
          origem: newFreight.origem.slice(0, 140),
          destino: newFreight.destino.slice(0, 140),
          dataColeta: newFreight.dataColeta.slice(0, 20),
          dataEntrega: newFreight.dataEntrega.slice(0, 20),
          valorFreteEmpresa: newFreight.valorFreteEmpresa || newFreight.valorTotal,
          valorFreteMotorista: newFreight.valorFreteMotorista || newFreight.valorTotal,
          regraTipo: newFreight.regraTipo,
          regraLabel: newFreight.regraLabel.slice(0, 40),
          percentualAdiantamento: newFreight.percentualAdiantamento,
          percentualSaldo: newFreight.percentualSaldo,
          valorTotal: newFreight.valorTotal,
          valorAdiantamento: newFreight.valorAdiantamento,
          valorSaldo: newFreight.valorSaldo,
          favorecido: newFreight.favorecido.slice(0, 120),
          banco: newFreight.banco.slice(0, 80),
          agencia: newFreight.agencia.slice(0, 30),
          conta: newFreight.conta.slice(0, 40),
          tipoChavePix: newFreight.tipoChavePix,
          chavePix: newFreight.chavePix.slice(0, 120),
          status: newFreight.status,
          adiantamentoPago: Boolean(newFreight.adiantamentoPago),
          entregaConfirmada: Boolean(newFreight.entregaConfirmada),
          saldoPago: Boolean(newFreight.saldoPago),
          solicitanteNome: newFreight.solicitanteNome.slice(0, 120),
          updatedAt: serverTimestamp(),
        };
        if (newFreight.telefoneCliente) payload.telefoneCliente = newFreight.telefoneCliente.slice(0, 30);
        if (newFreight.motoristaNome) payload.motoristaNome = newFreight.motoristaNome.slice(0, 120);
        if (newFreight.motoristaTelefone) payload.motoristaTelefone = newFreight.motoristaTelefone.slice(0, 30);
        if (newFreight.emergenciaNome) payload.emergenciaNome = newFreight.emergenciaNome.slice(0, 120);
        if (newFreight.emergenciaTelefone) payload.emergenciaTelefone = newFreight.emergenciaTelefone.slice(0, 30);
        if (newFreight.observacoes) payload.observacoes = newFreight.observacoes.slice(0, 1000);

        await setDoc(doc(db, 'fretes_financeiro', newFreight.id), payload);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `fretes_financeiro/${newFreight.id}`);
      }
    }
  };

  const handleUpdateFreight = async (updatedFreight: FreightRecord, auditDescription: string) => {
    setFreights((prev) =>
      prev.map((f) => (f.id === updatedFreight.id ? updatedFreight : f))
    );
    await recordAuditLog('ATUALIZACAO_FINANCEIRO_FRETE', auditDescription);
    if (firebaseUser) {
      try {
        const payload: Record<string, unknown> = {
          code: updatedFreight.code.slice(0, 20),
          createdAtDate: updatedFreight.createdAtDate.slice(0, 20),
          createdAtIso: updatedFreight.createdAtIso.slice(0, 40),
          empresaMarca: updatedFreight.empresaMarca || 'RODOVAR',
          dataCarregamento: (updatedFreight.dataCarregamento || updatedFreight.createdAtDate).slice(0, 20),
          unidadeOperacional: updatedFreight.unidadeOperacional || 'BA - Salvador',
          comercialResponsavel: (updatedFreight.comercialResponsavel || 'Jeise / César').slice(0, 120),
          expedicaoResponsavel: (updatedFreight.expedicaoResponsavel || 'Marcos Silva').slice(0, 120),
          cliente: updatedFreight.cliente.slice(0, 120),
          origem: updatedFreight.origem.slice(0, 140),
          destino: updatedFreight.destino.slice(0, 140),
          dataColeta: updatedFreight.dataColeta.slice(0, 20),
          dataEntrega: updatedFreight.dataEntrega.slice(0, 20),
          valorFreteEmpresa: updatedFreight.valorFreteEmpresa || updatedFreight.valorTotal,
          valorFreteMotorista: updatedFreight.valorFreteMotorista || updatedFreight.valorTotal,
          regraTipo: updatedFreight.regraTipo,
          regraLabel: updatedFreight.regraLabel.slice(0, 40),
          percentualAdiantamento: updatedFreight.percentualAdiantamento,
          percentualSaldo: updatedFreight.percentualSaldo,
          valorTotal: updatedFreight.valorTotal,
          valorAdiantamento: updatedFreight.valorAdiantamento,
          valorSaldo: updatedFreight.valorSaldo,
          favorecido: updatedFreight.favorecido.slice(0, 120),
          banco: updatedFreight.banco.slice(0, 80),
          agencia: updatedFreight.agencia.slice(0, 30),
          conta: updatedFreight.conta.slice(0, 40),
          tipoChavePix: updatedFreight.tipoChavePix,
          chavePix: updatedFreight.chavePix.slice(0, 120),
          status: updatedFreight.status,
          adiantamentoPago: Boolean(updatedFreight.adiantamentoPago),
          entregaConfirmada: Boolean(updatedFreight.entregaConfirmada),
          saldoPago: Boolean(updatedFreight.saldoPago),
          solicitanteNome: updatedFreight.solicitanteNome.slice(0, 120),
          updatedAt: serverTimestamp(),
        };
        if (updatedFreight.telefoneCliente) payload.telefoneCliente = updatedFreight.telefoneCliente.slice(0, 30);
        if (updatedFreight.motoristaNome) payload.motoristaNome = updatedFreight.motoristaNome.slice(0, 120);
        if (updatedFreight.motoristaTelefone) payload.motoristaTelefone = updatedFreight.motoristaTelefone.slice(0, 30);
        if (updatedFreight.emergenciaNome) payload.emergenciaNome = updatedFreight.emergenciaNome.slice(0, 120);
        if (updatedFreight.emergenciaTelefone) payload.emergenciaTelefone = updatedFreight.emergenciaTelefone.slice(0, 30);
        if (updatedFreight.adiantamentoPagoEm) payload.adiantamentoPagoEm = updatedFreight.adiantamentoPagoEm.slice(0, 40);
        if (updatedFreight.codigoTransacaoAdiantamento) payload.codigoTransacaoAdiantamento = updatedFreight.codigoTransacaoAdiantamento.slice(0, 60);
        if (updatedFreight.entregaConfirmadaEm) payload.entregaConfirmadaEm = updatedFreight.entregaConfirmadaEm.slice(0, 40);
        if (updatedFreight.saldoPagoEm) payload.saldoPagoEm = updatedFreight.saldoPagoEm.slice(0, 40);
        if (updatedFreight.codigoTransacaoSaldo) payload.codigoTransacaoSaldo = updatedFreight.codigoTransacaoSaldo.slice(0, 60);
        if (updatedFreight.observacoes) payload.observacoes = updatedFreight.observacoes.slice(0, 1000);

        await setDoc(doc(db, 'fretes_financeiro', updatedFreight.id), payload, { merge: true });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `fretes_financeiro/${updatedFreight.id}`);
      }
    }
  };

  const handleImportPortalBackup = (backupData: Record<string, unknown>): boolean => {
    if(currentUser.id!=='emp-admin-master'||currentUser.accessLevel!=='ADMINISTRADOR'||!validatePortalBackup(backupData).valid)return false;
    try {
      if (Array.isArray(backupData.employees) && backupData.employees.length > 0) {
        const importedEmps = backupData.employees as Employee[];
        const masterAdmin = employees.find(e=>e.id===currentUser.id)||currentUser;
        setEmployees([masterAdmin,...importedEmps.filter(e=>e.id!==masterAdmin.id)]);
      }
      if (Array.isArray(backupData.announcements)) {
        setAnnouncements(backupData.announcements as Announcement[]);
      }
      if (Array.isArray(backupData.events)) {
        setEvents(backupData.events as CorporateEvent[]);
      }
      if (Array.isArray(backupData.requests)) {
        setRequests(backupData.requests as InternalRequest[]);
      }
      if (Array.isArray(backupData.documents)) {
        setDocuments(backupData.documents as CorporateDocument[]);
      }
      if (Array.isArray(backupData.chats)) {
        setChats(backupData.chats as ChatThread[]);
      }
      if (Array.isArray(backupData.invites)) {
        setInvites(backupData.invites as EmployeeInvite[]);
      }
      if (Array.isArray(backupData.auditLogs)) {
        setAuditLogs(previous=>[...new Map([...previous,...backupData.auditLogs as AuditLog[]].map(log=>[log.id,log])).values()]);
      }
      void recordAuditLog(
        'IMPORTACAO_BACKUP_JSON',
        'Importou pacote completo de backup (.JSON) restaurando dados corporativos.'
      );
      return true;
    } catch (err) {
      console.debug('Backup import error:', err);
      return false;
    }
  };

  const handleSendMessage = async (
    threadId: string,
    text: string,
    attachment?: string,
    attachmentSize?: string,
    extra?: {
      mediaType?: 'image' | 'video' | 'audio' | 'document';
      mediaUrl?: string;
      audioDuration?: string;
      forwardedFrom?: string;
    }
  ) => {
    const nowStr = new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const msgId = `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== threadId) return c;
        return {
          ...c,
          unreadCount: 0,
          messages: [
            ...c.messages,
            {
              id: msgId,
              senderId: currentUser.id,
              senderName: currentUser.name,
              senderRole: currentUser.roleTitle,
              text,
              timestamp: nowStr,
              status: 'delivered',
              attachment,
              attachmentSize,
              mediaType: extra?.mediaType,
              mediaUrl: extra?.mediaUrl,
              audioDuration: extra?.audioDuration,
              forwardedFrom: extra?.forwardedFrom,
            },
          ],
        };
      })
    );

    if (firebaseUser) {
      try {
        const msgPayload: Record<string, unknown> = {
          chatId: threadId,
          senderId: firebaseUser.uid,
          senderName: currentUser.name.slice(0, 120),
          senderRole: currentUser.roleTitle.slice(0, 120),
          text: text.slice(0, 2000),
          timestamp: nowStr.slice(0, 40),
          status: 'delivered',
          createdAt: serverTimestamp(),
        };
        if (attachment) {
          msgPayload.attachmentName = attachment.slice(0, 200);
          msgPayload.attachmentSize = (attachmentSize || '450 KB').slice(0, 30);
        }
        await setDoc(doc(db, 'chats', threadId, 'messages', msgId), msgPayload);
      } catch (err) {
        console.debug('Chat message local/Firestore sync:', err);
      }
    }
  };

  const handleMarkThreadRead = (threadId: string) => {
    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== threadId || c.unreadCount === 0) return c;
        return {
          ...c,
          unreadCount: 0,
          messages: c.messages.map((m) => ({ ...m, status: 'read' })),
        };
      })
    );
  };

  const handleCreateGroupChat = async (groupData: {
    name: string;
    department: Department | 'Todos';
    roleOrDept: string;
    pinnedNotice?: string;
    participantIds: string[];
  }) => {
    const grpId = `grp-${Date.now()}`;
    const nowStr = new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const uniqueParticipants = Array.from(
      new Set([currentUser.id, ...groupData.participantIds])
    );

    const newGroup: ChatThread = {
      id: grpId,
      isGroup: true,
      name: groupData.name,
      roleOrDept: `${groupData.roleOrDept} • ${uniqueParticipants.length} membros`,
      department: groupData.department,
      unreadCount: 0,
      participantsCount: uniqueParticipants.length,
      participantIds: uniqueParticipants,
      pinnedNotice: groupData.pinnedNotice || undefined,
      messages: [
        {
          id: `gm-${Date.now()}`,
          senderId: currentUser.id,
          senderName: currentUser.name,
          senderRole: currentUser.roleTitle,
          text: `Grupo corporativo "${groupData.name}" criado oficialmente no RODOVAR CONECTA.`,
          timestamp: nowStr,
          status: 'read',
        },
      ],
    };

    setChats((prev) => [newGroup, ...prev]);
    setAuditLogs((prev) => [
      {
        id: `aud-${Date.now()}`,
        timestamp: new Date().toLocaleString('pt-BR'),
        actor: currentUser.name,
        role: currentUser.accessLevel,
        action: 'CRIACAO_GRUPO_CORPORATIVO',
        details: `Criou grupo "${groupData.name}" (${uniqueParticipants.length} participantes)`,
      },
      ...prev,
    ]);

    if (firebaseUser) {
      try {
        const threadPayload: Record<string, unknown> = {
          isGroup: true,
          name: groupData.name.slice(0, 140),
          roleOrDept: newGroup.roleOrDept.slice(0, 160),
          department: String(groupData.department).slice(0, 60),
          participantsCount: uniqueParticipants.length,
          createdBy: firebaseUser.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (groupData.pinnedNotice?.trim()) {
          threadPayload.pinnedNotice = groupData.pinnedNotice.trim().slice(0, 400);
        }
        await setDoc(doc(db, 'chats', grpId), threadPayload);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `chats/${grpId}`);
      }
    }
  };

  const handleUpdateThreadPinnedNotice = async (threadId: string, pinnedNotice: string) => {
    setChats((prev) =>
      prev.map((c) => (c.id === threadId ? { ...c, pinnedNotice } : c))
    );

    if (firebaseUser) {
      try {
        await updateDoc(doc(db, 'chats', threadId), {
          pinnedNotice: pinnedNotice.slice(0, 400),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        console.debug('Pinned notice sync info:', err);
      }
    }
  };

  const handleTogglePinMessage = async (threadId: string, messageId: string) => {
    let pinnedText = '';
    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== threadId) return c;
        const updatedMessages = c.messages.map((m) => {
          if (m.id !== messageId) return m;
          const nextPinned = !m.pinned;
          if (nextPinned) pinnedText = `${m.senderName}: ${m.text}`;
          return { ...m, pinned: nextPinned };
        });
        return {
          ...c,
          pinnedNotice: pinnedText || c.pinnedNotice,
          messages: updatedMessages,
        };
      })
    );
  };

  const handleDeleteMessage = async (threadId: string, messageId: string) => {
    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== threadId) return c;
        return {
          ...c,
          messages: c.messages.filter((m) => m.id !== messageId),
        };
      })
    );

    if (firebaseUser) {
      try {
        await deleteDoc(doc(db, 'chats', threadId, 'messages', messageId));
      } catch (err) {
        console.debug('Delete message sync info:', err);
      }
    }
  };

  const handleManageGroupParticipants = async (
    threadId: string,
    participantIds: string[]
  ) => {
    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== threadId) return c;
        const baseDept = c.roleOrDept.split('•')[0].trim();
        return {
          ...c,
          participantIds,
          participantsCount: participantIds.length,
          roleOrDept: `${baseDept} • ${participantIds.length} membros`,
        };
      })
    );

    if (firebaseUser) {
      try {
        await updateDoc(doc(db, 'chats', threadId), {
          participantsCount: participantIds.length,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        console.debug('Manage participants sync info:', err);
      }
    }
  };

  const handleToggleEventRsvp = async (eventId: string) => {
    const targetEvt = events.find((e) => e.id === eventId);
    const alreadyAttending = targetEvt?.attendees.includes(currentUser.id);

    setEvents((prev) =>
      prev.map((evt) => {
        if (evt.id !== eventId) return evt;
        const attending = evt.attendees.includes(currentUser.id);
        return {
          ...evt,
          attendees: attending
            ? evt.attendees.filter((id) => id !== currentUser.id)
            : [...evt.attendees, currentUser.id],
        };
      })
    );

    if (firebaseUser) {
      const attRef = doc(db, 'events', eventId, 'attendees', firebaseUser.uid);
      try {
        if (alreadyAttending) {
          await deleteDoc(attRef);
        } else {
          await setDoc(attRef, {
            eventId,
            userId: firebaseUser.uid,
            userName: currentUser.name.slice(0, 120),
            createdAt: serverTimestamp(),
          });
        }
      } catch (err) {
        console.debug('Event RSVP sync info:', err);
      }
    }
  };

  const handleCreateEvent = async (newEvt: Omit<CorporateEvent, 'id' | 'attendees'>) => {
    const evtId = `evt-${Date.now()}`;
    setEvents((prev) => [
      ...prev,
      {
        ...newEvt,
        id: evtId,
        attendees: [currentUser.id],
      },
    ]);

    if (firebaseUser) {
      try {
        await setDoc(doc(db, 'events', evtId), {
          day: newEvt.day.slice(0, 4),
          monthShort: newEvt.monthShort.slice(0, 10),
          dateIso: newEvt.dateIso.slice(0, 20),
          time: newEvt.time.slice(0, 40),
          location: newEvt.location.slice(0, 160),
          title: newEvt.title.slice(0, 180),
          organizer: newEvt.organizer.slice(0, 120),
          department: String(newEvt.department).slice(0, 60),
          badgeLabel: newEvt.badgeLabel,
          badgeColor: newEvt.badgeColor,
          description: newEvt.description.slice(0, 2000),
          authorId: firebaseUser.uid,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `events/${evtId}`);
      }
    }
  };

  const handleUpdateEvent = async (
    eventId: string,
    updates: Partial<CorporateEvent>
  ) => {
    setEvents((prev) =>
      prev.map((evt) => (evt.id === eventId ? { ...evt, ...updates } : evt))
    );
    await recordAuditLog(
      'EDICAO_EVENTO_AGENDA',
      `Atualizou evento da agenda corporativa: "${updates.title || eventId}"`
    );
    if (firebaseUser) {
      try {
        await updateDoc(doc(db, 'events', eventId), {
          ...(updates.title ? { title: updates.title.slice(0, 180) } : {}),
          ...(updates.day ? { day: updates.day.slice(0, 4) } : {}),
          ...(updates.monthShort ? { monthShort: updates.monthShort.slice(0, 10) } : {}),
          ...(updates.time ? { time: updates.time.slice(0, 40) } : {}),
          ...(updates.location ? { location: updates.location.slice(0, 160) } : {}),
          ...(updates.description ? { description: updates.description.slice(0, 2000) } : {}),
        });
      } catch (err) {
        console.debug('Update event sync info:', err);
      }
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    const target = events.find((e) => e.id === eventId);
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
    if (target) {
      await recordAuditLog(
        'EXCLUSAO_EVENTO_AGENDA',
        `Removeu evento da agenda: "${target.title}"`
      );
    }
    if (firebaseUser) {
      try {
        await deleteDoc(doc(db, 'events', eventId));
      } catch (err) {
        console.debug('Delete event sync info:', err);
      }
    }
  };

  const handleUploadDocument = async (
    newDoc: Omit<CorporateDocument, 'id' | 'updatedAt'>
  ) => {
    const today = new Date().toLocaleDateString('pt-BR');
    const docId = `doc-${Date.now()}`;
    setDocuments((prev) => [
      {
        ...newDoc,
        id: docId,
        updatedAt: today,
      },
      ...prev,
    ]);

    if (firebaseUser) {
      try {
        await setDoc(doc(db, 'documents', docId), {
          title: newDoc.title.slice(0, 180),
          category: newDoc.category,
          version: newDoc.version.slice(0, 20),
          updatedAt: today.slice(0, 30),
          author: newDoc.author.slice(0, 120),
          authorId: firebaseUser.uid,
          size: newDoc.size.slice(0, 30),
          fileType: newDoc.fileType,
          allowedDepartments: 'Todos',
          description: newDoc.description.slice(0, 1500),
          contentPreview: newDoc.contentPreview.slice(0, 4000),
          ...(newDoc.pdfUrl ? { pdfUrl: newDoc.pdfUrl } : {}),
          ...(newDoc.attachments && newDoc.attachments.length > 0
            ? { attachments: newDoc.attachments }
            : {}),
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `documents/${docId}`);
      }
    }
  };

  const handleUpdateDocumentVersion = async (
    docId: string,
    newVersion: string,
    newDescription: string,
    newContentPreview?: string
  ) => {
    const today = new Date().toLocaleDateString('pt-BR');
    let nextPreview = newContentPreview || '';
    let nextDescription = newDescription;

    setDocuments((prev) =>
      prev.map((d) => {
        if (d.id !== docId) return d;
        nextDescription = newDescription.trim() || d.description;
        nextPreview =
          newContentPreview && newContentPreview.trim()
            ? newContentPreview
            : `${d.contentPreview}\n\n[REVISÃO ${newVersion} — ${today} por ${currentUser.name}]\n${newDescription}`;
        return {
          ...d,
          version: newVersion,
          updatedAt: today,
          description: nextDescription,
          contentPreview: nextPreview,
        };
      })
    );

    await recordAuditLog(
      'ATUALIZACAO_VERSAO_DOCUMENTO',
      `Publicou revisão ${newVersion} para o documento ${docId}: ${newDescription}`
    );

    if (firebaseUser) {
      try {
        await updateDoc(doc(db, 'documents', docId), {
          version: newVersion.slice(0, 20),
          updatedAt: today.slice(0, 30),
          description: nextDescription.slice(0, 1500),
          contentPreview: nextPreview.slice(0, 4000),
        });
      } catch (err) {
        console.debug('Document version sync info:', err);
      }
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    const target = documents.find((d) => d.id === docId);
    setDocuments((prev) => prev.filter((d) => d.id !== docId));
    if (target) {
      await recordAuditLog(
        'EXCLUSAO_DOCUMENTO_POP',
        `Excluiu documento corporativo: "${target.title}" (${target.version})`
      );
    }
    if (firebaseUser) {
      try {
        await deleteDoc(doc(db, 'documents', docId));
      } catch (err) {
        console.debug('Delete document sync info:', err);
      }
    }
  };

  const handleCreateInvite = async (
    inv: Omit<EmployeeInvite, 'id' | 'token' | 'expiresAt' | 'status'>
  ) => {
    const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    const token = `RDV-${Math.floor(1000 + Math.random() * 9000)}-${randomPart}-2025`;
    const invId = `inv-${Date.now()}`;

    setInvites((prev) => [
      {
        ...inv,
        id: invId,
        token,
        expiresAt: '24 horas (Uso Único)',
        status: 'Pendente',
      },
      ...prev,
    ]);
    await recordAuditLog(
      'GERACAO_CONVITE_SEGURO',
      `Emitiu convite token único (${token}) para ${inv.email}`
    );

    if (firebaseUser) {
      try {
        await setDoc(doc(db, 'invites', invId), {
          fullName: inv.fullName.slice(0, 120),
          email: inv.email.slice(0, 160),
          roleTitle: inv.roleTitle.slice(0, 120),
          department: inv.department.slice(0, 60),
          accessLevel: inv.accessLevel,
          token: token.slice(0, 64),
          expiresAt: '24 horas (Uso Único)',
          status: 'Pendente',
          createdBy: firebaseUser.uid,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `invites/${invId}`);
      }
    }
  };

  const handleActivateInviteToken = async (tokenInput: string): Promise<boolean> => {
    const targetInv = invites.find(
      (i) => i.token.toUpperCase() === tokenInput.trim().toUpperCase() && i.status === 'Pendente'
    );
    if (!targetInv) return false;

    setInvites((prev) =>
      prev.map((i) => (i.id === targetInv.id ? { ...i, status: 'Ativado' } : i))
    );

    const newEmp: Employee = {
      id: `emp-${Date.now()}`,
      name: targetInv.fullName,
      email: targetInv.email,
      roleTitle: targetInv.roleTitle,
      role: targetInv.roleTitle,
      department: targetInv.department,
      accessLevel: targetInv.accessLevel,
      avatar: '/assets/avatar-joao.jpg',
      phoneExt: '71 9 9920-2476',
      phone: '71 9 9920-2476',
      location: 'Matriz Rodovar',
      joinedAt: new Date().toLocaleDateString('pt-BR'),
      active: true,
    };

    setEmployees((prev) => [newEmp, ...prev]);
    await recordAuditLog(
      'ATIVACAO_CONVITE_TOKEN',
      `Ativou conta corporativa com token de uso único ${targetInv.token}`,
      targetInv.fullName,
      targetInv.accessLevel
    );

    if (firebaseUser) {
      try {
        await updateDoc(doc(db, 'invites', targetInv.id), {
          status: 'Ativado',
        });
      } catch (err) {
        console.debug('Invite activation sync info:', err);
      }
    }
    return true;
  };

  const handleToggleEmployeeActive = async (empId: string) => {
    const target = employees.find((e) => e.id === empId);
    setEmployees((prev) =>
      prev.map((e) => (e.id === empId ? { ...e, active: !e.active } : e))
    );
    if (target) {
      await recordAuditLog(
        target.active ? 'DESATIVACAO_CONTA' : 'REATIVACAO_CONTA',
        `${target.active ? 'Desativou' : 'Reativou'} o acesso de ${target.name} (${target.email})`
      );
      if (firebaseUser) {
        try {
          await updateDoc(doc(db, 'users', empId, 'public', 'profile'), {
            active: !target.active,
          });
        } catch (err) {
          console.debug('Toggle employee active Firestore sync info:', err);
        }
      }
    }
  };

  const handleCreateEmployeeDirect = async (data: {
    name: string;
    email: string;
    login: string;
    password: string;
    mustChangePassword: boolean;
    roleTitle: string;
    department: Department;
    accessLevel: UserRole;
    phoneExt: string;
    permissoesPaginas?: string[];
  }) => {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: getAuthHeaders(true),
        credentials: 'include',
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (res.ok && json.user) {
        setEmployees((prev) => [json.user, ...prev]);
        await recordAuditLog(
          'CRIACAO_LOGIN_ACESSO',
          `Criou login de acesso para ${json.user.name} (${json.user.login} • ${json.user.accessLevel})`
        );
        return;
      }
    } catch (err) {
      console.debug('Server user create fallback:', err);
    }

    const cleanName = data.name.trim().replace(/[<>]/g, '');
    const cleanRole = data.roleTitle.trim().replace(/[<>]/g, '') || 'Colaborador Corporativo';
    const newEmp: Employee = {
      id: `emp-${Date.now()}`,
      name: cleanName,
      email: data.email.trim().toLowerCase(),
      login: data.login.trim().toLowerCase(),
      mustChangePassword: data.mustChangePassword,
      roleTitle: cleanRole,
      role: cleanRole,
      department: data.department,
      accessLevel: data.accessLevel,
      avatar: '',
      hasCustomAvatar: false,
      approvalStatus: 'APROVADO',
      phoneExt: data.phoneExt.trim() || '71 9 9920-2476',
      phone: '71 9 9920-2476',
      location: 'Unidade Rodovar',
      joinedAt: new Date().toLocaleDateString('pt-BR'),
      active: true,
      permissoesPaginas:
        data.permissoesPaginas && data.permissoesPaginas.length > 0
          ? data.permissoesPaginas
          : getDefaultPermissionsForDepartment(data.department, data.accessLevel),
    };

    setEmployees((prev) => [newEmp, ...prev]);
    await recordAuditLog(
      'CRIACAO_LOGIN_ACESSO',
      `Criou login de acesso para ${newEmp.name} (${newEmp.login} • ${newEmp.accessLevel})`
    );
  };

  const handleUpdateEmployeeAdmin = async (
    empId: string,
    updates: {
      name?: string;
      email?: string;
      login?: string;
      password?: string;
      mustChangePassword?: boolean;
      roleTitle: string;
      department: Department;
      accessLevel: UserRole;
      phoneExt?: string;
      permissoesPaginas?: string[];
    }
  ) => {
    try {
      await fetch(`/api/admin/users/${encodeURIComponent(empId)}`, {
        method: 'PUT',
        headers: getAuthHeaders(true),
        credentials: 'include',
        body: JSON.stringify(updates),
      });
    } catch (err) {
      console.debug('Admin user update server sync info:', err);
    }

    const target = employees.find((e) => e.id === empId);
    setEmployees((prev) =>
      prev.map((e) =>
        e.id === empId
          ? {
              ...e,
              name: updates.name?.trim() || e.name,
              email: updates.email?.trim().toLowerCase() || e.email,
              login: updates.login?.trim().toLowerCase() || e.login || e.email,
              mustChangePassword:
                typeof updates.mustChangePassword === 'boolean'
                  ? updates.mustChangePassword
                  : e.mustChangePassword,
              roleTitle: updates.roleTitle,
              role: updates.roleTitle,
              department: updates.department,
              accessLevel: updates.accessLevel,
              phoneExt: updates.phoneExt ?? e.phoneExt,
              permissoesPaginas: updates.permissoesPaginas ?? e.permissoesPaginas,
            }
          : e
      )
    );
    if (target) {
      await recordAuditLog(
        'ALTERACAO_LOGIN_PERFIL_ADMIN',
        `Atualizou login/credenciais de ${updates.name || target.name}: Login ${updates.login || target.email} • ${updates.roleTitle} (${updates.accessLevel})`
      );
      if (firebaseUser) {
        try {
          await updateDoc(doc(db, 'users', empId, 'public', 'profile'), {
            name: (updates.name || target.name).slice(0, 120),
            roleTitle: updates.roleTitle.slice(0, 120),
            department: updates.department.slice(0, 60),
            phoneExt: (updates.phoneExt ?? target.phoneExt).slice(0, 40),
          });
        } catch (err) {
          console.debug('Admin employee update Firestore sync info:', err);
        }
      }
    }
  };

  const handleUpdateMyProfile = async (updates: {
    name: string;
    phoneExt: string;
    avatar: string;
    hasCustomAvatar?: boolean;
    email?: string;
    login?: string;
    password?: string;
  }) => {
    setEmployees((prev) =>
      prev.map((e) => {
        if (e.id !== currentUser.id) return e;
        return {
          ...e,
          name: updates.name,
          phoneExt: updates.phoneExt,
          avatar: typeof updates.hasCustomAvatar === 'boolean' ? updates.avatar : updates.avatar || e.avatar,
          hasCustomAvatar:
            typeof updates.hasCustomAvatar === 'boolean'
              ? updates.hasCustomAvatar
              : Boolean(updates.avatar || e.hasCustomAvatar),
          email: updates.email ? updates.email.trim().toLowerCase() : e.email,
          login: updates.login ? updates.login.trim().toLowerCase() : e.login || e.email,
          mustChangePassword: false,
        };
      })
    );

    await recordAuditLog(
      'ALTERACAO_PROPRIO_PERFIL',
      `Titular ${updates.name} atualizou seus dados/foto de perfil (${updates.login || currentUser.email}).`
    );
  };

  const handleCreateFirstAccessAccount = async (data: {
    name: string;
    email: string;
    password: string;
    department: Department;
    roleTitle: string;
  }): Promise<Employee> => {
    const newEmp: Employee = {
      id: `emp-${Date.now()}`,
      name: data.name,
      email: data.email.toLowerCase(),
      login: data.email.toLowerCase(),
      password: data.password,
      mustChangePassword: false,
      roleTitle: data.roleTitle,
      role: data.roleTitle,
      department: data.department,
      accessLevel: 'FUNCIONARIO',
      avatar: '/assets/avatar-joao.jpg',
      phoneExt: '71 9 9920-2476',
      phone: '71 9 9920-2476',
      location: 'Unidade Rodovar',
      joinedAt: new Date().toLocaleDateString('pt-BR'),
      active: true,
    };
    setEmployees((prev) => [newEmp, ...prev]);
    await recordAuditLog(
      'CADASTRO_PRIMEIRO_ACESSO',
      `Novo acesso configurado com senha para ${newEmp.name} (${newEmp.email}).`
    );
    return newEmp;
  };

  const handleSwitchUserRole = (role: UserRole) => {
    setEmployees((prev) =>
      prev.map((e) => (e.id === currentUser.id ? { ...e, accessLevel: role } : e))
    );
    setShowProfileDropdown(false);
  };

  const handleStartDirectChat = async (emp: Employee) => {
    const existing = chats.find((c) => !c.isGroup && c.name === emp.name);
    if (!existing) {
      const chatId = `chat-${Date.now()}`;
      const newChat: ChatThread = {
        id: chatId,
        isGroup: false,
        name: emp.name,
        roleOrDept: `${emp.roleTitle} • ${emp.department}`,
        department: emp.department,
        avatar: emp.avatar,
        unreadCount: 0,
        participantsCount: 2,
        participantIds: [currentUser.id, emp.id],
        messages: [
          {
            id: `m-${Date.now()}`,
            senderId: currentUser.id,
            senderName: currentUser.name,
            senderRole: currentUser.roleTitle,
            text: `Olá ${emp.name.split(' ')[0]}, tudo bem?`,
            timestamp: 'Agora',
            status: 'delivered',
          },
        ],
      };
      setChats((prev) => [newChat, ...prev]);

      if (firebaseUser) {
        try {
          await setDoc(doc(db, 'chats', chatId), {
            isGroup: false,
            name: emp.name.slice(0, 140),
            roleOrDept: `${emp.roleTitle} • ${emp.department}`.slice(0, 160),
            department: emp.department,
            participantsCount: 2,
            createdBy: firebaseUser.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          console.debug('Direct chat Firestore creation info:', err);
        }
      }
    }
    setActiveSection('mensagens');
  };

  const unreadDirectMessagesCount = chats
    .filter((c) => !c.isGroup)
    .reduce((acc, c) => acc + (c.unreadCount || 0), 0);

  const unreadGroupMessagesCount = chats
    .filter((c) => c.isGroup)
    .reduce((acc, c) => acc + (c.unreadCount || 0), 0);

  // Sidebar Menu Items matching Section 4 & Reference Screenshot
  const sidebarItems: {
    id: MenuSection;
    label: string;
    icon: React.FC<{ className?: string }>;
    badge?: number;
    adminOnly?: boolean;
  }[] = [
    { id: 'inicio', label: 'Início', icon: Home },
    { id: 'comunicados', label: 'Mural de Comunicados', icon: Megaphone },
    { id: 'fretes_comercial', label: 'Fretes Comercial', icon: Truck },
    { id: 'fretes_expedicao', label: 'Fretes Expedição', icon: Truck },
    { id: 'fretes_ativos', label: 'Fretes Ativos', icon: Truck },
    {
      id: 'solicitacoes',
      label: 'Minhas Solicitações',
      icon: FileText,
      badge: openRequestsCount,
    },
    {
      id: 'financeiro',
      label: 'Financeiro',
      icon: Wallet,
    },
    { id: 'agenda', label: 'Agenda', icon: Calendar },
    {
      id: 'mensagens',
      label: 'Mensagens',
      icon: MessageSquare,
      badge: unreadDirectMessagesCount || undefined,
    },
    {
      id: 'grupos',
      label: 'Grupos',
      icon: Users,
      badge: unreadGroupMessagesCount || undefined,
    },
    { id: 'diretorio', label: 'Colaboradores', icon: Users },
    { id: 'perfil', label: 'Meu Perfil', icon: User },
    {
      id: 'administracao',
      label: 'Administração',
      icon: Shield,
      adminOnly: true,
      badge: pendingAccessRequestsCount || undefined,
    },
    { id: 'ajuda', label: 'Ajuda', icon: HelpCircle },
  ];

  // Detect Web Share Target (/receber-comprovante or ?shared=1) and preserve across login
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const isShareRoute =
      url.pathname === '/receber-comprovante' || url.searchParams.get('shared') === '1';
    const swShareId = url.searchParams.get('shareId');
    const serverShareId = url.searchParams.get('serverShareId');

    async function loadIncomingShare() {
      if (serverShareId) {
        try {
          const res = await fetch(
            `/api/pagamentos/shared-staging/${encodeURIComponent(serverShareId)}`
          );
          if (res.ok) {
            const data = await res.json();
            if (data.stagedShare) {
              const s = data.stagedShare;
              const mime = s.mimeType || 'application/pdf';
              const draft: SharedReceiptDraft = {
                id: s.id,
                createdAtIso: s.createdAtIso,
                textOnly: Boolean(s.textOnly),
                fileName: s.fileName,
                mimeType: mime,
                sizeBytes: s.sizeBytes,
                fileBase64: s.fileBase64,
                dataUrl: s.fileBase64 ? `data:${mime};base64,${s.fileBase64}` : undefined,
                sharedTitle: s.sharedTitle,
                sharedText: s.sharedText,
                sharedUrl: s.sharedUrl,
                errorMessage: s.errorMessage,
                origin: 'COMPARTILHAMENTO',
              };
              await saveSharedDraftToDevice(draft);
              setPendingSharedDraft(draft);
              return;
            }
          }
        } catch {
          // fallback to IDB
        }
      }

      if (swShareId || isShareRoute) {
        const idbDraft = await readSharedReceiptFromIdb(swShareId);
        if (idbDraft) {
          await saveSharedDraftToDevice(idbDraft);
          setPendingSharedDraft(idbDraft);
          return;
        }
        const sessionDraft = getSavedSessionDraft();
        if (sessionDraft) {
          setPendingSharedDraft(sessionDraft);
          return;
        }
        if (isShareRoute) {
          // Opened /receber-comprovante directly
          setPendingSharedDraft({
            id: `direct-${Date.now()}`,
            createdAtIso: new Date().toISOString(),
            textOnly: false,
            origin: 'COMPARTILHAMENTO',
          });
        }
      }
    }

    void loadIncomingShare();
  }, []);

  useEffect(() => {
    if (isAuthenticated && pendingSharedDraft) {
      setActiveSection('financeiro');
    }
  }, [isAuthenticated, pendingSharedDraft]);

  // If user is not authenticated in the portal session, render the Main Corporate Login Screen
  if (isAuthenticated && currentUser.mustChangePassword) {
    return <FirstAccessPassword user={currentUser} onLogout={handleLogout} onComplete={user => {
      setEmployees(prev => prev.map(emp => emp.id === user.id ? user : emp));
      setActiveSection(permittedHome(user) as MenuSection);
    }} />;
  }
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col bg-[#080B0D]">
        {!isOnline && (
          <div
            role="status"
            aria-live="polite"
            className="bg-[#080B0D] border-b border-[#FFD400] px-4 py-2.5 text-xs font-extrabold text-[#FFD400] flex items-center justify-center gap-2 z-50"
          >
            <WifiOff className="w-4 h-4 text-[#E5252A] shrink-0" />
            <span>Você está sem conexão. Algumas funções precisam de internet.</span>
          </div>
        )}
        {updateAvailable && (
          <div className="bg-[#15191D] border-b border-[#FFD400]/60 px-4 py-2.5 text-xs text-white flex flex-wrap items-center justify-center gap-3 z-50">
            <span className="font-bold text-[#FFD400]">Uma nova versão está disponível.</span>
            <button
              type="button"
              onClick={applyUpdate}
              disabled={isUpdating}
              className="bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] font-extrabold px-3 py-1 rounded-lg cursor-pointer transition"
            >
              {isUpdating ? 'Atualizando...' : 'Atualizar agora'}
            </button>
          </div>
        )}
        {pendingSharedDraft && (
          <div className="bg-[#FFD400] text-[#080B0D] px-4 py-3 text-xs font-extrabold text-center shadow-md z-50">
            Comprovante bancário recebido e preservado com segurança no celular (
            {pendingSharedDraft.fileName || 'Aguardando anexo'}). Faça login com sua conta
            aprovada para validar o frete de destino e salvar no servidor.
          </div>
        )}
        <div className="flex-1">
          <LoginScreen
            onAuthenticated={handleServerAuthenticated}
            onOpenInstallModal={() => {
              resetInstallOutcome();
              setShowPWAInstallGuideModal(true);
            }}
            isInstalled={isInstalled}
            canPromptInstall={canPromptInstall}
          />
        </div>
        <PWAInstallModal
          isOpen={showPWAInstallGuideModal}
          onClose={() => setShowPWAInstallGuideModal(false)}
          onPostpone={() => {
            postponeInstall();
            setShowPWAInstallGuideModal(false);
          }}
          canPromptInstall={canPromptInstall}
          isInstalled={isInstalled}
          isIOS={isIOS}
          isAndroid={isAndroid}
          isSafariIOS={isSafariIOS}
          isInAppBrowser={isInAppBrowser}
          inAppBrowserName={inAppBrowserName}
          isInIframe={isInIframe}
          installOutcome={installOutcome}
          onTriggerInstall={triggerPWAInstall}
          onResetOutcome={resetInstallOutcome}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080B0D] text-[#15191D] flex flex-col">
      {/* =====================================================================
          MOBILE NATIVE VIEWPORT (< 768px)
      ===================================================================== */}
      <div className="block md:hidden">
        <MobileDeviceView
          onNavigate={setActiveSection}
          onOpenAnnouncement={(ann) => setSelectedAnnouncementModal(ann)}
          featuredAnnouncement={featuredAnnouncement}
          notifications={sortedUniqueNotifications}
          unreadAnnouncementsCount={unreadAnnouncementsCount}
          openRequestsCount={openRequestsCount}
          unreadNotificationsCount={unreadNotificationsCount}
          activeSection={activeSection}
          isEmbedded={false}
          currentUser={currentUser}
          systemConfig={systemConfig || undefined}
          onLogout={handleLogout}
          onSwitchUserRole={handleSwitchUserRole}
          onOpenSearch={() => {
            setGlobalSearchQuery('');
            setShowCommandPalette(true);
          }}
          onOpenNotificationsCenter={() => setShowNotificationsCenterModal(true)}
          onOpenInstallModal={() => {
            resetInstallOutcome();
            setShowPWAInstallGuideModal(true);
          }}
          isInstalled={isInstalled}
          canPromptInstall={canPromptInstall}
        >
          {activeSection === 'fretes_comercial' ? (
            <MeusFretesComercialView
              currentUser={currentUser}
              selectedFreightIdFromNotification={selectedNotificationFreightId}
              onClearSelectedNotificationFreight={() => setSelectedNotificationFreightId(null)}
              onSwitchToExpedicao={() => setActiveSection('fretes_expedicao')}
            />
          ) : activeSection === 'fretes_expedicao' ? (
            <MeusFretesExpedicaoView
              currentUser={currentUser}
              selectedFreightIdFromNotification={selectedNotificationFreightId}
              onClearSelectedNotificationFreight={() => setSelectedNotificationFreightId(null)}
              onSwitchToComercial={() => setActiveSection('fretes_comercial')}
            />
          ) : activeSection === 'fretes_ativos' ? (
            <FretesAtivosView
              currentUser={currentUser}
              financialFreights={freights}
              selectedFreightIdFromNotification={selectedNotificationFreightId}
              onClearSelectedNotificationFreight={() => setSelectedNotificationFreightId(null)}
              onSwitchToExpedicao={() => setActiveSection('fretes_expedicao')}
            />
          ) : activeSection === 'financeiro' ? (
            <FinanceiroFretesView
              onHydrateFreights={(records) => setFreights(prev => { const merged = new Map(prev.map(f => [f.id, f])); records.forEach(f => merged.set(f.id, f)); const next = [...merged.values()]; return JSON.stringify(prev) === JSON.stringify(next) ? prev : next; })}
              freights={freights}
              currentUser={currentUser}
              onAddFreight={handleAddFreight}
              onUpdateFreight={handleUpdateFreight}
              initialSharedDraft={pendingSharedDraft}
              onClearInitialSharedDraft={() => setPendingSharedDraft(null)}
            />
          ) : activeSection !== 'inicio' ? (
            <ModulesView
              onMuralHydrated={(records, notices) => {setAnnouncements(records);setNotifications(prev => {const merged=new Map(prev.map(n=>[n.id,n]));notices.forEach(n=>merged.set(n.id,n));return [...merged.values()];});}}
              activeSection={activeSection}
              currentUser={currentUser}
              employees={employees}
              announcements={announcements}
              requests={requests}
              events={events}
              documents={documents}
              chats={chats}
              invites={invites}
              auditLogs={auditLogs}
              systemConfig={systemConfig || undefined}
              pendingAccessRequestsCount={pendingAccessRequestsCount}
              onPendingCountChange={setPendingAccessRequestsCount}
              onAccountsUpdated={setEmployees}
              onSystemConfigPublished={setSystemConfig}
              onConfirmRead={handleConfirmRead}
              onToggleLike={handleToggleLike}
              onAddComment={handleAddComment}
              onDeleteComment={handleDeleteComment}
              onCreateAnnouncement={handleCreateAnnouncement}
              onUpdateAnnouncement={handleUpdateAnnouncement}
              onTogglePinAnnouncement={handleTogglePinAnnouncement}
              onToggleArchiveAnnouncement={handleToggleArchiveAnnouncement}
              onDeleteAnnouncement={handleDeleteAnnouncement}
              onCreateRequest={handleCreateRequest}
              onUpdateRequestStatus={handleUpdateRequestStatus}
              onExtendRequestDeadline={handleExtendRequestDeadline}
              onAddRequestResponse={handleAddRequestResponse}
              onEscalateRequestToDiretoria={handleEscalateRequestToDiretoria}
              onDeleteRequest={handleDeleteRequest}
              onSendMessage={handleSendMessage}
              onMarkThreadRead={handleMarkThreadRead}
              onCreateGroupChat={handleCreateGroupChat}
              onUpdateThreadPinnedNotice={handleUpdateThreadPinnedNotice}
              onTogglePinMessage={handleTogglePinMessage}
              onDeleteMessage={handleDeleteMessage}
              onManageGroupParticipants={handleManageGroupParticipants}
              onToggleEventRsvp={handleToggleEventRsvp}
              onCreateEvent={handleCreateEvent}
              onUpdateEvent={handleUpdateEvent}
              onDeleteEvent={handleDeleteEvent}
              onUploadDocument={handleUploadDocument}
              onUpdateDocumentVersion={handleUpdateDocumentVersion}
              onDeleteDocument={handleDeleteDocument}
              onCreateInvite={handleCreateInvite}
              onActivateInviteToken={handleActivateInviteToken}
              onToggleEmployeeActive={handleToggleEmployeeActive}
              onCreateEmployeeDirect={handleCreateEmployeeDirect}
              onUpdateEmployeeAdmin={handleUpdateEmployeeAdmin}
              onUpdateMyProfile={handleUpdateMyProfile}
              onRestorePortalDefaults={handleRestorePortalDefaults}
              onImportPortalBackup={handleImportPortalBackup}
              onStartDirectChat={handleStartDirectChat}
              onNavigate={setActiveSection}
              initialOpenRequestModal={openRequestModalOnLoad}
              onClearInitialModal={() => setOpenRequestModalOnLoad(false)}
            />
          ) : null}
        </MobileDeviceView>
      </div>

      {/* =====================================================================
          DESKTOP & TABLET VIEWPORT (>= 768px)
      ===================================================================== */}
      <div className="hidden md:flex md:flex-col min-h-screen max-w-[1600px] w-full mx-auto relative">
        {/* 1. TOP PANORAMIC HEADER */}
        <header className="relative h-[112px] w-full flex items-center justify-between px-6 select-none shrink-0 z-30">
          {/* Panoramic Header Background from SystemConfig */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <img
              src={withRevisionParam(
                systemConfig?.topHeader.imageUrl || '/assets/header-sunset.jpg',
                systemConfig?.revision
              )}
              alt="Cabeçalho Institucional RODOVAR"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
              style={{
                objectPosition: `${systemConfig?.topHeader.focusX ?? 50}% ${systemConfig?.topHeader.focusY ?? 50}%`,
              }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = '/assets/header-sunset.jpg';
              }}
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(90deg, #080B0D 0%, #080B0D 19%, rgba(8,11,13,0.45) 34%, rgba(8,11,13,0.05) 55%, rgba(8,11,13,0.55) 78%, #080B0D 92%, #080B0D 100%)',
              }}
            />
          </div>

          {/* Left Zone: RODOVAR CONECTA Logo + 4 Institutional Pillars */}
          <div className="relative z-10 flex items-center gap-7">
            <RodovarLogo size="lg" onClick={() => setActiveSection('inicio')} />

            <div className="hidden lg:flex flex-col text-[11px] font-semibold text-white/90 tracking-[0.08em] leading-[1.45] uppercase border-l border-white/15 pl-5">
              <span>COMUNICAÇÃO</span>
              <span>PESSOAS</span>
              <span>PROCESSOS</span>
              <span>RESULTADOS</span>
            </div>
          </div>

          {/* Right Zone: Institutional Motto + Notification Bell + User Profile */}
          <div className="relative z-10 flex items-center gap-6">
            {/* Motto */}
            <div className="hidden xl:flex flex-col items-start leading-[1.15] mr-2">
              <span className="text-[13.5px] font-extrabold text-white tracking-wide uppercase">
                JUNTOS
              </span>
              <span className="text-[13.5px] font-extrabold text-white tracking-wide uppercase">
                LEVANDO
              </span>
              <span className="text-[13.5px] font-extrabold text-white tracking-wide uppercase">
                O BRASIL
              </span>
              <span className="text-[13.5px] font-extrabold text-white tracking-wide uppercase">
                MAIS LONGE
              </span>
              <div className="w-10 h-[3px] bg-[#FFD400] mt-1.5 rounded-full" />
            </div>

            {/* Global Search Trigger (Ctrl+K) */}
            <button
              onClick={() => {
                setGlobalSearchQuery('');
                setShowCommandPalette(true);
              }}
              className="hidden md:inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs text-gray-200 hover:text-[#FFD400] transition cursor-pointer"
              title="Busca Global RODOVAR (Ctrl+K)"
            >
              <Search className="w-3.5 h-3.5 text-[#FFD400]" />
              <span className="font-medium">Buscar...</span>
              <kbd className="text-[10px] font-mono bg-black/50 text-gray-300 px-1.5 py-0.5 rounded border border-white/10">
                Ctrl+K
              </kbd>
            </button>

            {/* Notification Bell */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowNotificationsPopover(!showNotificationsPopover);
                  setShowProfileDropdown(false);
                }}
                className="relative p-2 text-white hover:text-[#FFD400] transition-colors cursor-pointer"
                aria-label="Notificações"
              >
                <Bell className="w-6 h-6 fill-white" />
                {unreadNotificationsCount > 0 && (
                  <span className="absolute top-0.5 right-0.5 bg-[#E5252A] text-white text-[11px] font-extrabold w-5 h-5 rounded-full flex items-center justify-center shadow-md">
                    {unreadNotificationsCount}
                  </span>
                )}
              </button>

              {showNotificationsPopover && (
                <>
                  <div
                    className="fixed inset-0 z-40 bg-transparent"
                    onClick={() => setShowNotificationsPopover(false)}
                  />
                  <div className="nc-popover absolute right-0 mt-2 w-88 bg-white rounded-xl shadow-2xl border border-gray-200 p-3 z-50">
                    <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                      <span className="text-xs font-extrabold text-[#15191D]">
                        Central de Notificações
                      </span>
                      <button
                        onClick={handleMarkAllNotificationsRead}
                        className="text-[11px] font-semibold text-blue-600 hover:underline cursor-pointer"
                      >
                        Marcar todas como lidas
                      </button>
                    </div>
                    {notificationNavigationError&&<p role="alert" className="nc-error">{notificationNavigationError}</p>}
                    <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto mt-1">
                      {sortedUniqueNotifications.length === 0 ? (
                        <div className="py-6 text-center text-xs text-gray-400">
                          Nenhuma notificação no momento.
                        </div>
                      ) : (
                        sortedUniqueNotifications.map((n) => (
                          <div
                            key={n.id}
                            data-unread={!n.read} className="nc-notice w-full py-2.5 px-1.5 flex items-start justify-between gap-2 hover:bg-gray-50 rounded-lg group"
                          >
                            <button
                              onClick={() => {
                                handleAccessNotification(n);
                              }}
                              className="flex-1 text-left flex items-start gap-2 cursor-pointer"
                            >
                              <span
                                className={`w-2 h-2 rounded-full mt-1 shrink-0 ${
                                  n.dotColor === 'red' ? 'bg-[#E5252A]' : 'bg-[#2563EB]'
                                }`}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                                  {n.read ? (
                                    <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-gray-500 bg-gray-100 px-1 py-0.2 rounded">
                                      ✓ Lida
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-0.5 text-[9px] font-extrabold text-blue-700 bg-blue-50 px-1 py-0.2 rounded">
                                      ● Nova
                                    </span>
                                  )}
                                  <span className="text-[10px] text-gray-400 tabular-nums">
                                    {n.timeLabel}
                                  </span>
                                </div>
                                <p
                                  className={`text-xs ${
                                    n.read ? 'font-medium text-gray-600' : 'font-extrabold text-[#15191D]'
                                  }`}
                                >
                                  {n.title}
                                </p>
                                <p className="text-[11px] text-gray-500 line-clamp-2">{n.subtitle}</p>
                              </div>
                            </button>
                            <div className="flex flex-col items-end gap-1 shrink-0 pt-0.5">
                              {!n.read && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMarkNotificationRead(n.id);
                                  }}
                                  title="Marcar lida"
                                  className="text-[10px] font-bold text-blue-600 hover:text-blue-800 cursor-pointer"
                                >
                                  Lida
                                </button>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteNotification(n.id);
                                }}
                                title="Remover"
                                className="text-[10px] font-semibold text-gray-400 hover:text-[#E5252A] cursor-pointer"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="pt-2 mt-1 border-t border-gray-100 text-center">
                      <button
                        onClick={() => {
                          setShowNotificationsPopover(false);
                          setShowNotificationsCenterModal(true);
                        }}
                        className="text-xs font-extrabold text-[#080B0D] bg-[#FFD400] hover:bg-[#ffdf33] w-full py-1.5 rounded-lg cursor-pointer"
                      >
                        Abrir Central de Notificações Completa
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* User Profile Pill */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowProfileDropdown(!showProfileDropdown);
                  setShowNotificationsPopover(false);
                }}
                className="flex items-center gap-3 pl-2 pr-1 py-1 rounded-xl hover:bg-white/5 transition-colors cursor-pointer"
              >
                <img
                  src={resolveAvatarUrl(currentUser, systemConfig)}
                  alt={currentUser.name}
                  referrerPolicy="no-referrer"
                  className="w-10 h-10 rounded-full object-cover aspect-square border-2 border-white shadow-sm shrink-0"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = '/assets/default-avatar.png';
                  }}
                />
                <div className="text-left">
                  <p className="text-sm font-bold text-white leading-tight">{currentUser.name}</p>
                  <p className="text-xs text-gray-300 leading-tight">{currentUser.department}</p>
                </div>
                <ChevronDown className="w-4 h-4 text-gray-300 ml-1" />
              </button>

              {showProfileDropdown && (
                <>
                  <div
                    className="fixed inset-0 z-40 bg-transparent"
                    onClick={() => setShowProfileDropdown(false)}
                  />
                  <div className="absolute right-0 mt-2 w-68 bg-white rounded-xl shadow-2xl border border-gray-200 p-3 z-50 text-xs">
                  <div className="pb-2.5 border-b border-gray-100">
                    <div className="flex items-center justify-between">
                      <p className="font-extrabold text-[#15191D]">{currentUser.name}</p>
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                        Online
                      </span>
                    </div>
                    <p className="text-gray-500 truncate mt-0.5">{currentUser.email}</p>
                    <span className="inline-block mt-1.5 text-[10px] font-extrabold bg-[#FFD400] text-[#080B0D] px-2 py-0.5 rounded">
                      {currentUser.roleTitle} • {currentUser.accessLevel}
                    </span>
                  </div>

                  <div className="py-2 border-b border-gray-100 space-y-1">
                    <button
                      onClick={() => {
                        setActiveSection('perfil');
                        setShowProfileDropdown(false);
                      }}
                      className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-gray-100 font-bold text-[#15191D] cursor-pointer"
                    >
                      Meu Perfil e Preferências
                    </button>
                  </div>

                  <div className="py-2 border-b border-gray-100 space-y-1">
                    <p className="text-[10px] font-bold text-gray-400 uppercase px-2">
                      Visualização de Acesso
                    </p>
                    {(['ADMINISTRADOR', 'DIRETORIA', 'FUNCIONARIO'] as UserRole[]).map((r) => (
                      <button
                        key={r}
                        onClick={() => handleSwitchUserRole(r)}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg font-semibold flex items-center justify-between cursor-pointer ${
                          currentUser.accessLevel === r
                            ? 'bg-[#080B0D] text-[#FFD400]'
                            : 'hover:bg-gray-100 text-gray-700'
                        }`}
                      >
                        <span>{r}</span>
                        {currentUser.accessLevel === r && <Check className="w-3.5 h-3.5" />}
                      </button>
                    ))}
                  </div>

                    <div className="pt-2">
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 text-[#E5252A] font-bold py-2 rounded-lg cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Sair da Conta</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* 2. BODY CONTAINER: LEFT DARK SIDEBAR + MAIN LIGHT WORKSPACE */}
        <div className="flex-1 flex px-3 pb-4 gap-0">
          {/* LEFT SIDEBAR */}
          <aside className="w-[235px] shrink-0 pr-3 flex flex-col justify-between select-none">
            {/* Navigation Menu */}
            <nav className="space-y-1 pt-2">
              {sidebarItems
                .filter((item) => {
                  if (item.adminOnly) {
                    return hasPagePermission(currentUser, 'administracao');
                  }
                  if (item.id === 'perfil' || item.id === 'ajuda') {
                    return true;
                  }
                  return hasPagePermission(currentUser, item.id);
                })
                .map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveSection(item.id)}
                      className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-[13.5px] transition-all cursor-pointer ${
                        isActive
                          ? 'bg-[#FFD400] text-[#080B0D] font-extrabold shadow-[0_4px_14px_rgba(255,212,0,0.28)]'
                          : 'text-gray-200 hover:text-white hover:bg-white/5 font-medium'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Icon
                          className={`w-[18px] h-[18px] shrink-0 ${
                            isActive ? 'text-[#080B0D] stroke-[2.4]' : 'text-gray-300'
                          }`}
                        />
                        <span className="truncate">{item.label}</span>
                      </div>
                      {item.badge && item.badge > 0 ? (
                        <span className="bg-[#E5252A] text-white text-[11px] font-extrabold w-5 h-5 rounded-full flex items-center justify-center shrink-0">
                          {item.badge}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
            </nav>

            {/* Bottom Institutional Sidebar Poster (6:7 ratio, contain) + Separate "Instalar App" Button */}
            <div className="mt-6">
              {systemConfig?.sidebarPoster.imageUrl &&
              systemConfig.sidebarPoster.imageUrl !== '/assets/aistudio/DSC00515_18c5e319.JPG' ? (
                <div className="relative rounded-2xl overflow-hidden bg-[#0B0E11] border border-white/10 shadow-lg aspect-[6/7] w-full flex items-center justify-center">
                  <img
                    src={withRevisionParam(
                      systemConfig.sidebarPoster.imageUrl,
                      systemConfig.revision
                    )}
                    alt="Pôster institucional lateral RODOVAR"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src =
                        '/assets/aistudio/DSC00515_18c5e319.JPG';
                    }}
                  />
                </div>
              ) : (
                <div className="relative rounded-2xl overflow-hidden bg-[#0B0E11] border border-white/10 shadow-lg">
                  <div className="relative h-[126px] w-full">
                    <img
                      src={withRevisionParam(
                        systemConfig?.sidebarPoster.imageUrl ||
                          '/assets/aistudio/DSC00515_18c5e319.JPG',
                        systemConfig?.revision
                      )}
                      alt="Pátio e Operação Logística RODOVAR"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0B0E11]/45 to-[#0B0E11]" />
                  </div>
                  <div className="px-4 pb-4 -mt-3 relative z-10 flex items-end justify-between">
                    <div>
                      <div className="text-[14px] font-bold text-white leading-[1.22] tracking-wide uppercase">
                        <p>TRANSPORTE</p>
                        <p>LOGÍSTICA</p>
                        <p>PESSOAS</p>
                        <p>RESULTADOS</p>
                      </div>
                      <div className="w-14 h-[3.5px] bg-[#FFD400] my-2.5 rounded-full" />
                      <div className="text-[16px] font-black text-[#FFD400] leading-[1.15] tracking-wide uppercase">
                        <p>É O QUE</p>
                        <p>NOS MOVE</p>
                      </div>
                    </div>
                    <img
                      src="/assets/aistudio/Sua_carga_em_primeiro_lugar_-removebg-preview_24a085fb.png"
                      alt="Mascote Oficial RODOVAR"
                      className="w-[74px] h-[74px] object-contain drop-shadow-[0_8px_14px_rgba(0,0,0,0.75)] -mr-1 -mb-1 select-none pointer-events-none"
                    />
                  </div>
                </div>
              )}

              <div className="mt-3 px-2 flex items-center justify-between text-[11px] text-gray-400 leading-tight">
                <div>
                  <p className="font-semibold text-gray-300">RODOVAR CONECTA</p>
                  <p className="text-gray-500">Portal Corporativo Oficial</p>
                </div>
                {!isInstalled && (
                  <button
                    onClick={() => {
                      resetInstallOutcome();
                      setShowPWAInstallGuideModal(true);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#FFD400]/15 hover:bg-[#FFD400]/30 text-[#FFD400] text-[10px] font-bold transition cursor-pointer"
                    title="Instalar Aplicativo Corporativo RODOVAR CONECTA"
                  >
                    <Download className="w-3 h-3" />
                    <span>{canPromptInstall ? 'Instalar aplicativo' : 'Como instalar'}</span>
                  </button>
                )}
              </div>
            </div>
          </aside>

          {/* MAIN WORKSPACE */}
          <div className="flex-1 flex items-start gap-4 min-w-0">
            <main className="flex-1 bg-[#F3F5F7] rounded-[22px] p-4 lg:p-5 shadow-2xl min-w-0">
              {activeSection === 'fretes_comercial' ? (
                <MeusFretesComercialView
                  currentUser={currentUser}
                  selectedFreightIdFromNotification={selectedNotificationFreightId}
                  onClearSelectedNotificationFreight={() => setSelectedNotificationFreightId(null)}
                  onSwitchToExpedicao={() => setActiveSection('fretes_expedicao')}
                />
              ) : activeSection === 'fretes_expedicao' ? (
                <MeusFretesExpedicaoView
                  currentUser={currentUser}
                  selectedFreightIdFromNotification={selectedNotificationFreightId}
                  onClearSelectedNotificationFreight={() => setSelectedNotificationFreightId(null)}
                  onSwitchToComercial={() => setActiveSection('fretes_comercial')}
                />
              ) : activeSection === 'fretes_ativos' ? (
                <FretesAtivosView
                  currentUser={currentUser}
                  financialFreights={freights}
                  selectedFreightIdFromNotification={selectedNotificationFreightId}
                  onClearSelectedNotificationFreight={() => setSelectedNotificationFreightId(null)}
                  onSwitchToExpedicao={() => setActiveSection('fretes_expedicao')}
                  onSyncNewFreightToFinanceiro={(item) => {
                    const total = item.valorFreteMotorista || 6000;
                    const adiant = Number((total * 0.7).toFixed(2));
                    const saldo = Number((total - adiant).toFixed(2));
                    handleAddFreight({
                      id: `frete-${Date.now()}`,
                      code: item.code,
                      createdAtDate: item.createdAtDate,
                      createdAtIso: new Date().toISOString(),
                      empresaMarca: item.empresaMarca,
                      dataCarregamento: item.dataCarregamento,
                      unidadeOperacional: item.unidadeOperacional,
                      comercialResponsavel: item.comercialResponsavel,
                      expedicaoResponsavel: item.expedicaoResponsavel,
                      cliente: item.cliente,
                      telefoneCliente: item.telefoneCliente,
                      motoristaNome: item.motoristaNome,
                      motoristaTelefone: item.motoristaTelefone,
                      emergenciaNome: item.emergenciaNome,
                      emergenciaTelefone: item.emergenciaTelefone,
                      origem: item.origem,
                      destino: item.destino,
                      dataColeta: item.dataColeta,
                      dataEntrega: item.dataPrevisaoOuEntrega,
                      valorFreteEmpresa: item.valorFreteEmpresa,
                      valorFreteMotorista: total,
                      regraTipo: '70_30',
                      regraLabel: '70% / 30%',
                      percentualAdiantamento: 70,
                      percentualSaldo: 30,
                      valorTotal: total,
                      valorAdiantamento: adiant,
                      valorSaldo: saldo,
                      favorecido: item.favorecido,
                      banco: item.banco,
                      agencia: '0001',
                      conta: '18670000-5',
                      tipoChavePix: item.tipoChavePix,
                      chavePix: item.chavePix,
                      status: 'Pendente Adiantamento',
                      adiantamentoPago: false,
                      entregaConfirmada: item.stage === 'Entrega Concluída',
                      saldoPago: false,
                      solicitanteNome: `${currentUser.name} (${currentUser.department})`,
                      docs: {},
                    });
                  }}
                />
              ) : activeSection === 'financeiro' ? (
                <FinanceiroFretesView
              onHydrateFreights={(records) => setFreights(prev => { const merged = new Map(prev.map(f => [f.id, f])); records.forEach(f => merged.set(f.id, f)); const next = [...merged.values()]; return JSON.stringify(prev) === JSON.stringify(next) ? prev : next; })}
                  freights={freights}
                  currentUser={currentUser}
                  onAddFreight={handleAddFreight}
                  onUpdateFreight={handleUpdateFreight}
                  initialSharedDraft={pendingSharedDraft}
                  onClearInitialSharedDraft={() => setPendingSharedDraft(null)}
                />
              ) : activeSection !== 'inicio' ? (
                <ModulesView
              onMuralHydrated={(records, notices) => {setAnnouncements(records);setNotifications(prev => {const merged=new Map(prev.map(n=>[n.id,n]));notices.forEach(n=>merged.set(n.id,n));return [...merged.values()];});}}
                  activeSection={activeSection}
                  currentUser={currentUser}
                  employees={employees}
                  announcements={announcements}
                  requests={requests}
                  events={events}
                  documents={documents}
                  chats={chats}
                  invites={invites}
                  auditLogs={auditLogs}
                  systemConfig={systemConfig || undefined}
                  pendingAccessRequestsCount={pendingAccessRequestsCount}
                  onPendingCountChange={setPendingAccessRequestsCount}
                  onAccountsUpdated={setEmployees}
                  onSystemConfigPublished={setSystemConfig}
                  onConfirmRead={handleConfirmRead}
                  onToggleLike={handleToggleLike}
                  onAddComment={handleAddComment}
                  onDeleteComment={handleDeleteComment}
                  onCreateAnnouncement={handleCreateAnnouncement}
                  onUpdateAnnouncement={handleUpdateAnnouncement}
                  onTogglePinAnnouncement={handleTogglePinAnnouncement}
                  onToggleArchiveAnnouncement={handleToggleArchiveAnnouncement}
                  onDeleteAnnouncement={handleDeleteAnnouncement}
                  onCreateRequest={handleCreateRequest}
                  onUpdateRequestStatus={handleUpdateRequestStatus}
                  onExtendRequestDeadline={handleExtendRequestDeadline}
                  onAddRequestResponse={handleAddRequestResponse}
                  onEscalateRequestToDiretoria={handleEscalateRequestToDiretoria}
                  onDeleteRequest={handleDeleteRequest}
                  onSendMessage={handleSendMessage}
                  onMarkThreadRead={handleMarkThreadRead}
                  onCreateGroupChat={handleCreateGroupChat}
                  onUpdateThreadPinnedNotice={handleUpdateThreadPinnedNotice}
                  onTogglePinMessage={handleTogglePinMessage}
                  onDeleteMessage={handleDeleteMessage}
                  onManageGroupParticipants={handleManageGroupParticipants}
                  onToggleEventRsvp={handleToggleEventRsvp}
                  onCreateEvent={handleCreateEvent}
                  onUpdateEvent={handleUpdateEvent}
                  onDeleteEvent={handleDeleteEvent}
                  onUploadDocument={handleUploadDocument}
                  onUpdateDocumentVersion={handleUpdateDocumentVersion}
                  onDeleteDocument={handleDeleteDocument}
                  onCreateInvite={handleCreateInvite}
                  onActivateInviteToken={handleActivateInviteToken}
                  onToggleEmployeeActive={handleToggleEmployeeActive}
                  onCreateEmployeeDirect={handleCreateEmployeeDirect}
                  onUpdateEmployeeAdmin={handleUpdateEmployeeAdmin}
                  onUpdateMyProfile={handleUpdateMyProfile}
                  onRestorePortalDefaults={handleRestorePortalDefaults}
                  onImportPortalBackup={handleImportPortalBackup}
                  onStartDirectChat={handleStartDirectChat}
                  onNavigate={setActiveSection}
                  initialOpenRequestModal={openRequestModalOnLoad}
                  onClearInitialModal={() => setOpenRequestModalOnLoad(false)}
                />
              ) : (
                /* =============================================================
                   DASHBOARD PRINCIPAL (INÍCIO) — FIEL À IMAGEM DE REFERÊNCIA
                ============================================================= */
                <HomePremium user={currentUser} config={systemConfig} notifications={sortedUniqueNotifications}
                  navigate={setActiveSection} openAnnouncement={setSelectedAnnouncementModal}
                  openNotifications={()=>setShowNotificationsCenterModal(true)} accessNotification={handleAccessNotification}
                  openContacts={()=>setQuickAccessModal({
                                title: 'Contatos Oficiais RODOVAR',
                                subtitle: 'Central de Atendimento RODOVAR • Sua Carga em Primeiro Lugar!',
                                body: '• Telefone / WhatsApp Oficial: 71 9 9920-2476\n• Instagram Oficial: @rodovartransportadora\n• Site Institucional: www.rodovar.com.br\n• Recursos Humanos (Folha e Benefícios): Telefone: 71 9 9920-2476 | rh@rodovar.com.br\n• Plantão Operacional e Tráfego 24h: Telefone: 71 9 9920-2476 | operacoes@rodovar.com.br\n• Engenharia de Segurança do Trabalho (SST): Telefone: 71 9 9920-2476 | seguranca@rodovar.com.br\n• Financeiro e Faturamento: Telefone: 71 9 9920-2476 | financeiro@rodovar.com.br',
                  })}/>

              )}
            </main>
          </div>
        </div>
      </div>

      {/* =====================================================================
          MODAL: CENTRAL DE NOTIFICAÇÕES INTELIGENTES COMPLETA (FASE 7)
      ===================================================================== */}
      {showNotificationsCenterModal && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" aria-label="Central de Notificações" className="nc-center bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl max-h-[88vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#FFD400] flex items-center justify-center text-[#080B0D]">
                  <Bell className="w-5 h-5 fill-[#080B0D]" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#15191D]">
                    Central de Notificações
                  </h3>
                  <p className="text-xs text-gray-500">
                    Comunicados, eventos, solicitações e atualizações operacionais
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowNotificationsCenterModal(false)}
                className="p-1 text-gray-400 hover:text-gray-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter Tabs & Mark All Read */}
            <div className="py-3 flex flex-wrap items-center justify-between gap-2 border-b border-gray-100">
              <div className="flex flex-wrap gap-1">
                {[
                  { id: 'todas', label: 'Todas' },
                  { id: 'nao_lidas', label: `Não lidas (${unreadNotificationsCount})` },
                  { id: 'comunicado', label: 'Comunicados' },
                  { id: 'solicitacao', label: 'Solicitações / SLA 48h' },
                  { id: 'frete', label: 'Fretes' },
                  { id: 'evento', label: 'Eventos' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setNotifCenterFilter(tab.id)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                      notifCenterFilter === tab.id
                        ? 'bg-[#080B0D] text-[#FFD400]'
                        : 'bg-[#F3F5F7] text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <button
                onClick={handleMarkAllNotificationsRead}
                className="text-xs font-bold text-blue-600 hover:underline cursor-pointer"
              >
                Marcar todas como lidas
              </button>
            </div>

            {notificationNavigationError&&<p role="alert" className="nc-error">{notificationNavigationError}</p>}
            {/* Notifications List */}
            <div className="flex-1 overflow-y-auto divide-y divide-gray-100 my-2">
              {sortedUniqueNotifications
                .filter(n => notificationMatches(n,notifCenterFilter))
                .map((n) => (
                  <div
                    key={n.id}
                    data-unread={!n.read} className="nc-notice py-3 px-3 flex items-center justify-between gap-3 hover:bg-gray-50 rounded-xl transition-colors"
                  >
                    <button
                      onClick={() => {
                        handleAccessNotification(n);
                      }}
                      className="flex items-start gap-3 text-left flex-1 cursor-pointer min-w-0"
                    >
                      <span
                        className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${
                          n.dotColor === 'red' ? 'bg-[#E5252A]' : 'bg-[#2563EB]'
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          {n.read ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-500 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded-md">
                              ✓ Lida
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-md">
                              ● Não lida
                            </span>
                          )}
                          <span className="text-[10px] text-gray-400 tabular-nums">{n.timeLabel}</span>
                        </div>
                        <p
                          className={`text-xs ${
                            n.read ? 'font-semibold text-gray-600' : 'font-extrabold text-[#15191D]'
                          }`}
                        >
                          {n.title}
                        </p>
                        <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{n.subtitle}</p>
                      </div>
                    </button>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => {
                          handleAccessNotification(n);
                        }}
                        className="text-[11px] font-bold bg-[#FFD400] text-[#080B0D] px-2.5 py-1 rounded-lg hover:bg-[#ffdf33] cursor-pointer"
                      >
                        Acessar
                      </button>
                      {!n.read && (
                        <button
                          onClick={() => handleMarkNotificationRead(n.id)}
                          className="text-[11px] font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 px-2.5 py-1 rounded-lg cursor-pointer"
                        >
                          Marcar lida
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteNotification(n.id)}
                        className="text-[11px] font-bold text-gray-400 hover:text-[#E5252A] px-2 py-1 cursor-pointer"
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL: FEATURED ANNOUNCEMENT READER + MANDATORY READ CONFIRMATION
      ===================================================================== */}
      {selectedAnnouncementModal && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-gray-100">
              <div>
                <div className="flex items-center gap-2">
                  <span className="bg-[#E5252A] text-white text-xs font-bold px-2.5 py-0.5 rounded">
                    {selectedAnnouncementModal.category}
                  </span>
                  <span className="text-xs text-gray-500">
                    {selectedAnnouncementModal.dateFormatted} •{' '}
                    {selectedAnnouncementModal.department}
                  </span>
                </div>
                <h3 className="text-lg font-extrabold text-[#15191D] mt-1.5 uppercase">
                  {selectedAnnouncementModal.title}
                </h3>
              </div>
              <button
                onClick={() => setSelectedAnnouncementModal(null)}
                className="p-1 text-gray-400 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-sm text-gray-700 whitespace-pre-line leading-relaxed max-h-80 overflow-y-auto">
              {selectedAnnouncementModal.content}
            </div>

            <div className="mt-6 pt-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
              {selectedAnnouncementModal.requireReadConfirmation ? (
                selectedAnnouncementModal.readReceipts.some(
                  (r) => r.userId === currentUser.id
                ) ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3.5 py-2 rounded-lg">
                    <CheckCircle2 className="w-4 h-4" />
                    Leitura Confirmada Registrada
                  </span>
                ) : (
                  <button
                    onClick={() => handleConfirmRead(selectedAnnouncementModal.id)}
                    className="bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] text-xs font-extrabold px-5 py-2.5 rounded-lg inline-flex items-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <Check className="w-4 h-4 stroke-[2.5]" />
                    Confirmar leitura obrigatória
                  </button>
                )
              ) : (
                <span className="text-xs text-gray-400">Comunicado informativo</span>
              )}

              <button
                onClick={() => {
                  setSelectedAnnouncementModal(null);
                  setActiveSection('comunicados');
                }}
                className="text-xs font-bold text-gray-600 hover:text-[#15191D] px-3 py-2 cursor-pointer"
              >
                Abrir no Mural Completo →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL: QUICK ACCESS CONTACTS
      ===================================================================== */}
      {quickAccessModal && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="text-base font-extrabold text-[#15191D]">
                  {quickAccessModal.title}
                </h3>
                <p className="text-xs text-gray-500">{quickAccessModal.subtitle}</p>
              </div>
              <button onClick={() => setQuickAccessModal(null)}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="mt-4 bg-[#F3F5F7] p-4 rounded-xl text-xs text-gray-700 whitespace-pre-line leading-relaxed">
              {quickAccessModal.body}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setQuickAccessModal(null)}
                className="bg-[#FFD400] text-[#080B0D] text-xs font-extrabold px-4 py-2 rounded-lg cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          FASE 8: BUSCA CORPORATIVA UNIFICADA — COMMAND PALETTE (CTRL+K)
      ===================================================================== */}
      {showCommandPalette && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-start justify-center pt-14 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden border border-gray-200 flex flex-col max-h-[80vh]">
            {/* Search Input Bar */}
            <div className="p-4 bg-[#080B0D] text-white flex items-center gap-3">
              <Search className="w-5 h-5 text-[#FFD400] shrink-0" />
              <input
                type="text"
                autoFocus
                value={globalSearchQuery}
                onChange={(e) => setGlobalSearchQuery(e.target.value)}
                placeholder="O que você procura?"
                className="w-full bg-transparent text-sm text-white placeholder-gray-400 focus:outline-none"
              />
              {globalSearchQuery && (
                <button
                  type="button"
                  onClick={() => setGlobalSearchQuery('')}
                  title="Limpar texto"
                  aria-label="Limpar texto"
                  className="p-1 rounded-lg text-gray-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowCommandPalette(false)}
                title="Fechar busca (Esc)"
                aria-label="Fechar busca (Esc)"
                className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Category Filters */}
            <div className="px-4 py-2.5 bg-[#F3F5F7] border-b border-gray-200 flex flex-wrap gap-1.5">
              {[
                { id: 'tudo', label: 'Tudo' },
                { id: 'comunicados', label: `Comunicados (${announcements.length})` },
                { id: 'solicitacoes', label: `Solicitações SLA (${requests.length})` },
                { id: 'funcionarios', label: `Colaboradores (${employees.length})` },
                { id: 'documentos', label: `Documentos (${documents.length})` },
                { id: 'agenda', label: `Agenda (${events.length})` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() =>
                    setGlobalSearchFilter(
                      tab.id as
                        | 'tudo'
                        | 'comunicados'
                        | 'solicitacoes'
                        | 'funcionarios'
                        | 'documentos'
                        | 'agenda'
                    )
                  }
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    globalSearchFilter === tab.id
                      ? 'bg-[#FFD400] text-[#080B0D]'
                      : 'bg-white text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Results Body */}
            <div className="p-4 overflow-y-auto space-y-4 text-xs flex-1">
              {/* 1. Comunicados */}
              {(globalSearchFilter === 'tudo' || globalSearchFilter === 'comunicados') && (
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400 mb-2">
                    Mural de Comunicados Oficiais
                  </p>
                  <div className="space-y-1.5">
                    {announcements
                      .filter(
                        (a) =>
                          !globalSearchQuery.trim() ||
                          a.title.toLowerCase().includes(globalSearchQuery.toLowerCase()) ||
                          a.summary.toLowerCase().includes(globalSearchQuery.toLowerCase()) ||
                          a.department.toLowerCase().includes(globalSearchQuery.toLowerCase())
                      )
                      .slice(0, 4)
                      .map((a) => (
                        <button
                          key={a.id}
                          onClick={() => {
                            setShowCommandPalette(false);
                            setSelectedAnnouncementModal(a);
                          }}
                          className="w-full text-left p-2.5 rounded-xl hover:bg-[#F3F5F7] flex items-center justify-between gap-3 border border-gray-100 cursor-pointer"
                        >
                          <div>
                            <p className="font-extrabold text-[#15191D]">{a.title}</p>
                            <p className="text-[11px] text-gray-500">
                              {a.category} • {a.department} • {a.dateFormatted}
                            </p>
                          </div>
                          <span className="text-[10px] font-bold bg-[#FFD400]/30 text-[#080B0D] px-2 py-0.5 rounded shrink-0">
                            Ler Comunicado →
                          </span>
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {/* 2. Solicitações Internas (SLA 48h) */}
              {(globalSearchFilter === 'tudo' || globalSearchFilter === 'solicitacoes') && (
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400 mb-2">
                    Solicitações Internas & Protocolos (SLA 48h)
                  </p>
                  <div className="space-y-1.5">
                    {requests
                      .filter(
                        (r) =>
                          !globalSearchQuery.trim() ||
                          r.protocol.toLowerCase().includes(globalSearchQuery.toLowerCase()) ||
                          r.subject.toLowerCase().includes(globalSearchQuery.toLowerCase()) ||
                          r.targetDepartment.toLowerCase().includes(globalSearchQuery.toLowerCase())
                      )
                      .slice(0, 4)
                      .map((r) => (
                        <button
                          key={r.id}
                          onClick={() => {
                            setShowCommandPalette(false);
                            setActiveSection('solicitacoes');
                          }}
                          className="w-full text-left p-2.5 rounded-xl hover:bg-[#F3F5F7] flex items-center justify-between gap-3 border border-gray-100 cursor-pointer"
                        >
                          <div>
                            <p className="font-extrabold text-[#15191D]">
                              <span className="font-mono text-[#080B0D] bg-[#FFD400] px-1.5 py-0.5 rounded mr-1.5">
                                {r.protocol}
                              </span>
                              {r.subject}
                            </p>
                            <p className="text-[11px] text-gray-500 mt-0.5">
                              Destino: {r.targetDepartment} • Status: {r.status}
                            </p>
                          </div>
                          <span className="text-[10px] font-bold text-blue-600 shrink-0">
                            Ver Chamado →
                          </span>
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {/* 3. Diretório de Colaboradores */}
              {(globalSearchFilter === 'tudo' || globalSearchFilter === 'funcionarios') && (
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400 mb-2">
                    Diretório de Colaboradores RODOVAR
                  </p>
                  <div className="space-y-1.5">
                    {employees
                      .filter(
                        (emp) =>
                          !globalSearchQuery.trim() ||
                          emp.name.toLowerCase().includes(globalSearchQuery.toLowerCase()) ||
                          emp.roleTitle.toLowerCase().includes(globalSearchQuery.toLowerCase()) ||
                          emp.department.toLowerCase().includes(globalSearchQuery.toLowerCase()) ||
                          emp.phoneExt.toLowerCase().includes(globalSearchQuery.toLowerCase())
                      )
                      .slice(0, 4)
                      .map((emp) => (
                        <div
                          key={emp.id}
                          className="p-2.5 rounded-xl hover:bg-[#F3F5F7] flex items-center justify-between gap-3 border border-gray-100"
                        >
                          <div>
                            <p className="font-extrabold text-[#15191D]">{emp.name}</p>
                            <p className="text-[11px] text-gray-500">
                              {emp.roleTitle} • {emp.department} • {emp.phoneExt}
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              setShowCommandPalette(false);
                              handleStartDirectChat(emp);
                            }}
                            className="bg-[#080B0D] text-[#FFD400] text-[10px] font-bold px-2.5 py-1 rounded-lg cursor-pointer"
                          >
                            Enviar Mensagem
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* 4. Documentos & Guias de Trabalho */}
              {(globalSearchFilter === 'tudo' || globalSearchFilter === 'documentos') && (
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400 mb-2">
                    Biblioteca de Documentos & Guias de Trabalho
                  </p>
                  <div className="space-y-1.5">
                    {documents
                      .filter(
                        (d) =>
                          !globalSearchQuery.trim() ||
                          d.title.toLowerCase().includes(globalSearchQuery.toLowerCase()) ||
                          d.category.toLowerCase().includes(globalSearchQuery.toLowerCase())
                      )
                      .slice(0, 3)
                      .map((d) => (
                        <button
                          key={d.id}
                          onClick={() => {
                            setShowCommandPalette(false);
                            setActiveSection('comunicados');
                          }}
                          className="w-full text-left p-2.5 rounded-xl hover:bg-[#F3F5F7] flex items-center justify-between gap-3 border border-gray-100 cursor-pointer"
                        >
                          <div>
                            <p className="font-extrabold text-[#15191D]">
                              {d.title}{' '}
                              <span className="font-mono text-[10px] text-gray-400">
                                ({d.version})
                              </span>
                            </p>
                            <p className="text-[11px] text-gray-500">
                              {d.category} • {d.fileType} ({d.size})
                            </p>
                          </div>
                          <span className="text-[10px] font-bold text-gray-600 shrink-0">
                            Abrir Documento →
                          </span>
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {/* Estado Vazio de Busca */}
              {globalSearchQuery.trim() &&
                !announcements.some(
                  (a) =>
                    a.title.toLowerCase().includes(globalSearchQuery.toLowerCase()) ||
                    a.summary.toLowerCase().includes(globalSearchQuery.toLowerCase()) ||
                    a.department.toLowerCase().includes(globalSearchQuery.toLowerCase())
                ) &&
                !requests.some(
                  (r) =>
                    r.protocol.toLowerCase().includes(globalSearchQuery.toLowerCase()) ||
                    r.subject.toLowerCase().includes(globalSearchQuery.toLowerCase()) ||
                    r.targetDepartment.toLowerCase().includes(globalSearchQuery.toLowerCase())
                ) &&
                !employees.some(
                  (emp) =>
                    emp.name.toLowerCase().includes(globalSearchQuery.toLowerCase()) ||
                    emp.roleTitle.toLowerCase().includes(globalSearchQuery.toLowerCase()) ||
                    emp.department.toLowerCase().includes(globalSearchQuery.toLowerCase())
                ) &&
                !documents.some(
                  (d) =>
                    d.title.toLowerCase().includes(globalSearchQuery.toLowerCase()) ||
                    d.category.toLowerCase().includes(globalSearchQuery.toLowerCase())
                ) && (
                  <div className="py-10 text-center space-y-3">
                    <p className="text-sm font-extrabold text-[#15191D]">
                      Nenhum resultado encontrado para "{globalSearchQuery}"
                    </p>
                    <p className="text-xs text-gray-500 max-w-sm mx-auto">
                      Verifique a digitação ou tente pesquisar por termos mais gerais, como nome de colaborador, comunicado ou guia.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setGlobalSearchQuery('');
                        setGlobalSearchFilter('tudo');
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FFD400] text-[#080B0D] text-xs font-extrabold hover:bg-[#ffdf33] cursor-pointer"
                    >
                      Limpar pesquisa e tentar novamente
                    </button>
                  </div>
                )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL DE INSTALAÇÃO DO APLICATIVO CORPORATIVO (PWA)
      ===================================================================== */}
      <PWAInstallModal
        isOpen={showPWAInstallGuideModal}
        onClose={() => setShowPWAInstallGuideModal(false)}
        onPostpone={() => {
          postponeInstall();
          setShowPWAInstallGuideModal(false);
        }}
        canPromptInstall={canPromptInstall}
        isInstalled={isInstalled}
        isIOS={isIOS}
        isAndroid={isAndroid}
        isSafariIOS={isSafariIOS}
        isInAppBrowser={isInAppBrowser}
        inAppBrowserName={inAppBrowserName}
        isInIframe={isInIframe}
        installOutcome={installOutcome}
        onTriggerInstall={triggerPWAInstall}
        onResetOutcome={resetInstallOutcome}
      />

      {/* =====================================================================
          AVISO CONTROLADO DE NOVA VERSÃO (SERVICE WORKER)
      ===================================================================== */}
      {updateAvailable && (
        <div
          role="alert"
          className="fixed bottom-4 right-4 z-50 max-w-sm rounded-2xl bg-[#080B0D] border-2 border-[#FFD400] p-4 text-xs text-white shadow-2xl flex items-center justify-between gap-3"
        >
          <div className="space-y-0.5">
            <p className="font-extrabold text-[#FFD400]">Uma nova versão está disponível.</p>
            <p className="text-[11px] text-gray-300">
              Atualize quando concluir sua tarefa atual.
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={applyUpdate}
              disabled={isUpdating}
              className="bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] font-extrabold px-3.5 py-2 rounded-xl cursor-pointer transition"
            >
              {isUpdating ? 'Atualizando...' : 'Atualizar agora'}
            </button>
            <button
              type="button"
              onClick={dismissUpdate}
              className="p-1.5 text-gray-400 hover:text-white rounded-lg cursor-pointer"
              aria-label="Adiar atualização"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          INDICADOR DE CONEXÃO OFFLINE
      ===================================================================== */}
      {!isOnline && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-4 right-4 sm:right-auto z-50 flex items-center gap-2.5 rounded-xl bg-[#080B0D] border-2 border-[#FFD400] px-4 py-3 text-xs font-extrabold text-[#FFD400] shadow-2xl"
        >
          <WifiOff className="w-4 h-4 text-[#E5252A] animate-pulse shrink-0" />
          <span>Você está sem conexão. Algumas funções precisam de internet.</span>
        </div>
      )}
    </div>
  );
}


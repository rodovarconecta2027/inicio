import React, { useState } from 'react';
import {
  ArrowLeft,
  Bell,
  Calendar,
  Check,
  ChevronRight,
  Download,
  FileText,
  Folder,
  Home,
  LogOut,
  Megaphone,
  Menu,
  Search,
  Signal,
  Wifi,
  BatteryFull,
  X,
} from 'lucide-react';
import { RodovarLogo } from './RodovarLogo';
import { WelcomeBannerCarousel } from './WelcomeBannerCarousel';
import {
  Announcement,
  CorporateNotification,
  Employee,
  MenuSection,
  SystemConfig,
  UserRole,
} from '../types';
import { hasPagePermission } from '../lib/permissions';
import { resolveAvatarUrl, withRevisionParam } from '../lib/serverApi';

interface MobileSimulatorProps {
  onNavigate: (section: MenuSection) => void;
  onOpenAnnouncement: (ann: Announcement) => void;
  featuredAnnouncement: Announcement;
  notifications: CorporateNotification[];
  unreadAnnouncementsCount: number;
  openRequestsCount: number;
  unreadNotificationsCount: number;
  activeSection: MenuSection;
  currentUser?: Employee;
  systemConfig?: SystemConfig;
  onLogout?: () => void;
  onSwitchUserRole?: (role: UserRole) => void;
  onOpenSearch?: () => void;
  onOpenNotificationsCenter?: () => void;
  onOpenInstallModal?: () => void;
  isInstalled?: boolean;
  canPromptInstall?: boolean;
  onClose?: () => void;
  isEmbedded?: boolean;
  children?: React.ReactNode;
}

const SECTION_LABELS: Record<MenuSection, string> = {
  inicio: 'Início',
  comunicados: 'Mural de Comunicados',
  fretes_comercial: 'Meus Fretes — Comercial',
  fretes_expedicao: 'Meus Fretes — Expedição',
  fretes_ativos: 'Fretes Ativos',
  mensagens: 'Mensagens Diretas',
  grupos: 'Grupos Corporativos',
  solicitacoes: 'Minhas Solicitações (Prazo 48h)',
  financeiro: 'Financeiro - Fretes',
  agenda: 'Agenda Corporativa',
  documentos: 'Central de Documentos POP',
  diretorio: 'Diretório de Funcionários',
  perfil: 'Meu Perfil & Crachá',
  administracao: 'Painel Administrativo & Diretoria',
  ajuda: 'Central de Ajuda & Suporte',
};

export const MobileDeviceView: React.FC<MobileSimulatorProps> = ({
  onNavigate,
  onOpenAnnouncement,
  featuredAnnouncement,
  notifications,
  unreadAnnouncementsCount,
  openRequestsCount,
  unreadNotificationsCount,
  activeSection,
  currentUser,
  systemConfig,
  onLogout,
  onSwitchUserRole,
  onOpenSearch,
  onOpenNotificationsCenter,
  onOpenInstallModal,
  isInstalled = false,
  canPromptInstall = false,
  onClose,
  isEmbedded = false,
  children,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const canAccessAdmin =
    !currentUser ||
    currentUser.accessLevel === 'ADMINISTRADOR' ||
    currentUser.accessLevel === 'DIRETORIA';

  return (
    <div
      className={`relative bg-[#080B0D] text-[#15191D] flex flex-col overflow-hidden select-none ${
        isEmbedded
          ? 'w-[310px] xl:w-[330px] h-[690px] rounded-[42px] border-[8px] border-[#1A1E24] shadow-[0_25px_60px_rgba(0,0,0,0.65)] shrink-0'
          : 'w-full min-h-screen'
      }`}
    >
      {/* iOS Status Bar (only on phone frame) */}
      {isEmbedded && (
        <div className="bg-[#080B0D] text-white px-6 pt-2 pb-1 flex items-center justify-between text-[11px] font-semibold relative z-20">
          <span>9:41</span>
          <div className="w-20 h-4 bg-black rounded-full mx-auto" />
          <div className="flex items-center gap-1.5">
            <Signal className="w-3 h-3" />
            <Wifi className="w-3 h-3" />
            <BatteryFull className="w-3.5 h-3.5" />
          </div>
        </div>
      )}

      {/* Mobile Top Header */}
      <div className="bg-[#080B0D] px-4 py-2.5 flex items-center justify-between relative z-30 border-b border-white/5">
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-1.5 text-white/90 hover:text-[#FFD400] transition-colors rounded-lg cursor-pointer"
          aria-label="Abrir menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <RodovarLogo size="sm" onClick={() => onNavigate('inicio')} />

        <div className="flex items-center gap-1.5">
          {!isInstalled && onOpenInstallModal && (
            <button
              type="button"
              onClick={onOpenInstallModal}
              className="px-2 py-1 rounded-lg bg-[#FFD400] text-[#080B0D] text-[10px] font-extrabold inline-flex items-center gap-1 shadow-xs cursor-pointer"
              aria-label={canPromptInstall ? 'Instalar aplicativo' : 'Como instalar'}
            >
              <Download className="w-3 h-3 stroke-[2.5]" />
              <span>{canPromptInstall ? 'Instalar' : 'App'}</span>
            </button>
          )}
          {onOpenSearch && (
            <button
              onClick={onOpenSearch}
              className="p-1.5 text-white/90 hover:text-[#FFD400] transition-colors cursor-pointer"
              aria-label="Buscar no portal"
            >
              <Search className="w-4 h-4 text-[#FFD400]" />
            </button>
          )}
          <button
            onClick={() => {
              if (onOpenNotificationsCenter) {
                onOpenNotificationsCenter();
              } else {
                onNavigate('comunicados');
              }
            }}
            className="relative p-1.5 text-white hover:text-[#FFD400] transition-colors cursor-pointer"
            aria-label="Notificações"
          >
            <Bell className="w-5 h-5 fill-white" />
            {unreadNotificationsCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-[#E5252A] text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow">
                {unreadNotificationsCount}
              </span>
            )}
          </button>
          {onClose && !isEmbedded && (
            <button onClick={onClose} className="p-1 text-white/70 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Collapsible Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 top-[54px] z-40 bg-[#0B0E11]/98 backdrop-blur-md p-4 flex flex-col justify-between overflow-y-auto">
          <div className="space-y-3">
            {/* User Identity Card in Mobile Drawer */}
            {currentUser && (
              <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <img
                    src={resolveAvatarUrl(currentUser, systemConfig)}
                    alt={currentUser.name}
                    referrerPolicy="no-referrer"
                    className="w-10 h-10 rounded-full object-cover aspect-square border-2 border-[#FFD400] shrink-0 bg-[#15191D]"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold text-white truncate">{currentUser.name}</p>
                    <p className="text-[11px] text-gray-400 truncate">
                      {currentUser.roleTitle} • {currentUser.department}
                    </p>
                  </div>
                </div>
                <span className="font-mono text-[9.5px] font-extrabold bg-[#FFD400] text-[#080B0D] px-2 py-0.5 rounded shrink-0">
                  {currentUser.accessLevel}
                </span>
              </div>
            )}

            <div className="space-y-1">
              {[
                { id: 'inicio', label: 'Início' },
                { id: 'comunicados', label: 'Mural de Comunicados', badge: unreadAnnouncementsCount },
                { id: 'fretes_comercial', label: 'Meus Fretes — Comercial' },
                { id: 'fretes_expedicao', label: 'Meus Fretes — Expedição' },
                { id: 'fretes_ativos', label: 'Fretes Ativos' },
                { id: 'solicitacoes', label: 'Minhas Solicitações', badge: openRequestsCount },
                { id: 'financeiro', label: 'Financeiro' },
                { id: 'mensagens', label: 'Mensagens' },
                { id: 'grupos', label: 'Grupos' },
                { id: 'agenda', label: 'Agenda Corporativa' },
                { id: 'diretorio', label: 'Diretório de Funcionários' },
                { id: 'perfil', label: 'Meu Perfil' },
                ...(canAccessAdmin
                  ? [{ id: 'administracao', label: 'Painel Administrativo' }]
                  : []),
                { id: 'ajuda', label: 'Ajuda' },
              ]
                .filter((item) => {
                  if (item.id === 'perfil' || item.id === 'ajuda' || item.id === 'administracao') {
                    return true;
                  }
                  return hasPagePermission(currentUser, item.id);
                })
                .map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    onNavigate(item.id as MenuSection);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    activeSection === item.id
                      ? 'bg-[#FFD400] text-[#080B0D] font-bold'
                      : 'text-gray-200 hover:bg-white/10'
                  }`}
                >
                  <span>{item.label}</span>
                  {item.badge ? (
                    <span className="bg-[#E5252A] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                      {item.badge}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>

            {/* Mobile RBAC Switcher */}
            {currentUser && onSwitchUserRole && (
              <div className="pt-2 border-t border-white/10 space-y-1.5">
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400 px-1">
                  Alternar Perfil RBAC
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['ADMINISTRADOR', 'DIRETORIA', 'FUNCIONARIO'] as UserRole[]).map((role) => (
                    <button
                      key={role}
                      onClick={() => {
                        onSwitchUserRole(role);
                        setMobileMenuOpen(false);
                      }}
                      className={`px-2 py-1.5 rounded-lg text-[10px] font-extrabold flex items-center justify-center gap-1 cursor-pointer ${
                        currentUser.accessLevel === role
                          ? 'bg-[#FFD400] text-[#080B0D]'
                          : 'bg-white/5 text-gray-300 hover:bg-white/10'
                      }`}
                    >
                      {currentUser.accessLevel === role && <Check className="w-3 h-3" />}
                      <span className="truncate">{role}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-white/10 space-y-2 mt-4">
            {!isInstalled && onOpenInstallModal && (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenInstallModal();
                }}
                className="w-full py-2.5 rounded-xl bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] text-xs font-extrabold flex items-center justify-center gap-2 shadow-sm cursor-pointer"
              >
                <Download className="w-4 h-4 stroke-[2.4]" />
                <span>{canPromptInstall ? 'Instalar aplicativo' : 'Como instalar no celular'}</span>
              </button>
            )}
            {onLogout && (
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onLogout();
                }}
                className="w-full py-2.5 rounded-xl bg-[#E5252A]/15 hover:bg-[#E5252A]/25 border border-[#E5252A]/30 text-[#E5252A] text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Sair / Voltar à Tela de Login</span>
              </button>
            )}
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="w-full py-2 text-xs font-bold text-center text-gray-400 hover:text-white cursor-pointer"
            >
              Fechar Menu
            </button>
          </div>
        </div>
      )}

      {/* Scrollable Mobile Content */}
      <div className="flex-1 overflow-y-auto bg-[#F3F5F7] pb-20">
        {!isEmbedded && activeSection !== 'inicio' && children ? (
          <div className="p-3 space-y-3">
            {/* Mobile Contextual Breadcrumb Bar */}
            <div className="bg-[#080B0D] text-white rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2 shadow-xs">
              <button
                onClick={() => onNavigate('inicio')}
                className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#FFD400] hover:underline cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Início</span>
              </button>
              <span className="text-xs font-bold text-gray-200 truncate">
                {SECTION_LABELS[activeSection]}
              </span>
            </div>

            {/* Active Module Content */}
            {children}
          </div>
        ) : (
          <>
            {/* Sunset Sky Strip */}
            <div className="relative h-[78px] w-full overflow-hidden bg-[#080B0D]">
              <img
                src={
                  systemConfig
                    ? withRevisionParam(systemConfig.topHeader.imageUrl, systemConfig.revision)
                    : '/assets/header-sunset.jpg'
                }
                alt="Céu de pôr do sol RODOVAR"
                referrerPolicy="no-referrer"
                style={
                  systemConfig
                    ? {
                        objectPosition: `${systemConfig.topHeader.focusX}% ${systemConfig.topHeader.focusY}%`,
                      }
                    : undefined
                }
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#080B0D]/40 via-transparent to-[#080B0D]/75" />
              <div className="absolute right-3.5 top-2.5 text-right leading-[1.12]">
                <p className="text-[10px] font-extrabold text-white tracking-wide uppercase">
                  JUNTOS
                  <br />
                  LEVANDO
                  <br />O BRASIL
                  <br />
                  MAIS LONGE
                </p>
                <div className="w-7 h-[2.5px] bg-[#FFD400] mt-1 ml-auto" />
              </div>
            </div>

            {/* Main White Rounded Container overlapping sunset strip */}
            <div className="relative -mt-2.5 bg-[#F3F5F7] rounded-t-2xl px-2.5 pt-2.5 space-y-2.5">
              {/* Welcome Truck Banner / Carousel */}
              {systemConfig ? (
                <WelcomeBannerCarousel
                  systemConfig={systemConfig}
                  userAccessLevel={currentUser?.accessLevel || 'FUNCIONARIO'}
                  onViewAnnouncements={() => onNavigate('comunicados')}
                  compactMobile
                />
              ) : (
                <div className="relative rounded-xl overflow-hidden bg-[#0B0E11] h-[132px] shadow-sm">
                  <img
                    src="/assets/aistudio/010203_5a4289e5.png"
                    alt="Caminhão RODOVAR"
                    referrerPolicy="no-referrer"
                    className="absolute inset-0 w-full h-full object-cover object-center"
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-[#080B0D] via-[#080B0D]/80 to-transparent w-[78%]" />
                  <div className="relative z-10 p-3 flex flex-col justify-between h-full max-w-[72%]">
                    <div>
                      <h2 className="text-[13px] font-extrabold text-white leading-tight uppercase">
                        BEM-VINDO AO
                      </h2>
                      <h3 className="text-[14px] font-extrabold text-[#FFD400] leading-tight uppercase">
                        RODOVAR CONECTA!
                      </h3>
                      <p className="text-[10px] text-gray-200 mt-1 leading-snug line-clamp-2">
                        Sua carga em primeiro lugar! Informações oficiais da nossa empresa.
                      </p>
                    </div>
                    <button
                      onClick={() => onNavigate('comunicados')}
                      className="self-start bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] text-[10px] font-bold px-2.5 py-1 rounded-md inline-flex items-center gap-1 shadow cursor-pointer"
                    >
                      <span>Ver comunicados</span>
                      <ChevronRight className="w-3 h-3 stroke-[2.5]" />
                    </button>
                  </div>
                </div>
              )}

              {/* 4 Mobile Shortcut Cards */}
              <div className="grid grid-cols-4 gap-1.5">
                <button
                  onClick={() => onNavigate('comunicados')}
                  className="relative bg-[#FFD400] text-[#080B0D] rounded-lg p-2 flex flex-col items-center justify-center gap-1 shadow-xs cursor-pointer"
                >
                  {unreadAnnouncementsCount > 0 && (
                    <span className="absolute top-1 right-1 bg-[#E5252A] text-white text-[9px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">
                      {unreadAnnouncementsCount}
                    </span>
                  )}
                  <Megaphone className="w-4 h-4 stroke-[2.2]" />
                  <span className="text-[9px] font-bold leading-none truncate w-full text-center">
                    Comunicados
                  </span>
                </button>

                <button
                  onClick={() => onNavigate('solicitacoes')}
                  className="relative bg-white text-[#15191D] rounded-lg p-2 flex flex-col items-center justify-center gap-1 shadow-xs border border-gray-200/70 cursor-pointer"
                >
                  {openRequestsCount > 0 && (
                    <span className="absolute top-1 right-1 bg-[#E5252A] text-white text-[9px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">
                      {openRequestsCount}
                    </span>
                  )}
                  <FileText className="w-4 h-4 text-[#15191D]" />
                  <span className="text-[9px] font-semibold leading-none truncate w-full text-center">
                    Solicitações
                  </span>
                </button>

                <button
                  onClick={() => onNavigate('agenda')}
                  className="bg-white text-[#15191D] rounded-lg p-2 flex flex-col items-center justify-center gap-1 shadow-xs border border-gray-200/70 cursor-pointer"
                >
                  <Calendar className="w-4 h-4 text-[#15191D]" />
                  <span className="text-[9px] font-semibold leading-none truncate w-full text-center">
                    Agenda
                  </span>
                </button>

                <button
                  onClick={() => onNavigate('comunicados')}
                  className="bg-white text-[#15191D] rounded-lg p-2 flex flex-col items-center justify-center gap-1 shadow-xs border border-gray-200/70 cursor-pointer"
                >
                  <Folder className="w-4 h-4 text-[#15191D]" />
                  <span className="text-[9px] font-semibold leading-none truncate w-full text-center">
                    Documentos
                  </span>
                </button>
              </div>

              {/* Mobile Comunicado em Destaque */}
              <div className="bg-white rounded-xl p-2.5 shadow-xs border border-gray-200/80">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Megaphone className="w-3.5 h-3.5 text-[#15191D]" />
                    <span className="text-[11px] font-bold text-[#15191D]">
                      Comunicado em Destaque
                    </span>
                  </div>
                  <button
                    onClick={() => onNavigate('comunicados')}
                    className="text-gray-400 hover:text-[#15191D] cursor-pointer"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="relative rounded-lg border border-gray-100 bg-white overflow-hidden p-2">
                  <div className="relative z-10 max-w-[68%]">
                    <div className="flex items-start gap-2">
                      <div className="w-7 h-7 rounded-md bg-[#FFD400] flex items-center justify-center shrink-0">
                        <Calendar className="w-4 h-4 text-[#080B0D]" />
                      </div>
                      <div>
                        <h4 className="text-[10.5px] font-extrabold text-[#15191D] uppercase leading-tight">
                          {featuredAnnouncement.title}
                        </h4>
                        <p className="text-[9px] text-gray-500 mt-0.5">
                          {featuredAnnouncement.dateFormatted} • {featuredAnnouncement.department}
                        </p>
                      </div>
                    </div>
                    <p className="text-[9.5px] text-gray-600 mt-1.5 leading-snug line-clamp-3">
                      {featuredAnnouncement.summary}
                    </p>
                    <button
                      onClick={() => onOpenAnnouncement(featuredAnnouncement)}
                      className="mt-2 bg-[#FFD400] text-[#080B0D] text-[9.5px] font-bold px-2.5 py-1 rounded shadow-2xs cursor-pointer"
                    >
                      Ler comunicado
                    </button>
                  </div>
                  <div className="absolute right-0 bottom-0 top-0 w-[42%] pointer-events-none">
                    <img
                      src={featuredAnnouncement.coverImage || '/assets/aistudio/010203_5a4289e5.png'}
                      alt="Destaque RODOVAR"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover object-center"
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-white via-white/35 to-transparent" />
                  </div>
                </div>
              </div>

              {/* Mobile Minhas Notificações */}
              <div className="bg-white rounded-xl p-2.5 shadow-xs border border-gray-200/80">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5 text-[#15191D] fill-[#15191D]" />
                    <span className="text-[11px] font-bold text-[#15191D]">
                      Minhas Notificações
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      if (onOpenNotificationsCenter) {
                        onOpenNotificationsCenter();
                      } else {
                        onNavigate('comunicados');
                      }
                    }}
                    className="text-[9.5px] font-semibold text-gray-500 flex items-center gap-0.5 cursor-pointer"
                  >
                    <span>Ver todas</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="divide-y divide-gray-100">
                  {notifications.slice(0, 3).map((n) => (
                    <button
                      key={n.id}
                      onClick={() => onNavigate(n.targetSection)}
                      className="w-full py-1.5 flex items-start justify-between text-left gap-2 cursor-pointer"
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        <span
                          className={`w-2 h-2 rounded-full mt-1 shrink-0 ${
                            n.dotColor === 'red' ? 'bg-[#E5252A]' : 'bg-[#2563EB]'
                          }`}
                        />
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold text-[#15191D] truncate">{n.title}</p>
                          <p className="text-[9px] text-gray-500 truncate">{n.subtitle}</p>
                        </div>
                      </div>
                      <span className="text-[9px] text-gray-400 tabular-nums shrink-0">
                        {n.timeLabel}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Bottom Navigation Bar */}
      <div className="bg-[#0B0E11] border-t border-white/10 px-3 py-2 grid grid-cols-4 gap-1 fixed bottom-0 left-0 right-0 z-30">
        <button
          onClick={() => onNavigate('inicio')}
          className={`flex flex-col items-center gap-0.5 cursor-pointer ${
            activeSection === 'inicio' ? 'text-[#FFD400]' : 'text-gray-400 hover:text-white'
          }`}
        >
          <Home className="w-4 h-4" />
          <span className="text-[9px] font-bold">Início</span>
        </button>
        <button
          onClick={() => onNavigate('solicitacoes')}
          className={`flex flex-col items-center gap-0.5 cursor-pointer ${
            activeSection === 'solicitacoes' ? 'text-[#FFD400]' : 'text-gray-400 hover:text-white'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span className="text-[9px] font-medium">Solicitações</span>
        </button>
        <button
          onClick={() => onNavigate('agenda')}
          className={`flex flex-col items-center gap-0.5 cursor-pointer ${
            activeSection === 'agenda' ? 'text-[#FFD400]' : 'text-gray-400 hover:text-white'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span className="text-[9px] font-medium">Agenda</span>
        </button>
        <button
          onClick={() => onNavigate('comunicados')}
          className={`flex flex-col items-center gap-0.5 cursor-pointer ${
            activeSection === 'comunicados' ? 'text-[#FFD400]' : 'text-gray-400 hover:text-white'
          }`}
        >
          <Folder className="w-4 h-4" />
          <span className="text-[9px] font-medium">Mural</span>
        </button>
      </div>
    </div>
  );
};


import React, { useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  FileText,
  Headphones,
  LockKeyhole,
  Mail,
  MessageSquare,
  Settings,
  Users,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  EyeOff,
  Lock,
  Shield,
  ShieldCheck,
  Truck,
  UserCheck,
} from 'lucide-react';
import { RodovarLogo } from './RodovarLogo';
import './LoginScreen.css';
import { Department, Employee, SystemConfig } from '../types';
import {
  apiCheckLockStatus,
  apiLogin,
  apiRequestAccess,
} from '../lib/serverApi';
import {
  isFirebaseEmulatorPortalEnabled,
  signInFirebaseTest,
} from '../firebase-test/client';

interface LoginScreenProps {
  onAuthenticated: (user: Employee, rememberMe: boolean, systemConfig?: SystemConfig) => void;
  onOpenInstallModal?: () => void;
  isInstalled?: boolean;
  canPromptInstall?: boolean;
}

type AuthModalView = 'login' | 'solicitar_acesso';

const DEPARTMENTS: Department[] = [
  'Operacional',
  'Logística',
  'Administrativo',
  'Financeiro',
  'Recursos Humanos',
  'Segurança',
  'Diretoria',
];

function formatCountdownMMSS(totalSeconds: number): string {
  const clamped = Math.max(0, Math.ceil(totalSeconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onAuthenticated,
  onOpenInstallModal,
  isInstalled = false,
  canPromptInstall = false,
}) => {
  const firebaseEmulatorLogin = isFirebaseEmulatorPortalEnabled();
  const [view, setView] = useState<AuthModalView>('login');

  // Login Form State
  const [identifier, setIdentifier] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [rememberMe, setRememberMe] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [pendingNotice, setPendingNotice] = useState<string | null>(null);

  // Server-authoritative 120s Lockout Countdown State
  // Stores monotonic performance.now() target so changing local system clock cannot bypass UI timer
  const [remainingLockSeconds, setRemainingLockSeconds] = useState<number>(0);
  const lockEndMonotonicRef = useRef<number | null>(null);

  // Solicitar Acesso State (Requirement 2)
  const [reqName, setReqName] = useState<string>('');
  const [reqUsername, setReqUsername] = useState<string>('');
  const [reqDepartment, setReqDepartment] = useState<Department>('Operacional');
  const [reqPassword, setReqPassword] = useState<string>('');
  const [reqConfirmPassword, setReqConfirmPassword] = useState<string>('');
  const [reqError, setReqError] = useState<string | null>(null);
  const [reqSuccessMessage, setReqSuccessMessage] = useState<string | null>(null);
  const [isRequestingAccess, setIsRequestingAccess] = useState<boolean>(false);

  // Recuperar Senha com Token Único State (Requirement 4)
  const startCountdownFromServer = (secondsFromServer: number) => {
    const secs = Math.max(0, Math.ceil(secondsFromServer));
    if (secs <= 0) {
      lockEndMonotonicRef.current = null;
      setRemainingLockSeconds(0);
      return;
    }
    lockEndMonotonicRef.current = performance.now() + secs * 1000;
    setRemainingLockSeconds(secs);
  };

  // Tick countdown every 250ms using monotonic timer
  useEffect(() => {
    if (remainingLockSeconds <= 0) return;
    const interval = window.setInterval(() => {
      if (!lockEndMonotonicRef.current) {
        setRemainingLockSeconds(0);
        return;
      }
      const msLeft = lockEndMonotonicRef.current - performance.now();
      if (msLeft <= 0) {
        lockEndMonotonicRef.current = null;
        setRemainingLockSeconds(0);
        setLoginError(null);
      } else {
        setRemainingLockSeconds(Math.ceil(msLeft / 1000));
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [remainingLockSeconds]);

  // Query server lock status whenever identifier changes (debounced) or on initial load
  useEffect(() => {
    const trimmed = identifier.trim();
    if (!trimmed || trimmed.length < 3) return;
    const timer = window.setTimeout(async () => {
      try {
        if (firebaseEmulatorLogin) return;
        const status = await apiCheckLockStatus(trimmed);
        if (status.locked && status.remainingSeconds > 0) {
          startCountdownFromServer(status.remainingSeconds);
          setLoginError(
            status.message ||
              'Não foi possível entrar. Confira os dados ou tente novamente após o prazo indicado.'
          );
        }
      } catch {
        // ignore network check error
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [identifier, firebaseEmulatorLogin]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (remainingLockSeconds > 0 || isSubmitting) return;

    setLoginError(null);
    setPendingNotice(null);

    const cleanId = identifier.trim();
    if (!cleanId || !password) {
      setLoginError('Informe seu usuário e senha corporativa.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = firebaseEmulatorLogin
        ? await signInFirebaseTest(cleanId, password, rememberMe)
        : await apiLogin(cleanId, password, rememberMe);

      if (result.locked && (result.remainingSeconds || 0) > 0) {
        startCountdownFromServer(result.remainingSeconds || 120);
        setLoginError(
          'Não foi possível entrar. Confira os dados ou tente novamente após o prazo indicado.'
        );
        return;
      }

      if (result.code === 'ACCOUNT_PENDING' || result.approvalStatus === 'PENDENTE') {
        setPendingNotice(
          result.error ||
            'Sua solicitação de acesso foi recebida e aguarda a liberação do administrador.'
        );
        return;
      }

      if (!result.ok || !result.user) {
        setLoginError(
          result.error ||
            'Não foi possível entrar. Confira os dados ou tente novamente após o prazo indicado.'
        );
        return;
      }

      onAuthenticated(result.user, rememberMe, result.systemConfig);
    } catch (error) {
      setLoginError(
        firebaseEmulatorLogin && error instanceof Error
          ? error.message
          : 'Não foi possível entrar. Confira os dados ou tente novamente após o prazo indicado.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestAccessSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isRequestingAccess) return;

    setReqError(null);
    setReqSuccessMessage(null);

    if (!reqName.trim() || reqName.trim().length < 3) {
      setReqError('Informe seu nome completo.');
      return;
    }
    if (!reqUsername.trim() || reqUsername.trim().length < 3) {
      setReqError('Informe o nome de usuário ou e-mail desejado.');
      return;
    }
    if (reqPassword.length < 8) {
      setReqError('A senha deve ter no mínimo 8 caracteres.');
      return;
    }
    if (reqPassword !== reqConfirmPassword) {
      setReqError('A confirmação de senha não coincide.');
      return;
    }

    setIsRequestingAccess(true);
    try {
      const res = await apiRequestAccess({
        name: reqName.trim(),
        username: reqUsername.trim(),
        department: reqDepartment,
        password: reqPassword,
      });

      if (!res.ok) {
        setReqError(res.error || 'Não foi possível registrar sua solicitação.');
        return;
      }

      // Exact message required by Specification Section 2:
      setReqSuccessMessage(
        res.message || 'Solicitação recebida. Aguarde a liberação do administrador.'
      );
      setReqName('');
      setReqUsername('');
      setReqPassword('');
      setReqConfirmPassword('');
    } catch {
      setReqError('Erro de comunicação com o servidor ao enviar solicitação.');
    } finally {
      setIsRequestingAccess(false);
    }
  };

  return (
    <div className="rv-login-shell">
      <div className="rv-login-scene" aria-hidden="true">
        <img src="/assets/login-rodovar-sunset-v2.png" alt="" fetchPriority="high" />
      </div>

      <header className="rv-login-topbar">
        <div className="rv-login-brand">
          <div className="rv-login-logo"><RodovarLogo size="lg" /></div>
          <div className="rv-login-tagline">
            <span>COMUNICAÇÃO</span><i aria-hidden="true">•</i>
            <span>PESSOAS</span><i aria-hidden="true">•</i>
            <span>PROCESSOS</span><i aria-hidden="true">•</i>
            <span>RESULTADOS</span>
          </div>
        </div>
        <div className="rv-login-top-actions">
          {!isInstalled && onOpenInstallModal && (
            <button type="button" onClick={onOpenInstallModal} data-testid="login-pwa-install-btn" className="rv-login-install">
              <Download size={16} aria-hidden="true" />
              <span>{canPromptInstall ? 'Instalar aplicativo' : 'Como instalar'}</span>
            </button>
          )}
          <span className="rv-login-protected">
            <ShieldCheck size={16} aria-hidden="true" />
            <span>Acesso Corporativo Protegido</span>
          </span>
        </div>
      </header>

      <main className="rv-login-main">
        <div className="rv-login-visual">
          <div className="rv-login-copy">
            <div className="rv-login-official">
              <Truck size={27} aria-hidden="true" />
              <div><strong>PORTAL INTERNO OFICIAL</strong><span>TRANSPORTADORA RODOVAR</span></div>
            </div>
            <h1 className="rv-login-headline">
              <span>JUNTOS</span><span>LEVANDO</span>
              <span className="rv-login-gold">O BRASIL</span><span className="rv-login-gold">MAIS LONGE</span>
            </h1>
            <p className="rv-login-intro">
              Bem-vindo ao nosso espaço de trabalho! Aqui você encontra informações, acompanha suas atividades e se conecta com sua equipe de forma simples, organizada e segura. Tudo pensado para facilitar seu dia a dia na RODOVAR.
            </p>
          </div>

          <ul className="rv-login-benefits" aria-label="Pilares RODOVAR CONECTA">
            {[
              { Icon: MessageSquare, title: 'COMUNICAÇÃO', text: 'Mural, mensagens e grupos' },
              { Icon: Users, title: 'PESSOAS', text: 'Funcionários, perfis e permissões' },
              { Icon: Settings, title: 'PROCESSOS', text: 'Fretes, solicitações e documentos' },
              { Icon: BarChart3, title: 'RESULTADOS', text: 'Mais controle e eficiência' },
            ].map(({ Icon, title, text }) => (
              <li className="rv-login-benefit" key={title}>
                <span className="rv-login-benefit-icon"><Icon size={32} strokeWidth={1.8} aria-hidden="true" /></span>
                <div><strong>{title}</strong><p>{text}</p></div>
              </li>
            ))}
          </ul>
        </div>

        <section className="rv-login-card" aria-label="Acesso corporativo">
          <div className="rv-login-panel-heading">
            <span className="rv-login-lock-mark"><LockKeyhole size={40} strokeWidth={2} aria-hidden="true" /></span>
            <div>
              <button type="button" className="rv-login-mode" onClick={() => {
                setView('login');
                setLoginError(null);
                setPendingNotice(null);
              }}><Lock size={10} aria-hidden="true" /><span>Entrar com Senha</span></button>
              <h2 id="login-title">Acesso ao Portal Corporativo</h2>
              <p>Entre exclusivamente com seu usuário corporativo e senha cadastrada.</p>
            </div>
          </div>

            {view === 'login' && (
              <form onSubmit={handleLoginSubmit} className="rv-login-form" aria-labelledby="login-title" noValidate>
                {/* Countdown Lockout Banner (5 failures = 2 minutes) */}
                {remainingLockSeconds > 0 && (
                  <div
                    role="alert"
                    data-testid="login-lockout-banner"
                    className="p-4 rounded-xl bg-red-50 border-2 border-[#E5252A] text-[#15191D] space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#E5252A] uppercase">
                        <Clock className="w-4 h-4 shrink-0" />
                        <span>Bloqueio Temporário de Segurança</span>
                      </span>
                      <span
                        data-testid="lockout-countdown"
                        className="font-mono text-base font-black bg-[#080B0D] text-[#FFD400] px-2.5 py-0.5 rounded-md tabular-nums"
                      >
                        {formatCountdownMMSS(remainingLockSeconds)}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-gray-800 leading-relaxed">
                      Não foi possível entrar. Confira os dados ou tente novamente após o prazo indicado.
                    </p>
                  </div>
                )}

                {/* Standard Error Message */}
                {loginError && remainingLockSeconds <= 0 && (
                  <div
                    role="alert"
                    className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-[#E5252A] flex items-start gap-2.5"
                  >
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{loginError}</span>
                  </div>
                )}

                {/* Pending Account Notice */}
                {pendingNotice && (
                  <div
                    role="status"
                    className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-xs font-bold text-amber-900 flex items-start gap-2.5"
                  >
                    <Clock className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
                    <div>
                      <p className="font-extrabold">Acesso aguardando liberação</p>
                      <p className="mt-0.5 font-medium">{pendingNotice}</p>
                    </div>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="login-identifier"
                    className="block mb-2"
                  >
                    Usuário ou E-mail Corporativo
                  </label>
                  <div className="rv-login-input-wrap">
                    <Mail className="rv-login-input-icon" aria-hidden="true" />
                  <input
                    id="login-identifier"
                    name="username"
                    type="text"
                    autoComplete="username"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="Ex: administrador@rodovar.com.br"
                    disabled={isSubmitting}
                  />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label
                      htmlFor="login-password"
                      className="block"
                    >
                      Senha
                    </label>

                  </div>
                  <div className="rv-login-input-wrap">
                    <Lock className="rv-login-input-icon" aria-hidden="true" />
                    <input
                      id="login-password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Digite ou cole sua senha"
                      disabled={isSubmitting}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 cursor-pointer"
                      aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <label className="inline-flex items-center gap-2 cursor-pointer font-semibold text-gray-600">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="rounded text-[#080B0D]"
                    />
                    <span>Manter sessão conectada</span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={remainingLockSeconds > 0 || isSubmitting}
                  className={`rv-login-submit w-full py-3 rounded-xl font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition ${
                    remainingLockSeconds > 0 || isSubmitting
                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      : 'bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] shadow-md cursor-pointer'
                  }`}
                >
                  {remainingLockSeconds > 0 ? (
                    <>
                      <Clock className="w-4 h-4" />
                      <span>
                        Aguarde {formatCountdownMMSS(remainingLockSeconds)} para tentar novamente
                      </span>
                    </>
                  ) : isSubmitting ? (
                    <span>Validando credenciais no servidor…</span>
                  ) : (
                    <>
                      <span>Entrar no Portal</span>
                      <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                    </>
                  )}
                </button>

<p className="rv-login-restricted"><Lock size={14} aria-hidden="true" /><span>Acesso restrito. Novas contas somente pelo administrador.</span></p>
              </form>
            )}

            {view === 'solicitar_acesso' && (
              <form onSubmit={handleRequestAccessSubmit} className="space-y-3.5" noValidate>
                <div>
                  <h2 className="text-lg font-extrabold text-[#15191D]">
                    Solicitar acesso
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Preencha seus dados corporativos. Seu cadastro ficará com situação{' '}
                    <strong>PENDENTE</strong> até a liberação explícita do administrador.
                  </p>
                </div>

                {reqSuccessMessage && (
                  <div
                    role="status"
                    data-testid="request-access-success"
                    className="p-4 rounded-xl bg-emerald-50 border-2 border-emerald-500 text-emerald-950 space-y-1.5"
                  >
                    <div className="flex items-center gap-2 font-extrabold text-xs text-emerald-800">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>Solicitação Registrada</span>
                    </div>
                    <p className="text-xs font-bold leading-relaxed">{reqSuccessMessage}</p>
                  </div>
                )}

                {reqError && (
                  <div
                    role="alert"
                    className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-[#E5252A] flex items-start gap-2"
                  >
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{reqError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-extrabold text-[#15191D] mb-1">
                    Nome Completo *
                  </label>
                  <input
                    type="text"
                    autoComplete="name"
                    value={reqName}
                    onChange={(e) => setReqName(e.target.value)}
                    placeholder="Ex: Carlos Eduardo Mendes"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-xs font-semibold text-[#15191D]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-extrabold text-[#15191D] mb-1">
                      Usuário *
                    </label>
                    <input
                      type="text"
                      autoComplete="username"
                      value={reqUsername}
                      onChange={(e) => setReqUsername(e.target.value)}
                      placeholder="Ex: carlos.mendes"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-xs font-semibold text-[#15191D]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-extrabold text-[#15191D] mb-1">
                      Setor *
                    </label>
                    <select
                      value={reqDepartment}
                      onChange={(e) => setReqDepartment(e.target.value as Department)}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-xs font-semibold text-[#15191D] bg-white"
                    >
                      {DEPARTMENTS.map((dept) => (
                        <option key={dept} value={dept}>
                          {dept}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-extrabold text-[#15191D] mb-1">
                      Senha (mín. 8 caracteres) *
                    </label>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={reqPassword}
                      onChange={(e) => setReqPassword(e.target.value)}
                      placeholder="Crie uma senha segura"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-xs font-semibold text-[#15191D]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-extrabold text-[#15191D] mb-1">
                      Confirmar Senha *
                    </label>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={reqConfirmPassword}
                      onChange={(e) => setReqConfirmPassword(e.target.value)}
                      placeholder="Repita a senha"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-xs font-semibold text-[#15191D]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isRequestingAccess}
                  className="w-full py-3 rounded-xl bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md cursor-pointer"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>
                    {isRequestingAccess ? 'Enviando solicitação…' : 'Solicitar acesso'}
                  </span>
                </button>
              </form>
            )}

          <div className="rv-login-trust">
            <div>
              <span className="rv-login-trust-icon"><ShieldCheck size={25} aria-hidden="true" /></span>
              <strong>SEGURANÇA &amp; GOVERNANÇA</strong>
              <p>Sua carga e nossa equipe em primeiro lugar!</p>
            </div>
            <div>
              <span className="rv-login-trust-icon"><Users size={25} aria-hidden="true" /></span>
              <strong>Acesso controlado</strong>
              <p>Acesso restrito a colaboradores aprovados pela Administração.</p>
            </div>
            <div>
              <span className="rv-login-trust-icon"><FileText size={25} aria-hidden="true" /></span>
              <strong>Portal corporativo oficial</strong>
              <p>Autenticação validada.</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="rv-login-footer">
        <div><Shield size={17} aria-hidden="true" /><span>RODOVAR CONECTA — <strong>Autenticação Exclusiva por Usuário e Senha</strong></span></div>
        <div><Headphones size={17} aria-hidden="true" /><span>Suporte Administrativo: 71 9 9920-2476</span></div>
      </footer>
    </div>
  );
};

import React, { useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  HelpCircle,
  MoreVertical,
  PlusSquare,
  Share,
  Smartphone,
  X,
} from 'lucide-react';
import { PWAInstallOutcome } from '../hooks/usePWA';

interface PWAInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  canPromptInstall: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isSafariIOS: boolean;
  isInAppBrowser: boolean;
  inAppBrowserName: string | null;
  isInIframe: boolean;
  installOutcome: PWAInstallOutcome;
  onTriggerInstall: () => Promise<boolean>;
  onPostpone: () => void;
  onResetOutcome?: () => void;
}

export const PWAInstallModal: React.FC<PWAInstallModalProps> = ({
  isOpen,
  onClose,
  canPromptInstall,
  isInstalled,
  isIOS,
  isAndroid,
  isSafariIOS,
  isInAppBrowser,
  inAppBrowserName,
  isInIframe,
  installOutcome,
  onTriggerInstall,
  onPostpone,
}) => {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [isPrompting, setIsPrompting] = useState(false);

  if (!isOpen) return null;

  const currentUrl =
    typeof window !== 'undefined' ? window.location.href : 'https://rodovar-conecta.vercel.app';

  const handleCopyAddress = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(currentUrl);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = currentUrl;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 3000);
    } catch {
      setCopiedUrl(false);
    }
  };

  const handleInstallClick = async () => {
    if (!canPromptInstall || isIOS || isPrompting) return;
    setIsPrompting(true);
    try {
      await onTriggerInstall();
    } finally {
      setIsPrompting(false);
    }
  };

  const handlePostponeClick = () => {
    onPostpone();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[130] bg-black/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-x-hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-install-modal-title"
    >
      <div
        className="bg-white text-[#15191D] w-full max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl border border-gray-200 flex flex-col max-h-[90dvh] overflow-hidden"
        style={{
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        }}
      >
        {/* Mobile Grab Handle */}
        <div className="w-10 h-1.5 bg-gray-300 rounded-full mx-auto mt-2.5 sm:hidden shrink-0" />

        {/* Modal Header — Rodovar Brand Colors (Black, Yellow, White) */}
        <div className="px-5 pt-4 pb-3.5 border-b border-gray-100 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/pwa-192x192.png"
              alt="Ícone RODOVAR CONECTA"
              className="w-11 h-11 rounded-xl border border-gray-200 object-contain bg-[#080B0D] shrink-0"
            />
            <div className="min-w-0">
              <h3
                id="pwa-install-modal-title"
                className="text-base font-extrabold text-[#080B0D] leading-tight truncate"
              >
                {canPromptInstall ? 'Instalar aplicativo' : 'Como instalar • RODOVAR CONECTA'}
              </h3>
              <p className="text-xs text-gray-500 truncate mt-0.5">
                Acesso rápido na tela inicial do aparelho
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar modal de instalação"
            className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center text-gray-400 hover:text-[#080B0D] hover:bg-gray-100 transition cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body — Only shows guidance relevant to the current device/browser */}
        <div className="px-5 py-4 overflow-y-auto overscroll-contain space-y-4 text-xs leading-relaxed flex-1">
          {/* Case A: Already installed / standalone confirmed */}
          {isInstalled && installOutcome === 'accepted' && (
            <div
              role="status"
              data-testid="pwa-install-accepted"
              className="p-4 rounded-xl bg-emerald-50 border-2 border-emerald-500 text-emerald-950 space-y-1.5"
            >
              <div className="flex items-center gap-2 font-extrabold text-sm text-emerald-800">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <span>Aplicativo instalado no aparelho</span>
              </div>
              <p className="text-xs font-medium text-emerald-900">
                O RODOVAR CONECTA está pronto para abrir pelo ícone na tela inicial em janela
                própria.
              </p>
            </div>
          )}

          {/* Case B: User cancelled/dismissed the native install prompt (Requirement 2: never show fake success) */}
          {!isInstalled && installOutcome === 'dismissed' && (
            <div
              role="status"
              data-testid="pwa-install-dismissed"
              className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 space-y-1"
            >
              <p className="font-extrabold text-amber-900">Instalação cancelada</p>
              <p className="text-amber-800">
                Você fechou o convite de instalação. O aplicativo não foi instalado. Se desejar
                instalar agora, siga o passo a passo abaixo em <strong>Como instalar</strong>.
              </p>
            </div>
          )}

          {/* Case C: In-App Browser Detected (WhatsApp, Instagram, Facebook, etc.) */}
          {isInAppBrowser && (
            <div
              data-testid="pwa-inapp-browser-warning"
              className="p-4 rounded-xl bg-[#080B0D] text-white border-2 border-[#FFD400] space-y-3"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-[#FFD400] shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-extrabold text-[#FFD400] text-xs uppercase tracking-wide">
                    Navegador interno detectado ({inAppBrowserName || 'App social'})
                  </p>
                  <p className="text-xs text-gray-200 leading-relaxed">
                    O navegador interno do {inAppBrowserName || 'aplicativo'} não permite instalar
                    aplicativos na tela inicial. Copie o endereço abaixo e abra no{' '}
                    <strong>{isIOS ? 'Safari' : 'Google Chrome'}</strong>.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void handleCopyAddress()}
                data-testid="pwa-copy-url-btn"
                className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md transition cursor-pointer"
              >
                {copiedUrl ? (
                  <>
                    <Check className="w-4 h-4 stroke-[2.5]" />
                    <span>Endereço copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copiar endereço</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Case D: Valid beforeinstallprompt Event Available (Android / Desktop Chrome / Edge) */}
          {canPromptInstall && !isIOS && !isInstalled && (
            <div
              data-testid="pwa-direct-install-section"
              className="p-4 rounded-xl bg-[#F3F5F7] border border-gray-200 space-y-3"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#080B0D] text-[#FFD400] flex items-center justify-center shrink-0">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <p className="font-extrabold text-[#080B0D] text-sm">
                    Instalação direta disponível
                  </p>
                  <p className="text-gray-600 text-xs leading-relaxed">
                    Toque no botão abaixo para adicionar o <strong>RODOVAR CONECTA</strong> à tela
                    inicial do seu aparelho com janela própria e atalho rápido.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void handleInstallClick()}
                disabled={isPrompting}
                data-testid="pwa-trigger-install-btn"
                className="w-full min-h-[48px] px-5 py-3.5 rounded-xl bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] font-black text-sm flex items-center justify-center gap-2.5 shadow-md transition cursor-pointer disabled:opacity-60"
              >
                <Download className="w-5 h-5 stroke-[2.4]" />
                <span>{isPrompting ? 'Abrindo confirmação…' : 'Instalar aplicativo'}</span>
              </button>
            </div>
          )}

          {/* Case E: iPhone & iPad (iOS / iPadOS) — Exact Required Text (Requirement 3) */}
          {isIOS && !isInstalled && (
            <div
              data-testid="pwa-ios-instructions"
              className="p-4 rounded-xl bg-[#F3F5F7] border border-gray-200 space-y-3.5"
            >
              <div className="flex items-center gap-2 text-[#080B0D] font-extrabold text-sm">
                <HelpCircle className="w-4 h-4 text-[#080B0D] shrink-0" />
                <span>Como instalar no iPhone ou iPad</span>
              </div>

              {/* Mandatory Exact Guidance Text */}
              <p
                data-testid="pwa-ios-exact-text"
                className="p-3.5 rounded-xl bg-white border-l-4 border-[#FFD400] font-bold text-[#080B0D] text-xs leading-relaxed shadow-2xs"
              >
                {
                  'Abra este endereço no Safari, toque em Compartilhar e depois em Adicionar à Tela de Início. Quando disponível, mantenha Abrir como App ativado.'
                }
              </p>

              <div className="space-y-2.5 pt-1">
                <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white border border-gray-200/80">
                  <div className="w-8 h-8 rounded-lg bg-[#080B0D] text-[#FFD400] flex items-center justify-center shrink-0">
                    <Share className="w-4 h-4" />
                  </div>
                  <p className="text-xs text-gray-700">
                    <strong>1.</strong> Na barra do <strong>Safari</strong>, toque no ícone{' '}
                    <strong>Compartilhar</strong>.
                  </p>
                </div>

                <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white border border-gray-200/80">
                  <div className="w-8 h-8 rounded-lg bg-[#080B0D] text-[#FFD400] flex items-center justify-center shrink-0">
                    <PlusSquare className="w-4 h-4" />
                  </div>
                  <p className="text-xs text-gray-700">
                    <strong>2.</strong> Role as opções e toque em{' '}
                    <strong>Adicionar à Tela de Início</strong>.
                  </p>
                </div>

                <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white border border-gray-200/80">
                  <div className="w-8 h-8 rounded-lg bg-[#FFD400] text-[#080B0D] flex items-center justify-center font-black shrink-0">
                    ✓
                  </div>
                  <p className="text-xs text-gray-700">
                    <strong>3.</strong> Mantenha <strong>Abrir como App</strong> ativado e toque em{' '}
                    <strong>Adicionar</strong> no canto superior.
                  </p>
                </div>
              </div>

              {!isSafariIOS && !isInAppBrowser && (
                <div className="pt-2 space-y-2">
                  <p className="text-[11px] font-bold text-amber-900 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                    Para instalar no iPhone ou iPad, copie o endereço abaixo e cole no navegador{' '}
                    <strong>Safari</strong>:
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleCopyAddress()}
                    data-testid="pwa-copy-url-ios-btn"
                    className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-[#080B0D] text-[#FFD400] font-extrabold text-xs flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {copiedUrl ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Endereço copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>Copiar endereço</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Case F: Android or Desktop without active beforeinstallprompt (Requirement 2: Show "Como instalar" without broken button) */}
          {!isIOS && !canPromptInstall && !isInstalled && (
            <div
              data-testid="pwa-manual-instructions"
              className="p-4 rounded-xl bg-[#F3F5F7] border border-gray-200 space-y-3"
            >
              <div className="flex items-center gap-2 text-[#080B0D] font-extrabold text-sm">
                <HelpCircle className="w-4 h-4 text-[#080B0D] shrink-0" />
                <span>
                  {isAndroid
                    ? 'Como instalar no Android'
                    : 'Como instalar no celular ou computador'}
                </span>
              </div>

              {!window.isSecureContext&&<div role="note" className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-sm"><strong>Instalação PWA indisponível neste endereço HTTP da rede.</strong><p>Chrome e Edge exigem HTTPS para instalar este portal como PWA na rede local. Neste computador, use http://localhost:3000. Nos demais dispositivos, utilize o portal no navegador até que um endereço HTTPS confiável seja configurado. Se o menu do navegador oferecer um atalho, ele não garante os recursos de instalação PWA.</p></div>}
              {isInIframe && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs space-y-2">
                  <p className="font-bold">
                    Você está visualizando o sistema dentro de um quadro de pré-visualização.
                  </p>
                  <p>
                    Para que o navegador libere a instalação direta do aplicativo, abra o endereço
                    publicado em uma guia própria do navegador (Chrome ou Edge).
                  </p>
                </div>
              )}

              {isAndroid ? (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white border border-gray-200/80">
                    <div className="w-8 h-8 rounded-lg bg-[#080B0D] text-[#FFD400] flex items-center justify-center shrink-0">
                      <MoreVertical className="w-4 h-4" />
                    </div>
                    <p className="text-xs text-gray-700">
                      <strong>1.</strong> Toque no menu de opções <strong>(⋮)</strong> no canto
                      superior do navegador Chrome.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white border border-gray-200/80">
                    <div className="w-8 h-8 rounded-lg bg-[#080B0D] text-[#FFD400] flex items-center justify-center shrink-0">
                      <Download className="w-4 h-4" />
                    </div>
                    <p className="text-xs text-gray-700">
                      <strong>2.</strong> Toque em <strong>Instalar aplicativo</strong> ou{' '}
                      <strong>Adicionar à tela inicial</strong> e confirme.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white border border-gray-200/80">
                    <div className="w-8 h-8 rounded-lg bg-[#080B0D] text-[#FFD400] flex items-center justify-center shrink-0">
                      <Download className="w-4 h-4" />
                    </div>
                    <p className="text-xs text-gray-700">
                      <strong>No Android / Chrome:</strong> toque no menu <strong>(⋮)</strong> do
                      navegador e selecione <strong>Instalar aplicativo</strong>.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white border border-gray-200/80">
                    <div className="w-8 h-8 rounded-lg bg-[#080B0D] text-[#FFD400] flex items-center justify-center shrink-0">
                      <ExternalLink className="w-4 h-4" />
                    </div>
                    <p className="text-xs text-gray-700">
                      <strong>No Computador (Chrome / Edge):</strong> clique no ícone de instalação
                      na barra de endereços e confirme em <strong>Instalar</strong>.
                    </p>
                  </div>
                </div>
              )}

              {!isInAppBrowser && (
                <button
                  type="button"
                  onClick={() => void handleCopyAddress()}
                  data-testid="pwa-copy-url-fallback-btn"
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-white hover:bg-gray-100 border border-gray-300 text-[#080B0D] font-extrabold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  {copiedUrl ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span>Endereço copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copiar endereço</span>
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions — Large touch targets (>= 48px) and "Agora não" postpone support */}
        <div className="px-5 pt-3 border-t border-gray-100 flex items-center justify-between gap-3 shrink-0 bg-white">
          <button
            type="button"
            onClick={handlePostponeClick}
            data-testid="pwa-postpone-btn"
            className="min-h-[48px] px-4 py-2.5 rounded-xl bg-[#F3F5F7] hover:bg-gray-200 text-gray-700 font-extrabold text-xs transition cursor-pointer flex-1"
          >
            Agora não
          </button>

          {!canPromptInstall && (
            <button
              type="button"
              onClick={onClose}
              className="min-h-[48px] px-5 py-2.5 rounded-xl bg-[#080B0D] hover:bg-gray-900 text-[#FFD400] font-extrabold text-xs transition cursor-pointer flex-1"
            >
              Fechar
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

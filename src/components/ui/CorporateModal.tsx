import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, AlertTriangle, Loader2 } from 'lucide-react';

export interface CorporateModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  icon?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | 'full';
  hasUnsavedChanges?: boolean;
  unsavedChangesMessage?: string;
  isLoading?: boolean;
  loadingMessage?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  headerRight?: React.ReactNode;
  closeOnEsc?: boolean;
  closeOnBackdrop?: boolean;
}

const MAX_WIDTH_CLASSES: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
  full: 'max-w-[96vw]',
};

export const CorporateModal: React.FC<CorporateModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  badge,
  icon,
  maxWidth = '3xl',
  hasUnsavedChanges = false,
  unsavedChangesMessage = 'Existem alterações não salvas. Deseja realmente descartar e fechar a janela?',
  isLoading = false,
  loadingMessage = 'Processando...',
  children,
  footer,
  headerRight,
  closeOnEsc = true,
  closeOnBackdrop = true,
}) => {
  const [showConfirmDiscard, setShowConfirmDiscard] = useState(false);
  const modalRef = useRef<HTMLDivElement | null>(null);

  const requestClose = useCallback(() => {
    if (isLoading) return;
    if (hasUnsavedChanges) {
      setShowConfirmDiscard(true);
      return;
    }
    onClose();
  }, [hasUnsavedChanges, isLoading, onClose]);

  const confirmDiscard = useCallback(() => {
    setShowConfirmDiscard(false);
    onClose();
  }, [onClose]);

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) {
      setShowConfirmDiscard(false);
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnEsc) {
        e.preventDefault();
        if (showConfirmDiscard) {
          setShowConfirmDiscard(false);
        } else {
          requestClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeOnEsc, showConfirmDiscard, requestClose]);

  // Trap focus inside modal
  useEffect(() => {
    if (!isOpen || !modalRef.current) return;
    const focusable = modalRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length > 0) {
      const first = focusable[0];
      first.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const maxWidthClass = MAX_WIDTH_CLASSES[maxWidth] || 'max-w-3xl';

  return (
    <div
      className="fixed inset-0 z-50 bg-[#080B0D]/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        className={`bg-white rounded-2xl border border-slate-200/90 w-full ${maxWidthClass} max-h-[92vh] flex flex-col shadow-2xl overflow-hidden relative`}
      >
        {/* Top Header - Rodovar Enterprise Style */}
        <div className="px-5 sm:px-6 py-4 bg-white border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {icon && (
              <div className="w-10 h-10 rounded-xl bg-[#080B0D] text-[#FFD400] flex items-center justify-center shrink-0 shadow-xs">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-lg font-extrabold text-[#15191D] truncate">
                  {title}
                </h2>
                {badge}
              </div>
              {subtitle && (
                <div className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {headerRight}
            <button
              type="button"
              onClick={requestClose}
              disabled={isLoading}
              aria-label="Fechar janela"
              title="Fechar (Esc)"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-40"
            >
              <X className="w-5 h-5 stroke-[2.2]" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 text-sm text-slate-800">
          {children}
        </div>

        {/* Optional Footer */}
        {footer && (
          <div className="px-5 sm:px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
            {footer}
          </div>
        )}

        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 z-30 bg-white/80 backdrop-blur-xs flex flex-col items-center justify-center p-4">
            <div className="w-12 h-12 rounded-2xl bg-[#080B0D] text-[#FFD400] flex items-center justify-center shadow-lg mb-3 animate-spin">
              <Loader2 className="w-6 h-6 stroke-[2.5]" />
            </div>
            <p className="text-sm font-bold text-[#15191D]">{loadingMessage}</p>
          </div>
        )}

        {/* Discard Changes Confirmation Dialog */}
        {showConfirmDiscard && (
          <div className="absolute inset-0 z-40 bg-[#080B0D]/75 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-xl border border-slate-300 max-w-md w-full p-5 shadow-2xl animate-scale-in">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[#15191D]">Alterações não salvas</h3>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    {unsavedChangesMessage}
                  </p>
                </div>
              </div>
              <div className="mt-5 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowConfirmDiscard(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  Continuar Editando
                </button>
                <button
                  type="button"
                  onClick={confirmDiscard}
                  className="px-3.5 py-1.5 rounded-lg bg-[#E5252A] hover:bg-red-700 text-white text-xs font-extrabold cursor-pointer shadow-xs"
                >
                  Descartar e Fechar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Download,
  Image as ImageIcon,
  Monitor,
  Plus,
  RotateCcw,
  Save,
  Sliders,
  Smartphone,
  Trash2,
  Upload,
} from 'lucide-react';
import { SystemConfig, WelcomeBannerItem } from '../types';
import {
  apiFetchSystemConfig,
  apiPublishSystemConfig,
  apiUploadSystemConfigImage,
  withRevisionParam,
} from '../lib/serverApi';

interface SystemConfigTabProps {
  systemConfig: SystemConfig;
  onSystemConfigPublished?: (nextConfig: SystemConfig) => void;
}

const DEFAULT_FALLBACK_CONFIG: SystemConfig = {
  revision: 1,
  updatedAtIso: new Date().toISOString(),
  updatedBy: 'Sistema Inicial RODOVAR',
  sidebarPoster: {
    imageUrl: '/assets/aistudio/DSC00515_18c5e319.JPG',
    focusX: 50,
    focusY: 50,
    width: 600,
    height: 700,
  },
  topHeader: {
    imageUrl: '/assets/header-sunset.jpg',
    focusX: 50,
    focusY: 50,
    width: 1920,
    height: 240,
  },
  welcomeBanner: {
    carouselEnabled: false,
    intervalSeconds: 5,
    items: [
      {
        id: 'banner-default-1',
        imageUrl: '/assets/aistudio/010203_5a4289e5.png',
        altText: 'Frota Oficial RODOVAR — Sua carga em primeiro lugar!',
        isDecorative: false,
        focusX: 50,
        focusY: 50,
        width: 1920,
        height: 360,
      },
    ],
  },
  defaultAvatar: {
    imageUrl: '/assets/default-avatar.png',
    width: 1024,
    height: 1024,
  },
};

export const SystemConfigTab: React.FC<SystemConfigTabProps> = ({
  systemConfig,
  onSystemConfigPublished,
}) => {
  const [draft, setDraft] = useState<SystemConfig>(() => structuredClone(systemConfig));
  const [defaults, setDefaults] = useState<SystemConfig>(DEFAULT_FALLBACK_CONFIG);
  const [previewViewport, setPreviewViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [activeBannerPreviewIdx, setActiveBannerPreviewIdx] = useState<number>(0);

  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [lowResWarnings, setLowResWarnings] = useState<Record<string, string>>({});
  const [confirmedLowRes, setConfirmedLowRes] = useState<boolean>(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savingOverlayMessage, setSavingOverlayMessage] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState<boolean>(false);

  useEffect(() => {
    apiFetchSystemConfig()
      .then((res) => {
        if (res.systemConfig) setDraft(structuredClone(res.systemConfig));
        if (res.defaults) setDefaults(res.defaults);
      })
      .catch(() => {
        // fallback to prop
      });
  }, []);

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Falha ao ler arquivo selecionado.'));
      reader.readAsDataURL(file);
    });

  const handleUploadSingleSlot = async (
    slot: 'sidebarPoster' | 'topHeader' | 'defaultAvatar',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setErrorMsg(null);
    setUploadingSlot(slot);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const res = await apiUploadSystemConfigImage(slot, dataUrl);
      if (!res.ok || !res.imageUrl) {
        setErrorMsg(res.error || 'O servidor rejeitou o arquivo enviado.');
        return;
      }

      if (res.lowResolutionWarning) {
        setLowResWarnings((prev) => ({
          ...prev,
          [slot]: `A imagem enviada (${res.width}×${res.height}px) possui resolução inferior ao recomendado (${res.recommendedWidth}×${res.recommendedHeight}px).`,
        }));
        setConfirmedLowRes(false);
      } else {
        setLowResWarnings((prev) => {
          const next = { ...prev };
          delete next[slot];
          return next;
        });
      }

      if (slot === 'sidebarPoster') {
        setDraft((prev) => ({
          ...prev,
          sidebarPoster: {
            ...prev.sidebarPoster,
            imageUrl: res.imageUrl!,
            width: res.width,
            height: res.height,
          },
        }));
      } else if (slot === 'topHeader') {
        setDraft((prev) => ({
          ...prev,
          topHeader: {
            ...prev.topHeader,
            imageUrl: res.imageUrl!,
            width: res.width,
            height: res.height,
          },
        }));
      } else if (slot === 'defaultAvatar') {
        setDraft((prev) => ({
          ...prev,
          defaultAvatar: {
            ...prev.defaultAvatar,
            imageUrl: res.imageUrl!,
            width: res.width,
            height: res.height,
          },
        }));
      }
    } catch {
      setErrorMsg('Erro ao enviar imagem para validação no servidor.');
    } finally {
      setUploadingSlot(null);
    }
  };

  // Welcome Banner Carousel Handlers (1 to 5 images)
  const handleAddOrReplaceBannerImage = async (
    replaceIndex: number | null,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (replaceIndex === null && draft.welcomeBanner.items.length >= 5) {
      setErrorMsg('O carrossel do Banner de boas-vindas permite no máximo 5 imagens.');
      return;
    }

    setErrorMsg(null);
    setUploadingSlot(replaceIndex === null ? 'welcomeBanner-add' : `welcomeBanner-${replaceIndex}`);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const res = await apiUploadSystemConfigImage('welcomeBanner', dataUrl);
      if (!res.ok || !res.imageUrl) {
        setErrorMsg(res.error || 'Arquivo inválido para o Banner de boas-vindas.');
        return;
      }

      if (res.lowResolutionWarning) {
        setLowResWarnings((prev) => ({
          ...prev,
          welcomeBanner: `Uma imagem do banner (${res.width}×${res.height}px) está abaixo da dimensão recomendada (1920×360px).`,
        }));
        setConfirmedLowRes(false);
      }

      const newItem: WelcomeBannerItem = {
        id: `banner-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        imageUrl: res.imageUrl,
        altText: 'Banner Corporativo RODOVAR CONECTA',
        isDecorative: false,
        focusX: 50,
        focusY: 50,
        width: res.width,
        height: res.height,
      };

      setDraft((prev) => {
        const nextItems = [...prev.welcomeBanner.items];
        if (replaceIndex !== null && nextItems[replaceIndex]) {
          nextItems[replaceIndex] = {
            ...nextItems[replaceIndex],
            imageUrl: res.imageUrl!,
            width: res.width,
            height: res.height,
          };
        } else {
          nextItems.push(newItem);
        }
        return {
          ...prev,
          welcomeBanner: {
            ...prev.welcomeBanner,
            carouselEnabled: nextItems.length > 1 ? prev.welcomeBanner.carouselEnabled : false,
            items: nextItems,
          },
        };
      });
    } catch {
      setErrorMsg('Falha ao enviar imagem do banner.');
    } finally {
      setUploadingSlot(null);
    }
  };

  const handleMoveBannerItem = (index: number, direction: -1 | 1) => {
    setDraft((prev) => {
      const items = [...prev.welcomeBanner.items];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= items.length) return prev;
      const [moved] = items.splice(index, 1);
      items.splice(targetIndex, 0, moved);
      return {
        ...prev,
        welcomeBanner: {
          ...prev.welcomeBanner,
          items,
        },
      };
    });
    setActiveBannerPreviewIdx((prevIdx) =>
      Math.max(0, Math.min(draft.welcomeBanner.items.length - 1, prevIdx + direction))
    );
  };

  const handleRemoveBannerItem = (index: number) => {
    if (draft.welcomeBanner.items.length <= 1) {
      setErrorMsg('Não é permitido deixar o Banner de boas-vindas com zero imagens (mínimo: 1).');
      return;
    }
    setDraft((prev) => {
      const nextItems = prev.welcomeBanner.items.filter((_, idx) => idx !== index);
      return {
        ...prev,
        welcomeBanner: {
          ...prev.welcomeBanner,
          carouselEnabled: nextItems.length > 1 ? prev.welcomeBanner.carouselEnabled : false,
          items: nextItems,
        },
      };
    });
    setActiveBannerPreviewIdx(0);
  };

  const handleRestoreSectionDefault = (
    section: 'sidebarPoster' | 'topHeader' | 'welcomeBanner' | 'defaultAvatar'
  ) => {
    setErrorMsg(null);
    setLowResWarnings((prev) => {
      const next = { ...prev };
      delete next[section];
      return next;
    });
    setDraft((prev) => ({
      ...prev,
      [section]: structuredClone(defaults[section]),
    }));
    if (section === 'welcomeBanner') {
      setActiveBannerPreviewIdx(0);
    }
  };

  const hasLowResWarnings = Object.keys(lowResWarnings).length > 0;

  const handleSaveAndRefresh = async () => {
    if (isPublishing) return;
    setErrorMsg(null);

    if (draft.welcomeBanner.items.length < 1 || draft.welcomeBanner.items.length > 5) {
      setErrorMsg('O Banner de boas-vindas deve possuir entre 1 e 5 imagens.');
      return;
    }

    if (hasLowResWarnings && !confirmedLowRes) {
      setErrorMsg(
        'Confirme o aviso de baixa resolução antes de clicar em Salvar e atualizar.'
      );
      return;
    }

    setIsPublishing(true);
    try {
      const res = await apiPublishSystemConfig({
        baseRevision: draft.revision,
        sidebarPoster: draft.sidebarPoster,
        topHeader: draft.topHeader,
        welcomeBanner: draft.welcomeBanner,
        defaultAvatar: draft.defaultAvatar,
      });

      if (!res.ok || !res.systemConfig) {
        setErrorMsg(
          res.error || 'Não foi possível salvar as configurações no servidor.'
        );
        setIsPublishing(false);
        return;
      }

      onSystemConfigPublished?.(res.systemConfig);
      setSavingOverlayMessage('Configurações salvas. Atualizando o sistema…');

      // Preserve active section in sessionStorage before single reload
      try {
        sessionStorage.setItem('rodovar_restore_section_after_publish', 'administracao');
        sessionStorage.setItem('rodovar_restore_admin_subtab', 'configuracao_sistema');
      } catch {
        // ignore
      }

      // Clear old image caches in Cache Storage if present
      if ('caches' in window) {
        try {
          const cacheKeys = await window.caches.keys();
          await Promise.all(cacheKeys.map((k) => window.caches.delete(k)));
        } catch {
          // ignore
        }
      }

      window.setTimeout(() => {
        window.location.reload();
      }, 900);
    } catch {
      setErrorMsg('Erro de comunicação com o servidor ao publicar configurações.');
      setIsPublishing(false);
    }
  };

  const currentPreviewBanner =
    draft.welcomeBanner.items[activeBannerPreviewIdx] || draft.welcomeBanner.items[0];

  return (
    <div className="space-y-6">
      {/* Saving & Updating Full-Screen Confirmation Toast */}
      {savingOverlayMessage && (
        <div
          role="status"
          data-testid="system-config-saving-toast"
          className="fixed inset-0 z-50 bg-[#080B0D]/90 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-[#080B0D] border-2 border-[#FFD400] text-white rounded-2xl p-6 max-w-md w-full shadow-2xl text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-[#FFD400] text-[#080B0D] flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7 stroke-[2.5]" />
            </div>
            <h3 className="text-base font-extrabold text-[#FFD400]">
              {savingOverlayMessage}
            </h3>
            <p className="text-xs text-gray-300">
              Nova revisão #{draft.revision + 1} gravada no banco. Recarregando ativos visuais sem
              desconectar sua sessão…
            </p>
          </div>
        </div>
      )}

      {/* Top Header Bar (Black, Yellow & White Theme) */}
      <div className="bg-[#080B0D] text-white rounded-xl p-5 border border-[#FFD400]/40 shadow-md flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-[#FFD400] text-[#080B0D] flex items-center justify-center shrink-0">
            <Sliders className="w-6 h-6 stroke-[2.3]" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-extrabold text-white">Configuração do Sistema</h2>
              <span className="font-mono text-xs font-extrabold bg-[#FFD400] text-[#080B0D] px-2.5 py-0.5 rounded">
                Revisão #{draft.revision}
              </span>
            </div>
            <p className="text-xs text-gray-300 mt-1">
              Gerencie a imagem lateral, imagem do topo, carrossel do banner de boas-vindas (1 a 5
              imagens) e avatar padrão. As mudanças ficam em pré-visualização até clicar em{' '}
              <strong className="text-[#FFD400]">Salvar e atualizar</strong>.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {/* Desktop vs Mobile Preview Toggle */}
          <div className="inline-flex bg-white/10 p-1 rounded-xl border border-white/15">
            <button
              type="button"
              onClick={() => setPreviewViewport('desktop')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer transition ${
                previewViewport === 'desktop'
                  ? 'bg-[#FFD400] text-[#080B0D]'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>Prévia Desktop</span>
            </button>
            <button
              type="button"
              onClick={() => setPreviewViewport('mobile')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer transition ${
                previewViewport === 'mobile'
                  ? 'bg-[#FFD400] text-[#080B0D]'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Prévia Mobile</span>
            </button>
          </div>

          <button
            type="button"
            disabled={isPublishing}
            onClick={handleSaveAndRefresh}
            data-testid="btn-salvar-e-atualizar"
            className="bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] font-extrabold text-xs px-5 py-2.5 rounded-xl inline-flex items-center gap-2 shadow-lg cursor-pointer transition"
          >
            <Save className="w-4 h-4 stroke-[2.4]" />
            <span>{isPublishing ? 'Publicando…' : 'Salvar e atualizar'}</span>
          </button>
        </div>
      </div>

      {/* Error Message */}
      {errorMsg && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-red-50 border-2 border-[#E5252A] text-xs font-bold text-[#E5252A] flex items-center gap-2.5"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Low Resolution Warning Confirmation Box */}
      {hasLowResWarnings && (
        <div className="p-4 rounded-xl bg-amber-50 border-2 border-[#FFD400] text-[#15191D] text-xs space-y-2">
          <div className="flex items-center gap-2 font-extrabold text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
            <span>Aviso de Resolução Inferior ao Recomendado</span>
          </div>
          <ul className="list-disc list-inside text-amber-900 space-y-0.5">
            {Object.values(lowResWarnings).map((w, idx) => (
              <li key={idx}>{w}</li>
            ))}
          </ul>
          <label className="inline-flex items-center gap-2 font-extrabold text-[#080B0D] pt-1 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmedLowRes}
              onChange={(e) => setConfirmedLowRes(e.target.checked)}
              className="rounded text-[#080B0D]"
            />
            <span>Confirmo que revisei a prévia e desejo publicar mesmo com resolução menor.</span>
          </label>
        </div>
      )}

      {/* =====================================================================
          SECTION 1: IMAGEM LATERAL (600 x 700 px, proporção 6:7)
      ===================================================================== */}
      <div className="bg-white rounded-xl p-5 border border-gray-200/80 shadow-2xs grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] font-extrabold uppercase tracking-wider bg-[#080B0D] text-[#FFD400] px-2.5 py-0.5 rounded">
              1. IMAGEM LATERAL (CARTAZ ESQUERDO)
            </span>
            <span className="text-xs font-bold text-gray-500">
              Recomendado: 600 × 700 px (6:7)
            </span>
          </div>
          <h3 className="text-base font-extrabold text-[#15191D]">
            Cartaz Institucional da Lateral Esquerda
          </h3>
          <p className="text-xs text-gray-500 leading-relaxed">
            Exibido abaixo do menu principal na barra lateral esquerda com enquadramento{' '}
            <code>contain</code> / altura adaptável para preservar 100% da arte sem cortar textos ou
            o mascote. O botão <strong>Instalar App</strong> permanece separado e funcional logo
            abaixo.
          </p>

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <label className="bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] text-xs font-extrabold px-4 py-2 rounded-lg inline-flex items-center gap-1.5 cursor-pointer shadow-2xs">
              <Upload className="w-3.5 h-3.5" />
              <span>
                {uploadingSlot === 'sidebarPoster'
                  ? 'Validando imagem…'
                  : 'Selecionar Imagem (JPG, PNG, WebP até 5 MB)'}
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => handleUploadSingleSlot('sidebarPoster', e)}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={() => handleRestoreSectionDefault('sidebarPoster')}
              className="bg-[#080B0D] hover:bg-gray-800 text-white text-xs font-bold px-3.5 py-2 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#FFD400]" />
              <span>Restaurar padrão</span>
            </button>
          </div>
        </div>

        {/* Preview of Sidebar Poster */}
        <div className="lg:col-span-6 bg-[#080B0D] rounded-xl p-4 border border-gray-800 flex flex-col items-center justify-center">
          <p className="text-[10px] font-mono uppercase tracking-wider text-[#FFD400] mb-2">
            Pré-visualização ({previewViewport === 'desktop' ? 'Desktop Lateral 235px' : 'Mobile'})
          </p>
          <div className="w-[225px] bg-[#0B0E11] rounded-2xl border border-white/15 overflow-hidden p-2">
            <img
              src={withRevisionParam(draft.sidebarPoster.imageUrl, draft.revision)}
              alt="Prévia do cartaz lateral RODOVAR"
              className="w-full max-h-[260px] object-contain rounded-xl mx-auto bg-[#080B0D]"
            />
          </div>
          <div className="w-[225px] mt-2.5 px-1 flex items-center justify-between text-[10px] text-gray-400">
            <span>RODOVAR CONECTA</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#FFD400]/20 text-[#FFD400] font-bold">
              <Download className="w-2.5 h-2.5" />
              Instalar App
            </span>
          </div>
        </div>
      </div>

      {/* =====================================================================
          SECTION 2: IMAGEM DO TOPO (1920 x 240 px, proporção 8:1)
      ===================================================================== */}
      <div className="bg-white rounded-xl p-5 border border-gray-200/80 shadow-2xs grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] font-extrabold uppercase tracking-wider bg-[#080B0D] text-[#FFD400] px-2.5 py-0.5 rounded">
              2. IMAGEM DO TOPO (NAVEGAÇÃO SUPERIOR)
            </span>
            <span className="text-xs font-bold text-gray-500">
              Recomendado: 1920 × 240 px (8:1)
            </span>
          </div>
          <h3 className="text-base font-extrabold text-[#15191D]">
            Fundo Panorâmico da Navegação Superior
          </h3>
          <p className="text-xs text-gray-500 leading-relaxed">
            Logo, busca global, notificações e perfil permanecem como elementos HTML reais sobre o
            fundo. Ajuste o ponto focal vertical/horizontal abaixo para evitar corte em diferentes
            telas.
          </p>

          <div className="grid grid-cols-2 gap-3 pt-1 text-xs">
            <div>
              <label className="block font-bold text-[#15191D] mb-1">
                Foco Horizontal ({draft.topHeader.focusX}%)
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={draft.topHeader.focusX}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    topHeader: { ...prev.topHeader, focusX: Number(e.target.value) },
                  }))
                }
                className="w-full accent-[#080B0D]"
              />
            </div>
            <div>
              <label className="block font-bold text-[#15191D] mb-1">
                Foco Vertical ({draft.topHeader.focusY}%)
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={draft.topHeader.focusY}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    topHeader: { ...prev.topHeader, focusY: Number(e.target.value) },
                  }))
                }
                className="w-full accent-[#080B0D]"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <label className="bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] text-xs font-extrabold px-4 py-2 rounded-lg inline-flex items-center gap-1.5 cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>
                {uploadingSlot === 'topHeader' ? 'Validando imagem…' : 'Selecionar Imagem do Topo'}
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => handleUploadSingleSlot('topHeader', e)}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={() => handleRestoreSectionDefault('topHeader')}
              className="bg-[#080B0D] hover:bg-gray-800 text-white text-xs font-bold px-3.5 py-2 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#FFD400]" />
              <span>Restaurar padrão</span>
            </button>
          </div>
        </div>

        {/* Preview of Top Header */}
        <div className="lg:col-span-6 bg-[#080B0D] rounded-xl p-4 border border-gray-800 flex flex-col justify-center">
          <p className="text-[10px] font-mono uppercase tracking-wider text-[#FFD400] mb-2">
            Pré-visualização ({previewViewport === 'desktop' ? 'Desktop 1920×240' : 'Mobile'})
          </p>
          <div
            className={`relative rounded-xl overflow-hidden border border-white/15 mx-auto ${
              previewViewport === 'desktop' ? 'w-full h-24' : 'w-64 h-20'
            }`}
          >
            <img
              src={withRevisionParam(draft.topHeader.imageUrl, draft.revision)}
              alt="Prévia do topo RODOVAR"
              style={{
                objectPosition: `${draft.topHeader.focusX}% ${draft.topHeader.focusY}%`,
              }}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#080B0D]/80 via-transparent to-[#080B0D]/80 flex items-center justify-between px-4 text-white text-xs font-extrabold">
              <span className="bg-[#080B0D]/80 px-2.5 py-1 rounded border border-[#FFD400]/40 text-[#FFD400]">
                RODOVAR CONECTA
              </span>
              <span className="text-[10px] uppercase tracking-wider">
                Juntos Levando o Brasil Mais Longe
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================================
          SECTION 3: BANNER DE BOAS-VINDAS + CARROSSEL (1 A 5 IMAGENS, 1920 x 360)
      ===================================================================== */}
      <div className="bg-white rounded-xl p-5 border border-gray-200/80 shadow-2xs space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-gray-100">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] font-extrabold uppercase tracking-wider bg-[#080B0D] text-[#FFD400] px-2.5 py-0.5 rounded">
                3. BANNER DE BOAS-VINDAS & CARROSSEL (1 A 5 IMAGENS)
              </span>
              <span className="text-xs font-bold text-gray-500">
                Recomendado: 1920 × 360 px (16:3) • Ideal &lt; 1 MB (máx. 5 MB)
              </span>
            </div>
            <h3 className="text-base font-extrabold text-[#15191D] mt-1">
              Banner Principal de Boas-Vindas e Carrossel Automático
            </h3>
            <p className="text-xs text-gray-500">
              A área esquerda (~40%) permanece reservada para o título, subtítulo e botões em HTML.
              Adicione de 1 a 5 imagens, reordene e configure o intervalo de rotação.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {draft.welcomeBanner.items.length < 5 && (
              <label className="bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] text-xs font-extrabold px-3.5 py-2 rounded-lg inline-flex items-center gap-1.5 cursor-pointer">
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>
                  {uploadingSlot === 'welcomeBanner-add'
                    ? 'Enviando…'
                    : `Adicionar Imagem (${draft.welcomeBanner.items.length}/5)`}
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => handleAddOrReplaceBannerImage(null, e)}
                  className="hidden"
                />
              </label>
            )}

            <button
              type="button"
              onClick={() => handleRestoreSectionDefault('welcomeBanner')}
              className="bg-[#080B0D] hover:bg-gray-800 text-white text-xs font-bold px-3.5 py-2 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#FFD400]" />
              <span>Restaurar padrão</span>
            </button>
          </div>
        </div>

        {/* Carousel Controls: Toggle + Interval (3s to 15s) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[#F3F5F7] p-4 rounded-xl border border-gray-200 text-xs">
          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <div>
              <p className="font-extrabold text-[#15191D]">Ativar carrossel</p>
              <p className="text-[11px] text-gray-500">
                {draft.welcomeBanner.items.length === 1
                  ? 'Adicione pelo menos 2 imagens para habilitar a rotação automática.'
                  : 'Quando desligado, exibe apenas a primeira imagem estática.'}
              </p>
            </div>
            <input
              type="checkbox"
              disabled={draft.welcomeBanner.items.length < 2}
              checked={
                draft.welcomeBanner.items.length > 1 && draft.welcomeBanner.carouselEnabled
              }
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  welcomeBanner: {
                    ...prev.welcomeBanner,
                    carouselEnabled: e.target.checked,
                  },
                }))
              }
              className="w-4 h-4 rounded text-[#080B0D]"
            />
          </label>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="font-extrabold text-[#15191D]">
                Tempo de troca automática: {draft.welcomeBanner.intervalSeconds} segundos
              </span>
              <span className="font-mono text-[11px] text-gray-500">Padrão: 5s (3s a 15s)</span>
            </div>
            <input
              type="range"
              min={3}
              max={15}
              value={draft.welcomeBanner.intervalSeconds}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  welcomeBanner: {
                    ...prev.welcomeBanner,
                    intervalSeconds: Number(e.target.value),
                  },
                }))
              }
              className="w-full accent-[#080B0D]"
            />
          </div>
        </div>

        {/* List of 1..5 Banner Slides */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 space-y-3">
            {draft.welcomeBanner.items.map((item, idx) => (
              <div
                key={item.id}
                onClick={() => setActiveBannerPreviewIdx(idx)}
                className={`p-3.5 rounded-xl border transition cursor-pointer ${
                  activeBannerPreviewIdx === idx
                    ? 'bg-amber-50/60 border-2 border-[#FFD400]'
                    : 'bg-white border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-[#080B0D] text-[#FFD400] font-mono text-xs font-extrabold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <img
                      src={withRevisionParam(item.imageUrl, draft.revision)}
                      alt={item.altText || `Slide ${idx + 1}`}
                      className="w-24 h-12 rounded-lg object-cover border border-gray-300 shrink-0 bg-[#080B0D]"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold text-[#15191D] truncate">
                        Slide #{idx + 1}{' '}
                        {idx === 0 && (
                          <span className="text-[10px] font-bold bg-[#080B0D] text-[#FFD400] px-1.5 py-0.5 rounded ml-1">
                            Principal
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-gray-500 font-mono truncate">
                        {item.width || 1920}×{item.height || 360}px • Foco ({item.focusX}%,{' '}
                        {item.focusY}%)
                      </p>
                    </div>
                  </div>

                  {/* Slide Actions: Move Up, Move Down, Replace, Remove */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        handleMoveBannerItem(idx, -1);
                      }}
                      title="Mover para cima"
                      className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-40 cursor-pointer"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === draft.welcomeBanner.items.length - 1}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        handleMoveBannerItem(idx, 1);
                      }}
                      title="Mover para baixo"
                      className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-40 cursor-pointer"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>

                    <label
                      onClick={(ev) => ev.stopPropagation()}
                      className="px-2.5 py-1.5 rounded-lg bg-[#080B0D] text-[#FFD400] text-[11px] font-bold cursor-pointer inline-flex items-center gap-1"
                    >
                      <ImageIcon className="w-3 h-3" />
                      <span>Substituir</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => handleAddOrReplaceBannerImage(idx, e)}
                        className="hidden"
                      />
                    </label>

                    <button
                      type="button"
                      disabled={draft.welcomeBanner.items.length <= 1}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        handleRemoveBannerItem(idx);
                      }}
                      title="Remover imagem"
                      className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-[#E5252A] disabled:opacity-40 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Alt Text / Decorative & Focal Point Controls */}
                <div className="mt-3 pt-2.5 border-t border-gray-200/70 grid grid-cols-1 sm:grid-cols-12 gap-2.5 text-xs items-center">
                  <div className="sm:col-span-6">
                    <input
                      type="text"
                      disabled={item.isDecorative}
                      value={item.altText}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDraft((prev) => {
                          const items = [...prev.welcomeBanner.items];
                          items[idx] = { ...items[idx], altText: val };
                          return {
                            ...prev,
                            welcomeBanner: { ...prev.welcomeBanner, items },
                          };
                        });
                      }}
                      placeholder="Descrição acessível (alt) da imagem..."
                      className="w-full px-2.5 py-1.5 rounded border border-gray-300 text-xs disabled:bg-gray-100"
                    />
                  </div>
                  <label className="sm:col-span-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={item.isDecorative}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setDraft((prev) => {
                          const items = [...prev.welcomeBanner.items];
                          items[idx] = { ...items[idx], isDecorative: checked };
                          return {
                            ...prev,
                            welcomeBanner: { ...prev.welcomeBanner, items },
                          };
                        });
                      }}
                      className="rounded text-[#080B0D]"
                    />
                    <span>Imagem decorativa</span>
                  </label>
                  <div className="sm:col-span-3 flex items-center gap-1.5 text-[10px]">
                    <span className="font-bold text-gray-500">Foco Y:</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={item.focusY}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setDraft((prev) => {
                          const items = [...prev.welcomeBanner.items];
                          items[idx] = { ...items[idx], focusY: val };
                          return {
                            ...prev,
                            welcomeBanner: { ...prev.welcomeBanner, items },
                          };
                        });
                      }}
                      className="w-full accent-[#080B0D]"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Live Banner Preview */}
          <div className="lg:col-span-5 bg-[#080B0D] rounded-xl p-4 border border-gray-800 flex flex-col justify-center">
            <p className="text-[10px] font-mono uppercase tracking-wider text-[#FFD400] mb-2">
              Pré-visualização do Slide #{activeBannerPreviewIdx + 1} (
              {previewViewport === 'desktop' ? 'Desktop 16:3' : 'Mobile'})
            </p>
            <div
              className={`relative rounded-xl overflow-hidden bg-[#080B0D] border border-white/15 mx-auto ${
                previewViewport === 'desktop' ? 'w-full h-44' : 'w-64 h-36'
              }`}
            >
              {currentPreviewBanner && (
                <img
                  src={withRevisionParam(currentPreviewBanner.imageUrl, draft.revision)}
                  alt={
                    currentPreviewBanner.isDecorative
                      ? ''
                      : currentPreviewBanner.altText || 'Prévia do Banner'
                  }
                  style={{
                    objectPosition: `${currentPreviewBanner.focusX}% ${currentPreviewBanner.focusY}%`,
                  }}
                  className="absolute right-0 top-0 w-[75%] h-full object-cover"
                />
              )}
              <div
                className="absolute inset-0"
                style={{
                  background:
                    'linear-gradient(90deg, #080B0D 0%, #080B0D 36%, rgba(8,11,13,0.85) 54%, rgba(8,11,13,0.15) 85%)',
                }}
              />
              <div className="relative z-10 p-4 h-full flex flex-col justify-between max-w-[60%]">
                <div>
                  <p className="text-xs font-black text-white uppercase leading-tight">
                    BEM-VINDO AO
                  </p>
                  <p className="text-sm font-black text-[#FFD400] uppercase leading-tight">
                    RODOVAR CONECTA!
                  </p>
                  <p className="text-[10px] text-gray-200 mt-1 line-clamp-2">
                    Sua carga em primeiro lugar! Área esquerda (~40%) preservada para HTML.
                  </p>
                </div>
                <span className="self-start bg-[#FFD400] text-[#080B0D] text-[10px] font-extrabold px-2.5 py-1 rounded">
                  Ver comunicados →
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================================
          SECTION 4: AVATAR PADRÃO (1024 x 1024 px, corte circular)
      ===================================================================== */}
      <div className="bg-white rounded-xl p-5 border border-gray-200/80 shadow-2xs grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] font-extrabold uppercase tracking-wider bg-[#080B0D] text-[#FFD400] px-2.5 py-0.5 rounded">
              4. AVATAR PADRÃO GLOBAL
            </span>
            <span className="text-xs font-bold text-gray-500">
              Recomendado: 1024 × 1024 px (1:1 Quadrada)
            </span>
          </div>
          <h3 className="text-base font-extrabold text-[#15191D]">
            Avatar Neutro Padrão para Contas sem Foto Própria
          </h3>
          <p className="text-xs text-gray-500 leading-relaxed">
            Exibido com corte circular e proporção 1:1 em todo o sistema. Alterar o avatar padrão
            atualiza automaticamente todas as contas sem foto personalizada, preservando
            integralmente as fotos próprias já enviadas pelos usuários.
          </p>

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <label className="bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] text-xs font-extrabold px-4 py-2 rounded-lg inline-flex items-center gap-1.5 cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>
                {uploadingSlot === 'defaultAvatar'
                  ? 'Validando imagem…'
                  : 'Selecionar Novo Avatar Padrão'}
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => handleUploadSingleSlot('defaultAvatar', e)}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={() => handleRestoreSectionDefault('defaultAvatar')}
              className="bg-[#080B0D] hover:bg-gray-800 text-white text-xs font-bold px-3.5 py-2 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#FFD400]" />
              <span>Restaurar padrão</span>
            </button>
          </div>
        </div>

        {/* Circular Crop Preview */}
        <div className="lg:col-span-5 bg-[#080B0D] rounded-xl p-4 border border-gray-800 flex items-center justify-around">
          <div className="text-center space-y-1.5">
            <p className="text-[10px] font-mono uppercase text-[#FFD400]">Perfil (96px)</p>
            <img
              src={withRevisionParam(draft.defaultAvatar.imageUrl, draft.revision)}
              alt="Prévia circular 96px"
              className="w-24 h-24 rounded-full object-cover aspect-square border-4 border-[#FFD400] mx-auto bg-[#15191D]"
            />
          </div>
          <div className="text-center space-y-1.5">
            <p className="text-[10px] font-mono uppercase text-gray-400">Topo / Chat (44px)</p>
            <img
              src={withRevisionParam(draft.defaultAvatar.imageUrl, draft.revision)}
              alt="Prévia circular 44px"
              className="w-11 h-11 rounded-full object-cover aspect-square border-2 border-white mx-auto bg-[#15191D]"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

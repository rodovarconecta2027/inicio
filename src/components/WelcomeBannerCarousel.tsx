import React, { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
} from 'lucide-react';
import { SystemConfig, UserRole, WelcomeBannerItem } from '../types';
import { withRevisionParam } from '../lib/serverApi';

interface WelcomeBannerCarouselProps {
  systemConfig?: SystemConfig | null;
  userAccessLevel: UserRole;
  onViewAnnouncements: () => void;
  onOpenAdminPanel?: () => void;
  compactMobile?: boolean;
  adminLabel?: string;
}

const FALLBACK_BANNER_URL = '/assets/aistudio/010203_5a4289e5.png';

export const WelcomeBannerCarousel: React.FC<WelcomeBannerCarouselProps> = ({
  systemConfig,
  userAccessLevel,
  onViewAnnouncements,
  onOpenAdminPanel,
  compactMobile = false,
  adminLabel = "Painel Admin & Liberação",
}) => {
  const bannerCfg = systemConfig?.welcomeBanner;
  const rawItems: WelcomeBannerItem[] =
    bannerCfg?.items && bannerCfg.items.length > 0
      ? bannerCfg.items.slice(0, 5)
      : [
          {
            id: 'fallback-1',
            imageUrl: FALLBACK_BANNER_URL,
            altText: 'Frota Oficial RODOVAR — Sua carga em primeiro lugar!',
            isDecorative: false,
            focusX: 50,
            focusY: 50,
          },
        ];

  const isMultiSlideCarousel =
    rawItems.length > 1 && Boolean(bannerCfg?.carouselEnabled);
  const visibleSlides = isMultiSlideCarousel ? rawItems : [rawItems[0]];

  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(false);
  const [failedUrls, setFailedUrls] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mql.matches);
    const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mql.addEventListener?.('change', listener);
    return () => mql.removeEventListener?.('change', listener);
  }, []);

  useEffect(() => {
    if (activeIndex >= visibleSlides.length) {
      setActiveIndex(0);
    }
  }, [visibleSlides.length, activeIndex]);

  const intervalSec = Math.min(15, Math.max(3, Number(bannerCfg?.intervalSeconds) || 5));

  useEffect(() => {
    if (!isMultiSlideCarousel || isPaused || isHovered || prefersReducedMotion) {
      return;
    }
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % visibleSlides.length);
    }, intervalSec * 1000);
    return () => window.clearInterval(timer);
  }, [
    isMultiSlideCarousel,
    isPaused,
    isHovered,
    prefersReducedMotion,
    intervalSec,
    visibleSlides.length,
  ]);

  const currentSlide = visibleSlides[activeIndex] || visibleSlides[0];
  const rawSrc = failedUrls[currentSlide.id]
    ? FALLBACK_BANNER_URL
    : withRevisionParam(currentSlide.imageUrl, systemConfig?.revision);

  if (compactMobile) {
    return (
      <div
        className="relative rounded-xl overflow-hidden bg-[#0B0E11] h-[136px] shadow-sm select-none"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <img
          src={rawSrc}
          alt={currentSlide.isDecorative ? '' : currentSlide.altText}
          aria-hidden={currentSlide.isDecorative ? 'true' : undefined}
          referrerPolicy="no-referrer"
          onError={() =>
            setFailedUrls((prev) => ({ ...prev, [currentSlide.id]: true }))
          }
          style={{
            objectPosition: `${currentSlide.focusX ?? 50}% ${currentSlide.focusY ?? 50}%`,
          }}
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-500"
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
            type="button"
            onClick={onViewAnnouncements}
            className="self-start bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] text-[10px] font-bold px-2.5 py-1 rounded-md inline-flex items-center gap-1 shadow cursor-pointer"
          >
            <span>Ver comunicados</span>
            <ChevronRight className="w-3 h-3 stroke-[2.5]" />
          </button>
        </div>

        {isMultiSlideCarousel && (
          <div className="absolute bottom-2 right-2.5 z-20 flex items-center gap-1 bg-black/65 px-2 py-1 rounded-full">
            {visibleSlides.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveIndex(idx)}
                aria-label={`Ir para slide ${idx + 1}`}
                className={`h-1.5 rounded-full transition-all cursor-pointer ${
                  idx === activeIndex ? 'w-4 bg-[#FFD400]' : 'w-1.5 bg-white/50'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="relative rounded-2xl overflow-hidden bg-[#080B0D] h-[225px] lg:h-[238px] shadow-md select-none group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Right side Banner Image with configurable Focal Point & Fallback */}
      <img
        src={rawSrc}
        alt={currentSlide.isDecorative ? '' : currentSlide.altText}
        aria-hidden={currentSlide.isDecorative ? 'true' : undefined}
        referrerPolicy="no-referrer"
        onError={() =>
          setFailedUrls((prev) => ({ ...prev, [currentSlide.id]: true }))
        }
        style={{
          objectPosition: `${currentSlide.focusX ?? 50}% ${currentSlide.focusY ?? 50}%`,
        }}
        className="absolute right-0 top-0 h-full w-[74%] object-cover transition-all duration-500"
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(90deg, #080B0D 0%, #080B0D 32%, rgba(8,11,13,0.90) 47%, rgba(8,11,13,0.32) 66%, rgba(8,11,13,0.05) 84%)',
        }}
      />

      {/* Left ~40% Reserved for Real HTML Title, Subtitle & Action Buttons */}
      <div className="relative z-10 h-full flex flex-col justify-between p-6 lg:p-7 max-w-[560px]">
        <div className="flex items-start gap-3.5">
          <div>
            <h1 className="text-[24px] lg:text-[27px] font-black text-white leading-[1.12] tracking-tight uppercase">
              BEM-VINDO AO
            </h1>
            <h2 className="text-[27px] lg:text-[31px] font-black text-[#FFD400] leading-[1.12] tracking-tight uppercase">
              RODOVAR CONECTA!
            </h2>
            <p className="text-[14.5px] lg:text-[15.5px] text-white/95 mt-2.5 leading-snug font-normal max-w-[430px]">
              Sua carga em primeiro lugar! Acesse os comunicados, solicitações e informações da nossa empresa.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onViewAnnouncements}
            className="bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] font-extrabold text-[14px] px-6 py-2.5 rounded-lg inline-flex items-center gap-2 shadow-md transition-transform active:scale-95 cursor-pointer"
          >
            <span>Ver comunicados</span>
            <ChevronRight className="w-4 h-4 stroke-[2.8]" />
          </button>
          {(userAccessLevel === 'ADMINISTRADOR' || userAccessLevel === 'DIRETORIA') &&
            onOpenAdminPanel && (
              <button
                type="button"
                onClick={onOpenAdminPanel}
                className="bg-white/10 hover:bg-white/20 text-white border border-white/20 font-bold text-xs px-4 py-2.5 rounded-lg inline-flex items-center gap-1.5 backdrop-blur-xs transition cursor-pointer"
              >
                <span>{adminLabel}</span>
              </button>
            )}
        </div>
      </div>

      {/* Carousel Controls (Only shown when 2..5 images and carouselEnabled is true) */}
      {isMultiSlideCarousel && (
        <div className="absolute bottom-3.5 right-4 z-20 flex items-center gap-2 bg-[#080B0D]/80 backdrop-blur-xs border border-white/15 px-3 py-1.5 rounded-full">
          <button
            type="button"
            onClick={() =>
              setActiveIndex(
                (prev) => (prev - 1 + visibleSlides.length) % visibleSlides.length
              )
            }
            aria-label="Imagem anterior do banner"
            className="text-white hover:text-[#FFD400] transition cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1.5 px-1">
            {visibleSlides.map((slide, idx) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => setActiveIndex(idx)}
                aria-label={`Ir para imagem ${idx + 1} de ${visibleSlides.length}`}
                className={`h-2 rounded-full transition-all cursor-pointer ${
                  idx === activeIndex
                    ? 'w-5 bg-[#FFD400]'
                    : 'w-2 bg-white/40 hover:bg-white/70'
                }`}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() =>
              setActiveIndex((prev) => (prev + 1) % visibleSlides.length)
            }
            aria-label="Próxima imagem do banner"
            className="text-white hover:text-[#FFD400] transition cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <div className="w-[1px] h-3.5 bg-white/20 mx-0.5" />

          <button
            type="button"
            onClick={() => setIsPaused((p) => !p)}
            aria-label={
              isPaused ? 'Retomar rotação automática' : 'Pausar rotação automática'
            }
            title={
              isPaused ? 'Retomar rotação automática' : 'Pausar rotação automática'
            }
            className="text-[#FFD400] hover:text-white transition cursor-pointer"
          >
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}
    </div>
  );
};

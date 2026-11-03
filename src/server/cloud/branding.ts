import type { SystemConfig } from '../../types';
export function getDefaultSystemConfig(): SystemConfig {
  return {
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
}

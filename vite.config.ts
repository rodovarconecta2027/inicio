import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    define: { 'import.meta.env.VITE_CLOUD_AUTH': JSON.stringify(process.env.VERCEL_ENV === 'preview' && process.env.RODOVAR_CLOUD_ENV === 'homologation' && process.env.GOOGLE_CLOUD_PROJECT === 'rodovar-conecta-hml-60770' ? 'true' : 'false') },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

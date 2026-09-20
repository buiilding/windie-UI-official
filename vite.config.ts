import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Local dotenv files describe only this checkout's development proxy. A
  // production deployment must take its public configuration from Vercel, not
  // accidentally bundle a developer's `.env.local` values.
  const envDir = mode === 'production' ? false : process.cwd();
  const env = loadEnv(mode, envDir, '');
  return {
    plugins: [react()],
    envDir,
    resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
    css: { postcss: { plugins: [tailwindcss()] } },
    // The browser talks to this Vite process during development, so its request
    // is same-origin. Production continues to call the exact HTTPS API origin.
    server: {
      proxy: {
        '/hosted-api': {
          target:
            env.VITE_WINDIE_PROXY_TARGET ?? 'https://hosted-api.windieos.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/hosted-api/, ''),
        },
      },
    },
  };
});

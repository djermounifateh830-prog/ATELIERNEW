import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(async ({ command }) => {
  const plugins: any[] = [react(), tailwindcss()];

  // Charger le plugin serveur SQLite uniquement pour les serveurs dev & preview, pas pour le build statique
  if (command !== 'build') {
    try {
      const { sqlitePlugin } = await import('./src/server/viteSqlitePlugin');
      plugins.push(sqlitePlugin());
    } catch (pluginErr) {
      console.error('⚠️ [Vite Plugin SQLite] Avertissement au chargement du plugin SQLite:', pluginErr);
    }
  }

  return {
    plugins,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true as const,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: {
        ignored: [
          '**/*.db',
          '**/*.db-wal',
          '**/*.db-shm',
          '**/*.log',
          '**/*.bat',
          '**/*.xlsx',
          '**/*.pdf',
          '**/dist/**'
        ]
      },
    },
    preview: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true as const,
    },
  };
});

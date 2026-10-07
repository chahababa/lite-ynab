import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const root = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root, envDir: false, publicDir: false, plugins: [react(), {
    name: 'synthetic-preview-deny-private-paths',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        let url: string;
        try { url = decodeURIComponent(request.url ?? '').replace(/\\/g, '/'); } catch { response.statusCode = 400; response.end(); return; }
        if (/(?:^|\/)\.env(?:[./?]|$)|(?:^|\/)(?:\.git|src|supabase)(?:\/|$)|(?:collector|parser\.snapshot)\.ts(?:[?]|$)|\.test\.[cm]?[jt]sx?(?:[?]|$)/.test(url)) {
          response.statusCode = 403; response.end('Synthetic preview: path blocked'); return;
        }
        next();
      });
    },
  }],
  css: { postcss: { plugins: [] } },
  server: {
    host: '127.0.0.1', port: 4178, strictPort: true, hmr: false, cors: false,
    headers: { 'Content-Security-Policy': "default-src 'self'; connect-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'none'; font-src 'none'; object-src 'none'; form-action 'none'; frame-ancestors 'none'" },
    fs: { strict: true, allow: [root, path.resolve(root, '../../design'), path.resolve(root, '../../node_modules')], deny: ['.env', '.env.*', '**/.git/**', '**/supabase/**', '**/src/**', '**/collector.ts', '**/parser.snapshot.ts', '**/*.test.*'] },
  },
  build: { outDir: '.preview-dist', emptyOutDir: true },
});

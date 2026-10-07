import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import config from './vite.config';
const root = path.resolve('experiments/ctbc-synthetic');
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? sourceFiles(path.join(directory, entry.name)) : /\.(tsx?|mjs)$/.test(entry.name) ? [path.join(directory, entry.name)] : []);
}
describe('isolation gate: static graph and local server boundary', () => {
  it('no production source imports experiment; no app/public/migration changes needed', () => {
    for (const file of sourceFiles(path.resolve('src'))) expect(readFileSync(file, 'utf8')).not.toMatch(/(?:from\s*|import\s*\(|require\s*\()[^\n]*experiments\/ctbc-synthetic/);
  });
  it('browser graph has no parser, credentials, persistence or network API', () => {
    for (const file of ['App.tsx', 'main.tsx', 'model.ts', 'fixtures.ts']) {
      const code = readFileSync(path.join(root, file), 'utf8');
      expect(code).not.toMatch(/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|indexedDB|sendBeacon)\b|process\.env|import\.meta\.env|supabase|gmail\.google|parser\.snapshot|from ['"]\.\/collector/);
    }
  });
  it('collector depends only on isolated snapshot/model and node hash; no connector/DB/env', () => {
    const code = readFileSync(path.join(root, 'collector.ts'), 'utf8');
    expect(code).not.toMatch(/\bfetch\b|process\.env|supabase|from ['"]\.\.\//);
  });
  it('server binds loopback with no env/public/HMR, deny production files and outgoing connection CSP', () => {
    expect(config.envDir).toBe(false); expect(config.publicDir).toBe(false);
    expect(config.server).toMatchObject({ host: '127.0.0.1', strictPort: true, hmr: false, cors: false, fs: { strict: true } });
    expect(config.server?.fs?.deny).toContain('**/src/**'); expect(config.server?.fs?.deny).toContain('.env.*');
    expect(config.server?.headers?.['Content-Security-Policy']).toContain("connect-src 'none'");
    expect(config.server?.fs?.allow).not.toContain(path.resolve('.'));
  });
});

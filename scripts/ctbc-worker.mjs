// Existing Node 22 container entry. No scheduled workflow or provider creation.
import { createRequire } from 'node:module';
import { setTimeout as pause } from 'node:timers/promises';
const mode = process.argv[2] ?? 'once';
if (!['once','daemon','retention','retention-daemon'].includes(mode)) throw new Error('invalid_worker_mode');
const retention = mode.startsWith('retention');
const flag = retention ? 'CTBC_RETENTION_ENABLED' : 'CTBC_COLLECTOR_ENABLED';
// Default-off must exit without loading config, credentials or dependencies.
if (process.env[flag] !== 'true') { console.log(JSON.stringify({code:'disabled'})); process.exit(0); }
const { runCtbcWorkerOnce, runCtbcRetentionOnce } = createRequire(import.meta.url)('../.ctbc-worker/ctbcWorker.js');
const daemon = mode.endsWith('daemon');
const controller = new AbortController();
process.once('SIGTERM', () => controller.abort());
process.once('SIGINT', () => controller.abort());
do {
  try {
    const result = await (retention ? runCtbcRetentionOnce() : runCtbcWorkerOnce());
    // Fixed codes/counts only; never raw error/provider/config/selector/IDs.
    console.log(JSON.stringify({ code: typeof result.code === 'string' ? result.code : 'retention_counted',
      ...(retention && !result.code ? { expire: result.expire, scrub: result.scrub, purge: result.purge } : {}) }));
  } catch { console.log(JSON.stringify({code:'worker_configuration_or_provider_denied'})); }
  if (!daemon || controller.signal.aborted) break;
  try { await pause(retention ? 3_600_000 : 30_000, undefined, {signal:controller.signal}); } catch { break; }
} while (!controller.signal.aborted);

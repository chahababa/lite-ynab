// Node-only synthetic parser boundary. Never imported by the preview browser.
import { createHash } from 'node:crypto';
import { parseCtbcEmail, type CtbcEmailInput } from './parser.snapshot';
import { DAY, SyntheticInbox, type Draft } from './model';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export function slot(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error('invalid_slot');
  const midnight = Date.parse(`${date}T00:00:00+08:00`);
  return { date, start: midnight - 4 * DAY, end: midnight + 17 * 3_600_000, stop: midnight + DAY,
    cohorts: [3, 2, 1].map(n => new Date(midnight - n * DAY + 8 * 3_600_000).toISOString().slice(0, 10)),
    query: `after:${midnight / 1000 - 4 * DAY / 1000 - 1} before:${midnight / 1000 + 17 * 3600 + 1}` };
}
export type Envelope = { synthetic: true; internalDate: number; trustedHeader: boolean; input: CtbcEmailInput };
export type Summary = { status: 'no_message' | 'zero_new_candidates' | 'ready_for_review' | 'partial_failure' | 'failed'; added: number; existing: number; rejected: number; outsideWindow: number; deferred: number; failures: number; payloadConflict: number };
export function collect(inbox: SyntheticInbox, date: string, messages: Envelope[], target: string, paymentId: string, now: number, lease: { runs: SyntheticRuns; token: number }, complete = true): Summary {
  const window = slot(date);
  const summary: Summary = { status: 'zero_new_candidates', added: 0, existing: 0, rejected: 0, outsideWindow: 0, deferred: 0, failures: complete ? 0 : 1, payloadConflict: 0 };
  // Required mock capability at mutation boundary, not merely a standalone helper.
  if (now < window.end || now >= window.stop || !lease.runs.canWrite(date, lease.token, now, inbox)) { summary.status = 'failed'; summary.failures++; return summary; }
  inbox.retain(now);
  let acceptedMessages = 0;
  for (const envelope of messages) {
    if (envelope.synthetic !== true || !Number.isFinite(envelope.internalDate)) { summary.rejected++; continue; }
    if (envelope.internalDate < window.start || envelope.internalDate >= window.end) continue;
    if (!envelope.trustedHeader) { summary.rejected++; continue; }
    const parsed = parseCtbcEmail(envelope.input);
    if (!parsed.accepted) { summary.rejected++; continue; }
    acceptedMessages++;
    summary.failures += parsed.errors.length;
    // Filter per row BEFORE sanitized candidate creation. Raw parser output stays local.
    const selected = parsed.candidates.filter(c => c.cardLast4 === target);
    const keys = selected.map(c => c.sourceId);
    if (new Set(keys).size !== keys.length) { summary.failures++; continue; } // No arbitrary row-number identity.
    for (const c of selected) {
      const sourceId = `synthetic:ctbc:v1:${hash(parsed.messageId)}:${hash(c.sourceId)}`;
      const occurredDate = c.occurredAt.slice(0, 10);
      const draft: Draft = { sourceId, detail: {
        occurredAt: c.occurredAt, amount: c.amountTwd, merchant: c.merchantNormalized,
        product: c.cardProductName, role: c.cardRole, bankCategory: c.bankCategoryRaw,
        paymentId, warnings: [...(c.merchantNormalized ? [] : ['merchant_unknown']), ...(parsed.errors.length || !complete ? ['partial_batch'] : [])], late: occurredDate !== window.cohorts[2],
      } };
      const known = inbox.existing(draft);
      if (known === 'existing') { summary.existing++; continue; }
      if (known === 'payload_conflict') { summary.payloadConflict++; continue; }
      if (Date.parse(c.occurredAt) > now) { summary.failures++; continue; }
      if (occurredDate === date) { summary.deferred++; continue; }
      if (!window.cohorts.includes(occurredDate)) { summary.outsideWindow++; continue; }
      inbox.add(draft, now);
      summary.added++;
    }
  }
  summary.status = summary.failures || summary.rejected || summary.payloadConflict ? 'partial_failure' : summary.added ? 'ready_for_review' : acceptedMessages ? 'zero_new_candidates' : 'no_message';
  return summary;
}

// In-memory scheduler simulation, no timers/cron/provider. One scope/lease per instance.
export class SyntheticRuns {
  constructor(private readonly scope: SyntheticInbox) {}
  private runs = new Map<string, { attempts: number; nextAt: number; token: number; deadline: number }>();
  private fence = 0;
  private active?: { key: string; token: number; deadline: number };
  begin(date: string, now: number) {
    const window = slot(date);
    if (now < window.end) return { code: 'too_early' } as const;
    const run = this.runs.get(date);
    if (now >= window.stop) return { code: run ? 'retry_expired' : 'missed_run' } as const;
    if (this.active && now < this.active.deadline) return { code: 'scope_busy' } as const;
    if (run && (run.attempts >= 3 || now < run.nextAt)) return { code: 'retry_blocked' } as const;
    const attempts = (run?.attempts ?? 0) + 1;
    const token = ++this.fence;
    const deadline = Math.min(now + 15 * 60_000, window.stop);
    this.runs.set(date, { attempts, nextAt: deadline + (attempts === 1 ? 5 : 15) * 60_000, token, deadline });
    this.active = { key: date, token, deadline };
    return { code: 'started', date, token, deadline, window } as const;
  }
  canWrite(date: string, token: number, now: number, inbox: SyntheticInbox = this.scope) { return inbox === this.scope && this.active?.key === date && this.active.token === token && now < this.active.deadline && now < slot(date).stop; }
  finish(date: string, token: number, now: number, success: boolean) {
    if (!this.canWrite(date, token, now)) return false;
    const run = this.runs.get(date)!;
    run.nextAt = success ? Infinity : now + (run.attempts === 1 ? 5 : 15) * 60_000;
    this.active = undefined;
    return true;
  }
}

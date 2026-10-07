import { describe, expect, it } from 'vitest';
import { parseCtbcEmail as phase1 } from '../../src/lib/ctbcEmailParser';
import fixture from '../../src/test-fixtures/ctbc-email-alert.synthetic.json';
import { collect as collectRaw, slot, SyntheticRuns, type Envelope } from './collector';
import { parseCtbcEmail } from './parser.snapshot';
import { SyntheticInbox, DAY } from './model';
import { categories, payments, OWNER, NOW } from './fixtures';
const fresh = () => new SyntheticInbox(OWNER, structuredClone(categories), structuredClone(payments));
// Each ordinary parser/window case receives a fresh mock scope/lease.
function collect(inbox: SyntheticInbox, date: string, messages: Envelope[], target: string, payment: string, now: number, complete = true) {
  const runs = new SyntheticRuns(inbox); const run = runs.begin(date, now);
  return collectRaw(inbox, date, messages, target, payment, now, { runs, token: run.code === 'started' ? run.token : -1 }, complete);
}
const header = '卡別\t末四碼\t消費日\t消費金額\t商店名稱\t商店類型│交易類型';
const row = (card = '1234', date = '2026/10/06 09:00', amount = 120) => `合成卡 (正卡)\t${card}\t${date}\t$${amount} 元\t合成商店\t餐飲 實體卡交易`;
function mail(rows = [row()], received = Date.parse('2026-10-07T14:00:00+08:00')): Envelope {
  return { synthetic: true, trustedHeader: true, internalDate: received, input: { messageId: 'synthetic-email-1', from: fixture.from, subject: fixture.subject, authenticationResults: fixture.authenticationResults, text: [header, ...rows].join('\n') } };
}
describe('isolated parser snapshot and sanitized collector', () => {
  it('has parity with frozen Phase 1 on ordinary/nested/invalid sources', () => {
    for (const f of [fixture, { ...fixture, from: 'fake@example.invalid' }, { ...fixture, html: '<table></table>' }]) expect(parseCtbcEmail(f)).toEqual(phase1(f));
  });
  it('snapshot preserves duplicate rows instead of silently folding them', () => {
    const input = mail([row(), row()]).input;
    expect(phase1(input).candidates).toHaveLength(1);
    expect(parseCtbcEmail(input).candidates).toHaveLength(2);
    const inbox = fresh(); expect(collect(inbox, '2026-10-07', [mail([row(), row()])], '1234', 'synthetic-card', NOW)).toMatchObject({ added: 0, failures: 1, status: 'partial_failure' });
    expect(inbox.snapshot(OWNER)).toEqual([]);
  });
  it('single-card per-row filtering; output contains no raw ID/card/non-target merchant', () => {
    const inbox = fresh(); const m = mail([row(), row('5678').replace('合成商店', '非目標合成商店')]);
    expect(collect(inbox, '2026-10-07', [m], '1234', 'synthetic-card', NOW).added).toBe(1);
    const serialized = JSON.stringify(inbox.snapshot(OWNER));
    expect(serialized).not.toContain('synthetic-email-1'); expect(serialized).not.toContain('1234'); expect(serialized).not.toContain('5678'); expect(serialized).not.toContain('非目標合成商店');
  });
  it.each(['from', 'subject', 'authenticationResults'] as const)('rejects spoofed %s', field => {
    const m = mail(); m.input[field] = 'forged';
    const inbox = fresh(); expect(collect(inbox, '2026-10-07', [m], '1234', 'synthetic-card', NOW)).toMatchObject({ rejected: 1, added: 0, status: 'partial_failure' });
  });
  it.each(['mx.google.com; dkim=pass.evil header.i=@inib.ctbcbank.com; spf=pass smtp.mailfrom=bank@inib.ctbcbank.com; dmarc=pass header.from=inib.ctbcbank.com', fixture.authenticationResults.replace('inib.ctbcbank.com', 'inib.ctbcbank.com.evil'), fixture.authenticationResults.replace('spf=pass', 'spf=fail')])('rejects forged verdict/domain %s', auth => {
    const m = mail(); m.input.authenticationResults = auth;
    expect(collect(fresh(), '2026-10-07', [m], '1234', 'synthetic-card', NOW).rejected).toBe(1);
  });
  it('requires independently trusted header envelope, not header text alone', () => {
    const m = mail(); m.trustedHeader = false;
    expect(collect(fresh(), '2026-10-07', [m], '1234', 'synthetic-card', NOW).rejected).toBe(1);
  });
  it('rescan returns terminal shell before new-source cohort; no outside warning for known old row', () => {
    const inbox = fresh(); const m = mail([row('1234', '2026/10/04 09:00')]);
    collect(inbox, '2026-10-07', [m], '1234', 'synthetic-card', NOW);
    const c = inbox.snapshot(OWNER)[0]; inbox.act({ owner: OWNER, candidateId: c.id, version: 1, key: 'exclude', action: 'work', confirm: true }, NOW);
    expect(collect(inbox, '2026-10-08', [m], '1234', 'synthetic-card', NOW + DAY)).toMatchObject({ existing: 1, added: 0, outsideWindow: 0 });
    expect(inbox.snapshot(OWNER)[0].status).toBe('work_excluded');
    expect(collect(fresh(), '2026-10-08', [m], '1234', 'synthetic-card', NOW + DAY).outsideWindow).toBe(1);
  });
  it('partial parser/pages are visible; accepted success rows are risky for batch', () => {
    const inbox = fresh(); const result = collect(inbox, '2026-10-07', [mail([row(), '損壞列'])], '1234', 'synthetic-card', NOW, false);
    expect(result).toMatchObject({ status: 'partial_failure', failures: 2, added: 1 });
    expect(inbox.snapshot(OWNER)[0].detail?.warnings).toContain('partial_batch');
    const c = inbox.snapshot(OWNER)[0]; inbox.act({ owner: OWNER, candidateId: c.id, version: c.version, key: 'ignore', action: 'ignore', confirm: true, resolveRisk: true }, NOW);
    expect(inbox.count(OWNER, NOW)).toBe(0); expect(result.status).toBe('partial_failure');
  });
  it.each([false, true])('run-scoped partial batch marks successful rows regardless message order (reverse=%s)', reverse => {
    const inbox = fresh(); const good = mail(); const bad = mail(['損壞列']); bad.input.messageId = 'synthetic-broken-email';
    const messages = reverse ? [bad, good] : [good, bad];
    const result = collect(inbox, '2026-10-07', messages, '1234', 'synthetic-card', NOW);
    expect(result).toMatchObject({ status: 'partial_failure', added: 1 });
    const c = inbox.snapshot(OWNER)[0]; expect(c.status).toBe('conflict'); expect(c.detail?.warnings).toContain('partial_batch');
    expect(inbox.batchPreview([{ owner: OWNER, candidateId: c.id, version: c.version, key: 'batch', action: 'import', categoryId: 'food', paymentId: 'synthetic-card', confirm: true }], NOW)).toBe(false);
  });
  it.each([false, true])('multi-message partial rescan upgrades existing success monotonically (reverse=%s)', reverse => {
    const inbox = fresh(); const good = mail(); collect(inbox, '2026-10-07', [good], '1234', 'synthetic-card', NOW);
    const initial = inbox.snapshot(OWNER)[0]; const bad = mail(['損壞列']); bad.input.messageId = 'synthetic-broken-email';
    const messages = reverse ? [bad, good] : [good, bad];
    expect(collect(inbox, '2026-10-07', messages, '1234', 'synthetic-card', NOW + 60_000)).toMatchObject({ status: 'partial_failure', existing: 1, added: 0 });
    expect(inbox.snapshot(OWNER)[0]).toMatchObject({ status: 'conflict', version: 2, createdAt: initial.createdAt, payload: initial.payload, sourceId: initial.sourceId, detail: { warnings: ['partial_batch'] } });
    collect(inbox, '2026-10-07', messages, '1234', 'synthetic-card', NOW + 120_000); expect(inbox.snapshot(OWNER)[0].version).toBe(2);
    collect(inbox, '2026-10-07', [good], '1234', 'synthetic-card', NOW + 180_000); expect(inbox.snapshot(OWNER)[0].detail?.warnings).toEqual(['partial_batch']);
  });
  it.each([{ rows: ['損壞列'] }, { rows: [row(), row()] }])('a now fully malformed/ambiguous accepted source marks its prior shell but no unrelated source: %j', ({ rows }) => {
    const inbox = fresh(); const good = mail();
    // Other run's source uses that run's past-day cohort.
    const otherSource = mail([row('1234', '2026/10/05 10:00', 35)], Date.parse('2026-10-06T14:00:00+08:00')); otherSource.input.messageId = 'synthetic-unrelated-email';
    collect(inbox, '2026-10-06', [otherSource], '1234', 'synthetic-card', NOW - DAY);
    collect(inbox, '2026-10-07', [good], '1234', 'synthetic-card', NOW);
    const before = inbox.snapshot(OWNER);
    expect(collect(inbox, '2026-10-07', [mail(rows)], '1234', 'synthetic-card', NOW + 60_000)).toMatchObject({ status: 'partial_failure', added: 0 });
    expect(inbox.snapshot(OWNER)[1]).toMatchObject({ status: 'conflict', createdAt: before[1].createdAt, sourceId: before[1].sourceId, detail: { warnings: ['partial_batch'] } });
    expect(inbox.snapshot(OWNER)[0]).toEqual(before[0]);
  });
  it('partial retry marks previous run members even when omitted, and clean retry/new rows inherit sticky failure', () => {
    const inbox = fresh(); collect(inbox, '2026-10-07', [mail()], '1234', 'synthetic-card', NOW);
    const initial = inbox.snapshot(OWNER)[0]; const bad = mail(['損壞列']); bad.input.messageId = 'synthetic-failed-new-message';
    expect(collect(inbox, '2026-10-07', [bad], '1234', 'synthetic-card', NOW + 60_000).status).toBe('partial_failure');
    expect(inbox.snapshot(OWNER)[0]).toMatchObject({ status: 'conflict', version: 2, createdAt: initial.createdAt, detail: { warnings: ['partial_batch'] } });
    const next = mail([row('1234', '2026/10/06 10:00', 35)]); next.input.messageId = 'synthetic-new-success';
    expect(collect(inbox, '2026-10-07', [next], '1234', 'synthetic-card', NOW + 120_000)).toMatchObject({ status: 'partial_failure', priorFailure: true, failures: 0, added: 1 });
    expect(inbox.snapshot(OWNER)[1].detail?.warnings).toContain('partial_batch');
    expect(collect(inbox, '2026-10-07', [], '1234', 'synthetic-card', NOW + 180_000)).toMatchObject({ status: 'partial_failure', priorFailure: true });
    expect(inbox.snapshot(OWNER)[0].version).toBe(2);
  });
  it('no message, all existing/zero new, missed and failed states are distinct and preserve prior todo', () => {
    const inbox = fresh(); collect(inbox, '2026-10-07', [mail()], '1234', 'synthetic-card', NOW);
    expect(collect(inbox, '2026-10-07', [], '1234', 'synthetic-card', NOW).status).toBe('no_message');
    expect(collect(inbox, '2026-10-07', [mail()], '1234', 'synthetic-card', NOW).status).toBe('zero_new_candidates');
    expect(collect(inbox, '2026-10-07', [], '1234', 'synthetic-card', NOW, false).status).toBe('partial_failure');
    expect(collect(inbox, '2026-10-07', [], '1234', 'synthetic-card', NOW + DAY).status).toBe('failed');
    expect(inbox.count(OWNER, NOW)).toBe(1);
  });
  it('same-source partial rescan upgrades risk once, preserves deadline/payload and blocks batches', () => {
    const inbox = fresh(); collect(inbox, '2026-10-07', [mail()], '1234', 'synthetic-card', NOW);
    const initial = inbox.snapshot(OWNER)[0];
    const command = { owner: OWNER, candidateId: initial.id, version: 1, key: 'safe-batch', action: 'import' as const, categoryId: 'food', paymentId: 'synthetic-card', confirm: true };
    expect(inbox.batchPreview([command], NOW)).toBe(true);
    const partial = mail([row(), '損壞列']);
    const summary = collect(inbox, '2026-10-07', [partial], '1234', 'synthetic-card', NOW + 60_000, false);
    expect(summary).toMatchObject({ status: 'partial_failure', existing: 1, added: 0 });
    const risky = inbox.snapshot(OWNER)[0];
    expect(risky).toMatchObject({ status: 'conflict', version: 2, createdAt: initial.createdAt, sourceId: initial.sourceId, payload: initial.payload });
    expect(risky.detail?.warnings).toEqual(['partial_batch']);
    expect(inbox.batchPreview([{ ...command, version: risky.version }], NOW)).toBe(false);
    collect(inbox, '2026-10-07', [partial], '1234', 'synthetic-card', NOW + 120_000, false);
    expect(inbox.snapshot(OWNER)[0].version).toBe(2);
    inbox.act({ ...command, key: 'defer', version: 2, action: 'defer' }, NOW + 120_000);
    expect(inbox.snapshot(OWNER)[0]).toMatchObject({ status: 'conflict', createdAt: initial.createdAt, detail: { warnings: ['partial_batch'] } });
    collect(inbox, '2026-10-07', [mail()], '1234', 'synthetic-card', NOW + 180_000);
    expect(inbox.snapshot(OWNER)[0].detail?.warnings).toEqual(['partial_batch']);
  });
  it('new rescan risk never resurrects terminal or scrubbed details', () => {
    const inbox = fresh(); collect(inbox, '2026-10-07', [mail()], '1234', 'synthetic-card', NOW);
    const c = inbox.snapshot(OWNER)[0]; inbox.act({ owner: OWNER, candidateId: c.id, version: 1, key: 'work', action: 'work', confirm: true }, NOW);
    collect(inbox, '2026-10-07', [mail()], '1234', 'synthetic-card', NOW + 60_000, false);
    expect(inbox.snapshot(OWNER)[0]).toMatchObject({ status: 'work_excluded', closedAt: NOW, createdAt: NOW });
    inbox.retain(NOW + 7 * DAY);
    // Test shell boundary directly after cleanup; regular time window would refuse this old mail.
    inbox.existing({ sourceId: c.sourceId, detail: { ...c.detail!, warnings: ['partial_batch', 'merchant_unknown'] } });
    expect(inbox.snapshot(OWNER)[0].detail).toBeUndefined();
    expect(inbox.snapshot(OWNER)[0].status).toBe('work_excluded');
    expect(inbox.personalTransactions(OWNER)).toEqual([]);
  });
});
describe('calendar, precise receipt window and cohorts', () => {
  it.each([
    ['2026-10-07', '2026-10-02T16:00:00Z', '2026-10-07T09:00:00Z', '2026-10-04', '2026-10-06'],
    ['2026-10-08', '2026-10-03T16:00:00Z', '2026-10-08T09:00:00Z', '2026-10-05', '2026-10-07'],
    ['2027-01-01', '2026-12-27T16:00:00Z', '2027-01-01T09:00:00Z', '2026-12-29', '2026-12-31'],
    ['2028-03-01', '2028-02-25T16:00:00Z', '2028-03-01T09:00:00Z', '2028-02-27', '2028-02-29'],
    ['2026-10-11', '2026-10-06T16:00:00Z', '2026-10-11T09:00:00Z', '2026-10-08', '2026-10-10'],
  ])('%s uses Taipei calendar including weekend/leap/year boundary', (date, start, end, oldest, main) => {
    const s = slot(date); expect(s.start).toBe(Date.parse(start)); expect(s.end).toBe(Date.parse(end)); expect(s.cohorts[0]).toBe(oldest); expect(s.cohorts[2]).toBe(main);
  });
  it('Gmail epoch search is padded exactly one second, then millisecond filter', () => {
    const s = slot('2026-10-07'); expect(s.query).toBe('after:1790956799 before:1791363601');
    for (const [received, added] of [[s.start - 1, 0], [s.start, 1], [s.end - 1, 1], [s.end, 0]]) expect(collect(fresh(), s.date, [mail([row()], received)], '1234', 'synthetic-card', NOW).added).toBe(added);
  });
  it('17:00 and 23:59 arrivals wait until next day; oldest cohort then outside', () => {
    const s = slot('2026-10-07');
    for (const received of [s.end, s.end + 6 * 3_600_000 + 59 * 60_000]) {
      const inbox = fresh(); const m = mail([row()], received);
      expect(collect(inbox, s.date, [m], '1234', 'synthetic-card', NOW).added).toBe(0);
      expect(collect(inbox, '2026-10-08', [m], '1234', 'synthetic-card', NOW + DAY).added).toBe(1);
    }
    expect(collect(fresh(), '2026-10-08', [mail([row('1234', '2026/10/04 09:00')], s.end)], '1234', 'synthetic-card', NOW + DAY).outsideWindow).toBe(1);
  });
  it('old, current, future and invalid dates use separate outcomes', () => {
    expect(collect(fresh(), '2026-10-07', [mail([row('1234', '2026/10/03 09:00')])], '1234', 'synthetic-card', NOW).outsideWindow).toBe(1);
    expect(collect(fresh(), '2026-10-07', [mail([row('1234', '2026/10/07 09:00')])], '1234', 'synthetic-card', NOW).deferred).toBe(1);
    expect(collect(fresh(), '2026-10-07', [mail([row('1234', '2026/10/08 09:00')])], '1234', 'synthetic-card', NOW).failures).toBe(1);
    expect(collect(fresh(), '2026-10-07', [mail([row('1234', '2026/02/30 09:00')])], '1234', 'synthetic-card', NOW).failures).toBeGreaterThan(0);
  });
});
describe('mock fixed run key, bounded retries, midnight and fencing', () => {
  it('refuses early start, same slot concurrent/second regular trigger and stale fence', () => {
    const runs = new SyntheticRuns(fresh()); const s = slot('2026-10-07');
    expect(runs.begin(s.date, s.end - 1).code).toBe('too_early');
    const first = runs.begin(s.date, NOW); if (first.code !== 'started') throw Error('start');
    expect(first.window.end).toBe(s.end); expect(runs.begin(s.date, NOW).code).toBe('scope_busy');
    expect(runs.finish(s.date, first.token, NOW + 1000, false)).toBe(true);
    expect(runs.begin(s.date, NOW + 4 * 60_000).code).toBe('retry_blocked');
    const retry = runs.begin(s.date, NOW + 6 * 60_000); if (retry.code !== 'started') throw Error('retry');
    expect(retry.window).toEqual(first.window); expect(retry.token).toBeGreaterThan(first.token); expect(runs.canWrite(s.date, first.token, NOW + 6 * 60_000)).toBe(false);
    expect(runs.finish(s.date, retry.token, NOW + 7 * 60_000, true)).toBe(true);
    expect(runs.begin(s.date, NOW + 60 * 60_000).code).toBe('retry_blocked');
  });
  it('allows only two retries; expired lease cannot write; midnight stops old D', () => {
    const runs = new SyntheticRuns(fresh()); const s = slot('2026-10-07');
    for (const minute of [0, 6, 22]) { const r = runs.begin(s.date, NOW + minute * 60_000); if (r.code !== 'started') throw Error('start'); runs.finish(s.date, r.token, NOW + minute * 60_000, false); }
    expect(runs.begin(s.date, NOW + 60 * 60_000).code).toBe('retry_blocked');
    expect(runs.begin(s.date, s.stop).code).toBe('retry_expired');
    expect(new SyntheticRuns(fresh()).begin(s.date, s.stop).code).toBe('missed_run');
    const late = new SyntheticRuns(fresh()); const r = late.begin(s.date, s.stop - 1000); if (r.code !== 'started') throw Error('start');
    expect(late.canWrite(s.date, r.token, s.stop)).toBe(false);
    expect(late.begin('2026-10-08', s.stop).code).toBe('too_early');
  });
  it('timed-out worker may retry after bounded backoff but cannot use old fence', () => {
    const runs = new SyntheticRuns(fresh()); const first = runs.begin('2026-10-07', NOW); if (first.code !== 'started') throw Error('start');
    expect(runs.canWrite(first.date, first.token, first.deadline)).toBe(false);
    expect(runs.begin(first.date, first.deadline).code).toBe('retry_blocked');
    const next = runs.begin(first.date, first.deadline + 5 * 60_000); if (next.code !== 'started') throw Error('retry');
    expect(next.window).toEqual(first.window); expect(runs.canWrite(first.date, first.token, first.deadline + 5 * 60_000)).toBe(false);
  });
  it('collector rejects expired/old/wrong-scope lease before any candidate mutations', () => {
    const inbox = fresh(); const runs = new SyntheticRuns(inbox); const first = runs.begin('2026-10-07', NOW); if (first.code !== 'started') throw Error('start');
    expect(collectRaw(inbox, first.date, [mail()], '1234', 'synthetic-card', first.deadline, { runs, token: first.token }).status).toBe('failed');
    expect(inbox.snapshot(OWNER)).toEqual([]);
    const now = first.deadline + 5 * 60_000; const next = runs.begin(first.date, now); if (next.code !== 'started') throw Error('retry');
    expect(collectRaw(inbox, first.date, [mail()], '1234', 'synthetic-card', now, { runs, token: first.token }).added).toBe(0);
    expect(collectRaw(inbox, first.date, [mail()], '1234', 'synthetic-card', now, { runs: new SyntheticRuns(fresh()), token: next.token }).added).toBe(0);
    const otherInbox = new SyntheticInbox('synthetic-owner-b', [], []);
    const foreignRuns = new SyntheticRuns(otherInbox); const foreign = foreignRuns.begin(first.date, now); if (foreign.code !== 'started') throw Error('foreign start');
    expect(foreignRuns.canWrite(first.date, foreign.token, now)).toBe(true);
    expect(collectRaw(inbox, first.date, [mail()], '1234', 'synthetic-card', now, { runs: foreignRuns, token: foreign.token }).status).toBe('failed');
    expect(inbox.snapshot(OWNER)).toEqual([]);
    expect(collectRaw(inbox, first.date, [mail()], '1234', 'synthetic-card', now, { runs, token: next.token }).added).toBe(1);
    const before = inbox.snapshot(OWNER);
    expect(collectRaw(inbox, first.date, [mail([row(), '損壞列'])], '1234', 'synthetic-card', now, { runs, token: first.token }, false).status).toBe('failed');
    expect(inbox.snapshot(OWNER)).toEqual(before);
  });
});

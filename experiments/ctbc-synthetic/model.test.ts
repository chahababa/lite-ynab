import { describe, expect, it } from 'vitest';
import { DAY, SyntheticInbox, type Action, type Command } from './model';
import { categories, payments, OWNER, NOW, history, draft } from './fixtures';
const fresh = (withHistory = false) => new SyntheticInbox(OWNER, structuredClone(categories), structuredClone(payments), withHistory ? history : []);
function command(inbox: SyntheticInbox, action: Action = 'import', changes: Partial<Command> = {}): Command {
  const c = inbox.snapshot(OWNER)[0];
  return { owner: OWNER, candidateId: c.id, version: c.version, key: 'synthetic-action', action, confirm: true, categoryId: 'food', paymentId: 'synthetic-card', ...changes };
}
const seeded = () => { const inbox = fresh(); inbox.add(draft(), NOW); return inbox; };

describe('synthetic ownership, five operations and idempotency', () => {
  it('imports exactly once on double click/retry, returns same ID and one minimal event', () => {
    const inbox = seeded(); const c = command(inbox);
    const result = inbox.act(c, NOW);
    expect(result).toMatchObject({ ok: true, status: 'imported' });
    expect(inbox.act(c, NOW + 1000)).toEqual(result);
    expect(inbox.personalTransactions(OWNER)).toHaveLength(1);
    expect(inbox.eventSnapshot()).toHaveLength(1);
    expect(JSON.stringify(inbox.eventSnapshot())).not.toContain('合成商店');
    expect(inbox.act({ ...c, action: 'work' }, NOW)).toEqual({ ok: false, code: 'key_conflict' });
  });
  it.each(['ignore', 'work', 'link', 'defer'] as Action[])('rejects a competing %s action at the same version', action => {
    const inbox = seeded(); const c = command(inbox);
    inbox.act(c, NOW);
    expect(inbox.act({ ...c, action, key: 'competing-key' }, NOW)).toEqual({ ok: false, code: 'stale_version' });
    expect(inbox.personalTransactions(OWNER)).toHaveLength(1);
  });
  it.each(['ignore', 'work', 'defer'] as Action[])('%s has no personal writes and idempotent event', action => {
    const inbox = seeded(); const c = command(inbox, action);
    const before = inbox.personalViews(OWNER);
    const result = inbox.act(c, NOW);
    expect(inbox.act(c, NOW + 1)).toEqual(result);
    expect(inbox.personalViews(OWNER)).toEqual(before);
    expect(inbox.eventSnapshot()).toHaveLength(1);
    expect(inbox.count(OWNER, NOW)).toBe(action === 'defer' ? 1 : 0);
  });
  it('links only selected existing transaction, never changes ledger, deleted link never reopens', () => {
    const inbox = fresh(true); inbox.add(draft(), NOW);
    const before = inbox.personalTransactions(OWNER);
    const c = command(inbox, 'link', { transactionId: history[0].id });
    const result = inbox.act(c, NOW);
    expect(result).toMatchObject({ ok: true, status: 'already_recorded', transactionId: history[0].id });
    expect(inbox.act(c, NOW + 1)).toEqual(result);
    expect(inbox.personalTransactions(OWNER)).toEqual(before);
    inbox.deletePersonalTransaction(OWNER, history[0].id);
    expect(inbox.snapshot(OWNER)[0].status).toBe('already_recorded');
    expect(inbox.count(OWNER, NOW)).toBe(0);
  });
  it('fails closed on foreign/missing/deleted existing links', () => {
    const inbox = fresh(true); inbox.add(draft(), NOW);
    expect(inbox.act(command(inbox, 'link'), NOW)).toEqual({ ok: false, code: 'conflict' });
    inbox.deletePersonalTransaction(OWNER, history[0].id);
    expect(inbox.act(command(inbox, 'link', { transactionId: history[0].id }), NOW).ok).toBe(false);
    expect(inbox.act(command(inbox, 'link', { transactionId: 'foreign-transaction' }), NOW).ok).toBe(false);
    expect(inbox.personalTransactions(OWNER)).toHaveLength(0);
  });
  it('an actual foreign-owned transaction is neither a match/suggestion nor link target', () => {
    const foreign = { ...history[0], id: 'synthetic-foreign-history', owner: 'synthetic-owner-b' };
    const inbox = new SyntheticInbox(OWNER, structuredClone(categories), structuredClone(payments), [foreign]);
    const d = draft('foreign-match', { merchant: foreign.merchant, amount: foreign.amount });
    inbox.add(d, NOW);
    expect(inbox.matches(d.detail)).toEqual([]); expect(inbox.suggestion(d.detail).categoryId).toBe('');
    expect(inbox.act(command(inbox, 'link', { transactionId: foreign.id }), NOW).ok).toBe(false);
    expect(inbox.personalTransactions('synthetic-owner-b')).toEqual([foreign]);
  });
  it.each([{ owner: 'synthetic-owner-b' }, { categoryId: '' }, { paymentId: '' }, { categoryId: 'other-owner-category' }, { paymentId: 'other-owner-payment' }, { confirm: false }])('rejects unauthorized/missing inputs %j', changes => {
    const inbox = seeded(); expect(inbox.act(command(inbox, 'import', changes), NOW).ok).toBe(false);
    expect(inbox.personalTransactions(OWNER)).toHaveLength(0);
    expect(inbox.eventSnapshot()).toHaveLength(0);
    expect(inbox.snapshot('synthetic-owner-b')).toEqual([]);
  });
  it('revalidates deleted category/payment at submit', () => {
    const inbox = seeded(); const c = command(inbox);
    inbox.categories.splice(0, 1);
    expect(inbox.act(c, NOW).ok).toBe(false);
    const other = seeded(); const otherC = command(other);
    other.payments.splice(0, 1);
    expect(other.act(otherC, NOW).ok).toBe(false);
  });
  it('keeps defer conflict, warnings and original retention deadline', () => {
    const inbox = fresh(); inbox.add(draft('risky', { warnings: ['merchant_unknown'] }), NOW);
    expect(inbox.act(command(inbox, 'defer'), NOW + DAY)).toMatchObject({ status: 'conflict' });
    expect(inbox.snapshot(OWNER)[0]).toMatchObject({ createdAt: NOW, version: 2, status: 'conflict', detail: { warnings: ['merchant_unknown'] } });
    expect(inbox.act(command(inbox, 'import', { key: 'resolve' }), NOW + DAY).ok).toBe(false);
    expect(inbox.act(command(inbox, 'import', { key: 'resolve', resolveRisk: true }), NOW + DAY).ok).toBe(true);
  });
  it.each(['import', 'link', 'ignore', 'work'] as Action[])('conflict %s requires a distinct risk decision; rejection has zero mutations', action => {
    const inbox = fresh(true); inbox.add(draft('risk', { merchant: null, warnings: ['merchant_unknown'] }), NOW);
    const c = command(inbox, action, { transactionId: history[0].id, resolveRisk: false });
    const before = { candidates: inbox.snapshot(OWNER), events: inbox.eventSnapshot(), ledger: inbox.personalViews(OWNER) };
    expect(inbox.act(c, NOW)).toEqual({ ok: false, code: 'risk_confirmation_required' });
    expect({ candidates: inbox.snapshot(OWNER), events: inbox.eventSnapshot(), ledger: inbox.personalViews(OWNER) }).toEqual(before);
    expect(inbox.act({ ...c, resolveRisk: true }, NOW).ok).toBe(true);
    expect(inbox.eventSnapshot()).toHaveLength(1);
    expect(inbox.personalTransactions(OWNER)).toHaveLength(action === 'import' ? 2 : 1);
  });
  it('defer without risk decision retains conflict, warning and original expiry', () => {
    const inbox = fresh(); inbox.add(draft('risk', { warnings: ['partial_batch'] }), NOW);
    const c = command(inbox, 'defer', { resolveRisk: false });
    expect(inbox.act(c, NOW + DAY)).toMatchObject({ ok: true, status: 'conflict' });
    expect(inbox.snapshot(OWNER)[0]).toMatchObject({ status: 'conflict', version: 2, createdAt: NOW, detail: { warnings: ['partial_batch'] } });
    expect(inbox.eventSnapshot()).toHaveLength(1); expect(inbox.personalTransactions(OWNER)).toEqual([]);
    inbox.retain(NOW + 30 * DAY); expect(inbox.snapshot(OWNER)[0].status).toBe('expired');
  });
  it('payload conflict preserves payload, blocks import even with risk decision, no repeated version increment', () => {
    const inbox = seeded(); const changed = draft('synthetic-source-1', { amount: 999 });
    expect(inbox.add(changed, NOW)).toBe('payload_conflict');
    const before = inbox.snapshot(OWNER)[0];
    expect(before.detail?.amount).toBe(120);
    expect(inbox.add(changed, NOW)).toBe('payload_conflict');
    expect(inbox.snapshot(OWNER)[0].version).toBe(before.version);
    expect(inbox.act(command(inbox, 'import', { resolveRisk: true }), NOW)).toEqual({ ok: false, code: 'identity_unresolved' });
  });
  it.each(['import', 'ignore', 'work'] as Action[])('terminal %s cannot be relabeled work/defer, rescan never resurrects', action => {
    const inbox = seeded(); inbox.act(command(inbox, action), NOW);
    const before = inbox.personalViews(OWNER);
    expect(inbox.add(draft(), NOW + DAY)).toBe('existing');
    expect(inbox.act(command(inbox, 'defer', { key: 'later' }), NOW).ok).toBe(false);
    expect(inbox.act(command(inbox, 'work', { key: 'work' }), NOW).ok).toBe(false);
    expect(inbox.personalViews(OWNER)).toEqual(before);
  });
});

describe('comparison, suggestions, batches and retention', () => {
  it('matches same owner/payment/date ±1 day; amount mismatch explicit; unknown payment has no match', () => {
    const inbox = fresh(true);
    expect(inbox.matches(draft('', { merchant: '合成餐館', amount: 230 }).detail)[0].reason).toBe('amount_mismatch');
    expect(inbox.matches(draft('', { amount: 180, occurredAt: '2026-10-05T23:59:00+08:00' }).detail)[0].reason).toBe('possible_duplicate');
    expect(inbox.matches(draft('', { amount: 180, paymentId: null }).detail)).toEqual([]);
    expect(inbox.matches(draft('', { amount: 180, paymentId: 'synthetic-cash' }).detail)).toEqual([]);
    expect(inbox.matches(draft('', { amount: 180, occurredAt: '2026-10-04T23:59:00+08:00' }).detail)).toEqual([]);
  });
  it('suggestions require consistent owner history; can override without approving automatically', () => {
    const inbox = fresh(true); const d = draft('', { merchant: '合成餐館', amount: 300 });
    expect(inbox.suggestion(d.detail)).toMatchObject({ categoryId: 'food', paymentId: 'synthetic-card' });
    expect(inbox.suggestion(draft().detail).categoryId).toBe('');
    expect(inbox.suggestion(draft('', { merchant: null }).detail).categoryId).toBe('');
    inbox.add(d, NOW);
    expect(inbox.personalTransactions(OWNER)).toHaveLength(1);
    expect(inbox.act(command(inbox, 'import', { categoryId: 'transport', paymentId: 'synthetic-cash', resolveRisk: true }), NOW).ok).toBe(true);
    expect(inbox.personalTransactions(OWNER)[1].categoryId).toBe('transport');
  });
  it('cross-message identical expenses stay two candidates with conflict hint', () => {
    const inbox = seeded(); inbox.add(draft('synthetic-other-message'), NOW);
    expect(inbox.snapshot(OWNER)).toHaveLength(2);
    expect(inbox.snapshot(OWNER)[1].detail?.warnings).toContain('cross_message_duplicate');
  });
  it('safe explicit batch retries preserve one transaction/event per candidate', () => {
    const inbox = seeded(); inbox.add(draft('second', { amount: 35 }), NOW);
    const commands = inbox.snapshot(OWNER).map(c => command(inbox, 'import', { candidateId: c.id, version: c.version, key: c.id }));
    expect(inbox.batchPreview(commands, NOW)).toBe(true);
    const results = inbox.batch(commands, NOW);
    expect(inbox.batch(commands, NOW)).toEqual(results);
    expect(inbox.personalTransactions(OWNER)).toHaveLength(2);
    expect(inbox.eventSnapshot()).toHaveLength(2);
  });
  it('blocks risk/missing/foreign/stale/duplicate batch selection', () => {
    const inbox = seeded(); const safe = command(inbox);
    expect(inbox.batchPreview([], NOW)).toBe(false);
    expect(inbox.batchPreview([safe, safe], NOW)).toBe(false);
    expect(inbox.batchPreview([{ ...safe, version: 0 }], NOW)).toBe(false);
    expect(inbox.batchPreview([{ ...safe, paymentId: 'other-owner-payment' }], NOW)).toBe(false);
    inbox.add(draft('risk', { warnings: ['partial_batch'] }), NOW);
    const risk = inbox.snapshot(OWNER)[1];
    expect(inbox.batch([{ ...safe, candidateId: risk.id }], NOW)[0].ok).toBe(false);
    expect(inbox.personalTransactions(OWNER)).toHaveLength(0);
  });
  it('preview does not bypass a competing decision before submission', () => {
    const inbox = seeded(); const c = command(inbox);
    expect(inbox.batchPreview([c], NOW)).toBe(true);
    inbox.act({ ...c, key: 'other', action: 'work' }, NOW);
    expect(inbox.batch([c], NOW)[0].ok).toBe(false);
    expect(inbox.personalTransactions(OWNER)).toEqual([]);
  });
  it('30 days expire pending/conflict immediately, defer/rescan do not reset deadline', () => {
    const inbox = seeded(); inbox.act(command(inbox, 'defer'), NOW + 29 * DAY);
    expect(inbox.add(draft(), NOW + 29 * DAY)).toBe('existing');
    inbox.retain(NOW + 30 * DAY - 1);
    expect(inbox.count(OWNER, NOW + 30 * DAY - 1)).toBe(1);
    inbox.retain(NOW + 30 * DAY);
    expect(inbox.snapshot(OWNER)[0]).toMatchObject({ status: 'expired', closedAt: NOW + 30 * DAY });
    expect(inbox.snapshot(OWNER)[0].detail).toBeUndefined();
    expect(JSON.stringify(inbox.snapshot(OWNER))).not.toContain('合成商店');
  });
  it('7 day cleanup and 90 day shell/event purge preserve ledger', () => {
    const inbox = seeded(); inbox.act(command(inbox), NOW);
    const ledger = inbox.personalViews(OWNER);
    inbox.retain(NOW + 7 * DAY - 1); expect(inbox.snapshot(OWNER)[0].detail).toBeDefined();
    inbox.retain(NOW + 7 * DAY); expect(inbox.snapshot(OWNER)[0].detail).toBeUndefined();
    expect(JSON.stringify(inbox.snapshot(OWNER))).not.toContain('合成商店');
    expect(inbox.add(draft(), NOW + 8 * DAY)).toBe('existing');
    inbox.retain(NOW + 90 * DAY - 1); expect(inbox.snapshot(OWNER)).toHaveLength(1);
    inbox.retain(NOW + 90 * DAY); expect(inbox.snapshot(OWNER)).toEqual([]); expect(inbox.eventSnapshot()).toEqual([]);
    expect(inbox.personalViews(OWNER)).toEqual(ledger);
  });
  it('expired shell purges at original deadline +90 days, even after late cleanup', () => {
    const inbox = seeded(); inbox.retain(NOW + 121 * DAY);
    expect(inbox.snapshot(OWNER)).toEqual([]);
  });
});

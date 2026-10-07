// SYNTHETIC EXPERIMENT ONLY. No authentication, database, storage or network.
export const DAY = 86_400_000;
export type Status = 'needs_review' | 'conflict' | 'imported' | 'already_recorded' | 'ignored' | 'work_excluded' | 'expired';
export type Action = 'import' | 'link' | 'ignore' | 'defer' | 'work';
export type Detail = {
  occurredAt: string; amount: number; merchant: string | null; product: string;
  role: 'primary' | 'supplementary' | 'unknown'; bankCategory: string | null;
  paymentId: string | null; warnings: string[]; late: boolean;
};
export type Draft = { sourceId: string; detail: Detail };
export type Candidate = {
  id: string; owner: string; sourceId: string; payload: string; status: Status;
  version: number; createdAt: number; closedAt?: number; detail?: Detail;
  transactionId?: string; identityConflict: boolean;
};
export type Owned = { id: string; owner: string; label: string };
export type Transaction = { id: string; owner: string; occurredAt: string; amount: number; merchant: string | null; categoryId: string; paymentId: string };
export type Command = {
  owner: string; candidateId: string; version: number; key: string; action: Action;
  categoryId?: string; paymentId?: string; transactionId?: string; confirm: boolean;
  resolveRisk?: boolean;
};
type Result = { ok: true; status: Status; transactionId?: string } | { ok: false; code: string };
type Event = { candidateId: string; owner: string; at: number; version: number; code: string };
const pending = (c: Candidate) => c.status === 'needs_review' || c.status === 'conflict';
// Non-security checksum of SYNTHETIC payload only; never a production identity/hash design.
const signature = (detail: Detail) => {
  const value = JSON.stringify([detail.occurredAt, detail.amount, detail.merchant, detail.product, detail.role, detail.bankCategory]);
  let checksum = 2166136261;
  for (let i = 0; i < value.length; i++) checksum = Math.imul(checksum ^ value.charCodeAt(i), 16777619);
  return `synthetic-checksum-${checksum >>> 0}`;
};
const codes: Record<Action, string> = { import: 'personal_imported', link: 'existing_transaction_linked', ignore: 'candidate_ignored', defer: 'review_deferred', work: 'work_expense_excluded' };

export class SyntheticInbox {
  private candidates: Candidate[] = [];
  private events: Event[] = [];
  private replay = new Map<string, { command: string; result: Result; candidateId: string }>();
  private ledger: Transaction[];
  private sequence = 0;
  private runBatches = new Map<string, { members: Set<string>; partial: boolean; createdAt: number }>();
  constructor(readonly owner: string, readonly categories: Owned[], readonly payments: Owned[], transactions: Transaction[] = []) {
    this.ledger = structuredClone(transactions);
  }
  snapshot(owner: string) { return structuredClone(this.candidates.filter(c => c.owner === owner)); }
  eventSnapshot() { return structuredClone(this.events); }
  // One protected inbox object + scheduler D is one logical synthetic run batch.
  // Retries share membership and sticky risk; only IDs/flags/time are retained here.
  finishRunBatch(date: string, sourceIds: string[], failed: boolean, now: number) {
    const batch = this.runBatches.get(date) ?? { members: new Set<string>(), partial: false, createdAt: now };
    for (const c of this.candidates) if (sourceIds.includes(c.sourceId)) batch.members.add(c.id);
    batch.partial ||= failed;
    this.runBatches.set(date, batch);
    if (batch.partial) for (const c of this.candidates) {
      if (batch.members.has(c.id) && c.detail) this.existing({ sourceId: c.sourceId, detail: { ...c.detail, warnings: [...new Set([...c.detail.warnings, 'partial_batch'])] } });
    }
    return batch.partial;
  }
  personalTransactions(owner: string) { return structuredClone(this.ledger.filter(t => t.owner === owner)); }
  deletePersonalTransaction(owner: string, id: string) { this.ledger = this.ledger.filter(t => t.owner !== owner || t.id !== id); }
  // Every mock personal surface derives exclusively from ledger, never candidates.
  personalViews(owner: string) {
    const rows = this.personalTransactions(owner);
    return { budget: rows.reduce((n, t) => n + t.amount, 0), list: rows, analysis: rows, report: rows, csv: JSON.stringify(rows), backup: JSON.stringify(rows) };
  }
  count(owner: string, now: number) { return this.snapshot(owner).filter(c => pending(c) && now < c.createdAt + 30 * DAY).length; }
  existing(draft: Draft) {
    const c = this.candidates.find(c => c.owner === this.owner && c.sourceId === draft.sourceId);
    if (!c) return null;
    if (c.payload !== signature(draft.detail)) {
      if (!c.identityConflict) {
        c.identityConflict = true;
        if (pending(c)) { c.status = 'conflict'; c.version++; }
      }
      return 'payload_conflict' as const;
    }
    // Replay preserves payload/retention, but newly observed risk is monotonic.
    // Never refill scrubbed detail or reopen terminal shells.
    if (c.detail) {
      const added = draft.detail.warnings.filter(w => !c.detail!.warnings.includes(w));
      if (added.length) {
        c.detail.warnings.push(...new Set(added));
        c.version++;
        if (pending(c)) c.status = 'conflict';
      }
    }
    return 'existing' as const;
  }
  add(draft: Draft, now: number) {
    const existing = this.existing(draft);
    if (existing) return existing;
    const detail = structuredClone(draft.detail);
    const matches = this.matches(detail);
    for (const match of matches) if (!detail.warnings.includes(match.reason)) detail.warnings.push(match.reason);
    // Cross-message candidate matches are hints too, never automatic deduplication.
    if (this.candidates.some(c => c.detail && c.detail.paymentId && c.detail.paymentId === detail.paymentId && c.detail.amount === detail.amount && c.detail.occurredAt.slice(0, 10) === detail.occurredAt.slice(0, 10))) detail.warnings.push('cross_message_duplicate');
    this.candidates.push({ id: `synthetic-candidate-${++this.sequence}`, owner: this.owner, sourceId: draft.sourceId, payload: signature(detail), status: detail.warnings.length ? 'conflict' : 'needs_review', version: 1, createdAt: now, detail, identityConflict: false });
    return 'added' as const;
  }
  matches(detail: Detail) {
    if (!detail.paymentId) return [];
    return this.personalTransactions(this.owner).filter(t => t.paymentId === detail.paymentId && Math.abs(Date.parse(t.occurredAt.slice(0, 10)) - Date.parse(detail.occurredAt.slice(0, 10))) <= DAY && (t.amount === detail.amount || (detail.merchant !== null && t.merchant === detail.merchant))).map(t => ({ ...t, reason: t.amount === detail.amount ? 'possible_duplicate' : 'amount_mismatch' }));
  }
  suggestion(detail: Detail) {
    const history = detail.merchant && detail.paymentId ? this.personalTransactions(this.owner).filter(t => t.merchant === detail.merchant && t.paymentId === detail.paymentId && this.categories.some(c => c.owner === this.owner && c.id === t.categoryId) && this.payments.some(p => p.owner === this.owner && p.id === t.paymentId)) : [];
    const choices = new Set(history.map(t => t.categoryId));
    return history.length && choices.size === 1 ? { categoryId: history[0].categoryId, paymentId: history[0].paymentId, reason: '本人同商家與支付來源的合成歷史；仍須確認' } : { categoryId: '', paymentId: '', reason: '合成資料不足，請選擇' };
  }
  act(command: Command, now: number): Result {
    this.retain(now);
    const c = this.candidates.find(c => c.id === command.candidateId && c.owner === command.owner);
    if (!c || command.owner !== this.owner) return { ok: false, code: 'conflict' };
    const key = `${command.owner}:${command.key}`;
    const encoded = JSON.stringify(command);
    const saved = this.replay.get(key);
    if (saved) return saved.command === encoded ? structuredClone(saved.result) : { ok: false, code: 'key_conflict' };
    if (!command.key || !command.confirm) return { ok: false, code: 'confirmation_required' };
    if (c.version !== command.version) return { ok: false, code: 'stale_version' };
    if (!pending(c)) return { ok: false, code: 'terminal' };
    if (command.action === 'import' && c.identityConflict) return { ok: false, code: 'identity_unresolved' };
    if (command.action !== 'defer' && c.status === 'conflict' && !command.resolveRisk) return { ok: false, code: 'risk_confirmation_required' };
    if (command.action === 'import' && (!this.categories.some(x => x.owner === command.owner && x.id === command.categoryId) || !this.payments.some(x => x.owner === command.owner && x.id === command.paymentId))) return { ok: false, code: 'category_payment_required' };
    if (command.action === 'link' && !this.ledger.some(t => t.owner === command.owner && t.id === command.transactionId)) return { ok: false, code: 'conflict' };
    // Synchronous in-memory critical section. This is NOT a Postgres/RPC race proof.
    if (command.action === 'import') {
      const d = c.detail!;
      c.transactionId = `synthetic-transaction-${++this.sequence}`;
      this.ledger.push({ id: c.transactionId, owner: command.owner, occurredAt: d.occurredAt, amount: d.amount, merchant: d.merchant, categoryId: command.categoryId!, paymentId: command.paymentId! });
      c.status = 'imported';
    } else if (command.action === 'link') { c.status = 'already_recorded'; c.transactionId = command.transactionId; }
    else if (command.action === 'ignore') c.status = 'ignored';
    else if (command.action === 'work') c.status = 'work_excluded';
    if (command.action !== 'defer') c.closedAt = now;
    c.version++;
    this.events.push({ candidateId: c.id, owner: c.owner, at: now, version: c.version, code: codes[command.action] });
    const result: Result = { ok: true, status: c.status, transactionId: c.transactionId };
    this.replay.set(key, { command: encoded, result, candidateId: c.id });
    return structuredClone(result);
  }
  batchPreview(commands: Command[], now: number) {
    this.retain(now);
    if (!commands.length || new Set(commands.map(c => c.candidateId)).size !== commands.length || new Set(commands.map(c => c.key)).size !== commands.length) return false;
    return commands.every(command => {
      const c = this.candidates.find(c => c.id === command.candidateId && c.owner === command.owner);
      const saved = this.replay.get(`${command.owner}:${command.key}`);
      if (saved?.command === JSON.stringify(command) && saved.result.ok && saved.result.status === 'imported') return true;
      return command.action === 'import' && command.owner === this.owner && command.confirm && command.categoryId === commands[0].categoryId && command.paymentId === commands[0].paymentId && this.categories.some(x => x.owner === command.owner && x.id === command.categoryId) && this.payments.some(x => x.owner === command.owner && x.id === command.paymentId) && c?.status === 'needs_review' && c.version === command.version && !c.identityConflict && c.detail?.warnings.length === 0;
    });
  }
  batch(commands: Command[], now: number) {
    if (!this.batchPreview(commands, now)) return commands.map(() => ({ ok: false, code: 'batch_blocked' } as Result));
    return commands.map(command => this.act(command, now));
  }
  retain(now: number) {
    for (const c of this.candidates) {
      if (pending(c) && now >= c.createdAt + 30 * DAY) { c.status = 'expired'; c.closedAt = c.createdAt + 30 * DAY; c.version++; delete c.detail; }
      if (c.closedAt !== undefined && now >= c.closedAt + 7 * DAY) delete c.detail;
    }
    const purged = new Set(this.candidates.filter(c => c.closedAt !== undefined && now >= c.closedAt + 90 * DAY).map(c => c.id));
    this.candidates = this.candidates.filter(c => !purged.has(c.id));
    this.events = this.events.filter(e => !purged.has(e.candidateId));
    for (const [key, value] of this.replay) if (purged.has(value.candidateId)) this.replay.delete(key);
    for (const [date, batch] of this.runBatches) {
      for (const id of purged) batch.members.delete(id);
      // Bound non-financial mock run metadata to maximum pending + shell lifetime.
      if (now >= batch.createdAt + 120 * DAY) this.runBatches.delete(date);
    }
  }
}

import { SyntheticInbox, type Draft, type Owned, type Transaction } from './model';
export const OWNER = 'synthetic-owner-a';
export const NOW = Date.parse('2026-10-07T17:10:00+08:00');
export const categories: Owned[] = [{ id: 'food', owner: OWNER, label: '餐飲' }, { id: 'transport', owner: OWNER, label: '交通' }, { id: 'other-owner-category', owner: 'synthetic-owner-b', label: '其他人的分類' }];
export const payments: Owned[] = [{ id: 'synthetic-card', owner: OWNER, label: '合成信用卡' }, { id: 'synthetic-cash', owner: OWNER, label: '合成現金' }, { id: 'other-owner-payment', owner: 'synthetic-owner-b', label: '其他人的支付方式' }];
export const history: Transaction[] = [{ id: 'synthetic-history-1', owner: OWNER, occurredAt: '2026-10-06T12:00:00+08:00', amount: 180, merchant: '合成餐館', categoryId: 'food', paymentId: 'synthetic-card' }];
export function draft(id = 'synthetic-source-1', changes: Partial<Draft['detail']> = {}): Draft {
  return { sourceId: id, detail: { occurredAt: '2026-10-06T09:00:00+08:00', amount: 120, merchant: '合成商店', product: '合成卡產品', role: 'primary', bankCategory: '餐飲', paymentId: 'synthetic-card', warnings: [], late: false, ...changes } };
}
export function demo() {
  const inbox = new SyntheticInbox(OWNER, structuredClone(categories), structuredClone(payments), history);
  inbox.add(draft('synthetic-source-1', { merchant: '合成餐館', amount: 180 }), NOW);
  inbox.add(draft('synthetic-source-2', { merchant: null, warnings: ['merchant_unknown'], late: true, occurredAt: '2026-10-04T11:00:00+08:00' }), NOW);
  inbox.add(draft('synthetic-source-3', { merchant: '合成通勤', bankCategory: '交通', amount: 35 }), NOW);
  inbox.add(draft('synthetic-source-4', { merchant: '合成工作採購', amount: 260 }), NOW);
  inbox.add(draft('synthetic-source-5', { merchant: '合成餐館', amount: 230 }), NOW);
  return inbox;
}

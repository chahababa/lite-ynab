// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { SyntheticInbox, type Action } from './model';
import { categories, payments, history, draft, NOW, OWNER, demo } from './fixtures';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const single = (risk = false) => { const inbox = new SyntheticInbox(OWNER, structuredClone(categories), structuredClone(payments), history); inbox.add(draft('ui-one', { warnings: risk ? ['merchant_unknown'] : [] }), NOW); return inbox; };
describe('synthetic inbox accessible operations and network spy', () => {
  it.each(['import', 'link', 'ignore', 'defer', 'work'] as Action[])('keyboard can complete %s with zero fetch/XHR/WS', async action => {
    const fetchSpy = vi.fn(() => { throw Error('network_forbidden'); });
    const xhrSpy = vi.fn(() => { throw Error('network_forbidden'); });
    const wsSpy = vi.fn(() => { throw Error('network_forbidden'); });
    vi.stubGlobal('fetch', fetchSpy); vi.stubGlobal('XMLHttpRequest', xhrSpy); vi.stubGlobal('WebSocket', wsSpy);
    const inbox = single(); render(<App initialInbox={inbox} />);
    const user = userEvent.setup();
    const article = screen.getByRole('article'); const row = within(article);
    expect(screen.getByText(/資料只在記憶體；重整會重置/)).toBeInTheDocument();
    if (action === 'import') { await user.selectOptions(row.getByLabelText('分類'), 'food'); await user.selectOptions(row.getByLabelText('支付方式'), 'synthetic-card'); }
    if (action === 'link') await user.selectOptions(row.getByLabelText('已記過：選擇本人既有交易'), history[0].id);
    const confirm = row.getByLabelText('確認本次所選操作'); confirm.focus(); await user.keyboard(' ');
    const label = { import: '補記私人支出', link: '已記過', ignore: '忽略', defer: '稍後處理', work: '工作支出／排除' }[action];
    const button = row.getByRole('button', { name: label }); button.focus(); await user.keyboard('{Enter}');
    expect(inbox.snapshot(OWNER)[0].status).toBe({ import: 'imported', link: 'already_recorded', ignore: 'ignored', defer: 'needs_review', work: 'work_excluded' }[action]);
    expect(inbox.personalTransactions(OWNER)).toHaveLength(action === 'import' ? 2 : 1);
    expect(fetchSpy).not.toHaveBeenCalled(); expect(xhrSpy).not.toHaveBeenCalled(); expect(wsSpy).not.toHaveBeenCalled();
  });
  it('missing category/payment/link blocks submit; owner resources hidden; risky batch disabled', async () => {
    render(<App initialInbox={single(true)} />); const user = userEvent.setup(); const row = within(screen.getByRole('article'));
    await user.click(row.getByLabelText('確認本次所選操作'));
    expect(row.getByRole('button', { name: '補記私人支出' })).toBeDisabled();
    expect(row.getByRole('button', { name: '已記過' })).toBeDisabled();
    expect(row.getByRole('checkbox', { name: /批次選取/ })).toBeDisabled();
    expect(screen.queryByText('其他人的分類')).not.toBeInTheDocument();
    expect(screen.queryByText('其他人的支付方式')).not.toBeInTheDocument();
  });
  it('suggestions can be adopted and overridden without writing; only explicit batch summary confirms', async () => {
    const inbox = demo(); render(<App initialInbox={inbox} />); const user = userEvent.setup();
    const risk = within(screen.getByRole('article', { name: '合成餐館 NT$ 180 需人工核對' }));
    await user.click(risk.getByRole('button', { name: '採用建議' }));
    expect(risk.getByLabelText('分類')).toHaveValue('food');
    await user.selectOptions(risk.getByLabelText('分類'), 'transport');
    expect(inbox.personalTransactions(OWNER)).toHaveLength(1);
    await user.click(screen.getByRole('checkbox', { name: '批次選取 合成通勤' }));
    await user.selectOptions(screen.getByLabelText('批次分類'), 'transport');
    await user.selectOptions(screen.getByLabelText('批次支付方式'), 'synthetic-card');
    await user.click(screen.getByRole('button', { name: '查看提交摘要' }));
    expect(screen.getByRole('group', { name: '提交摘要' })).toHaveTextContent('將補記 1 筆');
    expect(inbox.personalTransactions(OWNER)).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: '確認批次補記' }));
    expect(inbox.personalTransactions(OWNER)).toHaveLength(2);
  });
  it('run status/partial warning preserve pending; work exclusion leaves all personal views unchanged', async () => {
    const inbox = single(); const before = inbox.personalViews(OWNER); render(<App initialInbox={inbox} />); const user = userEvent.setup();
    for (const state of ['loading', 'never_run', 'failed', 'no_message', 'zero_new_candidates', 'missed_run', 'partial_failure']) {
      await user.selectOptions(screen.getByLabelText('合成收集狀態'), state);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('1 筆');
    }
    const row = within(screen.getByRole('article')); await user.click(row.getByLabelText('確認本次所選操作')); await user.click(row.getByRole('button', { name: '工作支出／排除' }));
    expect(screen.getByRole('alert')).toHaveTextContent('部分失敗');
    expect(inbox.personalViews(OWNER)).toEqual(before); expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('0 筆');
  });
});

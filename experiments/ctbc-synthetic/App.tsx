import { useState } from 'react';
import { demo, NOW, OWNER } from './fixtures';
import type { Action, Candidate, Command, SyntheticInbox } from './model';

const labels = { needs_review: '待確認', conflict: '需人工核對', imported: '已補記', already_recorded: '已連結既有交易', ignored: '已忽略', work_excluded: '已排除個人帳', expired: '已到期' };
const feedback: Record<Action, string> = { import: '已補記一筆合成交易，尚未與月結帳單核對', link: '已連結既有合成交易', ignore: '已忽略，不會補記', defer: '保留待處理，期限不延長', work: '已排除，不列入合成個人帳本' };
const warningLabels: Record<string, string> = { possible_duplicate: '可能已記過', cross_message_duplicate: '不同通知可能重複', amount_mismatch: '金額需核對', merchant_unknown: '商家未明', partial_batch: '所屬批次部分失敗' };
type RunState = 'ready' | 'loading' | 'never_run' | 'missed_run' | 'no_message' | 'zero_new_candidates' | 'partial_failure' | 'failed';
const runLabels: Record<RunState, string> = { ready: '合成掃描完成；不代表完整蒐集或核帳', loading: '載入合成預覽中；既有待辦保留', never_run: '尚未成功執行', missed_run: '應跑但未跑，需另案受控補捕', no_message: '未找到符合條件通知，不代表零支出', zero_new_candidates: '本次沒有新增候選；前次待辦保留', partial_failure: '部分失敗：1 列解析失敗；成功列處理完仍保留警示', failed: '收集失敗，未能確認' };

function Row({ candidate: c, inbox, onChange, onSelect, selected }: { candidate: Candidate; inbox: SyntheticInbox; onChange: (text: string) => void; onSelect: (id: string, value: boolean) => void; selected: boolean }) {
  const [categoryId, setCategory] = useState('');
  const [paymentId, setPayment] = useState('');
  const [transactionId, setTransaction] = useState('');
  const [resolveRisk, setResolve] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const d = c.detail;
  const active = c.status === 'needs_review' || c.status === 'conflict';
  const suggestion = d ? inbox.suggestion(d) : null;
  const matches = d && active ? inbox.matches(d) : [];
  async function submit(action: Action) {
    setBusy(true);
    await Promise.resolve();
    const command: Command = { owner: OWNER, candidateId: c.id, version: c.version, key: `ui:${c.id}:${c.version}:${action}`, action, categoryId, paymentId, transactionId, confirm, resolveRisk };
    const result = inbox.act(command, NOW);
    setBusy(false);
    setConfirm(false);
    onChange(result.ok ? feedback[action] : ({ stale_version: '版本已變更，請重新檢查', category_payment_required: '請選擇本人分類與支付方式', confirmation_required: '請勾選確認本次操作', risk_confirmation_required: '請先核對並確認警告', conflict: '既有交易已失效，請重新選擇' }[result.code] ?? '操作被阻擋，請重新核對'));
  }
  return <article className="card" aria-label={`${d?.merchant ?? '商家未明'} NT$ ${d?.amount ?? 0} ${labels[c.status]}`}>
    <div className="row-heading"><h2>{d?.merchant ?? '商家未明'}</h2><span className="chip">{labels[c.status]}</span></div>
    {d && <><p className="num expense">NT$ {d.amount.toLocaleString('zh-TW')}</p><p>{d.occurredAt.slice(0, 16).replace('T', ' ')}{d.late ? ' · 晚到通知' : ''}</p><p>{d.product} · {d.role === 'primary' ? '正卡' : d.role === 'supplementary' ? '附卡' : '卡別未明'}</p></>}
    <p className="muted">授權通知，尚未與月結帳單核對</p>
    {!!d?.warnings.length && <p className="warning">{d.warnings.map(w => warningLabels[w] ?? '需人工核對').join('；')}</p>}
    {!!matches.length && <ul>{matches.map(t => <li key={t.id}>{t.reason === 'amount_mismatch' ? '金額需核對' : '可能已記過'}：{t.merchant ?? '商家未明'} <span className="num">NT$ {t.amount}</span>（同支付來源／日期 ±1 日）</li>)}</ul>}
    {active ? <fieldset disabled={busy}><legend>選擇分類與處置</legend>
      <p>{suggestion?.reason}</p><button type="button" disabled={!suggestion?.categoryId} onClick={() => { setCategory(suggestion!.categoryId); setPayment(suggestion!.paymentId); }}>採用建議</button>
      <label>分類<select value={categoryId} onChange={e => setCategory(e.target.value)}><option value="">請選擇</option>{inbox.categories.filter(x => x.owner === OWNER).map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
      <label>支付方式<select value={paymentId} onChange={e => setPayment(e.target.value)}><option value="">請選擇</option>{inbox.payments.filter(x => x.owner === OWNER).map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
      <label>已記過：選擇本人既有交易<select value={transactionId} onChange={e => setTransaction(e.target.value)}><option value="">請選擇</option>{inbox.personalTransactions(OWNER).map(t => <option key={t.id} value={t.id}>{t.merchant ?? '商家未明'} · NT$ {t.amount}</option>)}</select></label>
      {c.status === 'conflict' && <label className="check"><input type="checkbox" checked={resolveRisk} onChange={e => setResolve(e.target.checked)} />我已核對上述警告，單筆決議</label>}
      <label className="check"><input type="checkbox" checked={confirm} onChange={e => setConfirm(e.target.checked)} />確認本次所選操作</label>
      <div className="actions">{([['import', '補記私人支出'], ['link', '已記過'], ['ignore', '忽略'], ['defer', '稍後處理'], ['work', '工作支出／排除']] as const).map(([action, label]) => <button key={action} type="button" disabled={!confirm || busy || (c.status === 'conflict' && action !== 'defer' && !resolveRisk) || (action === 'import' && (!categoryId || !paymentId || c.identityConflict)) || (action === 'link' && !transactionId)} onClick={() => void submit(action)}>{label}</button>)}</div>
      <label className="check"><input type="checkbox" aria-label={`批次選取 ${d?.merchant ?? '商家未明'}`} checked={selected} disabled={c.status !== 'needs_review' || !!d?.warnings.length} onChange={e => onSelect(c.id, e.target.checked)} />勾選安全候選作批次補記</label>
    </fieldset> : <><p>{c.status === 'work_excluded' ? '此筆不列入個人預算、交易、報表或匯出' : '已結案，重掃不會重新開啟'}</p>{c.status === 'already_recorded' && !inbox.personalTransactions(OWNER).some(t => t.id === c.transactionId) && <p className="warning">原連結交易已不存在，請人工檢查；不會自動補記</p>}</>}
  </article>;
}

export function App({ initialInbox }: { initialInbox?: SyntheticInbox }) {
  const [inbox, setInbox] = useState(() => initialInbox ?? demo());
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState('');
  const [run, setRun] = useState<RunState>('ready');
  const [selected, setSelected] = useState<string[]>([]);
  const [categoryId, setCategory] = useState('');
  const [paymentId, setPayment] = useState('');
  const [preview, setPreview] = useState<Command[] | null>(null);
  const candidates = inbox.snapshot(OWNER).sort((a, b) => Number(b.status === 'conflict') - Number(a.status === 'conflict'));
  function change(text: string) { setNotice(text); setRevision(n => n + 1); setPreview(null); setSelected([]); }
  function prepare() {
    const commands: Command[] = selected.map(id => ({ owner: OWNER, candidateId: id, version: candidates.find(c => c.id === id)!.version, key: `batch:${revision}:${id}`, action: 'import', categoryId, paymentId, confirm: true }));
    if (inbox.batchPreview(commands, NOW)) setPreview(commands); else setNotice('批次被阻擋：請勾選安全候選並選本人分類及支付方式');
  }
  return <main>
    <header><p className="badge">合成預覽</p><h1>待確認交易 <span className="num">{inbox.count(OWNER, NOW)}</span> 筆</h1><p>不會讀取 Email 或新增正式交易。資料只在記憶體；重整會重置。</p></header>
    <section className="card"><label>合成收集狀態<select value={run} onChange={e => setRun(e.target.value as RunState)}>{Object.entries(runLabels).map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label><p role={run === 'partial_failure' || run === 'failed' || run === 'missed_run' ? 'alert' : 'status'}>{runLabels[run]}</p><p>合成排程槽 2026-10-07 · 截止台北 17:00 · 交易日期 10-04～10-06</p></section>
    <p role="status" aria-live="polite" className="notice">{notice}</p>
    <section className="card" aria-label="批次補記"><h2>勾選後批次補記</h2><p>目前勾選 {selected.length} 筆；風險筆須單筆決議。建議不代表批准。</p><label>批次分類<select value={categoryId} onChange={e => { setCategory(e.target.value); setPreview(null); }}><option value="">請選擇</option>{inbox.categories.filter(x => x.owner === OWNER).map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label><label>批次支付方式<select value={paymentId} onChange={e => { setPayment(e.target.value); setPreview(null); }}><option value="">請選擇</option>{inbox.payments.filter(x => x.owner === OWNER).map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label><button type="button" onClick={prepare}>查看提交摘要</button>
    {preview && <div role="group" aria-label="提交摘要"><p>將補記 {preview.length} 筆合成交易 · 分類 {inbox.categories.find(c => c.id === categoryId)?.label} · 支付方式 {inbox.payments.find(p => p.id === paymentId)?.label}</p><button type="button" onClick={() => { const results = inbox.batch(preview, NOW); change(`批次逐筆結果：${results.map((r, i) => `第 ${i + 1} 筆${r.ok ? '成功' : '衝突／未提交'}`).join('、')}`); }}>確認批次補記</button><button type="button" onClick={() => setPreview(null)}>取消</button></div>}
    </section>
    <div className="grid">{candidates.map(c => <Row key={c.id} candidate={c} inbox={inbox} onChange={change} selected={selected.includes(c.id)} onSelect={(id, value) => { setSelected(ids => value ? [...ids, id] : ids.filter(x => x !== id)); setPreview(null); }} />)}</div>
    {!candidates.length && <p>沒有待確認候選；不代表零支出或已核帳。</p>}
    <section className="card"><h2>合成個人帳本</h2><p>合成交易 {inbox.personalTransactions(OWNER).length} 筆 · 支出 <span className="num expense">NT$ {inbox.personalViews(OWNER).budget.toLocaleString('zh-TW')}</span></p><p>只有原有合成交易與人工補記會列入；候選及工作排除不列入。</p><button type="button" onClick={() => { setInbox(demo()); setSelected([]); setPreview(null); setRevision(n => n + 1); setNotice('合成資料已重置'); }}>重置合成資料</button></section>
  </main>;
}

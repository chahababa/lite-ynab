"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { ctbcFeedback, ctbcWarnings, type CtbcAction, type CtbcCandidate, type CtbcCommand, type CtbcInboxData } from "@/lib/ctbcInbox";

const runLabels: Record<string,string> = { received:"收集進行中",ready_for_review:"候選已保存；不代表完整蒐集或核帳",partial_failure:"部分收集失敗，警示會保留",failed:"收集失敗，未能確認",missed_run:"應跑但未跑，需受控補捕",retry_expired:"本日重試已逾期",no_message:"未找到符合條件通知，不代表零支出",zero_new_candidates:"本次沒有新增候選，前次待辦保留" };
const statusLabels: Record<string,string> = { needs_review:"待確認",conflict:"需人工核對",imported:"已補記",already_recorded:"已連結既有交易",ignored:"已忽略",work_excluded:"已排除個人帳",expired:"已到期" };
const actionLabels: Record<CtbcAction,string> = { import:"補記",link:"已記過",ignore:"忽略",defer:"稍後處理",work:"工作支出／排除" };
const fieldClass = "m3-field-input w-full min-h-10 border border-outline rounded-xs bg-surface px-3 focus:outline-primary";
const buttonClass = "m3-btn m3-btn-outlined min-h-10 hover:bg-primary-container active:bg-primary-container focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40";

function CandidateRow({ candidate:c, data, busy, selected, onSelect, onAct }: {
  candidate:CtbcCandidate; data:CtbcInboxData; busy:boolean; selected:boolean;
  onSelect:(id:string,checked:boolean)=>void; onAct:(command:Omit<CtbcCommand,"actionKey">)=>Promise<void>;
}) {
  const [category,setCategory]=useState("");
  const [payment,setPayment]=useState("");
  const [link,setLink]=useState("");
  const [confirmed,setConfirmed]=useState(false);
  const [resolve,setResolve]=useState(false);
  const pending=["needs_review","conflict"].includes(c.status);
  const risky=c.warnings.length>0||c.status==="conflict";
  const safe=pending&&!risky;
  const linkedMissing=c.status==="already_recorded"&&!c.linked_transaction_id;
  const occurredDate=c.occurred_at?new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(c.occurred_at)):null;
  const options=data.existing.filter((t)=>occurredDate && Math.abs(Date.parse(t.date)-Date.parse(occurredDate))<=86_400_000);
  const execute=async(action:CtbcAction)=>{
    await onAct({candidateId:c.id,expectedVersion:c.version,action,categoryId:action==="import"?category:null,paymentId:action==="import"?payment:null,linkedId:action==="link"?link:null,resolveRisk:resolve});
    setConfirmed(false);
  };
  return <article className="m3-card space-y-3" aria-label={`${c.merchant||"商家未明"} ${statusLabels[c.status]}`}>
    <div className="flex items-start justify-between gap-3">
      <div><h2 className="text-title-md break-words">{c.merchant||"商家未明"}</h2><p className="text-sm text-on-surface-variant">{c.occurred_at?new Date(c.occurred_at).toLocaleDateString("zh-TW",{timeZone:"Asia/Taipei"}):"明細已清除"} · {statusLabels[c.status]}{c.late?" · 晚到通知":""}</p></div>
      <span className="num num-expense whitespace-nowrap">{c.amount===null?"—":`$${c.amount.toLocaleString("zh-TW")}`}</span>
    </div>
    {c.product&&<p className="text-sm">{c.product} · {c.card_role==="primary"?"正卡":c.card_role==="supplementary"?"附卡":"卡別待確認"}</p>}
    {c.warnings.length>0&&<ul className="text-sm text-money-warn space-y-1">{c.warnings.map((w)=><li key={w}>{ctbcWarnings[w]||"資料需核對"}</li>)}</ul>}
    {linkedMissing&&<p className="text-sm text-money-warn">原連結交易已不存在</p>}
    {pending&&<>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected} disabled={!safe||busy} onChange={(e)=>onSelect(c.id,e.target.checked)} />加入本次安全批次{!safe?"（此筆需逐筆核對）":""}</label>
      <label className="block text-sm">分類<select aria-label={`${c.merchant||"商家未明"} 分類`} className={fieldClass} value={category} disabled={busy} onChange={(e)=>setCategory(e.target.value)}><option value="">請選擇分類</option>{data.categories.map((o)=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
      <label className="block text-sm">支付方式<select aria-label={`${c.merchant||"商家未明"} 支付方式`} className={fieldClass} value={payment} disabled={busy} onChange={(e)=>setPayment(e.target.value)}><option value="">請選擇支付方式</option>{data.payments.map((o)=><option key={o.id} value={o.id}>{o.name}{o.id===c.suggested_payment_id?"（來源建議，可改選）":""}</option>)}</select></label>
      <label className="block text-sm">已記過：選擇本人既有交易<select aria-label={`${c.merchant||"商家未明"} 既有交易`} className={fieldClass} value={link} disabled={busy} onChange={(e)=>setLink(e.target.value)}><option value="">請人工選擇，不自動配對</option>{options.map((t)=><option key={t.id} value={t.id}>{t.date} ${t.amount} {t.note}</option>)}</select></label>
      {risky&&<label className="flex gap-2 text-sm"><input type="checkbox" checked={resolve} disabled={busy} onChange={(e)=>setResolve(e.target.checked)} />我已逐筆核對上述疑問</label>}
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(e)=>setConfirmed(e.target.checked)} />我確認本筆處理方式</label>
      <div className="flex flex-wrap gap-2">{(Object.keys(actionLabels) as CtbcAction[]).map((action)=><button key={action} type="button" className={buttonClass} disabled={busy||!confirmed||(action!=="defer"&&risky&&!resolve)||(action==="import"&&(!category||!payment||c.warnings.includes("source_payload_conflict")))||(action==="link"&&!link)} onClick={()=>void execute(action)}>{actionLabels[action]}</button>)}</div>
    </>}
  </article>;
}

export function CtbcInboxClient() {
  const client=useMemo(()=>getSupabaseBrowserClient(),[]);
  const [data,setData]=useState<CtbcInboxData|null>(null);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const inFlight=useRef(false);
  const [selected,setSelected]=useState<string[]>([]);
  const [batchCategory,setBatchCategory]=useState("");
  const [batchPayment,setBatchPayment]=useState("");
  const [batchConfirmed,setBatchConfirmed]=useState(false);
  // Retain keys for uncertain retries of the exact logical command.
  const keys=useRef(new Map<string,string>());
  const api=useCallback(async(method:string,body?:unknown)=>{
    const session=await client.auth.getSession();
    if(!session.data.session)throw new Error("請先登入，才能查看待確認交易");
    const response=await fetch("/api/ctbc/inbox",{method,cache:"no-store",headers:{Authorization:`Bearer ${session.data.session.access_token}`,"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined});
    if(!response.ok)throw new Error(response.status===409?"資料已變更或處理條件不符，請重新載入後核對":response.status===401?"請重新登入":"目前無法確認處理結果，請重新載入後再核對；重試會沿用原操作識別");
    return response.json();
  },[client]);
  const reload=useCallback(async()=>{const fresh=await api("GET") as CtbcInboxData;setData(fresh);setSelected((old)=>old.filter((id)=>fresh.candidates.some((c)=>c.id===id&&c.status==="needs_review"&&c.warnings.length===0)));},[api]);
  useEffect(()=>{let active=true;api("GET").then((d)=>{if(active)setData(d);}).catch((e)=>{if(active)setError(e.message);});return()=>{active=false;};},[api]);
  const submit=async(command:Omit<CtbcCommand,"actionKey">)=>{
    const identity=JSON.stringify(command);
    const actionKey=keys.current.get(identity)||crypto.randomUUID(); keys.current.set(identity,actionKey);
    return api("POST",{...command,actionKey});
  };
  const act=async(command:Omit<CtbcCommand,"actionKey">)=>{
    if(inFlight.current)return;inFlight.current=true;setBusy(true);setError("");
    try{await submit(command);setMessage(ctbcFeedback[command.action]);await reload();}catch(e){setError((e as Error).message);}finally{inFlight.current=false;setBusy(false);}
  };
  const batch=async()=>{
    if(!data||inFlight.current||!batchConfirmed||!batchCategory||!batchPayment||selected.length===0)return;
    if(selected.length>20){setError("每次最多補記 20 筆，請減少勾選後再確認");return;}
    const chosen=data.candidates.filter((c)=>selected.includes(c.id));
    if(chosen.length!==selected.length||chosen.some((c)=>c.status!=="needs_review"||c.warnings.length>0)){setError("批次含需核對項目，請重新載入");return;}
    inFlight.current=true;setBusy(true);setError("");
    try{
      const commands=chosen.map((c)=>{const command={candidateId:c.id,expectedVersion:c.version,action:"import" as const,categoryId:batchCategory,paymentId:batchPayment,batch:true};const identity=JSON.stringify(command);const actionKey=keys.current.get(identity)||crypto.randomUUID();keys.current.set(identity,actionKey);return {...command,actionKey};});
      const result=await api("POST",{commands});
      const count=(status:string)=>result.results.filter((r:{status:string})=>r.status===status).length;
      setMessage(`本次批次：成功 ${count("success")} 筆、衝突或未確認 ${count("conflict")} 筆、未提交 ${count("not_submitted")} 筆；成功筆尚未與月結帳單核對`);
      await reload();
    }catch(e){setError((e as Error).message);}finally{setBatchConfirmed(false);inFlight.current=false;setBusy(false);}
  };
  const run=data?.latestRun;
  return <main className="min-h-screen bg-background text-on-surface"><div className="mx-auto max-w-md space-y-4 px-4 py-4 pb-24">
    <Link className="text-primary hover:underline focus-visible:outline" href="/settings">返回設定</Link>
    <h1 className="text-headline-sm">待確認交易{data?`（${data.pendingCount}）`:""}</h1>
    <p className="text-sm text-on-surface-variant">信用卡通知僅供補記參考；尚未與月結帳單核對。只有本人確認補記後才進個人帳本。</p>
    <section className="m3-card text-sm space-y-2" aria-label="收集狀態"><p>{run?runLabels[run.status]||"未能確認收集狀態":"尚未成功執行"}</p>{run&&<><p>排程日：{run.slot_date}；涵蓋前三個台北交易日，固定 17:00 截止</p><p>最近嘗試：{run.last_attempt_at||"尚無"}；最近完成：{run.last_success_at||"尚無"}</p><p>失敗 {run.failures} · 拒絕 {run.rejected} · 超窗 {run.outside_window} · 當日延後 {run.deferred}</p></>}<p>通知可能晚到；本頁不代表完整蒐集、零支出或已核帳。</p></section>
    {message&&<p role="status" className="m3-card bg-primary-container">{message}</p>}{error&&<p role="alert" className="m3-card text-money-warn">{error}</p>}
    <button type="button" className={buttonClass} disabled={busy} onClick={()=>{setError("");void reload().catch((e)=>setError(e.message));}}>重新載入待辦</button>
    {!data&&!error&&<p role="status">載入待確認交易中</p>}
    {data&&<>
      <section className="m3-card space-y-3" aria-label="安全批次補記"><h2 className="text-title-md">安全批次補記（{selected.length} 筆）</h2>
        <label className="block text-sm">共同分類<select aria-label="批次分類" className={fieldClass} disabled={busy} value={batchCategory} onChange={(e)=>setBatchCategory(e.target.value)}><option value="">請選擇</option>{data.categories.map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="block text-sm">共同支付方式<select aria-label="批次支付方式" className={fieldClass} disabled={busy} value={batchPayment} onChange={(e)=>setBatchPayment(e.target.value)}><option value="">請選擇</option>{data.payments.map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <p className="text-sm">僅處理你明確勾選且無風險的候選；每筆獨立提交。</p>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={batchConfirmed} disabled={busy} onChange={(e)=>setBatchConfirmed(e.target.checked)} />我確認所選 {selected.length} 筆與共同分類、支付方式</label>
        <button className={buttonClass} disabled={busy||!batchConfirmed||!batchCategory||!batchPayment||selected.length===0} onClick={()=>void batch()}>確認批次補記</button>
      </section>
      {data.candidates.length===0&&<p className="m3-card">目前沒有待確認候選；收集警示仍以上方狀態為準。</p>}
      {data.candidates.map((c)=><CandidateRow key={`${c.id}:${c.version}`} candidate={c} data={data} busy={busy} selected={selected.includes(c.id)} onSelect={(id,checked)=>{setBatchConfirmed(false);setSelected((old)=>checked?[...old,id]:old.filter((x)=>x!==id));}} onAct={act}/>)}
    </>}
  </div></main>;
}

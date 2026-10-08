// Existing disposable Linux CI Supabase stack + the actual Next.js app.
// Synthetic data only, loopback-only clients, no production credentials or Gmail.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
import ts from 'typescript';
import { chromium } from 'playwright';

assert.equal(process.platform,'linux'); assert.equal(process.env.GITHUB_ACTIONS,'true');
const baseEnv={PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'test'};
const status=JSON.parse(execFileSync('supabase',['status','--output','json'],{env:baseEnv,encoding:'utf8'}));
assert.equal(status.API_URL,'http://127.0.0.1:54321');
const apiOrigin=status.API_URL; const appOrigin='http://127.0.0.1:4179';
const options={auth:{persistSession:false,autoRefreshToken:false}};
const localFetch=async(input,init)=>{assert.equal(new URL(typeof input==='string'?input:input.url||input.href).origin,apiOrigin);return fetch(input,init);};
const admin=createClient(apiOrigin,status.SERVICE_ROLE_KEY,{...options,global:{fetch:localFetch}});
const sql=(text)=>execFileSync('docker',['exec','-i','supabase_db_lite-ynab-local','psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-At'],{input:text,env:baseEnv,encoding:'utf8'}).trim();
const ok=(r)=>{assert.equal(r.error,null,r.error?.code);return r.data;};
const owner=async()=>{
 const email=`ctbc-${randomUUID()}@example.invalid`,password=randomUUID();
 const user=ok(await admin.auth.admin.createUser({email,password,email_confirm:true})).user;
 const client=createClient(apiOrigin,status.ANON_KEY,{...options,global:{fetch:localFetch}});
 ok(await client.auth.signInWithPassword({email,password}));
 const group=ok(await client.from('category_groups').insert({name:'合成測試'}).select('id').single());
 const category=ok(await client.from('categories').insert({name:'合成分類',category_group_id:group.id}).select('id').single());
 const payment=ok(await client.from('payment_methods').insert({name:'合成支付'}).select('id').single());
 return {user:user.id,client,email,password,category:category.id,payment:payment.id,token:(await client.auth.getSession()).data.session.access_token};
};
const a=await owner(),b=await owner();
const compiled=await mkdtemp(`${tmpdir()}/ctbc-source-`);
for(const [source,target] of [['ctbcEmailParser.ts','ctbcEmailParser.js'],['ctbcCollector.ts','ctbcCollector.cjs']]){
 const result=ts.transpileModule(await readFile(`src/lib/${source}`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
 await writeFile(`${compiled}/${target}`,result.outputText);
}
const {prepareCtbcSyntheticBatch,ctbcSlot}=createRequire(import.meta.url)(`${compiled}/ctbcCollector.cjs`);
const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const window=ctbcSlot(date),yesterday=window.cohorts[2];
const names=['合成補記','合成已記過','合成忽略','合成稍後','合成工作','合成批次甲','合成批次乙'];
const envelope=(name,index)=>({synthetic:true,internalDate:window.start+1000,trustedHeader:true,input:{
 messageId:`synthetic-${randomUUID()}`,from:'bank.csc@inib.ctbcbank.com',subject:'信用卡消費成交回報',
 authenticationResults:'mx.google.com; dkim=pass header.i=@inib.ctbcbank.com; spf=pass smtp.mailfrom=bank.csc@inib.ctbcbank.com; dmarc=pass header.from=inib.ctbcbank.com',
 html:`<table><tr><th>卡別</th><th>末四碼</th><th>消費日</th><th>消費金額</th><th>商店名稱</th><th>商店類型│交易類型</th></tr><tr><td>合成卡 (正卡)</td><td>1234</td><td>${yesterday.replaceAll('-','/')} 09:15</td><td>$${101+index} 元</td><td>${name}</td><td>餐飲美食 行動支付</td></tr><tr><td>非目標合成卡 (附卡)</td><td>5678</td><td>${yesterday.replaceAll('-','/')} 09:15</td><td>$999 元</td><td>不可進收件匣</td><td>餐飲美食 行動支付</td></tr></table>`,
}});
const messages=names.map(envelope),prepared=prepareCtbcSyntheticBatch(date,messages,'1234',true);
assert.equal(prepared.rows.length,7);assert.ok(!JSON.stringify(prepared).includes('不可進收件匣'));
assert.ok(prepared.rows.every(r=>!('cardLast4' in r)&&!('messageId' in r)&&r.source_id.match(/^ctbc:v1:[a-f0-9]{64}:[a-f0-9]{64}$/)));
const prior=ok(await a.client.from('transactions').insert({date:yesterday,amount:102,category_id:a.category,payment_method_id:a.payment,note:'合成已記過',source:'manual'}).select('id').single());
const scope=ok(await admin.from('ctbc_collector_scopes').insert({user_id:a.user,enabled:true,mailbox_binding:randomUUID(),preferred_payment_id:a.payment}).select('id').single());
const disabled=ok(await admin.from('ctbc_collector_scopes').insert({user_id:b.user,mailbox_binding:randomUUID()}).select('id').single());
assert.equal((await admin.rpc('ctbc_begin',{p_scope:disabled.id,p_date:date})).error?.message,'collector_disabled');
const missed=ok(await admin.rpc('ctbc_begin',{p_scope:scope.id,p_date:yesterday}));assert.equal(missed.code,'missed_run');
assert.ok((await a.client.rpc('ctbc_begin',{p_scope:scope.id,p_date:date})).error);
if(Date.now()<window.end)assert.equal((await admin.rpc('ctbc_begin',{p_scope:scope.id,p_date:date})).error?.message,'too_early');
// Native DB clock is never changed. Before 17:00, create a synthetic lease fixture
// for ingest; the real begin gate is tested separately below, without bypass code.
const batch=ok(await admin.from('ctbc_batches').insert({scope_id:scope.id,user_id:a.user,slot_date:date,starts_at:new Date(window.start).toISOString(),ends_at:new Date(window.end).toISOString(),stops_at:new Date(window.stop).toISOString(),attempts:1,last_attempt_at:new Date().toISOString()}).select('id').single());
const lease=async(fence)=>ok(await admin.from('ctbc_collector_scopes').update({active_batch:batch.id,fence,lease_until:new Date(Date.now()+900000).toISOString()}).eq('id',scope.id));
await lease(1);
assert.equal((await admin.rpc('ctbc_ingest',{p_scope:scope.id,p_batch:batch.id,p_fence:0,p_rows:prepared.rows,p_counts:prepared.counts,p_complete:true})).error?.message,'stale_lease');
const ingested=ok(await admin.rpc('ctbc_ingest',{p_scope:scope.id,p_batch:batch.id,p_fence:1,p_rows:prepared.rows,p_counts:prepared.counts,p_complete:true}));
assert.equal(ingested.added,7);
const snapshot=()=>a.client.rpc('ctbc_snapshot').then(ok);
const initial=await snapshot();assert.equal(initial.pendingCount,7);
assert.equal(ok(await b.client.rpc('ctbc_snapshot')).pendingCount,0);
assert.ok(!JSON.stringify(initial).includes('ctbc:v1:'));assert.ok(!JSON.stringify(initial).includes('payload_hash'));
assert.ok((await a.client.from('ctbc_candidates').insert({user_id:a.user})).error);
const candidates=initial.candidates;
const command=(c,action,key=randomUUID(),extra={})=>({p_id:c.id,p_expected:c.version,p_action:action,p_key:key,...extra});
assert.ok((await b.client.rpc('ctbc_act',command(candidates[0],'work'))).error);
assert.ok((await a.client.rpc('ctbc_act',command(candidates.find(c=>c.merchant==='合成補記'),'import',randomUUID(),{p_category:b.category,p_payment:b.payment}))).error);
await lease(2);
const replay=ok(await admin.rpc('ctbc_ingest',{p_scope:scope.id,p_batch:batch.id,p_fence:2,p_rows:prepared.rows,p_counts:prepared.counts,p_complete:true}));
assert.equal(replay.added,0);assert.equal(replay.existing,7);
const buildEnv={...baseEnv,NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:apiOrigin,NEXT_PUBLIC_SUPABASE_ANON_KEY:status.ANON_KEY};
execFileSync('npm',['run','build'],{env:buildEnv,stdio:'inherit',timeout:180000});
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','4179'],{
 env:{...buildEnv,CTBC_INBOX_ENABLED:'true',CTBC_INBOX_TEST_MODE:'true'},stdio:['ignore','ignore','inherit'],
});
let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`${appOrigin}/api/ctbc/status`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
 const request=async(token,body)=>fetch(`${appOrigin}/api/ctbc/inbox`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 assert.equal((await request(b.token,{candidateId:candidates[0].id,expectedVersion:1,action:'work',actionKey:randomUUID()})).status,409);
 assert.equal((await request(a.token,{userId:b.user,candidateId:candidates[0].id,expectedVersion:1,action:'work',actionKey:randomUUID()})).status,400);
 const risky=candidates.find(c=>c.merchant==='合成已記過'),safe=candidates.find(c=>c.merchant==='合成補記');
 const batchCommands=[safe,risky].map(c=>({candidateId:c.id,expectedVersion:c.version,action:'import',actionKey:randomUUID(),categoryId:a.category,paymentId:a.payment,batch:true}));
 assert.equal((await request(a.token,{commands:batchCommands})).status,409);
 assert.equal(ok(await a.client.from('transactions').select('id')).length,1);
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:360,height:800}});
 const origins=new Set(),paths=new Set();
 context.on('request',req=>{const u=new URL(req.url());origins.add(u.origin);paths.add(u.pathname);});
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(![appOrigin,apiOrigin].includes(u.origin))return route.abort();return route.continue();});
 const page=await context.newPage(); await page.goto(`${appOrigin}/login`);
 await page.getByLabel('電子郵件').fill(a.email);await page.getByLabel('密碼').fill(a.password);
 await page.locator('form').getByRole('button',{name:'登入',exact:true}).click();await page.waitForURL('**/quick-entry');
 await page.getByRole('link',{name:/待確認交易/}).waitFor();
 await page.getByRole('link',{name:/待確認交易/}).click();await page.getByRole('heading',{name:'待確認交易（7）',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
 const row=name=>page.getByRole('article',{name:new RegExp(`^${name} `)});
 const act=async(name,action)=>{const card=row(name);await card.getByLabel('我確認本筆處理方式').check();await card.getByRole('button',{name:action,exact:true}).click();};
 const card=row('合成補記');assert.equal(await card.getByRole('button',{name:'補記',exact:true}).isEnabled(),false);
 await page.getByLabel('合成補記 分類',{exact:true}).selectOption(a.category);await page.getByLabel('合成補記 支付方式',{exact:true}).selectOption(a.payment);
 await act('合成補記','補記');await page.getByRole('status').filter({hasText:'已補記，尚未與月結帳單核對'}).waitFor();
 await page.reload();await page.getByRole('heading',{name:'待確認交易（6）',exact:true}).waitFor();
 assert.equal(await row('合成補記').getByRole('button').count(),0);
 await page.getByLabel('合成已記過 既有交易',{exact:true}).selectOption(prior.id);await row('合成已記過').getByLabel('我已逐筆核對上述疑問').check();
 await act('合成已記過','已記過');await page.getByRole('status').filter({hasText:'已連結既有交易'}).waitFor();
 await act('合成忽略','忽略');await page.getByRole('status').filter({hasText:'已忽略，不會補記'}).waitFor();
 await act('合成稍後','稍後處理');await page.getByRole('status').filter({hasText:'保留待處理，期限不延長'}).waitFor();
 await row('合成工作').getByLabel('我確認本筆處理方式').focus();await page.keyboard.press('Space');
 await row('合成工作').getByRole('button',{name:'工作支出／排除',exact:true}).focus();await page.keyboard.press('Enter');
 await page.getByRole('status').filter({hasText:'已排除，不列入個人帳本'}).waitFor();
 await page.reload();await page.getByRole('heading',{name:'待確認交易（3）',exact:true}).waitFor();
 const after=await snapshot();
 assert.equal(after.candidates.find(c=>c.merchant==='合成工作').status,'work_excluded');
 assert.equal(after.candidates.find(c=>c.merchant==='合成稍後').status,'needs_review');
 assert.equal(ok(await a.client.from('transactions').select('id')).length,2);
 assert.equal(ok(await a.client.from('transactions').select('amount').eq('id',prior.id).single()).amount,102);
 for(const name of ['合成批次甲','合成批次乙'])await row(name).getByLabel('加入本次安全批次').check();
 await page.getByLabel('批次分類',{exact:true}).selectOption(a.category);await page.getByLabel('批次支付方式',{exact:true}).selectOption(a.payment);
 await page.getByLabel(/我確認所選 2 筆/).check();await page.getByRole('button',{name:'確認批次補記',exact:true}).click();
 await page.getByRole('status').filter({hasText:'成功 2 筆'}).waitFor();
 assert.equal(ok(await a.client.from('transactions').select('id')).length,4);
 await page.reload();await page.getByRole('heading',{name:'待確認交易（1）',exact:true}).waitFor();
 await mkdir('test-results/ctbc-inbox',{recursive:true});
 await page.screenshot({path:'test-results/ctbc-inbox/mobile-five-actions.png',fullPage:true});
 assert.ok([...origins].every(origin=>[appOrigin,apiOrigin].includes(origin)));
 assert.ok([...paths].every(path=>!path.includes('gmail')));
 await writeFile('test-results/ctbc-inbox/network-proof.json',JSON.stringify({origins:[...origins],gmailRequests:0,productionRequests:0,viewport:{width:360,height:800},fiveActions:true,reloadPersistent:true,keyboardWorkAction:true,transactionCount:4},null,2));
 console.log('PASS CTBC actual app: synthetic collector -> persistent inbox -> owner isolation -> five actions -> reload -> safe batch; zero Gmail/production requests');
 // Atomic race/replay receipt: same key returns one event/transaction; changed
 // payload and stale/cross-owner commands fail instead of mutating accounting.
 const deferred=(await snapshot()).candidates.find(c=>c.status==='needs_review');
 const key=randomUUID(),rpc=command(deferred,'import',key,{p_category:a.category,p_payment:a.payment});
 const results=await Promise.all([a.client.rpc('ctbc_act',rpc),a.client.rpc('ctbc_act',rpc)]);
 assert.equal(ok(results[0]).transactionId,ok(results[1]).transactionId);
 assert.ok((await a.client.rpc('ctbc_act',{...rpc,p_action:'work'})).error);
 assert.ok((await a.client.rpc('ctbc_act',command(deferred,'work'))).error);
 const tid=results[0].data.transactionId;
 assert.equal(sql(`select count(*) from public.ctbc_events where user_id='${a.user}' and action_key='${key}';`),'1');
 // Retention: pending expires/scrubs at 30d, terminal details at 7d, shells/events
 // at 90d. Direct SQL is only fixture time adjustment in this disposable DB.
 const work=(await snapshot()).candidates.find(c=>c.status==='work_excluded');
 const aged=ok(await admin.from('ctbc_candidates').insert({user_id:a.user,batch_id:batch.id,source_id:`ctbc:v1:${'a'.repeat(64)}:${'b'.repeat(64)}`,payload_hash:'c'.repeat(64),occurred_at:`${yesterday}T09:15:00+08:00`,amount:999,merchant:'合成到期',created_at:new Date(Date.now()-30*86400000-1000).toISOString()}).select('id').single());
 assert.ok((await a.client.rpc('ctbc_act',{p_id:aged.id,p_expected:1,p_action:'import',p_key:randomUUID(),p_category:a.category,p_payment:a.payment})).error);
 const expired=(await snapshot()).candidates.find(c=>c.id===aged.id);assert.equal(expired.status,'expired');assert.equal(expired.amount,null);assert.equal(expired.merchant,null);
 sql(`update public.ctbc_candidates set closed_at=now()-interval '7 days' where id='${work.id}';`);
 await snapshot();assert.equal(sql(`select (amount is null)::text from public.ctbc_candidates where id='${work.id}';`),'true');
 sql(`update public.ctbc_candidates set closed_at=now()-interval '90 days' where id='${deferred.id}';`);
 const dry=ok(await admin.rpc('ctbc_retain',{p_dry_run:true,p_limit:200}));assert.ok(dry.purge>=1);
 ok(await admin.rpc('ctbc_retain',{p_dry_run:false,p_limit:200}));
 assert.equal(sql(`select count(*) from public.ctbc_candidates where id='${deferred.id}';`),'0');
 assert.equal(sql(`select count(*) from public.ctbc_events where candidate_id='${deferred.id}';`),'0');
 assert.equal(ok(await a.client.from('transactions').select('id').eq('id',tid)).length,1);
 // Partial failures survive human closure and do not turn into no-message.
 const partial=(await snapshot()).candidates.find(c=>c.status==='ignored');
 sql(`update public.ctbc_batches set status='partial_failure',failures=1 where id='${partial.batch_id}';`);
 assert.equal((await snapshot()).latestRun.status,'partial_failure');
 console.log('PASS CTBC real RPC: action race/replay, stale/owner/foreign-reference rejection, 30/7/90 retention, accounting retained, partial warning retained');
}finally{if(browser)await browser.close();child.kill('SIGTERM');}

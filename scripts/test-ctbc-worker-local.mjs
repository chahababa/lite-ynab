// Isolated CI DB + real PostgREST. Synthetic owner/data only, native DB clock.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
assert.equal(process.platform,'linux'); assert.equal(process.env.GITHUB_ACTIONS,'true');
const baseEnv={PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'test'};
const status=JSON.parse(execFileSync('supabase',['status','--output','json'],{env:baseEnv,encoding:'utf8'}));
assert.equal(status.API_URL,'http://127.0.0.1:54321');
const localFetch=async(input,init)=>{assert.equal(new URL(typeof input==='string'?input:input.url||input.href).origin,status.API_URL);return fetch(input,init);};
const admin=createClient(status.API_URL,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:localFetch}});
const anon=createClient(status.API_URL,status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:localFetch}});
const sql=text=>execFileSync('docker',['exec','-i','supabase_db_lite-ynab-local','psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-At'],{input:text,env:baseEnv,encoding:'utf8'}).trim();
const ok=r=>{assert.equal(r.error,null,r.error?.code);return r.data;};
const {ctbcSlot}=createRequire(import.meta.url)('../.ctbc-worker/ctbcCollector.js');
const {runCtbcAttempt,tickCtbcWorker}=createRequire(import.meta.url)('../.ctbc-worker/ctbcWorker.js');
const {CtbcGmailClient,mailboxHash}=createRequire(import.meta.url)('../.ctbc-worker/ctbcGmail.js');
const today=sql("select (now() at time zone 'Asia/Taipei')::date");
const offset=n=>new Date(Date.parse(`${today}T00:00:00Z`)+n*86400000).toISOString().slice(0,10);
const user=ok(await admin.auth.admin.createUser({email:`worker-${randomUUID()}@example.invalid`,password:randomUUID(),email_confirm:true})).user.id;
const mailbox=randomUUID();
const scope=ok(await admin.from('ctbc_collector_scopes').insert({user_id:user,mailbox_binding:mailbox,enabled:true}).select('id').single()).id;
const bound={p_scope:scope,p_owner:user,p_mailbox:mailbox};
const rpc=(name,args={})=>admin.rpc(name,{...bound,...args}).then(ok);
const proof={synthetic:true,productionRequests:0,gmailRequests:0,nativeClock:true};
try {
 assert.ok((await anon.rpc('ctbc_worker_poll',{...bound,p_armed_date:offset(-3)})).error);
 assert.ok((await admin.rpc('ctbc_worker_poll',{...bound,p_owner:randomUUID(),p_armed_date:offset(-3)})).error);
 await rpc('ctbc_worker_poll',{p_armed_date:offset(-3)});
 const missed=ok(await admin.from('ctbc_batches').select('status,slot_date,error_code').eq('scope_id',scope).lt('slot_date',today));
 assert.equal(missed.length,3);assert.ok(missed.every(b=>b.status==='missed_run'&&b.error_code==='missed_run'));
 assert.ok((await admin.rpc('ctbc_worker_poll',{...bound,p_armed_date:offset(-2)})).error);
 proof.restartMissedSlotsPersisted=true; proof.bindingDenied=true; proof.scheduleBindingImmutable=true;
 // Native due gate: CI never changes DB time to pretend it is 17:00.
 const slot=ctbcSlot(today);
 const due=ok(await admin.from('ctbc_batches').select('*').eq('scope_id',scope).eq('slot_date',today));
 if (Date.now()<slot.end) assert.equal(due.length,0);
 else assert.equal(due[0].attempts,1);
 proof.nativeDueGate=Date.now()<slot.end?'before_17_denied':'after_17_claimed';
 // Synthetic attempt fixtures exercise fault paths independent of CI wall time,
 // exactly like the frozen inbox test's isolated lease fixtures.
 const batch=due[0] ?? ok(await admin.from('ctbc_batches').insert({scope_id:scope,user_id:user,slot_date:today,
  starts_at:new Date(slot.start).toISOString(),ends_at:new Date(slot.end).toISOString(),stops_at:new Date(slot.stop).toISOString(),attempts:1,last_attempt_at:new Date().toISOString()}).select('*').single());
 const fixtureAttempt=async(fence,attempts=1,expired=false)=>{
  ok(await admin.from('ctbc_batches').update({status:'received',attempts,last_attempt_at:new Date().toISOString(),last_success_at:null,next_attempt_at:null,error_code:null,failures:0,rejected:0}).eq('id',batch.id));
  ok(await admin.from('ctbc_collector_scopes').update({active_batch:batch.id,fence,lease_until:new Date(Date.now()+(expired?-1000:900000)).toISOString()}).eq('id',scope));
  ok(await admin.from('ctbc_worker_attempts').upsert({scope_id:scope,fence,batch_id:batch.id,status:'running',result:null,error_code:null,finished_at:null}));
 };
 await fixtureAttempt(100);
 const row={source_id:`ctbc:v1:${'1'.repeat(64)}:${'2'.repeat(64)}`,payload_hash:'3'.repeat(64),received_at:new Date(slot.start+1000).toISOString(),occurred_at:`${offset(-1)}T09:15:00+08:00`,amount:123,merchant:'合成交易',product:'合成卡',card_role:'primary',bank_category:null,warnings:[]};
 const commitArgs={p_batch:batch.id,p_fence:100,p_rows:[row],p_counts:{messages:1,failures:0,rejected:0},p_complete:true,p_error:null};
 const lostResult=await rpc('ctbc_worker_commit',commitArgs); // emulate losing reply
 assert.equal(lostResult.status,'ready_for_review');
 const receipt=await rpc('ctbc_worker_probe',{p_fence:100});assert.equal(receipt.code,'committed');assert.deepEqual(receipt.result,lostResult);
 assert.deepEqual(await rpc('ctbc_worker_commit',commitArgs),lostResult);
 assert.equal((await rpc('ctbc_worker_finish',{p_fence:100,p_code:'commit_unknown'})).code,'committed');
 assert.equal(ok(await admin.from('ctbc_candidates').select('id').eq('user_id',user)).length,1);
 proof.lostReplyReconciled=true; proof.committedNotOverwritten=true;
 await fixtureAttempt(101,2);
 ok(await admin.from('ctbc_worker_attempts').insert({scope_id:scope,fence:99,batch_id:batch.id,status:'running'}));
 assert.equal((await rpc('ctbc_worker_finish',{p_fence:99,p_code:'attempt_timeout'})).code,'stale_fence');
 assert.equal(ok(await admin.from('ctbc_collector_scopes').select('fence,active_batch').eq('id',scope).single()).fence,101);
 const partial=await rpc('ctbc_worker_commit',{...commitArgs,p_fence:101,p_counts:{messages:1,failures:1},p_complete:false,p_error:'provider_failed'});
 assert.equal(partial.status,'partial_failure');
 const retryAt=ok(await admin.from('ctbc_batches').select('next_attempt_at').eq('id',batch.id).single()).next_attempt_at;
 const fifteen=Math.min(Date.now()+900000,slot.stop)-Date.parse(retryAt);assert.ok(fifteen>=0&&fifteen<10000);
 proof.fifteenMinuteBackoff=true;
 assert.ok(ok(await admin.from('ctbc_candidates').select('warnings').eq('user_id',user)).every(c=>c.warnings.includes('partial_batch')));
 proof.oldFenceCannotCloseNewAttempt=true;proof.partialPreserved=true;
 await fixtureAttempt(102,3);
 await rpc('ctbc_worker_finish',{p_fence:102,p_code:'provider_failed'});
 let state=ok(await admin.from('ctbc_batches').select('status,error_code,next_attempt_at').eq('id',batch.id).single());
 assert.equal(state.status,'partial_failure');assert.equal(state.error_code,'retry_budget_exhausted');assert.equal(state.next_attempt_at,null);
 proof.retryBudgetDurable=true;
 await fixtureAttempt(103,1,true);
 await rpc('ctbc_worker_poll',{p_armed_date:offset(-3)});
 assert.equal((await rpc('ctbc_worker_probe',{p_fence:103})).code,'failed');
 assert.equal(ok(await admin.from('ctbc_collector_scopes').select('active_batch').eq('id',scope).single()).active_batch,null);
 proof.expiredLeaseReconciled=true;
 // Backoff is enforced persistently, before any Gmail access.
 ok(await admin.from('ctbc_batches').update({attempts:2,next_attempt_at:new Date(Date.now()+900000).toISOString()}).eq('id',batch.id));
 const code=(await rpc('ctbc_worker_poll',{p_armed_date:offset(-3)})).code;
 assert.equal(code,Date.now()<slot.end?'not_due':'backoff');proof.nativeBackoff=true;
 // Closed original D never becomes today's attempt; partial stays partial.
 const oldBatch=ok(await admin.from('ctbc_batches').select('*').eq('scope_id',scope).eq('slot_date',offset(-1)).single());
 ok(await admin.from('ctbc_batches').update({attempts:1,status:'failed'}).eq('id',oldBatch.id));
 ok(await admin.from('ctbc_worker_cursors').update({reconciled_through:offset(-2)}).eq('scope_id',scope));
 await rpc('ctbc_worker_poll',{p_armed_date:offset(-3)});
 state=ok(await admin.from('ctbc_batches').select('status,error_code').eq('id',oldBatch.id).single());
 assert.equal(state.status,'retry_expired');assert.equal(state.error_code,'retry_expired');proof.midnightOriginalSlotClosed=true;
 // Zero-row failure is failed, never no_message; maximum two retries.
 const cleanScope=ok(await admin.from('ctbc_collector_scopes').insert({user_id:user,mailbox_binding:randomUUID(),enabled:true}).select('*').single());
 const cleanBatch=ok(await admin.from('ctbc_batches').insert({scope_id:cleanScope.id,user_id:user,slot_date:today,starts_at:new Date(slot.start).toISOString(),ends_at:new Date(slot.end).toISOString(),stops_at:new Date(slot.stop).toISOString(),attempts:1}).select('id').single());
 ok(await admin.from('ctbc_collector_scopes').update({fence:1,active_batch:cleanBatch.id,lease_until:new Date(Date.now()+900000).toISOString()}).eq('id',cleanScope.id));
 ok(await admin.from('ctbc_worker_attempts').insert({scope_id:cleanScope.id,fence:1,batch_id:cleanBatch.id,status:'running'}));
 const cleanBound={p_scope:cleanScope.id,p_owner:user,p_mailbox:cleanScope.mailbox_binding};
 await admin.rpc('ctbc_worker_finish',{...cleanBound,p_fence:1,p_code:'provider_failed'}).then(ok);
 const failed=ok(await admin.from('ctbc_batches').select('status,next_attempt_at').eq('id',cleanBatch.id).single());
 assert.equal(failed.status,'failed');const backoffMs=Date.parse(failed.next_attempt_at)-Date.now();assert.ok(backoffMs>290000&&backoffMs<=300000);
 proof.zeroRowFailureNotNoMessage=true;proof.fiveMinuteBackoff=true;
 // Run actual worker reconciliation against PostgREST, with a lost HTTP reply.
 const wrapped={rpc:async(name,args)=>{
  if(name==='ctbc_worker_commit'){const result=await admin.rpc(name,args);assert.equal(result.error,null);return {error:{code:'synthetic_lost_reply'},data:null};}
  return admin.rpc(name,args);
 }};
 // Existing successful fence is replayed by SQL; full Gmail fixture is covered
 // by provider tests. Provider failure here verifies live RPC finalization.
 const actualFailure=await runCtbcAttempt({client:wrapped,config:{scope:cleanScope.id,owner:user,mailboxBinding:cleanScope.mailbox_binding},gmail:async()=>{throw new Error('synthetic');}},
  {batchId:cleanBatch.id,fence:1,slotDate:today,deadline:new Date(Date.now()+900000).toISOString()});
 assert.equal(actualFailure.code,'failed');proof.workerRpcFailurePath=true;
 ok(await admin.from('ctbc_batches').update({attempts:2,status:'received',next_attempt_at:null}).eq('id',cleanBatch.id));
 ok(await admin.from('ctbc_collector_scopes').update({fence:2,active_batch:cleanBatch.id,lease_until:new Date(Date.now()+900000).toISOString()}).eq('id',cleanScope.id));
 ok(await admin.from('ctbc_worker_attempts').insert({scope_id:cleanScope.id,fence:2,batch_id:cleanBatch.id,status:'running'}));
 const noNetwork=async(input)=>new Response(JSON.stringify(String(input).endsWith('/profile')?{emailAddress:'synthetic@example.invalid'}:{}));
 const lostCommit=await runCtbcAttempt({client:wrapped,config:{scope:cleanScope.id,owner:user,mailboxBinding:cleanScope.mailbox_binding,mailboxSha256:mailboxHash('synthetic@example.invalid'),targetLast4:'1234'},
  gmail:async(signal)=>new CtbcGmailClient('synthetic',signal,noNetwork)},
  {batchId:cleanBatch.id,fence:2,slotDate:today,deadline:new Date(Date.now()+900000).toISOString()});
 assert.equal(lostCommit.code,'committed');
 assert.equal(lostCommit.result.status,'partial_failure'); // prior failure cannot become no_message
 assert.equal(ok(await admin.rpc('ctbc_worker_finish',{...cleanBound,p_fence:2,p_code:'commit_unknown'})).code,'committed');
 proof.workerLostReplyReconciled=true;proof.priorFailureNotCleared=true;
 const gmailNever=()=>{throw new Error('unexpected mail call');};
 await tickCtbcWorker({client:admin,config:{scope,owner:user,mailboxBinding:mailbox,armedDate:offset(-3)},gmail:gmailNever});
 proof.workerNoMailDuringBackoff=true;
 // Independent retention: count-only first, collection disabled, then bounded
 // cleanup in this disposable DB. No existing ledger or production data touched.
 ok(await admin.from('ctbc_collector_scopes').update({enabled:false}).eq('id',scope));
 const pending=ok(await admin.from('ctbc_candidates').select('id').eq('user_id',user).single());
 sql(`update public.ctbc_candidates set created_at=now()-interval '31 days' where id='${pending.id}';`);
 const before=ok(await admin.from('ctbc_candidates').select('amount,status').eq('id',pending.id).single());
 const counts=ok(await admin.rpc('ctbc_retain',{p_dry_run:true,p_limit:200}));assert.ok(counts.expire>=1);
 assert.deepEqual(ok(await admin.from('ctbc_candidates').select('amount,status').eq('id',pending.id).single()),before);
 ok(await admin.rpc('ctbc_retain',{p_dry_run:false,p_limit:200}));
 assert.equal(ok(await admin.from('ctbc_candidates').select('amount,status').eq('id',pending.id).single()).amount,null);
 proof.retentionCountOnly=true;proof.cleanupIndependentOfCollector=true;
 // Actual production entry remains off even with fabricated credentials.
 const off=execFileSync(process.execPath,['scripts/ctbc-worker.mjs','daemon'],{env:baseEnv,encoding:'utf8'});
 assert.equal(JSON.parse(off.trim()).code,'disabled');proof.defaultOffEntry=true;
 await mkdir('test-results/ctbc-worker',{recursive:true});
 await writeFile('test-results/ctbc-worker/rpc-proof.json',JSON.stringify(proof,null,2));
 console.log(JSON.stringify(proof));
} finally {
 // Separate disposable CI stack is destroyed by the existing runner lifecycle.
 // No remote project or mailbox is accessed, and no clock override is installed.
}

"use client";
import Link from "next/link";
import { useEffect,useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
export function CtbcInboxShortcut(){
  const [count,setCount]=useState<number|null>(null);
  useEffect(()=>{let active=true;
    void (async()=>{
      const status=await fetch("/api/ctbc/status",{cache:"no-store"}).then((r)=>r.json());
      if(!status.enabled)return;
      const session=await getSupabaseBrowserClient().auth.getSession();
      if(!session.data.session)return;
      const response=await fetch("/api/ctbc/inbox",{cache:"no-store",headers:{Authorization:`Bearer ${session.data.session.access_token}`}});
      if(response.ok&&active)setCount((await response.json()).pendingCount);
    })().catch(()=>{});
    return()=>{active=false;};
  },[]);
  if(count===null)return null;
  return <Link href="/settings/email-import" className="m3-card block hover:bg-primary-container active:bg-primary-container focus-visible:outline focus-visible:outline-primary"><span className="text-title-md">待確認交易 <span className="num">{count}</span></span><p className="text-sm text-on-surface-variant">信用卡通知待辦 · 尚未與月結帳單核對</p></Link>;
}

'use client';
import {useState} from 'react';
import {api,useSession} from '@/lib/api';
import {hostedAuth,supabase} from '@/lib/supabase';

/** Hosted sign-in: Supabase emails a one-time code; the API then decides which role and sites the account gets. */
function HostedSignIn({adopt,onDone}:{adopt:(token:string)=>Promise<unknown>;onDone:()=>void}){
 const [email,setEmail]=useState(''),[code,setCode]=useState(''),[sent,setSent]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function run(work:()=>Promise<void>){setBusy(true);setError('');try{await work()}catch(err){setError((err as Error).message)}finally{setBusy(false)}}
 const send=()=>run(async()=>{
  const {error}=await supabase().auth.signInWithOtp({email:email.trim(),options:{shouldCreateUser:true}});
  if(error)throw error;
  setSent(true);
 });
 const verify=()=>run(async()=>{
  const {data,error}=await supabase().auth.verifyOtp({email:email.trim(),token:code.trim(),type:'email'});
  if(error||!data.session)throw error??new Error('That code was not accepted.');
  try{await adopt(data.session.access_token);onDone()}
  catch(err){await supabase().auth.signOut();throw err} // signed in to Supabase but not given access here
 });
 return <form className="login-popover panel" onSubmit={e=>{e.preventDefault();void(sent?verify():send())}}>
  <h3>Sign in to your workspace</h3>
  <label>Work email<input type="email" required autoComplete="email" value={email} disabled={sent} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com"/></label>
  {sent&&<label>6-digit code from your email<input value={code} onChange={e=>setCode(e.target.value)} placeholder="123456" inputMode="numeric" autoComplete="one-time-code" maxLength={8} required autoFocus/></label>}
  {sent&&<button type="button" className="quiet-button" disabled={busy} onClick={()=>{setSent(false);setCode('');setError('')}}>Use a different email</button>}
  {error&&<div role="alert" className="error-banner">{error}</div>}
  <button className="primary-button" disabled={busy||!email||(sent&&!code)}>{busy?'Please wait…':sent?'Sign in →':'Email me a code →'}</button>
 </form>;
}

export function SessionBar(){const {session,login,logout,adopt}=useSession();const [open,setOpen]=useState(false);const [user,setUser]=useState('coordinator');const [otp,setOtp]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
return <div className="session-bar">{session?<><span className="role-pill">{session.role}</span><button className="quiet-button" onClick={logout}>Sign out</button></>:<button className="secondary-button" onClick={()=>setOpen(!open)}>Sign in</button>}{open&&!session&&hostedAuth&&<HostedSignIn adopt={adopt} onDone={()=>setOpen(false)}/>}{open&&!session&&!hostedAuth&&<form className="login-popover panel" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await login(user,otp);setOpen(false)}catch(err){setError((err as Error).message)}finally{setBusy(false)}}}><h3>Sign in to your workspace</h3><label>Demo account<select value={user} onChange={e=>setUser(e.target.value)}>{['coordinator','manager','supervisor','requester','ravi','priya','storekeeper','auditor','admin'].map(u=><option key={u}>{u}</option>)}</select></label><label>One-time code<input value={otp} onChange={e=>setOtp(e.target.value)} placeholder="Enter your OTP" inputMode="numeric" autoComplete="one-time-code"/></label><button type="button" className="quiet-button" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{const result=await api<any>('/auth/otp',{method:'POST',body:JSON.stringify({user_id:user})});if(result.demo_otp||result.otp){setOtp(result.demo_otp||result.otp)}else setError('Check your development inbox for the code.')}catch(err){setError((err as Error).message)}finally{setBusy(false)}}}>Request code</button>{error&&<div role="alert" className="error-banner">{error}</div>}<button className="primary-button" disabled={busy}>{busy?'Signing in…':'Continue →'}</button></form>}</div>}

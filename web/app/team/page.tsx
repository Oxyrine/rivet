'use client';
import {useCallback,useEffect,useState} from 'react';
import {api,useSession} from '../../lib/api';
import s from './team.module.css';

type Person={user_id:string;role:string;sites:string[];technician_id?:string|null;email?:string|null;phone?:string|null;linked:boolean};
const ist=(iso:string)=>new Date(iso).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'medium',timeZone:'Asia/Kolkata'});

export default function Team(){
 const {session}=useSession();
 const [people,setPeople]=useState<Person[]>([]),[drafts,setDrafts]=useState<Record<string,string>>({}),[message,setMessage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState('');
 const [clock,setClock]=useState(''),[controls,setControls]=useState<'unknown'|'on'|'off'>('unknown'),[when,setWhen]=useState('2026-10-07T09:02'),[armed,setArmed]=useState(false);
 const isAdmin=session?.role==='admin';
 const load=useCallback(async()=>{
  try{
   setPeople(await api<Person[]>('/admin/users'));
   setClock((await api<{now:string}>('/admin/clock')).now);
   setError('');
  }catch(e){setError((e as Error).message)}
 },[]);
 useEffect(()=>{if(isAdmin)void load()},[isAdmin,load]);
 async function act(key:string,work:()=>Promise<string>){
  setBusy(key);setError('');setMessage('');
  try{setMessage(await work());await load()}
  catch(e){const text=(e as Error).message;setError(/disabled/i.test(text)?'Demo controls are off on this server. Set DEMO_CONTROLS=1 on the API to turn them on.':text);if(/disabled/i.test(text))setControls('off')}
  finally{setBusy('')}
 }
 const link=(p:Person)=>act('link:'+p.user_id,async()=>{
  const email=(drafts[p.user_id]??p.email??'').trim();
  await api(`/admin/users/${p.user_id}/link`,{method:'POST',body:JSON.stringify({email})});
  return `${p.user_id} is now linked to ${email.toLowerCase()}.`;
 });
 const setTime=()=>act('clock',async()=>{const r=await api<{now:string}>('/admin/clock',{method:'POST',body:JSON.stringify({set:`${when}:00+05:30`})});setControls('on');return `Clock set to ${ist(r.now)} IST.`});
 const advance=(seconds:number,label:string)=>act('clock',async()=>{const r=await api<{now:string}>('/admin/clock',{method:'POST',body:JSON.stringify({advance:seconds})});setControls('on');return `Moved ${label}: ${ist(r.now)} IST.`});
 const reset=()=>act('reset',async()=>{await api('/admin/reset',{method:'POST'});setArmed(false);setControls('on');return 'Demo data is back to the clean seed. People stay linked.'});

 if(!session)return <main className="workspace"><p className="eyebrow">TEAM ACCESS</p><h1>Who can sign in</h1><div className="panel">Sign in as an administrator to manage access.</div></main>;
 if(!isAdmin)return <main className="workspace"><p className="eyebrow">TEAM ACCESS</p><h1>Who can sign in</h1><div className="panel">Only administrators can manage access and demo controls.</div></main>;
 return <main className="workspace">
  <p className="eyebrow">TEAM ACCESS</p>
  <h1>Who can sign in</h1>
  <p className="muted">A sign-in only works once its email is linked to a person here. The person carries the role and the sites they can see.</p>
  {error&&<p role="alert" className="error-banner">{error}</p>}
  {message&&<p role="status" className={s.ok}>{message}</p>}
  <section className="panel">
   <div className={s.scroller}><table>
    <thead><tr><th>Person</th><th>Role</th><th>Sites</th><th>Signs in with</th><th aria-label="Action"/></tr></thead>
    <tbody>{people.map(p=><tr key={p.user_id}>
     <td><b>{p.user_id}</b>{p.technician_id&&<small className={s.sub}>technician</small>}</td>
     <td><span className="badge">{p.role}</span></td>
     <td>{p.sites.join(', ')||'—'}</td>
     <td><input type="email" aria-label={`Email for ${p.user_id}`} placeholder="name@company.com" value={drafts[p.user_id]??p.email??''} onChange={e=>setDrafts(d=>({...d,[p.user_id]:e.target.value}))}/></td>
     <td><button disabled={!!busy||!(drafts[p.user_id]??p.email??'').trim()||(drafts[p.user_id]??p.email??'').trim().toLowerCase()===(p.email??'').toLowerCase()} onClick={()=>link(p)}>{busy==='link:'+p.user_id?'Linking…':p.linked?'Change':'Link'}</button></td>
    </tr>)}</tbody></table></div>
   <p className="muted">Create the person's sign-in in Supabase first (Authentication, Users, Add user), then link the same email here.</p>
  </section>
  <section className="panel">
   <h2>Demo controls</h2>
   <p className="muted">For rehearsals and the stage demo. The server clock is <b>{clock?`${ist(clock)} IST`:'…'}</b>{controls==='off'&&' (real time: controls are off)'}.</p>
   <div className="toolbar">
    <input type="datetime-local" aria-label="Set the clock (India time)" value={when} onChange={e=>setWhen(e.target.value)}/>
    <button disabled={!!busy} onClick={setTime}>Set clock (IST)</button>
    <button disabled={!!busy} onClick={()=>advance(600,'10 minutes forward')}>+10 min</button>
    <button disabled={!!busy} onClick={()=>advance(3600,'1 hour forward')}>+1 hour</button>
   </div>
   <div className="toolbar">
    {!armed?<button className={s.danger} disabled={!!busy} onClick={()=>setArmed(true)}>Reset demo data…</button>
     :<><span className="muted">This erases every request, job and proof record and restores the clean seed.</span><button className={s.danger} disabled={!!busy} onClick={reset}>{busy==='reset'?'Resetting…':'Yes, erase and reset'}</button><button disabled={!!busy} onClick={()=>setArmed(false)}>Cancel</button></>}
   </div>
  </section>
 </main>;
}

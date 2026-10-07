'use client';
import {useState} from 'react';
import s from './plan-ranking.module.css';

const inr=(p:number)=>`₹${(p/100).toLocaleString('en-IN')}`;
const clock=(v?:string)=>v?new Date(v).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'}):'—';
const letter=(i:number)=>String.fromCharCode(65+i);
type Check={ok:boolean;text:string;decisive?:boolean};

/** Mirrors the solver's strict ordering, so each line names a real rule the plans were ranked by. */
function reasons(plans:any[],i:number,total:number):Check[]{
 const p=plans[i],ref=i===0?plans[1]:plans[0],rl=ref?letter(i===0?1:0):'',out:Check[]=[];
 if(p.partial)out.push({ok:false,text:`Places ${p.assignments.length} of ${total} jobs; ${p.unplaced.length} still need follow-up`});
 out.push({ok:p.misses_total===0,text:p.misses_total===0?'No SLA misses among the jobs it places':`${p.misses_total} projected SLA miss${p.misses_total>1?'es':''}`});
 out.push({ok:p.penalty_paise===0,text:p.penalty_paise===0?'No penalty exposure':`Penalty exposure ${inr(p.penalty_paise)}`});
 if(ref){
  // [mine, theirs, formatter, wording when lower, wording when higher]
  const rules:[number,number,(n:number)=>string,string,string][]=[
   [p.unplaced?.length||0,ref.unplaced?.length||0,n=>String(n),'Fewer jobs left unplaced','More jobs left unplaced'],
   [p.misses_total,ref.misses_total,n=>String(n),'Fewer SLA misses','More SLA misses'],
   [p.penalty_paise,ref.penalty_paise,inr,'Lower penalty exposure','Higher penalty exposure'],
   [p.commitments_changed,ref.commitments_changed,n=>String(n),'Fewer changes','More changes'],
   [p.added_travel_minutes,ref.added_travel_minutes,n=>`${n} min`,'Less added travel','More added travel'],
  ];
  let decided=false;
  for(const [a,b,fmt,low,high] of rules){
   if(a===b)continue;
   out.push({ok:a<b,decisive:!decided,text:`${a<b?low:high} than Plan ${rl} (${fmt(a)} vs ${fmt(b)})`});
   decided=true;
  }
  if(!decided)out.push({ok:true,text:`Ties Plan ${rl} on every rule; ordered by continuity with technicians who know the machine`});
 }
 out.push({ok:!p.needs_manager,text:p.needs_manager?`Needs service-manager approval · contractor fee ${inr(p.contractor_fee_paise||0)} shown separately`:'No manager approval needed'});
 return out;
}
function sentence(p:any,total:number){
 const by:Record<string,string[]>={};
 p.assignments.forEach((a:any)=>{(by[a.technician_name]=by[a.technician_name]||[]).push(a.job_id)});
 const who=Object.entries(by).map(([t,j])=>`${t} takes ${j.join(' and ')}`).join('; ');
 const tail=p.partial
  ?`${p.unplaced.map((u:any)=>u.job_id).join(' and ')} cannot be placed and will be flagged for follow-up.`
  :p.misses_total===0?'Every affected job still meets its SLA.':`${p.misses_total} job${p.misses_total>1?'s':''} would miss its SLA.`;
 return `${who}. ${tail}`;
}
const groupBlockers=(blockers:any[])=>Object.entries((blockers||[]).reduce((m:Record<string,string[]>,b:any)=>{(m[b.reason]=m[b.reason]||[]).push(b.name);return m},{}));

/** Why a job could not be placed, and what a person can do next. Escalation is one option among several. */
function JobFollowUp({job,reason}:{job:any;reason?:string}){
 const groups=groupBlockers(job.blockers);
 return <article className={s.jobcard} data-testid={`followup-${job.job_id}`}>
  <header className={s.jobhead}><b>{job.job_id}{job.machine_id?` · ${job.machine_id}`:''}</b><span className={`${s.pri} ${job.priority==='P1'?s.p1:''}`}>{job.priority}</span></header>
  {reason&&<p className={s.reason}>{reason}</p>}
  {!!groups.length&&<><div className={s.label}>Who was ruled out</div>
   <div className={s.chips}>{groups.map(([why,names])=><span key={why} className={s.chip}><b>{names.join(', ')}</b> · {why.toLowerCase()}</span>)}</div></>}
  {!!job.next_steps?.length&&<><div className={s.label}>What you can do</div>
   <ol className={s.steps}>{job.next_steps.map((t:string,i:number)=><li key={i}>{t}</li>)}</ol></>}
 </article>;
}

export function PlanRanking({recovery,busy,role,onApprove}:{recovery:any;busy:boolean;role:string;onApprove:(id:string)=>void}){
 const complete:any[]=recovery.plans||[],partialPlans:any[]=recovery.partial_plans||[];
 const plans=complete.length?complete:partialPlans,[picked,setPicked]=useState(0),pick=Math.min(picked,Math.max(0,plans.length-1));
 const diagnostics:any[]=recovery.jobs||[],total=diagnostics.length||(recovery.impact?.affected_jobs?.length??0);
 const refused=Object.values((recovery.rejected||[]).reduce((m:any,r:any)=>{
  const k=r.candidate+'|'+r.reason;
  (m[k]=m[k]||{candidate:r.candidate,reason:r.reason,jobs:[]}).jobs.push(r.job_id);
  return m;
 },{})) as any[];
 const chosen=plans[pick],checks=chosen?reasons(plans,pick,total):[],canApprove=['coordinator','manager','admin'].includes(role)&&(!chosen?.needs_manager||['manager','admin'].includes(role));
 const left=chosen?.partial?chosen.unplaced:[];
 const followUps=chosen?.partial?left.map((u:any)=>({job:diagnostics.find(d=>d.job_id===u.job_id)||{job_id:u.job_id,priority:u.priority},reason:u.reason})):(!plans.length?diagnostics.map(d=>({job:d,reason:undefined})):[]);
 return <div className={s.wrap}>
  {recovery.no_feasible_path&&<div className={`${s.notice} ${plans.length?'':s.alert}`} role="alert" data-testid="recovery-notice">
   <b>{plans.length?'No plan places every job':'No technician can take these jobs right now'}</b><span>{recovery.message}</span></div>}
 {!!plans.length&&<div className={s.scroller}><table className={s.table}>
   <thead><tr><th>Plan</th><th>SLA misses</th><th>Penalty exposure</th><th>Changes</th><th>Added travel</th></tr></thead>
   <tbody>
    {plans.map((p,i)=><tr key={p.id} className={`${s.row} ${i===pick?s.picked:''}`} onClick={()=>setPicked(i)} tabIndex={0} aria-selected={i===pick} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setPicked(i)}}}>
     <td><div className={s.plancell}><span className={s.letter}>{letter(i)}</span><span className={s.who}><b>{p.partial?`Partial · saves ${p.assignments.length} of ${total}`:i===0?'Recommended':p.needs_manager?'Contractor, needs manager':`Option ${letter(i)}`}</b><small>{p.assignments.map((a:any)=>`${a.job_id} → ${a.technician_name}`).join(' · ')}{p.partial&&p.unplaced.length?` · ${p.unplaced.map((u:any)=>u.job_id).join(', ')} left`:''}</small></span></div></td>
     <td className={p.misses_total?s.bad:''}>{p.misses_total}</td>
     <td className={p.penalty_paise?s.bad:''}>{inr(p.penalty_paise)}</td>
     <td>{p.commitments_changed}</td>
     <td>{p.added_travel_minutes} min</td>
    </tr>)}
   </tbody></table></div>}
  <div className={`${s.cols} ${chosen?s.two:''}`}><div className={s.main}>
  {chosen&&<section className={s.why}>
   <h3>Why Plan {letter(pick)}?</h3>
   <ul>{checks.map((c,i)=><li key={i} className={c.ok?s.ok:s.no}><span aria-hidden="true">{c.ok?'✓':'✕'}</span>{c.text}{c.decisive&&<em>decides the order</em>}</li>)}</ul>
  </section>}
  </div><div className={s.side}>
  {chosen&&<section className={s.decision} aria-live="polite">
   <p className={s.plain}><span>IN PLAIN WORDS</span>{sentence(chosen,total)} {chosen.assignments.length>0&&`First job starts ${clock(chosen.assignments[0].planned_start)}.`}</p>
   <p className={s.note}>{chosen.confidence}{recovery.truncated?' Search time budget reached; best feasible plans so far are shown.':''}</p>
   <div className={s.actions}>
    <button className={s.approve} disabled={busy||!canApprove} onClick={()=>onApprove(chosen.id)}>{chosen.needs_manager?'Approve as manager':chosen.partial?`Approve partial Plan ${letter(pick)}`:`Approve Plan ${letter(pick)}`} →</button>
    {chosen.partial&&<small>Applies the jobs it places now. The rest stay flagged for follow-up.</small>}
    {!canApprove&&<small>{chosen.needs_manager?'Only a service manager can approve contractor recovery.':'Only a dispatcher can approve a plan.'}</small>}
   </div>
  </section>}
  {!!followUps.length&&<section className={s.followup} data-testid="followups">
   <h3>{plans.length?'Needs follow-up':'Why nobody can take them'}</h3>
   {followUps.map(({job,reason}:{job:any;reason?:string})=><JobFollowUp key={job.job_id} job={job} reason={reason}/>)}
  </section>}
  {!!refused.length&&!!plans.length&&<details className={s.ruledout}>
   <summary>Who was ruled out ({refused.length})</summary>
   <ul>{refused.map((r,i)=>{const jobs=[...new Set(r.jobs.filter(Boolean))];return <li key={i}><span className={s.cross}>✕</span><b>{r.candidate}</b><small>{r.reason}{jobs.length?` · ${jobs.join(', ')}`:''}</small></li>})}</ul>
  </details>}
  </div></div>
 </div>;
}

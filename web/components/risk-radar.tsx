'use client';
import {useState} from 'react';
import s from './risk-radar.module.css';

export type RiskRow={job_id:string;machine_id:string;priority:string;technician_id?:string;deadline:string;tier:'critical'|'high'|'watch'|'ok';sla_margin_minutes:number;signals:{signal:string;points:number;detail:string}[]};
const TIERS=[['critical','Critical'],['high','High'],['watch','Watch'],['ok','On track']] as const;
const clock=(v:string)=>new Date(v).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'});
const SHOWN=4;

/** Everything a dropout caused is one card, not one card per job: the cause is what a dispatcher acts on. */
export function groupByCause(rows:RiskRow[]){
 const groups=new Map<string,{tech:string;title:string;jobs:RiskRow[]}>();
 const rest:RiskRow[]=[];
 for(const r of rows){
  const drop=r.signals.find(x=>x.signal==='Technician dropout');
  if(drop&&r.technician_id){const g=groups.get(r.technician_id)||{tech:r.technician_id,title:drop.detail,jobs:[]};g.jobs.push(r);groups.set(r.technician_id,g)}
  else if(r.tier!=='ok')rest.push(r);
 }
 return {causes:[...groups.values()],rest};
}

export function RiskRadar({risk,canAct,onOpenJob,onTrace}:{risk:RiskRow[];canAct:boolean;onOpenJob:(id:string)=>void;onTrace:(tech:string,to:'impact'|'plans')=>void}){
 const [all,setAll]=useState(false);
 const {causes,rest}=groupByCause(risk);
 const count=(t:string)=>risk.filter(r=>r.tier===t).length;
 const ok=risk.filter(r=>r.tier==='ok'),tight=ok.length?Math.min(...ok.map(r=>r.sla_margin_minutes)):null;
 const shown=all?rest:rest.slice(0,SHOWN);
 return <div className={s.radar}>
  <div className={s.tiers} role="img" aria-label={TIERS.map(([t,l])=>`${count(t)} ${l}`).join(', ')}>
   <div className={s.bar}>{TIERS.map(([t])=>count(t)>0&&<i key={t} className={s[t]} style={{flexGrow:count(t)}}/>)}</div>
   <ul className={s.legend}>{TIERS.map(([t,l])=><li key={t}><i className={s[t]}/><b>{count(t)}</b> {l}</li>)}</ul>
  </div>

  {causes.map(g=><article key={g.tech} className={`${s.cause} ${s[TIERS.find(([t])=>g.jobs.some(j=>j.tier===t))![0]]}`} data-testid={`cause-${g.tech}`}>
   <header><b>{g.title}</b><span>{g.jobs.length} job{g.jobs.length>1?'s':''} affected · {g.jobs.filter(j=>j.priority==='P1').length} P1 · first deadline {clock(g.jobs.map(j=>j.deadline).sort()[0])}</span></header>
   <div className={s.chips}>{g.jobs.map(j=><button key={j.job_id} className={`${s.chip} ${s[j.tier]}`} onClick={()=>onOpenJob(j.job_id)} title={j.signals.map(x=>x.signal).join(' · ')}>{j.job_id}<small>{j.priority}</small></button>)}</div>
   <footer>
    <button onClick={()=>onTrace(g.tech,'impact')}>Trace impact</button>
    <button className={s.go} onClick={()=>onTrace(g.tech,'plans')}>{canAct?'Recovery plans →':'View recovery plans →'}</button>
   </footer>
  </article>)}

  {!!shown.length&&<ul className={s.watch} aria-label="Other jobs at risk">{shown.map(r=><li key={r.job_id}>
   <button onClick={()=>onOpenJob(r.job_id)}><i className={`${s.dot} ${s[r.tier]}`} aria-hidden="true"/>
    <b>{r.machine_id}</b><small>{r.job_id} · {r.priority}</small>
    <span>{r.signals[0]?.signal}{r.sla_margin_minutes<30?` · ${r.sla_margin_minutes}m`:''}</span></button></li>)}</ul>}
  {rest.length>SHOWN&&<button className={s.more} onClick={()=>setAll(!all)}>{all?'Show fewer':`${rest.length-SHOWN} more at risk`}</button>}

  {!causes.length&&!rest.length&&<p className={s.clear}>Nothing is at risk right now.</p>}
  {!!ok.length&&<p className={s.healthy}>{ok.length} job{ok.length>1?'s':''} on track{tight!==null?` · tightest SLA margin ${tight} min`:''}</p>}
 </div>;
}

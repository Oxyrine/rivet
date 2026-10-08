'use client';
import {useEffect,useRef,useState} from 'react';
import {api} from '../lib/api';
import s from './reconciliation-table.module.css';

type Row={check:string;planned?:number;reported?:number|null;corroborated?:number;outcome:string;strength?:string;reason?:string|null;missing?:string[]};
const MARK:Record<string,{sym:string;cls:string;label:string}>={
 'Clean':{sym:'✓',cls:'good',label:'Matches'},
 'Explained variance':{sym:'⚠',cls:'warn',label:'Explained'},
 'Unconfirmed':{sym:'⚠',cls:'warn',label:'Unconfirmed'},
 'Unexplained':{sym:'✕',cls:'bad',label:'Disagrees'},
};
const OUTCOME_TEXT:Record<string,string>={'Clean':'Clean','Explained variance':'Explained variance','Unexplained':'Unexplained, closure blocked'};

/** Three sources side by side: the plan, what the technician reported, and records the technician does not write. */
export function ReconciliationTable({job,onResult}:{job:any;onResult?:(result:any)=>void}){
 const [recon,setRecon]=useState<any>(null),[error,setError]=useState('');
 const report=useRef(onResult);report.current=onResult;
 useEffect(()=>{report.current?.(recon)},[recon]);
 useEffect(()=>{
  if(!job?.id||!job.report){setRecon(null);return}
  setRecon(null);
  let live=true;
  api<any>(`/jobs/${job.id}/reconciliation`).then(r=>{if(live){setRecon(r);setError('')}}).catch(e=>live&&setError((e as Error).message));
  return()=>{live=false};
 },[job?.id,job?.report_hash,job?.state,job?.acceptance]);
 if(!job?.report)return <p className={s.empty}>No report has been submitted yet. Reconciliation runs when the technician submits one.</p>;
 if(error)return <p className={s.error} role="alert">{error}</p>;
 if(!recon)return <p className={s.empty}>Reconciling the report against the records…</p>;
 const ticked=job.report.checklist?.length||0;
 const cells=(r:Row):[string,string,string]=>{
  if(r.check==='Mandatory checklist')return [`${ticked+(r.missing?.length||0)} required`,`${ticked} ticked`,r.missing?.length?`Missing: ${r.missing.join(', ')}`:'All required steps present'];
  if(r.check==='Photos')return ['Before and after photos','Attached to the job',r.missing?.length?`Missing: ${r.missing.join(', ')}`:'File bytes received and hashed by the server'];
  if(r.check==='Work duration')return [`${job.duration_minutes} min expected`,`${r.reported} min`,`${r.corroborated} min between check-in and check-out`];
  return [String(r.planned??0),String(r.reported??0),r.outcome==='Unconfirmed'?'No store issue recorded yet':`${r.corroborated} issued by the store`];
 };
 const blocked=recon.outcome==='Unexplained';
 const presence=String(recon.presence||'weak');
 return <div className={s.wrap}>
  {blocked&&<div className={s.blocked} role="alert"><b>Closure blocked</b><span>The report disagrees with records the technician does not write. It cannot be accepted until the lines marked ✕ are corrected or a manager signs off.</span></div>}
  <div className={s.scroller}><table className={s.table}>
   <thead><tr><th>Check</th><th>Plan</th><th>Field report</th><th>Corroborating records</th><th aria-label="Result"/></tr></thead>
   <tbody>{(recon.rows as Row[]).map(r=>{
    const [plan,report,record]=cells(r),m=MARK[r.outcome]||MARK.Unexplained;
    return <tr key={r.check} className={s[m.cls]}>
     <td><b>{r.check}</b>{r.strength&&<small>{r.strength}</small>}</td>
     <td>{plan}</td><td>{report}</td>
     <td>{record}{r.reason&&<small className={s.reason}>Reason given: {r.reason}</small>}</td>
     <td><span className={s.mark} title={r.outcome}><i aria-hidden="true">{m.sym}</i>{m.label}</span></td>
    </tr>;
   })}</tbody></table></div>
  <footer className={s.foot}>
   <span className={s.outcome} data-outcome={recon.outcome}>{OUTCOME_TEXT[recon.outcome]||recon.outcome}</span>
   <span>Presence <b className={presence.startsWith('strong')?s.good:presence.startsWith('medium')?s.warn:s.bad}>{presence.split(';')[0]}</b></span>
   <span>Fix confirmation <b>{recon.fix}</b></span>
   {recon.flags?.length>0&&<span className={s.bad}>Flags: {recon.flags.join(', ').replaceAll('_',' ').toLowerCase()}</span>}
  </footer>
 </div>;
}

'use client';
import {useMemo,useState} from 'react';
import s from './commitment-graph.module.css';

type GNode={id:string;type:string;job_id?:string;owner?:string;resource?:string;state:string};
type Impact={roots:string[];nodes:GNode[];edges:{source:string;target:string}[];affected_jobs:string[];unaffected_jobs:string[];commitments_walked:number;part_holds_affected:number};
const LABEL:Record<string,string>={TECH_TIME:'Technician time',TECH_ASSIGN:'Technician time',PART_HOLD:'Part hold',TOOL_HOLD:'Tool hold',SLA_WINDOW:'SLA window',APPROVAL:'Approval',ACCESS_WINDOW:'Access window',PERMIT_TO_WORK:'Permit'};
const W=184,H=66,GX=24,GY=58,STEP=0.45;
const name=(v?:string)=>v?v.charAt(0).toUpperCase()+v.slice(1):'';

/** Fixed top-down layout: layer = longest recorded dependency path from the broken commitment, so nothing moves while it is read. */
export function CommitmentGraph({impact,jobs,risk,technicianName,onOpenJob}:{impact:Impact;jobs:any[];risk:any[];technicianName:string;onOpenJob?:(id:string)=>void}){
 const [why,setWhy]=useState('');
 const g=useMemo(()=>{
  const ids=new Set(impact.nodes.map(n=>n.id)),depth:Record<string,number>={};
  impact.roots.forEach(r=>{depth[r]=0});
  for(let pass=0;pass<impact.nodes.length;pass++){
   let moved=false;
   for(const e of impact.edges){
    if(depth[e.source]===undefined||!ids.has(e.target))continue;
    const d=depth[e.source]+1;
    if((depth[e.target]??-1)<d){depth[e.target]=d;moved=true}
   }
   if(!moved)break;
  }
  const layers:GNode[][]=[];
  impact.nodes.forEach(n=>{const d=depth[n.id]??0;(layers[d]=layers[d]||[]).push(n)});
  const widest=Math.max(1,...layers.map(l=>l?.length||0)),width=widest*(W+GX)-GX;
  const at:Record<string,{x:number;y:number}>={};
  layers.forEach((layer,d)=>{
   if(!layer)return;
   layer.sort((a,b)=>(a.job_id||'').localeCompare(b.job_id||'')||a.type.localeCompare(b.type)||a.id.localeCompare(b.id));
   const rowW=layer.length*(W+GX)-GX;
   layer.forEach((n,i)=>{at[n.id]={x:(width-rowW)/2+i*(W+GX),y:d*(H+GY)}});
  });
  return {depth,at,width,height:Math.max(1,layers.length)*(H+GY)-GY};
 },[impact]);
 const missed=impact.affected_jobs.filter(id=>risk.find(r=>r.job_id===id)?.signals?.some((x:any)=>x.signal==='Projected SLA miss')).length;
 const explain=(id:string)=>{
  const job=jobs.find(j=>j.id===id);
  if(!job)return '';
  const parts=Object.keys(job.planned_parts||{});
  const shared=impact.affected_jobs.some(a=>Object.keys(jobs.find(j=>j.id===a)?.planned_parts||{}).some(p=>parts.includes(p)));
  return `${id}: different technician (${name(job.technician_id)||'unassigned'}), ${shared?'its own part reservation is separate from the affected holds':'no shared part hold'}. Nothing it depends on was broken.`;
 };
 const plural=impact.affected_jobs.length===1?'':'s',holds=impact.part_holds_affected===1?'':'s';
 return <div className={s.graph}>
  <div className={s.headline}>
   <div><strong>{impact.affected_jobs.length}</strong><span>jobs hit</span></div>
   <div><strong className={missed?s.hot:''}>{missed}</strong><span>SLAs at risk</span></div>
   <div><strong>{impact.part_holds_affected}</strong><span>part hold{holds} stranded</span></div>
  </div>
  <p className={s.caption}><b>{technicianName}</b> became unavailable · {impact.affected_jobs.length} downstream job{plural} affected</p>
  <div className={s.scroller}>
   <svg role="img" aria-label={`Commitment graph: ${impact.commitments_walked} dependent commitments walked from ${technicianName}`} viewBox={`-6 -6 ${g.width+12} ${g.height+12}`} style={{minWidth:Math.min(g.width,760)}}>
    {impact.edges.filter(e=>g.at[e.source]&&g.at[e.target]).map(e=>{
     const a=g.at[e.source],b=g.at[e.target],x1=a.x+W/2,y1=a.y+H,x2=b.x+W/2,y2=b.y,m=(y1+y2)/2;
     return <path key={e.source+e.target} pathLength={1} className={s.edge} style={{animationDelay:`${(g.depth[e.source]??0)*STEP}s`}} d={`M${x1} ${y1}C${x1} ${m} ${x2} ${m} ${x2} ${y2}`}/>;
    })}
    {impact.nodes.map(n=>{
     const p=g.at[n.id];
     if(!p)return null;
     const root=impact.roots.includes(n.id),job=jobs.find(j=>j.id===n.job_id),open=!!(onOpenJob&&n.job_id);
     return <g key={n.id} transform={`translate(${p.x} ${p.y})`} className={`${s.node} ${root?s.root:''}`} style={{animationDelay:`${(g.depth[n.id]??0)*STEP}s`}} onClick={()=>open&&onOpenJob!(n.job_id!)} role={open?'button':undefined} tabIndex={open?0:undefined} onKeyDown={e=>{if(e.key==='Enter'&&open)onOpenJob!(n.job_id!)}}>
      <rect width={W} height={H} rx={2}/>
      <text x={12} y={20} className={s.kind}>{(LABEL[n.type]||n.type).toUpperCase()}</text>
      <text x={12} y={41} className={s.title}>{n.job_id||n.id}{job?` · ${job.machine_id}`:''}</text>
      <text x={12} y={57} className={s.meta}>{[n.resource&&n.resource!=='TIME'?n.resource:'',name(n.owner),n.state.toLowerCase()].filter(Boolean).join(' · ')}</text>
     </g>;
    })}
   </svg>
  </div>
  <footer className={s.foot}>
   <span>{impact.commitments_walked} dependent commitments walked · {impact.affected_jobs.length} jobs and {impact.part_holds_affected} part hold{holds} affected</span>
   <div className={s.unaffected}>
    <span>{impact.unaffected_jobs.length} other open jobs: unaffected. Tap one to see why.</span>
    <div>{impact.unaffected_jobs.map(id=><button key={id} className={why.startsWith(id+':')?s.chosen:''} onClick={()=>setWhy(explain(id))}>{id}</button>)}</div>
    {why&&<p role="status">{why}</p>}
   </div>
  </footer>
 </div>;
}

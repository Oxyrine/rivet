/* No network requests. Input keys and anchors come from customer-owned storage. */
export const canonical = value => {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('Hashed numbers must be safe integers');
  if (Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
  if (value && typeof value === 'object') return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  return JSON.stringify(value);
};
const utf8 = new TextEncoder();
const decode = s => Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const hex = a => Array.from(new Uint8Array(a)).map(b=>b.toString(16).padStart(2,'0')).join('');
export const digest = async (prev, value) => hex(await crypto.subtle.digest('SHA-256',utf8.encode(prev+canonical(value))));
export async function verifyPackage(pkg, pinnedKey, anchors=[]) {
  const errors=[]; const b=pkg.body;
  if(pkg.key.public_key!==pinnedKey) errors.push('Signing key differs from pinned onboarding key');
  try {
    const key=await crypto.subtle.importKey('raw',decode(pinnedKey),{name:'Ed25519'},false,['verify']);
    if(!await crypto.subtle.verify('Ed25519',key,decode(pkg.signature),utf8.encode(canonical(b)))) errors.push('Provider signature invalid');
  } catch(e) { errors.push('Provider signature could not be verified: '+e.message); }
  let previous='0'.repeat(64); const heads={};
  for(let i=0;i<b.events.length;i++) {
    const e=b.events[i]; const v={};
    for(const k of ['event_id','machine','machine_seq','type','occurred_at','payload','cause_hash'])v[k]=e[k]??null;
    if(e.machine_seq!==i+1 || e.machine_prev_hash!==previous || await digest(previous,v)!==e.machine_hash) {errors.push('Machine chain diverges at event '+(i+1));break;}
    previous=e.machine_hash; heads[e.machine_seq]=previous;
  }
  if(previous!==b.head)errors.push('Package head differs from chain');
  if(b.report && hex(await crypto.subtle.digest('SHA-256',utf8.encode(canonical(b.report))))!==b.report_hash)errors.push('Report fingerprint mismatch');
  for(const a of anchors)if(a.machine_id===b.machine_id && heads[a.machine_seq]!==a.machine_hash)errors.push('History diverges from customer-held acceptance at event '+a.machine_seq);
  let sla=null;
  const restored=b.events.filter(e=>e.type==='ServiceRestored'&&e.payload.job_id===b.job_id).at(-1);
  if(restored) {
    const p=restored.payload; const start=Date.parse(p.started_at), stop=Date.parse(p.restored_at); const intervals=p.pauses.filter(x=>x.confirmed&&x.end).map(x=>[Math.max(start,Date.parse(x.start)),Math.min(stop,Date.parse(x.end))]).filter(x=>x[1]>x[0]).sort((a,c)=>a[0]-c[0]);
    const merged=[]; for(const x of intervals) {const last=merged.at(-1);if(last&&x[0]<=last[1])last[1]=Math.max(last[1],x[1]);else merged.push(x);}
    const elapsed=Math.max(0,Math.floor((stop-start-merged.reduce((n,x)=>n+x[1]-x[0],0))/1000)), target=p.contract.resolution_minutes*60, late=Math.max(0,elapsed-target);
    sla={met:late===0,running_seconds:elapsed,late_seconds:late,margin_minutes:Math.floor((target-elapsed)/60),penalty_paise:Math.min(Math.ceil(late/(p.contract.penalty_unit_minutes*60))*p.contract.penalty_rate_paise,p.contract.penalty_cap_paise)};
    if(canonical(sla)!==canonical(b.sla))errors.push('SLA differs from event recomputation');
  }
  return {valid:errors.length===0,errors,head:previous,sla,anchored:anchors.some(a=>a.machine_id===b.machine_id)};
}

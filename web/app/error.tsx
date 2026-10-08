'use client';
import {useEffect} from 'react';

/** Replaces Next's blank "This page couldn't load" so the cause is visible, and heals the common stale-script case by reloading once. */
export default function RouteError({error,reset}:{error:Error&{digest?:string};reset:()=>void}){
 const stale=/ChunkLoadError|Loading chunk|Failed to fetch dynamically imported|Importing a module script failed/i.test(`${error.name} ${error.message}`);
 useEffect(()=>{
  console.error('[rivet] page error',error);
  try{if(stale&&!sessionStorage.getItem('rivet.chunk-reload')){sessionStorage.setItem('rivet.chunk-reload','1');location.reload()}}catch{}
 },[error,stale]);
 return <main role="alert" style={{maxWidth:520,margin:'18vh auto 0',padding:'0 20px',color:'var(--text,#1b2630)',fontFamily:'inherit'}}>
  <h1 style={{fontSize:24,margin:'0 0 8px'}}>This page couldn't load</h1>
  <p style={{margin:'0 0 16px'}}>{stale?'A part of the app failed to download, usually a patchy connection or a new version. Reload to fetch it again.':'Something went wrong on this screen. Your work in the field app is saved on the device.'}</p>
  <p style={{margin:'0 0 20px',fontSize:13,opacity:.7,wordBreak:'break-word'}}>{error.message||error.name}{error.digest?` (ref ${error.digest})`:''}</p>
  <div style={{display:'flex',gap:10}}>
   <button onClick={()=>{try{sessionStorage.removeItem('rivet.chunk-reload')}catch{}location.reload()}} style={{padding:'10px 16px',borderRadius:8,border:0,background:'var(--primary,#1f4e79)',color:'var(--on-primary,#fff)',font:'inherit',cursor:'pointer'}}>Reload</button>
   <button onClick={reset} style={{padding:'10px 16px',borderRadius:8,border:'1px solid #8884',background:'transparent',color:'inherit',font:'inherit',cursor:'pointer'}}>Try again</button>
  </div>
 </main>;
}

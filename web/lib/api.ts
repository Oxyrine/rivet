'use client';
import {useEffect,useState} from 'react';
export type Session={user_id:string;role:string;token:string;device_id?:string;sites?:string[]};
const SESSION_KEY='rivet.session';
/** Milliseconds since epoch when a JWT access token stops working; 0 when it cannot be read. */
export function tokenExpiry(token:string){try{return JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).exp*1000||0}catch{return 0}}
function endSession(){localStorage.removeItem(SESSION_KEY);window.dispatchEvent(new Event('rivet:session'))}
export function getSession():Session|null {
 if(typeof window==='undefined')return null;
 try{
  const session:Session|null=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');
  if(session&&tokenExpiry(session.token)<=Date.now()){localStorage.removeItem(SESSION_KEY);return null}
  return session;
 }catch{return null}
}
export class ApiError extends Error {constructor(public code:string,message:string,public details:Record<string,unknown>={},public status=400){super(message)}}
export async function api<T=any>(path:string,init:RequestInit={}):Promise<T>{
 const session=getSession(); const headers=new Headers(init.headers); headers.set('Content-Type','application/json');
 if(session)headers.set('Authorization',`Bearer ${session.token}`);
 if(init.method && !['GET','HEAD'].includes(init.method.toUpperCase())&&!headers.has('Idempotency-Key'))headers.set('Idempotency-Key',crypto.randomUUID());
 const response=await fetch(`/api${path}`,{...init,headers,cache:'no-store'});
 const data=await response.json().catch(()=>({message:response.statusText}));
 if(response.status===401&&session&&!path.startsWith('/auth/')){endSession();throw new ApiError('SESSION_EXPIRED','Your session expired. Sign in again.',{},401)}
 if(!response.ok){const error=data.detail || data;throw new ApiError(error.code||'API_ERROR',typeof error==='string'?error:error.message||`Request failed (${response.status})`,error.details||{},response.status)}
 return data as T;
}
export function useSession(){
 const [session,setSession]=useState<Session|null>(null);
 useEffect(()=>{const refresh=()=>setSession(getSession());refresh();window.addEventListener('rivet:session',refresh);return()=>window.removeEventListener('rivet:session',refresh)},[]);
 useEffect(()=>{if(!session)return;const timer=setTimeout(endSession,Math.min(Math.max(tokenExpiry(session.token)-Date.now(),0),2**31-1)+250);return()=>clearTimeout(timer)},[session]);
 async function login(user_id:string,otp:string){const result=await api<any>('/auth/token',{method:'POST',body:JSON.stringify({user_id,otp})});const principal=result.principal||result.user||result;const next:Session={user_id,role:principal.role||user_id,token:result.access_token,device_id:principal.device_id,sites:principal.sites};localStorage.setItem(SESSION_KEY,JSON.stringify(next));setSession(next);window.dispatchEvent(new Event('rivet:session'));return next;}
 function logout(){localStorage.removeItem(SESSION_KEY);setSession(null);window.dispatchEvent(new Event('rivet:session'));}
 return {session,login,logout};
}

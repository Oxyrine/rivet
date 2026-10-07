'use client';
import {getSession} from './api';
/** A reconnecting audit-event channel. Snapshot polling remains the fallback. */
export function subscribeEvents(onEvent:(event:any)=>void,onStatus?:(connected:boolean)=>void){
 let socket:WebSocket|undefined,timer:ReturnType<typeof setTimeout>|undefined,closed=false,opened=false,failures=0;
 function connect(){
  if(closed)return;
  const token=getSession()?.token;
  if(!token){onStatus?.(false);return} // signed out or expired: polling stops too, nothing to reconnect with
  socket=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/api/ws?token=${encodeURIComponent(token)}`);
  socket.onopen=()=>{opened=true;failures=0;onStatus?.(true)};
  socket.onmessage=message=>{try{onEvent(JSON.parse(message.data))}catch{}};
  // A host that never accepts the upgrade (Vercel does not proxy websockets) is not worth
  // retrying: stop after two attempts and let snapshot polling carry on alone.
  socket.onclose=()=>{onStatus?.(false);if(!opened&&++failures>=2)return;if(!closed)timer=setTimeout(connect,5000)};
  socket.onerror=()=>socket?.close();
 }
 connect();
 return()=>{closed=true;if(timer)clearTimeout(timer);socket?.close()};
}

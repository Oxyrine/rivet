'use client';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';

// Both values are public by design (the publishable key can only do what row-level security allows).
// When they are not set, the app keeps the demo sign-in.
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
// NEXT_PUBLIC_AUTH_MODE=demo forces the built-in demo sign-in (the local, offline fallback) even when the values above are set.
export const hostedAuth=!!(url&&key)&&process.env.NEXT_PUBLIC_AUTH_MODE!=='demo';

let client:SupabaseClient|undefined;
export function supabase():SupabaseClient{
 if(!url||!key)throw new Error('Supabase is not configured for this build.');
 return client??=createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true}});
}

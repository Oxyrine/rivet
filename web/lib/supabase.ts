'use client';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';

// Both values are public by design (the publishable key can only do what row-level security allows).
// When they are not set, the app keeps the demo sign-in.
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const hostedAuth=!!(url&&key);

let client:SupabaseClient|undefined;
export function supabase():SupabaseClient{
 if(!url||!key)throw new Error('Supabase is not configured for this build.');
 return client??=createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true}});
}

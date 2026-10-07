import type {Metadata} from 'next';
import './globals.css';
import {AppShell} from '@/components/app-shell';
export const metadata:Metadata={title:'Rivet — Keep good machines running.',description:'Coordinate field service, recover disrupted schedules and verify the work. Built for industrial equipment teams.'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body><AppShell>{children}</AppShell></body></html>}

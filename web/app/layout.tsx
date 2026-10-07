import type { Metadata, Viewport } from 'next';
import { Barlow_Condensed, IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import './tokens.css';
import './globals.css';
import { AppShell } from '@/components/app-shell';

const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['600'],
  variable: '--font-barlow-condensed',
  display: 'swap',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
});

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Rivet — Keep good machines running.',
  description: 'Coordinate field service, recover disrupted schedules and verify the work. Built for industrial equipment teams.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${barlowCondensed.variable} ${ibmPlexMono.variable} ${ibmPlexSans.variable}`}>
      <body>
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from 'next';
import { Space_Grotesk, Inter, IBM_Plex_Mono, Barlow_Condensed } from 'next/font/google';
import './tokens.css';
import './globals.css';
import { AppShell } from '@/components/app-shell';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
});

const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-barlow-condensed',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Rivet — Industrial Service & Operations Platform',
  description: 'Coordinate heavy industrial equipment servicing, dispatch qualified technicians, resolve schedule disruptions in real time, and maintain complete verified service records.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${inter.variable} ${ibmPlexMono.variable} ${barlowCondensed.variable}`} suppressHydrationWarning>
      <body>
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

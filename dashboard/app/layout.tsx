import type { Metadata } from 'next';
import './globals.css';
import Navigation from '@/components/Navigation';
import { SpotlightProvider } from '@/lib/spotlight';
import { LiveControlProvider } from '@/lib/live-control';

export const metadata: Metadata = {
  title: 'Adaptive Fleet Health & Conflict Coordination',
  description: 'Real-time adaptive baseline anomaly detection, cross-view state sync, and fleet conflict coordination',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen text-gray-900">
        <SpotlightProvider>
          <LiveControlProvider>
            <Navigation />
            {children}
          </LiveControlProvider>
        </SpotlightProvider>
      </body>
    </html>
  );
}

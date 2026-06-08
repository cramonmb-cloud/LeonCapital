import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from '@/hooks/use-auth';
import { getAppConfig } from '@/lib/firestore-data';
import { SpeedInsights } from '@vercel/speed-insights/next';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export async function generateMetadata(): Promise<Metadata> {
  const config = await getAppConfig();
  const appName = config?.appName || 'CrediControl';
  const logoUrl = config?.logoUrl || '';
  const description = `Gestión de préstamos personales para ${appName}`;

  return {
    title: appName,
    description: description,
    manifest: '/manifest.ts',
    icons: {
      icon: logoUrl || '/favicon.ico',
      apple: logoUrl || '/favicon.ico',
    },
    openGraph: {
      title: appName,
      description: description,
      images: [
        {
          url: logoUrl,
          width: 1200,
          height: 630,
          alt: `Logo de ${appName}`,
        },
      ],
      type: 'website',
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=PT+Sans:ital,wght@0,400;0,700;1,400;1,700&display=swap" rel="stylesheet" />
        <meta name="theme-color" content="#ffffff" />
      </head>
      <body className="font-body antialiased">
        <AuthProvider>
            {children}
        </AuthProvider>
        <Toaster />
        <SpeedInsights />
      </body>
    </html>
  );
}

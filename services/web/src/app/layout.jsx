import './globals.css';
import ClientAppShell from '../components/common/ClientAppShell';

export const metadata = {
  title: 'FinTrack - ניהול פיננסי מאובטח',
  description: 'מערכת ניהול פיננסי אישי מאובטחת, סנכרון ישיר לבנקים וכרטיסי אשראי בישראל עם הצפנת Vault',
  applicationName: 'FinTrack',
  manifest: '/manifest.json',
  icons: {
    icon: '/icon-192.svg',
    shortcut: '/icon-192.svg',
    apple: '/icon-192.svg',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'FinTrack',
  },
};

export const viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="he" dir="rtl" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Rubik:ital,wght@0,300..900;1,300..900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased bg-navy-950 text-slate-100 font-sans">
        <ClientAppShell>{children}</ClientAppShell>
      </body>
    </html>
  );
}

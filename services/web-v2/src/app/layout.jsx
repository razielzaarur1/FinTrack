import './globals.css';
import { AppProvider } from '@/lib/app-context';
import Shell from '@/components/shell/Shell';

export const metadata = {
  title: 'FinTrack v2 - Personal Finance',
  description: 'Fast, secure personal finance platform without friction',
  manifest: '/manifest.json',
  icons: {
    icon: '/icon-192.svg',
    shortcut: '/icon-192.svg',
    apple: '/icon-192.svg',
  },
};

export const viewport = {
  themeColor: '#0a0d14',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
              try {
                var theme = localStorage.getItem('fintrack_theme') || 'dark';
                var lang = localStorage.getItem('fintrack_lang') || 'he';
                if (theme === 'light') {
                  document.documentElement.classList.add('light');
                  document.documentElement.classList.remove('dark');
                } else {
                  document.documentElement.classList.add('dark');
                  document.documentElement.classList.remove('light');
                }
                document.documentElement.setAttribute('dir', lang === 'he' ? 'rtl' : 'ltr');
                document.documentElement.setAttribute('lang', lang);
              } catch (e) {}
            })()`,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Rubik:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-dark-bg text-dark-text light:bg-light-bg light:text-light-text antialiased">
        <AppProvider>
          <Shell>{children}</Shell>
        </AppProvider>
      </body>
    </html>
  );
}

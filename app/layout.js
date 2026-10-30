import './globals.css';

export const metadata = {
  title: 'SeriDays — Your Series Companion',
  description: 'ติดตามซีรีส์ คำนวณตอนค้าง และวางแผนวันออนในที่เดียว',
  applicationName: 'SeriDays',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'SeriDays' },
};

export const viewport = { width: 'device-width', initialScale: 1, maximumScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }) {
  return <html lang="th"><body>{children}</body></html>;
}

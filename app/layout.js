import './globals.css';

export const metadata = {
  title: 'SeriDays — Your Series Companion',
  description: 'ติดตามซีรีส์ คำนวณตอนค้าง และวางแผนวันออนในที่เดียว',
  applicationName: 'SeriDays',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'SeriDays' },
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover',
};

export default function RootLayout({ children }) {
  return <html lang="th"><body>{children}</body></html>;
}

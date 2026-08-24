import "./globals.css";

export const metadata = {
  title: "Series Tracker - แท็กซีรีย์ที่ดู",
  description: "แอปแท็กซีรีย์ที่กำลังดู ดูถึงตอนไหนแล้ว",
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}

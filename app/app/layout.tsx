import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "쥬발레아카데미 회원 시스템",
  description:
    "입구 QR로 출석을 체크하고 남은 횟수와 이용 기간을 확인할 수 있습니다.",
  // PWA: manifest는 app/manifest.ts가 만든다. iOS 사파리는 manifest 아이콘 대신 아래 값을 본다.
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: "쥬발레",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 체크인 화면 입력창을 눌렀을 때 모바일 브라우저가 확대하지 않게.
  maximumScale: 1,
  themeColor: "#faf6f0",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

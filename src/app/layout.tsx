import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CoRent — 사기 전에, 며칠만 살아보기",
  description:
    "서울에서 마사지건, 홈케어 디바이스, 소형 운동기구를 1일·3일·7일 동안 빌려 써보세요.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}

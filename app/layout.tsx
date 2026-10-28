import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SwRegister } from "@/components/Notify";
import VercelAnalytics from "@/components/VercelAnalytics";

export const metadata: Metadata = {
  title: "CRL SafeCheck",
  description: "นับคนและติดตามผู้สูญหายเมื่อเกิดเหตุฉุกเฉิน",
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "SafeCheck", statusBarStyle: "default" },
};
// ปิดการซูม ให้ใช้งานเหมือนแอปจริง
export const viewport: Viewport = {
  width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: "cover", themeColor: "#F3F2EE",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600;700&display=swap" />
      </head>
      <body>{children}<SwRegister /><VercelAnalytics /></body>
    </html>
  );
}

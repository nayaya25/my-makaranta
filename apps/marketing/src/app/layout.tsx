import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SmoothScroll } from "../components/smooth-scroll";

export const metadata: Metadata = {
  title: "myMakaranta — The operating system for Nigerian schools",
  description:
    "One platform for attendance, fees in Naira, results, and parent communication. Built for Nigerian schools. Fast on the phones your staff already carry.",
  appleWebApp: { capable: true, title: "myMakaranta", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#FFFFFF",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* General Sans — clean geometric sans (our free stand-in for Lattice's Matter). */}
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="" />
        <link
          href="https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <SmoothScroll />
        {children}
      </body>
    </html>
  );
}

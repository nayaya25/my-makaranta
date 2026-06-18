import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SmoothScroll } from "../components/smooth-scroll";

export const metadata: Metadata = {
  title: "myMakaranta — Run a calmer, sharper school",
  description:
    "myMakaranta takes the register, reconciles the fees in Naira, and publishes results parents are proud to share. Built for Nigerian schools. Fast on the phones your staff already carry.",
  appleWebApp: { capable: true, title: "myMakaranta", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#F0ECE6",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Fraunces — characterful editorial serif for display. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&display=swap"
          rel="stylesheet"
        />
        {/* General Sans — clean, neutral body sans. */}
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="" />
        <link
          href="https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600&display=swap"
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

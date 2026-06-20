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
        {/* Set the theme class before first paint to avoid a flash (FOUC). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
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
        {/* Film-grain texture — fixed, non-interactive; sits above content for a tactile finish. */}
        <div className="grain" aria-hidden="true" />
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Quicksand, Bagel_Fat_One, Space_Mono } from "next/font/google";
import "./globals.css";
import AppFrame from "@/components/AppFrame";

// Brand type (Brand Brief v2): Quicksand body, Bagel Fat One display, Space Mono labels.
// Self-hosted via next/font — only the weights actually used ship.
const quicksand = Quicksand({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-quicksand" });
const bagel = Bagel_Fat_One({ subsets: ["latin"], weight: "400", variable: "--font-bagel" });
const spaceMono = Space_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Happy Fence — Quotes",
  description: "Quote a fence job",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "HFC Quotes", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1C2533",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${quicksand.variable} ${bagel.variable} ${spaceMono.variable}`}>
      <body>
        <AppFrame>{children}</AppFrame>
      </body>
    </html>
  );
}

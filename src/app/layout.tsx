import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import Kop from "@/components/Kop";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "LQS-werkplek",
  description: "Locatie QuickScans voor middenspanningsstations: analyse, afweging en rapportage",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="nl" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <Suspense fallback={<header className="geen-print h-12 shrink-0 bg-slate-900" />}>
          <Kop />
        </Suspense>
        {children}
      </body>
    </html>
  );
}

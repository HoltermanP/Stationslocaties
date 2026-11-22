import type { Metadata } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { Suspense } from "react";
import Kop from "@/components/Kop";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const space = Space_Grotesk({ variable: "--font-space", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "LQS-werkplek | VECTOR Engineering",
  description: "Locatie QuickScans voor middenspanningsstations: analyse, afweging en rapportage",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="nl" className={`${inter.variable} ${space.variable} ${jetbrains.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <Suspense fallback={<header className="geen-print h-14 shrink-0 bg-slate-900" />}>
          <Kop />
        </Suspense>
        {children}
      </body>
    </html>
  );
}

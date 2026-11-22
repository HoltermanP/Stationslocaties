"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Bovenbalk. Op het meekijkportaal staat alleen de naam: de opdrachtgever krijgt geen navigatie naar de werkplek. */
export default function Kop() {
  const meekijken = usePathname().startsWith("/meekijken");
  return (
    <header className="geen-print flex h-12 shrink-0 items-center gap-6 bg-slate-900 px-4 text-white">
      {meekijken ? (
        <span className="font-semibold tracking-tight">Locatie QuickScans <span className="ml-2 font-normal text-slate-300">voortgang voor de opdrachtgever</span></span>
      ) : (
        <>
          <Link href="/" className="font-semibold tracking-tight">LQS-werkplek</Link>
          <nav className="flex gap-4 text-sm text-slate-300">
            <Link href="/" className="hover:text-white">Portfolio</Link>
            <Link href="/lqs/nieuw" className="hover:text-white">Nieuwe LQS</Link>
          </nav>
        </>
      )}
    </header>
  );
}

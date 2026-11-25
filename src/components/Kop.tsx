"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

function Merk() {
  return (
    <span className="flex items-center gap-3">
      <svg viewBox="0 0 34 34" width="34" height="34" role="presentation" aria-hidden="true">
        <rect width="34" height="34" rx="6" fill="#052326" stroke="rgba(255,255,255,.18)" />
        <line x1="9" y1="25" x2="25" y2="9" stroke="#f5a623" strokeWidth="3" strokeLinecap="round" />
        <polyline points="15,9 25,9 25,19" fill="none" stroke="#0bbcae" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="grid leading-none">
        <strong className="font-[family-name:var(--font-head)] text-[1.05rem] tracking-[0.06em]">VECTOR</strong>
        <small className="mt-[5px] font-mono text-[0.6rem] uppercase tracking-[0.18em] text-slate-300">Engineering</small>
      </span>
    </span>
  );
}

/** Bovenbalk in huisstijl VECTOR Engineering. Op het meekijkportaal staat alleen de naam: de opdrachtgever krijgt geen navigatie naar de werkplek. */
export default function Kop() {
  const meekijken = usePathname().startsWith("/meekijken");
  return (
    <div className="geen-print shrink-0">
      <header className="flex h-14 items-center gap-6 bg-slate-900 px-4 text-white">
        {meekijken ? (
          <>
            <Merk />
            <span className="font-mono text-xs uppercase tracking-wider text-slate-300">Locatie QuickScans · voortgang voor de opdrachtgever</span>
          </>
        ) : (
          <>
            <Link href="/" aria-label="VECTOR Engineering, LQS-werkplek"><Merk /></Link>
            <span className="hidden border-l border-white/20 pl-6 font-[family-name:var(--font-head)] font-semibold sm:inline">LQS-werkplek</span>
            <nav className="flex gap-5 text-sm font-medium text-slate-300">
              <Link href="/" className="hover:text-white">Portfolio</Link>
              <Link href="/lqs/nieuw" className="hover:text-white">Nieuwe LQS</Link>
            </nav>
          </>
        )}
      </header>
      <div className="vector-rule" />
    </div>
  );
}

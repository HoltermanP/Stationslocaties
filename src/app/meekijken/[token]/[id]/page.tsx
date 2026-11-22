"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { AUTO_CRITERIA, DOORLOOPTIJD_DAGEN, HAND_CRITERIA, STATION_TYPEN, STATUSSEN } from "@/lib/config";
import type { Meekijk } from "@/lib/repo";
import { dagenTot, datum, ha, rangorde } from "@/lib/score";
import type { Kandidaat, LngLat } from "@/lib/types";

const Kaart = dynamic(() => import("@/components/Kaart"), { ssr: false });
const Kaart3D = dynamic(() => import("@/components/Kaart3D"), { ssr: false });
const getal = (n: number) => n.toLocaleString("nl-NL");

export default function MeekijkDetail() {
  const { token, id } = useParams<{ token: string; id: string }>();
  const [l, setL] = useState<Meekijk | null>(null);
  const [fout, setFout] = useState("");
  const [beeld3d, setBeeld3d] = useState<string | null>(null);
  const [focus, setFocus] = useState<LngLat | null>(null);

  useEffect(() => {
    const haal = () => api<Meekijk>(`/api/meekijken/${token}/${id}`).then((x) => { setL(x); setFout(""); }).catch((e) => setFout(e.message));
    haal();
    const t = setInterval(haal, 60000);
    return () => clearInterval(t);
  }, [token, id]);

  if (!l) return <p className="p-6 text-sm text-slate-600">{fout || "Laden…"}</p>;
  const kandidaten = l.kandidaten as Kandidaat[];
  const rang = rangorde(kandidaten, l.gewichten);
  const in3d = kandidaten.find((k) => k.id === beeld3d);
  const klaar = l.status === "Opgeleverd";
  const rest = dagenTot(l.deadline);
  const fase = STATUSSEN.indexOf(l.status as never);
  // eerste moment waarop een fase is bereikt, en hoe lang die fase duurde
  const bereikt = (s: string) => l.historie.find((h) => h.status === s)?.op ?? null;
  const duur = (i: number) => {
    const van = bereikt(STATUSSEN[i]);
    if (!van) return null;
    const tot = STATUSSEN.slice(i + 1).map(bereikt).find(Boolean) ?? (klaar ? van : new Date().toISOString());
    return Math.max(0, (new Date(tot).getTime() - new Date(van).getTime()) / 86400000);
  };

  return (
    <main className="grid grid-cols-1 grid-rows-[45vh_minmax(0,1fr)] overflow-hidden lg:grid-cols-[1fr_540px] lg:grid-rows-[minmax(0,1fr)]" style={{ height: "calc(100vh - 3rem)" }}>
      <div className="min-h-0">
        {in3d
          ? <Kaart3D key={in3d.id} kandidaat={in3d} stationType={l.stationType} onSluit={() => setBeeld3d(null)} />
          : <Kaart zoekgebied={l.zoekgebied} kandidaten={kandidaten} aansluitpunt={l.aansluitpunt} voorkeurId={l.voorkeurId} focus={focus} start={{}} />}
      </div>
      <div className="min-h-0 overflow-y-auto border-l bg-white p-5">
        <Link href={`/meekijken/${token}`} className="text-xs text-slate-500 underline">‹ Alle LQS&apos;en</Link>
        <div className="mt-2 font-mono text-xs text-slate-500">{l.code}</div>
        <h1 className="text-xl font-semibold leading-tight">{l.naam}</h1>
        <div className="text-sm text-slate-600">{STATION_TYPEN.find((t) => t.id === l.stationType)?.naam ?? l.stationType} · kavel {l.kavelB} × {l.kavelL} m{l.gemeente && ` · gemeente ${l.gemeente}`}</div>
        {fout && <p className="mt-2 rounded bg-red-50 p-2 text-xs text-red-800">{fout}</p>}

        <div className={`mt-4 rounded p-3 text-sm ${klaar ? "bg-emerald-50 text-emerald-900" : rest < 0 ? "bg-red-50 text-red-900" : "bg-slate-50 text-slate-800"}`}>
          {klaar
            ? <>Opgeleverd op {datum(l.opgeleverdOp)}, {Math.round((new Date(l.opgeleverdOp!).getTime() - new Date(l.startdatum).getTime()) / 86400000)} dagen na de start (norm {DOORLOOPTIJD_DAGEN} dagen).</>
            : <>Fase <span className="font-medium">{l.status.toLowerCase()}</span> · oplevering gepland op {datum(l.deadline)} ({rest < 0 ? `${-rest} dagen over de deadline` : `nog ${rest} dagen`}).</>}
        </div>

        <h2 className="mb-2 mt-5 text-sm font-semibold">Voortgang</h2>
        <ol className="space-y-1.5">
          {STATUSSEN.map((s, i) => {
            const op = bereikt(s), dgn = duur(i);
            const stand = i < fase || klaar ? "klaar" : i === fase ? "bezig" : "open";
            return (
              <li key={s} className="flex items-center gap-3 text-sm">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${stand === "klaar" ? "bg-emerald-600" : stand === "bezig" ? "bg-amber-500 ring-4 ring-amber-100" : "bg-slate-200"}`} />
                <span className={`w-24 ${stand === "open" ? "text-slate-400" : stand === "bezig" ? "font-medium" : ""}`}>{s}</span>
                <span className="text-xs text-slate-500">{op ? datum(op) : i === 0 ? datum(l.startdatum) : ""}{dgn !== null && i < STATUSSEN.length - 1 && stand !== "open" && ` · ${dgn < 1 ? "minder dan een dag" : `${dgn.toFixed(0)} ${dgn < 1.5 ? "dag" : "dagen"}`}${stand === "bezig" ? " tot nu toe" : ""}`}</span>
              </li>
            );
          })}
        </ol>
        <div className="mt-2 text-xs text-slate-500">Planoloog: {l.planoloog || "–"} · uitvoerder: {l.uitvoerder || "–"}{l.reviewer && ` · review: ${l.reviewer}`}</div>

        {l.analyse && (
          <>
            <h2 className="mb-2 mt-5 text-sm font-semibold">Ruimtelijke analyse</h2>
            <div className="grid grid-cols-4 gap-2 text-center">
              {[["Zoekgebied", ha(l.analyse.oppZoekgebiedM2)], ["Uitgesloten", `${((100 * l.analyse.uitgeslotenM2) / l.analyse.oppZoekgebiedM2).toFixed(0)}%`], ["Kavel inpasbaar", ha(l.analyse.inpasbaarM2)], ["Complexiteit", l.analyse.complexiteit.klasse]].map(([k, w]) => (
                <div key={k} className="rounded border border-slate-200 p-2"><div className="text-[11px] uppercase tracking-wide text-slate-500">{k}</div><div className="text-base font-semibold">{w}</div></div>
              ))}
            </div>
          </>
        )}

        <h2 className="mb-2 mt-5 text-sm font-semibold">Locaties{rang.length > 0 && !klaar && <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs font-normal text-amber-800">concept, nog niet gereviewd</span>}</h2>
        {!rang.length && <p className="text-sm text-slate-600">{l.aantalLocaties ? `Er zijn ${l.aantalLocaties} locaties in beoordeling. De afweging wordt zichtbaar zodra het rapport in opbouw is.` : "De analyse van het zoekgebied loopt nog."}</p>}
        {rang.map(({ k, score, geschikt }, i) => {
          const voorkeur = k.id === l.voorkeurId;
          return (
            <div key={k.id} className={`mb-2 rounded-lg border p-3 ${voorkeur ? "border-emerald-600 ring-1 ring-emerald-600" : "border-slate-200"}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 font-medium">{k.naam}{voorkeur && <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">voorkeurslocatie</span>}{k.bron === "aangedragen" && <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">aangedragen</span>}</div>
                  <div className="text-xs text-slate-500">{k.adres ?? "adres onbekend"}</div>
                </div>
                <div className="text-right"><div className="text-2xl font-semibold leading-none">{score}</div><div className="text-[11px] text-slate-500">#{i + 1}</div></div>
              </div>
              {!geschikt && <p className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-800">Valt af: ligt in {k.inUitgesloten.join(", ").toLowerCase()}.</p>}
              {k.trace && <div className="mt-2 text-xs text-slate-700">Kabeltracé {getal(k.trace.lengte)} m naar {k.trace.doel} · indicatie aanleg € {getal(k.trace.kosten)}</div>}
              <details className="mt-1 text-xs">
                <summary className="cursor-pointer text-slate-500">Scores per criterium</summary>
                <table className="mt-1 w-full"><tbody>
                  {AUTO_CRITERIA.map((c) => <tr key={c.id} className="border-t border-slate-100"><td className="w-[45%] py-0.5">{c.naam}</td><td className="w-8 text-center font-medium">{k.auto[c.id]?.score ?? "–"}</td><td className="text-slate-500">{k.auto[c.id]?.toelichting}</td></tr>)}
                  {HAND_CRITERIA.map((c) => <tr key={c.id} className="border-t border-slate-100"><td className="py-0.5">{c.naam}</td><td className="text-center font-medium">{k.handmatig[c.id]?.score ?? "–"}</td><td className="text-slate-500">{k.handmatig[c.id]?.notitie}</td></tr>)}
                </tbody></table>
              </details>
              <div className="mt-2 flex gap-3 text-xs">
                <button className="underline" onClick={() => { setBeeld3d(null); setFocus([...k.punt] as LngLat); }}>Toon op kaart</button>
                <button className="font-medium text-emerald-800 underline" onClick={() => setBeeld3d(k.id)}>3D-beeld</button>
              </div>
            </div>
          );
        })}

        {klaar && (l.advies || l.vervolg) && (
          <>
            <h2 className="mb-2 mt-5 text-sm font-semibold">Advies</h2>
            {[l.advies, l.vervolg].filter(Boolean).map((t, i) => <p key={i} className="mb-2 text-sm leading-relaxed text-slate-700">{t}</p>)}
            <p className="text-xs text-slate-500">Het volledige rapport is als PDF opgeleverd.</p>
          </>
        )}
      </div>
    </main>
  );
}

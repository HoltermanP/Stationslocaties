"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { DOORLOOPTIJD_DAGEN, STATION_TYPEN, STATUSSEN } from "@/lib/config";
import { dagenTot, datum } from "@/lib/score";

type Rij = {
  id: string; code: string; naam: string; gemeente: string; stationType: string; status: string; planoloog: string; uitvoerder: string;
  startdatum: string; deadline: string; opgeleverdOp: string | null; complexiteit: string | null;
};
const KLEUR: Record<string, string> = { Laag: "bg-emerald-100 text-emerald-800", Midden: "bg-amber-100 text-amber-800", Hoog: "bg-red-100 text-red-800" };
const dagen = (van: string, tot: string) => Math.round((new Date(tot).getTime() - new Date(van).getTime()) / 86400000);

export default function Meekijken() {
  const { token } = useParams<{ token: string }>();
  const [d, setD] = useState<{ rijen: Rij[]; bijgewerkt: string } | null>(null);
  const [fout, setFout] = useState("");
  const [filter, setFilter] = useState<"lopend" | "opgeleverd" | "alle">("lopend");

  useEffect(() => {
    const haal = () => api<{ rijen: Rij[]; bijgewerkt: string }>(`/api/meekijken/${token}`).then((x) => { setD(x); setFout(""); }).catch((e) => setFout(e.message));
    haal();
    const t = setInterval(haal, 60000); // de stand ververst elke minuut
    return () => clearInterval(t);
  }, [token]);

  if (!d) return <p className="p-6 text-sm text-slate-600">{fout || "Laden…"}</p>;
  const lopend = d.rijen.filter((r) => r.status !== "Opgeleverd");
  const klaar = d.rijen.filter((r) => r.status === "Opgeleverd" && r.opgeleverdOp);
  const duur = klaar.map((r) => dagen(r.startdatum, r.opgeleverdOp!));
  const binnen = duur.filter((x) => x <= DOORLOOPTIJD_DAGEN).length;
  const teLaat = lopend.filter((r) => dagenTot(r.deadline) < 0).length;
  const tegels = [
    { naam: "In uitvoering", waarde: lopend.length, sub: STATUSSEN.slice(0, 5).map((s) => `${lopend.filter((r) => r.status === s).length} ${s.toLowerCase()}`).join(" · ") },
    { naam: "Opgeleverd", waarde: klaar.length, sub: klaar.length ? `${binnen} van ${klaar.length} binnen ${DOORLOOPTIJD_DAGEN} dagen (${Math.round((100 * binnen) / klaar.length)}%)` : "nog geen opleveringen" },
    { naam: "Gem. doorlooptijd", waarde: duur.length ? `${(duur.reduce((a, b) => a + b, 0) / duur.length).toFixed(0)} dagen` : "–", sub: `norm: ${DOORLOOPTIJD_DAGEN} dagen` },
    { naam: "Over de deadline", waarde: teLaat, sub: teLaat ? "lopende LQS'en voorbij de drie weken" : "alle lopende LQS'en liggen op schema", alarm: teLaat > 0 },
  ];
  const toon = filter === "lopend" ? lopend : filter === "opgeleverd" ? klaar : d.rijen;

  return (
    <main className="mx-auto w-full max-w-6xl p-6">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Voortgang Locatie QuickScans</h1>
          <p className="text-sm text-slate-600">Actuele stand van alle LQS&apos;en. Alleen lezen; de gegevens komen rechtstreeks uit de werkplek van de uitvoerder.</p>
        </div>
        <div className="text-right text-xs text-slate-500">bijgewerkt {new Date(d.bijgewerkt).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}{fout && <div className="text-red-700">{fout}</div>}</div>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {tegels.map((t) => (
          <div key={t.naam} className="kaartje p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">{t.naam}</div>
            <div className={`mt-1 text-2xl font-semibold ${t.alarm ? "text-red-700" : ""}`}>{t.waarde}</div>
            <div className="mt-1 text-xs text-slate-500">{t.sub}</div>
          </div>
        ))}
      </div>
      <div className="mb-2 flex gap-1 text-sm">
        {([["lopend", `In uitvoering (${lopend.length})`], ["opgeleverd", `Opgeleverd (${klaar.length})`], ["alle", `Alle (${d.rijen.length})`]] as const).map(([id, naam]) => (
          <button key={id} onClick={() => setFilter(id)} className={`rounded px-3 py-1.5 ${filter === id ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"}`}>{naam}</button>
        ))}
      </div>
      <div className="kaartje overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>{["Kenmerk", "Zoekgebied", "Type", "Fase", "Complexiteit", "Gestart", "Planning", ""].map((k) => <th key={k} className="px-3 py-2 font-medium">{k}</th>)}</tr>
          </thead>
          <tbody>
            {!toon.length && <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-500">Geen LQS&apos;en in deze selectie.</td></tr>}
            {toon.map((r) => {
              const rest = dagenTot(r.deadline);
              const open = r.status !== "Opgeleverd";
              return (
                <tr key={r.id} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-xs">{r.code}</td>
                  <td className="px-3 py-2"><Link href={`/meekijken/${token}/${r.id}`} className="font-medium underline decoration-slate-300 underline-offset-2">{r.naam}</Link><div className="text-xs text-slate-500">{r.gemeente}</div></td>
                  <td className="px-3 py-2">{STATION_TYPEN.find((t) => t.id === r.stationType)?.naam.split(" (")[0]}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-0.5">{STATUSSEN.map((s, i) => <span key={s} className={`h-1.5 w-4 rounded-sm ${i <= STATUSSEN.indexOf(r.status as never) ? "bg-emerald-600" : "bg-slate-200"}`} />)}</div>
                      {r.status}
                    </div>
                  </td>
                  <td className="px-3 py-2">{r.complexiteit ? <span className={`rounded px-2 py-0.5 text-xs ${KLEUR[r.complexiteit]}`}>{r.complexiteit}</span> : "–"}</td>
                  <td className="px-3 py-2">{datum(r.startdatum)}</td>
                  <td className="px-3 py-2">
                    {open
                      ? <>{datum(r.deadline)}<span className={`ml-2 text-xs ${rest < 0 ? "font-semibold text-red-700" : rest <= 5 ? "text-amber-700" : "text-slate-500"}`}>{rest < 0 ? `${-rest} d te laat` : `nog ${rest} d`}</span></>
                      : <>opgeleverd {datum(r.opgeleverdOp)}<span className={`ml-2 text-xs ${dagen(r.startdatum, r.opgeleverdOp!) > DOORLOOPTIJD_DAGEN ? "text-red-700" : "text-emerald-700"}`}>in {dagen(r.startdatum, r.opgeleverdOp!)} d</span></>}
                  </td>
                  <td className="px-3 py-2 text-right"><Link href={`/meekijken/${token}/${r.id}`} className="text-slate-400">›</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}

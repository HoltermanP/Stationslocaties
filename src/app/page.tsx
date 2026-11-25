"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { JAARVOLUME, STATION_TYPEN, STATUSSEN } from "@/lib/config";
import { DEMO_SCENARIOS } from "@/lib/demoScenarios";
import { dagenTot, datum } from "@/lib/score";

type Rij = {
  id: string; code: string; naam: string; gemeente: string; stationType: string; status: string; planoloog: string; uitvoerder: string;
  startdatum: string; deadline: string; opgeleverdOp: string | null; gearchiveerd: boolean; complexiteit: string | null;
};

const KLEUR: Record<string, string> = { Laag: "bg-emerald-100 text-emerald-800", Midden: "bg-amber-100 text-amber-800", Hoog: "bg-red-100 text-red-800" };

export default function Portfolio() {
  const router = useRouter();
  const [rijen, setRijen] = useState<Rij[] | null>(null);
  const [fout, setFout] = useState("");
  const [archief, setArchief] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [link, setLink] = useState<{ open: boolean; token: string | null; gekopieerd?: boolean }>({ open: false, token: null });
  const linkActie = (methode: string) => api<{ token: string | null }>("/api/portaal", methode).then((r) => setLink({ open: true, token: r.token })).catch((e) => setFout(e.message));
  const linkUrl = link.token && typeof window !== "undefined" ? `${window.location.origin}/meekijken/${link.token}` : "";

  useEffect(() => {
    api<Rij[]>("/api/lqs").then(setRijen).catch((e) => setFout(e.message));
  }, []);

  const demo = async (scenario: string) => {
    setBezig(true);
    try {
      const l = await api<{ id: string }>("/api/demo", "POST", { scenario });
      router.push(`/lqs/${l.id}`);
    } catch (e) {
      setFout((e as Error).message);
      setBezig(false);
    }
  };

  // zet de demo's uit demo/demo-data.json.gz terug die niet (meer) in de database staan
  const demosTerug = async () => {
    setBezig(true);
    try {
      await api("/api/demo", "POST", { terugzetten: true });
      setRijen(await api<Rij[]>("/api/lqs"));
    } catch (e) {
      setFout((e as Error).message);
    }
    setBezig(false);
  };

  const alle = rijen ?? [];
  const actief = alle.filter((r) => !r.gearchiveerd);
  const lopend = actief.filter((r) => r.status !== "Opgeleverd");
  const klaar = actief.filter((r) => r.status === "Opgeleverd" && r.opgeleverdOp);
  const maand = new Date().toISOString().slice(0, 7);
  const dezeMaand = klaar.filter((r) => r.opgeleverdOp!.startsWith(maand)).length;
  const doel = Math.round(JAARVOLUME / 12);
  const doorloop = klaar.map((r) => (new Date(r.opgeleverdOp!).getTime() - new Date(r.startdatum).getTime()) / 86400000);
  const gem = doorloop.length ? doorloop.reduce((a, b) => a + b, 0) / doorloop.length : null;
  const teLaat = lopend.filter((r) => dagenTot(r.deadline) < 0).length;
  const krap = lopend.filter((r) => dagenTot(r.deadline) >= 0 && dagenTot(r.deadline) <= 5).length;
  const tegels = [
    { naam: "Lopend", waarde: lopend.length, sub: STATUSSEN.slice(0, 5).map((s) => `${lopend.filter((r) => r.status === s).length} ${s.toLowerCase()}`).join(" · ") },
    { naam: "Deadline binnen 5 dagen", waarde: krap, sub: teLaat ? `${teLaat} over de deadline` : "geen over de deadline", alarm: teLaat > 0 },
    { naam: "Opgeleverd deze maand", waarde: `${dezeMaand} / ${doel}`, sub: `norm: ${JAARVOLUME} per jaar` },
    { naam: "Gem. doorlooptijd", waarde: gem === null ? "–" : `${gem.toFixed(0)} dagen`, sub: "norm: 21 dagen" },
  ];
  const toon = archief ? alle.filter((r) => r.gearchiveerd) : actief;

  return (
    <main className="mx-auto w-full max-w-6xl p-6">
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Portfolio Locatie QuickScans</h1>
          <p className="text-sm text-slate-600">Overzicht van alle LQS&apos;en, hun status en doorlooptijd.</p>
        </div>
        <div className="flex gap-2">
          <button className="knop licht" onClick={() => (link.open ? setLink({ ...link, open: false }) : linkActie("GET"))}>Meekijklink opdrachtgever</button>
          <select className="knop licht" disabled={bezig} value="" title="Maakt een volledig doorgerekende voorbeeld-LQS aan, of rekent hem opnieuw door als hij al bestaat"
            onChange={(e) => { if (e.target.value === "terugzetten") demosTerug(); else if (e.target.value) demo(e.target.value); }}>
            <option value="">{bezig ? "Bezig…" : "Demo-LQS…"}</option>
            {(["Enexis", "Liander"] as const).map((nb) => (
              <optgroup key={nb} label={`Gebied ${nb}`}>
                {DEMO_SCENARIOS.filter((d) => d.netbeheerder === nb).map((d) => <option key={d.id} value={d.id}>{d.naam.replace("Demo – ", "")} – {STATION_TYPEN.find((t) => t.id === d.stationType)?.naam.match(/TVS, \d+ velden/)?.[0] ?? "TVS"}</option>)}
              </optgroup>
            ))}
            <option value="terugzetten">Meegeleverde demo&apos;s terugzetten</option>
          </select>
          <Link href="/lqs/nieuw" className="knop groen">Nieuwe LQS</Link>
        </div>
      </div>
      {fout && <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-800">{fout}</p>}
      {link.open && (
        <div className="kaartje mb-5 p-4 text-sm">
          <div className="font-medium">Meekijkportaal voor de opdrachtgever</div>
          <p className="mt-1 text-xs text-slate-600">Met deze link volgt de planoloog van Enexis de voortgang van alle LQS&apos;en: fase, planning en doorlooptijd, en vanaf de rapportfase de locaties met score, kabeltracé en 3D-beeld. Alleen lezen. Aangeleverde geodata, namen van eigenaren en AI-voorstellen zijn niet zichtbaar.</p>
          {link.token ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input readOnly className="veld min-w-0 flex-1 font-mono !text-xs" value={linkUrl} onFocus={(e) => e.target.select()} />
              <button className="knop" onClick={() => navigator.clipboard.writeText(linkUrl).then(() => setLink({ ...link, gekopieerd: true }))}>{link.gekopieerd ? "Gekopieerd" : "Kopiëren"}</button>
              <Link href={`/meekijken/${link.token}`} target="_blank" className="knop licht">Openen</Link>
              <button className="knop licht" onClick={() => linkActie("POST")}>Nieuwe link (oude vervalt)</button>
              <button className="knop licht" onClick={() => linkActie("DELETE")}>Intrekken</button>
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-3"><span className="text-xs text-slate-500">Er is nu geen actieve link.</span><button className="knop groen" onClick={() => linkActie("POST")}>Link aanmaken</button></div>
          )}
        </div>
      )}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {tegels.map((t) => (
          <div key={t.naam} className="kaartje p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">{t.naam}</div>
            <div className={`mt-1 text-2xl font-semibold ${t.alarm ? "text-red-700" : ""}`}>{t.waarde}</div>
            <div className="mt-1 text-xs text-slate-500">{t.sub}</div>
          </div>
        ))}
      </div>
      <div className="kaartje overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>{["Code", "Zoekgebied", "Type", "Status", "Complexiteit", "Uitvoerder", "Deadline", ""].map((k) => <th key={k} className="px-3 py-2 font-medium">{k}</th>)}</tr>
          </thead>
          <tbody>
            {rijen === null && !fout && <tr><td colSpan={8} className="px-3 py-6 text-slate-500">Laden…</td></tr>}
            {rijen !== null && !toon.length && (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-500">{archief ? "Het archief is leeg." : "Nog geen LQS'en. Maak een nieuwe aan of start met de demo."}</td></tr>
            )}
            {toon.map((r) => {
              const d = dagenTot(r.deadline);
              const open = r.status !== "Opgeleverd";
              return (
                <tr key={r.id} className="cursor-pointer border-b last:border-0 hover:bg-slate-50" onClick={() => router.push(`/lqs/${r.id}`)}>
                  <td className="px-3 py-2 font-mono text-xs">{r.code}</td>
                  <td className="px-3 py-2"><div className="font-medium">{r.naam}</div><div className="text-xs text-slate-500">{r.gemeente}</div></td>
                  <td className="px-3 py-2">{STATION_TYPEN.find((t) => t.id === r.stationType)?.naam.split(" (")[0]}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-0.5">{STATUSSEN.map((s, i) => <span key={s} className={`h-1.5 w-4 rounded-sm ${i <= STATUSSEN.indexOf(r.status as never) ? "bg-emerald-600" : "bg-slate-200"}`} />)}</div>
                      {r.status}
                    </div>
                  </td>
                  <td className="px-3 py-2">{r.complexiteit ? <span className={`rounded px-2 py-0.5 text-xs ${KLEUR[r.complexiteit]}`}>{r.complexiteit}</span> : "–"}</td>
                  <td className="px-3 py-2">{r.uitvoerder || "–"}</td>
                  <td className="px-3 py-2">
                    {datum(r.deadline)}
                    {open && <span className={`ml-2 text-xs ${d < 0 ? "font-semibold text-red-700" : d <= 5 ? "text-amber-700" : "text-slate-500"}`}>{d < 0 ? `${-d} d te laat` : `nog ${d} d`}</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-400">›</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button className="mt-3 text-xs text-slate-500 underline" onClick={() => setArchief(!archief)}>{archief ? "Terug naar actieve LQS'en" : `Archief tonen (${alle.length - actief.length})`}</button>
    </main>
  );
}

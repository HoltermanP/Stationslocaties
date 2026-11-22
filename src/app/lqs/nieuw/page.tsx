"use client";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, eerstePolygoon, lijktWgs84 } from "@/lib/api";
import { STATION_TYPEN } from "@/lib/config";
import type { LngLat, Polygoon } from "@/lib/types";

const Kaart = dynamic(() => import("@/components/Kaart"), { ssr: false });

export default function Nieuw() {
  const router = useRouter();
  const [v, setV] = useState({ naam: "", gemeente: "", stationType: "tvs", kavelB: 17.7, kavelL: 20.3, planoloog: "", uitvoerder: "", startdatum: new Date().toISOString().slice(0, 10) });
  const [zoekgebied, setZoekgebied] = useState<Polygoon | null>(null);
  const [focus, setFocus] = useState<LngLat | null>(null);
  const [zoek, setZoek] = useState("");
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);
  const zet = (k: string, w: unknown) => setV((s) => ({ ...s, [k]: w }));

  const zoekPlaats = async () => {
    if (!zoek.trim()) return;
    try {
      const d = await (await fetch(`https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?rows=1&q=${encodeURIComponent(zoek)}`)).json();
      const doc = d?.response?.docs?.[0];
      const m = /POINT\(([\d.]+) ([\d.]+)\)/.exec(doc?.centroide_ll ?? "");
      if (!m) return setFout(`Niets gevonden voor "${zoek}"`);
      setFout("");
      setFocus([+m[1], +m[2]]);
      if (!v.gemeente && doc.gemeentenaam) zet("gemeente", doc.gemeentenaam);
    } catch {
      setFout("Zoeken is mislukt (PDOK Locatieserver niet bereikbaar)");
    }
  };

  const upload = async (f?: File) => {
    if (!f) return;
    try {
      const p = eerstePolygoon(JSON.parse(await f.text()));
      if (!p) return setFout("Geen polygoon gevonden in het bestand");
      if (!lijktWgs84(p)) return setFout("Het bestand lijkt niet in WGS84 (EPSG:4326) te staan. Exporteer het zoekgebied uit QGIS als GeoJSON in EPSG:4326.");
      setFout("");
      setZoekgebied(p);
    } catch {
      setFout("Het bestand is geen geldige GeoJSON");
    }
  };

  const opslaan = async () => {
    setBezig(true);
    try {
      const l = await api<{ id: string }>("/api/lqs", "POST", { ...v, zoekgebied });
      router.push(`/lqs/${l.id}`);
    } catch (e) {
      setFout((e as Error).message);
      setBezig(false);
    }
  };

  return (
    <main className="grid grid-cols-1 grid-rows-[minmax(0,1fr)_45vh] overflow-hidden lg:grid-cols-[380px_1fr] lg:grid-rows-[minmax(0,1fr)]" style={{ height: "calc(100vh - 3rem)" }}>
      <div className="space-y-3 overflow-y-auto border-r bg-white p-5">
        <h1 className="text-xl font-semibold">Nieuwe LQS</h1>
        <label className="block text-sm">Naam zoekgebied<input className="veld mt-1" value={v.naam} onChange={(e) => zet("naam", e.target.value)} placeholder="bv. Hengelo Noord" /></label>
        <label className="block text-sm">Gemeente<input className="veld mt-1" value={v.gemeente} onChange={(e) => zet("gemeente", e.target.value)} /></label>
        <label className="block text-sm">Type station
          <select className="veld mt-1" value={v.stationType} onChange={(e) => { const t = STATION_TYPEN.find((x) => x.id === e.target.value)!; setV((s) => ({ ...s, stationType: t.id, kavelB: t.kavelB, kavelL: t.kavelL })); }}>
            {STATION_TYPEN.map((t) => <option key={t.id} value={t.id}>{t.naam}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm">Kavel breedte (m)<input type="number" min={3} className="veld mt-1" value={v.kavelB} onChange={(e) => zet("kavelB", +e.target.value)} /></label>
          <label className="block text-sm">Kavel lengte (m)<input type="number" min={3} className="veld mt-1" value={v.kavelL} onChange={(e) => zet("kavelL", +e.target.value)} /></label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm">Planoloog Enexis<input className="veld mt-1" value={v.planoloog} onChange={(e) => zet("planoloog", e.target.value)} /></label>
          <label className="block text-sm">Uitvoerder<input className="veld mt-1" value={v.uitvoerder} onChange={(e) => zet("uitvoerder", e.target.value)} /></label>
        </div>
        <label className="block text-sm">Startdatum<input type="date" className="veld mt-1" value={v.startdatum} onChange={(e) => zet("startdatum", e.target.value)} /><span className="text-xs text-slate-500">Deadline wordt automatisch drie weken later gezet.</span></label>
        <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="font-medium">Zoekgebied</div>
          <p className="mt-1 text-xs text-slate-600">Teken het gebied op de kaart of laad de aanlevering van Asset Management als GeoJSON (EPSG:4326).</p>
          <div className="mt-2 flex gap-2">
            <input className="veld" placeholder="Zoek plaats of adres" value={zoek} onChange={(e) => setZoek(e.target.value)} onKeyDown={(e) => e.key === "Enter" && zoekPlaats()} />
            <button className="knop licht" onClick={zoekPlaats}>Zoek</button>
          </div>
          <input type="file" accept=".json,.geojson" className="mt-2 block w-full text-xs" onChange={(e) => upload(e.target.files?.[0])} />
          <p className="mt-2 text-xs">{zoekgebied ? <span className="text-emerald-700">Zoekgebied vastgelegd ({zoekgebied.coordinates[0].length - 1} hoekpunten). <button className="underline" onClick={() => setZoekgebied(null)}>Opnieuw tekenen</button></span> : "Nog geen zoekgebied."}</p>
        </div>
        {fout && <p className="rounded bg-red-50 p-2 text-sm text-red-800">{fout}</p>}
        <button className="knop groen w-full" disabled={bezig || !v.naam.trim() || !zoekgebied} onClick={opslaan}>{bezig ? "Opslaan…" : "LQS aanmaken"}</button>
      </div>
      <div className="min-h-0">
        <Kaart zoekgebied={zoekgebied} modus={zoekgebied ? "kijk" : "teken"} focus={focus} onPolygoon={setZoekgebied} />
      </div>
    </main>
  );
}

"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { KaartModus } from "@/components/Kaart";
import KlicPaneel from "@/components/KlicPaneel";
import { LocatieVelden, RapportVelden } from "@/components/SjabloonVelden";
import { BRONNEN } from "@/lib/analyse/bronnen";
import { api, eerstePolygoon, lijktWgs84 } from "@/lib/api";
import { AUTO_CRITERIA, EIGENAAR_TYPEN, HAND_CRITERIA, RAPPORT_SECTIES, REVIEW_PUNTEN, STATION_TYPEN, STATUSSEN } from "@/lib/config";
import { dagenTot, datum, ha, rangorde } from "@/lib/score";
import { kavelWijktAf } from "@/lib/station3d";
import type { EigenLaag, HandScore, Kandidaat, LaagSoort, LngLat, Lqs } from "@/lib/types";

const Kaart = dynamic(() => import("@/components/Kaart"), { ssr: false });
const Kaart3D = dynamic(() => import("@/components/Kaart3D"), { ssr: false });
const StreetSmart = dynamic(() => import("@/components/StreetSmart"), { ssr: false });
const euro = (n: number) => `€ ${n.toLocaleString("nl-NL")}`;
const TABS = ["Opdracht", "Analyse", "Locaties", "Rapport", "Review"] as const;
type Tab = (typeof TABS)[number];
type Bewaar = (w: Partial<Lqs>) => void;
const KLASSE: Record<string, string> = { Laag: "bg-emerald-100 text-emerald-800", Midden: "bg-amber-100 text-amber-800", Hoog: "bg-red-100 text-red-800" };

function Punten({ score }: { score: number | null }) {
  return (
    <span className="inline-flex gap-0.5" title={score ? `${score} van 5` : "niet gescoord"}>
      {[1, 2, 3, 4, 5].map((i) => <span key={i} className={`h-2 w-2 rounded-full ${score && i <= score ? (score >= 4 ? "bg-emerald-600" : score === 3 ? "bg-amber-500" : "bg-red-600") : "bg-slate-200"}`} />)}
    </span>
  );
}

export default function Werkplek() {
  const { id } = useParams<{ id: string }>();
  const [l, setL] = useState<Lqs | null>(null);
  const [fout, setFout] = useState("");
  const [tab, setTab] = useState<Tab>("Opdracht");
  const [opslag, setOpslag] = useState<"" | "bezig" | "ok">("");
  const [analyseBezig, setAnalyseBezig] = useState(false);
  const [tekenen, setTekenen] = useState(false);
  const [puntDoel, setPuntDoel] = useState<null | "aansluitpunt" | "aangedragen">(null);
  const [focus, setFocus] = useState<LngLat | null>(null);
  const [beeld3d, setBeeld3d] = useState<string | null>(null);
  const [straat, setStraat] = useState<string | null>(null);
  const wacht = useRef<Partial<Lqs>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api<Lqs>(`/api/lqs/${id}`).then((x) => { setL(x); setTab(x.analyse ? (x.status === "Review" || x.status === "Opgeleverd" ? "Review" : "Locaties") : x.zoekgebied ? "Analyse" : "Opdracht"); }).catch((e) => setFout(e.message));
  }, [id]);

  const verstuur = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const w = wacht.current;
    wacht.current = {};
    if (!Object.keys(w).length) return;
    try {
      const nieuw = await api<Lqs>(`/api/lqs/${id}`, "PATCH", w);
      // bij een andere kavelmaat past de server de kavels van de locaties aan; die overnemen, anders schrijft een latere wijziging ze terug
      if (("kavelB" in w || "kavelL" in w) && !("kandidaten" in w) && !("kandidaten" in wacht.current)) setL((s) => (s ? { ...s, kandidaten: nieuw.kandidaten } : s));
      setOpslag("ok");
    } catch (e) {
      setFout(`Opslaan mislukt: ${(e as Error).message}`);
      setOpslag("");
    }
  }, [id]);

  const bewaar: Bewaar = useCallback((w) => {
    setL((s) => (s ? { ...s, ...w } : s));
    wacht.current = { ...wacht.current, ...w };
    setOpslag("bezig");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(verstuur, 600);
  }, [verstuur]);

  const analyseer = async () => {
    setAnalyseBezig(true);
    setFout("");
    try {
      await verstuur();
      setL(await api<Lqs>(`/api/lqs/${id}/analyse`, "POST"));
      setTab("Locaties");
    } catch (e) {
      setFout((e as Error).message);
    }
    setAnalyseBezig(false);
  };

  if (!l) return <p className="p-6 text-sm text-slate-600">{fout || "Laden…"}</p>;

  const modus: KaartModus = tekenen ? "teken" : puntDoel ? "punt" : "kijk";
  const opPunt = (p: LngLat) => {
    if (puntDoel === "aansluitpunt") bewaar({ aansluitpunt: p });
    else if (puntDoel === "aangedragen") {
      let n = l.aangedragen.length + 1;
      while (l.aangedragen.some((a) => a.naam === `Aangedragen locatie ${n}`)) n++;
      bewaar({ aangedragen: [...l.aangedragen, { naam: `Aangedragen locatie ${n}`, punt: p }] });
    }
    setPuntDoel(null);
  };
  const d = dagenTot(l.deadline);
  const in3d = l.kandidaten.find((k) => k.id === beeld3d);
  const inStraat = l.kandidaten.find((k) => k.id === straat);

  return (
    <main className="grid grid-cols-1 grid-rows-[45vh_minmax(0,1fr)] overflow-hidden lg:grid-cols-[1fr_560px] lg:grid-rows-[minmax(0,1fr)]" style={{ height: "calc(100vh - 3rem)" }}>
      <div className="min-h-0">
        {inStraat ? (
          <StreetSmart key={inStraat.id} kandidaat={inStraat} onSluit={() => setStraat(null)}
            onBeeld={(foto) => bewaar({ beelden: { ...l.beelden, [`${inStraat.id}:streetview`]: foto } })} />
        ) : in3d ? (
          <Kaart3D key={in3d.id} kandidaat={in3d} stationType={l.stationType} onSluit={() => setBeeld3d(null)}
            onBeeld={(beeld) => bewaar({ kandidaten: l.kandidaten.map((x) => (x.id === in3d.id ? { ...x, beeld } : x)) })} />
        ) : (
        <Kaart zoekgebied={l.zoekgebied} analyse={l.analyse} kandidaten={l.kandidaten} aangedragen={l.aangedragen} aansluitpunt={l.aansluitpunt} klic={l.eigenLagen.filter((e) => e.functie === "leidingen")}
          voorkeurId={l.voorkeurId} modus={modus} focus={focus}
          puntHint={puntDoel === "aansluitpunt" ? "Klik het aansluitpunt op het net aan" : "Klik de aangedragen locatie aan"}
          onPolygoon={(p) => { bewaar({ zoekgebied: p }); setTekenen(false); }} onPunt={opPunt}
          onKandidaat={(kid) => { setTab("Locaties"); setTimeout(() => document.getElementById(`k-${kid}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }} />
        )}
      </div>
      <div className="flex min-h-0 flex-col border-l bg-white">
        <div className="border-b px-5 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-mono text-xs text-slate-500">{l.code}{l.gearchiveerd && " · gearchiveerd"}</div>
              <h1 className="text-lg font-semibold leading-tight">{l.naam}</h1>
            </div>
            <div className="text-right text-xs">
              <select className="rounded border border-slate-300 px-1.5 py-1 text-xs" value={l.status} onChange={(e) => bewaar({ status: e.target.value, ...(e.target.value !== "Opgeleverd" ? { opgeleverdOp: null } : {}) })}>
                {STATUSSEN.map((s) => <option key={s}>{s}</option>)}
              </select>
              <div className={`mt-1 ${l.status === "Opgeleverd" ? "text-slate-500" : d < 0 ? "font-semibold text-red-700" : d <= 5 ? "text-amber-700" : "text-slate-500"}`}>
                {l.status === "Opgeleverd" ? `opgeleverd ${datum(l.opgeleverdOp)}` : d < 0 ? `${-d} dagen over deadline` : `deadline ${datum(l.deadline)} (nog ${d} d)`}
              </div>
              <div className="h-4 text-slate-400">{opslag === "bezig" ? "opslaan…" : opslag === "ok" ? "opgeslagen" : ""}</div>
            </div>
          </div>
          <div className="mt-1 flex gap-1">
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`border-b-2 px-3 py-2 text-sm ${tab === t ? "border-emerald-700 font-medium text-emerald-800" : "border-transparent text-slate-600 hover:text-slate-900"}`}>{t}</button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {fout && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-800">{fout}</p>}
          {tab === "Opdracht" && <Opdracht l={l} bewaar={bewaar} tekenen={tekenen} setTekenen={setTekenen} puntDoel={puntDoel} setPuntDoel={setPuntDoel} setFout={setFout} />}
          {tab === "Analyse" && <><AnalyseTab l={l} bewaar={bewaar} analyseer={analyseer} bezig={analyseBezig} setFout={setFout} /><div className="mt-4"><KlicPaneel l={l} setL={setL} verstuur={verstuur} /></div></>}
          {tab === "Locaties" && <Locaties l={l} bewaar={bewaar} setL={setL} verstuur={verstuur} setFocus={(p) => { setBeeld3d(null); setStraat(null); setFocus(p); }} setBeeld3d={(id) => { setStraat(null); setBeeld3d(id); }} setStraat={(id) => { setBeeld3d(null); setStraat(id); }} analyseer={analyseer} bezig={analyseBezig} />}
          {tab === "Rapport" && <Rapport l={l} bewaar={bewaar} setL={setL} verstuur={verstuur} />}
          {tab === "Review" && <Review l={l} bewaar={bewaar} />}
        </div>
      </div>
    </main>
  );
}

function Opdracht({ l, bewaar, tekenen, setTekenen, puntDoel, setPuntDoel, setFout }: { l: Lqs; bewaar: Bewaar; tekenen: boolean; setTekenen: (b: boolean) => void; puntDoel: string | null; setPuntDoel: (p: null | "aansluitpunt" | "aangedragen") => void; setFout: (s: string) => void }) {
  const upload = async (f?: File) => {
    if (!f) return;
    try {
      const p = eerstePolygoon(JSON.parse(await f.text()));
      if (!p || !lijktWgs84(p)) return setFout("Geen bruikbare polygoon gevonden (verwacht: GeoJSON in EPSG:4326)");
      setFout("");
      bewaar({ zoekgebied: p });
    } catch {
      setFout("Het bestand is geen geldige GeoJSON");
    }
  };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2 block text-sm">Naam zoekgebied<input className="veld mt-1" value={l.naam} onChange={(e) => bewaar({ naam: e.target.value })} /></label>
        <label className="block text-sm">Gemeente<input className="veld mt-1" value={l.gemeente} onChange={(e) => bewaar({ gemeente: e.target.value })} /></label>
        <label className="block text-sm">Type station
          <select className="veld mt-1" value={l.stationType} onChange={(e) => { const t = STATION_TYPEN.find((x) => x.id === e.target.value)!; bewaar({ stationType: t.id, kavelB: t.kavelB, kavelL: t.kavelL }); }}>
            {STATION_TYPEN.map((t) => <option key={t.id} value={t.id}>{t.naam}</option>)}
          </select>
        </label>
        <label className="block text-sm">Kavel breedte (m)<input type="number" min={3} step={0.1} className="veld mt-1" value={l.kavelB} onChange={(e) => bewaar({ kavelB: Math.max(3, +e.target.value) })} /></label>
        <label className="block text-sm">Kavel lengte (m)<input type="number" min={3} step={0.1} className="veld mt-1" value={l.kavelL} onChange={(e) => bewaar({ kavelL: Math.max(3, +e.target.value) })} /></label>
        <label className="block text-sm">Planoloog Enexis<input className="veld mt-1" value={l.planoloog} onChange={(e) => bewaar({ planoloog: e.target.value })} /></label>
        <label className="block text-sm">Uitvoerder<input className="veld mt-1" value={l.uitvoerder} onChange={(e) => bewaar({ uitvoerder: e.target.value })} /></label>
        <label className="block text-sm">Startdatum<input type="date" className="veld mt-1" value={l.startdatum} onChange={(e) => bewaar({ startdatum: e.target.value })} /></label>
        <label className="block text-sm">Deadline<input type="date" className="veld mt-1" value={l.deadline} onChange={(e) => bewaar({ deadline: e.target.value })} /></label>
      </div>
      {l.kandidaten.some((k) => kavelWijktAf(k, l.kavelB, l.kavelL)) && (
        <p className="rounded bg-amber-50 p-3 text-sm text-amber-900">
          {l.kandidaten.filter((k) => kavelWijktAf(k, l.kavelB, l.kavelL)).length} locatie(s) hebben nog een kavel met een andere maat dan {l.kavelB} × {l.kavelL} m.{" "}
          <button className="underline" onClick={() => bewaar({ kavelB: l.kavelB, kavelL: l.kavelL })}>Kavels verkleinen tot deze maat</button>{" "}
          (aan de wegzijde, bij het kabeltracé). Is de nieuwe kavel groter dan de oude, voer dan de analyse opnieuw uit.
        </p>
      )}
      <p className="text-xs text-slate-500">Typen en maten volgens de voorlichting van Enexis (template LQS, menukaart en folders). Het zijn standaardmaten; pas de kavel per LQS aan op de opgave van Asset Management.{" "}
        {STATION_TYPEN.find((t) => t.id === l.stationType)?.folder && <a className="underline" target="_blank" rel="noreferrer" href={STATION_TYPEN.find((t) => t.id === l.stationType)!.folder}>Folder van Enexis over dit type (met foto&apos;s en tekeningen)</a>}</p>

      <div className="rounded border border-slate-200 p-3 text-sm">
        <div className="font-medium">Zoekgebied</div>
        <p className="mt-1 text-xs text-slate-600">{l.zoekgebied ? `Vastgelegd met ${l.zoekgebied.coordinates[0].length - 1} hoekpunten.` : "Nog niet vastgelegd."} Na wijziging de analyse opnieuw uitvoeren.</p>
        <div className="mt-2 flex items-center gap-2">
          <button className="knop licht" onClick={() => setTekenen(!tekenen)}>{tekenen ? "Tekenen annuleren" : "Opnieuw tekenen op kaart"}</button>
          <label className="knop licht cursor-pointer">GeoJSON laden<input type="file" accept=".json,.geojson" className="hidden" onChange={(e) => upload(e.target.files?.[0])} /></label>
        </div>
      </div>

      <div className="rounded border border-slate-200 p-3 text-sm">
        <div className="font-medium">Aansluitpunt op het net</div>
        <p className="mt-1 text-xs text-slate-600">Referentie voor het criterium nettechniek. Zonder aansluitpunt rekent de analyse met het zwaartepunt van het zoekgebied.</p>
        <div className="mt-2 flex items-center gap-2">
          <button className="knop licht" onClick={() => setPuntDoel(puntDoel === "aansluitpunt" ? null : "aansluitpunt")}>{puntDoel === "aansluitpunt" ? "Annuleren" : l.aansluitpunt ? "Verplaatsen" : "Aanwijzen op kaart"}</button>
          {l.aansluitpunt && <><span className="font-mono text-xs text-slate-500">{l.aansluitpunt[1].toFixed(5)}, {l.aansluitpunt[0].toFixed(5)}</span><button className="text-xs text-red-700 underline" onClick={() => bewaar({ aansluitpunt: null })}>wissen</button></>}
        </div>
      </div>

      <div className="rounded border border-slate-200 p-3 text-sm">
        <div className="font-medium">Vooraf aangedragen locaties</div>
        <p className="mt-1 text-xs text-slate-600">Locaties uit eerdere afstemming met bevoegd gezag of engineering. Ze worden altijd beoordeeld, ook als ze in uitgesloten gebied liggen.</p>
        {l.aangedragen.map((a, i) => (
          <div key={i} className="mt-2 flex items-center gap-2">
            <input className="veld" value={a.naam} onChange={(e) => bewaar({ aangedragen: l.aangedragen.map((x, j) => (j === i ? { ...x, naam: e.target.value } : x)) })} />
            <button className="text-xs text-red-700 underline" onClick={() => bewaar({ aangedragen: l.aangedragen.filter((_, j) => j !== i) })}>verwijderen</button>
          </div>
        ))}
        <button className="knop licht mt-2" onClick={() => setPuntDoel(puntDoel === "aangedragen" ? null : "aangedragen")}>{puntDoel === "aangedragen" ? "Annuleren" : "Locatie aanwijzen op kaart"}</button>
      </div>

      <button className="text-xs text-slate-500 underline" onClick={() => bewaar({ gearchiveerd: !l.gearchiveerd })}>{l.gearchiveerd ? "Terugzetten uit archief" : "Deze LQS archiveren"}</button>
    </div>
  );
}

function AnalyseTab({ l, bewaar, analyseer, bezig, setFout }: { l: Lqs; bewaar: Bewaar; analyseer: () => void; bezig: boolean; setFout: (s: string) => void }) {
  const a = l.analyse;
  const inst = (id: string) => { const b = BRONNEN.find((x) => x.id === id)!; return l.lagen[id] ?? { soort: b.soort, buffer: id === "woningen" ? (STATION_TYPEN.find((t) => t.id === l.stationType)?.woningAfstand ?? b.buffer) : b.buffer }; };
  const zetLaag = (id: string, w: Partial<{ soort: LaagSoort; buffer: number }>) => bewaar({ lagen: { ...l.lagen, [id]: { ...inst(id), ...w } } });
  const zetEigen = (id: string, w: Partial<EigenLaag>) => bewaar({ eigenLagen: l.eigenLagen.map((e) => (e.id === id ? { ...e, ...w } : e)) });
  const res = (id: string) => a?.lagen.find((x) => x.id === id);
  const upload = async (f?: File) => {
    if (!f) return;
    try {
      const geojson = JSON.parse(await f.text());
      if (!geojson?.type) throw new Error();
      setFout("");
      bewaar({ eigenLagen: [...l.eigenLagen, { id: `eigen-${Date.now()}`, naam: f.name.replace(/\.(geo)?json$/i, ""), soort: "uitsluiten", buffer: 0, vertrouwelijk: true, geojson }] });
    } catch {
      setFout("Het bestand is geen geldige GeoJSON");
    }
  };
  const soortKeuze = (waarde: LaagSoort, op: (s: LaagSoort) => void) => (
    <select className="rounded border border-slate-300 px-1 py-1 text-xs" value={waarde} onChange={(e) => op(e.target.value as LaagSoort)}>
      <option value="uitsluiten">Uitsluiten</option><option value="aandacht">Aandacht</option><option value="uit">Niet meenemen</option>
    </select>
  );
  const bufferVeld = (waarde: number, op: (n: number) => void) => <input type="number" min={0} max={500} className="w-14 rounded border border-slate-300 px-1 py-1 text-right text-xs" value={waarde} onChange={(e) => op(Math.max(0, +e.target.value))} />;
  const resultaat = (id: string) => { const r = res(id); return r ? (r.status === "fout" ? <span className="text-red-700" title={r.fout}>bron niet beschikbaar</span> : r.soort === "uit" ? "–" : `${r.pct.toFixed(1)}%`) : ""; };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-600">De analyse haalt de kaartlagen op, sluit ongeschikte delen uit, past de kavel van {l.kavelB} × {l.kavelL} m in en scoort de kansrijke locaties.</p>
        <button className="knop groen shrink-0" disabled={bezig || !l.zoekgebied} onClick={analyseer}>{bezig ? "Analyse loopt…" : a ? "Opnieuw uitvoeren" : "Analyse uitvoeren"}</button>
      </div>
      {a && (
        <>
          <div className="grid grid-cols-4 gap-2 text-center">
            {[["Zoekgebied", ha(a.oppZoekgebiedM2)], ["Uitgesloten", `${((100 * a.uitgeslotenM2) / a.oppZoekgebiedM2).toFixed(0)}%`], ["Vrije ruimte", ha(a.vrijM2)], ["Kavel inpasbaar", ha(a.inpasbaarM2)]].map(([k, w]) => (
              <div key={k} className="rounded border border-slate-200 p-2"><div className="text-[11px] uppercase tracking-wide text-slate-500">{k}</div><div className="text-base font-semibold">{w}</div></div>
            ))}
          </div>
          <div className="rounded border border-slate-200 p-3 text-sm">
            <div className="flex items-center gap-2"><span className="font-medium">Complexiteit</span><span className={`rounded px-2 py-0.5 text-xs ${KLASSE[a.complexiteit.klasse]}`}>{a.complexiteit.klasse}</span><span className="text-xs text-slate-500">{a.complexiteit.punten} punten</span></div>
            <ul className="mt-1 list-disc pl-5 text-xs text-slate-600">{a.complexiteit.toelichting.map((t) => <li key={t}>{t}</li>)}</ul>
          </div>
        </>
      )}
      <div>
        <div className="mb-1 text-sm font-medium">Kaartlagen</div>
        <table className="w-full text-sm">
          <thead className="border-b text-left text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="py-1 font-medium">Laag</th><th className="font-medium">Behandeling</th><th className="font-medium">Buffer (m)</th><th className="text-right font-medium">Aandeel</th></tr></thead>
          <tbody>
            {BRONNEN.map((b) => (
              <tr key={b.id} className="border-b">
                <td className="py-1.5"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: b.kleur }} />{b.naam}<div className="pl-[18px] text-[11px] text-slate-500">{b.bron}</div></td>
                <td>{soortKeuze(inst(b.id).soort, (s) => zetLaag(b.id, { soort: s }))}</td>
                <td>{bufferVeld(inst(b.id).buffer, (n) => zetLaag(b.id, { buffer: n }))}</td>
                <td className="text-right text-xs">{resultaat(b.id)}</td>
              </tr>
            ))}
            {l.eigenLagen.map((e) => (
              <tr key={e.id} className="border-b">
                <td className="py-1.5"><input className="w-full rounded border border-slate-300 px-1 py-0.5 text-sm" value={e.naam} onChange={(ev) => zetEigen(e.id, { naam: ev.target.value })} />
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                    <select className="rounded border border-slate-300 px-1 py-0.5" value={e.functie ?? ""} onChange={(ev) => zetEigen(e.id, { functie: ev.target.value as EigenLaag["functie"] })}>
                      <option value="">geen bijzondere rol</option><option value="net">net van Enexis</option><option value="leidingen">kabels en leidingen derden (KLIC)</option>
                    </select>
                    <label><input type="checkbox" checked={e.vertrouwelijk} onChange={(ev) => zetEigen(e.id, { vertrouwelijk: ev.target.checked })} /> vertrouwelijk (Enexis)</label><button className="text-red-700 underline" onClick={() => bewaar({ eigenLagen: l.eigenLagen.filter((x) => x.id !== e.id) })}>verwijderen</button></div></td>
                <td>{soortKeuze(e.soort, (s) => zetEigen(e.id, { soort: s }))}</td>
                <td>{bufferVeld(e.buffer, (n) => zetEigen(e.id, { buffer: n }))}</td>
                <td className="text-right text-xs">{resultaat(e.id)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <label className="knop licht mt-2 inline-block cursor-pointer">Eigen laag toevoegen (GeoJSON)<input type="file" accept=".json,.geojson" className="hidden" onChange={(e) => upload(e.target.files?.[0])} /></label>
        <p className="mt-2 text-xs text-slate-500">Geodata van Enexis en KLIC-leveringen laad je als eigen laag (GeoJSON, in RD of WGS84). Geef het net van Enexis de rol "net van Enexis": de analyse rekent dan met de afstand tot dat net en legt per locatie vast of er kabels binnen de kavel liggen. De geodata zelf blijft in de eigen database. Groen op de kaart is de ruimte waar de kavel past.</p>
      </div>
      {a && <p className="text-xs text-slate-500">Laatst uitgevoerd {new Date(a.uitgevoerdOp).toLocaleString("nl-NL")} · rekenraster {a.cel} m · {(a.duurMs / 1000).toFixed(1)} s</p>}
    </div>
  );
}

function Locaties({ l, bewaar, setL, verstuur, setFocus, setBeeld3d, setStraat, analyseer, bezig }: { setStraat: (id: string) => void; l: Lqs; bewaar: Bewaar; setL: (l: Lqs) => void; verstuur: () => Promise<void>; setFocus: (p: LngLat) => void; setBeeld3d: (id: string) => void; analyseer: () => void; bezig: boolean }) {
  const [aiBezig, setAiBezig] = useState(false);
  const [melding, setMelding] = useState("");
  if (!l.analyse) return <div className="text-sm text-slate-600">Voer eerst de analyse uit.<div><button className="knop groen mt-3" disabled={bezig || !l.zoekgebied} onClick={analyseer}>{bezig ? "Analyse loopt…" : "Analyse uitvoeren"}</button></div></div>;
  const rang = rangorde(l.kandidaten, l.gewichten);
  // een handmatige wijziging haalt de markering "AI-voorstel" weg
  const zetHand = (k: Kandidaat, cid: string, w: Partial<HandScore>) =>
    bewaar({ kandidaten: l.kandidaten.map((x) => (x.id === k.id ? { ...x, handmatig: { ...x.handmatig, [cid]: { ...x.handmatig[cid], ai: false, ...w } } } : x)) });
  const neemOver = (k: Kandidaat, cids: string[]) =>
    bewaar({
      kandidaten: l.kandidaten.map((x) => {
        if (x.id !== k.id || !x.voorstel) return x;
        const handmatig = { ...x.handmatig };
        for (const c of cids) {
          const v = x.voorstel[c];
          if (v?.score) handmatig[c] = { score: v.score, notitie: v.motivatie, ai: true };
        }
        return { ...x, handmatig };
      }),
    });
  const vraagVoorstel = async () => {
    setAiBezig(true);
    setMelding("");
    try {
      await verstuur();
      const r = await api<{ lqs: Lqs; melding: string }>(`/api/lqs/${l.id}/voorstel`, "POST");
      setL(r.lqs);
      setMelding(r.melding);
    } catch (e) {
      setMelding((e as Error).message);
    }
    setAiBezig(false);
  };
  const zetEigenaar = (k: Kandidaat, perceel: string, w: Partial<{ type: string; naam: string }>) =>
    bewaar({ kandidaten: l.kandidaten.map((x) => (x.id === k.id ? { ...x, eigendom: { ...x.eigendom, [perceel]: { type: "", naam: "", ...x.eigendom?.[perceel], ...w } } } : x)) });
  const heeftVoorstel = l.kandidaten.some((k) => k.voorstel);
  const nietBeoordeeld = l.aangedragen.filter((a) => !l.kandidaten.some((k) => k.bron === "aangedragen" && k.naam === a.naam));
  return (
    <div className="space-y-4">
      <div className="rounded border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-600">Haalt per locatie bestemming, perceel en grondgebruik op en laat AI een voorstel doen voor de vijf handmatige criteria. Je eigen scores blijven staan; een voorstel telt pas mee nadat je het overneemt.</p>
          <button className="knop shrink-0" disabled={aiBezig || !l.kandidaten.length} onClick={vraagVoorstel}>{aiBezig ? "Bezig…" : heeftVoorstel ? "Voorstel vernieuwen" : "AI-voorstel ophalen"}</button>
        </div>
        {melding && <p className="mt-2 text-xs text-amber-800">{melding}</p>}
      </div>
      {!rang.some((r) => r.geschikt) && <p className="rounded bg-amber-50 p-3 text-sm text-amber-900">Binnen het zoekgebied is geen ruimte gevonden waar de kavel van {l.kavelB} × {l.kavelL} m past. Verklein de kavel, pas buffers aan of bespreek een ruimer zoekgebied met Asset Management.</p>}
      {nietBeoordeeld.length > 0 && <p className="rounded bg-amber-50 p-3 text-sm text-amber-900">{nietBeoordeeld.length} aangedragen locatie(s) zijn nog niet beoordeeld. <button className="underline" onClick={analyseer} disabled={bezig}>Analyse opnieuw uitvoeren</button></p>}
      {rang.map(({ k, score, geschikt, handIngevuld, handTotaal }, i) => {
        const voorkeur = k.id === l.voorkeurId;
        return (
          <div key={k.id} id={`k-${k.id}`} className={`rounded-lg border p-3 ${voorkeur ? "border-emerald-600 ring-1 ring-emerald-600" : "border-slate-200"}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 font-medium">{k.naam}
                  {voorkeur && <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">voorkeurslocatie</span>}
                  {k.bron === "aangedragen" && <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">aangedragen</span>}
                </div>
                <div className="text-xs text-slate-500">{k.adres ?? "adres onbekend"} · RD {k.rd[0]}, {k.rd[1]}{k.ligging && ` · ${k.ligging}`}</div>
              </div>
              <div className="text-right"><div className="text-2xl font-semibold leading-none">{score}</div><div className="text-[11px] text-slate-500">#{i + 1} · {handIngevuld}/{handTotaal} handmatig</div></div>
            </div>
            {!geschikt && <p className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-800">Valt af: ligt in {k.inUitgesloten.join(", ").toLowerCase()}.</p>}
            {k.trace && (
              <div className="mt-2 rounded bg-amber-50 px-2 py-1.5 text-xs text-slate-700">
                <span className="text-slate-500">Kabeltracé naar {k.trace.doel}: </span>
                <span className="font-medium">{k.trace.lengte.toLocaleString("nl-NL")} m</span> (hemelsbreed {k.trace.hemelsbreed.toLocaleString("nl-NL")} m) · {k.trace.langsWeg} m langs de weg
                {k.trace.overig > 0 && ` · ${k.trace.overig} m overig terrein`}{k.trace.boring > 0 && ` · ${k.trace.boring} m boring`} · <span className="font-medium">indicatie {euro(k.trace.kosten)}</span>
              </div>
            )}
            {!!k.leidingen?.length && (
              <div className="mt-2 rounded bg-slate-50 px-2 py-1.5 text-xs text-slate-700">
                <span className="text-slate-500">Kabels en leidingen: </span>
                {k.leidingen.map((x, j) => <span key={j} className={x.inKavel ? "font-medium text-red-700" : ""}>{j > 0 && " · "}{x.laag}: {x.inKavel ? "binnen de kavel" : `${x.afstand} m`}</span>)}
              </div>
            )}
            {k.feiten && (
              <div className="mt-2 rounded bg-slate-50 px-2 py-1.5 text-xs text-slate-700">
                <div><span className="text-slate-500">Bestemming: </span>
                  {k.feiten.bestemmingen.length ? k.feiten.bestemmingen.map((b, j) => <span key={j}>{j > 0 && ", "}{b.link ? <a className="underline" target="_blank" rel="noreferrer" href={b.link}>{b.naam}</a> : b.naam}</span>) : "geen bestemming gevonden"}
                  {k.feiten.dubbelbestemmingen.length > 0 && <> · <span className="text-slate-500">dubbel: </span>{k.feiten.dubbelbestemmingen.map((b) => b.naam).join(", ")}</>}
                </div>
                {k.feiten.grondgebruik.length > 0 && <div><span className="text-slate-500">Grondgebruik: </span>{k.feiten.grondgebruik.join(", ")}</div>}
                {!k.feiten.percelen.length && <div><span className="text-slate-500">Perceel: </span>niet gevonden</div>}
                {k.feiten.percelen.map((x) => (
                  <div key={x.aanduiding} className="mt-1 flex items-center gap-1.5">
                    <span className="shrink-0" title={[x.panden === undefined ? "" : x.panden ? `${x.panden} pand(en): ${x.gebruik?.join(", ") || "gebruik onbekend"}` : "onbebouwd", x.vorm ?? "", x.kavelAandeel ? `kavel beslaat ${x.kavelAandeel}% van het perceel` : ""].filter(Boolean).join(" · ")}><span className="text-slate-500">Perceel </span>{x.aanduiding} <span className="text-slate-500">({x.oppM2.toLocaleString("nl-NL")} m²{x.panden === undefined ? "" : x.panden ? `, ${x.panden} pand${x.panden > 1 ? "en" : ""}` : ", onbebouwd"}{x.vorm === "langgerekt" ? ", langgerekt" : ""})</span></span>
                    <select className="rounded border border-slate-300 bg-white px-1 py-0.5" value={k.eigendom?.[x.aanduiding]?.type ?? ""} onChange={(e) => zetEigenaar(k, x.aanduiding, { type: e.target.value })}>
                      <option value="">eigenaar niet opgevraagd</option>{EIGENAAR_TYPEN.map((t) => <option key={t}>{t}</option>)}
                    </select>
                    <input className="min-w-0 grow rounded border border-slate-200 bg-white px-1.5 py-0.5" placeholder="naam eigenaar (Kadaster)" value={k.eigendom?.[x.aanduiding]?.naam ?? ""} onChange={(e) => zetEigenaar(k, x.aanduiding, { naam: e.target.value })} />
                  </div>
                ))}
                {k.feiten.fouten.length > 0 && <div className="text-amber-800">Niet opgehaald: {k.feiten.fouten.join(", ")}.</div>}
              </div>
            )}
            <table className="mt-2 w-full text-xs">
              <tbody>
                {AUTO_CRITERIA.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100"><td className="w-[42%] py-1 text-slate-700">{c.naam}</td><td className="w-16"><Punten score={k.auto[c.id]?.score ?? null} /></td><td className="text-slate-500">{k.auto[c.id]?.toelichting}</td></tr>
                ))}
                {HAND_CRITERIA.map((c) => {
                  const v = k.voorstel?.[c.id];
                  const h = k.handmatig[c.id];
                  const overgenomen = !!h?.ai && h.score === v?.score;
                  return (
                    <Fragment key={c.id}>
                      <tr className="border-t border-slate-100">
                        <td className="py-1 text-slate-700">{c.naam}</td>
                        <td><select className="rounded border border-slate-300 px-1 py-0.5" value={h?.score ?? ""} onChange={(e) => zetHand(k, c.id, { score: e.target.value ? +e.target.value : null })}><option value="">–</option>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></td>
                        <td><input className="w-full rounded border border-slate-200 px-1.5 py-0.5" placeholder="motivatie" value={h?.notitie ?? ""} onChange={(e) => zetHand(k, c.id, { notitie: e.target.value })} /></td>
                      </tr>
                      {v && !overgenomen && (
                        <tr>
                          <td colSpan={3} className="pb-1.5">
                            <div className="rounded border border-indigo-100 bg-indigo-50 px-2 py-1 text-[11px] leading-snug text-slate-700">
                              <span className="font-medium text-indigo-900">AI-voorstel: {v.score ?? "geen score"}</span> <span className="text-slate-500">· zekerheid {v.zekerheid}</span>
                              {v.score && <button className="float-right ml-2 underline" onClick={() => neemOver(k, [c.id])}>Overnemen</button>}
                              <div>{v.motivatie}</div>
                              {v.controleer && <div className="text-slate-500">Controleer: {v.controleer}</div>}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            <LocatieVelden l={l} k={k} bewaar={bewaar} />
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <button className="underline" onClick={() => setFocus([...k.punt] as LngLat)}>Toon op kaart</button>
              <button className="font-medium text-emerald-800 underline" onClick={() => setBeeld3d(k.id)}>3D-beeld</button>
              <a className="underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${k.punt[1]},${k.punt[0]}`}>Streetview</a>
              <button className="underline" title="Panoramabeeld van Cyclomedia; vereist een account en API-sleutel" onClick={() => setStraat(k.id)}>Street Smart</button>
              <a className="underline" target="_blank" rel="noreferrer" href="https://omgevingswet.overheid.nl/regels-op-de-kaart">Omgevingsloket</a>
              {k.voorstel && HAND_CRITERIA.some((c) => k.voorstel![c.id]?.score && !k.handmatig[c.id]?.score) && (
                <button className="underline" onClick={() => neemOver(k, HAND_CRITERIA.filter((c) => !k.handmatig[c.id]?.score).map((c) => c.id))}>Open voorstellen overnemen</button>
              )}
              <span className="grow" />
              {!voorkeur && geschikt && <button className="knop groen !py-1" onClick={() => bewaar({ voorkeurId: k.id, ...(l.status === "Kandidaten" ? { status: "Rapport" } : {}) })}>Kies als voorkeur</button>}
              {voorkeur && <button className="underline" onClick={() => bewaar({ voorkeurId: null })}>Voorkeur intrekken</button>}
            </div>
          </div>
        );
      })}
      {l.voorkeurId && (
        <label className="block text-sm font-medium">Motivatie voorkeurslocatie
          <textarea className="veld mt-1 font-normal" rows={3} value={l.voorkeurMotivatie} onChange={(e) => bewaar({ voorkeurMotivatie: e.target.value })} placeholder="Waarom deze locatie, ook als een andere hoger scoort?" />
        </label>
      )}
      <details className="rounded border border-slate-200 p-3 text-sm">
        <summary className="cursor-pointer font-medium">Wegingsfactoren</summary>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
          {[...AUTO_CRITERIA, ...HAND_CRITERIA].map((c) => (
            <label key={c.id} className="flex items-center justify-between gap-2 text-xs">{c.naam}
              <input type="number" min={0} max={9} className="w-12 rounded border border-slate-300 px-1 py-0.5 text-right" value={l.gewichten[c.id] ?? c.gewicht} onChange={(e) => bewaar({ gewichten: { ...l.gewichten, [c.id]: Math.max(0, +e.target.value) } })} />
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">Score = gewogen gemiddelde van alle ingevulde criteria (1–5), omgerekend naar 0–100. Gewicht 0 sluit een criterium uit.</p>
      </details>
    </div>
  );
}

function Rapport({ l, bewaar, setL, verstuur }: { l: Lqs; bewaar: Bewaar; setL: (l: Lqs) => void; verstuur: () => Promise<void> }) {
  const [zeker, setZeker] = useState(false);
  const opnieuw = async () => {
    await verstuur();
    setL(await api<Lqs>(`/api/lqs/${l.id}/teksten`, "POST", {}));
    setZeker(false);
  };
  return (
    <div className="space-y-3">
      <RapportVelden l={l} bewaar={bewaar} verstuur={verstuur} />
      <div className="flex flex-wrap items-center gap-2">
        {zeker
          ? <><button className="knop" onClick={opnieuw}>Ja, overschrijf mijn aanpassingen</button><button className="knop licht" onClick={() => setZeker(false)}>Annuleren</button></>
          : <button className="knop licht" onClick={() => setZeker(true)}>Concepttekst opnieuw opbouwen</button>}
      </div>
      <p className="text-xs text-slate-500">De concepttekst wordt opgebouwd uit de analyseresultaten, zodat elk rapport dezelfde opbouw en formuleringen heeft. Vul aan en redigeer waar nodig; kaarten, locatiepagina's en het overzicht komen automatisch in de template.</p>
      <details className="rounded border border-slate-200 p-3 text-sm">
        <summary className="cursor-pointer font-medium">Werkrapport in eigen opmaak (onderbouwing, scores en lagentabel)</summary>
        <div className="mt-2 space-y-3">
          <Link href={`/lqs/${l.id}/rapport`} target="_blank" className="knop licht inline-block" onClick={() => void verstuur()}>Werkrapport openen</Link>
          {RAPPORT_SECTIES.map((s, i) => (
            <label key={s.id} className="block text-sm font-medium">{i + 1}. {s.titel}
              <textarea className="veld mt-1 font-normal leading-relaxed" rows={5} value={l.teksten[s.id] ?? ""} onChange={(e) => bewaar({ teksten: { ...l.teksten, [s.id]: e.target.value } })} />
            </label>
          ))}
        </div>
      </details>
      {l.status === "Rapport" && <button className="knop" onClick={() => bewaar({ status: "Review" })}>Aanbieden voor review</button>}
    </div>
  );
}

function Review({ l, bewaar }: { l: Lqs; bewaar: Bewaar }) {
  const item = (id: string) => l.review.items.find((x) => x.id === id) ?? { id, akkoord: false, opmerking: "" };
  const zet = (id: string, w: Partial<{ akkoord: boolean; opmerking: string }>) =>
    bewaar({ review: { ...l.review, items: REVIEW_PUNTEN.map((p) => (p.id === id ? { ...item(p.id), ...w } : item(p.id))) } });
  const akkoord = REVIEW_PUNTEN.filter((p) => item(p.id).akkoord).length;
  const open = [
    !l.voorkeurId && "er is nog geen voorkeurslocatie gekozen",
    akkoord < REVIEW_PUNTEN.length && `${REVIEW_PUNTEN.length - akkoord} controlepunt(en) staan nog open`,
    !l.review.reviewer.trim() && "de naam van de reviewer ontbreekt",
  ].filter(Boolean);
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">Vier-ogencontrole vóór oplevering aan de planoloog van Enexis. Een tweede persoon loopt de punten na.</p>
      <label className="block text-sm">Reviewer<input className="veld mt-1" value={l.review.reviewer} onChange={(e) => bewaar({ review: { ...l.review, reviewer: e.target.value } })} /></label>
      {REVIEW_PUNTEN.map((p) => (
        <div key={p.id} className="rounded border border-slate-200 p-2">
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={item(p.id).akkoord} onChange={(e) => zet(p.id, { akkoord: e.target.checked })} />{p.tekst}</label>
          <input className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-xs" placeholder="opmerking" value={item(p.id).opmerking} onChange={(e) => zet(p.id, { opmerking: e.target.value })} />
        </div>
      ))}
      {l.status === "Opgeleverd"
        ? <p className="rounded bg-emerald-50 p-3 text-sm text-emerald-900">Opgeleverd op {datum(l.opgeleverdOp)}.</p>
        : <>
            {open.length > 0 && <p className="text-xs text-amber-800">Nog niet op te leveren: {open.join("; ")}.</p>}
            <button className="knop groen" disabled={open.length > 0} onClick={() => bewaar({ status: "Opgeleverd", opgeleverdOp: new Date().toISOString().slice(0, 10) })}>Opleveren</button>
          </>}
    </div>
  );
}

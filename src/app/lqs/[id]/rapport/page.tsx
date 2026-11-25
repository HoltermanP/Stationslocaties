"use client";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { AUTO_CRITERIA, HAND_CRITERIA, RAPPORT_SECTIES, STATION_TYPEN, TRACE } from "@/lib/config";
import { datum, ha, rangorde } from "@/lib/score";
import type { Lqs } from "@/lib/types";

const Kaart = dynamic(() => import("@/components/Kaart"), { ssr: false });
const Kaart3D = dynamic(() => import("@/components/Kaart3D"), { ssr: false });
const getal = (n: number) => n.toLocaleString("nl-NL");

export default function RapportPagina() {
  const { id } = useParams<{ id: string }>();
  const [l, setL] = useState<Lqs | null>(null);
  const [fout, setFout] = useState("");
  useEffect(() => {
    api<Lqs>(`/api/lqs/${id}`).then(setL).catch((e) => setFout(e.message));
  }, [id]);
  if (!l) return <p className="p-6 text-sm text-slate-600">{fout || "Laden…"}</p>;

  const a = l.analyse;
  const rang = rangorde(l.kandidaten, l.gewichten);
  const voorkeur = l.kandidaten.find((k) => k.id === l.voorkeurId) ?? null;
  const tekst = (sid: string) => (l.teksten[sid] ?? "").split(/\n+/).filter(Boolean).map((p, i) => <p key={i} className="mb-2">{p}</p>);
  const kop = (sid: string) => { const i = RAPPORT_SECTIES.findIndex((s) => s.id === sid); return <h2 className="mb-2 mt-6 text-lg font-semibold text-slate-900">{i + 1}. {RAPPORT_SECTIES[i].titel}</h2>; };
  const lagen = a?.lagen.filter((x) => x.soort !== "uit") ?? [];

  return (
    <main className="mx-auto w-full max-w-[820px] bg-white p-10 text-[13.5px] leading-relaxed text-slate-800 shadow print:p-0 print:shadow-none">
      <div className="geen-print mb-6 flex items-center justify-between rounded bg-slate-100 p-3 text-sm">
        <span>Kies bij afdrukken &quot;Opslaan als PDF&quot;. Wacht tot de kaarten geladen zijn.</span>
        <button className="knop groen" onClick={() => window.print()}>Afdrukken / PDF</button>
      </div>

      <div className="border-b-4 border-slate-900 pb-4">
        <div className="text-xs uppercase tracking-widest text-slate-500">Locatie QuickScan</div>
        <h1 className="mt-1 text-3xl font-semibold text-slate-900">{l.naam}</h1>
        <div className="mt-1 text-slate-600">Middenspanningsstation{l.gemeente && ` · gemeente ${l.gemeente}`}</div>
      </div>
      <table className="mt-4 w-full text-sm">
        <tbody>
          {[
            ["Kenmerk", l.code], ["Type station", STATION_TYPEN.find((t) => t.id === l.stationType)?.naam ?? l.stationType], ["Benodigde kavel", `${l.kavelB} × ${l.kavelL} m`],
            ["Planoloog Enexis", l.planoloog || "–"], ["Opgesteld door", l.uitvoerder || "–"], ["Review door", l.review.reviewer || "–"],
            ["Datum", datum(l.opgeleverdOp ?? new Date().toISOString())], ["Status", l.status === "Opgeleverd" ? "Definitief" : `Concept (${l.status.toLowerCase()})`],
          ].map(([k, w]) => <tr key={k} className="border-b border-slate-100"><td className="w-44 py-1 text-slate-500">{k}</td><td>{w}</td></tr>)}
        </tbody>
      </table>

      {kop("aanleiding")}{tekst("aanleiding")}
      {kop("zoekgebied")}{tekst("zoekgebied")}

      {kop("analyse")}{tekst("analyse")}
      {a && (
        <>
          <div className="my-3 h-[420px] break-inside-avoid border border-slate-300">
            <Kaart statisch zoekgebied={l.zoekgebied} analyse={a} kandidaten={l.kandidaten} aansluitpunt={l.aansluitpunt} voorkeurId={l.voorkeurId} />
          </div>
          <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
            <span><i className="mr-1 inline-block h-2.5 w-2.5 align-middle" style={{ background: "#22c55e" }} />kavel inpasbaar</span>
            <span><i className="mr-1 inline-block h-2.5 w-2.5 align-middle" style={{ background: "#0a3b3f" }} />onderzochte locatie</span>
            {voorkeur && <span className="font-semibold text-emerald-700"><i className="mr-1 inline-block h-2.5 w-2.5 align-middle" style={{ background: "#08774a" }} />★ voorkeurslocatie</span>}
            {lagen.map((x) => <span key={x.id}><i className="mr-1 inline-block h-2.5 w-2.5 align-middle" style={{ background: x.kleur }} />{x.naam}</span>)}
          </div>
          <table className="w-full break-inside-avoid text-xs [&_td]:pr-2 [&_th]:pr-2">
            <thead className="border-b border-slate-400 text-left"><tr><th className="py-1">Kaartlaag</th><th>Thema</th><th>Bron</th><th>Behandeling</th><th className="text-right">Buffer</th><th className="text-right">Objecten</th><th className="text-right">Aandeel</th></tr></thead>
            <tbody>
              {lagen.map((x) => (
                <tr key={x.id} className="border-b border-slate-100"><td className="py-1">{x.naam}</td><td>{x.thema}</td><td>{x.bron}</td><td>{x.soort === "uitsluiten" ? "Uitsluiten" : "Aandacht"}</td><td className="text-right">{x.buffer} m</td>
                  <td className="text-right">{x.status === "ok" ? x.aantal : "–"}</td><td className="text-right">{x.status === "ok" ? `${x.pct.toFixed(1)}%` : "niet beschikbaar"}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-xs text-slate-500">Aandeel = deel van het zoekgebied ({ha(a.oppZoekgebiedM2)}) dat door de laag inclusief buffer wordt geraakt. Lagen overlappen; de aandelen tellen niet op tot het totaal.</p>
        </>
      )}

      {kop("kansrijk")}{tekst("kansrijk")}

      <div className="pagina-einde" />
      {kop("afweging")}{tekst("afweging")}
      {rang.length > 0 && (
        <table className="my-3 w-full text-xs">
          <thead className="border-b border-slate-400 text-left">
            <tr><th className="py-1">Criterium</th><th className="text-right">Gewicht</th>{rang.map((r) => <th key={r.k.id} className={`text-center ${r.k.id === l.voorkeurId ? "bg-emerald-50" : ""}`}>{r.k.naam}</th>)}</tr>
          </thead>
          <tbody>
            {[...AUTO_CRITERIA, ...HAND_CRITERIA].map((c) => (
              <tr key={c.id} className="border-b border-slate-100"><td className="py-1">{c.naam}</td><td className="text-right">{l.gewichten[c.id] ?? c.gewicht}</td>
                {rang.map((r) => <td key={r.k.id} className={`text-center ${r.k.id === l.voorkeurId ? "bg-emerald-50" : ""}`}>{(r.k.auto[c.id]?.score ?? r.k.handmatig[c.id]?.score) || "–"}</td>)}</tr>
            ))}
            <tr className="border-t border-slate-400 font-semibold"><td className="py-1">Totaalscore (0–100)</td><td />{rang.map((r) => <td key={r.k.id} className={`text-center ${r.k.id === l.voorkeurId ? "bg-emerald-50" : ""}`}>{r.score}{!r.geschikt && " *"}</td>)}</tr>
          </tbody>
        </table>
      )}
      {rang.some((r) => !r.geschikt) && <p className="text-xs text-slate-500">* Locatie ligt in uitgesloten gebied en valt af, ongeacht de score.</p>}
      {rang.map((r) => (
        <div key={r.k.id} className="mt-3 break-inside-avoid text-xs">
          <div className="text-sm font-semibold">{r.k.naam}{r.k.adres && <span className="font-normal text-slate-500"> · {r.k.adres}</span>}</div>
          <ul className="list-disc pl-5 text-slate-700">
            {AUTO_CRITERIA.map((c) => <li key={c.id}>{c.naam}: {r.k.auto[c.id]?.toelichting}</li>)}
            {HAND_CRITERIA.filter((c) => r.k.handmatig[c.id]?.notitie).map((c) => <li key={c.id}>{c.naam}: {r.k.handmatig[c.id].notitie}{r.k.handmatig[c.id].ai && " ¹"}</li>)}
          </ul>
        </div>
      ))}

      {rang.some((x) => x.k.trace) && (
        <div className="mt-4 break-inside-avoid">
          <div className="text-sm font-semibold">Kabeltracé en kostenindicatie</div>
          <table className="my-2 w-full text-xs [&_td]:pr-2 [&_th]:pr-2">
            <thead className="border-b border-slate-400 text-left"><tr><th className="py-1">Locatie</th><th className="text-right">Hemelsbreed</th><th className="text-right">Tracé</th><th className="text-right">Langs de weg</th><th className="text-right">Overig terrein</th><th className="text-right">Boring</th><th className="text-right">Indicatie aanleg</th></tr></thead>
            <tbody>
              {rang.filter((x) => x.k.trace).map(({ k }) => (
                <tr key={k.id} className={`border-b border-slate-100 ${k.id === l.voorkeurId ? "bg-emerald-50" : ""}`}><td className="py-1">{k.naam}</td><td className="text-right">{getal(k.trace!.hemelsbreed)} m</td><td className="text-right">{getal(k.trace!.lengte)} m</td>
                  <td className="text-right">{getal(k.trace!.langsWeg)} m</td><td className="text-right">{getal(k.trace!.overig)} m</td><td className="text-right">{getal(k.trace!.boring)} m</td><td className="text-right font-medium">€ {getal(k.trace!.kosten)}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-slate-500">Tracé naar {rang.find((x) => x.k.trace)!.k.trace!.doel}, bij voorkeur langs de openbare weg. Kengetallen per meter tracé: langs de weg € {TRACE.weg}, overig terrein € {TRACE.overig}, boring onder water of spoor € {TRACE.boring}. De bedragen zijn een indicatie voor de onderlinge vergelijking, exclusief het station, engineering en btw.</p>
        </div>
      )}

      {kop("advies")}{tekst("advies")}
      {voorkeur && (
        <div className="my-3 h-[360px] break-inside-avoid border border-slate-300">
          <Kaart statisch zoekgebied={l.zoekgebied} kandidaten={l.kandidaten} voorkeurId={voorkeur.id} focus={voorkeur.punt} start={{ lucht: true, kadaster: true }} />
        </div>
      )}
      {voorkeur && (
        <>
          <div className="my-3 h-[400px] break-inside-avoid border border-slate-300">
            <Kaart3D statisch kandidaat={voorkeur} stationType={l.stationType} />
          </div>
          <p className="text-xs text-slate-500">3D-beeld van het station op de voorkeurslocatie. Kavel, gebouw en hekwerk staan op schaal tussen de bestaande bebouwing (hoogtes uit 3DBAG); gevels en beplanting zijn indicatief.</p>
        </>
      )}
      {!voorkeur && <p className="rounded bg-amber-50 p-2 text-xs text-amber-900">Er is nog geen voorkeurslocatie vastgesteld; het advies hierboven is gebaseerd op de hoogste score.</p>}

      {kop("vervolg")}{tekst("vervolg")}

      <h2 className="mb-2 mt-6 text-lg font-semibold text-slate-900">Bijlage: verantwoording</h2>
      <ul className="list-disc pl-5 text-xs text-slate-600">
        {a && <li>Analyse uitgevoerd op {new Date(a.uitgevoerdOp).toLocaleString("nl-NL")} met een rekenraster van {a.cel} m in RD-coördinaten (EPSG:28992).</li>}
        <li>Openbare bronnen: BAG en BRT TOP10NL (Kadaster, via PDOK), Natura 2000 (RVO), rijksmonumenten en archeologische monumenten (RCE). Aangeleverde geodata is als afzonderlijke laag meegenomen.</li>
        <li>De kavel is als rechthoek ingepast, evenwijdig aan het RD-stelsel, in twee oriëntaties. Afstanden tot woningen en wegen zijn hemelsbreed.</li>
        {l.kandidaten.some((k) => k.trace) && <li>Het kabeltracé is de goedkoopste route over het rekenraster: bij voorkeur langs de openbare weg, water en spoor worden met een boring gekruist, bebouwing wordt gemeden. Ligging van bestaande kabels en leidingen is hierin niet meegenomen.</li>}
        <li>Omgevingsplan, eigendom en kabels en leidingen zijn door de opsteller beoordeeld en als handmatige criteria gescoord.</li>
        {l.kandidaten.some((k) => Object.values(k.handmatig).some((h) => h.ai)) && <li>¹ Score en motivatie zijn een AI-voorstel op basis van openbare gegevens (bestemming, kadastraal perceel, grondgebruik), ongewijzigd overgenomen door de opsteller.</li>}
        <li>Deze LQS is een bureaustudie. Er heeft geen locatiebezoek en geen afstemming met het bevoegd gezag plaatsgevonden.</li>
      </ul>
    </main>
  );
}

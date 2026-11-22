"use client";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { naarRD, naarWGS } from "@/lib/analyse/rd";
import type { AangedragenLocatie, Analyse, EigenLaag, Kandidaat, LngLat, Polygoon } from "@/lib/types";

export type KaartModus = "kijk" | "teken" | "punt";

type Props = {
  zoekgebied?: Polygoon | null;
  analyse?: Analyse | null;
  kandidaten?: Kandidaat[];
  aangedragen?: AangedragenLocatie[];
  aansluitpunt?: LngLat | null;
  /** KLIC-lagen (kabels en leidingen van derden); apart aan en uit te zetten */
  klic?: EigenLaag[];
  voorkeurId?: string | null;
  modus?: KaartModus;
  puntHint?: string;
  statisch?: boolean;
  focus?: LngLat | null;
  start?: Record<string, boolean>;
  onPolygoon?: (p: Polygoon) => void;
  onPunt?: (p: LngLat) => void;
  onKandidaat?: (id: string) => void;
};

const wms = (basis: string, laag: string) =>
  `${basis}?service=WMS&version=1.3.0&request=GetMap&layers=${laag}&styles=&crs=EPSG:3857&bbox={bbox-epsg-3857}&width=512&height=512&format=image/png&transparent=true`;

const ONDERGRONDEN = [
  { id: "lucht", naam: "Luchtfoto" },
  { id: "kadaster", naam: "Kadastrale kaart" },
  { id: "plu", naam: "Bestemmingen" },
  { id: "analyse", naam: "Analyse" },
];

// MapLibre 6 laadt zijn worker als los bestand; `npm run kaartworker` zet het in /public/maplibre.
if (typeof window !== "undefined") maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

// Kleur per thema, zoals bij kabels en leidingen gebruikelijk: elektra rood/blauw, gas geel, water blauw, riool bruin, data groen
const KLIC_KLEUR: Record<string, string> = {
  laagspanning: "#2563eb", middenspanning: "#dc2626", hoogspanning: "#7f1d1d", landelijkHoogspanningsnet: "#7f1d1d",
  gasLageDruk: "#eab308", gasHogeDruk: "#ea580c", buisleidingGevaarlijkeInhoud: "#c026d3", petrochemie: "#c026d3",
  water: "#0891b2", rioolVrijverval: "#92400e", rioolOnderOverOfOnderdruk: "#92400e", warmte: "#db2777", datatransport: "#16a34a", wees: "#64748b", overig: "#64748b",
};
const KLIC_NAAM: Record<string, string> = {
  laagspanning: "Laagspanning", middenspanning: "Middenspanning", hoogspanning: "Hoogspanning", landelijkHoogspanningsnet: "Landelijk hoogspanningsnet",
  gasLageDruk: "Gas lage druk", gasHogeDruk: "Gas hoge druk", buisleidingGevaarlijkeInhoud: "Buisleiding gevaarlijke inhoud", petrochemie: "(Petro)chemie",
  water: "Water", rioolVrijverval: "Riool", rioolOnderOverOfOnderdruk: "Riool onder druk", warmte: "Warmte", datatransport: "Datatransport", wees: "Weesleiding", overig: "Overig",
};

/** Alle lijnen uit de KLIC-lagen als GeoJSON-features in WGS84 (de lagen zelf staan in RD of WGS84, net als bij de analyse). */
function klicFeatures(lagen: EigenLaag[]) {
  const uit: unknown[] = [];
  const punt = (c: number[]) => (Math.abs(c[0]) > 180 || Math.abs(c[1]) > 180 ? naarWGS(c) : [c[0], c[1]]);
  const conv = (c: unknown): unknown => (typeof (c as number[])[0] === "number" ? punt(c as number[]) : (c as unknown[]).map(conv));
  for (const laag of lagen) {
    const thema = laag.id.replace(/^klic-/, "");
    const loop = (o: unknown) => {
      const x = o as { type?: string; features?: unknown[]; geometry?: unknown; properties?: Record<string, unknown>; coordinates?: unknown };
      if (x?.type === "FeatureCollection") x.features?.forEach(loop);
      else if (x?.type === "Feature") {
        const g = x.geometry as { type?: string; coordinates?: unknown } | undefined;
        if (g?.coordinates) uit.push({ type: "Feature", properties: { thema, ...x.properties }, geometry: { type: g.type, coordinates: conv(g.coordinates) } });
      } else if (x?.coordinates) uit.push({ type: "Feature", properties: { thema }, geometry: { type: x.type, coordinates: conv(x.coordinates) } });
    };
    loop(laag.geojson);
  }
  return uit;
}

const fc = (features: unknown[]) => ({ type: "FeatureCollection", features }) as never;

// 3D-weergave: bebouwing (BAG + hoogte uit 3DBAG) via /api/omgeving, per blok van 800 × 800 m in RD, pas vanaf deze zoom
const MIN_ZOOM_3D = 15.5;
const BLOK = 800;
const MAX_BLOKKEN = 6;
type Gebouw = { type: "Feature"; properties: { h: number; geschat: boolean }; geometry: unknown };

export default function Kaart(p: Props) {
  const el = useRef<HTMLDivElement>(null);
  const kaart = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const actueel = useRef(p);
  actueel.current = p;
  const schets = useRef<LngLat[]>([]);
  const [gereed, setGereed] = useState(false);
  const [aantal, setAantal] = useState(0);
  const [drie, setDrie] = useState(false);
  const [drieStatus, setDrieStatus] = useState("");
  const blokken = useRef(new Map<string, Gebouw[]>());
  const [aan, setAan] = useState<Record<string, boolean>>(p.start ?? { analyse: true, klic: true });
  const [klikInfo, setKlikInfo] = useState<Record<string, unknown> | null>(null);

  const tekenSchets = () => {
    const s = schets.current;
    const src = kaart.current?.getSource("schets") as maplibregl.GeoJSONSource | undefined;
    src?.setData(
      fc([
        ...(s.length > 1 ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: s.length > 2 ? [...s, s[0]] : s } }] : []),
        ...s.map((c) => ({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: c } })),
      ]),
    );
    setAantal(s.length);
  };
  const voltooi = () => {
    if (schets.current.length < 3) return;
    actueel.current.onPolygoon?.({ type: "Polygon", coordinates: [[...schets.current, schets.current[0]]] });
    schets.current = [];
    tekenSchets();
  };

  useEffect(() => {
    const m = new maplibregl.Map({
      container: el.current!,
      center: [6.1, 52.5],
      zoom: 7,
      interactive: !p.statisch,
      maxPitch: 75,
      attributionControl: false,
      canvasContextAttributes: { preserveDrawingBuffer: true },
      style: {
        version: 8,
        sources: {
          brt: { type: "raster", tileSize: 256, tiles: ["https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/grijs/EPSG:3857/{z}/{x}/{y}.png"], maxzoom: 19, attribution: "© PDOK / Kadaster" },
          lucht: { type: "raster", tileSize: 256, tiles: ["https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg"], maxzoom: 19 },
          kadaster: { type: "raster", tileSize: 512, tiles: [wms("https://service.pdok.nl/kadaster/kadastralekaart/wms/v5_0", "Kadastralekaart")], minzoom: 14 },
          plu: { type: "raster", tileSize: 512, tiles: [wms("https://service.pdok.nl/kadaster/plu/wms/v1_0", "enkelbestemming")], minzoom: 12 },
          gebouwen: { type: "geojson", data: fc([]), attribution: "Bebouwing © Kadaster (BAG) / 3DBAG (TU Delft)" },
          gebied: { type: "geojson", data: fc([]) },
          kavels: { type: "geojson", data: fc([]) },
          traces: { type: "geojson", data: fc([]) },
          schets: { type: "geojson", data: fc([]) },
          klic: { type: "geojson", data: fc([]) },
        },
        layers: [
          { id: "brt", type: "raster", source: "brt" },
          { id: "lucht", type: "raster", source: "lucht", layout: { visibility: "none" } },
          { id: "plu", type: "raster", source: "plu", layout: { visibility: "none" }, paint: { "raster-opacity": 0.6 } },
          { id: "kadaster", type: "raster", source: "kadaster", layout: { visibility: "none" } },
          { id: "gebouwen3d", type: "fill-extrusion", source: "gebouwen", layout: { visibility: "none" }, paint: { "fill-extrusion-color": ["case", ["==", ["get", "geschat"], true], "#f0e2bd", "#dedbd5"], "fill-extrusion-height": ["get", "h"], "fill-extrusion-opacity": 0.93, "fill-extrusion-vertical-gradient": true } },
          { id: "gebied", type: "line", source: "gebied", paint: { "line-color": "#0f172a", "line-width": 2.5, "line-dasharray": [3, 2] } },
          { id: "traces-rand", type: "line", source: "traces", paint: { "line-color": "#ffffff", "line-width": ["case", ["get", "voorkeur"], 6, 4], "line-opacity": 0.8 } },
          { id: "traces", type: "line", source: "traces", paint: { "line-color": ["case", ["get", "voorkeur"], "#d97706", "#f59e0b"], "line-width": ["case", ["get", "voorkeur"], 3.5, 2], "line-dasharray": [2, 1.5] } },
          { id: "klic-rand", type: "line", source: "klic", layout: { visibility: "none", "line-cap": "round" }, paint: { "line-color": "#ffffff", "line-width": ["case", ["==", ["get", "aard"], "aansluiting"], 3, 5], "line-opacity": 0.7 } },
          { id: "klic", type: "line", source: "klic", layout: { visibility: "none", "line-cap": "round" }, paint: { "line-color": ["match", ["get", "thema"], ...Object.entries(KLIC_KLEUR).flat(), "#64748b"] as never, "line-width": ["case", ["==", ["get", "aard"], "aansluiting"], 1.2, 2.4] } },
          { id: "kavels-vlak", type: "fill", source: "kavels", paint: { "fill-color": ["case", ["get", "voorkeur"], "#059669", "#0f172a"], "fill-opacity": 0.35 } },
          { id: "kavels-lijn", type: "line", source: "kavels", paint: { "line-color": ["case", ["get", "voorkeur"], "#047857", "#0f172a"], "line-width": 2 } },
          { id: "schets-lijn", type: "line", source: "schets", paint: { "line-color": "#dc2626", "line-width": 2 } },
          { id: "schets-punt", type: "circle", source: "schets", filter: ["==", "$type", "Point"], paint: { "circle-radius": 4, "circle-color": "#dc2626" } },
        ],
      },
    });
    if (!p.statisch) {
      m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-left");
      m.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    }
    m.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    m.on("load", () => setGereed(true));
    m.on("click", (e) => {
      const a = actueel.current;
      const punt: LngLat = [+e.lngLat.lng.toFixed(6), +e.lngLat.lat.toFixed(6)];
      if (a.modus === "teken") {
        schets.current = [...schets.current, punt];
        tekenSchets();
      } else if (a.modus === "punt") a.onPunt?.(punt);
    });
    m.on("click", "klic", (e) => {
      if (actueel.current.modus && actueel.current.modus !== "kijk") return;
      const f = e.features?.[0];
      if (f) setKlikInfo(f.properties as Record<string, unknown>);
    });
    m.on("mouseenter", "klic", () => { if (!actueel.current.modus || actueel.current.modus === "kijk") m.getCanvas().style.cursor = "pointer"; });
    m.on("mouseleave", "klic", () => { m.getCanvas().style.cursor = ""; });
    kaart.current = m;
    return () => {
      m.remove();
      kaart.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // zoekgebied
  const gebiedSleutel = JSON.stringify(p.zoekgebied ?? null);
  useEffect(() => {
    const m = kaart.current;
    if (!gereed || !m) return;
    (m.getSource("gebied") as maplibregl.GeoJSONSource).setData(fc(p.zoekgebied ? [{ type: "Feature", properties: {}, geometry: p.zoekgebied }] : []));
    if (p.zoekgebied) {
      const b = new maplibregl.LngLatBounds();
      p.zoekgebied.coordinates[0].forEach((c) => b.extend(c as LngLat));
      m.fitBounds(b, { padding: p.statisch ? 24 : 60, duration: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gereed, gebiedSleutel]);

  // analyse-overlay
  useEffect(() => {
    const m = kaart.current;
    if (!gereed || !m) return;
    if (m.getLayer("analyse")) m.removeLayer("analyse");
    if (m.getSource("analyse")) m.removeSource("analyse");
    if (p.analyse) {
      m.addSource("analyse", { type: "image", url: p.analyse.overlay, coordinates: p.analyse.hoeken as never });
      m.addLayer({ id: "analyse", type: "raster", source: "analyse", paint: { "raster-opacity": 0.85, "raster-resampling": "nearest", "raster-fade-duration": 0 }, layout: { visibility: aan.analyse ? "visible" : "none" } }, "gebied");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gereed, p.analyse?.uitgevoerdOp]);

  // KLIC-leidingen als aparte laag
  const klicSleutel = (p.klic ?? []).map((k) => `${k.id}:${JSON.stringify(k.geojson).length}`).join("|");
  const klicLagen = (p.klic ?? []).filter((k) => k.functie === "leidingen");
  useEffect(() => {
    const m = kaart.current;
    if (!gereed || !m) return;
    (m.getSource("klic") as maplibregl.GeoJSONSource).setData(fc(klicFeatures(klicLagen)));
    setKlikInfo(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gereed, klicSleutel]);
  useEffect(() => {
    const m = kaart.current;
    if (!gereed || !m) return;
    const zicht = aan.klic && klicLagen.length ? "visible" : "none";
    for (const id of ["klic", "klic-rand"]) m.setLayoutProperty(id, "visibility", zicht);
    if (!aan.klic) setKlikInfo(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gereed, aan.klic, klicSleutel]);

  // ondergronden
  useEffect(() => {
    const m = kaart.current;
    if (!gereed || !m) return;
    for (const o of ONDERGRONDEN) if (m.getLayer(o.id)) m.setLayoutProperty(o.id, "visibility", aan[o.id] ? "visible" : "none");
  }, [gereed, aan]);

  // 3D: kaart kantelen en de bebouwing rond het beeld laden
  useEffect(() => {
    const m = kaart.current;
    if (!gereed || !m) return;
    if (!drie) {
      m.setLayoutProperty("gebouwen3d", "visibility", "none");
      setDrieStatus("");
      if (m.getPitch() > 0 || m.getBearing() !== 0) m.easeTo({ pitch: 0, bearing: 0, duration: 700 });
      return;
    }
    m.setLayoutProperty("gebouwen3d", "visibility", "visible");
    if (m.getPitch() < 30) m.easeTo({ pitch: 60, duration: 900 });
    let weg = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const bezig = new Set<string>();
    const toon = () => (m.getSource("gebouwen") as maplibregl.GeoJSONSource | undefined)?.setData(fc([...blokken.current.values()].flat()));
    const laad = async () => {
      if (m.getZoom() < MIN_ZOOM_3D) { setDrieStatus(`Zoom verder in (vanaf ${MIN_ZOOM_3D.toFixed(0)}) om de bebouwing in 3D te zien`); return; }
      const [cx, cy] = naarRD([m.getCenter().lng, m.getCenter().lat]);
      const b = m.getBounds();
      const hoeken = [b.getSouthWest(), b.getNorthEast(), b.getNorthWest(), b.getSouthEast()].map((c) => naarRD([c.lng, c.lat]));
      const [x0, x1] = [Math.min(...hoeken.map((c) => c[0])), Math.max(...hoeken.map((c) => c[0]))];
      const [y0, y1] = [Math.min(...hoeken.map((c) => c[1])), Math.max(...hoeken.map((c) => c[1]))];
      const nodig: { sleutel: string; x: number; y: number }[] = [];
      for (let i = Math.floor(x0 / BLOK); i <= Math.floor(x1 / BLOK); i++)
        for (let j = Math.floor(y0 / BLOK); j <= Math.floor(y1 / BLOK); j++) nodig.push({ sleutel: `${i}_${j}`, x: i * BLOK + BLOK / 2, y: j * BLOK + BLOK / 2 });
      const wacht = nodig
        .filter((n) => !blokken.current.has(n.sleutel) && !bezig.has(n.sleutel))
        .sort((a, c) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(c.x - cx, c.y - cy))
        .slice(0, MAX_BLOKKEN);
      if (!wacht.length) { setDrieStatus(""); return; }
      setDrieStatus("Gebouwen laden…");
      wacht.forEach((n) => bezig.add(n.sleutel));
      let fout = false;
      await Promise.all(wacht.map(async (n) => {
        try {
          const r = await fetch(`/api/omgeving?x=${Math.round(n.x)}&y=${Math.round(n.y)}&r=${BLOK / 2}&v=2`);
          const d = (await r.json()) as { gebouwen?: { features: Gebouw[] }; fout?: string };
          if (!d.gebouwen) throw new Error(d.fout ?? "geen gebouwen");
          blokken.current.set(n.sleutel, d.gebouwen.features);
        } catch { fout = true; }
        bezig.delete(n.sleutel);
      }));
      if (weg) return;
      toon();
      setDrieStatus(fout ? "Niet alle bebouwing kon worden geladen" : "");
    };
    const plan = () => { clearTimeout(timer); timer = setTimeout(laad, 400); };
    m.on("moveend", plan);
    toon();
    plan();
    return () => { weg = true; clearTimeout(timer); m.off("moveend", plan); };
  }, [gereed, drie]);

  // kandidaten, aangedragen locaties en aansluitpunt
  const puntenSleutel = JSON.stringify([p.kandidaten?.map((k) => [k.id, k.naam, k.trace?.lengte]), p.aangedragen, p.aansluitpunt, p.voorkeurId]);
  useEffect(() => {
    const m = kaart.current;
    if (!gereed || !m) return;
    markers.current.forEach((x) => x.remove());
    markers.current = [];
    const zet = (punt: LngLat, tekst: string, klasse: string, titel: string, klik?: () => void) => {
      const d = document.createElement("div");
      d.className = `lqs-marker ${klasse}`;
      d.textContent = tekst;
      d.title = titel;
      if (klik) d.addEventListener("click", (e) => { e.stopPropagation(); klik(); });
      markers.current.push(new maplibregl.Marker({ element: d }).setLngLat(punt).addTo(m));
    };
    const ks = p.kandidaten ?? [];
    (m.getSource("kavels") as maplibregl.GeoJSONSource).setData(
      fc(ks.map((k) => ({ type: "Feature", properties: { voorkeur: k.id === p.voorkeurId }, geometry: k.kavel }))),
    );
    (m.getSource("traces") as maplibregl.GeoJSONSource).setData(
      fc(ks.filter((k) => k.trace).map((k) => ({ type: "Feature", properties: { voorkeur: k.id === p.voorkeurId }, geometry: { type: "LineString", coordinates: k.trace!.lijn } }))),
    );
    ks.forEach((k) => {
      const kort = k.bron === "analyse" ? k.naam.replace("Locatie ", "") : "★";
      zet(k.punt, kort, k.id === p.voorkeurId ? "voorkeur" : k.inUitgesloten.length ? "afgevallen" : "", k.naam, () => actueel.current.onKandidaat?.(k.id));
    });
    // aangedragen locaties die nog niet door de analyse zijn beoordeeld
    (p.aangedragen ?? []).filter((a) => !ks.some((k) => k.bron === "aangedragen" && k.naam === a.naam)).forEach((a) => zet(a.punt, "★", "nieuw", `${a.naam} (nog niet geanalyseerd)`));
    if (p.aansluitpunt) zet(p.aansluitpunt, "⚡", "net", "Aansluitpunt");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gereed, puntenSleutel]);

  useEffect(() => {
    const m = kaart.current;
    if (!gereed || !p.focus || !m) return;
    if (p.statisch) m.jumpTo({ center: p.focus, zoom: 17 });
    else m.flyTo({ center: p.focus, zoom: Math.max(m.getZoom(), 16) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gereed, p.focus?.[0], p.focus?.[1]]);

  useEffect(() => {
    if (p.modus !== "teken" && schets.current.length) {
      schets.current = [];
      tekenSchets();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.modus]);

  return (
    <div className="relative h-full w-full">
      <div ref={el} className={`h-full w-full ${p.modus && p.modus !== "kijk" ? "cursor-crosshair [&_canvas]:cursor-crosshair" : ""}`} />
      {!p.statisch && (
        <div className="absolute right-2 top-2 flex flex-wrap justify-end gap-1">
          {ONDERGRONDEN.map((o) => (
            <button key={o.id} onClick={() => setAan((s) => ({ ...s, [o.id]: !s[o.id] }))}
              className={`rounded border px-2 py-1 text-xs shadow-sm ${aan[o.id] ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"}`}>
              {o.naam}
            </button>
          ))}
          {klicLagen.length > 0 && (
            <button onClick={() => setAan((s) => ({ ...s, klic: !s.klic }))} title="Kabels en leidingen van derden (KLIC) aan of uit"
              className={`rounded border px-2 py-1 text-xs shadow-sm ${aan.klic ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"}`}>
              KLIC
            </button>
          )}
          <button onClick={() => setDrie((d) => !d)} title="Kaart kantelen en de bebouwing in 3D tonen (BAG met hoogte uit 3DBAG)"
            className={`rounded border px-2 py-1 text-xs shadow-sm ${drie ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"}`}>
            3D
          </button>
        </div>
      )}
      {!p.statisch && aan.klic && klicLagen.length > 0 && (
        <div className="absolute bottom-10 right-2 max-w-[15rem] rounded bg-white/95 px-2 py-1.5 text-xs text-slate-700 shadow">
          <div className="mb-1 font-medium">KLIC{klicLagen.some((k) => k.naam.includes("gesimuleerd")) ? " (gesimuleerd)" : ""}</div>
          {klicLagen.map((k) => {
            const t = k.id.replace(/^klic-/, "");
            return <div key={k.id} className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4" style={{ background: KLIC_KLEUR[t] ?? "#64748b", height: 3 }} />{KLIC_NAAM[t] ?? t}</div>;
          })}
          {klikInfo && (
            <div className="mt-1.5 border-t pt-1.5">
              <div className="flex justify-between gap-2 font-medium"><span>{KLIC_NAAM[String(klikInfo.thema)] ?? String(klikInfo.thema)}{klikInfo.aard ? ` – ${klikInfo.aard}` : ""}</span><button onClick={() => setKlikInfo(null)} className="text-slate-400">×</button></div>
              {([["beheerder", "Beheerder"], ["kenmerk", "Type"], ["materiaal", "Materiaal"], ["diepteM", "Diepte"], ["aanlegjaar", "Aangelegd"]] as const).filter(([k]) => klikInfo[k] != null && klikInfo[k] !== "").map(([k, naam]) => (
                <div key={k}><span className="text-slate-500">{naam}:</span> {String(klikInfo[k])}{k === "diepteM" ? " m" : ""}</div>
              ))}
            </div>
          )}
        </div>
      )}
      {drie && drieStatus && <div className="absolute bottom-10 left-2 rounded bg-white/95 px-2 py-1 text-xs text-slate-700 shadow">{drieStatus}</div>}
      {p.modus === "teken" && (
        <div className="absolute left-1/2 top-2 flex -translate-x-1/2 items-center gap-2 rounded bg-white px-3 py-2 text-sm shadow">
          <span>Klik de hoekpunten van het zoekgebied ({aantal})</span>
          <button onClick={voltooi} disabled={aantal < 3} className="rounded bg-emerald-700 px-2 py-1 text-white disabled:opacity-40">Voltooien</button>
          <button onClick={() => { schets.current = schets.current.slice(0, -1); tekenSchets(); }} disabled={!aantal} className="rounded border px-2 py-1 disabled:opacity-40">Stap terug</button>
        </div>
      )}
      {p.modus === "punt" && p.puntHint && (
        <div className="absolute left-1/2 top-2 -translate-x-1/2 rounded bg-white px-3 py-2 text-sm shadow">{p.puntHint}</div>
      )}
    </div>
  );
}

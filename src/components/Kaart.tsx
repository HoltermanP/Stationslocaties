"use client";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { AangedragenLocatie, Analyse, Kandidaat, LngLat, Polygoon } from "@/lib/types";

export type KaartModus = "kijk" | "teken" | "punt";

type Props = {
  zoekgebied?: Polygoon | null;
  analyse?: Analyse | null;
  kandidaten?: Kandidaat[];
  aangedragen?: AangedragenLocatie[];
  aansluitpunt?: LngLat | null;
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

const fc = (features: unknown[]) => ({ type: "FeatureCollection", features }) as never;

export default function Kaart(p: Props) {
  const el = useRef<HTMLDivElement>(null);
  const kaart = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const actueel = useRef(p);
  actueel.current = p;
  const schets = useRef<LngLat[]>([]);
  const [gereed, setGereed] = useState(false);
  const [aantal, setAantal] = useState(0);
  const [aan, setAan] = useState<Record<string, boolean>>(p.start ?? { analyse: true });

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
      attributionControl: false,
      canvasContextAttributes: { preserveDrawingBuffer: true },
      style: {
        version: 8,
        sources: {
          brt: { type: "raster", tileSize: 256, tiles: ["https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/grijs/EPSG:3857/{z}/{x}/{y}.png"], maxzoom: 19, attribution: "© PDOK / Kadaster" },
          lucht: { type: "raster", tileSize: 256, tiles: ["https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg"], maxzoom: 19 },
          kadaster: { type: "raster", tileSize: 512, tiles: [wms("https://service.pdok.nl/kadaster/kadastralekaart/wms/v5_0", "Kadastralekaart")], minzoom: 14 },
          plu: { type: "raster", tileSize: 512, tiles: [wms("https://service.pdok.nl/kadaster/plu/wms/v1_0", "enkelbestemming")], minzoom: 12 },
          gebied: { type: "geojson", data: fc([]) },
          kavels: { type: "geojson", data: fc([]) },
          traces: { type: "geojson", data: fc([]) },
          schets: { type: "geojson", data: fc([]) },
        },
        layers: [
          { id: "brt", type: "raster", source: "brt" },
          { id: "lucht", type: "raster", source: "lucht", layout: { visibility: "none" } },
          { id: "plu", type: "raster", source: "plu", layout: { visibility: "none" }, paint: { "raster-opacity": 0.6 } },
          { id: "kadaster", type: "raster", source: "kadaster", layout: { visibility: "none" } },
          { id: "gebied", type: "line", source: "gebied", paint: { "line-color": "#0f172a", "line-width": 2.5, "line-dasharray": [3, 2] } },
          { id: "traces-rand", type: "line", source: "traces", paint: { "line-color": "#ffffff", "line-width": ["case", ["get", "voorkeur"], 6, 4], "line-opacity": 0.8 } },
          { id: "traces", type: "line", source: "traces", paint: { "line-color": ["case", ["get", "voorkeur"], "#d97706", "#f59e0b"], "line-width": ["case", ["get", "voorkeur"], 3.5, 2], "line-dasharray": [2, 1.5] } },
          { id: "kavels-vlak", type: "fill", source: "kavels", paint: { "fill-color": ["case", ["get", "voorkeur"], "#059669", "#0f172a"], "fill-opacity": 0.35 } },
          { id: "kavels-lijn", type: "line", source: "kavels", paint: { "line-color": ["case", ["get", "voorkeur"], "#047857", "#0f172a"], "line-width": 2 } },
          { id: "schets-lijn", type: "line", source: "schets", paint: { "line-color": "#dc2626", "line-width": 2 } },
          { id: "schets-punt", type: "circle", source: "schets", filter: ["==", "$type", "Point"], paint: { "circle-radius": 4, "circle-color": "#dc2626" } },
        ],
      },
    });
    if (!p.statisch) {
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
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

  // ondergronden
  useEffect(() => {
    const m = kaart.current;
    if (!gereed || !m) return;
    for (const o of ONDERGRONDEN) if (m.getLayer(o.id)) m.setLayoutProperty(o.id, "visibility", aan[o.id] ? "visible" : "none");
  }, [gereed, aan]);

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
        </div>
      )}
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

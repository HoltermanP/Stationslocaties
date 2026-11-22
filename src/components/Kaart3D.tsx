"use client";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { naarRD } from "@/lib/analyse/rd";
import { GEVELS, STATION_TYPEN } from "@/lib/config";
import { stationModel } from "@/lib/station3d";
import type { Beeld, Kandidaat } from "@/lib/types";

type Props = {
  kandidaat: Kandidaat;
  stationType: string;
  statisch?: boolean;
  /** Mag het aanzicht worden vastgelegd (werkplek) of alleen bekeken (meekijken)? */
  onBeeld?: (b: Beeld) => void;
  onSluit?: () => void;
};

if (typeof window !== "undefined") maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const fc = (features: unknown[]) => ({ type: "FeatureCollection", features }) as never;
const extrusie = (id: string, laag: string, dekking: number) => ({
  id, type: "fill-extrusion" as const, source: "station", filter: ["==", ["get", "laag"], laag] as never,
  paint: { "fill-extrusion-color": ["get", "kleur"] as never, "fill-extrusion-height": ["get", "h"] as never, "fill-extrusion-base": ["get", "b"] as never, "fill-extrusion-opacity": dekking, "fill-extrusion-vertical-gradient": true },
});

/** 3D-beeld van het station op de kavel, op schaal, tussen de bestaande bebouwing (3DBAG) op de luchtfoto. */
export default function Kaart3D({ kandidaat: k, stationType, statisch, onBeeld, onSluit }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const kaart = useRef<maplibregl.Map | null>(null);
  const [gereed, setGereed] = useState(false);
  const [beplanting, setBeplanting] = useState(k.beeld?.beplanting ?? true);
  const [gevel, setGevel] = useState(k.beeld?.gevel ?? "groen");
  const [vlucht, setVlucht] = useState(false);
  const [bron, setBron] = useState("");
  const [vast, setVast] = useState(false);

  const model = useMemo(() => stationModel(k, stationType, beplanting, gevel), [k, stationType, beplanting, gevel]);
  const kavelL = useMemo(() => Math.max(...zijden(k)), [k]);
  const voor = model.voor;
  const standaard = { bearing: voor - 30, pitch: 62, zoom: (statisch ? 19.2 : 19.7) - Math.log2(Math.max(20, kavelL) / 25) }; // het rapportbeeld is kleiner dan het scherm

  useEffect(() => {
    const start = k.beeld ?? standaard;
    const m = new maplibregl.Map({
      container: el.current!,
      center: model.midden,
      zoom: start.zoom,
      pitch: start.pitch,
      bearing: start.bearing,
      maxPitch: 80,
      maxZoom: 22,
      interactive: !statisch,
      attributionControl: false,
      canvasContextAttributes: { preserveDrawingBuffer: true },
      style: {
        version: 8,
        sky: { "sky-color": "#8fc1ee", "horizon-color": "#e8f1f8", "fog-color": "#e8f1f8", "sky-horizon-blend": 0.7, "horizon-fog-blend": 0.6, "fog-ground-blend": 0.85 },
        light: { anchor: "map", position: [1.5, 215, 42], intensity: 0.42, color: "#ffffff" },
        sources: {
          lucht: { type: "raster", tileSize: 256, tiles: ["https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg"], maxzoom: 19, attribution: "Luchtfoto © Beeldmateriaal Nederland · Bebouwing © Kadaster (BAG) / 3DBAG" },
          gebouwen: { type: "geojson", data: fc([]) },
          station: { type: "geojson", data: fc([]) },
          trace: { type: "geojson", data: fc([]) },
        },
        layers: [
          { id: "lucht", type: "raster", source: "lucht" },
          { id: "trace", type: "line", source: "trace", paint: { "line-color": "#f59e0b", "line-width": 3, "line-dasharray": [2, 1.5] } },
          { id: "gebouwen", type: "fill-extrusion", source: "gebouwen", paint: { "fill-extrusion-color": ["case", ["==", ["get", "geschat"], true], "#f0e2bd", "#dedbd5"], "fill-extrusion-height": ["get", "h"], "fill-extrusion-opacity": 0.96, "fill-extrusion-vertical-gradient": true } },
          extrusie("station-vast", "vast", 1),
          extrusie("station-groen", "groen", 1),
          extrusie("station-hek", "hek", 0.55),
        ],
      },
    });
    if (!statisch) m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-left");
    m.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    m.on("load", () => setGereed(true));
    kaart.current = m;
    let weg = false;
    const [x, y] = naarRD(model.midden);
    fetch(`/api/omgeving?x=${Math.round(x)}&y=${Math.round(y)}&r=300&v=2`)
      .then((r) => r.json())
      .then((d: { bron: string; gebouwen: never }) => {
        if (weg) return;
        setBron(d.bron);
        const zet = () => (m.getSource("gebouwen") as maplibregl.GeoJSONSource | undefined)?.setData(d.gebouwen);
        if (m.loaded()) zet(); else m.once("load", zet);
      })
      .catch(() => setBron("niet beschikbaar"));
    return () => {
      weg = true;
      m.remove();
      kaart.current = null;
      setGereed(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k.id]);

  useEffect(() => {
    const m = kaart.current;
    if (!gereed || !m) return;
    (m.getSource("station") as maplibregl.GeoJSONSource).setData(fc(model.blokken));
    (m.getSource("trace") as maplibregl.GeoJSONSource).setData(fc(k.trace ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: k.trace.lijn } }] : []));
  }, [gereed, model, k.trace]);

  // rondvlucht: de camera draait om het station tot de gebruiker de kaart aanraakt
  useEffect(() => {
    const m = kaart.current;
    if (!vlucht || !m) return;
    let id = 0;
    const stap = () => { m.setBearing(m.getBearing() + 0.2); id = requestAnimationFrame(stap); };
    id = requestAnimationFrame(stap);
    const stop = () => setVlucht(false);
    m.on("mousedown", stop); m.on("touchstart", stop); m.on("wheel", stop);
    return () => { cancelAnimationFrame(id); m.off("mousedown", stop); m.off("touchstart", stop); m.off("wheel", stop); };
  }, [vlucht]);

  const kijk = (bearing: number, pitch = 62) => { setVlucht(false); kaart.current?.easeTo({ center: model.midden, bearing, pitch, zoom: standaard.zoom, duration: 900 }); };
  const opslaan = () => {
    const m = kaart.current;
    if (!m) return;
    const a = document.createElement("a");
    a.href = m.getCanvas().toDataURL("image/png");
    a.download = `3D-beeld ${k.naam}.png`;
    a.click();
  };
  const legVast = () => {
    const m = kaart.current;
    if (!m || !onBeeld) return;
    onBeeld({ bearing: +m.getBearing().toFixed(1), pitch: +m.getPitch().toFixed(1), zoom: +m.getZoom().toFixed(2), beplanting, gevel });
    setVast(true);
    setTimeout(() => setVast(false), 2500);
  };
  const knop = "rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 shadow-sm hover:bg-slate-50";
  const aan = "rounded border border-slate-900 bg-slate-900 px-2 py-1 text-xs text-white shadow-sm";

  return (
    <div className="relative h-full w-full bg-sky-100">
      <div ref={el} className="h-full w-full" />
      {!statisch && (
        <>
          <div className="absolute right-2 top-2 flex max-w-[70%] flex-wrap justify-end gap-1">
            {([["Voorzijde", voor - 30], ["Links", voor + 60], ["Achterzijde", voor + 150], ["Rechts", voor - 120]] as const).map(([naam, b]) => (
              <button key={naam} className={knop} onClick={() => kijk(b)}>{naam}</button>
            ))}
            <button className={knop} onClick={() => kijk(voor, 0)}>Bovenaanzicht</button>
            <button className={vlucht ? aan : knop} onClick={() => setVlucht(!vlucht)}>Rondvlucht</button>
            <button className={beplanting ? aan : knop} onClick={() => setBeplanting(!beplanting)}>Beplanting</button>
            <button className={knop} title="Gevelafwerking volgens de menukaart van Enexis" onClick={() => setGevel(GEVELS[(GEVELS.findIndex((g) => g.id === gevel) + 1) % GEVELS.length].id)}>Gevel: {GEVELS.find((g) => g.id === gevel)?.naam ?? gevel}</button>
            <button className={knop} onClick={opslaan}>Afbeelding opslaan</button>
            {onBeeld && <button className={knop} onClick={legVast}>{vast ? "Vastgelegd" : "Aanzicht vastleggen voor rapport"}</button>}
            {onSluit && <button className={aan} onClick={onSluit}>Terug naar kaart</button>}
          </div>
          <div className="absolute bottom-14 left-2 max-w-sm rounded bg-white/95 p-2.5 text-xs leading-snug text-slate-700 shadow">
            <div className="text-sm font-medium text-slate-900">{k.naam} · 3D-beeld op schaal</div>
            <div>Kavel {Math.round(Math.min(kavelL, areaKort(k)))} × {Math.round(kavelL)} m · gebouw {model.gebouw.b.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} × {model.gebouw.l.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} m, {model.gebouw.h.toLocaleString("nl-NL")} m hoog{STATION_TYPEN.find((t) => t.id === stationType)?.gebouw.kelder ? `, kelder ${STATION_TYPEN.find((t) => t.id === stationType)!.gebouw.kelder!.toLocaleString("nl-NL")} m onder maaiveld` : ""}{STATION_TYPEN.find((t) => t.id === stationType)?.hek === false ? " · geen hekwerk (TVS)" : " · hekwerk 2 m"}</div>
            <div className="text-slate-500">Omliggende bebouwing: {bron || "laden…"}. Stationsmaten volgens de voorlichting van Enexis; gevel en beplanting zijn indicatief. De schaalfiguur bij de poort is 1,80 m.</div>
          </div>
        </>
      )}
    </div>
  );
}

/** Lengte van de twee kavelzijden (m); de kavel kan gedraaid liggen. */
function zijden(k: Kandidaat) {
  const c = k.kavel.coordinates[0].map(naarRD);
  return [Math.hypot(c[1][0] - c[0][0], c[1][1] - c[0][1]), Math.hypot(c[2][0] - c[1][0], c[2][1] - c[1][1])];
}

function areaKort(k: Kandidaat) {
  return Math.min(...zijden(k));
}

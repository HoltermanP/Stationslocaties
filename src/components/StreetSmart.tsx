"use client";
// Panoramabeeld van Cyclomedia Street Smart bij een locatie. Voorbereid en niet getest (nog geen account); zie src/lib/streetsmart.ts.
import { useEffect, useRef, useState } from "react";
import { naarRD } from "@/lib/analyse/rd";
import { api } from "@/lib/api";
import type { StreetSmartConfig } from "@/lib/streetsmart";
import type { Kandidaat } from "@/lib/types";

type Viewer = { canvasToBase?: () => unknown; lookAtCoordinate?: (c: number[], srs?: string) => void };
type Api = {
  init: (o: Record<string, unknown>) => Promise<unknown>;
  open: (q: unknown, o: Record<string, unknown>) => Promise<Viewer[]>;
  destroy: (o: Record<string, unknown>) => unknown;
  ViewerType: Record<string, string>;
};

const script = (src: string) => new Promise<void>((klaar, mis) => {
  if (document.querySelector(`script[src="${src}"]`)) return klaar();
  const s = document.createElement("script");
  s.src = src; s.async = false;
  s.onload = () => klaar();
  s.onerror = () => mis(new Error(`Kan ${src} niet laden`));
  document.head.appendChild(s);
});

type Props = { kandidaat: Kandidaat; onBeeld?: (dataUrl: string) => void; onSluit: () => void };

export default function StreetSmart({ kandidaat: k, onBeeld, onSluit }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const [cfg, setCfg] = useState<StreetSmartConfig | null>(null);
  const [stand, setStand] = useState("Instellingen ophalen…");
  const [fout, setFout] = useState("");
  const [vast, setVast] = useState("");

  useEffect(() => { api<StreetSmartConfig>("/api/streetsmart/config").then(setCfg).catch((e) => setFout(e.message)); }, []);

  useEffect(() => {
    if (!cfg?.beschikbaar || !el.current) return;
    const doel = el.current;
    let weg = false, gestart = false;
    const SS = () => (window as unknown as { StreetSmartApi?: Api }).StreetSmartApi;
    (async () => {
      setStand("Street Smart laden…");
      // de API van Cyclomedia verwacht React en ReactDOM als globale scripts (los van de React van deze app)
      await script("https://unpkg.com/react@18.3.1/umd/react.production.min.js");
      await script("https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js");
      await script(`https://streetsmart.cyclomedia.com/api/${cfg.versie}/StreetSmartApi.js`);
      const ss = SS();
      if (!ss) throw new Error("StreetSmartApi is niet geladen");
      if (weg) return;
      setStand("Aanmelden bij Cyclomedia…");
      await ss.init({
        targetElement: doel,
        apiKey: cfg.apiKey,
        srs: "EPSG:28992",
        locale: "nl",
        ...(cfg.aanmelden === "oauth"
          ? { loginOauth: true, clientId: cfg.clientId, loginRedirectUri: `${location.origin}/streetsmart/login.html`, logoutRedirectUri: `${location.origin}/streetsmart/logout.html` }
          : { loginOauth: false, username: cfg.username, password: cfg.password }),
      });
      gestart = true;
      if (weg) return;
      setStand("Panorama openen…");
      const [x, y] = naarRD(k.punt);
      const viewers = await ss.open([x, y], {
        viewerType: [ss.ViewerType.PANORAMA],
        srs: "EPSG:28992",
        panoramaViewer: { closable: false, maximizable: false, replace: true, recordingsVisible: true, navbarVisible: true, timeTravelVisible: true },
      });
      viewer.current = viewers?.[0] ?? null;
      viewer.current?.lookAtCoordinate?.([x, y], "EPSG:28992"); // kijk vanaf de dichtstbijzijnde opname naar het midden van de kavel
      setStand("");
    })().catch((e) => { if (!weg) { setFout(e instanceof Error ? e.message : String(e)); setStand(""); } });
    return () => {
      weg = true;
      viewer.current = null;
      try { if (gestart) SS()?.destroy({ targetElement: doel, loginOauth: cfg.aanmelden === "oauth" }); } catch { /* de viewer was al weg */ }
    };
  }, [cfg, k.id, k.punt]);

  /** Legt het huidige beeld vast als Streetview-foto voor de template. */
  const legVast = async () => {
    try {
      let bron: unknown = await viewer.current?.canvasToBase?.();
      if (typeof bron !== "string" || !bron.startsWith("data:")) bron = el.current?.querySelector("canvas")?.toDataURL("image/jpeg", 0.85);
      if (typeof bron !== "string" || bron.length < 2000) throw new Error("de viewer gaf geen beeld terug");
      // verkleinen tot hooguit 1000 px breed, net als een geüploade foto
      const img = new Image();
      await new Promise((ok, mis) => { img.onload = ok; img.onerror = mis; img.src = bron as string; });
      const s = Math.min(1, 1000 / img.width), c = document.createElement("canvas");
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      onBeeld?.(c.toDataURL("image/jpeg", 0.8));
      setVast("Vastgelegd");
    } catch (e) {
      setVast(`Vastleggen lukt niet (${(e as Error).message}); maak een schermafbeelding en voeg die toe als Streetview-foto`);
    }
    setTimeout(() => setVast(""), 6000);
  };

  const knop = "rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 shadow-sm hover:bg-slate-50";
  return (
    <div className="relative h-full w-full bg-slate-100">
      <div ref={el} className="h-full w-full" />
      <div className="absolute right-2 top-2 flex gap-1">
        {cfg?.beschikbaar && onBeeld && !stand && !fout && <button className={knop} onClick={legVast}>{vast || "Beeld vastleggen voor rapport"}</button>}
        <button className="rounded border border-slate-900 bg-slate-900 px-2 py-1 text-xs text-white shadow-sm" onClick={onSluit}>Terug naar kaart</button>
      </div>
      {(stand || fout || (cfg && !cfg.beschikbaar)) && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="max-w-lg rounded bg-white p-4 text-sm text-slate-700 shadow">
            <div className="font-medium text-slate-900">Street Smart (Cyclomedia) · {k.naam}</div>
            {cfg && !cfg.beschikbaar ? (
              <>
                <p className="mt-2">De koppeling is voorbereid maar nog niet ingesteld. Zet in <code>.env.local</code> en herstart de app:</p>
                <ul className="mt-1 list-disc pl-5 text-xs">{cfg.ontbreekt.map((o) => <li key={o}>{o}</li>)}</ul>
                <p className="mt-2 text-xs text-slate-500">Een account en API-sleutel vraag je aan bij Cyclomedia. Tot die tijd blijft de link Streetview (Google) beschikbaar.</p>
              </>
            ) : fout ? (
              <p className="mt-2 text-red-700">Street Smart kon niet worden geopend: {fout}</p>
            ) : <p className="mt-2">{stand}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

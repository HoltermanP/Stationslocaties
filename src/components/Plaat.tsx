"use client";
// Kaartbeeld voor het rapport: vaste afbeelding in RD (EPSG:28992), opgebouwd uit PDOK-WMS, de analyse-overlay en een vectorlaag.
// Geen WebGL, zodat tientallen kaarten op één pagina en in de pdf scherp en betrouwbaar afdrukken.
import { naarRD } from "@/lib/analyse/rd";
import type { Analyse, Kandidaat, LngLat, Polygoon } from "@/lib/types";

export type Bbox = [number, number, number, number];

const WMS: Record<string, { url: string; laag: string; formaat: string }> = {
  topo: { url: "https://service.pdok.nl/brt/top10nl/wms/v1_0", laag: "top10nl", formaat: "image/png" },
  lucht: { url: "https://service.pdok.nl/hwh/luchtfotorgb/wms/v1_0", laag: "Actueel_orthoHR", formaat: "image/jpeg" },
  plu: { url: "https://service.pdok.nl/kadaster/plu/wms/v1_0", laag: "enkelbestemming", formaat: "image/png" },
  kadaster: { url: "https://service.pdok.nl/kadaster/kadastralekaart/wms/v5_0", laag: "Kadastralekaart", formaat: "image/png" },
  natura: { url: "https://service.pdok.nl/rvo/natura2000/wms/v1_0", laag: "natura2000", formaat: "image/png" },
};

export const rondom = (punt: LngLat, straal: number): Bbox => { const [x, y] = naarRD(punt); return [x - straal, y - straal, x + straal, y + straal]; };
export const omvat = (p: Polygoon, marge = 0.08): Bbox => {
  const r = p.coordinates[0].map(naarRD), xs = r.map((c) => c[0]), ys = r.map((c) => c[1]);
  const m = marge * Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  return [Math.min(...xs) - m, Math.min(...ys) - m, Math.max(...xs) + m, Math.max(...ys) + m];
};

type Props = {
  w: number;
  h: number;
  bbox: Bbox;
  basis?: "topo" | "lucht" | "geen";
  /** topografie in grijs en licht, als ondergrond voor een themakaart */
  rustig?: boolean;
  lagen?: { id: "plu" | "kadaster" | "natura"; dekking?: number }[];
  overlay?: { src: string; hoeken: Analyse["hoeken"] } | null;
  zoekgebied?: Polygoon | null;
  kandidaten?: Kandidaat[];
  labels?: Record<string, string>;
  voorkeurId?: string | null;
  aansluitpunt?: LngLat | null;
  traces?: boolean;
};

export default function Plaat({ w, h, bbox, basis = "topo", rustig, lagen = [], overlay, zoekgebied, kandidaten = [], labels = {}, voorkeurId, aansluitpunt, traces }: Props) {
  // bbox passend maken op de verhouding van het kader
  let [x0, y0, x1, y1] = bbox;
  const bw = x1 - x0, bh = y1 - y0;
  if (bw / bh < w / h) { const e = (bh * w) / h - bw; x0 -= e / 2; x1 += e / 2; }
  else { const e = (bw * h) / w - bh; y0 -= e / 2; y1 += e / 2; }
  const mpp = (x1 - x0) / w; // meter per pixel
  const px = (p: number[]) => [(p[0] - x0) / mpp, (y1 - p[1]) / mpp];
  const pad = (ring: number[][]) => ring.map((c) => px(naarRD(c)).map((n) => n.toFixed(1)).join(",")).join(" ");
  const bron = (id: string) => { const s = WMS[id]; return `${s.url}?service=WMS&version=1.3.0&request=GetMap&layers=${s.laag}&styles=&crs=EPSG:28992&bbox=${[x0, y0, x1, y1].map((n) => n.toFixed(1)).join(",")}&width=${w * 2}&height=${h * 2}&format=${s.formaat}&transparent=true`; };
  const vol = { position: "absolute" as const, inset: 0, width: "100%", height: "100%" };

  let ov: React.CSSProperties | null = null;
  if (overlay) {
    const lb = px(naarRD(overlay.hoeken[3])), rb = px(naarRD(overlay.hoeken[1]));
    ov = { position: "absolute", left: lb[0], top: rb[1], width: rb[0] - lb[0], height: lb[1] - rb[1], imageRendering: "pixelated", opacity: 0.85 };
  }
  // schaalstok: ronde lengte van ongeveer een vijfde van de kaartbreedte
  const doel = (mpp * w) / 5, macht = 10 ** Math.floor(Math.log10(doel));
  const stok = [5, 2, 1].map((f) => f * macht).find((s) => s <= doel) ?? macht;
  const klein = kandidaten.length === 1 || mpp < 0.6;

  return (
    <div style={{ position: "relative", width: w, height: h, overflow: "hidden", background: "#f4f4f4" }}>
      {/* eslint-disable @next/next/no-img-element */}
      {basis !== "geen" && <img alt="" src={bron(basis)} style={{ ...vol, ...(rustig ? { filter: "grayscale(1) contrast(0.75) brightness(1.15)" } : {}) }} />}
      {lagen.map((l) => <img key={l.id} alt="" src={bron(l.id)} style={{ ...vol, opacity: l.dekking ?? 1 }} />)}
      {overlay && ov && <img alt="" src={overlay.src} style={ov} />}
      <svg width={w} height={h} style={{ position: "absolute", inset: 0 }} fontFamily="Arial, sans-serif">
        {zoekgebied && <polygon points={pad(zoekgebied.coordinates[0])} fill="none" stroke="#E5007D" strokeWidth={2.5} strokeDasharray="9 5" />}
        {traces && kandidaten.map((k) => k.trace && <polyline key={k.id} points={pad(k.trace.lijn)} fill="none" stroke="#7c3aed" strokeWidth={2.5} strokeDasharray="2 4" strokeLinecap="round" />)}
        {/* de voorkeurslocatie als laatste, zodat hij boven de andere locaties ligt */}
        {[...kandidaten].sort((a, b) => Number(a.id === voorkeurId) - Number(b.id === voorkeurId)).map((k) => {
          const vk = k.id === voorkeurId, kleur = vk ? "#00A651" : k.inUitgesloten.length ? "#b91c1c" : "#E5007D";
          const [cx, cy] = px(naarRD(k.punt));
          const label = labels[k.id];
          const zichtbaar = cx > -20 && cx < w + 20 && cy > -30 && cy < h + 20;
          const tekst = vk ? `★ ${label ?? ""} Voorkeur`.replace("  ", " ") : label;
          const breed = vk ? 14 + tekst!.length * 6.2 : 22;
          return (
            <g key={k.id}>
              {vk && <polygon points={pad(k.kavel.coordinates[0])} fill="none" stroke="#fff" strokeWidth={klein ? 6.5 : 5} strokeLinejoin="round" />}
              <polygon points={pad(k.kavel.coordinates[0])} fill={kleur} fillOpacity={klein ? 0.18 : vk ? 0.65 : 0.5} stroke={kleur} strokeWidth={vk ? (klein ? 4 : 3) : klein ? 2.5 : 1.5} />
              {zichtbaar && tekst && (!klein || kandidaten.length > 1) && (
                <>
                  <line x1={cx} y1={cy - 5} x2={cx} y2={cy} stroke={kleur} strokeWidth={2} />
                  <rect x={cx - breed / 2} y={cy - (vk ? 30 : 27)} width={breed} height={vk ? 22 : 22} rx={11} fill={kleur} stroke="#fff" strokeWidth={vk ? 2.5 : 2} />
                  <text x={cx} y={cy - (vk ? 15 : 12)} textAnchor="middle" fontSize={vk ? 12.5 : 12} fontWeight={700} fill="#fff">{tekst}</text>
                </>
              )}
            </g>
          );
        })}
        {aansluitpunt && (() => { const [cx, cy] = px(naarRD(aansluitpunt)); return <g><circle cx={cx} cy={cy} r={9} fill="#facc15" stroke="#fff" strokeWidth={2} /><text x={cx} y={cy + 4} textAnchor="middle" fontSize={11}>⚡</text></g>; })()}
        <g transform={`translate(10 ${h - 12})`}>
          <rect x={-4} y={-15} width={stok / mpp + 8} height={21} fill="#fff" fillOpacity={0.8} />
          <path d={`M0 -4 V0 H${stok / mpp} V-4`} fill="none" stroke="#333" strokeWidth={1.5} />
          <text x={stok / mpp / 2} y={-5} textAnchor="middle" fontSize={9} fill="#333">{stok >= 1000 ? `${stok / 1000} km` : `${stok} m`}</text>
        </g>
        <text x={w - 5} y={h - 5} textAnchor="end" fontSize={7.5} fill="#333" stroke="#fff" strokeWidth={2.5} paintOrder="stroke">© Kadaster / PDOK</text>
      </svg>
    </div>
  );
}

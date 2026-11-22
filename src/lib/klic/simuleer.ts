import { rijwegen, type BBox } from "../analyse/bronnen";
import { naarRD } from "../analyse/rd";
import type { EigenLaag, KlicInfo, Lqs } from "../types";
import { THEMA } from "./lees";

// GESIMULEERDE KLIC-levering voor demo's: geen gegevens van het Kadaster of van netbeheerders.
// De leidingen volgen de echte rijwegen (BRT) op een vaste afstand uit de wegas, zoals kabels en leidingen in de praktijk
// in berm en trottoir liggen; daarnaast kruist één fictieve hogedrukgasleiding het zoekgebied. Ligging, aantallen en
// beheerders zijn verzonnen. De lagen krijgen dezelfde vorm als een ingelezen levering (verwerk.ts), zodat analyse,
// kaart en rapport er net zo mee werken.

/** Afstand uit de wegas (m, + is rechts van de rijrichting van de hartlijn), minimale weglengte per thema en kenmerken van de leiding. */
const LIGGING: { thema: string; afstand: number; vanaf: number; beheerder: string; diepte: [number, number]; kenmerk: string[]; materiaal: string[]; dwars: number }[] = [
  { thema: "datatransport", afstand: 3.8, vanaf: 0, beheerder: "Glasvezelnet (telecom)", diepte: [0.5, 0.7], kenmerk: ["Glasvezel 48 vezels", "Glasvezel 96 vezels", "Koper telefonie"], materiaal: ["HDPE-buis"], dwars: 45 },
  { thema: "laagspanning", afstand: 4.6, vanaf: 0, beheerder: "Enexis (elektriciteit)", diepte: [0.6, 0.8], kenmerk: ["0,4 kV, 4x150 Al", "0,4 kV, 4x240 Al"], materiaal: ["PILC", "XLPE"], dwars: 30 },
  { thema: "middenspanning", afstand: 5.5, vanaf: 150, beheerder: "Enexis (elektriciteit)", diepte: [0.8, 1.1], kenmerk: ["10 kV, 3x1x150 Al", "10 kV, 3x1x240 Al"], materiaal: ["XLPE"], dwars: 0 },
  { thema: "rioolVrijverval", afstand: 0, vanaf: 60, beheerder: "Gemeente (riolering)", diepte: [1.4, 2.6], kenmerk: ["Ø 300", "Ø 400", "Ø 600"], materiaal: ["Beton", "PVC"], dwars: 0 },
  { thema: "gasLageDruk", afstand: -4.4, vanaf: 0, beheerder: "Enexis (gas)", diepte: [0.6, 0.8], kenmerk: ["Ø 110, 200 mbar", "Ø 160, 200 mbar"], materiaal: ["PE", "PVC"], dwars: 35 },
  { thema: "water", afstand: -5.4, vanaf: 60, beheerder: "Vitens (drinkwater)", diepte: [1.0, 1.3], kenmerk: ["Ø 110", "Ø 160", "Ø 200"], materiaal: ["PVC", "PE", "Gietijzer"], dwars: 40 },
];

const lengte = (lijn: number[][]) => lijn.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - lijn[i][0], p[1] - lijn[i][1]), 0);

/** Vaste reeks per LQS, zodat een herberekende demo dezelfde leidingen krijgt. */
function reeks(zaad: string) {
  let h = 2166136261;
  for (const c of zaad) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) + 0x6d2b79f5), ((h ^ (h >>> 13)) >>> 0) / 4294967296);
}

/** Lijn evenwijdig aan de gegeven lijn, op afstand d (m) naar rechts. */
function evenwijdig(lijn: number[][], d: number) {
  if (!d) return lijn;
  return lijn.map((p, i) => {
    const a = lijn[Math.max(0, i - 1)], b = lijn[Math.min(lijn.length - 1, i + 1)], len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [p[0] + ((b[1] - a[1]) / len) * d, p[1] - ((b[0] - a[0]) / len) * d];
  });
}

/** Punt op afstand s langs de lijn, met de richting (eenheidsvector) op die plek. */
function opAfstand(lijn: number[][], s: number) {
  for (let i = 1; i < lijn.length; i++) {
    const l = Math.hypot(lijn[i][0] - lijn[i - 1][0], lijn[i][1] - lijn[i - 1][1]);
    if (s <= l || i === lijn.length - 1) {
      const t = l ? Math.min(1, s / l) : 0, dx = (lijn[i][0] - lijn[i - 1][0]) / (l || 1), dy = (lijn[i][1] - lijn[i - 1][1]) / (l || 1);
      return { p: [lijn[i - 1][0] + (lijn[i][0] - lijn[i - 1][0]) * t, lijn[i - 1][1] + (lijn[i][1] - lijn[i - 1][1]) * t], dx, dy };
    }
    s -= l;
  }
  return { p: lijn[0], dx: 1, dy: 0 };
}

/** Deel van een lijn tussen twee afstanden. */
function stuk(lijn: number[][], van: number, tot: number) {
  const uit = [opAfstand(lijn, van).p];
  let af = 0;
  for (let i = 1; i < lijn.length; i++) {
    af += Math.hypot(lijn[i][0] - lijn[i - 1][0], lijn[i][1] - lijn[i - 1][1]);
    if (af > van && af < tot) uit.push(lijn[i]);
  }
  uit.push(opAfstand(lijn, tot).p);
  return uit;
}

/** Regionale kenmerken van de simulatie: welke beheerders er zijn en welke zware of bijzondere leidingen het gebied kruisen. */
export type KlicOpties = {
  waterbedrijf?: string;
  /** stadsverwarming langs de wegen */
  warmte?: boolean;
  /** ondergrondse 150 kV-kabel van de landelijke netbeheerder */
  hoogspanning?: boolean;
  /** buisleiding met gevaarlijke inhoud (bijv. ethyleen) */
  buisleiding?: boolean;
  /** persleiding van een rioolgemaal */
  rioolDruk?: boolean;
  /** leiding zonder bekende eigenaar */
  wees?: boolean;
  /** hoogste druk van de gastransportleiding */
  gasTransport?: string;
  waterschap?: string;
};

export async function simuleerKlic(l: Lqs, opties: KlicOpties = {}): Promise<{ eigenLagen: EigenLaag[]; klic: KlicInfo } | null> {
  if (!l.zoekgebied) return null;
  const rnd = reeks(l.code ?? l.id), tussen = ([a, b]: [number, number]) => Math.round((a + rnd() * (b - a)) * 100) / 100, kies = <T,>(x: T[]) => x[Math.floor(rnd() * x.length)];
  const p = l.zoekgebied.coordinates[0].map(naarRD), xs = p.map((c) => c[0]), ys = p.map((c) => c[1]);
  const vak: BBox = [Math.min(...xs) - 100, Math.min(...ys) - 100, Math.max(...xs) + 100, Math.max(...ys) + 100];
  const wegen = (await rijwegen(vak)).filter((w) => w.some(([x, y]) => x >= vak[0] && x <= vak[2] && y >= vak[1] && y <= vak[3]));

  type Lijn = { coordinates: number[][]; props: Record<string, unknown> };
  const themas: Record<string, Lijn[]> = {};
  const voeg = (thema: string, coordinates: number[][], props: Record<string, unknown>) => (themas[thema] ??= []).push({ coordinates, props: { thema, gesimuleerd: true, ...props } });

  const water = opties.waterbedrijf ?? "Vitens (drinkwater)";
  const liggingen = LIGGING.map((t) => (t.thema === "water" ? { ...t, beheerder: water } : t));
  if (opties.warmte) liggingen.push({ thema: "warmte", afstand: -2.8, vanaf: 180, beheerder: "Warmtebedrijf (stadsverwarming)", diepte: [1.0, 1.4], kenmerk: ["DN 150 voorgeïsoleerd, 120/70 °C", "DN 200 voorgeïsoleerd, 120/70 °C"], materiaal: ["Staal (voorgeïsoleerd)"], dwars: 0 });
  if (opties.rioolDruk) liggingen.push({ thema: "rioolOnderOverOfOnderdruk", afstand: 6.6, vanaf: 220, beheerder: "Gemeente (riolering, persleiding)", diepte: [1.2, 1.8], kenmerk: ["Ø 160 persleiding", "Ø 225 persleiding"], materiaal: ["PE", "PVC"], dwars: 0 });

  for (const weg of wegen) {
    const len = lengte(weg);
    for (const t of liggingen) {
      if (len < t.vanaf) continue;
      const hoofd = evenwijdig(weg, t.afstand);
      const eigen = { beheerder: t.beheerder, materiaal: kies(t.materiaal), kenmerk: kies(t.kenmerk), aanlegjaar: 1965 + Math.floor(rnd() * 58) };
      // hoofdleiding in stukken van 40-120 m, met een kleine wisseling van diepte en soms van materiaal
      for (let s = 0; s < len; ) {
        const e = Math.min(len, s + 40 + rnd() * 80);
        if (e - s > 3) voeg(t.thema, stuk(hoofd, s, e), { ...eigen, diepteM: tussen(t.diepte), aard: "hoofdleiding" });
        s = e;
      }
      // aansluitleidingen: dwars over de berm naar de percelen aan weerszijden
      if (t.dwars) {
        for (let s = 12 + rnd() * t.dwars; s < len - 8; s += t.dwars * (0.7 + rnd() * 0.8)) {
          const { p: [x, y], dx, dy } = opAfstand(weg, s);
          const zijde = t.afstand >= 0 ? 1 : -1, nx = dy * zijde, ny = -dx * zijde;
          const uit = Math.abs(t.afstand) + 6 + rnd() * 10;
          voeg(t.thema, [[x + nx * Math.abs(t.afstand), y + ny * Math.abs(t.afstand)], [x + nx * uit, y + ny * uit]], { ...eigen, kenmerk: t.thema === "water" ? "Ø 32 aansluiting" : t.thema === "gasLageDruk" ? "Ø 32 aansluiting" : t.thema === "datatransport" ? "Aansluitkabel" : "0,4 kV huisaansluiting", diepteM: tussen([Math.max(0.5, t.diepte[0] - 0.1), t.diepte[1]]), aard: "aansluiting" });
        }
      }
    }
  }
  // transportleiding: recht door het zoekgebied, van een kwart van de westrand naar driekwart van de oostrand
  const [x0, y0, x1, y1] = vak;
  voeg("gasHogeDruk", [[x0, y0 + 0.3 * (y1 - y0)], [x0 + 0.45 * (x1 - x0), y0 + 0.42 * (y1 - y0)], [x1, y0 + 0.78 * (y1 - y0)]], {
    beheerder: "Gasunie Transport Services", kenmerk: `Ø 508, ${opties.gasTransport ?? "40 bar"}`, materiaal: "Staal", diepteM: 1.2, aanlegjaar: 1974, aard: "transportleiding",
  });
  const b = (f: number, g: number) => [x0 + f * (x1 - x0), y0 + g * (y1 - y0)];
  if (opties.hoogspanning) {
    voeg("hoogspanning", [b(0.22, 1), b(0.3, 0.6), b(0.36, 0.25), b(0.34, 0)], { beheerder: "TenneT (hoogspanning)", kenmerk: "150 kV, 3x1x1200 Cu-kabel", materiaal: "XLPE", diepteM: 1.6, aanlegjaar: 2009, aard: "transportkabel" });
  }
  if (opties.buisleiding) {
    voeg("buisleidingGevaarlijkeInhoud", [b(0, 0.12), b(0.5, 0.2), b(1, 0.1)], { beheerder: "Buisleidingbeheerder (gesimuleerd)", kenmerk: "Ø 324, ethyleen, 100 bar", materiaal: "Staal", diepteM: 1.5, aanlegjaar: 1983, aard: "transportleiding" });
  }
  if (opties.wees) {
    voeg("wees", [b(0.6, 0.55), b(0.72, 0.52), b(0.8, 0.58)], { beheerder: "Onbekend (weesleiding)", kenmerk: "Buis, inhoud onbekend", materiaal: "Onbekend", diepteM: 0.9, aanlegjaar: 1958, aard: "weesleiding" });
  }

  const afger = (c: number[][]) => c.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
  const lagen: EigenLaag[] = Object.entries(themas).map(([thema, lijnen]) => {
    const t = THEMA[thema] ?? { naam: thema };
    return {
      id: `klic-${thema}`,
      naam: `KLIC ${t.naam} (gesimuleerd)`,
      soort: t.zwaar ? "uitsluiten" : "aandacht",
      buffer: t.zwaar ? 5 : 1,
      vertrouwelijk: false,
      functie: "leidingen",
      geojson: { type: "FeatureCollection", features: lijnen.map((x) => ({ type: "Feature", properties: x.props, geometry: { type: "LineString", coordinates: afger(x.coordinates) } })) },
    };
  });
  const klic: KlicInfo = {
    meldnummer: `SIM-${String(new Date().getFullYear()).slice(2)}O${String(Math.floor(rnd() * 1e7)).padStart(7, "0")}`,
    ingelezenOp: new Date().toISOString(),
    bron: "simulatie",
    netbeheerders: ["Enexis (elektriciteit en gas)", "Gasunie Transport Services (gas hoge druk)", water, `Gemeente ${l.gemeente || ""} (riolering)`.replace("  ", " "), opties.waterschap ?? "Waterschap (watergangen en waterkeringen)", "Glasvezelnet (telecom)", "Koper- en kabelnet (telecom)", ...(opties.warmte ? ["Warmtebedrijf (stadsverwarming)"] : []), ...(opties.hoogspanning ? ["TenneT (hoogspanning)"] : []), ...(opties.buisleiding ? ["Buisleidingbeheerder (gevaarlijke inhoud)"] : [])].map((naam, i) => ({ code: `SIM${i + 1}`, naam: `${naam} – gesimuleerd`, geleverd: true })),
    themas: Object.entries(themas).map(([thema, lijnen]) => ({ thema, naam: (THEMA[thema] ?? { naam: thema }).naam, leidingen: lijnen.length })),
  };
  return { eigenLagen: [...l.eigenLagen.filter((e) => !e.id.startsWith("klic-")), ...lagen], klic };
}

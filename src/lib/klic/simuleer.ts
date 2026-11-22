import { rijwegen, type BBox } from "../analyse/bronnen";
import { naarRD } from "../analyse/rd";
import type { EigenLaag, KlicInfo, Lqs } from "../types";
import { THEMA } from "./lees";

// GESIMULEERDE KLIC-levering voor demo's: geen gegevens van het Kadaster of van netbeheerders.
// De leidingen volgen de echte rijwegen (BRT) op een vaste afstand uit de wegas, zoals kabels en leidingen in de praktijk
// in berm en trottoir liggen; daarnaast kruist één fictieve hogedrukgasleiding het zoekgebied. Ligging, aantallen en
// beheerders zijn verzonnen. De lagen krijgen dezelfde vorm als een ingelezen levering (verwerk.ts), zodat analyse,
// kaart en rapport er net zo mee werken.

/** Afstand uit de wegas (m, + is rechts van de rijrichting van de hartlijn) en de minimale weglengte per thema. */
const LIGGING: { thema: string; afstand: number; vanaf: number }[] = [
  { thema: "datatransport", afstand: 3.8, vanaf: 0 },
  { thema: "laagspanning", afstand: 4.6, vanaf: 0 },
  { thema: "middenspanning", afstand: 5.5, vanaf: 150 },
  { thema: "rioolVrijverval", afstand: 0, vanaf: 60 },
  { thema: "gasLageDruk", afstand: -4.4, vanaf: 0 },
  { thema: "water", afstand: -5.4, vanaf: 60 },
];

const lengte = (lijn: number[][]) => lijn.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - lijn[i][0], p[1] - lijn[i][1]), 0);

/** Lijn evenwijdig aan de gegeven lijn, op afstand d (m) naar rechts. */
function evenwijdig(lijn: number[][], d: number) {
  if (!d) return lijn;
  return lijn.map((p, i) => {
    const a = lijn[Math.max(0, i - 1)], b = lijn[Math.min(lijn.length - 1, i + 1)], len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [p[0] + ((b[1] - a[1]) / len) * d, p[1] - ((b[0] - a[0]) / len) * d];
  });
}

export async function simuleerKlic(l: Lqs): Promise<{ eigenLagen: EigenLaag[]; klic: KlicInfo } | null> {
  if (!l.zoekgebied) return null;
  const p = l.zoekgebied.coordinates[0].map(naarRD), xs = p.map((c) => c[0]), ys = p.map((c) => c[1]);
  const vak: BBox = [Math.min(...xs) - 100, Math.min(...ys) - 100, Math.max(...xs) + 100, Math.max(...ys) + 100];
  const wegen = (await rijwegen(vak)).filter((w) => w.some(([x, y]) => x >= vak[0] && x <= vak[2] && y >= vak[1] && y <= vak[3]));

  const themas: Record<string, number[][][]> = {};
  for (const weg of wegen) {
    const len = lengte(weg);
    for (const { thema, afstand, vanaf } of LIGGING) if (len >= vanaf) (themas[thema] ??= []).push(evenwijdig(weg, afstand));
  }
  // transportleiding: recht door het zoekgebied, van een kwart van de westrand naar driekwart van de oostrand
  const [x0, y0, x1, y1] = vak;
  themas.gasHogeDruk = [[[x0, y0 + 0.3 * (y1 - y0)], [x0 + 0.45 * (x1 - x0), y0 + 0.42 * (y1 - y0)], [x1, y0 + 0.78 * (y1 - y0)]]];

  const afgerond = (lijn: number[][]) => lijn.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
  const lagen: EigenLaag[] = Object.entries(themas).map(([thema, lijnen]) => {
    const t = THEMA[thema] ?? { naam: thema };
    return {
      id: `klic-${thema}`,
      naam: `KLIC ${t.naam} (gesimuleerd)`,
      soort: t.zwaar ? "uitsluiten" : "aandacht",
      buffer: t.zwaar ? 5 : 1,
      vertrouwelijk: false,
      functie: "leidingen",
      geojson: { type: "Feature", properties: { thema, gesimuleerd: true }, geometry: { type: "MultiLineString", coordinates: lijnen.map(afgerond) } },
    };
  });
  const klic: KlicInfo = {
    meldnummer: `SIMULATIE-${l.code}`,
    ingelezenOp: new Date().toISOString(),
    bron: "simulatie",
    netbeheerders: ["Elektriciteit en gas (regionaal)", "Gas hoge druk (transport)", "Drinkwater", "Riolering (gemeente)", "Datatransport"].map((naam, i) => ({ code: `SIM${i + 1}`, naam: `${naam} – gesimuleerd`, geleverd: true })),
    themas: Object.entries(themas).map(([thema, lijnen]) => ({ thema, naam: (THEMA[thema] ?? { naam: thema }).naam, leidingen: lijnen.length })),
  };
  return { eigenLagen: [...l.eigenLagen.filter((e) => !e.id.startsWith("klic-")), ...lagen], klic };
}

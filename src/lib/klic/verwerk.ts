import { naarRD } from "../analyse/rd";
import { wijzig } from "../repo";
import type { EigenLaag, KlicInfo, Lqs } from "../types";
import { THEMA, leesLevering } from "./lees";

/** Leest een levering-zip in en zet de leidingen per thema als kaartlaag bij de LQS. Eerdere KLIC-lagen worden vervangen. */
export async function verwerkLevering(l: Lqs, zip: Uint8Array, bron: "upload" | "kadaster") {
  const lev = leesLevering(zip);
  // alleen wat in en vlak rond het zoekgebied ligt telt mee
  let vak: number[] | null = null;
  if (l.zoekgebied) {
    const p = l.zoekgebied.coordinates[0].map(naarRD), xs = p.map((c) => c[0]), ys = p.map((c) => c[1]);
    vak = [Math.min(...xs) - 200, Math.min(...ys) - 200, Math.max(...xs) + 200, Math.max(...ys) + 200];
  }
  const inVak = (lijn: number[][]) => !vak || lijn.some(([x, y]) => x >= vak![0] && x <= vak![2] && y >= vak![1] && y <= vak![3]);
  const afgerond = (lijn: number[][]) => lijn.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);

  const lagen: EigenLaag[] = [];
  const themas: NonNullable<KlicInfo["themas"]> = [];
  for (const [thema, lijnen] of Object.entries(lev.themas)) {
    const binnen = lijnen.filter(inVak).map(afgerond);
    if (!binnen.length) continue;
    const t = THEMA[thema] ?? { naam: thema };
    themas.push({ thema, naam: t.naam, leidingen: binnen.length });
    lagen.push({
      id: `klic-${thema}`,
      naam: `KLIC ${t.naam}`,
      // Transportleidingen en hoogspanning sluiten een locatie uit (strook van 5 m als eerste aanname); de rest is een aandachtspunt.
      soort: t.zwaar ? "uitsluiten" : "aandacht",
      buffer: t.zwaar ? 5 : 1,
      vertrouwelijk: false,
      functie: "leidingen",
      geojson: { type: "Feature", properties: { thema }, geometry: { type: "MultiLineString", coordinates: binnen } },
    });
  }
  const totaal = Object.values(lev.themas).reduce((s, x) => s + x.length, 0);
  if (totaal && !lagen.length) throw new Error(`De levering ${lev.meldnummer} bevat ${totaal} leidingen, maar geen daarvan ligt in of bij het zoekgebied van deze LQS`);

  const klic: KlicInfo = { ...l.klic, meldnummer: lev.meldnummer, ingelezenOp: new Date().toISOString(), bron, netbeheerders: lev.netbeheerders, themas };
  const eigenLagen = [...l.eigenLagen.filter((e) => !e.id.startsWith("klic-")), ...lagen];
  return wijzig(l.id, { eigenLagen, klic });
}

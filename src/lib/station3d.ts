import { naarRD, naarWGS } from "./analyse/rd";
import { GEVELS, STATION_TYPEN } from "./config";
import type { Kandidaat, LngLat } from "./types";

type Blok = { type: "Feature"; properties: { b: number; h: number; kleur: string; laag: "vast" | "hek" | "groen"; /** onderdeel (sleutel uit KLEUR, anders "gevel"), voor de materiaalkeuze in de realistische weergave */ soort: string }; geometry: { type: "Polygon"; coordinates: number[][][] } };

/** Vrije kabelruimte aan de voorzijde (programma van eisen Enexis, zie REVIEW_PUNTEN): het gebouw staat zo dicht mogelijk bij de wegzijde. */
const KABELRUIMTE = 5;

const KLEUR = {
  terrein: "#a9a59c", pad: "#8b8881", inrit: "#6e6e6c", plint: "#4a4e52", gevel: "#8a5f4a", dak: "#2e3236", deur: "#1f4a3a", rooster: "#c6c9cd",
  hek: "#27352e", paal: "#232b27", trafo: "#5f6d66", beton: "#bcb9b0", haag: "#3f6a39", stam: "#5a4535", kroon1: "#4b7a3e", kroon2: "#5c8c49",
  jas: "#1d4ed8", huid: "#d9a987",
};

/**
 * Lokaal assenstelsel van de kavel: u langs de voorzijde, v de diepte in. De kavel mag gedraaid liggen.
 * Voorzijde is de rand waar het kabeltracé de kavel verlaat; zonder tracé de eerste rand (de wegzijde uit de analyse).
 */
export function kavelKader(k: Kandidaat) {
  const p = k.kavel.coordinates[0].slice(0, 4).map(naarRD);
  const midden = [(p[0][0] + p[2][0]) / 2, (p[0][1] + p[2][1]) / 2];
  const binnen = ([x, y]: number[]) => p.every((a, i) => { const b = p[(i + 1) % 4]; return ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])) * ((b[0] - a[0]) * (midden[1] - a[1]) - (b[1] - a[1]) * (midden[0] - a[0])) >= 0; });
  const buiten = (k.trace?.lijn ?? []).map(naarRD).find((q) => !binnen(q));
  let e = 0;
  // de analyse legt de voorzijde (eerste rand) aan de wegzijde; alleen zonder weg beslist het kabeltracé
  const naarWeg = /weg|bebouwing|voorzijde/.test(k.ligging ?? "") && !/niet gedraaid/.test(k.ligging ?? "");
  if (buiten && !naarWeg) {
    // de rand waarvan de buitenwaartse richting het best naar het tracé wijst, genormaliseerd op de kavelmaat
    let beste = -Infinity;
    for (let i = 0; i < 4; i++) {
      const a = p[i], b = p[(i + 1) % 4], mx = (a[0] + b[0]) / 2 - midden[0], my = (a[1] + b[1]) / 2 - midden[1], len = Math.hypot(mx, my) || 1;
      const waarde = ((buiten[0] - midden[0]) * mx + (buiten[1] - midden[1]) * my) / (len * len);
      if (waarde > beste) { beste = waarde; e = i; }
    }
  }
  const a = p[e], b = p[(e + 1) % 4], c = p[(e + 2) % 4];
  const U = Math.hypot(b[0] - a[0], b[1] - a[1]), V = Math.hypot(c[0] - b[0], c[1] - b[1]);
  const tu = [(b[0] - a[0]) / U, (b[1] - a[1]) / U], tv = [(c[0] - b[0]) / V, (c[1] - b[1]) / V];
  return {
    U, V, midden,
    rd: (u: number, v: number): number[] => [a[0] + u * tu[0] + v * tv[0], a[1] + u * tu[1] + v * tv[1]],
    /** Plaats langs de voorzijde (u) waar het kabeltracé de kavel verlaat; zonder tracé het midden */
    uitgang: buiten ? Math.min(U, Math.max(0, (buiten[0] - a[0]) * tu[0] + (buiten[1] - a[1]) * tu[1])) : U / 2,
    /** Kijkrichting (bearing) waarbij de voorzijde van het station naar de camera is gekeerd */
    voor: ((Math.atan2(tv[0], tv[1]) * 180) / Math.PI + 360) % 360,
  };
}

/** Maten van de kavel zoals hij nu ligt: [langs de voorzijde, diepte]. */
export const kavelMaat = (k: Kandidaat): [number, number] => { const { U, V } = kavelKader(k); return [U, V]; };

/** Wijkt de kavel van de locatie meer dan 0,3 m af van de gevraagde kavelmaat? */
export function kavelWijktAf(k: Kandidaat, kavelB: number, kavelL: number) {
  const [U, V] = kavelMaat(k), L = Math.max(kavelB, kavelL), B = Math.min(kavelB, kavelL);
  return Math.abs(Math.max(U, V) - L) > 0.3 || Math.abs(Math.min(U, V) - B) > 0.3;
}

/**
 * Brengt de kavel van een locatie terug tot de gevraagde maat, bijvoorbeeld na de keuze voor een kleiner stationstype.
 * De nieuwe kavel ligt binnen de oude (die al vrij van uitsluitingen was), tegen de voorzijde aan en zo dicht mogelijk bij
 * het punt waar het kabeltracé de kavel verlaat: geen ongebruikt terrein tussen weg en station en het kortste tracé.
 * De lange zijde (met de deuren en de kabelruimte ervoor) ligt bij voorkeur langs de voorzijde.
 * Geeft null als de kavel al klopt of de gevraagde maat niet binnen de oude kavel past (dan is een nieuwe analyse nodig).
 */
export function krimpKavel(k: Kandidaat, kavelB: number, kavelL: number): Kandidaat | null {
  if (!kavelWijktAf(k, kavelB, kavelL)) return null;
  const { U, V, rd, uitgang } = kavelKader(k);
  const L = Math.max(kavelB, kavelL), B = Math.min(kavelB, kavelL);
  const past = (w: number, d: number) => w <= U + 0.3 && d <= V + 0.3;
  const [w, d] = past(L, B) ? [L, B] : past(B, L) ? [B, L] : [0, 0];
  if (!w) return null;
  const u0 = Math.max(0, Math.min(U - w, uitgang - w / 2)), u1 = Math.min(U, u0 + w), v1 = Math.min(V, d);
  const hoeken = [rd(u0, 0), rd(u1, 0), rd(u1, v1), rd(u0, v1)];
  const midden = rd((u0 + u1) / 2, v1 / 2);
  const { beeld: _vervalt, ...rest } = k; // het vastgelegde 3D-aanzicht hoort bij de oude kavel
  void _vervalt;
  return {
    ...rest,
    kavel: { type: "Polygon", coordinates: [[...hoeken, hoeken[0]].map(naarWGS)] } as Kandidaat["kavel"],
    punt: naarWGS(midden) as LngLat,
    rd: [Math.round(midden[0]), Math.round(midden[1])],
    ligging: `${w >= d ? "lange" : "korte"} zijde aan de voorzijde; kavel verkleind tot ${L.toLocaleString("nl-NL")} × ${B.toLocaleString("nl-NL")} m binnen de eerder ingepaste kavel`,
  };
}

/**
 * Bouwt het station op uit blokken (fill-extrusion): terrein, gebouw met plint, dakrand, deuren en roosters,
 * hekwerk met poort, inrit, optioneel transformatoren en beplanting. Maten komen uit STATION_TYPEN en de kavel.
 * Lokale assen: u langs de voorzijde, v de diepte in (0 = voorzijde met poort).
 */
export function stationModel(k: Kandidaat, typeId: string, beplanting: boolean, gevel = "groen"): { blokken: Blok[]; voor: number; midden: LngLat; gebouw: { b: number; l: number; h: number } } {
  const { U, V, rd, voor, midden } = kavelKader(k);
  const blokken: Blok[] = [];
  const vlak = (punten: number[][], b: number, h: number, kleur: string, laag: Blok["properties"]["laag"] = "vast") => {
    const ring = punten.map(([u, v]) => naarWGS(rd(u, v)));
    const soort = laag === "hek" && kleur === KLEUR.hek ? "hek" : (Object.entries(KLEUR).find(([naam, waarde]) => waarde === kleur && naam !== "gevel")?.[0] ?? "gevel");
    blokken.push({ type: "Feature", properties: { b, h, kleur, laag, soort }, geometry: { type: "Polygon", coordinates: [[...ring, ring[0]]] } });
  };
  const blok = (u0: number, v0: number, u1: number, v1: number, b: number, h: number, kleur: string, laag: Blok["properties"]["laag"] = "vast") =>
    vlak([[u0, v0], [u1, v0], [u1, v1], [u0, v1]], b, h, kleur, laag);

  const type = STATION_TYPEN.find((t) => t.id === typeId) ?? STATION_TYPEN[0];
  const groen = beplanting && Math.min(U, V) >= 14;
  const inzet = groen ? 1.6 : 0.3; // hekwerk binnen de kavelgrens; de strook erbuiten is voor de haag
  const vrij = !type.hek ? 2 : Math.min(U, V) >= 25 ? 3 : 1.5; // vrije ruimte achter het gebouw (TVS: 2 m tot de perceelgrens)
  const uc = U / 2;

  // terrein en inrit
  blok(0, 0, U, V, 0, 0.06, KLEUR.terrein);
  blok(uc - 2.5, -6, uc + 2.5, 0, 0, 0.05, KLEUR.inrit);

  // gebouw: lange zijde langs de lange zijde van de kavel, vooraan op het terrein
  // opzij volstaat bij een TVS een halve meter; het gebouw wordt alleen ingekort als de kavel echt te klein is
  const gU = Math.max(2, Math.min(U >= V ? type.gebouw.l : type.gebouw.b, U - 2 * (inzet + (type.hek ? vrij : 0.5))));
  // staat een TVS met zijn kopse kant naar de voorzijde (smalle kavel van 12 m), dan volstaat ook in de diepte een halve meter
  const gV = Math.max(2, Math.min(U >= V ? type.gebouw.b : type.gebouw.l, V - 2 * (inzet + (type.hek || U >= V ? vrij : 0.5))));
  const h = type.gebouw.h;
  // gebouw tegen de voorzijde aan, met de vrije kabelruimte ervoor; alleen een te kleine kavel schuift het gebouw verder naar achteren
  const g0 = uc - gU / 2, g1 = uc + gU / 2, a0 = Math.max(inzet + 0.5, Math.min(KABELRUIMTE, V - inzet - vrij - gV)), a1 = a0 + gV;
  const gevelKleur = (GEVELS.find((g) => g.id === gevel) ?? GEVELS[0]).kleur;
  blok(uc - 2, inzet, uc + 2, a0, 0.06, 0.09, KLEUR.pad);
  if (!type.gebouw.trafos) {
    // TVS: prefab behuizing op een kelderbak, plat dak met dakrand, twee deuren in de lange gevel, twee airco-units op het dak
    // en een betonnen stoep aan de kabelzijde (naar de isometrie in de standaardtemplate en de folder van Enexis)
    blok(g0, a0, g1, a1, 0, 0.3, KLEUR.beton);
    blok(g0, a0, g1, a1, 0.3, h, gevelKleur);
    blok(g0 - 0.08, a0 - 0.08, g1 + 0.08, a1 + 0.08, h, h + 0.18, KLEUR.dak);
    blok(g0 - 0.3, a0 - 1.8, g1 + 0.3, a0, 0.06, 0.14, KLEUR.beton);
    const deur = (m: number, breed: number) => blok(m - breed / 2, a0 - 0.07, m + breed / 2, a0, 0.3, 2.45, KLEUR.rooster);
    deur(g0 + gU * 0.22, 1.1);
    deur(g0 + gU * 0.74, 2);
    for (const m of [g0 + gU * 0.3, g0 + gU * 0.7]) blok(m - 0.6, (a0 + a1) / 2 - 0.45, m + 0.6, (a0 + a1) / 2 + 0.45, h + 0.18, h + 1.05, KLEUR.rooster);
  } else {
    // TVRS: schakelruimtes (3,7 m breed) afgewisseld met open trafocellen tussen scheidingswanden, naar de isometrie in de LQS Lieshout.
    // s loopt langs de lange zijde van het complex, t dwars erop; het complex ligt met zijn lange zijde langs de lange zijde van de kavel.
    const langsU = gU >= gV;
    const B = (s0: number, t0: number, s1: number, t1: number, b: number, hh: number, kleur: string) =>
      langsU ? blok(g0 + s0, a0 + t0, g0 + s1, a0 + t1, b, hh, kleur) : blok(g0 + t0, a0 + s0, g0 + t1, a0 + s1, b, hh, kleur);
    const lang = Math.max(gU, gV), diep = Math.min(gU, gV);
    const n = type.gebouw.trafos, bw = Math.min(3.7, lang / (2 * n)), cel = (lang - n * bw) / n, hs = Math.min(3.7, h);
    for (let i = 0; i < n; i++) {
      const s0 = i * (bw + cel), c0 = s0 + bw, c1 = c0 + cel;
      B(s0, 0, c0, diep, 0, 0.3, KLEUR.beton);
      B(s0, 0, c0, diep, 0.3, hs, gevelKleur);
      B(s0 - 0.08, -0.08, c0 + 0.08, diep + 0.08, hs, hs + 0.18, KLEUR.dak);
      B(s0 + bw / 2 - 0.9, -0.07, s0 + bw / 2 + 0.9, 0, 0.3, 2.45, KLEUR.rooster);
      // trafocel: achterwand en zijwand tot 5 m, transformator op een bak
      B(c0, diep - 0.3, c1, diep, 0, h, gevelKleur);
      B(c1 - 0.3, 0, c1, diep, 0, h, gevelKleur);
      const tm = (c0 + c1 - 0.3) / 2, vm = diep / 2, tb = Math.min(1.5, (cel - 1.5) / 2);
      B(tm - tb - 0.4, vm - 3.4, tm + tb + 0.4, vm + 3.4, 0.06, 0.4, KLEUR.beton);
      B(tm - tb, vm - 2.6, tm + tb, vm + 2.6, 0.4, 3.3, KLEUR.trafo);
      B(tm - 0.5, vm - 1.4, tm + 0.5, vm + 1.4, 3.3, 4.1, KLEUR.trafo);
    }
  }

  // hekwerk (2 m) met poort van 5 m in de voorzijde; een TVS heeft geen hekwerk nodig (geen transformator)
  if (type.hek) {
    const h0 = inzet, hu1 = U - inzet, hv1 = V - inzet, d = 0.06;
    blok(h0, h0, uc - 2.5, h0 + d, 0, 2, KLEUR.hek, "hek");
    blok(uc + 2.5, h0, hu1, h0 + d, 0, 2, KLEUR.hek, "hek");
    blok(h0, hv1 - d, hu1, hv1, 0, 2, KLEUR.hek, "hek");
    blok(h0, h0, h0 + d, hv1, 0, 2, KLEUR.hek, "hek");
    blok(hu1 - d, h0, hu1, hv1, 0, 2, KLEUR.hek, "hek");
    blok(uc - 2.5, h0, uc + 2.5, h0 + d, 0.1, 1.9, KLEUR.paal, "hek");
    const paal = (u: number, v: number, hoog = 2.1) => blok(u - 0.06, v - 0.06, u + 0.06, v + 0.06, 0, hoog, KLEUR.paal);
    const reeks = (van: number, tot: number, f: (x: number) => void) => { const nn = Math.max(1, Math.round((tot - van) / 2.5)); for (let i = 0; i <= nn; i++) f(van + ((tot - van) * i) / nn); };
    reeks(h0, hu1, (u) => { if (Math.abs(u - uc) > 2.6) paal(u, h0); paal(u, hv1); });
    reeks(h0, hv1, (v) => { paal(h0, v); paal(hu1, v); });
    paal(uc - 2.5, h0, 2.3); paal(uc + 2.5, h0, 2.3);
  }

  // beplanting: haag rond drie zijden en naast de poort, bomen in de achterhoeken
  if (groen) {
    blok(0.2, 0.2, 1.2, V - 0.2, 0, 1.7, KLEUR.haag, "groen");
    blok(U - 1.2, 0.2, U - 0.2, V - 0.2, 0, 1.7, KLEUR.haag, "groen");
    blok(1.2, V - 1.2, U - 1.2, V - 0.2, 0, 1.7, KLEUR.haag, "groen");
    blok(1.2, 0.2, uc - 3.2, 1.2, 0, 1.7, KLEUR.haag, "groen");
    blok(uc + 3.2, 0.2, U - 1.2, 1.2, 0, 1.7, KLEUR.haag, "groen");
    if (Math.min(U, V) >= 25) {
      const boom = (u: number, v: number) => {
        blok(u - 0.18, v - 0.18, u + 0.18, v + 0.18, 0, 2.4, KLEUR.stam, "groen");
        [[1.3, 2.2, 3.1, KLEUR.kroon1], [2, 3.1, 4.9, KLEUR.kroon2], [1.5, 4.9, 6.1, KLEUR.kroon1], [0.8, 6.1, 6.9, KLEUR.kroon2]].forEach(([straal, b, hh, kl]) =>
          vlak(Array.from({ length: 10 }, (_, i) => [u + (straal as number) * Math.cos((i * Math.PI) / 5), v + (straal as number) * Math.sin((i * Math.PI) / 5)]), b as number, hh as number, kl as string, "groen"));
      };
      boom(-1.5, V + 1.5); boom(U + 1.5, V + 1.5);
      if (U >= 40) boom(uc, V + 2);
    }
  }

  // schaalfiguur (1,80 m) bij de poort
  blok(uc + 3.4, -1.2, uc + 3.85, -0.95, 0, 1.52, KLEUR.jas);
  blok(uc + 3.5, -1.19, uc + 3.75, -0.96, 1.52, 1.8, KLEUR.huid);

  return { blokken, voor, midden: naarWGS(midden) as LngLat, gebouw: { b: Math.min(gU, gV), l: Math.max(gU, gV), h } };
}

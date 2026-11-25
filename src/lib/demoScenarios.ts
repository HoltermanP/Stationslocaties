// Demoscenario's: fictieve zoekcirkels op echte plekken, aan de rand van een woonwijk, dorp of bedrijventerrein, waar een
// transportverdeelstation in de praktijk terechtkomt. Vijf liggen in het verzorgingsgebied van Enexis, drie in Friesland
// (Liander) rond Spannenburg, Akkrum en Wolvega. Middelpunt, straal, aansluitpunt en aangedragen locatie zijn VERZONNEN:
// ze zeggen niets over waar een netbeheerder werkelijk een station zoekt.
import type { KlicOpties } from "./klic/simuleer";
import type { DemoFase } from "./demoUitwerking";

export type DemoScenario = {
  id: string; naam: string; gemeente: string; plaats: string; stationType: string;
  /** middelpunt [lon, lat] en straal (m) van de zoekcirkel */
  centrum: [number, number]; straal: number;
  aansluitpunt: [number, number]; aangedragen: [number, number];
  netbeheerder: "Enexis" | "Liander"; /** regionale kenmerken van de gesimuleerde KLIC-levering */ klic: KlicOpties;
  fase: DemoFase; /** aantal dagen geleden gestart */ gestart: number;
  projectnummer: string; planoloog: string;
};

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "zwolle-stadshagen", naam: "Demo – Zwolle Stadshagen", gemeente: "Zwolle", plaats: "Stadshagen", stationType: "tvs",
    centrum: [6.05261, 52.54239], straal: 250, aansluitpunt: [6.05562, 52.5426], aangedragen: [6.05407, 52.54294],
    netbeheerder: "Enexis", klic: { elektra: "Enexis", gas: "Enexis", waterbedrijf: "Vitens (drinkwater)" },
    fase: "Opgeleverd", gestart: 34, projectnummer: "ID260311 (demo)", planoloog: "M. Jansen (planoloog Enexis, fictief)",
  },
  {
    id: "assen-kloosterveen", naam: "Demo – Assen Kloosterveen", gemeente: "Assen", plaats: "Kloosterveen", stationType: "tvs20",
    centrum: [6.50086, 53.00028], straal: 250, aansluitpunt: [6.50329, 53.0009], aangedragen: [6.50014, 53.00216],
    netbeheerder: "Enexis", klic: { elektra: "Enexis", gas: "Enexis", waterbedrijf: "WMD (drinkwater)" },
    fase: "Review", gestart: 16, projectnummer: "ID260402 (demo)", planoloog: "S. Hofman (planoloog Enexis, fictief)",
  },
  {
    id: "groningen-hoogkerk", naam: "Demo – Groningen Hoogkerk", gemeente: "Groningen", plaats: "Hoogkerk", stationType: "tvs23",
    centrum: [6.51195, 53.2158], straal: 250, aansluitpunt: [6.51035, 53.2166], aangedragen: [6.51253, 53.21605],
    netbeheerder: "Enexis", klic: { elektra: "Enexis", gas: "Enexis", waterbedrijf: "Waterbedrijf Groningen (drinkwater)" },
    fase: "Rapport", gestart: 9, projectnummer: "ID260418 (demo)", planoloog: "S. Hofman (planoloog Enexis, fictief)",
  },
  {
    id: "tilburg-reeshof", naam: "Demo – Tilburg Reeshof", gemeente: "Tilburg", plaats: "Reeshof", stationType: "tvs",
    centrum: [4.97707, 51.56956], straal: 250, aansluitpunt: [4.97554, 51.57032], aangedragen: [4.97671, 51.5692],
    netbeheerder: "Enexis", klic: { elektra: "Enexis", gas: "Enexis", waterbedrijf: "Brabant Water (drinkwater)", warmte: true },
    fase: "Opgeleverd", gestart: 41, projectnummer: "ID260287 (demo)", planoloog: "R. van den Berg (planoloog Enexis, fictief)",
  },
  {
    id: "venlo-blerick", naam: "Demo – Venlo Blerick", gemeente: "Venlo", plaats: "Blerick", stationType: "tvs19",
    centrum: [6.15711, 51.37326], straal: 250, aansluitpunt: [6.15892, 51.37228], aangedragen: [6.15741, 51.37369],
    netbeheerder: "Enexis", klic: { elektra: "Enexis", gas: "Enexis", waterbedrijf: "WML (drinkwater)" },
    fase: "Review", gestart: 13, projectnummer: "ID260409 (demo)", planoloog: "R. van den Berg (planoloog Enexis, fictief)",
  },
  {
    id: "spannenburg", naam: "Demo – Spannenburg", gemeente: "De Fryske Marren", plaats: "Spannenburg", stationType: "tvs20",
    centrum: [5.69681, 52.91532], straal: 250, aansluitpunt: [5.69454, 52.91629], aangedragen: [5.69346, 52.91548],
    netbeheerder: "Liander", klic: { elektra: "Liander", gas: "Liander", waterbedrijf: "Vitens (drinkwater)" },
    fase: "Rapport", gestart: 6, projectnummer: "NL-0412 (demo)", planoloog: "J. de Boer (planoloog Liander, fictief)",
  },
  {
    id: "akkrum", naam: "Demo – Akkrum", gemeente: "Heerenveen", plaats: "Akkrum", stationType: "tvs",
    centrum: [5.83764, 53.05316], straal: 250, aansluitpunt: [5.83524, 53.05321], aangedragen: [5.84008, 53.05188],
    netbeheerder: "Liander", klic: { elektra: "Liander", gas: "Liander", waterbedrijf: "Vitens (drinkwater)" },
    fase: "Review", gestart: 15, projectnummer: "NL-0398 (demo)", planoloog: "J. de Boer (planoloog Liander, fictief)",
  },
  {
    id: "wolvega", naam: "Demo – Wolvega", gemeente: "Weststellingwerf", plaats: "Wolvega", stationType: "tvs23",
    centrum: [5.99643, 52.86696], straal: 250, aansluitpunt: [5.99872, 52.86676], aangedragen: [5.99689, 52.86808],
    netbeheerder: "Liander", klic: { elektra: "Liander", gas: "Liander", waterbedrijf: "Vitens (drinkwater)" },
    fase: "Opgeleverd", gestart: 38, projectnummer: "NL-0371 (demo)", planoloog: "A. Postma (planoloog Liander, fictief)",
  },
];

/** Zoekcirkel als veelhoek: middelpunt [lon, lat] en straal in meters. */
export const cirkel = ([lon, lat]: [number, number], straal: number, n = 48): [number, number][] =>
  Array.from({ length: n }, (_, i) => {
    const hoek = (2 * Math.PI * i) / n;
    return [+(lon + (straal * Math.sin(hoek)) / (111320 * Math.cos((lat * Math.PI) / 180))).toFixed(6), +(lat + (straal * Math.cos(hoek)) / 110574).toFixed(6)];
  });

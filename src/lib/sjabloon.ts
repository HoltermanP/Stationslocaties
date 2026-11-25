// Standaardtemplate LQS van Enexis: velden per locatiepagina, keuzelijsten en de afleiding uit de analyse.
// De keuzelijsten ("Kies een item." in de template) zijn AANNAMES: de pdf van de template toont de opties niet.
// Vervang ze door de lijsten uit het Word/PowerPoint-bestand van Enexis. De velden zijn vrij invulbaar, de lijst is een suggestie.
import type { Kandidaat, Lqs, Oordeel, SjabloonInvulling } from "./types";

export const KEUZES: Record<string, string[]> = {
  typering: ["Voorkeurslocatie", "Kansrijk gebied", "Aangedragen locatie", "Niet kansrijk"],
  gebruik: ["Passend binnen het omgevingsplan", "Passend onder voorwaarden", "Niet passend, afwijken nodig (BOPA)"],
  bouwen: ["Passend binnen het omgevingsplan", "Passend onder voorwaarden", "Niet passend, afwijken nodig (BOPA)"],
  grondeigendom: ["Gemeente", "Provincie", "Waterschap", "Rijk", "Enexis", "Bedrijf", "Particulier", "Meerdere eigenaren"],
  grondgebruik: ["Openbaar groen", "Berm", "Parkeerterrein", "Bedrijventerrein", "Agrarisch", "Braakliggend", "Overig"],
  stikstof2: ["Geen AERIUS-berekening nodig", "AERIUS-berekening aanlegfase nodig"],
  overstroming: ["Kleine kans", "Middelgrote kans", "Grote kans", "Buitendijks"],
  archeologie: ["Geen onderzoeksplicht", "Onderzoeksplicht afhankelijk van oppervlakte en diepte", "Archeologisch monument"],
  ecologie: ["Geen beschermd gebied geraakt", "Quickscan flora en fauna nodig", "Binnen NNN of Natura 2000"],
  geluid: ["Geen geluidgevoelige objecten nabij", "Woningen nabij, akoestische toets nodig"],
  waterschap: ["Geen vergunning nodig", "Melding of watervergunning nodig", "Binnen beschermingszone waterkering"],
  provincie: ["Niet van toepassing", "Van toepassing"],
};

export const CONSTATERINGEN = [
  { naam: "Regels op de kaart", delen: [{ id: "regels" }] },
  { naam: "Binnenplanse mogelijkheden", delen: [{ id: "gebruik", label: "Gebruik" }, { id: "bouwen", label: "Bouwen" }] },
  { naam: "Grondeigendom", delen: [{ id: "grondeigendom" }] },
  { naam: "Grondgebruik", delen: [{ id: "grondgebruik" }] },
  { naam: "Stikstof", delen: [{ id: "stikstof1" }, { id: "stikstof2" }] },
  { naam: "Overstromingsrisico", delen: [{ id: "overstroming" }] },
] as { naam: string; delen: { id: string; label?: string }[] }[];

export const FACTOREN = [
  { id: "archeologie", naam: "Archeologie" },
  { id: "ecologie", naam: "Ecologie" },
  { id: "geluid", naam: "Geluid" },
  { id: "waterschap", naam: "Vergunning waterschap" },
  { id: "provincie", naam: "Instemmingsrecht provincie" },
];

export const TECHNIEK = [
  { id: "barrieres", naam: "Fysieke barrières" },
  { id: "berm", naam: "Bermbreedte" },
  { id: "verharding", naam: "Verharding" },
  { id: "ondergrond", naam: "Ondergrondse ruimte" },
  { id: "zoekgebied", naam: "Binnen het zoekgebied" },
  { id: "bereikbaarheid", naam: "Bereikbaarheid aanlegfase" },
];

export const VRIJ = [
  { id: "inpassing", naam: "Ruimtelijke inpassing" },
  { id: "notities", naam: "Notities" },
];

/** Tekstblokken van de template (Projectpaspoort en Advies) met de sleutel in Lqs.teksten */
export const SJABLOON_TEKSTEN = [
  { id: "aanleiding", titel: "Aanleiding project" },
  { id: "inpassing", titel: "Ruimtelijke inpassing voorkeurslocatie" },
  { id: "vervolg", titel: "Aandachtspunten voorkeurslocatie" },
  { id: "advies", titel: "Conclusie" },
];

export const letterVan = (l: Lqs, k: Kandidaat) => String.fromCharCode(65 + Math.max(0, l.kandidaten.findIndex((x) => x.id === k.id)));

const hoofd = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const nl = (n: number) => n.toLocaleString("nl-NL");

/** Wat de app zelf uit analyse en openbare bronnen kan invullen. Leeg = door de opsteller in te vullen. */
function afgeleid(l: Lqs, k: Kandidaat): SjabloonInvulling {
  const v: Record<string, string> = {};
  const o: Record<string, Oordeel> = {};
  const zet = (id: string, oordeel: Oordeel, tekst: string) => { o[id] = oordeel; v[id] = tekst; };
  const f = k.feiten;
  const dubbel = f?.dubbelbestemmingen.map((d) => d.naam) ?? [];
  const aandacht = k.auto.aandacht?.toelichting ?? "";
  const buiten = k.inUitgesloten.includes("buiten zoekgebied");

  v.typering = k.id === l.voorkeurId ? "Voorkeurslocatie" : k.inUitgesloten.length ? "Niet kansrijk" : k.bron === "aangedragen" ? "Aangedragen locatie" : "Kansrijk gebied";
  v.adres = hoofd(k.adres ?? "");
  v.kadastraal = f?.percelen.map((p) => `${p.aanduiding} (${nl(p.oppM2)} m²)`).join(", ") ?? "";
  if (f) {
    v.regels = [
      f.bestemmingen.length ? `Bestemming ${[...new Set(f.bestemmingen.map((b) => b.naam))].join(", ")}` : "Geen bestemming gevonden",
      dubbel.length ? `dubbelbestemming ${dubbel.join(", ")}` : "",
      f.gebiedsaanduidingen.length ? `gebiedsaanduiding ${f.gebiedsaanduidingen.join(", ")}` : "",
    ].filter(Boolean).join("; ");
    v.grondgebruik = hoofd(f.grondgebruik.join(", "));
    if (f.natura !== undefined) v.stikstof1 = f.natura ? (f.natura.afstand ? `Natura 2000 ${f.natura.naam} op ${nl(Math.round(f.natura.afstand / 100) * 100)} m` : `Binnen Natura 2000 ${f.natura.naam}`) : "Geen Natura 2000 binnen 10 km";
  }
  const eigenaren = [...new Set(Object.values(k.eigendom ?? {}).map((e) => e.type).filter(Boolean))];
  if (eigenaren.length) v.grondeigendom = hoofd(eigenaren.join(", "));

  // Afweegbare omgevingsfactoren
  const arch = dubbel.filter((d) => /archeolog/i.test(d));
  if (/archeolog/i.test(aandacht)) zet("archeologie", "rood", "Raakt archeologisch monument (AMK)");
  else if (arch.length) zet("archeologie", "oranje", `${arch.join(", ")}: onderzoeksplicht nagaan`);
  else if (f) zet("archeologie", "groen", "Geen archeologische dubbelbestemming of monument");
  if (/bos/i.test(aandacht)) zet("ecologie", "oranje", "Raakt bos: quickscan flora en fauna nodig");
  else if (f?.natura && f.natura.afstand < 500) zet("ecologie", "oranje", `Natura 2000 ${f.natura.naam} op ${nl(f.natura.afstand)} m`);
  else if (f) zet("ecologie", "groen", "Geen bos of Natura 2000 geraakt; NNN nagaan bij provincie");
  const w = k.auto.woningen?.waarde;
  if (w !== null && w !== undefined) zet("geluid", w >= 50 ? "groen" : w >= 20 ? "oranje" : "rood", w > 1e5 ? "Geen woningen in de omgeving" : `Dichtstbijzijnde woning op ${nl(w)} m`);
  const water = dubbel.filter((d) => /water/i.test(d));
  if (water.length) zet("waterschap", "oranje", `${water.join(", ")}: vergunningplicht nagaan`);
  else if (k.trace?.boring) zet("waterschap", "oranje", "Kabeltracé kruist water: melding of vergunning nagaan");
  else if (f) zet("waterschap", "groen", "Geen waterstaatkundige dubbelbestemming");

  // Technische afwegingen
  if (k.trace) {
    zet("barrieres", k.trace.boring ? "oranje" : "groen", k.trace.boring ? `Tracé kruist water of spoor: ${nl(k.trace.boring)} m gestuurde boring` : "Geen kruising met water of spoor op het kabeltracé");
    zet("verharding", "groen", `Tracé ${nl(k.trace.langsWeg)} m langs de weg, ${nl(k.trace.overig)} m door overig terrein`);
  }
  const leidingen = k.leidingen ?? [];
  const inKavel = leidingen.filter((x) => x.inKavel);
  if (inKavel.length) zet("ondergrond", "rood", `Binnen de kavel: ${inKavel.map((x) => x.laag).join(", ")}`);
  else if (leidingen.length) zet("ondergrond", "groen", "Geen aangeleverde kabels of leidingen binnen de kavel");
  else zet("ondergrond", "oranje", "KLIC nog niet beoordeeld");
  zet("zoekgebied", buiten ? "rood" : "groen", buiten ? "Nee, buiten het zoekgebied" : "Ja");
  const weg = k.auto.weg?.waarde;
  if (weg !== null && weg !== undefined) zet("bereikbaarheid", weg <= 40 ? "groen" : weg <= 150 ? "oranje" : "rood", weg > 1e5 ? "Geen weg in de omgeving" : `${nl(weg)} m tot de openbare weg`);

  const land = k.handmatig.landschap;
  if (land?.notitie) zet("inpassing", !land.score || land.score === 3 ? "oranje" : land.score >= 4 ? "groen" : "rood", land.notitie);
  const not = [k.bron === "aangedragen" ? `Vooraf aangedragen: ${k.naam}.` : "", k.inUitgesloten.length ? `Ligt in ${k.inUitgesloten.join(", ").toLowerCase()}.` : "", k.auto.net ? `${hoofd(k.auto.net.toelichting)}.` : ""].filter(Boolean).join(" ");
  if (not) zet("notities", k.inUitgesloten.length ? "rood" : "groen", not);
  return { velden: v, oordelen: o };
}

/** Invulling van de locatiepagina: wat de opsteller invulde gaat voor, de rest komt uit de afleiding. */
export function sjabloonVan(l: Lqs, k: Kandidaat) {
  const a = afgeleid(l, k);
  const eigen = k.sjabloon ?? { velden: {}, oordelen: {} };
  const veld = (id: string) => eigen.velden[id] || a.velden[id] || "";
  const oordeel = (id: string): Oordeel => eigen.oordelen[id] ?? a.oordelen[id] ?? "oranje";
  /** true = komt uit de afleiding, niet door de opsteller ingevuld */
  const automatisch = (id: string) => !eigen.velden[id] && !!a.velden[id];
  return { veld, oordeel, automatisch };
}

export const ALLE = ["gebruik", "bouwen", "grondeigendom", "grondgebruik", "stikstof1", "stikstof2", "overstroming", "regels", ...FACTOREN.map((x) => x.id), ...TECHNIEK.map((x) => x.id), "inpassing"];
/** Velden die nog leeg zijn, voor de voortgang per locatie. */
export const openVelden = (l: Lqs, k: Kandidaat) => { const s = sjabloonVan(l, k); return ALLE.filter((id) => !s.veld(id)); };

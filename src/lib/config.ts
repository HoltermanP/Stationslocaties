// Stationstypen volgens de openbare voorlichting van Enexis. De LQS gaat over MS/MS-stations: het transportverdeelstation
// (TVS, zonder transformator) en het transportverdeelregelstation (TVRS, met regeltransformatoren 20/10 kV).
// Bronnen: standaardtemplate LQS (TVS 14,5 m); flyer "Een nieuw transportverdeelstation in uw omgeving" (Enexis, versie 1.0
// juni 2024) voor het TVS met 20 schakelkasten; "Menukaart midden- en laagspanningsstations" (Enexis, april 2024) voor TVS 19
// en 23 velden; folder Regelstation (juni 2024) en de LQS Lieshout (juli 2025) voor TVRS2 en TVRS3.
// Het zijn voorlichtingsmaten, geen ontwerpkader; de kavelmaat is per LQS aan te passen.
// gebouw = buitenmaten boven maaiveld (kort × lang × hoog, m); bij een TVRS is dat het hele complex van schakelruimtes en trafocellen.
// velden = aantal schakelvelden; gebouw.kelder = diepte van de kelderbak onder maaiveld (m), null als de bron die niet noemt.
// woningAfstand = afstand tot woningen in de uitsluitingsanalyse: 50 m richtafstand (VNG) bij transformatoren, 10 m bij een TVS.
const FOLDER_TVS = "https://www.enexis.nl/-/media/ruimte-en-recht/pdf/folder-transportverdeelstation.pdf";
const FOLDER_TVRS = "https://www.enexis.nl/-/media/ruimte-en-recht/pdf/folder-regelstation.pdf";
export const STATION_TYPEN = [
  // perceel 20,3 × 17,7 m = 360 m² en gebouw 14,5 × 3,7 m uit de standaardtemplate LQS
  { id: "tvs", naam: "Transportverdeelstation (TVS, 21 velden – maten template LQS)", kavelB: 17.7, kavelL: 20.3, hek: false, woningAfstand: 10, folder: FOLDER_TVS, velden: 21, gebouw: { b: 3.7, l: 14.5, h: 3.2, kelder: 2.2 as number | null, deuren: 2, trafos: 0 } },
  // flyer juni 2024: 20 schakelkasten, gebouw 14,5 × 3,7 m, 3,7 m hoog en 2,2 m diep, standaard donkergroen, in totaal circa 222 m²
  // ruimtebeslag inclusief de kabelruimte in de grond. De flyer geeft alleen de oppervlakte; de verdeling 18,5 × 12 m is afgeleid
  // (gebouw + 2 m aan beide kopse kanten, diepte 12 m zoals de kavels van 19 en 23 velden in de menukaart) en dus een aanname.
  { id: "tvs20", naam: "Transportverdeelstation (TVS, 20 velden – flyer juni 2024, 222 m²)", kavelB: 12, kavelL: 18.5, hek: false, woningAfstand: 10, folder: FOLDER_TVS, velden: 20, gebouw: { b: 3.7, l: 14.5, h: 3.7, kelder: 2.2, deuren: 2, trafos: 0 } },
  { id: "tvs19", naam: "Transportverdeelstation (TVS, 19 velden)", kavelB: 12, kavelL: 17.5, hek: false, woningAfstand: 10, folder: FOLDER_TVS, velden: 19, gebouw: { b: 3.7, l: 13.5, h: 3.7, kelder: null, deuren: 2, trafos: 0 } },
  { id: "tvs23", naam: "Transportverdeelstation (TVS, 23 velden)", kavelB: 12, kavelL: 20, hek: false, woningAfstand: 10, folder: FOLDER_TVS, velden: 23, gebouw: { b: 3.7, l: 16.1, h: 3.7, kelder: null, deuren: 2, trafos: 0 } },
  // perceel circa 1520 m²; de verdeling 40 × 38 m is niet uit de bron zelf bevestigd
  { id: "tvrs2", naam: "Transportverdeelregelstation (TVRS2, 2 transformatoren)", kavelB: 38, kavelL: 40, hek: true, woningAfstand: 50, folder: FOLDER_TVRS, velden: 0, gebouw: { b: 14.5, l: 20, h: 5, kelder: null, deuren: 2, trafos: 2 } },
  { id: "tvrs3", naam: "Transportverdeelregelstation (TVRS3, 3 transformatoren)", kavelB: 38, kavelL: 49, hek: true, woningAfstand: 50, folder: FOLDER_TVRS, velden: 0, gebouw: { b: 14.5, l: 29, h: 5, kelder: null, deuren: 3, trafos: 3 } },
];

// Gevelafwerking volgens de menukaart van Enexis: groen (RAL 6009) is standaard; de overige zijn varianten voor inpassing.
export const GEVELS = [
  { id: "groen", naam: "groen (standaard)", kleur: "#33493c" },
  { id: "grijs", naam: "lichtgrijs", kleur: "#c9c7c0" },
  { id: "baksteen", naam: "rode baksteen", kleur: "#8a5f4a" },
  { id: "grijzesteen", naam: "grijze baksteen", kleur: "#8d8a84" },
];

// Kengetallen voor het kabeltracé. AANNAMES: vervang ze door de eenheidsprijzen van Enexis of de eigen calculatie.
// Bedragen in euro per meter tracé (één kabelbed, aanleg inclusief kabel), exclusief het station zelf, engineering en btw.
export const TRACE = {
  weg: 175, // open ontgraving langs de openbare weg, inclusief herstel verharding
  overig: 125, // open ontgraving door overig terrein
  boring: 500, // gestuurde boring onder water of spoor
  // Voorkeur bij het kiezen van de route, los van de kosten: een meter door overig terrein (grond van derden,
  // zakelijk recht) of een meter boring weegt zo veel keer zwaarder dan een meter langs de weg.
  strafOverig: 4,
  strafBoring: 8,
  corridor: 8, // strook aan weerszijden van de weg die als "langs de weg" telt (m)
};

export const STATUSSEN = ["Intake", "Analyse", "Kandidaten", "Rapport", "Review", "Opgeleverd"] as const;

export const DOORLOOPTIJD_DAGEN = 21; // gewenste doorlooptijd Enexis: drie weken
export const JAARVOLUME = 120; // verwacht aantal LQS'en per jaar

export const AUTO_CRITERIA = [
  { id: "ruimte", naam: "Beschikbare ruimte rond kavel", gewicht: 2 },
  { id: "woningen", naam: "Afstand tot woningen (hinder)", gewicht: 2 },
  { id: "weg", naam: "Bereikbaarheid vanaf de weg", gewicht: 2 },
  { id: "net", naam: "Afstand tot aansluitpunt / zwaartepunt", gewicht: 3 },
  { id: "aandacht", naam: "Vrij van aandachtsgebieden", gewicht: 2 },
  // uit het programma van eisen van Enexis voor een TVS (menukaart april 2024)
  { id: "kruising", naam: "Afstand tot een kruising", gewicht: 1 },
  { id: "terrein", naam: "Vlak terrein en hoogwaterrisico", gewicht: 2 },
];

export const HAND_CRITERIA = [
  { id: "bestemming", naam: "Planologische inpasbaarheid (omgevingsplan)", gewicht: 3 },
  { id: "eigendom", naam: "Eigendom en verwerving", gewicht: 2 },
  { id: "landschap", naam: "Landschappelijke en stedenbouwkundige inpassing", gewicht: 1 },
  { id: "klic", naam: "Kabels en leidingen (KLIC)", gewicht: 2 },
  { id: "procedure", naam: "Vergunbaarheid en procedurerisico", gewicht: 2 },
];

export const EIGENAAR_TYPEN = ["gemeente", "provincie, waterschap of Rijk", "netbeheerder", "bedrijf", "particulier", "meerdere eigenaren"];

export const STANDAARD_GEWICHTEN: Record<string, number> = Object.fromEntries(
  [...AUTO_CRITERIA, ...HAND_CRITERIA].map((c) => [c.id, c.gewicht]),
);

export const REVIEW_PUNTEN = [
  { id: "zoekgebied", tekst: "Zoekgebied komt overeen met de aanlevering van Asset Management" },
  { id: "bronnen", tekst: "Alle kaartlagen zijn geladen; mislukte bronnen zijn handmatig gecontroleerd" },
  { id: "aangedragen", tekst: "Vooraf aangedragen locaties zijn meegenomen in de afweging" },
  { id: "omgevingsplan", tekst: "Omgevingsplan/bestemming van de kandidaten is gecontroleerd in het Omgevingsloket" },
  { id: "klic", tekst: "KLIC-gegevens van de voorkeurslocatie zijn beoordeeld" },
  { id: "streetview", tekst: "Locaties zijn visueel gecontroleerd (luchtfoto / Streetview)" },
  { id: "scores", tekst: "Alle handmatige criteria zijn gescoord en gemotiveerd" },
  { id: "ai", tekst: "Overgenomen AI-voorstellen zijn inhoudelijk nagelopen aan de hand van de genoemde controlepunten" },
  { id: "voorkeur", tekst: "Voorkeurslocatie en motivatie zijn navolgbaar onderbouwd" },
  { id: "pve", tekst: "Programma van eisen Enexis nagelopen op wat niet automatisch te toetsen is: toegangsweg met 5 m vrije hoogte en geschikt voor zwaar materieel, geen obstakels boven het station, 5 m vrije kabelruimte aan de voorzijde, draagkrachtige en niet drassige ondergrond" },
  { id: "template", tekst: "Rapport is volledig en conform standaardtemplate" },
];

export const RAPPORT_SECTIES = [
  { id: "aanleiding", titel: "Aanleiding en opgave" },
  { id: "zoekgebied", titel: "Zoekgebied" },
  { id: "analyse", titel: "Ruimtelijke analyse per thema" },
  { id: "kansrijk", titel: "Kansrijke gebieden" },
  { id: "afweging", titel: "Afweging van locaties" },
  { id: "advies", titel: "Voorkeurslocatie en advies" },
  { id: "vervolg", titel: "Aandachtspunten en vervolg" },
];

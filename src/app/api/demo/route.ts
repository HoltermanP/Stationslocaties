import { voerAnalyseUit } from "@/lib/analyse/analyse";
import { verzamelFeiten } from "@/lib/analyse/feiten";
import { bestemmingTekst, voorbeeldEigendom, voorbeeldHandmatig, voorbeeldVoorstel } from "@/lib/demoInvulling";
import { simuleerKlic, type KlicOpties } from "@/lib/klic/simuleer";
import { haal, maak, wijzig } from "@/lib/repo";
import { REVIEW_PUNTEN } from "@/lib/config";
import { rangorde } from "@/lib/score";
import { ALLE, sjabloonVan } from "@/lib/sjabloon";
import { maakTeksten } from "@/lib/teksten";
import type { Kandidaat, Oordeel } from "@/lib/types";

export const maxDuration = 180;

// Voorbeeld-LQS: een fictief zoekgebied uit SCENARIOS (standaard de oostkant van Zwolle).
// De demo doorloopt het hele proces, zodat het rapport in de template van Enexis direct gevuld is:
// analyse en openbare feiten zijn echt, de velden die een planoloog invult (eigendom, planregels, stikstof,
// overstromingsrisico, bermbreedte, inpassing) krijgen een FICTIEVE voorbeeldwaarde.
// Met { herbereken: id } wordt een bestaande demo opnieuw doorgerekend en gevuld, met behoud van nummer en instellingen.
// Voorbeeldscenario's in het verzorgingsgebied van Enexis: fictieve zoekgebieden op en rond bedrijventerreinen, elk met een
// ander stationstype. Het eerste is de standaarddemo; kies een ander met { scenario: <id> }, zie SCENARIOS.
type Fase = "Rapport" | "Review" | "Opgeleverd";
type Scenario = {
  id: string; naam: string; gemeente: string; plaats: string; stationType: string;
  zoekgebied: number[][]; aansluitpunt: number[]; aangedragen: number[];
  /** fase waarin de demo eindigt; zonder opgave Rapport, zoals de eerste vier demo's */
  fase?: Fase;
  /** startdatum, dagen geleden (alleen met fase) */
  dagenGeleden?: number;
  /** doorlooptijd tot oplevering in dagen (alleen bij Opgeleverd) */
  doorlooptijd?: number;
  projectnummer?: string; reviewer?: string; specialist?: string;
  klic?: KlicOpties;
};

/** Onregelmatige vijfhoek van circa 1,5 × 1,1 km rond een middelpunt (graden). */
const gebied = (x: number, y: number) => [[x - 0.0105, y + 0.0065], [x + 0.0105, y + 0.0082], [x + 0.0135, y], [x + 0.003, y - 0.0065], [x - 0.009, y - 0.0035]];
const sc6 = (x: number, y: number) => ({ zoekgebied: gebied(x, y), aansluitpunt: [x - 0.003, y - 0.0005], aangedragen: [x + 0.004, y + 0.0005] });

const SCENARIOS: Scenario[] = [
  {
    id: "zwolle", naam: "Demo – Zwolle Marslanden", gemeente: "Zwolle", plaats: "Marslanden", stationType: "tvs",
    zoekgebied: [[6.1235, 52.5035], [6.1445, 52.5052], [6.1492, 52.4968], [6.1398, 52.4905], [6.1262, 52.4938]],
    aansluitpunt: [6.1312, 52.4978], aangedragen: [6.1385, 52.4975],
  },
  {
    id: "groningen", naam: "Demo – Groningen Eemspoort", gemeente: "Groningen", plaats: "Eemspoort", stationType: "tvs20",
    zoekgebied: [[6.598, 53.208], [6.632, 53.21], [6.636, 53.198], [6.612, 53.193], [6.598, 53.199]],
    aansluitpunt: [6.612, 53.203], aangedragen: [6.622, 53.2035],
  },
  {
    id: "eindhoven", naam: "Demo – Eindhoven De Hurk", gemeente: "Eindhoven", plaats: "De Hurk", stationType: "tvs23",
    zoekgebied: [[5.422, 51.434], [5.448, 51.435], [5.452, 51.424], [5.436, 51.419], [5.423, 51.423]],
    aansluitpunt: [5.433, 51.428], aangedragen: [5.441, 51.4275],
  },
  {
    id: "venlo", naam: "Demo – Venlo Trade Port", gemeente: "Venlo", plaats: "Trade Port", stationType: "tvrs2",
    zoekgebied: [[6.095, 51.396], [6.122, 51.397], [6.126, 51.386], [6.108, 51.381], [6.094, 51.386]],
    aansluitpunt: [6.106, 51.39], aangedragen: [6.114, 51.3895],
  },
  // Zes voorbeelddossiers in verschillende fasen van het proces, met een volledig ingevulde template, doorgerekende review en
  // een KLIC-levering met eigen kenmerken per regio. Opgeleverd: Assen, Hengelo, Maastricht (die laatste na de deadline).
  { id: "assen", naam: "Demo – Assen Marsdijk", gemeente: "Assen", plaats: "Marsdijk", stationType: "tvs19", ...sc6(6.585, 52.998), fase: "Opgeleverd", dagenGeleden: 41, doorlooptijd: 17, projectnummer: "ID412087 (demo)", reviewer: "Planoloog Enexis (reviewer)", specialist: "Planoloog Enexis", klic: { waterbedrijf: "Vitens (drinkwater)", waterschap: "Waterschap Drents Overijsselse Delta", wees: true } },
  { id: "hengelo", naam: "Demo – Hengelo Westermaat", gemeente: "Hengelo", plaats: "Westermaat", stationType: "tvrs3", ...sc6(6.762, 52.272), fase: "Opgeleverd", dagenGeleden: 34, doorlooptijd: 20, projectnummer: "ID412311 (demo)", reviewer: "Planoloog Enexis (reviewer)", specialist: "Planoloog Enexis", klic: { waterbedrijf: "Vitens (drinkwater)", waterschap: "Waterschap Vechtstromen", warmte: true, hoogspanning: true, rioolDruk: true } },
  { id: "roosendaal", naam: "Demo – Roosendaal Borchwerf", gemeente: "Roosendaal", plaats: "Borchwerf", stationType: "tvs", ...sc6(4.428, 51.535), fase: "Review", dagenGeleden: 16, projectnummer: "ID412559 (demo)", reviewer: "Planoloog Enexis (reviewer)", specialist: "Planoloog Enexis", klic: { waterbedrijf: "Brabant Water (drinkwater)", waterschap: "Waterschap Brabantse Delta", buisleiding: true, gasTransport: "66 bar" } },
  { id: "tilburg", naam: "Demo – Tilburg Katsbogten", gemeente: "Tilburg", plaats: "Katsbogten", stationType: "tvs23", ...sc6(5.075, 51.575), fase: "Rapport", dagenGeleden: 12, projectnummer: "ID412604 (demo)", specialist: "Planoloog Enexis", klic: { waterbedrijf: "Brabant Water (drinkwater)", waterschap: "Waterschap De Dommel", warmte: true, rioolDruk: true } },
  { id: "maastricht", naam: "Demo – Maastricht Beatrixhaven", gemeente: "Maastricht", plaats: "Beatrixhaven", stationType: "tvrs2", ...sc6(5.700, 50.872), fase: "Opgeleverd", dagenGeleden: 55, doorlooptijd: 26, projectnummer: "ID411902 (demo)", reviewer: "Planoloog Enexis (reviewer)", specialist: "Planoloog Enexis", klic: { waterbedrijf: "WML (drinkwater)", waterschap: "Waterschap Limburg", hoogspanning: true, buisleiding: true, rioolDruk: true } },
  { id: "emmen", naam: "Demo – Emmen Bargermeer", gemeente: "Emmen", plaats: "Bargermeer", stationType: "tvs20", ...sc6(6.935, 52.775), fase: "Review", dagenGeleden: 9, projectnummer: "ID412677 (demo)", reviewer: "Planoloog Enexis (reviewer)", specialist: "Planoloog Enexis", klic: { waterbedrijf: "Vitens (drinkwater)", waterschap: "Waterschap Hunze en Aa's", wees: true } },
];

export async function POST(req: Request) {
  const { herbereken, scenario } = (await req.json().catch(() => ({}))) as { herbereken?: string; scenario?: string };
  const bestaand = herbereken ? await haal(herbereken) : null;
  if (herbereken && !bestaand?.naam.startsWith("Demo")) return Response.json({ fout: "Alleen een demo-LQS kan opnieuw worden gevuld" }, { status: 400 });
  const sc = SCENARIOS.find((x) => x.id === scenario) ?? SCENARIOS.find((x) => x.naam === bestaand?.naam) ?? SCENARIOS[0];
  if (scenario && sc.id !== scenario) return Response.json({ fout: `Onbekend scenario; kies uit ${SCENARIOS.map((x) => x.id).join(", ")}` }, { status: 400 });
  const plaats = SCENARIOS.find((x) => x.naam === bestaand?.naam)?.plaats ?? (bestaand ? bestaand.naam.replace(/^Demo – /, "") : sc.plaats);
  let l = bestaand ?? await maak({
    naam: sc.naam,
    gemeente: sc.gemeente,
    stationType: sc.stationType,
    planoloog: "Planoloog Enexis",
    uitvoerder: "Demo",
    startdatum: sc.fase ? dag(-(sc.dagenGeleden ?? 0)) : undefined,
    zoekgebied: { type: "Polygon", coordinates: [[...sc.zoekgebied, sc.zoekgebied[0]]] },
    aansluitpunt: sc.aansluitpunt as [number, number],
    aangedragen: [{ naam: "Aangedragen door gemeente", punt: sc.aangedragen as [number, number] }],
  });
  try {
    // gesimuleerde KLIC-leidingen langs de wegen, tenzij er al een echte levering is ingelezen
    if (!l.klic?.ingelezenOp || l.klic.bron === "simulatie") {
      const sim = await simuleerKlic(l, sc.klic).catch((e) => { console.error("Demo: KLIC-simulatie mislukt", e); return null; });
      if (sim) l = (await wijzig(l.id, sim)) ?? l;
    }
    const { analyse, kandidaten: ruw } = await voerAnalyseUit(l);
    const kandidaten = await Promise.all(ruw.map(async (k) => ({ ...k, feiten: await verzamelFeiten(k) })));
    // wat de planoloog en het AI-voorstel zouden invullen: eigendom, voorstel per criterium en de handmatige scores
    kandidaten.forEach((k, i) => {
      k.sjabloon = voorbeeld(k, i);
      k.eigendom = voorbeeldEigendom(k, l.gemeente);
      k.voorstel = voorbeeldVoorstel(k);
      k.handmatig = voorbeeldHandmatig(k.voorstel, k.sjabloon.velden.inpassing);
    });
    const rang = rangorde(kandidaten, l.gewichten);
    // voorkeur: hoogste score onder de locaties waar de bestemming een nutsvoorziening waarschijnlijk toelaat
    const geschikt = rang.filter((r) => r.geschikt);
    const voorkeurId = (geschikt.find((r) => past(r.k)) ?? geschikt[0])?.k.id ?? null;
    const gekozen = geschikt.find((r) => r.k.id === voorkeurId);
    const tweede = geschikt.find((r) => r.k.id !== voorkeurId);
    const voorkeurMotivatie = gekozen
      ? `${gekozen.k.naam} scoort ${gekozen.score} van 100${tweede ? `, tegen ${tweede.score} voor ${tweede.k.naam}` : ""}. ${gekozen.k.voorstel?.bestemming.motivatie ?? ""} ${gekozen.k.voorstel?.klic.motivatie ?? ""}`.replace(/\s+/g, " ").trim()
      : "Er is geen locatie gevonden die buiten de uitgesloten gebieden valt.";
    kandidaten.forEach((k) => {
      k.sjabloon!.velden.notities = `${sjabloonVan({ ...l, analyse, kandidaten, voorkeurId }, k).veld("notities")} Demo: eigendom, planregels, stikstof, overstromingsrisico, bermbreedte, inpassing, de handmatige scores en het AI-voorstel zijn fictief ingevuld; de KLIC-leidingen zijn gesimuleerd.`;
    });
    // Alle velden van de template vastleggen, ook die de app zelf afleidt, zodat er voor de planoloog niets openstaat.
    const tussen = { ...l, analyse, kandidaten, voorkeurId, voorkeurMotivatie };
    kandidaten.forEach((k) => {
      const sj = sjabloonVan(tussen, k);
      for (const id of ALLE) {
        k.sjabloon!.velden[id] ||= sj.veld(id) || AANVULLING[id] || "Beoordeeld voor de demo";
        k.sjabloon!.oordelen[id] ??= sj.oordeel(id);
      }
    });
    const basis = { ...l, analyse, kandidaten, voorkeurId, voorkeurMotivatie };
    const teksten = maakTeksten(basis);
    teksten.aanleiding += " Dit is een demo: het zoekgebied is fictief, de velden van de planoloog en het AI-voorstel bevatten voorbeeldwaarden en de KLIC-gegevens zijn gesimuleerd.";
    const fase: Fase = sc.fase ?? "Rapport";
    const start = new Date(l.startdatum);
    const stappen: [string, number][] = [["Intake", 0], ["Analyse", 1], ["Kandidaten", 4], ["Rapport", 9], ["Review", 14], ["Opgeleverd", sc.doorlooptijd ?? 18]];
    const tot = STATUSSEN_VOLGORDE.indexOf(fase);
    const historie = sc.fase
      ? stappen.filter((_, i) => i <= tot).map(([status, d]) => ({ status, op: new Date(start.getTime() + (Math.min(d, sc.doorlooptijd ?? d)) * 86400000 + 9 * 3600000).toISOString() }))
      : undefined;
    const review = fase === "Rapport" ? undefined : {
      reviewer: sc.reviewer ?? "Planoloog Enexis (reviewer)",
      items: REVIEW_PUNTEN.map((p, i) => ({ id: p.id, akkoord: fase === "Opgeleverd" || i < 8, opmerking: fase === "Opgeleverd" || i < 8 ? reviewOpmerking(p.id, basis) : "" })),
    };
    return Response.json(await wijzig(l.id, {
      analyse, kandidaten, voorkeurId, voorkeurMotivatie, teksten, status: fase, ...(historie ? { historie } : {}),
      ...(fase === "Opgeleverd" ? { opgeleverdOp: dag(sc.doorlooptijd ?? 18, l.startdatum) } : {}),
      ...(review ? { review } : {}),
      colofon: { plaats, projectnummer: sc.projectnummer ?? "ID000000 (demo)", versie: fase === "Opgeleverd" ? "V1.0" : fase === "Review" ? "V0.9" : "V0.1", specialist: sc.specialist ?? "Planoloog Enexis", email: "voor.achternaam@enexis.nl" },
    }));
  } catch (e) {
    // Zonder kaartdiensten blijft de demo bruikbaar: de analyse is dan vanuit de werkplek te starten.
    console.error("Demo: analyse mislukt", e);
    return Response.json(l);
  }
}

const bestemming = bestemmingTekst;
const past = (k: Kandidaat) => /bedrijf|bedrijven|industrie|verkeer|maatschappelijk/.test(bestemming(k)) && !/natuur/.test(bestemming(k));

/** Fictieve voorbeeldwaarden voor de velden die een planoloog zelf invult. */
function voorbeeld(k: Kandidaat, i: number): NonNullable<Kandidaat["sjabloon"]> {
  const groep = bestemming(k);
  const groen = /groen|agrarisch|natuur|recreatie/.test(groep);
  const ruim = i % 3 !== 1;
  const velden: Record<string, string> = {
    gebruik: past(k) ? "Passend binnen het omgevingsplan" : "Niet passend, afwijken nodig (BOPA)",
    bouwen: past(k) ? "Passend onder voorwaarden" : "Niet passend, afwijken nodig (BOPA)",
    stikstof2: "AERIUS-berekening aanlegfase nodig",
    overstroming: "Kleine kans",
    provincie: "Niet van toepassing",
    berm: ruim ? "Berm breder dan 7 m, kabeltracé past naast de rijbaan" : "Berm circa 4 m, tracé deels onder het fietspad",
    inpassing: groen ? "Open groene omgeving: station inpassen met haag en gedekte kleur" : "Sluit aan op bestaande bedrijfsbebouwing; geen bijzondere inpassing nodig",
  };
  const oordelen: Record<string, Oordeel> = { provincie: "groen", berm: ruim ? "groen" : "oranje", inpassing: groen ? "oranje" : "groen" };
  return { velden, oordelen };
}


const STATUSSEN_VOLGORDE = ["Intake", "Analyse", "Kandidaten", "Rapport", "Review", "Opgeleverd"];
const dag = (n: number, van?: string) => new Date((van ? new Date(van).getTime() : Date.now()) + n * 86400000).toISOString().slice(0, 10);

/** Terugval voor template-velden die noch de planoloog noch de afleiding uit de analyse invult. */
const AANVULLING: Record<string, string> = {
  stikstof1: "Geen Natura 2000 binnen 10 km",
  geluid: "Geen geluidgevoelige objecten nabij",
  ondergrond: "Geen aangeleverde kabels of leidingen binnen de kavel",
  bereikbaarheid: "Bereikbaar via de openbare weg met zwaar materieel",
  barrieres: "Geen fysieke barrières op het kabeltracé",
  verharding: "Kabeltracé grotendeels in bermen en onverharde stroken",
  waterschap: "Geen vergunning nodig",
  archeologie: "Geen onderzoeksplicht",
  ecologie: "Geen beschermd gebied geraakt",
  grondeigendom: "Gemeente",
  grondgebruik: "Bedrijventerrein",
  regels: "Bestemming Bedrijventerrein",
};

/** Opmerking van de reviewer per controlepunt, afgeleid uit het dossier. */
function reviewOpmerking(id: string, l: { kandidaten: Kandidaat[]; voorkeurId: string | null; klic: { meldnummer?: string; themas?: { leidingen: number }[]; netbeheerders?: unknown[] }; aangedragen: unknown[] }): string {
  const v = l.kandidaten.find((k) => k.id === l.voorkeurId);
  const leidingen = (l.klic.themas ?? []).reduce((n, t) => n + t.leidingen, 0);
  const tekst: Record<string, string> = {
    zoekgebied: "Zoekgebied vergeleken met de aanlevering van Asset Management: komt overeen.",
    bronnen: "Alle kaartlagen zijn geladen; geen mislukte bronnen.",
    aangedragen: l.aangedragen.length ? `${l.aangedragen.length} aangedragen locatie meegenomen en beoordeeld.` : "Geen locaties aangedragen.",
    omgevingsplan: "Bestemming van de kandidaten nagelopen in het Omgevingsloket; BOPA nodig waar het plan een nutsvoorziening niet toelaat.",
    klic: `KLIC-melding ${l.klic.meldnummer ?? ""} beoordeeld: ${leidingen} leidingdelen van ${(l.klic.netbeheerders ?? []).length} netbeheerders${v?.leidingen?.some((x) => x.inKavel) ? "; er ligt een leiding in de kavel van de voorkeurslocatie, verlegging meegenomen als aandachtspunt" : "; geen leidingen in de kavel van de voorkeurslocatie"}.`,
    streetview: "Locaties gecontroleerd op luchtfoto en in Street View; geen afwijkingen met de analyse.",
    scores: "Alle vijf handmatige criteria per locatie gescoord en gemotiveerd.",
    ai: "Overgenomen voorstellen nagelopen aan de hand van de controlepunten; eigendom en inpassing zelf beoordeeld.",
    voorkeur: v ? `${v.naam} als voorkeurslocatie navolgbaar onderbouwd met scores en motivatie.` : "Voorkeurslocatie onderbouwd.",
    pve: "Programma van eisen nagelopen: toegangsweg, vrije hoogte, kabelruimte aan de voorzijde en ondergrond zijn beoordeeld; ondergrond ter plaatse te verifiëren.",
    template: "Rapport is volledig en conform de standaardtemplate.",
  };
  return tekst[id] ?? "";
}

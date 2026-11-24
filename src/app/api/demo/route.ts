import { voerAnalyseUit } from "@/lib/analyse/analyse";
import { verzamelFeiten } from "@/lib/analyse/feiten";
import { bestemmingTekst, voorbeeldEigendom, voorbeeldHandmatig, voorbeeldVoorstel } from "@/lib/demoInvulling";
import { werkBerkumUit } from "@/lib/demoBerkum";
import { simuleerKlic } from "@/lib/klic/simuleer";
import { haal, maak, wijzig } from "@/lib/repo";
import { rangorde } from "@/lib/score";
import { sjabloonVan } from "@/lib/sjabloon";
import { maakTeksten } from "@/lib/teksten";
import type { Kandidaat, Oordeel } from "@/lib/types";

export const maxDuration = 180;

// Voorbeeld-LQS: een fictief zoekgebied uit SCENARIOS (standaard de oostkant van Zwolle).
// De demo doorloopt het hele proces, zodat het rapport in de template van Enexis direct gevuld is:
// analyse en openbare feiten zijn echt, de velden die een planoloog invult (eigendom, planregels, stikstof,
// overstromingsrisico, bermbreedte, inpassing) krijgen een FICTIEVE voorbeeldwaarde.
// Met { herbereken: id } wordt een bestaande demo opnieuw doorgerekend en gevuld, met behoud van nummer en instellingen.
// Voorbeeldscenario's in het verzorgingsgebied van Enexis: fictieve zoekgebieden op en rond bedrijventerreinen, elk met een
// ander stationstype. Het eerste is de standaarddemo; kies een ander met { scenario: "groningen" | "eindhoven" | "venlo" | "denbosch-vutter" | "denbosch-maaspoort" | "denbosch-rosmalen" | "zwolle-berkum" }.
/** Zoekcirkel van Enexis als veelhoek: middelpunt [lon, lat] en straal in meters. */
const cirkel = ([lon, lat]: [number, number], straal: number, n = 48): [number, number][] =>
  Array.from({ length: n }, (_, i) => {
    const hoek = (2 * Math.PI * i) / n;
    return [+(lon + (straal * Math.sin(hoek)) / (111320 * Math.cos((lat * Math.PI) / 180))).toFixed(6), +(lat + (straal * Math.cos(hoek)) / 110574).toFixed(6)];
  });

const SCENARIOS = [
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
  // Rond 's-Hertogenbosch: zoekcirkels van 250-300 m op en aan de rand van bestaande bedrijven- en woongebieden.
  {
    id: "denbosch-vutter", naam: "Demo – 's-Hertogenbosch De Vutter", gemeente: "'s-Hertogenbosch", plaats: "De Vutter", stationType: "tvs",
    zoekgebied: cirkel([5.2645, 51.7159], 250),
    aansluitpunt: [5.26581, 51.71706], aangedragen: [5.26443, 51.7163],
  },
  {
    id: "denbosch-maaspoort", naam: "Demo – 's-Hertogenbosch Maaspoort", gemeente: "'s-Hertogenbosch", plaats: "Maaspoort", stationType: "tvs",
    zoekgebied: cirkel([5.296, 51.7187], 300),
    aansluitpunt: [5.29797, 51.7199], aangedragen: [5.29665, 51.71852],
  },
  {
    id: "denbosch-rosmalen", naam: "Demo – Rosmalen Kruisstraat", gemeente: "'s-Hertogenbosch", plaats: "Kruisstraat", stationType: "tvs",
    zoekgebied: cirkel([5.3871, 51.7293], 300),
    aansluitpunt: [5.38923, 51.73058], aangedragen: [5.38674, 51.72957],
  },
  // Zwolle Berkum: zoekcirkel van 250 m rond kadastraal perceel L 2795 (circa 5.400 m², bestemming Bedrijf – Nutsvoorziening).
  // De plaatsing komt uit de analyse zelf; de planoloog-gegevens van deze demo staan in demoInvulling.ts.
  {
    id: "zwolle-berkum", naam: "Demo – Zwolle Berkum", gemeente: "Zwolle", plaats: "Berkum", stationType: "tvs",
    zoekgebied: cirkel([6.10952, 52.47067], 250),
    aansluitpunt: [6.11127, 52.47184], aangedragen: [6.11186, 52.47222],
  },
  {
    id: "venlo", naam: "Demo – Venlo Trade Port", gemeente: "Venlo", plaats: "Trade Port", stationType: "tvrs2",
    zoekgebied: [[6.095, 51.396], [6.122, 51.397], [6.126, 51.386], [6.108, 51.381], [6.094, 51.386]],
    aansluitpunt: [6.106, 51.39], aangedragen: [6.114, 51.3895],
  },
];

export async function POST(req: Request) {
  const { herbereken, scenario } = (await req.json().catch(() => ({}))) as { herbereken?: string; scenario?: string };
  const bestaand = herbereken ? await haal(herbereken) : null;
  if (herbereken && !bestaand?.naam.startsWith("Demo")) return Response.json({ fout: "Alleen een demo-LQS kan opnieuw worden gevuld" }, { status: 400 });
  const sc = SCENARIOS.find((x) => x.id === scenario) ?? SCENARIOS[0];
  if (scenario && sc.id !== scenario) return Response.json({ fout: `Onbekend scenario; kies uit ${SCENARIOS.map((x) => x.id).join(", ")}` }, { status: 400 });
  const plaats = SCENARIOS.find((x) => x.naam === bestaand?.naam)?.plaats ?? (bestaand ? bestaand.naam.replace(/^Demo – /, "") : sc.plaats);
  let l = bestaand ?? await maak({
    naam: sc.naam,
    gemeente: sc.gemeente,
    stationType: sc.stationType,
    planoloog: "Planoloog Enexis",
    uitvoerder: "Demo",
    zoekgebied: { type: "Polygon", coordinates: [[...sc.zoekgebied, sc.zoekgebied[0]]] },
    aansluitpunt: sc.aansluitpunt as [number, number],
    aangedragen: [{ naam: "Aangedragen door gemeente", punt: sc.aangedragen as [number, number] }],
  });
  try {
    // gesimuleerde KLIC-leidingen langs de wegen, tenzij er al een echte levering is ingelezen
    if (!l.klic?.ingelezenOp || l.klic.bron === "simulatie") {
      const sim = await simuleerKlic(l).catch((e) => { console.error("Demo: KLIC-simulatie mislukt", e); return null; });
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
    // uitgewerkte demo: de invulling van de planoloog bij de voorkeurslocatie, de review en het colofon
    const uitwerking = plaats === "Berkum" ? werkBerkumUit(kandidaten, voorkeurId) : null;
    const basis = { ...l, analyse, kandidaten, voorkeurId, voorkeurMotivatie };
    const teksten = maakTeksten(basis);
    teksten.aanleiding += " Dit is een demo: het zoekgebied is fictief, de velden van de planoloog en het AI-voorstel bevatten voorbeeldwaarden en de KLIC-gegevens zijn gesimuleerd.";
    return Response.json(await wijzig(l.id, {
      analyse, kandidaten, voorkeurId, voorkeurMotivatie, teksten, status: "Rapport",
      colofon: uitwerking?.colofon ?? { plaats, projectnummer: "ID000000 (demo)", versie: "V0.1", specialist: "Planoloog Enexis", email: "voor.achternaam@enexis.nl" },
      ...(uitwerking ? { review: uitwerking.review } : {}),
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

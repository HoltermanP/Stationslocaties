import { voerAnalyseUit } from "@/lib/analyse/analyse";
import { verzamelFeiten } from "@/lib/analyse/feiten";
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
// ander stationstype. Het eerste is de standaarddemo; kies een ander met { scenario: "groningen" | "eindhoven" | "venlo" }.
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
  const l = bestaand ?? await maak({
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
    const { analyse, kandidaten: ruw } = await voerAnalyseUit(l);
    const kandidaten = await Promise.all(ruw.map(async (k) => ({ ...k, feiten: await verzamelFeiten(k) })));
    const rang = rangorde(kandidaten, l.gewichten);
    // voorkeur: hoogste score onder de locaties waar de bestemming een nutsvoorziening waarschijnlijk toelaat
    const geschikt = rang.filter((r) => r.geschikt);
    const voorkeurId = (geschikt.find((r) => past(r.k)) ?? geschikt[0])?.k.id ?? null;
    kandidaten.forEach((k, i) => {
      k.sjabloon = voorbeeld(k, i);
      k.sjabloon.velden.notities = `${sjabloonVan({ ...l, analyse, kandidaten, voorkeurId }, k).veld("notities")} Demo: eigendom, planregels, stikstof, overstromingsrisico, bermbreedte en inpassing zijn fictief ingevuld.`;
    });
    const basis = { ...l, analyse, kandidaten, voorkeurId, voorkeurMotivatie: "Van de locaties met een passende bestemming scoort deze het hoogst." };
    const teksten = maakTeksten(basis);
    teksten.aanleiding += " Dit is een demo: het zoekgebied is fictief en de handmatige velden bevatten voorbeeldwaarden.";
    return Response.json(await wijzig(l.id, {
      analyse, kandidaten, voorkeurId, voorkeurMotivatie: basis.voorkeurMotivatie, teksten, status: "Rapport",
      colofon: { plaats, projectnummer: "ID000000 (demo)", versie: "V0.1", specialist: "Planoloog Enexis", email: "voor.achternaam@enexis.nl" },
    }));
  } catch (e) {
    // Zonder kaartdiensten blijft de demo bruikbaar: de analyse is dan vanuit de werkplek te starten.
    console.error("Demo: analyse mislukt", e);
    return Response.json(l);
  }
}

const bestemming = (k: Kandidaat) => (k.feiten?.bestemmingen ?? []).map((b) => `${b.hoofdgroep} ${b.naam}`).join(" ").toLowerCase();
const past = (k: Kandidaat) => /bedrijf|verkeer|maatschappelijk/.test(bestemming(k)) && !/natuur/.test(bestemming(k));

/** Fictieve voorbeeldwaarden voor de velden die een planoloog zelf invult. */
function voorbeeld(k: Kandidaat, i: number): NonNullable<Kandidaat["sjabloon"]> {
  const groep = bestemming(k);
  const groen = /groen|agrarisch|natuur|recreatie/.test(groep);
  const eigenaar = ["Gemeente", "Gemeente", "Bedrijf", "Waterschap", "Particulier", "Gemeente"][i % 6];
  const ruim = i % 3 !== 1;
  const velden: Record<string, string> = {
    gebruik: past(k) ? "Passend binnen het omgevingsplan" : "Niet passend, afwijken nodig (BOPA)",
    bouwen: past(k) ? "Passend onder voorwaarden" : "Niet passend, afwijken nodig (BOPA)",
    grondeigendom: eigenaar,
    stikstof2: "AERIUS-berekening aanlegfase nodig",
    overstroming: "Kleine kans",
    provincie: "Niet van toepassing",
    berm: ruim ? "Berm breder dan 7 m, kabeltracé past naast de rijbaan" : "Berm circa 4 m, tracé deels onder het fietspad",
    inpassing: groen ? "Open groene omgeving: station inpassen met haag en gedekte kleur" : "Sluit aan op bestaande bedrijfsbebouwing; geen bijzondere inpassing nodig",
  };
  const oordelen: Record<string, Oordeel> = { provincie: "groen", berm: ruim ? "groen" : "oranje", inpassing: groen ? "oranje" : "groen" };
  return { velden, oordelen };
}

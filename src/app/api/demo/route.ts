import { voerAnalyseUit } from "@/lib/analyse/analyse";
import { verzamelFeiten } from "@/lib/analyse/feiten";
import { haal, maak, wijzig } from "@/lib/repo";
import { rangorde } from "@/lib/score";
import { sjabloonVan } from "@/lib/sjabloon";
import { maakTeksten } from "@/lib/teksten";
import type { Kandidaat, Oordeel } from "@/lib/types";

export const maxDuration = 180;

// Voorbeeld-LQS: fictief zoekgebied aan de oostkant van Zwolle (verzorgingsgebied Enexis).
// De demo doorloopt het hele proces, zodat het rapport in de template van Enexis direct gevuld is:
// analyse en openbare feiten zijn echt, de velden die een planoloog invult (eigendom, planregels, stikstof,
// overstromingsrisico, bermbreedte, inpassing) krijgen een FICTIEVE voorbeeldwaarde.
// Met { herbereken: id } wordt een bestaande demo opnieuw doorgerekend en gevuld, met behoud van nummer en instellingen.
export async function POST(req: Request) {
  const { herbereken } = (await req.json().catch(() => ({}))) as { herbereken?: string };
  const bestaand = herbereken ? await haal(herbereken) : null;
  if (herbereken && !bestaand?.naam.startsWith("Demo")) return Response.json({ fout: "Alleen een demo-LQS kan opnieuw worden gevuld" }, { status: 400 });
  const l = bestaand ?? await maak({
    naam: "Demo – Zwolle Marslanden",
    gemeente: "Zwolle",
    stationType: "tvs",
    planoloog: "Planoloog Enexis",
    uitvoerder: "Demo",
    zoekgebied: {
      type: "Polygon",
      coordinates: [[[6.1235, 52.5035], [6.1445, 52.5052], [6.1492, 52.4968], [6.1398, 52.4905], [6.1262, 52.4938], [6.1235, 52.5035]]],
    },
    aansluitpunt: [6.1312, 52.4978],
    aangedragen: [{ naam: "Aangedragen door gemeente", punt: [6.1385, 52.4975] }],
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
      colofon: { plaats: "Marslanden", projectnummer: "ID000000 (demo)", versie: "V0.1", specialist: "Planoloog Enexis", email: "voor.achternaam@enexis.nl" },
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

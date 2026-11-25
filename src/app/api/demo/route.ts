import { voerAnalyseUit } from "@/lib/analyse/analyse";
import { verzamelFeiten } from "@/lib/analyse/feiten";
import { zetDemoDataTerug } from "@/lib/db";
import { bestemmingTekst, voorbeeldEigendom, voorbeeldHandmatig, voorbeeldVoorstel } from "@/lib/demoInvulling";
import { DEMO_SCENARIOS, cirkel } from "@/lib/demoScenarios";
import { werkDemoUit } from "@/lib/demoUitwerking";
import { simuleerKlic } from "@/lib/klic/simuleer";
import { haal, lijst, maak, verwijder, wijzig } from "@/lib/repo";
import { rangorde } from "@/lib/score";
import { sjabloonVan } from "@/lib/sjabloon";
import { maakTeksten } from "@/lib/teksten";
import type { Kandidaat, Oordeel } from "@/lib/types";

export const maxDuration = 180;

// Demo-LQS'en. Elke demo doorloopt het hele proces, zodat kaart, locaties, rapport en review direct gevuld zijn:
// - echt: de analyse op openbare bronnen (BAG, BRT, kadastrale kaart, bestemmingen) en de plaatsing van de kavels;
// - gesimuleerd: de KLIC-leidingen (simuleer.ts), die de analyse wel meeweegt;
// - fictief: wat de planoloog en het AI-voorstel invullen (eigendom, planregels, scores, review, colofon).
// Aanroepen:
//   { scenario: id }      maakt de demo aan, of rekent hem opnieuw door als hij al bestaat (geen dubbele demo's)
//   { herbereken: lqsId } rekent een bestaande demo opnieuw door
//   { terugzetten: true } zet de meegeleverde demo's (demo/demo-data.json.gz) terug die ontbreken
//   { opruimen: true }    verwijdert alle demo-LQS'en (naam begint met "Demo")
const isDemo = (naam: string) => naam.startsWith("Demo");
const DAG = 86400000;
const dag = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export async function POST(req: Request) {
  const { herbereken, scenario, terugzetten, opruimen } = (await req.json().catch(() => ({}))) as { herbereken?: string; scenario?: string; terugzetten?: boolean; opruimen?: boolean };
  if (opruimen) {
    const demos = (await lijst()).filter((r) => isDemo(r.naam));
    for (const d of demos) await verwijder(d.id);
    return Response.json({ verwijderd: demos.length });
  }
  if (terugzetten) return Response.json({ toegevoegd: await zetDemoDataTerug() });

  let bestaand = herbereken ? await haal(herbereken) : null;
  if (herbereken && !(bestaand && isDemo(bestaand.naam))) return Response.json({ fout: "Alleen een demo-LQS kan opnieuw worden gevuld" }, { status: 400 });
  const sc = DEMO_SCENARIOS.find((x) => (bestaand ? x.naam === bestaand.naam : x.id === scenario));
  if (!sc) return Response.json({ fout: bestaand ? "Deze demo hoort bij een scenario dat niet meer bestaat" : `Onbekend scenario; kies uit ${DEMO_SCENARIOS.map((x) => x.id).join(", ")}` }, { status: 400 });
  // een scenario dat al bestaat wordt opnieuw doorgerekend in plaats van nog een keer aangemaakt
  if (!bestaand) {
    const rij = (await lijst()).find((r) => r.naam === sc.naam && !r.gearchiveerd);
    if (rij) bestaand = await haal(rij.id);
  }
  const nu = Date.now(), start = dag(nu - sc.gestart * DAG);
  const geometrie = {
    zoekgebied: { type: "Polygon" as const, coordinates: [[...cirkel(sc.centrum, sc.straal), cirkel(sc.centrum, sc.straal)[0]]] },
    aansluitpunt: sc.aansluitpunt,
    aangedragen: [{ naam: "Aangedragen door gemeente", punt: sc.aangedragen }],
  };
  const kop = { naam: sc.naam, gemeente: sc.gemeente, stationType: sc.stationType, planoloog: sc.planoloog, uitvoerder: "Demo", startdatum: start };
  let l = bestaand ? (await wijzig(bestaand.id, { ...geometrie, ...kop, deadline: dag(nu - sc.gestart * DAG + 21 * DAG) })) ?? bestaand : await maak({ ...kop, ...geometrie });
  try {
    // gesimuleerde KLIC-leidingen langs de wegen, tenzij er al een echte levering is ingelezen
    if (!l.klic?.ingelezenOp || l.klic.bron === "simulatie") {
      const sim = await simuleerKlic(l, sc.beheer).catch((e) => { console.error("Demo: KLIC-simulatie mislukt", e); return null; });
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
    // voorkeur: de hoogste score onder de geschikte locaties, na de uitwerking van de planoloog bij de koploper
    const eerste = rangorde(kandidaten, l.gewichten).filter((r) => r.geschikt)[0]?.k.id ?? null;
    const email = sc.netbeheerder === "Enexis" ? "planoloog@voorbeeld-enexis.nl" : "planoloog@voorbeeld-liander.nl";
    const uitwerking = werkDemoUit(kandidaten, eerste, sc.fase, { plaats: sc.plaats, projectnummer: sc.projectnummer, planoloog: sc.planoloog, email, reviewer: `Reviewer ${sc.netbeheerder} (fictief)` });
    const geschikt = rangorde(kandidaten, l.gewichten).filter((r) => r.geschikt);
    const voorkeurId = geschikt[0]?.k.id ?? null;
    const gekozen = geschikt[0], tweede = geschikt[1];
    const voorkeurMotivatie = gekozen
      ? `${gekozen.k.naam} scoort ${gekozen.score} van 100${tweede ? `, tegen ${tweede.score} voor ${tweede.k.naam}` : ""}. ${gekozen.k.auto.perceel?.toelichting ? `Ligging: ${gekozen.k.auto.perceel.toelichting}, ${gekozen.k.auto.weg?.toelichting ?? ""} en ${gekozen.k.auto.ms?.toelichting ?? ""}. ` : ""}${gekozen.k.handmatig.bestemming?.notitie ?? ""} ${gekozen.k.voorstel?.klic.motivatie ?? ""}`.replace(/\s+/g, " ").trim()
      : "Er is geen locatie gevonden die buiten de uitgesloten gebieden valt.";
    kandidaten.forEach((k) => {
      k.sjabloon!.velden.notities = `${sjabloonVan({ ...l, analyse, kandidaten, voorkeurId }, k).veld("notities")} Demo: eigendom, planregels, stikstof, overstromingsrisico, bermbreedte, inpassing, de handmatige scores en het AI-voorstel zijn fictief ingevuld; de KLIC-leidingen zijn gesimuleerd.`;
    });
    const teksten = maakTeksten({ ...l, analyse, kandidaten, voorkeurId, voorkeurMotivatie });
    teksten.aanleiding += ` Dit is een demo in het gebied van ${sc.netbeheerder}: de zoekcirkel is fictief, de velden van de planoloog en het AI-voorstel bevatten voorbeeldwaarden en de KLIC-gegevens zijn gesimuleerd.`;
    return Response.json(await wijzig(l.id, {
      analyse, kandidaten, voorkeurId, voorkeurMotivatie, teksten, status: sc.fase, review: uitwerking.review, colofon: uitwerking.colofon,
      opgeleverdOp: sc.fase === "Opgeleverd" ? dag(nu - sc.gestart * DAG + 17 * DAG) : null,
    }));
  } catch (e) {
    // Zonder kaartdiensten blijft de demo bruikbaar: de analyse is dan vanuit de werkplek te starten.
    console.error("Demo: analyse mislukt", e);
    return Response.json(l);
  }
}

const past = (k: Kandidaat) => /bedrijf|bedrijven|industrie|verkeer|maatschappelijk/.test(bestemmingTekst(k)) && !/natuur/.test(bestemmingTekst(k));

/** Fictieve voorbeeldwaarden voor de velden die een planoloog zelf invult. */
function voorbeeld(k: Kandidaat, i: number): NonNullable<Kandidaat["sjabloon"]> {
  const groen = /groen|agrarisch|natuur|recreatie/.test(bestemmingTekst(k));
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

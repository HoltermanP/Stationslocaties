// Demo: de uitgewerkte invulling van de planoloog bij de voorkeurslocatie, de review en het colofon.
// Alle namen, projectnummers en oordelen zijn FICTIEF; ze laten zien hoe een volledig doorlopen LQS eruitziet.
// Alleen de ligging, de percelen, de bestemming en de afstanden komen uit de analyse en de openbare bronnen zelf.
import { REVIEW_PUNTEN } from "./config";
import type { Colofon, Kandidaat, Lqs } from "./types";

const nl = (n: number) => n.toLocaleString("nl-NL");

export type DemoFase = "Rapport" | "Review" | "Opgeleverd";
export type DemoColofon = { plaats: string; projectnummer: string; planoloog: string; email: string; reviewer: string };

/** Vult de velden van de planoloog in voor de voorkeurslocatie en geeft de review en het colofon terug. */
export function werkDemoUit(kandidaten: Kandidaat[], voorkeurId: string | null, fase: DemoFase, c: DemoColofon): { review: Lqs["review"]; colofon: Colofon } {
  const k = kandidaten.find((x) => x.id === voorkeurId);
  if (k?.sjabloon) {
    const perceel = k.feiten?.percelen[0];
    const bestemmingen = [...new Set((k.feiten?.bestemmingen ?? []).map((b) => b.naam))];
    const best = bestemmingen.join(" en ") || "Groen (nagezocht in het Omgevingsloket, fictief)";
    const past = /bedrij|nuts|verkeer|maatschappelijk/i.test(best) && !/natuur/i.test(best);
    const groen = /groen|agrarisch|recreatie/i.test(best);
    const straat = k.adres?.replace(/^nabij /, "").replace(/ \d+.*$/, "") ?? "de openbare weg";
    const weg = Math.round(Number(k.auto.weg?.waarde ?? 0)), woning = Math.round(Number(k.auto.woningen?.waarde ?? 0));
    const ms = k.auto.ms?.waarde, natura = k.feiten?.natura, trace = k.trace?.lengte;
    const eigenaren = Object.values(k.eigendom ?? {});
    const overheid = eigenaren.length > 0 && eigenaren.every((e) => /gemeente|provincie|waterschap|Rijk/i.test(e.type));
    Object.assign(k.sjabloon.velden, {
      gebruik: past ? `Passend binnen het omgevingsplan: bestemming ${best}` : `Bestemming ${best}: nutsvoorziening tot 50 m² is toegestaan, voor dit station is een omgevingsvergunning met afwijking (BOPA) nodig`,
      bouwen: past ? "Passend: een nutsgebouw is binnen de bestemming toegestaan; bouwvlak en bouwhoogte in de planregels nog toetsen" : "Bouwhoogte 3,7 m past; oppervlakte overschrijdt de vrijstelling voor nutsvoorzieningen, meenemen in de BOPA",
      stikstof2: `AERIUS-berekening aanlegfase nodig${natura ? `; Natura 2000 ${natura.naam} ligt op ${nl(natura.afstand)} m` : ""}`,
      overstroming: "Kleine kans; peilbesluit en keur navragen bij het waterschap",
      provincie: "Niet van toepassing",
      berm: `Berm langs ${straat} breder dan 7 m; kabeltracé${trace ? ` van circa ${nl(trace)} m` : ""} past naast de rijbaan${typeof ms === "number" ? `, liggende MS-kabel op ${nl(ms)} m` : ""}`,
      inpassing: `Aan de rand van perceel ${perceel?.aanduiding ?? "het perceel"}, ${weg} m van de as van de weg en ${woning > 1e5 ? "ver" : `${woning} m`} van de dichtstbijzijnde woning; donkergroen gevelmateriaal (RAL 6009)${groen ? " en een haag rondom, zodat het station opgaat in het groen" : " en een haag aan de wegzijde"}`,
    });
    k.sjabloon.oordelen = { provincie: "groen", berm: "groen", inpassing: "groen" };
    k.handmatig.landschap = { score: 4, ai: false, notitie: `Het station staat aan de rand van het perceel, op ${weg} m van de as van de weg${woning > 1e5 ? "" : ` en ${woning} m van de dichtstbijzijnde woning`}, zodat de rest van het perceel vrij blijft. Groene gevelafwerking en een haag zorgen voor een goede inpassing.` };
    k.handmatig.eigendom = {
      score: overheid ? 4 : 3, ai: false,
      notitie: `Eigendom bij het Kadaster nagegaan (fictief in de demo): ${eigenaren.map((e) => e.naam).join(", ") || "eigenaar onbekend"}. De kavel ligt op ${k.feiten?.percelen.length === 1 ? "één perceel" : `${k.feiten?.percelen.length ?? 0} percelen`}; een kadastrale uitsplitsing en ${overheid ? "een koopovereenkomst met de overheid" : "een koopovereenkomst of opstalrecht"} zijn nodig. ${overheid ? "De gemeente heeft ambtelijk aangegeven mee te willen werken." : "Het eerste gesprek met de eigenaar staat gepland."}`,
    };
    if (!past) k.handmatig.procedure = { score: 3, ai: false, notitie: `Omgevingsvergunning met buitenplanse afwijking (BOPA), reguliere procedure van acht weken. De gemeente heeft ambtelijk aangegeven mee te werken (fictief)${natura ? `; voor de aanlegfase is een AERIUS-berekening nodig (Natura 2000 ${natura.naam} op ${nl(natura.afstand)} m)` : ""}.` };
    if (k.handmatig.bestemming && !past) k.handmatig.bestemming = { score: Math.max(3, k.handmatig.bestemming.score ?? 3), ai: false, notitie: `Bestemming ${best}. De gemeente werkt naar verwachting mee aan een BOPA voor een nutsvoorziening op deze plek; dit is ambtelijk voorbesproken (fictief).` };
  }
  const opmerkingen: Record<string, string> = {
    zoekgebied: "Zoekcirkel komt overeen met de aanlevering van Asset Management (fictief).",
    bronnen: "Alle kaartlagen zijn geladen.",
    aangedragen: "De aangedragen locatie van de gemeente is meegewogen en staat in de rangorde.",
    omgevingsplan: "Bestemmingen van de kandidaten nagelopen in het Omgevingsloket.",
    klic: "Gesimuleerde KLIC-levering beoordeeld; er ligt niets binnen de kavel van de voorkeurslocatie. Vervangen door de echte levering voor definitief gebruik.",
    streetview: "Luchtfoto beoordeeld; controle ter plaatse volgt bij het veldbezoek.",
    scores: "Alle vijf handmatige criteria zijn gescoord en gemotiveerd.",
    ai: "Overgenomen AI-voorstellen nagelopen aan de hand van de controlepunten.",
    voorkeur: "Voorkeur en motivatie zijn navolgbaar en volgen uit de scores.",
    pve: fase === "Opgeleverd" ? "Toegangsweg, vrije hoogte en draagkracht van de ondergrond ter plaatse gecontroleerd." : "Toegangsweg met 5 m vrije hoogte en draagkracht van de ondergrond moeten nog ter plaatse worden gecontroleerd.",
    template: fase === "Opgeleverd" ? "Rapport is volledig en conform de template." : "",
  };
  const akkoord = (id: string) => fase === "Opgeleverd" || (fase === "Review" && !["pve", "template"].includes(id));
  return {
    review: {
      reviewer: fase === "Rapport" ? "" : c.reviewer,
      items: REVIEW_PUNTEN.map((p) => ({ id: p.id, akkoord: akkoord(p.id), opmerking: akkoord(p.id) || (fase === "Review" && p.id === "pve") ? opmerkingen[p.id] ?? "" : "" })),
    },
    colofon: { plaats: c.plaats, projectnummer: c.projectnummer, versie: fase === "Opgeleverd" ? "V1.0" : fase === "Review" ? "V0.9" : "V0.5", specialist: c.planoloog, email: c.email },
  };
}

// Demo Zwolle Berkum: de uitgewerkte invulling van de planoloog bij de voorkeurslocatie, de review en het colofon.
// Alle namen, aantallen en oordelen zijn FICTIEF; ze laten zien hoe een volledig doorlopen LQS eruitziet.
// Alleen de ligging, de percelen, de bestemming en de afstanden komen uit de analyse en de openbare bronnen zelf.
import { REVIEW_PUNTEN } from "./config";
import type { Colofon, Kandidaat, Lqs } from "./types";

const nl = (n: number) => n.toLocaleString("nl-NL");

/** Vult de velden van de planoloog in voor de voorkeurslocatie en geeft de review en het colofon terug. */
export function werkBerkumUit(kandidaten: Kandidaat[], voorkeurId: string | null): { review: Lqs["review"]; colofon: Colofon } {
  const k = kandidaten.find((x) => x.id === voorkeurId);
  if (k?.sjabloon) {
    const perceel = k.feiten?.percelen[0];
    const straat = k.adres?.replace(/^nabij /, "").replace(/ \d+.*$/, "") ?? "de openbare weg";
    const weg = Math.round(Number(k.auto.weg?.waarde ?? 0)), woning = Math.round(Number(k.auto.woningen?.waarde ?? 0));
    const natura = k.feiten?.natura;
    const tracé = k.trace?.lengte;
    Object.assign(k.sjabloon.velden, {
      gebruik: "Passend binnen het omgevingsplan: bestemming Bedrijf – Nutsvoorziening",
      bouwen: "Passend: een nutsgebouw is binnen de bestemming toegestaan; bouwvlak en bouwhoogte in de planregels nog toetsen",
      stikstof2: `AERIUS-berekening aanlegfase nodig${natura ? `; Natura 2000 ${natura.naam} ligt op ${nl(natura.afstand)} m` : ""}`,
      overstroming: "Kleine kans; peilbesluit en keur navragen bij het waterschap",
      provincie: "Niet van toepassing",
      berm: `Berm langs ${straat} breder dan 7 m; kabeltracé${tracé ? ` van circa ${nl(tracé)} m` : ""} past naast de rijbaan`,
      inpassing: `Aan de rand van perceel ${perceel?.aanduiding ?? "het perceel"}, ${weg} m van de weg en ${woning} m van de dichtstbijzijnde woning; donkergroen gevelmateriaal (RAL 6009) en een haag aan de padzijde`,
    });
    k.sjabloon.oordelen = { provincie: "groen", berm: "groen", inpassing: "groen" };
    const hand = k.handmatig;
    hand.landschap = { score: 4, ai: false, notitie: `Het station staat aan de rand van het perceel, op ${weg} m van de weg en ${woning} m van de dichtstbijzijnde woning, zodat de rest van het perceel open blijft. Een haag aan de padzijde en groene gevelafwerking zorgen voor goede inpassing.` };
    hand.eigendom = {
      score: 3, ai: false,
      notitie: `Eigendom bij het Kadaster nagegaan (fictief in de demo): ${Object.values(k.eigendom ?? {}).map((e) => e.naam).join(", ") || "eigenaar onbekend"}. De kavel van 360 m² ligt volledig op één perceel; kadastrale uitsplitsing en een koopovereenkomst of opstalrecht zijn nodig. Eerste gesprek met de eigenaar staat gepland.`,
    };
  }
  const opmerkingen: Record<string, string> = {
    zoekgebied: "Zoekcirkel van 250 m komt overeen met de aanlevering van Asset Management (fictief).",
    aangedragen: "Locatie van de gemeente ligt in een groenstrook naast woningen; die scoort lager op afstand en bestemming.",
    omgevingsplan: "Bestemmingen nagelopen in het Omgevingsloket: Bedrijf – Nutsvoorziening op het doelperceel.",
    klic: "Gesimuleerde KLIC-levering beoordeeld; er ligt niets binnen de kavel. Vervangen door de echte levering voor definitief gebruik.",
    streetview: "Luchtfoto beoordeeld; Street View-controle ter plaatse volgt bij het veldbezoek.",
    scores: "Alle vijf handmatige criteria zijn gescoord en gemotiveerd.",
    ai: "Overgenomen AI-voorstellen nagelopen aan de hand van de controlepunten.",
    voorkeur: "Voorkeur en motivatie zijn navolgbaar en volgen uit de scores.",
    pve: "Toegangsweg met 5 m vrije hoogte en draagkracht van de ondergrond moeten nog ter plaatse worden gecontroleerd.",
  };
  return {
    review: {
      reviewer: "Reviewer Enexis (fictief)",
      items: REVIEW_PUNTEN.map((p) => ({ id: p.id, akkoord: !["pve", "template"].includes(p.id), opmerking: opmerkingen[p.id] ?? "" })),
    },
    colofon: { plaats: "Berkum", projectnummer: "ID240517 (demo)", versie: "V1.0", specialist: "A. de Vries (planoloog, fictief)", email: "a.devries@voorbeeld.nl" },
  };
}

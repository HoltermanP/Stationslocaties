// Demo: de gegevens die in de praktijk de planoloog (eigendom, handmatige scores) en het AI-voorstel (score, motivatie,
// zekerheid, controlepunten) zouden invullen. Alles is afgeleid uit de feiten en analyse van de kandidaat zelf, met vaste regels
// in plaats van een aanroep naar het model, zodat de demo ook zonder API-sleutel een gevuld dossier laat zien.
// De namen van eigenaren zijn FICTIEF; eigendomstypen, scores en motivaties zijn een voorbeeld, geen Kadasterinformatie.
import { EIGENAAR_TYPEN } from "./config";
import type { HandScore, Kandidaat, Voorstel } from "./types";

const [GEMEENTE, OVERHEID, NETBEHEERDER, BEDRIJF, PARTICULIER] = EIGENAAR_TYPEN;
const nl = (n: number) => n.toLocaleString("nl-NL");
const klem = (n: number) => Math.min(5, Math.max(1, Math.round(n)));

/** Bestemmingen van de kandidaat als één kleine-lettertekst, voor het herkennen van het type bestemming. */
export const bestemmingTekst = (k: Kandidaat) => (k.feiten?.bestemmingen ?? []).map((b) => `${b.hoofdgroep} ${b.naam}`).join(" ").toLowerCase();

const typeBestemming = (k: Kandidaat) => {
  const t = bestemmingTekst(k);
  return /natuur|bos/.test(t) ? "natuur" : /agrarisch/.test(t) ? "agrarisch" : /bedrijf|bedrijven|industrie/.test(t) ? "bedrijf" : /verkeer|maatschappelijk|nutsvoorziening/.test(t) ? "verkeer" : /groen|recreatie|sport/.test(t) ? "groen" : /wonen|woon|gemengd|centrum/.test(t) ? "wonen" : /water/.test(t) ? "water" : "onbekend";
};

/** Eigenaar per kadastraal perceel onder de kavel, zoals het Kadaster dat zou leveren (namen fictief). */
export function voorbeeldEigendom(k: Kandidaat, gemeente: string): NonNullable<Kandidaat["eigendom"]> {
  const soort = typeBestemming(k);
  const uit: NonNullable<Kandidaat["eigendom"]> = {};
  (k.feiten?.percelen ?? []).forEach((p, i) => {
    const woon = (p.gebruik ?? []).some((g) => /woon/i.test(g));
    const onbebouwdLang = !p.panden && p.vorm === "langgerekt";
    uit[p.aanduiding] =
      woon || soort === "wonen" || soort === "agrarisch" ? { type: PARTICULIER, naam: "Particuliere eigenaar (naam bij het Kadaster)" }
      : soort === "water" ? { type: OVERHEID, naam: "Waterschap (fictief)" }
      : soort === "bedrijf" && !onbebouwdLang ? { type: BEDRIJF, naam: i % 2 ? "Voorbeeld Logistiek B.V." : "Voorbeeld Vastgoed B.V." }
      : { type: GEMEENTE, naam: `Gemeente ${gemeente || "(demo)"}` };
  });
  return uit;
}

const typenVan = (k: Kandidaat) => [...new Set(Object.values(k.eigendom ?? {}).map((e) => e.type).filter(Boolean))];

/** Wat het AI-voorstel zou opleveren voor de vijf handmatige criteria. */
export function voorbeeldVoorstel(k: Kandidaat): Record<string, Voorstel> {
  const f = k.feiten;
  const soort = typeBestemming(k);
  const namen = [...new Set((f?.bestemmingen ?? []).map((b) => b.naam))];
  const dubbel = (f?.dubbelbestemmingen ?? []).map((d) => d.naam);
  const arch = dubbel.some((d) => /archeolog/i.test(d));
  const natuurDichtbij = !!f?.natura && f.natura.afstand < 500;
  const v: Record<string, Voorstel> = {};

  // 1. Planologische inpasbaarheid
  const basis = { bedrijf: 5, verkeer: 4, groen: 3, wonen: 2, agrarisch: 2, water: 2, natuur: 1, onbekend: null }[soort];
  const bScore = basis === null ? null : klem(basis - (dubbel.length ? 1 : 0));
  v.bestemming = {
    score: bScore,
    motivatie: !namen.length ? "Er is voor deze locatie geen bestemming gevonden in de landelijke voorziening."
      : bScore === null ? `De kavel ligt in de bestemming ${namen.join(" en ")}. Of een nutsvoorziening daar past is niet uit de naam van de bestemming op te maken.`
      : `De kavel ligt in de bestemming ${namen.join(" en ")}${dubbel.length ? ` met dubbelbestemming ${dubbel.join(", ")}` : ""}. ${bScore && bScore >= 4 ? "Een nutsvoorziening is binnen deze bestemming doorgaans toegestaan." : bScore === 3 ? "Een nutsvoorziening is binnen deze bestemming vaak toegestaan, maar kan om een afwijking of voorwaarden vragen." : "Een nutsvoorziening past hier waarschijnlijk niet zonder afwijking van het plan."}`,
    zekerheid: "midden",
    controleer: "Lees de planregels en het actuele omgevingsplan na in het Omgevingsloket: de aangeleverde bestemmingen geven de stand van vóór de Omgevingswet.",
  };

  // 2. Eigendom en verwerving
  const typen = typenVan(k);
  const perPerceel = Object.values(k.eigendom ?? {});
  const eScore = !perceelAantal(k) ? null : klem(
    Math.min(...(typen.length ? typen : [PARTICULIER]).map((t) => (t === NETBEHEERDER ? 5 : t === GEMEENTE || t === OVERHEID ? 4 : t === BEDRIJF ? 3 : 2)))
    - (typen.length > 1 || perceelAantal(k) > 1 ? 1 : 0),
  );
  v.eigendom = {
    score: eScore,
    motivatie: !perceelAantal(k) ? "Er is geen kadastraal perceel gevonden onder de kavel."
      : `De kavel ligt op ${perceelAantal(k)} perceel${perceelAantal(k) > 1 ? "len" : ""} (${(f?.percelen ?? []).map((p) => p.aanduiding).join(", ")}) van ${typen.join(" en ") || "onbekende eigenaren"}${perPerceel.length ? ` (${perPerceel.map((e) => e.naam).join(", ")})` : ""}. ${eScore && eScore >= 4 ? "Verwerving bij een overheid verloopt doorgaans het snelst." : eScore === 3 ? "Verwerving bij een bedrijf vraagt een koopovereenkomst en kan langer duren." : "Verwerving bij een particulier of meerdere partijen is onzeker en traag."}`,
    zekerheid: typen.length ? "midden" : "laag",
    controleer: "Vraag de eigendomsinformatie op bij het Kadaster en controleer of de kavel een perceelsplitsing vraagt.",
  };

  // 3. Landschappelijke en stedenbouwkundige inpassing
  const woning = k.auto.woningen?.waarde;
  const dichtBijWoning = woning !== null && woning !== undefined && woning < 50;
  const lScore = klem((soort === "bedrijf" ? 4 : soort === "verkeer" ? 4 : soort === "groen" || soort === "agrarisch" ? 3 : 2) - (dichtBijWoning ? 1 : 0));
  v.landschap = {
    score: lScore,
    motivatie: `${soort === "bedrijf" ? "De locatie ligt op een bedrijventerrein, waar een station aansluit op de bestaande bebouwing." : soort === "groen" || soort === "agrarisch" ? "De locatie ligt in een open groene omgeving: het station is hier beter zichtbaar en vraagt om inpassing met beplanting en een gedekte kleur." : "De locatie ligt in bestaand stedelijk gebied."}${dichtBijWoning ? ` De dichtstbijzijnde woning ligt op ${nl(woning!)} m, wat het zicht en de beleving raakt.` : ""}`,
    zekerheid: "laag",
    controleer: "Beoordeel de inpassing zelf op de luchtfoto en in Street View; de score is een inschatting op bestemming en bebouwing.",
  };

  // 4. Kabels en leidingen (KLIC)
  const lei = k.leidingen ?? [];
  const inKavel = lei.filter((x) => x.inKavel);
  const dichtst = lei.length ? Math.min(...lei.map((x) => x.afstand)) : null;
  const hoogDruk = inKavel.some((x) => /hoge ?druk/i.test(x.laag));
  v.klic = {
    score: !lei.length ? null : inKavel.length ? (hoogDruk ? 1 : 2) : dichtst !== null && dichtst >= 20 ? 5 : 4,
    motivatie: !lei.length ? "Er zijn geen kabel- en leidinggegevens geladen, dus de ligging ten opzichte van de kavel is niet te beoordelen."
      : inKavel.length ? `Binnen de kavel liggen ${inKavel.map((x) => x.laag.replace(/^KLIC /, "").replace(/ \(gesimuleerd\)/, "").toLowerCase()).join(", ")}; die moeten worden verlegd of ontzien.`
      : `Er liggen geen aangeleverde kabels of leidingen binnen de kavel; de dichtstbijzijnde ligt op ${nl(Math.round(dichtst ?? 0))} m van het midden.`,
    zekerheid: "midden",
    controleer: "Raadpleeg de KLIC-melding en controleer of alle netbeheerders hebben aangeleverd. In deze demo zijn de leidingen gesimuleerd.",
  };

  // 5. Vergunbaarheid en procedurerisico
  const af = (bScore ?? 3) + (natuurDichtbij ? -1 : 0) + (arch ? -1 : 0) + ((k.auto.aandacht?.score ?? 5) <= 2 ? -1 : 0);
  const pScore = klem(Math.min(af, 4));
  v.procedure = {
    score: bScore === null ? null : pScore,
    motivatie: `${pScore >= 4 ? "De procedure is naar verwachting beheersbaar" : pScore === 3 ? "De procedure vraagt extra onderzoek of afstemming" : "De procedure is naar verwachting zwaar"}: ${[bScore !== null && bScore <= 3 ? "het plan vraagt mogelijk een afwijking" : "", natuurDichtbij ? `Natura 2000 ${f!.natura!.naam} ligt op ${nl(f!.natura!.afstand)} m` : "", arch ? "archeologische dubbelbestemming" : "", "voor de aanlegfase is een AERIUS-berekening nodig"].filter(Boolean).join("; ")}.`,
    zekerheid: "midden",
    controleer: "Stem de aanpak af met de gemeente en controleer stikstof (AERIUS, aanlegfase), natuur en archeologie bij het bevoegd gezag.",
  };
  return v;
}

const perceelAantal = (k: Kandidaat) => k.feiten?.percelen.length ?? 0;

/**
 * Wat de planoloog in de werkplek zou doen: bestemming, kabels en procedure neemt de planoloog over uit het voorstel (ai: true);
 * eigendom en inpassing beoordeelt de planoloog zelf (het voorstel blijft ernaast staan en kan nog worden overgenomen).
 */
export function voorbeeldHandmatig(v: Record<string, Voorstel>, inpassing: string): Record<string, HandScore> {
  const over = (id: string): HandScore => ({ score: v[id]?.score ?? null, notitie: v[id]?.motivatie ?? "", ai: !!v[id]?.score });
  return {
    bestemming: over("bestemming"),
    klic: over("klic"),
    procedure: over("procedure"),
    eigendom: { score: v.eigendom?.score ?? null, notitie: `Eigendom bij het Kadaster nagegaan (fictief in de demo). ${v.eigendom?.motivatie ?? ""}`.trim(), ai: false },
    landschap: { score: v.landschap?.score ?? null, notitie: inpassing, ai: false },
  };
}

import { AUTO_CRITERIA, HAND_CRITERIA, STATION_TYPEN } from "./config";
import { ha, rangorde } from "./score";
import { sjabloonVan } from "./sjabloon";
import type { Lqs } from "./types";

/** Uniforme concepttekst per rapportsectie, afgeleid uit de analyseresultaten. De planoloog vult aan en redigeert. */
export function maakTeksten(l: Lqs): Record<string, string> {
  const a = l.analyse;
  const type = (STATION_TYPEN.find((t) => t.id === l.stationType)?.naam ?? l.stationType).split(" (")[0];
  const kavel = `${l.kavelB.toLocaleString("nl-NL")} × ${l.kavelL.toLocaleString("nl-NL")} m`;
  const t: Record<string, string> = {};
  t.aanleiding = `Enexis Netbeheer wil ${l.gemeente ? `in de gemeente ${l.gemeente} ` : ""}een nieuw middenspanningsstation realiseren (${type.toLowerCase()}, benodigde kavel circa ${kavel}). Deze Locatie QuickScan (${l.code}) brengt binnen het door Asset Management aangeleverde zoekgebied de ruimtelijke en nettechnische mogelijkheden en beperkingen in beeld en adviseert over een voorkeurslocatie. De LQS is een bureaustudie; afstemming met het bevoegd gezag volgt daarna.`;
  if (!a) return t;
  const pct = (m2: number) => ((100 * m2) / a.oppZoekgebiedM2).toFixed(0);
  t.zoekgebied = `Het zoekgebied "${l.naam}" heeft een oppervlakte van ${ha(a.oppZoekgebiedM2)}.${l.aansluitpunt ? " Voor de nettechnische beoordeling is het aangeleverde aansluitpunt als referentie gebruikt." : " Er is geen aansluitpunt aangeleverd; voor de nettechnische beoordeling is het zwaartepunt van het zoekgebied als referentie gebruikt."}${l.aangedragen.length ? ` Vooraf zijn ${l.aangedragen.length} locatie(s) aangedragen (${l.aangedragen.map((x) => x.naam).join(", ")}); deze zijn in de afweging meegenomen.` : ""} De complexiteit van deze LQS is ingeschat als ${a.complexiteit.klasse.toLowerCase()}.`;
  const uit = a.lagen.filter((x) => x.soort === "uitsluiten" && x.status === "ok" && x.pct >= 0.5).sort((p, q) => q.pct - p.pct);
  const aand = a.lagen.filter((x) => x.soort === "aandacht" && x.status === "ok" && x.pct >= 0.5);
  const fout = a.lagen.filter((x) => x.status === "fout");
  t.analyse = `Het zoekgebied is getoetst aan ${a.lagen.filter((x) => x.soort !== "uit").length} kaartlagen. ${uit.length ? `De grootste beperkingen komen voort uit ${uit.slice(0, 4).map((x) => `${x.naam.toLowerCase()} (${x.pct.toFixed(0)}%${x.buffer ? `, inclusief ${x.buffer} m buffer` : ""})`).join(", ")}.` : "Er zijn geen uitsluitende belemmeringen van betekenis gevonden."} In totaal is ${pct(a.uitgeslotenM2)}% van het zoekgebied (${ha(a.uitgeslotenM2)}) ongeschikt.${aand.length ? ` Als aandachtsgebied zijn aangemerkt: ${aand.map((x) => `${x.naam.toLowerCase()} (${x.pct.toFixed(0)}%)`).join(", ")}; hier is realisatie niet uitgesloten maar gelden aanvullende eisen of onderzoeksplichten.` : ""}${fout.length ? ` Let op: de bron(nen) ${fout.map((x) => x.naam).join(", ")} waren tijdens de analyse niet beschikbaar en zijn niet meegewogen.` : ""}`;
  t.kansrijk = `Na aftrek van de ongeschikte delen resteert ${ha(a.vrijM2)} (${pct(a.vrijM2)}%). Daarvan is ${ha(a.inpasbaarM2)} zodanig van vorm en omvang dat de kavel van ${kavel} inpasbaar is. Binnen deze ruimte zijn ${l.kandidaten.filter((k) => k.bron === "analyse").length} kansrijke locaties geselecteerd, onderling gespreid over het zoekgebied.`;
  const rang = rangorde(l.kandidaten, l.gewichten);
  if (rang.length) {
    t.afweging = `De locaties zijn beoordeeld op ${AUTO_CRITERIA.length} automatisch bepaalde en ${HAND_CRITERIA.length} door de planoloog beoordeelde criteria, elk op een schaal van 1 tot 5 en gewogen opgeteld tot een score van 0 tot 100. ` +
      rang.map((r) => `${r.k.naam}${r.k.adres ? ` (${r.k.adres})` : ""} scoort ${r.score}${r.k.inUitgesloten.length ? `, maar valt af: ligt in ${r.k.inUitgesloten.join(", ").toLowerCase()}` : ""}.`).join(" ");
    const v = l.kandidaten.find((k) => k.id === l.voorkeurId) ?? rang[0].k;
    const sterk = AUTO_CRITERIA.filter((c) => v.auto[c.id]?.score >= 4).map((c) => v.auto[c.id].toelichting);
    t.advies = `Geadviseerd wordt ${v.naam}${v.adres ? ` (${v.adres})` : ""} als voorkeurslocatie aan te houden (RD ${v.rd[0]}, ${v.rd[1]}).${sterk.length ? ` Sterke punten: ${sterk.join("; ")}.` : ""}${v.trace ? ` Het kabeltracé naar ${v.trace.doel} is circa ${v.trace.lengte.toLocaleString("nl-NL")} m, waarvan ${v.trace.langsWeg.toLocaleString("nl-NL")} m langs de openbare weg${v.trace.boring ? ` en ${v.trace.boring} m als boring` : ""}; de aanleg daarvan is geraamd op € ${v.trace.kosten.toLocaleString("nl-NL")} (indicatie op basis van kengetallen).` : ""}${l.voorkeurMotivatie ? ` ${l.voorkeurMotivatie}` : ""}`;
    // Enexis-template, hoofdstuk Advies: ruimtelijke inpassing van de voorkeurslocatie
    const sv = sjabloonVan(l, v);
    t.inpassing = [
      `De voorkeurslocatie ligt ${v.adres ?? "binnen het zoekgebied"}.`,
      sv.veld("grondgebruik") && !/^overig/i.test(sv.veld("grondgebruik")) && `Het huidige grondgebruik is ${sv.veld("grondgebruik").toLowerCase()}.`,
      sv.veld("regels") && `Regels op de kaart: ${sv.veld("regels")}.`,
      sv.veld("geluid") && `${sv.veld("geluid")}.`,
      sv.veld("inpassing") && `${sv.veld("inpassing").replace(/\.$/, "")}.`,
    ].filter(Boolean).join(" ");
    const zwak = [...AUTO_CRITERIA.filter((c) => v.auto[c.id]?.score <= 2).map((c) => v.auto[c.id].toelichting), ...HAND_CRITERIA.filter((c) => (v.handmatig[c.id]?.score ?? 5) <= 2).map((c) => `${c.naam.toLowerCase()}: ${v.handmatig[c.id].notitie || "lage score"}`)];
    t.vervolg = `${zwak.length ? `Aandachtspunten bij de voorkeurslocatie: ${zwak.join("; ")}. ` : ""}Vervolgstappen: toetsing door de interne disciplines van Enexis, afstemming met de gemeente${l.gemeente ? ` ${l.gemeente}` : ""} en eventuele andere bevoegde gezagen, verificatie van eigendom en kabels en leidingen ter plaatse, en nadere uitwerking van de locatie.`;
  }
  return t;
}

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { HAND_CRITERIA, STATION_TYPEN } from "./config";
import type { Lqs, Voorstel } from "./types";

const Beoordeling = z.object({
  score: z.number().nullable().describe("1 (ongunstig) t/m 5 (gunstig), of null als de feiten geen oordeel dragen"),
  motivatie: z.string().describe("Maximaal twee zinnen, uitsluitend gebaseerd op de aangeleverde feiten"),
  zekerheid: z.enum(["hoog", "midden", "laag"]),
  controleer: z.string().describe("Wat de planoloog zelf nog moet nagaan, en waar"),
});
const Uitvoer = z.object({
  locaties: z.array(
    z.object({
      id: z.string(),
      bestemming: Beoordeling,
      eigendom: Beoordeling,
      landschap: Beoordeling,
      klic: Beoordeling,
      procedure: Beoordeling,
    }),
  ),
});

const SYSTEEM = `Je ondersteunt een planoloog bij een Locatie QuickScan (LQS) voor een nieuw middenspanningsstation van een Nederlandse netbeheerder. Een LQS is een bureaustudie: binnen een zoekgebied worden kandidaatlocaties vergeleken en volgt een advies voor een voorkeurslocatie. Jouw uitvoer is een voorstel; de planoloog beslist en is verantwoordelijk voor het rapport.

Je krijgt per kandidaatlocatie de feiten die automatisch zijn opgehaald: bestemmingen uit de landelijke voorziening Ruimtelijke plannen, kadastrale percelen onder de kavel, grondgebruik volgens de topografische kaart, en de uitkomsten van de ruimtelijke analyse (afstanden, geraakte aandachtsgebieden). Beoordeel elke locatie op vijf criteria, elk op een schaal van 1 (ongunstig) tot 5 (gunstig):

- bestemming: planologische inpasbaarheid. Past een nutsvoorziening van deze omvang binnen de geldende bestemming, of is afwijken of een planwijziging nodig? Bestemmingen als Bedrijf, Bedrijventerrein, Maatschappelijk en Verkeer laten nutsvoorzieningen vaker toe dan Wonen, Natuur of Agrarisch met waarden, maar de planregels zijn bepalend en die heb je niet gelezen. Weeg dubbelbestemmingen (archeologie, waterstaat, leidingen) mee.
- eigendom: eigendom en verwerving. Per perceel onder de kavel staat het type eigenaar zoals dat bij het Kadaster is opgevraagd, of "niet opgevraagd". Is het type bekend, baseer je oordeel daar dan op: grond van de netbeheerder zelf is het gunstigst, daarna gemeente en andere overheden, daarna een bedrijf; een particulier of meerdere eigenaren maakt verwerving onzekerder en trager. Is het type niet opgevraagd, schat dan zelf in wat voor eigenaar waarschijnlijk is en hoe lastig verwerving wordt, op basis van de kenmerken van het perceel: de bebouwing en het gebruik daarvan (woonfunctie wijst op een particulier, industrie- of kantoorfunctie op een bedrijf, onbebouwd laat meer open), de vorm (een langgerekt, onbebouwd perceel langs weg of water is vaak van gemeente, waterschap of Rijk), de bestemming en het grondgebruik (Verkeer, Groen en openbare ruimte zijn meestal van de gemeente; agrarisch grasland of akkerland meestal van een agrariër), de grootte, en het deel van het perceel dat de kavel inneemt (een klein deel van een groot perceel vraagt splitsing, maar laat de eigenaar zijn gebruik houden; een kavel die het hele perceel of een bebouwd perceel nodig heeft is zwaarder). Een kavel over meerdere percelen betekent meestal meerdere partijen. Geef bij zo'n inschatting altijd een score, noem in de motivatie dat het een inschatting op perceelkenmerken is en welk type eigenaar je aanneemt, houd de zekerheid op "laag" of hooguit "midden", en noem bij "controleer" de eigendomsinformatie van het Kadaster. Alleen als er geen perceel is gevonden geef je geen score.
- landschap: landschappelijke en stedenbouwkundige inpassing. Een station is een functioneel gebouw met hekwerk. Op een bedrijventerrein valt het weg; in open landschap, bij woningen, bos of erfgoed vraagt het inpassing.
- klic: kabels en leidingen. Per locatie staat bij "kabels_en_leidingen" voor elke aangeleverde laag de afstand tot het midden van de kavel en of de laag binnen de kavel ligt. Het net van de netbeheerder zelf wordt rechtstreeks aangeleverd; kabels en leidingen van derden alleen via een KLIC-levering. De velden "net_van_netbeheerder_geladen" en "klic_van_derden_geladen" zeggen welke van de twee er zijn. Een kabel of leiding binnen de kavel is ongunstig, omdat die verlegd of ontzien moet worden; een vrije kavel is gunstig. Staan er namen in "klic_netbeheerders_zonder_aanlevering", dan ontbreken de netten van die beheerders in de KLIC-levering: noem dat bij "controleer" en geef geen zekerheid "hoog". Is geen van beide geladen, geef dan geen score. Is alleen het eigen net geladen, dan is het beeld onvolledig: geef hooguit zekerheid "midden" en noem bij "controleer" de KLIC-melding voor leidingen van derden.
- procedure: vergunbaarheid en procedurerisico. Leid dit af uit de planologische inpasbaarheid, dubbelbestemmingen, nabijheid van woningen (zienswijzen) en geraakte aandachtsgebieden.

Geef alleen een score als de feiten die dragen. Dragen ze geen oordeel, geef dan score null en beschrijf bij "controleer" wat de planoloog moet nagaan. Een onzekere gok helpt de planoloog niet; een duidelijke controle-instructie wel. Zekerheid "hoog" is alleen gepast als het oordeel rechtstreeks uit de feiten volgt.

Gebruik het hele bereik van de schaal en scoor de locaties ten opzichte van elkaar consistent: gelijke feiten geven gelijke scores. Schrijf de motivatie zakelijk en concreet, in gewone Nederlandse zinnen, en noem de feiten waarop je steunt (bijvoorbeeld de naam van de bestemming of het aantal percelen). De motivatie komt in het rapport te staan als de planoloog het voorstel overneemt.

Bij "controleer" voor bestemming hoort altijd dat de planregels en het actuele omgevingsplan in het Omgevingsloket worden nagelezen, omdat de aangeleverde bestemmingen de stand van vóór de Omgevingswet weergeven.`;

export const aiBeschikbaar = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

/** Vraagt per kandidaat een voorstel voor de vijf handmatige criteria. Geeft een map kandidaat-id → criterium → voorstel. */
export async function vraagVoorstellen(l: Lqs): Promise<Record<string, Record<string, Voorstel>>> {
  const type = STATION_TYPEN.find((t) => t.id === l.stationType)?.naam ?? l.stationType;
  // Alleen openbare feiten en analyse-uitkomsten gaan naar het model; aangeleverde geodata en namen van vertrouwelijke lagen niet.
  const vertrouwelijk = new Set(l.eigenLagen.filter((e) => e.vertrouwelijk).map((e) => e.naam));
  const schoon = (t: string) => [...vertrouwelijk].reduce((s, n) => s.split(n).join("vertrouwelijke laag"), t);
  const invoer = {
    opgave: { station: type, kavel: `${l.kavelB} x ${l.kavelL} m`, gemeente: l.gemeente || "onbekend" },
    net_van_netbeheerder_geladen: l.eigenLagen.some((e) => e.functie === "net"),
    klic_van_derden_geladen: l.eigenLagen.some((e) => e.functie === "leidingen"),
    klic_netbeheerders_zonder_aanlevering: (l.klic?.netbeheerders ?? []).filter((n) => n.geleverd === false).map((n) => n.naam),
    locaties: l.kandidaten.map((k) => ({
      id: k.id,
      naam: k.naam,
      herkomst: k.bron === "aangedragen" ? "vooraf aangedragen" : "uit de analyse",
      adres: k.adres ?? "onbekend",
      ligt_in_uitgesloten_gebied: k.inUitgesloten.map(schoon),
      analyse: Object.fromEntries(Object.entries(k.auto).map(([c, a]) => [c, schoon(a.toelichting)])),
      bestemmingen: k.feiten?.bestemmingen.map((b) => ({ naam: b.naam, hoofdgroep: b.hoofdgroep, plan: b.plan, status: b.status })) ?? [],
      dubbelbestemmingen: k.feiten?.dubbelbestemmingen.map((b) => b.naam) ?? [],
      gebiedsaanduidingen: k.feiten?.gebiedsaanduidingen ?? [],
      // Alleen het type eigenaar gaat mee; namen zijn persoonsgegevens en blijven in de eigen database.
      kadastrale_percelen_onder_kavel: (k.feiten?.percelen ?? []).map((x) => ({ ...x, eigenaar: k.eigendom?.[x.aanduiding]?.type || "niet opgevraagd" })),
      grondgebruik: k.feiten?.grondgebruik ?? [],
      kabels_en_leidingen: (k.leidingen ?? []).map((x) => ({ laag: vertrouwelijk.has(x.laag) ? "aangeleverde laag van de netbeheerder" : x.laag, afstand_tot_midden_kavel_m: x.afstand, ligt_binnen_kavel: x.inKavel })),
      niet_opgehaald: k.feiten?.fouten ?? [],
    })),
  };

  const client = new Anthropic();
  const antwoord = await client.beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    output_config: { effort: "medium", format: betaZodOutputFormat(Uitvoer) },
    // Bij een onterechte weigering neemt een ander model het verzoek binnen dezelfde aanroep over.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEEM,
    messages: [{ role: "user", content: `Beoordeel deze locaties.\n\n${JSON.stringify(invoer, null, 1)}` }],
  });
  if (antwoord.stop_reason === "refusal") throw new Error("Het model heeft het verzoek geweigerd");
  if (antwoord.stop_reason === "max_tokens" || !antwoord.parsed_output) throw new Error("Het antwoord van het model was onvolledig; probeer het opnieuw");

  const uit: Record<string, Record<string, Voorstel>> = {};
  for (const loc of antwoord.parsed_output.locaties) {
    uit[loc.id] = Object.fromEntries(
      HAND_CRITERIA.map((c) => {
        const b = loc[c.id as "bestemming"];
        const score = b.score === null ? null : Math.min(5, Math.max(1, Math.round(b.score)));
        return [c.id, { score, motivatie: b.motivatie, zekerheid: b.zekerheid, controleer: b.controleer }];
      }),
    );
  }
  return uit;
}

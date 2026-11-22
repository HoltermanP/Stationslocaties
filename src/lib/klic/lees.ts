import { strFromU8, unzipSync } from "fflate";

// Leest een KLIC-levering (zip van het Kadaster, IMKL 2.0). Het bestand GI_gebiedsinformatielevering_*.xml bevat alle
// netinformatie als GML in RD-coördinaten: leidingen verwijzen via net:link naar een UtilityLink met de lijngeometrie
// en via net:inNetwork naar een Utiliteitsnet, dat het thema draagt.
export type KlicLevering = {
  meldnummer: string;
  aanvraagSoort: string;
  netbeheerders: { code: string; naam: string; geleverd: boolean | null }[];
  /** per thema de lijnen (RD) */
  themas: Record<string, number[][][]>;
};

export const THEMA: Record<string, { naam: string; zwaar?: boolean }> = {
  laagspanning: { naam: "Laagspanning" },
  middenspanning: { naam: "Middenspanning" },
  hoogspanning: { naam: "Hoogspanning", zwaar: true },
  landelijkHoogspanningsnet: { naam: "Landelijk hoogspanningsnet", zwaar: true },
  gasLageDruk: { naam: "Gas lage druk" },
  gasHogeDruk: { naam: "Gas hoge druk", zwaar: true },
  buisleidingGevaarlijkeInhoud: { naam: "Buisleiding gevaarlijke inhoud", zwaar: true },
  petrochemie: { naam: "(Petro)chemie", zwaar: true },
  water: { naam: "Water" },
  rioolVrijverval: { naam: "Riool vrij verval" },
  rioolOnderOverOfOnderdruk: { naam: "Riool onder druk" },
  warmte: { naam: "Warmte" },
  datatransport: { naam: "Datatransport" },
  wees: { naam: "Weesleiding" },
  overig: { naam: "Overig" },
};

export function leesLevering(zip: Uint8Array): KlicLevering {
  let bestanden: Record<string, Uint8Array>;
  try {
    bestanden = unzipSync(zip, { filter: (f) => /(^|\/)GI_gebiedsinformatielevering[^/]*\.xml$/i.test(f.name) });
  } catch {
    throw new Error("Het bestand is geen geldige zip");
  }
  const naam = Object.keys(bestanden)[0];
  if (!naam) throw new Error("Geen GI_gebiedsinformatielevering-bestand gevonden; is dit een KLIC-levering (IMKL 2.0)?");
  return leesGml(strFromU8(bestanden[naam]));
}

const attr = (t: string, re: RegExp) => re.exec(t)?.[1] ?? "";

export function leesGml(xml: string): KlicLevering {
  const links = new Map<string, number[][]>();
  const netThema = new Map<string, string>();
  const beheerder = new Map<string, { code: string; naam: string }>();
  const geleverd = new Map<string, boolean>();
  const leidingen: { net: string; links: string[] }[] = [];
  let meldnummer = "", aanvraagSoort = "";

  for (const stuk of xml.split("<gml:featureMember>").slice(1)) {
    const type = attr(stuk, /^\s*<[\w-]+:([\w-]+)/);
    const id = attr(stuk, /gml:id="([^"]+)"/);
    if (type === "UtilityLink") {
      const pos = /<gml:posList([^>]*)>([^<]+)<\/gml:posList>/.exec(stuk);
      if (!pos) continue;
      const dim = Number(attr(pos[1] + stuk.slice(0, pos.index), /srsDimension="(\d)"/)) || 2;
      const g = pos[2].trim().split(/\s+/).map(Number);
      const lijn: number[][] = [];
      for (let i = 0; i + 1 < g.length; i += dim) lijn.push([g[i], g[i + 1]]);
      if (lijn.length > 1) links.set(id, lijn);
    } else if (type === "Utiliteitsnet") {
      netThema.set(id, attr(stuk, /<imkl:thema xlink:href="[^"]*\/([^"/]+)"/) || "overig");
    } else if (type === "Beheerder") {
      beheerder.set(id, { code: attr(stuk, /<imkl:bronhoudercode>([^<]+)/), naam: attr(stuk, /<imkl:naam>([^<]+)/) });
    } else if (type === "Belanghebbende") {
      const ref = attr(stuk, /<imkl:netbeheerder xlink:href="([^"]+)"/);
      const wel = attr(stuk, /<imkl:beheerdersinformatieGeleverd>(\w+)/) === "true";
      geleverd.set(ref, (geleverd.get(ref) ?? false) || wel);
    } else if (type === "GebiedsinformatieAanvraag") {
      meldnummer = attr(stuk, /<imkl:klicMeldnummer>([^<]+)/);
      aanvraagSoort = attr(stuk, /<imkl:aanvraagSoort xlink:href="[^"]*\/([^"/]+)"/);
    } else if (stuk.includes("<net:link ")) {
      leidingen.push({ net: attr(stuk, /<net:inNetwork xlink:href="([^"]+)"/), links: [...stuk.matchAll(/<net:link xlink:href="([^"]+)"/g)].map((m) => m[1]) });
    }
  }
  if (!links.size && !beheerder.size) throw new Error("Het leveringsbestand bevat geen netinformatie in IMKL-formaat");

  const themas: Record<string, number[][][]> = {};
  for (const l of leidingen) {
    const thema = netThema.get(l.net) ?? "overig";
    for (const ref of l.links) {
      const lijn = links.get(ref);
      if (lijn) (themas[thema] ??= []).push(lijn);
    }
  }
  return {
    meldnummer,
    aanvraagSoort,
    netbeheerders: [...beheerder.entries()].map(([bid, b]) => ({ ...b, geleverd: geleverd.get(bid) ?? null })),
    themas,
  };
}

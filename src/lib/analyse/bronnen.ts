import type { LaagSoort } from "../types";

type Feature = { geometry: { type: string; coordinates: unknown } | null; properties: Record<string, unknown> | null };
export type BBox = [number, number, number, number];

export type Bron = {
  id: string;
  naam: string;
  thema: string;
  bron: string;
  soort: LaagSoort;
  buffer: number;
  kleur: string;
  /** rol in de automatische scoring */
  rol?: "woningen" | "weg" | "water" | "spoor" | "bebouwing" | "kruising";
  haal: (bbox: BBox) => Promise<Feature[]>;
};

const CRS = "http://www.opengis.net/def/crs/EPSG/0/28992";

async function json(url: string) {
  const r = await fetch(url, { signal: AbortSignal.timeout(30000), cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function wfs(basis: string, type: string, bbox: BBox): Promise<Feature[]> {
  const uit: Feature[] = [];
  for (let start = 0; start < 30000; start += 1000) {
    const u = `${basis}?service=WFS&version=2.0.0&request=GetFeature&typeName=${type}&outputFormat=application/json&srsName=EPSG:28992&bbox=${bbox.join(",")},EPSG:28992&count=1000&startIndex=${start}`;
    const d = await json(u);
    uit.push(...(d.features ?? []));
    if ((d.features ?? []).length < 1000) break;
  }
  return uit;
}

async function ogc(collectie: string, bbox: BBox): Promise<Feature[]> {
  const uit: Feature[] = [];
  let u: string | undefined =
    `https://api.pdok.nl/brt/top10nl/ogc/v1/collections/${collectie}/items?bbox=${bbox.join(",")}&bbox-crs=${CRS}&crs=${CRS}&limit=1000&f=json`;
  for (let i = 0; u && i < 30; i++) {
    const d: { features?: Feature[]; links?: { rel: string; href: string }[] } = await json(u);
    uit.push(...(d.features ?? []));
    u = d.links?.find((l) => l.rel === "next")?.href;
  }
  return uit;
}

const BAG = "https://service.pdok.nl/lv/bag/wfs/v2_0";
const RCE = "https://data.geo.cultureelerfgoed.nl/openbaar/wfs";
const maaiveld = (f: Feature) => Number(f.properties?.hoogteniveau ?? 0) === 0;

let bagCache: { sleutel: string; data: Promise<Feature[]> } | null = null;
export function panden(bbox: BBox) {
  const sleutel = bbox.join(",");
  if (bagCache?.sleutel !== sleutel) bagCache = { sleutel, data: wfs(BAG, "bag:pand", bbox) };
  return bagCache.data;
}

/** Kadastrale percelen (polygonen in RD) in het gegeven vak. */
export const percelenRD = (bbox: BBox) => wfs("https://service.pdok.nl/kadaster/kadastralekaart/wfs/v5_0", "kadastralekaart:Perceel", bbox);

let wegCache: { sleutel: string; data: Promise<number[][][]> } | null = null;
/** Hartlijnen van rijwegen op maaiveld (geen voet- en fietspaden), als lijnen in RD. */
export function rijwegen(bbox: BBox): Promise<number[][][]> {
  const sleutel = bbox.join(",");
  if (wegCache?.sleutel !== sleutel)
    wegCache = {
      sleutel,
      data: ogc("wegdeel_hartlijn", bbox).then((fs) =>
        fs
          .filter((f) => maaiveld(f) && !/voetgangers|fietsers|ruiters/.test(String(f.properties?.hoofdverkeersgebruik ?? "")))
          .flatMap((f) => (f.geometry?.type === "LineString" ? [f.geometry.coordinates as number[][]] : f.geometry?.type === "MultiLineString" ? (f.geometry.coordinates as number[][][]) : []))
          .filter((l) => l.length > 1),
      ),
    };
  return wegCache.data;
}

export const BRONNEN: Bron[] = [
  {
    id: "bebouwing", naam: "Bebouwing", thema: "Bebouwing", bron: "BAG (Kadaster)", soort: "uitsluiten", buffer: 5, kleur: "#b91c1c", rol: "bebouwing",
    haal: panden,
  },
  {
    // Programma van eisen Enexis: zo groot mogelijke afstand tot woningen, scholen en verpleeghuizen
    id: "woningen", naam: "Woningen, onderwijs en zorg – hinderzone", thema: "Bebouwing", bron: "BAG, gebruiksdoel woon-, onderwijs- en gezondheidszorgfunctie", soort: "uitsluiten", buffer: 10, kleur: "#f97316", rol: "woningen",
    haal: async (b) => (await panden(b)).filter((f) => /woonfunctie|onderwijsfunctie|gezondheidszorgfunctie/.test(String(f.properties?.gebruiksdoel ?? ""))),
  },
  {
    id: "water", naam: "Oppervlaktewater", thema: "Water", bron: "BRT TOP10NL", soort: "uitsluiten", buffer: 5, kleur: "#2563eb", rol: "water",
    haal: async (b) => (await ogc("waterdeel_vlak", b)).filter(maaiveld),
  },
  {
    id: "wegen", naam: "Wegen", thema: "Infrastructuur", bron: "BRT TOP10NL", soort: "uitsluiten", buffer: 2, kleur: "#525252", rol: "weg",
    haal: async (b) => (await ogc("wegdeel_vlak", b)).filter(maaiveld),
  },
  {
    id: "spoor", naam: "Spoorwegen", thema: "Infrastructuur", bron: "BRT TOP10NL", soort: "uitsluiten", buffer: 30, kleur: "#171717", rol: "spoor",
    haal: (b) => ogc("spoorbaandeel_lijn", b),
  },
  {
    id: "natura2000", naam: "Natura 2000", thema: "Natuur", bron: "RVO / PDOK", soort: "uitsluiten", buffer: 0, kleur: "#15803d",
    haal: (b) => wfs("https://service.pdok.nl/rvo/natura2000/wfs/v1_0", "natura2000:natura2000", b),
  },
  {
    // 5 m buffer: geen boomwortels in de kabelzone en geen aangrenzend bosperceel (folder TVS)
    id: "bos", naam: "Bos", thema: "Natuur", bron: "BRT TOP10NL", soort: "aandacht", buffer: 5, kleur: "#65a30d",
    haal: async (b) => (await ogc("terrein_vlak", b)).filter((f) => String(f.properties?.typelandgebruik ?? "").startsWith("bos")),
  },
  {
    // Terreinen met een eigen functie waar een station niet past: begraafplaats, sportvelden, volkstuinen en dergelijke.
    id: "functiegebied", naam: "Begraafplaatsen, sportvelden en volkstuinen", thema: "Bebouwing", bron: "BRT TOP10NL, functioneel gebied", soort: "uitsluiten", buffer: 3, kleur: "#a21caf",
    haal: async (b) => (await ogc("functioneel_gebied_vlak", b)).filter((f) => /begraafplaats|sport|volkstuin|golf|ijsbaan|renbaan|zwembad|speel|camping|dierentuin|tennis|zonnepark/i.test(String(f.properties?.typefunctioneelgebied ?? ""))),
  },
  {
    id: "rijksmonument", naam: "Rijksmonumenten", thema: "Erfgoed", bron: "RCE", soort: "uitsluiten", buffer: 10, kleur: "#7e22ce",
    haal: (b) => wfs(RCE, "openbaar:rijksmonumentcontouren", b),
  },
  {
    id: "archeologie", naam: "Archeologische monumenten (AMK)", thema: "Erfgoed", bron: "RCE", soort: "aandacht", buffer: 0, kleur: "#c084fc",
    haal: (b) => wfs(RCE, "openbaar:Archeologische_Monumentenkaart_2014", b),
  },
  {
    // Programma van eisen Enexis: het station ligt zo ver mogelijk van een kruising. Alleen voor het afstandscriterium;
    // een kruising is een punt waar drie of meer rijwegen samenkomen.
    id: "kruisingen", naam: "Kruisingen (afstandscriterium)", thema: "Infrastructuur", bron: "BRT TOP10NL, hartlijnen rijwegen", soort: "uit", buffer: 0, kleur: "#0f172a", rol: "kruising",
    haal: async (b) => {
      const telling = new Map<string, { p: number[]; n: number }>();
      for (const lijn of await rijwegen(b)) {
          for (const p of [lijn[0], lijn[lijn.length - 1]]) {
            const sleutel = `${Math.round(p[0])},${Math.round(p[1])}`;
            telling.set(sleutel, { p, n: (telling.get(sleutel)?.n ?? 0) + 1 });
          }
      }
      return [...telling.values()].filter((t) => t.n >= 3).map((t) => ({ geometry: { type: "Point", coordinates: t.p }, properties: null }));
    },
  },
];

import type { Feiten, Kandidaat } from "../types";
import { naarRD } from "./rd";

// Openbare feiten per locatie, als onderbouwing voor de handmatige criteria.
// Bestemmingen komen uit de landelijke voorziening Ruimtelijke plannen (PDOK); die bevat de plannen van
// vóór de Omgevingswet. Wijzigingen van het omgevingsplan sinds 2024 staan alleen in het Omgevingsloket.
const PLU = "https://service.pdok.nl/kadaster/plu/wms/v1_0";
const KAD = "https://service.pdok.nl/kadaster/kadastralekaart/wms/v5_0";
const CRS = "http://www.opengis.net/def/crs/EPSG/0/28992";

type Eig = Record<string, string | null>;

async function opPunt(basis: string, laag: string, [x, y]: number[]): Promise<Eig[]> {
  const bbox = [x - 1, y - 1, x + 1, y + 1].join(",");
  const u = `${basis}?service=WMS&version=1.3.0&request=GetFeatureInfo&layers=${laag}&query_layers=${laag}&crs=EPSG:28992&bbox=${bbox}&width=3&height=3&i=1&j=1&info_format=application/json&feature_count=20`;
  const r = await fetch(u, { signal: AbortSignal.timeout(20000), cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = (await r.json()) as { features?: { properties: Eig }[] };
  return (d.features ?? []).map((f) => f.properties);
}

// Kenmerken van een kadastraal perceel waaruit het soort eigenaar is in te schatten zolang de eigendomsinformatie
// van het Kadaster er niet is: bebouwing en gebruik (BAG), vorm van het perceel en het deel dat de kavel inneemt.
type Geo = { type: string; coordinates: unknown } | null;
const ringenVan = (g: Geo): number[][][] =>
  g?.type === "Polygon" ? (g.coordinates as number[][][]) : g?.type === "MultiPolygon" ? (g.coordinates as number[][][][]).flat() : [];
const binnen = (ringen: number[][][], [x, y]: number[]) => {
  let in_ = false;
  for (const ring of ringen)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x1, y1] = ring[j], [x2, y2] = ring[i];
      if (y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) in_ = !in_;
    }
  return in_;
};

async function perceelOpPunt([x, y]: number[]): Promise<{ eig: Eig; ringen: number[][][] }[]> {
  const bbox = [x - 1, y - 1, x + 1, y + 1].join(",");
  const u = `${KAD}?service=WMS&version=1.3.0&request=GetFeatureInfo&layers=Perceel&query_layers=Perceel&crs=EPSG:28992&bbox=${bbox}&width=3&height=3&i=1&j=1&info_format=application/json&feature_count=5`;
  const r = await fetch(u, { signal: AbortSignal.timeout(20000), cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = (await r.json()) as { features?: { properties: Eig; geometry: Geo }[] };
  return (d.features ?? []).map((f) => ({ eig: f.properties, ringen: ringenVan(f.geometry) }));
}

async function bebouwing(ringen: number[][][]): Promise<{ panden: number; gebruik: string[] }> {
  const xs = ringen.flat().map((p) => p[0]), ys = ringen.flat().map((p) => p[1]);
  const bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].join(",");
  const u = `https://service.pdok.nl/lv/bag/wfs/v2_0?service=WFS&version=2.0.0&request=GetFeature&typeName=bag:pand&outputFormat=application/json&srsName=EPSG:28992&bbox=${bbox},EPSG:28992&count=1000`;
  const r = await fetch(u, { signal: AbortSignal.timeout(30000), cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = (await r.json()) as { features?: { properties: Eig; geometry: Geo }[] };
  const op = (d.features ?? []).filter((f) => {
    const ring = ringenVan(f.geometry)[0];
    if (!ring?.length) return false;
    const midden = [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
    return binnen(ringen, midden);
  });
  const gebruik = [...new Set(op.flatMap((f) => String(f.properties.gebruiksdoel ?? "").split(",").map((g) => g.trim()).filter(Boolean)))];
  return { panden: op.length, gebruik };
}

async function terrein([x, y]: number[]): Promise<string[]> {
  const u = `https://api.pdok.nl/brt/top10nl/ogc/v1/collections/terrein_vlak/items?bbox=${x - 1},${y - 1},${x + 1},${y + 1}&bbox-crs=${CRS}&limit=10&f=json`;
  const r = await fetch(u, { signal: AbortSignal.timeout(20000), cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = (await r.json()) as { features?: { properties: Eig }[] };
  return (d.features ?? []).map((f) => String(f.properties.typelandgebruik ?? "")).filter(Boolean);
}

// Natura 2000 binnen 10 km, voor de regel Stikstof in de template. Eén ophaalactie per blok van 5 km, gedeeld door alle locaties.
type Vlak = { naam: string; ringen: number[][][] };
const n2kCache = new Map<string, Promise<Vlak[]>>();
function natura2000(x: number, y: number): Promise<Vlak[]> {
  const cx = Math.round(x / 5000) * 5000, cy = Math.round(y / 5000) * 5000, sleutel = `${cx},${cy}`;
  let p = n2kCache.get(sleutel);
  if (!p) {
    const bbox = [cx - 12500, cy - 12500, cx + 12500, cy + 12500].join(",");
    p = fetch(`https://service.pdok.nl/rvo/natura2000/wfs/v1_0?service=WFS&version=2.0.0&request=GetFeature&typeName=natura2000:natura2000&outputFormat=application/json&srsName=EPSG:28992&bbox=${bbox},EPSG:28992&count=200`, { signal: AbortSignal.timeout(45000), cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = (await r.json()) as { features?: { properties: Eig; geometry: { type: string; coordinates: unknown } | null }[] };
        return (d.features ?? []).map((f) => ({
          naam: String(f.properties.naamN2K ?? "Natura 2000"),
          ringen: (f.geometry?.type === "MultiPolygon" ? (f.geometry.coordinates as number[][][][]).flat() : f.geometry?.type === "Polygon" ? (f.geometry.coordinates as number[][][]) : []),
        }));
      });
    p.catch(() => n2kCache.delete(sleutel));
    n2kCache.set(sleutel, p);
  }
  return p;
}

async function dichtstbijNatura([x, y]: number[]): Promise<{ naam: string; afstand: number } | null> {
  let beste: { naam: string; afstand: number } | null = null;
  for (const v of await natura2000(x, y)) {
    let d = Infinity, binnen = false;
    for (const ring of v.ringen)
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [x1, y1] = ring[j], [x2, y2] = ring[i];
        if (y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) binnen = !binnen;
        const dx = x2 - x1, dy = y2 - y1, t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy || 1)));
        d = Math.min(d, Math.hypot(x - x1 - t * dx, y - y1 - t * dy));
      }
    if (binnen) d = 0;
    if (d <= 10000 && (!beste || d < beste.afstand)) beste = { naam: v.naam, afstand: Math.round(d) };
  }
  return beste;
}

const uniek = <T,>(xs: T[], sleutel: (x: T) => string) => [...new Map(xs.map((x) => [sleutel(x), x])).values()];

export async function verzamelFeiten(k: Kandidaat): Promise<Feiten> {
  const hoeken = k.kavel.coordinates[0].slice(0, 4).map(naarRD);
  const punten = [k.rd as number[], ...hoeken];
  const fouten: string[] = [];
  const probeer = async <T,>(naam: string, f: () => Promise<T[]>): Promise<T[]> => {
    try {
      return await f();
    } catch {
      if (!fouten.includes(naam)) fouten.push(naam);
      return [];
    }
  };
  const geldig = (e: Eig) => e.historisch !== "1";
  const [enkel, dubbel, gebied, perceel, grond, natura] = await Promise.all([
    Promise.all(punten.map((p) => probeer("bestemmingen", () => opPunt(PLU, "enkelbestemming", p)))).then((x) => x.flat().filter(geldig)),
    Promise.all(punten.map((p) => probeer("dubbelbestemmingen", () => opPunt(PLU, "dubbelbestemming", p)))).then((x) => x.flat().filter(geldig)),
    probeer("gebiedsaanduidingen", () => opPunt(PLU, "gebiedsaanduiding", k.rd)).then((x) => x.filter(geldig)),
    Promise.all(punten.map((p) => probeer("kadastrale percelen", () => perceelOpPunt(p)))).then((x) => x.flat()),
    probeer("grondgebruik", () => terrein(k.rd)),
    dichtstbijNatura(k.rd).catch(() => { fouten.push("Natura 2000"); return undefined; }),
  ]);
  const kavelM2 = Math.hypot(hoeken[1][0] - hoeken[0][0], hoeken[1][1] - hoeken[0][1]) * Math.hypot(hoeken[2][0] - hoeken[1][0], hoeken[2][1] - hoeken[1][1]);
  const percelen = await Promise.all(
    uniek(perceel.filter((x) => x.eig.sectie && x.eig.perceelnummer), (x) => `${x.eig.kadastraleGemeenteWaarde} ${x.eig.sectie} ${x.eig.perceelnummer}`).map(async ({ eig: e, ringen }) => {
      const oppM2 = Math.round(Number(e.kadastraleGrootteWaarde ?? 0));
      const omtrek = ringen.slice(0, 1).flat().reduce((s, p, i, r) => s + (i ? Math.hypot(p[0] - r[i - 1][0], p[1] - r[i - 1][1]) : 0), 0);
      const b = await bebouwing(ringen).catch(() => { if (!fouten.includes("bebouwing op perceel")) fouten.push("bebouwing op perceel"); return undefined; });
      return {
        aanduiding: `${e.kadastraleGemeenteWaarde ?? ""} ${e.sectie ?? ""} ${e.perceelnummer ?? ""}`.trim(),
        oppM2,
        ...(b ?? {}),
        // compactheid 4πA/P²: een cirkel is 1, een smalle strook (berm, watergang, pad) ligt ver onder 0,25
        ...(omtrek && oppM2 ? { vorm: ((4 * Math.PI * oppM2) / (omtrek * omtrek) < 0.25 ? "langgerekt" : "compact") as "langgerekt" | "compact" } : {}),
        ...(oppM2 ? { kavelAandeel: Math.min(100, Math.round((100 * kavelM2) / oppM2)) } : {}),
      };
    }),
  );
  return {
    opgehaaldOp: new Date().toISOString(),
    bestemmingen: uniek(
      enkel.map((e) => ({ naam: e.naam ?? "", hoofdgroep: e.bestemmingshoofdgroep ?? "", plan: `${e.typeplan ?? "plan"} ${e.dossierid ?? ""}`.trim(), status: e.dossierstatus ?? e.planstatus ?? "", link: e.verwijzingnaartekst ?? "" })),
      (b) => b.naam + b.plan,
    ),
    dubbelbestemmingen: uniek(dubbel.map((e) => ({ naam: e.naam ?? "", link: e.verwijzingnaartekst ?? "" })), (b) => b.naam),
    gebiedsaanduidingen: [...new Set(gebied.map((e) => e.naam ?? "").filter(Boolean))],
    percelen,
    grondgebruik: [...new Set(grond)],
    natura,
    fouten,
  };
}

import type { NextRequest } from "next/server";
import { naarWGS } from "@/lib/analyse/rd";

// Bebouwing rond een punt (RD) met hoogte, voor het 3D-beeld. Welke panden er staan komt uit de actuele BAG (Kadaster);
// de hoogte uit 3DBAG (TU Delft, op basis van BAG en AHN). Valt één van beide uit, dan werkt het beeld met de andere.
const BAG3D = "https://data.3dbag.nl/api/BAG3D/wfs";
const BAG = "https://service.pdok.nl/lv/bag/wfs/v2_0";

type F = { geometry: { type: string; coordinates: unknown } | null; properties: Record<string, unknown> | null };

async function wfs(basis: string, type: string, bbox: number[], max: number): Promise<F[]> {
  const uit: F[] = [];
  for (let start = 0; start < max; start += 1000) {
    const u = `${basis}?service=WFS&version=2.0.0&request=GetFeature&typeName=${type}&outputFormat=application/json&srsName=EPSG:28992&bbox=${bbox.join(",")},EPSG:28992&count=1000&startIndex=${start}`;
    const r = await fetch(u, { signal: AbortSignal.timeout(25000), cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = (await r.json()) as { features?: F[] };
    uit.push(...(d.features ?? []));
    if ((d.features ?? []).length < 1000) break;
  }
  return uit;
}

const ringen = (g: F["geometry"]): number[][][][] => (!g ? [] : g.type === "Polygon" ? [g.coordinates as number[][][]] : g.type === "MultiPolygon" ? (g.coordinates as number[][][][]) : []);

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const x = Number(q.get("x")), y = Number(q.get("y"));
  const straal = Math.min(400, Math.max(50, Number(q.get("r")) || 250));
  // RD-coördinaten binnen Nederland
  if (!(x > 0 && x < 300000 && y > 300000 && y < 630000)) return Response.json({ fout: "Ongeldige coördinaten" }, { status: 400 });
  const bbox = [x - straal, y - straal, x + straal, y + straal].map(Math.round);
  // De BAG is leidend voor welke panden er staan: 3DBAG wordt periodiek opgebouwd en loopt achter (gesloopte panden staan er
  // nog in, nieuwbouw ontbreekt). 3DBAG levert alleen de hoogte, per panddeel. Een pand zonder meting krijgt een geschatte hoogte.
  const [bag, b3] = await Promise.all([
    wfs(BAG, "bag:pand", bbox, 6000).catch(() => null),
    wfs(BAG3D, "BAG3D:lod13", bbox, 6000).catch(() => null),
  ]);
  if (!bag && !b3) return Response.json({ bron: "niet beschikbaar", gebouwen: { type: "FeatureCollection", features: [] } });

  const opp = (g: F["geometry"]) =>
    ringen(g).reduce((s, poly) => s + Math.abs(poly[0].reduce((a, c, i, r) => (i ? a + r[i - 1][0] * c[1] - c[0] * r[i - 1][1] : a), 0)) / 2, 0);
  const hoogte = (p: Record<string, unknown>) => Number(p.b3_h_70p) - Number(p.b3_h_maaiveld);
  // meting onbruikbaar: te weinig hoogtepunten, of het pand is veranderd tussen de laatste twee hoogtemetingen
  const betrouwbaar = (p: Record<string, unknown>) => Number.isFinite(hoogte(p)) && hoogte(p) > 1 && p.b3_pw_onvoldoende !== true && p.b3_mutatie_ahn4_ahn5 !== true;

  const gemeten = new Map<string, F[]>();
  for (const f of b3 ?? []) {
    const id = String(f.properties?.identificatie ?? "").replace("NL.IMBAG.Pand.", "");
    gemeten.set(id, [...(gemeten.get(id) ?? []), f]);
  }
  // schatting voor panden zonder meting: mediaan van gemeten panden van vergelijkbare omvang in de omgeving
  const klasse = (m2: number) => (m2 < 50 ? 0 : m2 < 500 ? 1 : 2);
  const perKlasse: number[][] = [[], [], []];
  for (const f of b3 ?? []) if (betrouwbaar(f.properties ?? {})) perKlasse[klasse(opp(f.geometry))].push(hoogte(f.properties ?? {}));
  const mediaan = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);
  const schat = (m2: number) => mediaan(perKlasse[klasse(m2)]) ?? [3, 6, 8][klasse(m2)];

  type Deel = { g: F["geometry"]; h: number; geschat: boolean };
  let delen: Deel[];
  let nGeschat = 0, nVervallen = 0, nPanden = 0;
  if (bag) {
    // vergunde maar nog niet gebouwde panden staan er niet
    const staand = bag.filter((f) => String(f.properties?.status ?? "") !== "Bouwvergunning verleend");
    nPanden = staand.length;
    const ids = new Set(staand.map((f) => String(f.properties?.identificatie)));
    nVervallen = [...gemeten.keys()].filter((id) => !ids.has(id)).length;
    delen = staand.flatMap((f): Deel[] => {
      const parts = (gemeten.get(String(f.properties?.identificatie)) ?? []).filter((d) => betrouwbaar(d.properties ?? {}));
      if (parts.length) return parts.map((d) => ({ g: d.geometry, h: hoogte(d.properties ?? {}), geschat: false }));
      nGeschat++;
      return [{ g: f.geometry, h: schat(opp(f.geometry)), geschat: true }];
    });
  } else {
    nPanden = gemeten.size;
    delen = (b3 ?? []).map((f) => ({ g: f.geometry, h: betrouwbaar(f.properties ?? {}) ? hoogte(f.properties ?? {}) : schat(opp(f.geometry)), geschat: !betrouwbaar(f.properties ?? {}) }));
  }
  const bron = !bag
    ? "3DBAG (BAG niet bereikbaar: gesloopte en nieuwe panden kunnen afwijken)"
    : !b3
      ? `BAG, ${nPanden} panden, alle hoogten geschat (3DBAG niet bereikbaar)`
      : `BAG (actueel), ${nPanden} panden, hoogte uit 3DBAG${nGeschat ? `; ${nGeschat} zonder meting, hoogte geschat (lichter getoond)` : ""}${nVervallen ? `; ${nVervallen} gesloopt en weggelaten` : ""}`;

  const features = delen.flatMap(({ g, h, geschat }) =>
    ringen(g).map((poly) => ({
      type: "Feature",
      properties: { h: +h.toFixed(1), geschat },
      geometry: { type: "Polygon", coordinates: poly.map((ring) => ring.map((c) => naarWGS(c))) },
    })),
  );
  return Response.json({ bron, gebouwen: { type: "FeatureCollection", features } }, { headers: { "cache-control": "private, max-age=3600" } });
}

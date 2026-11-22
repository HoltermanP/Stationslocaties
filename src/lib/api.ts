export async function api<T>(pad: string, methode = "GET", body?: unknown): Promise<T> {
  const r = await fetch(pad, {
    method: methode,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => ({ fout: `Onverwacht antwoord (${r.status})` }));
  if (!r.ok) throw new Error(d.fout ?? `Fout ${r.status}`);
  return d as T;
}

/** Haal de eerste polygoon uit een GeoJSON-bestand (WGS84). */
export function eerstePolygoon(gj: unknown): { type: "Polygon"; coordinates: number[][][] } | null {
  const x = gj as { type?: string; features?: unknown[]; geometry?: unknown; coordinates?: unknown };
  if (!x?.type) return null;
  if (x.type === "FeatureCollection") { for (const f of x.features ?? []) { const p = eerstePolygoon(f); if (p) return p; } return null; }
  if (x.type === "Feature") return eerstePolygoon(x.geometry);
  if (x.type === "Polygon") return { type: "Polygon", coordinates: x.coordinates as number[][][] };
  if (x.type === "MultiPolygon") return { type: "Polygon", coordinates: (x.coordinates as number[][][][])[0] };
  return null;
}

export const lijktWgs84 = (p: { coordinates: number[][][] }) => p.coordinates[0].every((c) => Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90);

import { haal, wijzig } from "@/lib/repo";
import { maakTeksten } from "@/lib/teksten";

// Genereert de concepttekst opnieuw (overschrijft handmatige aanpassingen in de gekozen secties).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const l = await haal(id);
  if (!l) return Response.json({ fout: "LQS niet gevonden" }, { status: 404 });
  const { secties } = (await req.json().catch(() => ({}))) as { secties?: string[] };
  const vers = maakTeksten(l);
  const teksten = { ...l.teksten };
  for (const [k, v] of Object.entries(vers)) if (!secties || secties.includes(k)) teksten[k] = v;
  return Response.json(await wijzig(id, { teksten }));
}

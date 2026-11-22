import { voerAnalyseUit } from "@/lib/analyse/analyse";
import { haal, wijzig } from "@/lib/repo";
import { maakTeksten } from "@/lib/teksten";

export const maxDuration = 120;

export async function POST(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const l = await haal(id);
  if (!l) return Response.json({ fout: "LQS niet gevonden" }, { status: 404 });
  try {
    const { analyse, kandidaten } = await voerAnalyseUit(l);
    const voorkeurId = kandidaten.some((k) => k.id === l.voorkeurId) ? l.voorkeurId : null;
    const nieuw = { ...l, analyse, kandidaten, voorkeurId };
    // bestaande, door de planoloog bewerkte teksten blijven staan
    const teksten = { ...maakTeksten(nieuw), ...l.teksten };
    const status = ["Intake", "Analyse"].includes(l.status) ? "Kandidaten" : l.status;
    return Response.json(await wijzig(id, { analyse, kandidaten, voorkeurId, teksten, status }));
  } catch (e) {
    return Response.json({ fout: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

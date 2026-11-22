import { volgAanvraag } from "@/lib/klic/kadaster";
import { verwerkLevering } from "@/lib/klic/verwerk";
import { haal, wijzig } from "@/lib/repo";

export const maxDuration = 120;

// Automatische route, stap 2: stand opvragen en de levering inlezen zodra die er is.
export async function POST(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  const l = await haal((await params).id);
  if (!l) return Response.json({ fout: "LQS niet gevonden" }, { status: 404 });
  const a = l.klic.aanvraag;
  if (!a) return Response.json({ fout: "Er is geen KLIC-aanvraag ingediend voor deze LQS" }, { status: 400 });
  try {
    const { zip, ...stand } = await volgAanvraag(a);
    const klic = { ...l.klic, aanvraag: { ...a, ...stand, melding: stand.melding } };
    const bijgewerkt = await wijzig(l.id, { klic });
    return Response.json(zip && bijgewerkt ? await verwerkLevering(bijgewerkt, zip, "kadaster") : bijgewerkt);
  } catch (e) {
    return Response.json({ fout: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

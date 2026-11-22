import { dienAanvraagIn } from "@/lib/klic/kadaster";
import { haal, wijzig } from "@/lib/repo";

// Automatische route, stap 1: oriëntatieverzoek indienen bij het Kadaster. Dit is een bestelling,
// dus de aanroep moet de bevestiging van de gebruiker meesturen.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const l = await haal((await params).id);
  if (!l) return Response.json({ fout: "LQS niet gevonden" }, { status: 404 });
  const { bevestigd } = (await req.json().catch(() => ({}))) as { bevestigd?: boolean };
  if (bevestigd !== true) return Response.json({ fout: "De aanvraag is niet bevestigd" }, { status: 400 });
  if (l.klic.aanvraag && !["Afgewezen", "Mislukt"].includes(l.klic.aanvraag.status) && !l.klic.ingelezenOp)
    return Response.json({ fout: "Er loopt al een KLIC-aanvraag voor deze LQS" }, { status: 409 });
  try {
    const a = await dienAanvraagIn(l);
    return Response.json(await wijzig(l.id, { klic: { ...l.klic, aanvraag: { ...a, ingediendOp: new Date().toISOString(), status: "Ingediend" } } }));
  } catch (e) {
    return Response.json({ fout: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

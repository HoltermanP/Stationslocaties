import Anthropic from "@anthropic-ai/sdk";
import { aiBeschikbaar, vraagVoorstellen } from "@/lib/ai";
import { verzamelFeiten } from "@/lib/analyse/feiten";
import { haal, wijzig } from "@/lib/repo";

export const maxDuration = 300;

// Haalt per locatie de openbare feiten op en vraagt daarna een AI-voorstel voor de handmatige criteria.
// Scores van de planoloog worden nooit overschreven; het voorstel staat ernaast tot het wordt overgenomen.
export async function POST(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const l = await haal(id);
  if (!l) return Response.json({ fout: "LQS niet gevonden" }, { status: 404 });
  if (!l.kandidaten.length) return Response.json({ fout: "Voer eerst de analyse uit" }, { status: 400 });

  const kandidaten = await Promise.all(l.kandidaten.map(async (k) => ({ ...k, feiten: await verzamelFeiten(k) })));
  let melding = "";
  if (!aiBeschikbaar()) {
    melding = "De feiten per locatie zijn opgehaald. Voor het AI-voorstel ontbreekt een sleutel: zet ANTHROPIC_API_KEY in .env.local en herstart de app.";
  } else {
    try {
      const voorstellen = await vraagVoorstellen({ ...l, kandidaten });
      for (const k of kandidaten) if (voorstellen[k.id]) k.voorstel = voorstellen[k.id];
      const zonder = kandidaten.filter((k) => !voorstellen[k.id]).length;
      if (zonder) melding = `Voor ${zonder} locatie(s) gaf het model geen voorstel; probeer het opnieuw.`;
    } catch (e) {
      const reden =
        e instanceof Anthropic.AuthenticationError ? "de API-sleutel is ongeldig"
        : e instanceof Anthropic.RateLimitError ? "de limiet van de API is bereikt; probeer het over een minuut opnieuw"
        : e instanceof Anthropic.APIConnectionError ? "de API is niet bereikbaar"
        : e instanceof Anthropic.APIError ? `de API gaf een fout (${e.status})`
        : e instanceof Error ? e.message : String(e);
      melding = `De feiten zijn opgehaald, maar het AI-voorstel is mislukt: ${reden}.`;
    }
  }
  return Response.json({ lqs: await wijzig(id, { kandidaten }), melding });
}

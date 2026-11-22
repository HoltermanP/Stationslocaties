import { verwerkLevering } from "@/lib/klic/verwerk";
import { haal } from "@/lib/repo";

export const maxDuration = 120;

// Handmatige route: de levering-zip uit Mijn Kadaster of de leveringsmail wordt hier ingelezen.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const l = await haal((await params).id);
  if (!l) return Response.json({ fout: "LQS niet gevonden" }, { status: 404 });
  try {
    return Response.json(await verwerkLevering(l, new Uint8Array(await req.arrayBuffer()), "upload"));
  } catch (e) {
    return Response.json({ fout: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

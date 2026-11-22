import { connection } from "next/server";
import { haal, portaalGeldig, voorMeekijker } from "@/lib/repo";

export async function GET(_r: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  await connection();
  const { token, id } = await params;
  if (!(await portaalGeldig(token))) return Response.json({ fout: "Deze meekijklink is niet (meer) geldig" }, { status: 404 });
  const l = await haal(id);
  if (!l || l.gearchiveerd) return Response.json({ fout: "LQS niet gevonden" }, { status: 404 });
  return Response.json(voorMeekijker(l));
}

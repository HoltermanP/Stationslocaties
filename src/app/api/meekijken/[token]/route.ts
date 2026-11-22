import { connection } from "next/server";
import { lijst, portaalGeldig } from "@/lib/repo";

export async function GET(_r: Request, { params }: { params: Promise<{ token: string }> }) {
  await connection();
  if (!(await portaalGeldig((await params).token))) return Response.json({ fout: "Deze meekijklink is niet (meer) geldig" }, { status: 404 });
  const rijen = (await lijst()).filter((r) => !r.gearchiveerd).map(({ zoekgebied: _z, gearchiveerd: _g, ...r }) => r);
  return Response.json({ rijen, bijgewerkt: new Date().toISOString() });
}

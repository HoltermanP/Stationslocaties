import { connection } from "next/server";
import { haal, wijzig } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };
const nietGevonden = () => Response.json({ fout: "LQS niet gevonden" }, { status: 404 });

export async function GET(_r: Request, { params }: Ctx) {
  await connection();
  const l = await haal((await params).id);
  return l ? Response.json(l) : nietGevonden();
}

export async function PATCH(req: Request, { params }: Ctx) {
  const l = await wijzig((await params).id, await req.json());
  return l ? Response.json(l) : nietGevonden();
}

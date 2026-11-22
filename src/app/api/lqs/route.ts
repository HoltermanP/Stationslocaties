import { connection } from "next/server";
import { lijst, maak } from "@/lib/repo";

export async function GET() {
  await connection();
  return Response.json(await lijst());
}

export async function POST(req: Request) {
  return Response.json(await maak(await req.json()));
}

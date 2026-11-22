import { connection } from "next/server";
import { klicConfig } from "@/lib/klic/kadaster";

export async function GET() {
  await connection();
  return Response.json(klicConfig());
}

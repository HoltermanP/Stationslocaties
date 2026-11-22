import { connection } from "next/server";
import { maakPortaal, portaalToken, trekPortaalIn } from "@/lib/repo";

// Beheer van de meekijklink (intern). De link zelf geeft alleen leestoegang via /meekijken/<token>.
export async function GET() {
  await connection();
  return Response.json({ token: await portaalToken() });
}

export async function POST() {
  return Response.json({ token: await maakPortaal() });
}

export async function DELETE() {
  await trekPortaalIn();
  return Response.json({ token: null });
}

import { connection } from "next/server";
import { streetSmartConfig } from "@/lib/streetsmart";

// Instellingen voor de Street Smart-viewer in de werkplek. Bevat de sleutel (en bij een gedeeld account de inloggegevens):
// niet aanroepen vanuit het meekijkportaal.
export async function GET() {
  await connection();
  return Response.json(streetSmartConfig(), { headers: { "cache-control": "no-store" } });
}

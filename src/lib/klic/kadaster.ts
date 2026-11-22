import { createSign, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { naarRD } from "../analyse/rd";
import type { Lqs } from "../types";

// Automatische route: KLIC B2B REST API van het Kadaster (oriëntatieverzoek indienen, status volgen, levering ophalen).
// Gebouwd naar de documentatie op github.com/kadaster/klic-win (B2B REST API, GIA-POST-API specificatie v0.89).
// NIET GETEST tegen het Kadaster: er was bij de bouw geen client-id en geen PKIoverheid-certificaat beschikbaar.
// Test eerst op de testomgeving (KLIC_OMGEVING=test) voordat de productie-omgeving wordt gebruikt.

const TOKEN_URL = "https://authorization.kadaster.nl/auth/oauth/v2/token";
const TOKEN_AUD = "authorization.kadaster.nl:443/auth/oauth/v2/token";
const IMKL = "http://definities.geostandaarden.nl/imkl2015/id/waarde";
const NLD = "http://publications.europa.eu/resource/authority/country/NLD";

export type Omgeving = "test" | "productie";

const basis = (o: Omgeving) => `https://service10.kadaster.nl/klic${o === "test" ? "/ntd" : ""}/aanvragen/v1`;
const scope = (o: Omgeving) => (o === "test" ? "klic.eto.b2baanvraag" : "klic.b2baanvraag");

export function klicConfig() {
  const omgeving: Omgeving = process.env.KLIC_OMGEVING === "productie" ? "productie" : "test";
  const ontbreekt: string[] = [];
  if (!process.env.KLIC_CLIENT_ID) ontbreekt.push("KLIC_CLIENT_ID (client-id van het Kadaster)");
  if (!process.env.KLIC_PRIVATE_KEY && !process.env.KLIC_PRIVATE_KEY_FILE) ontbreekt.push("KLIC_PRIVATE_KEY_FILE (privésleutel van het PKIoverheid-certificaat, PEM)");
  if (!process.env.KLIC_KEY_ID) ontbreekt.push("KLIC_KEY_ID (kid van de sleutel zoals geregistreerd bij het Kadaster)");
  if (!process.env.KLIC_AANVRAGER_JSON) ontbreekt.push("KLIC_AANVRAGER_JSON (aanvrager: contactpersoon, organisatie met bezoekAdres en relatienummer)");
  return { omgeving, geconfigureerd: !ontbreekt.length, ontbreekt };
}

const b64 = (x: string | Buffer) => Buffer.from(x).toString("base64url");

let cache: { token: string; tot: number; omgeving: Omgeving } | null = null;

/** OAuth 2.0 client credentials met een JWT client assertion, ondertekend met het PKIoverheid-certificaat. */
async function token(o: Omgeving): Promise<string> {
  if (cache && cache.omgeving === o && cache.tot > Date.now() + 60_000) return cache.token;
  const sleutel = process.env.KLIC_PRIVATE_KEY?.replace(/\\n/g, "\n") ?? readFileSync(process.env.KLIC_PRIVATE_KEY_FILE!, "utf8");
  const nu = Math.floor(Date.now() / 1000);
  const kop = b64(JSON.stringify({ alg: "RS256", kid: process.env.KLIC_KEY_ID, typ: "JWT" }));
  const inhoud = b64(JSON.stringify({ iss: process.env.KLIC_CLIENT_ID, sub: process.env.KLIC_CLIENT_ID, aud: TOKEN_AUD, iat: nu, nbf: nu, exp: nu + 300, jti: randomUUID() }));
  const handtekening = createSign("RSA-SHA256").update(`${kop}.${inhoud}`).sign(sleutel).toString("base64url");
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: scope(o),
      client_assertion: `${kop}.${inhoud}.${handtekening}`,
      client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`Aanmelden bij het Kadaster is mislukt (HTTP ${r.status}): ${(await r.text()).slice(0, 300)}`);
  const d = (await r.json()) as { access_token: string; expires_in: number };
  cache = { token: d.access_token, tot: Date.now() + d.expires_in * 1000, omgeving: o };
  return d.access_token;
}

async function roep(o: Omgeving, url: string, init: RequestInit = {}) {
  return fetch(url, { ...init, headers: { ...init.headers, authorization: `Bearer ${await token(o)}` }, signal: AbortSignal.timeout(60000), cache: "no-store" });
}

/** Dichtstbijzijnde BAG-adres bij een RD-punt; het aanvraagbericht eist een adres als locatie van de werkzaamheden. */
async function adresBij([x, y]: number[]) {
  const fl = "adresseerbaarobject_id,straatnaam,huisnummer,huisletter,huisnummertoevoeging,woonplaatsnaam,postcode";
  const r = await fetch(`https://api.pdok.nl/bzk/locatieserver/search/v3_1/reverse?X=${x}&Y=${y}&type=adres&rows=1&distance=2000&fl=${fl}`, { signal: AbortSignal.timeout(15000), cache: "no-store" });
  const a = ((await r.json()) as { response?: { docs?: Record<string, string | number>[] } }).response?.docs?.[0];
  if (!a?.adresseerbaarobject_id) throw new Error("Geen BAG-adres gevonden binnen 2 km van het zoekgebied; een KLIC-aanvraag vereist een adres");
  return {
    BAGid: String(a.adresseerbaarobject_id),
    openbareRuimteNaam: String(a.straatnaam ?? ""),
    huisnummer: String(a.huisnummer ?? ""),
    ...(a.huisletter ? { huisletter: String(a.huisletter) } : {}),
    ...(a.huisnummertoevoeging ? { huisnummertoevoeging: String(a.huisnummertoevoeging) } : {}),
    woonplaatsNaam: String(a.woonplaatsnaam ?? ""),
    postcode: String(a.postcode ?? ""),
    landcode: NLD,
  };
}

/** Oriëntatiepolygoon uit het zoekgebied, getoetst aan de regels van het Kadaster. */
export function orientatiePolygoon(l: Lqs) {
  if (!l.zoekgebied) throw new Error("Geen zoekgebied vastgelegd");
  const ring = l.zoekgebied.coordinates[0].map((p) => naarRD(p).map((v) => Math.round(v * 1000) / 1000));
  const punten = ring.filter((p, i) => i === 0 || p[0] !== ring[i - 1][0] || p[1] !== ring[i - 1][1]);
  const xs = punten.map((p) => p[0]), ys = punten.map((p) => p[1]);
  const b = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
  if (b > 2500 || h > 2500) throw new Error(`Het zoekgebied is ${Math.round(b)} × ${Math.round(h)} m; een oriëntatieverzoek mag hooguit 2500 × 2500 m zijn. Splits de aanvraag of vraag KLIC op per kansrijk deelgebied.`);
  if (punten.length - 1 > 50) throw new Error(`Het zoekgebied heeft ${punten.length - 1} hoekpunten; het Kadaster staat er hooguit 50 toe. Vereenvoudig het zoekgebied.`);
  return { type: "Polygon", crs: { type: "name", properties: { name: "EPSG:28992" } }, coordinates: [punten] };
}

/** Dient een oriëntatieverzoek in. Dit is een bestelling bij het Kadaster; alleen aanroepen na uitdrukkelijke bevestiging door de gebruiker. */
export async function dienAanvraagIn(l: Lqs): Promise<{ postId: string; pollUrl: string; omgeving: Omgeving }> {
  const { omgeving, geconfigureerd, ontbreekt } = klicConfig();
  if (!geconfigureerd) throw new Error(`De Kadaster-koppeling is niet ingesteld. Ontbreekt: ${ontbreekt.join("; ")}`);
  const polygoon = orientatiePolygoon(l);
  const ring = polygoon.coordinates[0];
  const midden = [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
  const postId = randomUUID();
  const bericht = {
    bestelling: { postId, factuurReferentie: l.code },
    gebiedsinformatieAanvragen: [
      {
        aanvrager: JSON.parse(process.env.KLIC_AANVRAGER_JSON!),
        referentie: `${l.code} ${l.naam}`.slice(0, 60),
        aanvraagSoort: `${IMKL}/AanvraagSoortValue/orientatieverzoek`,
        soortWerkzaamheden: [`${IMKL}/SoortWerkzaamhedenValue/trafostationPlaatsen`],
        omschrijvingWerkzaamheden: "Locatieonderzoek voor een nieuw middenspanningsstation (bureaustudie)",
        locatieWerkzaamheden: await adresBij(midden),
        locatieOmschrijving: `Zoekgebied ${l.naam}`.slice(0, 200),
        orientatiePolygoon: polygoon,
      },
    ],
  };
  const r = await roep(omgeving, `${basis(omgeving)}/gebiedsinformatieaanvragen`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(bericht) });
  const tekst = await r.text();
  if (r.status !== 202 && !r.ok) throw new Error(`Het Kadaster heeft de aanvraag niet aangenomen (HTTP ${r.status}): ${tekst.slice(0, 500)}`);
  const d = JSON.parse(tekst) as { postId?: string; pollUrl?: string };
  if (!d.pollUrl) throw new Error("Het Kadaster gaf geen poll-adres terug; controleer de aanvraag in Mijn Kadaster");
  return { postId: d.postId ?? postId, pollUrl: d.pollUrl, omgeving };
}

export type AanvraagStand = { status: string; giAanvraagId?: string; melding?: string; zip?: Uint8Array };

/** Vraagt de stand van een aanvraag op en haalt de levering op zodra die compleet is. */
export async function volgAanvraag(a: { pollUrl: string; omgeving: Omgeving; giAanvraagId?: string }): Promise<AanvraagStand> {
  let giAanvraagId = a.giAanvraagId;
  if (!giAanvraagId) {
    const r = await roep(a.omgeving, a.pollUrl);
    if (r.status === 404) return { status: "Nog niet bekend bij het Kadaster" };
    if (!r.ok) throw new Error(`Status opvragen is mislukt (HTTP ${r.status})`);
    const d = (await r.json()) as { status?: string; giAanvraagIds?: { giAanvraagId: string }[]; validatiemeldingen?: { gradatie: string; code: string; omschrijving: string }[] };
    const melding = d.validatiemeldingen?.map((m) => `${m.gradatie} ${m.code}: ${m.omschrijving}`).join(" | ");
    if (d.status !== "Aangenomen") return { status: d.status ?? "Onbekend", melding };
    giAanvraagId = d.giAanvraagIds?.[0]?.giAanvraagId;
    if (!giAanvraagId) return { status: "Aangenomen", melding: "Het Kadaster gaf nog geen aanvraagnummer terug" };
  }
  const r = await roep(a.omgeving, `${basis(a.omgeving)}/gebiedsinformatieleveringen?giAanvraagId=${encodeURIComponent(giAanvraagId)}`);
  if (r.status === 404) return { status: "Aangenomen, nog niet in productie", giAanvraagId };
  if (!r.ok) throw new Error(`Leveringen opvragen is mislukt (HTTP ${r.status})`);
  type Levering = { leveringsvolgnummer?: number | string; indicatieLeveringCompleet?: boolean | string; isVeiligheidsgebiedGeraakt?: boolean | string; giLeveringUrl?: string };
  const leveringen = ((await r.json()) as { gebiedsinformatieLeveringen?: Levering[] }).gebiedsinformatieLeveringen ?? [];
  const waar = (v: unknown) => v === true || v === "true";
  const laatste = [...leveringen].sort((p, q) => Number(q.leveringsvolgnummer ?? 0) - Number(p.leveringsvolgnummer ?? 0))[0];
  if (!laatste) return { status: "In productie, nog geen levering", giAanvraagId };
  if (waar(laatste.isVeiligheidsgebiedGeraakt)) return { status: "Veiligheidsgebied geraakt", giAanvraagId, melding: "De levering loopt via de beheerder van het veiligheidsgebied en is niet automatisch op te halen" };
  if (!laatste.giLeveringUrl) return { status: "Levering nog niet beschikbaar", giAanvraagId };
  // Een deellevering wordt ook ingelezen; de ontbrekende netbeheerders staan in de levering zelf.
  const z = await roep(a.omgeving, laatste.giLeveringUrl);
  if (!z.ok) throw new Error(`De levering downloaden is mislukt (HTTP ${z.status})`);
  return { status: waar(laatste.indicatieLeveringCompleet) ? "Levering compleet" : "Deellevering ontvangen", giAanvraagId, zip: new Uint8Array(await z.arrayBuffer()) };
}

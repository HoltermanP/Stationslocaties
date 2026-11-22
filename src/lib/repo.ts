import { desc, eq } from "drizzle-orm";
import { randomBytes, randomUUID } from "node:crypto";
import { krimpKavel } from "./station3d";
import { DOORLOOPTIJD_DAGEN, REVIEW_PUNTEN, STANDAARD_GEWICHTEN, STATION_TYPEN } from "./config";
import { getDb, schema } from "./db";
import type { Lqs } from "./types";

const T = schema.lqs;

export async function lijst() {
  const db = await getDb();
  return db
    .select({
      id: T.id, code: T.code, naam: T.naam, gemeente: T.gemeente, stationType: T.stationType, status: T.status,
      planoloog: T.planoloog, uitvoerder: T.uitvoerder, startdatum: T.startdatum, deadline: T.deadline,
      opgeleverdOp: T.opgeleverdOp, gearchiveerd: T.gearchiveerd, zoekgebied: T.zoekgebied, analyse: T.analyse,
    })
    .from(T)
    .orderBy(desc(T.createdAt))
    .then((rs) => rs.map(({ analyse, ...r }) => ({ ...r, complexiteit: analyse?.complexiteit.klasse ?? null })));
}

export async function haal(id: string): Promise<Lqs | null> {
  const db = await getDb();
  const [r] = await db.select().from(T).where(eq(T.id, id));
  return (r as Lqs | undefined) ?? null;
}

export async function maak(inv: Partial<Lqs>): Promise<Lqs> {
  const db = await getDb();
  const nu = new Date();
  const jaar = nu.getFullYear();
  const aantal = (await db.select({ id: T.id }).from(T)).length;
  const type = STATION_TYPEN.find((t) => t.id === inv.stationType) ?? STATION_TYPEN[0];
  const start = inv.startdatum ?? nu.toISOString().slice(0, 10);
  const rij = {
    id: randomUUID(),
    code: `LQS-${jaar}-${String(aantal + 1).padStart(3, "0")}`,
    naam: inv.naam?.trim() || "Naamloos zoekgebied",
    gemeente: inv.gemeente ?? "",
    stationType: type.id,
    kavelB: inv.kavelB ?? type.kavelB,
    kavelL: inv.kavelL ?? type.kavelL,
    status: inv.zoekgebied ? "Analyse" : "Intake",
    planoloog: inv.planoloog ?? "",
    uitvoerder: inv.uitvoerder ?? "",
    startdatum: start,
    deadline: new Date(new Date(start).getTime() + DOORLOOPTIJD_DAGEN * 86400000).toISOString().slice(0, 10),
    zoekgebied: inv.zoekgebied ?? null,
    aansluitpunt: inv.aansluitpunt ?? null,
    aangedragen: inv.aangedragen ?? [],
    gewichten: STANDAARD_GEWICHTEN,
    review: { reviewer: "", items: REVIEW_PUNTEN.map((p) => ({ id: p.id, akkoord: false, opmerking: "" })) },
    historie: [{ status: inv.zoekgebied ? "Analyse" : "Intake", op: nu.toISOString() }],
    createdAt: nu.toISOString(),
    updatedAt: nu.toISOString(),
  };
  await db.insert(T).values(rij);
  return (await haal(rij.id))!;
}

const VELDEN = [
  "naam", "gemeente", "stationType", "kavelB", "kavelL", "status", "gearchiveerd", "planoloog", "uitvoerder", "startdatum", "deadline",
  "opgeleverdOp", "zoekgebied", "aansluitpunt", "aangedragen", "lagen", "eigenLagen", "gewichten", "analyse", "kandidaten",
  "voorkeurId", "voorkeurMotivatie", "teksten", "review", "colofon", "beelden", "klic", "historie",
] as const;

export async function wijzig(id: string, wijziging: Record<string, unknown>): Promise<Lqs | null> {
  const db = await getDb();
  const set: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const v of VELDEN) if (v in wijziging) set[v] = wijziging[v];
  if (set.status === "Opgeleverd" && !("opgeleverdOp" in set)) set.opgeleverdOp = new Date().toISOString().slice(0, 10);
  if ("status" in set && !("historie" in set)) {
    const huidig = await haal(id);
    if (huidig && huidig.status !== set.status) set.historie = [...(huidig.historie ?? []), { status: set.status, op: new Date().toISOString() }];
  }
  // andere kavelmaat (bv. een kleiner stationstype): de kavels van de bestaande locaties krimpen mee, zodat kaart, 3D-beeld
  // en rapport geen terrein tonen dat het station niet nodig heeft; past de nieuwe maat niet, dan blijft de kavel staan
  if (("kavelB" in set || "kavelL" in set) && !("kandidaten" in set)) {
    const huidig = await haal(id);
    if (huidig?.kandidaten?.length) {
      const B = Number(set.kavelB ?? huidig.kavelB), L = Number(set.kavelL ?? huidig.kavelL);
      let gewijzigd = false;
      const kandidaten = huidig.kandidaten.map((k) => { const n = krimpKavel(k, B, L); if (n) gewijzigd = true; return n ?? k; });
      if (gewijzigd) set.kandidaten = kandidaten;
    }
  }
  await db.update(T).set(set).where(eq(T.id, id));
  return haal(id);
}

// --- meekijkportaal voor de opdrachtgever ---
const P = schema.portaal;

export async function portaalToken(): Promise<string | null> {
  const db = await getDb();
  const [r] = await db.select().from(P).where(eq(P.id, "opdrachtgever"));
  return r?.token ?? null;
}

/** Maakt een nieuwe meekijklink; een eerdere link vervalt daarmee. */
export async function maakPortaal(): Promise<string> {
  const db = await getDb();
  const token = randomBytes(24).toString("base64url");
  await db.delete(P).where(eq(P.id, "opdrachtgever"));
  await db.insert(P).values({ id: "opdrachtgever", token, aangemaakt: new Date().toISOString() });
  return token;
}

export async function trekPortaalIn() {
  const db = await getDb();
  await db.delete(P).where(eq(P.id, "opdrachtgever"));
}

export async function portaalGeldig(token: string) {
  const t = await portaalToken();
  return !!t && t === token;
}

const ZICHTBAAR = ["Rapport", "Review", "Opgeleverd"];

/** Wat de opdrachtgever van één LQS ziet. Geen aangeleverde geodata, geen namen van eigenaren, geen AI-voorstellen;
 *  locaties pas vanaf de rapportfase, teksten pas na oplevering. */
export function voorMeekijker(l: Lqs) {
  const toon = ZICHTBAAR.includes(l.status);
  const klaar = l.status === "Opgeleverd";
  return {
    id: l.id, code: l.code, naam: l.naam, gemeente: l.gemeente, stationType: l.stationType, kavelB: l.kavelB, kavelL: l.kavelL, status: l.status,
    planoloog: l.planoloog, uitvoerder: l.uitvoerder, startdatum: l.startdatum, deadline: l.deadline, opgeleverdOp: l.opgeleverdOp,
    zoekgebied: l.zoekgebied, aansluitpunt: l.aansluitpunt, historie: l.historie ?? [], gewichten: l.gewichten,
    analyse: l.analyse ? { uitgevoerdOp: l.analyse.uitgevoerdOp, oppZoekgebiedM2: l.analyse.oppZoekgebiedM2, uitgeslotenM2: l.analyse.uitgeslotenM2, inpasbaarM2: l.analyse.inpasbaarM2, complexiteit: l.analyse.complexiteit } : null,
    kandidaten: toon ? l.kandidaten.map(({ feiten: _f, eigendom: _e, voorstel: _v, leidingen: _l, ...k }) => k) : [],
    aantalLocaties: l.kandidaten.length,
    voorkeurId: toon ? l.voorkeurId : null,
    voorkeurMotivatie: toon ? l.voorkeurMotivatie : "",
    advies: klaar ? (l.teksten.advies ?? "") : "",
    vervolg: klaar ? (l.teksten.vervolg ?? "") : "",
    reviewer: klaar ? l.review.reviewer : "",
  };
}
export type Meekijk = ReturnType<typeof voorMeekijker>;

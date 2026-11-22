import { sql } from "drizzle-orm";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema";

// Zonder DATABASE_URL draait de app op een lokale Postgres (PGlite) in ./.data.
// Met DATABASE_URL (Neon) wordt dezelfde schema-definitie gebruikt.
type Db = PgliteDatabase<typeof schema>;

const DDL = [`CREATE TABLE IF NOT EXISTS lqs (
  id text PRIMARY KEY, code text NOT NULL, naam text NOT NULL, gemeente text NOT NULL DEFAULT '',
  station_type text NOT NULL, kavel_b integer NOT NULL, kavel_l integer NOT NULL,
  status text NOT NULL DEFAULT 'Intake', gearchiveerd boolean NOT NULL DEFAULT false,
  planoloog text NOT NULL DEFAULT '', uitvoerder text NOT NULL DEFAULT '',
  startdatum text NOT NULL, deadline text NOT NULL, opgeleverd_op text,
  zoekgebied jsonb, aansluitpunt jsonb, aangedragen jsonb NOT NULL DEFAULT '[]',
  lagen jsonb NOT NULL DEFAULT '{}', eigen_lagen jsonb NOT NULL DEFAULT '[]', gewichten jsonb NOT NULL DEFAULT '{}',
  analyse_resultaat jsonb, kandidaten jsonb NOT NULL DEFAULT '[]', voorkeur_id text, voorkeur_motivatie text NOT NULL DEFAULT '',
  teksten jsonb NOT NULL DEFAULT '{}', review jsonb NOT NULL DEFAULT '{"reviewer":"","items":[]}',
  created_at text NOT NULL, updated_at text NOT NULL
)`,
  `ALTER TABLE lqs ADD COLUMN IF NOT EXISTS historie jsonb NOT NULL DEFAULT '[]'`,
  `ALTER TABLE lqs ADD COLUMN IF NOT EXISTS colofon jsonb NOT NULL DEFAULT '{}'`,
  `ALTER TABLE lqs ADD COLUMN IF NOT EXISTS beelden jsonb NOT NULL DEFAULT '{}'`,
  `ALTER TABLE lqs ADD COLUMN IF NOT EXISTS klic jsonb NOT NULL DEFAULT '{}'`,
  // kavelmaten uit de Enexis-template zijn niet geheel (20,3 × 17,7 m)
  `ALTER TABLE lqs ALTER COLUMN kavel_b TYPE real`,
  `ALTER TABLE lqs ALTER COLUMN kavel_l TYPE real`,
  `CREATE TABLE IF NOT EXISTS portaal (id text PRIMARY KEY, token text NOT NULL, aangemaakt text NOT NULL)`,
];

async function open(): Promise<Db> {
  let db: Db;
  if (process.env.DATABASE_URL) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    db = drizzle(neon(process.env.DATABASE_URL), { schema }) as unknown as Db;
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(".data", { recursive: true });
    db = drizzle(new PGlite(".data/pglite"), { schema });
  }
  return db;
}

// De verbinding blijft bij hot reload bestaan; het schema wordt opnieuw bijgewerkt zodra DDL_VERSIE verandert.
const DDL_VERSIE = 3;
const g = globalThis as unknown as { __lqsDb?: Promise<Db>; __lqsSchema?: Promise<Db>; __lqsSchemaVersie?: number };
export function getDb(): Promise<Db> {
  if (!g.__lqsSchema || g.__lqsSchemaVersie !== DDL_VERSIE) {
    g.__lqsSchemaVersie = DDL_VERSIE;
    g.__lqsSchema = (g.__lqsDb ??= open()).then(async (db) => {
      for (const stap of DDL) await db.execute(sql.raw(stap));
      return db;
    });
  }
  return g.__lqsSchema;
}
export { schema };

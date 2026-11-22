import { boolean, integer, jsonb, pgTable, real, text } from "drizzle-orm/pg-core";
import type { AangedragenLocatie, Colofon, Analyse, EigenLaag, Kandidaat, LaagInstelling, LngLat, Polygoon, ReviewItem, KlicInfo } from "../types";

export const lqs = pgTable("lqs", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  naam: text("naam").notNull(),
  gemeente: text("gemeente").notNull().default(""),
  stationType: text("station_type").notNull(),
  kavelB: real("kavel_b").notNull(),
  kavelL: real("kavel_l").notNull(),
  status: text("status").notNull().default("Intake"),
  gearchiveerd: boolean("gearchiveerd").notNull().default(false),
  planoloog: text("planoloog").notNull().default(""),
  uitvoerder: text("uitvoerder").notNull().default(""),
  startdatum: text("startdatum").notNull(),
  deadline: text("deadline").notNull(),
  opgeleverdOp: text("opgeleverd_op"),
  zoekgebied: jsonb("zoekgebied").$type<Polygoon | null>(),
  aansluitpunt: jsonb("aansluitpunt").$type<LngLat | null>(),
  aangedragen: jsonb("aangedragen").$type<AangedragenLocatie[]>().notNull().default([]),
  lagen: jsonb("lagen").$type<Record<string, LaagInstelling>>().notNull().default({}),
  eigenLagen: jsonb("eigen_lagen").$type<EigenLaag[]>().notNull().default([]),
  gewichten: jsonb("gewichten").$type<Record<string, number>>().notNull().default({}),
  analyse: jsonb("analyse_resultaat").$type<Analyse | null>(),
  kandidaten: jsonb("kandidaten").$type<Kandidaat[]>().notNull().default([]),
  voorkeurId: text("voorkeur_id"),
  voorkeurMotivatie: text("voorkeur_motivatie").notNull().default(""),
  teksten: jsonb("teksten").$type<Record<string, string>>().notNull().default({}),
  review: jsonb("review").$type<{ reviewer: string; items: ReviewItem[] }>().notNull().default({ reviewer: "", items: [] }),
  historie: jsonb("historie").$type<{ status: string; op: string }[]>().notNull().default([]),
  colofon: jsonb("colofon").$type<Colofon>().notNull().default({}),
  beelden: jsonb("beelden").$type<Record<string, string>>().notNull().default({}),
  klic: jsonb("klic").$type<KlicInfo>().notNull().default({}),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// Meekijklink voor de opdrachtgever: wie de token heeft, ziet de voortgang (alleen lezen).
export const portaal = pgTable("portaal", {
  id: text("id").primaryKey(),
  token: text("token").notNull(),
  aangemaakt: text("aangemaakt").notNull(),
});

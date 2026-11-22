export type LngLat = [number, number];
export type Polygoon = { type: "Polygon"; coordinates: number[][][] };

export type LaagSoort = "uitsluiten" | "aandacht" | "uit";

export type LaagInstelling = { soort: LaagSoort; buffer: number };

export type EigenLaag = {
  id: string;
  naam: string;
  soort: LaagSoort;
  buffer: number;
  vertrouwelijk: boolean;
  /** net = net van de netbeheerder (aansluiten én ligging); leidingen = kabels en leidingen van derden (KLIC) */
  functie?: "" | "net" | "leidingen";
  geojson: unknown;
};

export type LaagResultaat = {
  id: string;
  naam: string;
  thema: string;
  bron: string;
  soort: LaagSoort;
  buffer: number;
  aantal: number;
  oppM2: number;
  pct: number;
  status: "ok" | "fout";
  fout?: string;
  kleur: string;
};

export type AutoScore = { waarde: number | null; score: number; toelichting: string };
/** ai = true: score en motivatie zijn ongewijzigd overgenomen uit het AI-voorstel */
export type HandScore = { score: number | null; notitie: string; ai?: boolean };

export type Feiten = {
  opgehaaldOp: string;
  bestemmingen: { naam: string; hoofdgroep: string; plan: string; status: string; link: string }[];
  dubbelbestemmingen: { naam: string; link: string }[];
  gebiedsaanduidingen: string[];
  /** panden/gebruik: bebouwing op het perceel (BAG); vorm en kavelAandeel (%) zijn afgeleid uit de perceelgrens */
  percelen: { aanduiding: string; oppM2: number; panden?: number; gebruik?: string[]; vorm?: "compact" | "langgerekt"; kavelAandeel?: number }[];
  grondgebruik: string[];
  /** Dichtstbijzijnde Natura 2000-gebied binnen 10 km (null = geen binnen 10 km; ontbreekt = niet opgehaald) */
  natura?: { naam: string; afstand: number } | null;
  fouten: string[];
};

/** Stand van de KLIC-gegevens bij een LQS: de ingelezen levering en, bij de automatische route, de aanvraag bij het Kadaster. */
export type KlicInfo = {
  meldnummer?: string;
  ingelezenOp?: string;
  /** simulatie = verzonnen leidingen voor een demo, geen levering van het Kadaster */
  bron?: "upload" | "kadaster" | "simulatie";
  /** geleverd = false: deze netbeheerder heeft (nog) geen gegevens aangeleverd, de levering is dus onvolledig */
  netbeheerders?: { code: string; naam: string; geleverd: boolean | null }[];
  themas?: { thema: string; naam: string; leidingen: number }[];
  aanvraag?: {
    postId: string;
    pollUrl: string;
    omgeving: "test" | "productie";
    ingediendOp: string;
    status: string;
    giAanvraagId?: string;
    melding?: string;
  };
};

export type Eigenaar = { type: string; naam: string };

export type Voorstel = { score: number | null; motivatie: string; zekerheid: "hoog" | "midden" | "laag"; controleer: string };

/** Kabeltracé van de kavel naar het aansluitpunt of het aangeleverde net, met kostenindicatie (zie TRACE in config) */
export type Trace = {
  lijn: LngLat[];
  doel: string;
  lengte: number;
  hemelsbreed: number;
  langsWeg: number;
  overig: number;
  boring: number;
  kosten: number;
};

export type Oordeel = "groen" | "oranje" | "rood";
/** Door de opsteller ingevulde velden van de Enexis-template; lege velden vallen terug op de afleiding in sjabloon.ts */
export type SjabloonInvulling = { velden: Record<string, string>; oordelen: Record<string, Oordeel> };
export type Colofon = { plaats?: string; projectnummer?: string; versie?: string; specialist?: string; email?: string };

export type Beeld = { bearing: number; pitch: number; zoom: number; beplanting: boolean; gevel?: string; stijl?: "realistisch" | "schematisch" };

export type Kandidaat = {
  id: string;
  naam: string;
  bron: "analyse" | "aangedragen";
  punt: LngLat;
  rd: [number, number];
  /** Hoekpunten in volgorde; de eerste rand is de voorzijde (wegzijde) */
  kavel: Polygoon;
  /** Hoe de kavel is gericht, bv. "lange zijde evenwijdig aan de weg" */
  ligging?: string;
  adres?: string;
  inUitgesloten: string[];
  auto: Record<string, AutoScore>;
  handmatig: Record<string, HandScore>;
  feiten?: Feiten;
  /** Ligging van aangeleverde kabel- en leidinglagen ten opzichte van de kavel */
  leidingen?: { laag: string; afstand: number; inKavel: boolean }[];
  /** Eigendom per kadastraal perceel (sleutel = perceelaanduiding), ingevuld uit Kadaster-informatie */
  eigendom?: Record<string, Eigenaar>;
  voorstel?: Record<string, Voorstel>;
  trace?: Trace | null;
  /** Vastgelegd aanzicht van het 3D-beeld voor het rapport */
  beeld?: Beeld;
  /** Invulling van de locatiepagina in de Enexis-template */
  sjabloon?: SjabloonInvulling;
};

export type Analyse = {
  uitgevoerdOp: string;
  duurMs: number;
  cel: number;
  hoeken: LngLat[];
  overlay: string;
  oppZoekgebiedM2: number;
  uitgeslotenM2: number;
  vrijM2: number;
  inpasbaarM2: number;
  lagen: LaagResultaat[];
  /** Kaartbeeld per thema voor het hoofdstuk Ruimtelijke context */
  themas?: { naam: string; overlay: string; lagen: string[] }[];
  complexiteit: { klasse: "Laag" | "Midden" | "Hoog"; punten: number; toelichting: string[] };
};

export type AangedragenLocatie = { naam: string; punt: LngLat };

export type ReviewItem = { id: string; akkoord: boolean; opmerking: string };

export type Lqs = {
  id: string;
  code: string;
  naam: string;
  gemeente: string;
  stationType: string;
  kavelB: number;
  kavelL: number;
  status: string;
  gearchiveerd: boolean;
  planoloog: string;
  uitvoerder: string;
  startdatum: string;
  deadline: string;
  opgeleverdOp: string | null;
  zoekgebied: Polygoon | null;
  aansluitpunt: LngLat | null;
  aangedragen: AangedragenLocatie[];
  lagen: Record<string, LaagInstelling>;
  eigenLagen: EigenLaag[];
  klic: KlicInfo;
  gewichten: Record<string, number>;
  analyse: Analyse | null;
  kandidaten: Kandidaat[];
  voorkeurId: string | null;
  voorkeurMotivatie: string;
  teksten: Record<string, string>;
  review: { reviewer: string; items: ReviewItem[] };
  colofon: Colofon;
  /** Geüploade beelden voor de template, sleutel = kandidaat-id + ":streetview" of ":klic" (data-URL) */
  beelden: Record<string, string>;
  /** Statuswijzigingen met datum, voor de doorlooptijd per fase */
  historie: { status: string; op: string }[];
  createdAt: string;
  updatedAt: string;
};

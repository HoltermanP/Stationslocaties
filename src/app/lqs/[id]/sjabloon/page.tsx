"use client";
// Rapport in de standaardtemplate LQS van Enexis (liggend A4): omslag, colofon, inleiding, projectpaspoort,
// ruimtelijke context, kansrijke gebieden, één pagina per locatie, overzicht en advies.
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { GebouwSchets, PerceelSchets } from "@/components/Maatschets";
import Plaat, { omvat, rondom, type Bbox } from "@/components/Plaat";
import { api } from "@/lib/api";
import { GEVELS, STATION_TYPEN, TRACE } from "@/lib/config";
import { CONSTATERINGEN, FACTOREN, TECHNIEK, VRIJ, letterVan, sjabloonVan } from "@/lib/sjabloon";
import type { Kandidaat, Lqs, Oordeel } from "@/lib/types";

const Kaart3D = dynamic(() => import("@/components/Kaart3D"), { ssr: false });

const STIJL = `
@page { size: 297mm 210mm; margin: 0; }
.sj { font-family: Arial, Helvetica, sans-serif; color: #595959; font-size: 12px; line-height: 1.25; }
.sj .blad { position: relative; width: 1122px; height: 793px; background: #fff; margin: 0 auto 24px; overflow: hidden; box-shadow: 0 1px 8px rgb(0 0 0 / .25); break-after: page; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.sj .in { position: absolute; inset: 48px 55px 58px 55px; }
.sj h1 { font: 700 27px "Trebuchet MS", Arial, sans-serif; color: #E5007D; margin: 0 0 14px; }
.sj h2 { font: 400 17px "Trebuchet MS", Arial, sans-serif; color: #E5007D; margin: 14px 0 1px; }
.sj h3 { font: 700 14px Arial, sans-serif; color: #E5007D; margin: 0; padding: 0 0 1px 8px; border-bottom: 1px solid #a6a6a6; }
.sj p { margin: 0 0 9px; text-align: justify; }
.sj .voet { position: absolute; left: 55px; right: 55px; bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 12px; }
.sj .voet img { height: 34px; }
.sj table.rij { border-collapse: collapse; margin-bottom: 20px; }
.sj table.rij td { padding: 1.5px 8px; vertical-align: top; }
.sj table.rij td.l { width: 212px; border-right: 1px solid #595959; white-space: nowrap; }
.sj .leeg { color: #c2410c; font-style: italic; }
.sj .bij { font-style: italic; font-size: 10.5px; margin-top: 3px; }
.sj table.ov { border-collapse: collapse; width: 100%; font-size: 12px; }
.sj table.ov td, .sj table.ov th { border: 1px solid #d9d9d9; padding: 3px 6px; text-align: center; height: 28px; }
.sj table.ov th { font: 700 14px Arial; color: #E5007D; }
.sj table.ov td.l { text-align: left; width: 205px; }
.sj table.ov td.g { text-align: left; background: #f2f2f2; font: 700 14px Arial; color: #E5007D; }
@media print { .sj .blad { margin: 0; box-shadow: none; } .sj { background: #fff; } }
`;

const KLEUR: Record<Oordeel, [string, string]> = { groen: ["#00D26A", "✓"], oranje: ["#F59E0B", "!"], rood: ["#E11D48", "✕"] };
function Vink({ o }: { o: Oordeel }) {
  return <span title={o} style={{ display: "inline-block", width: 13, height: 13, borderRadius: 3, background: KLEUR[o][0], color: "#fff", font: "700 10px/13px Arial", textAlign: "center", verticalAlign: "-2px" }}>{KLEUR[o][1]}</span>;
}
const Waarde = ({ t }: { t: string }) => (t ? <>{t}</> : <span className="leeg">nog invullen</span>);
const getal = (n: number) => n.toLocaleString("nl-NL");
const opp = (m2: number) => getal(m2 > 100 ? Math.round(m2 / 10) * 10 : Math.round(m2));
const komma = (n: number) => n.toLocaleString("nl-NL", { maximumFractionDigits: 1 });

export default function SjabloonRapport() {
  const { id } = useParams<{ id: string }>();
  const [l, setL] = useState<Lqs | null>(null);
  const [fout, setFout] = useState("");
  useEffect(() => { api<Lqs>(`/api/lqs/${id}`).then(setL).catch((e) => setFout(e.message)); }, [id]);
  if (!l) return <p className="p-6 text-sm text-slate-600">{fout || "Laden…"}</p>;

  const a = l.analyse;
  const c = l.colofon ?? {};
  const type = STATION_TYPEN.find((t) => t.id === l.stationType) ?? STATION_TYPEN[0];
  const tvs = type.id === "tvs" || type.id === "tvs20"; // zelfde gebouw; de flyer-variant heeft een kleiner ruimtebeslag
  const sjabloonBeeld = type.id === "tvs"; // de afbeeldingen uit de template horen bij de templatematen
  const perceelOpp = Number.isInteger(l.kavelB * l.kavelL) ? getal(l.kavelB * l.kavelL) : opp(l.kavelB * l.kavelL);
  const kort = tvs ? "TVS" : type.naam.split(" (")[0].toLowerCase();
  const plaats = c.plaats || l.naam;
  const nummer = c.projectnummer || l.code;
  const versie = c.versie || "V1.0";
  const datum = new Date(l.opgeleverdOp ?? Date.now()).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
  const rapportnaam = `Locatie QuickScan ${l.gemeente || "[gemeente]"}, ${plaats}.`;
  const ks = l.kandidaten;
  const labels = Object.fromEntries(ks.map((k) => [k.id, letterVan(l, k)]));
  const voorkeur = ks.find((k) => k.id === l.voorkeurId) ?? null;
  const gebied: Bbox | null = l.zoekgebied ? omvat(l.zoekgebied) : null;
  const tekst = (sid: string, leeg: string) => { const ps = (l.teksten[sid] ?? "").split(/\n+/).filter(Boolean); return ps.length ? ps.map((p, i) => <p key={i}>{p}</p>) : <p className="leeg">{leeg}</p>; };
  const gkey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

  // --- kaarten voor het hoofdstuk Ruimtelijke context ---
  const locatieLegenda = [{ naam: "Onderzochte locatie", kleur: "#E5007D" }, ...(voorkeur ? [{ naam: "★ Voorkeurslocatie", kleur: "#00A651" }] : [])];
  const laagNaam = (lid: string) => { const x = a?.lagen.find((y) => y.id === lid); return x ? { naam: `${x.naam}${x.buffer ? ` (buffer ${x.buffer} m)` : ""}${x.soort === "aandacht" ? ", aandacht" : ""}: ${x.pct.toFixed(1)}%`, kleur: x.kleur } : null; };
  type KaartDef = { titel: string; legenda: { naam: string; kleur: string }[]; plaat: (w: number, h: number) => ReactNode };
  const kaarten: KaartDef[] = [];
  if (gebied && l.zoekgebied) {
    const basis = { bbox: gebied, zoekgebied: l.zoekgebied, aansluitpunt: l.aansluitpunt, kandidaten: ks, labels, voorkeurId: l.voorkeurId };
    kaarten.push({ titel: "Zoekgebied op de luchtfoto", legenda: [{ naam: "Zoekgebied", kleur: "#E5007D" }, ...locatieLegenda], plaat: (w, h) => <Plaat w={w} h={h} basis="lucht" {...basis} /> });
    kaarten.push({ titel: "Regels op de kaart: enkelbestemmingen (Ruimtelijke plannen, stand vóór de Omgevingswet)", legenda: [{ naam: "Zoekgebied", kleur: "#E5007D" }, ...locatieLegenda], plaat: (w, h) => <Plaat w={w} h={h} rustig lagen={[{ id: "plu", dekking: 0.65 }]} {...basis} /> });
    if (a) {
      const themas = a.themas?.length ? a.themas : [{ naam: "Belemmeringen (alle thema's)", overlay: a.overlay, lagen: a.lagen.filter((x) => x.soort !== "uit").map((x) => x.id) }];
      for (const t of themas)
        kaarten.push({ titel: `Thema ${t.naam.toLowerCase()}`, legenda: [...t.lagen.map(laagNaam).filter((x) => !!x), ...locatieLegenda], plaat: (w, h) => <Plaat w={w} h={h} rustig overlay={{ src: t.overlay, hoeken: a.hoeken }} {...basis} /> });
    }
  }

  // --- bladen ---
  type Blad = { kop?: string; sub?: boolean; kaal?: boolean; el: ReactNode };
  const bladen: Blad[] = [];

  bladen.push({ kaal: true, el: (
    <>
      {/* eslint-disable @next/next/no-img-element */}
      <img alt="" src="/sjabloon/omslag.jpg" style={{ position: "absolute", left: 52, top: 46, width: 1018, height: 700, objectFit: "cover" }} />
      <div style={{ position: "absolute", left: 95, top: 96, font: '700 31px "Trebuchet MS", Arial', color: "#E5007D" }}>LOCATIE QUICKSCAN</div>
      <img alt="" src="/sjabloon/omslagvlak.png" style={{ position: "absolute", right: 28, bottom: 24, width: 342, height: 252 }} />
      <div style={{ position: "absolute", right: 28, bottom: 24, width: 342, height: 252, color: "#fff", font: '700 21px/1.45 "Trebuchet MS", Arial', padding: "26px 0 0 24px" }}>
        <div>Locatie QuickScan</div><div>{plaats}</div>
        <div style={{ marginTop: 36 }}>Gemeente {l.gemeente}</div><div>{nummer}</div><div>{versie}</div>
        <img alt="Enexis Netbeheer" src="/sjabloon/beeldmerk.png" style={{ position: "absolute", right: 14, bottom: 4, width: 132 }} />
      </div>
    </>
  ) });

  const inhoud: ReactNode[] = []; // gevuld nadat de paginanummers bekend zijn
  bladen.push({ el: (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, paddingTop: 50, paddingLeft: 40 }}>
      <div>
        <h1>Colofon</h1>
        <h2>Projectgegevens</h2>Rapportnaam: {rapportnaam}<br /><br />Projectnummer: {nummer}<br />Status: {l.status === "Opgeleverd" ? "Definitief" : "Concept"}<br /><br />Datum: {datum}<br />Versie: {versie}
        <h2>Projectlocatie</h2>Gemeente: {l.gemeente}
        <h2>Station</h2>{type.naam.split(" (")[0]}
        <h2>Contactgegevens Enexis</h2>Afdeling: Energiesysteem &amp; Omgeving Enexis<br />Specialist: {c.specialist || l.planoloog}<br />Correspondentie: <i><u>{c.email || "voor.achternaam@enexis.nl"}</u></i>
      </div>
      <div><h1>Inhoudsopgave</h1>{inhoud}</div>
      <div style={{ gridColumn: "1 / 3", fontSize: 10.5, marginTop: 150 }}>
        © {datum} Enexis<br /><i>Alle rechten voorbehouden. Niets uit deze uitgave mag worden verveelvoudigd door middel van druk, fotokopie, microfilm, geluidsband, elektronisch of op welke andere wijze dan ook, en evenmin in een geautomatiseerd gegevensbestand worden opgeslagen, zonder voorafgaande schriftelijke toestemming van Enexis. Aan de inhoud van dit rapport kunnen geen rechten worden ontleend. Enexis verwerpt elke aansprakelijkheid voor een ander gebruik van deze tekst dan voor de situatie waarvoor deze wordt uitgebracht. De informatie in deze tekst is onder voorbehoud en kan worden veranderd zonder voorafgaande kennisgeving.</i>
      </div>
    </div>
  ) });

  bladen.push({ kop: "Inleiding", el: (
    <div style={{ paddingLeft: 40, paddingTop: 50 }}>
      <h1>Inleiding</h1>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48 }}>
        <div>
          <h2 style={{ marginTop: 0 }}>Wat is een locatie QuickScan &amp; Doel</h2>
          <p>Enexis werkt met een Locatie QuickScan (LQS) om de meest geschikte locatie voor een middenspanningsstation (MS) inzichtelijk te maken. Er wordt vanuit net-technische voorwaarden een ruimtelijke afweging gemaakt zodat impact van het station beperkt blijft op de omgeving. Het doel van de LQS is om middels een gebiedsanalyse, gewogen op ruimtelijke en technische aspecten, te komen tot een selectie van geschikte locaties voor het gewenste MS/MS-station. Hieruit wordt advies gegeven over een voorkeurslocatie om voor te leggen aan het bevoegd gezag voor verdere uitwerking.</p>
          <h2>Werkwijze</h2>
          <p>Voor de start van de LQS levert asset management een zoekgebied aan om het gebied aan te geven waar zij een nieuw station wil realiseren. De zoekcirkel is de basis van de gebiedsanalyse. Vervolgens wordt door middel van relevante thema’s en kaartlagen inzichtelijk gemaakt welke delen van het zoekgebied ongeschikt zijn voor het station. Uit de overgebleven geschikte ruimte, worden kansrijke gebieden voorgedragen. Deze kansrijke gebieden worden nader geanalyseerd op specifieke ruimtelijke aspecten. Er wordt dan gewerkt naar een voorkeursgebied. Binnen dit voorkeursgebied wordt in overleg met het bevoegd gezag een locatie gekozen, dit valt buiten deze LQS. In specifieke gevallen kan het zo zijn dat er in het voortraject van dit project al gesproken is met het bevoegd gezag en Enexis, of dat er vanuit engineering binnen Enexis al gezocht is naar locaties. Dit kan geresulteerd hebben in specifiek aangedragen locaties die ook onderzocht moeten worden in deze LQS.</p>
        </div>
        <div>
          <h2 style={{ marginTop: 0 }}>Leeswijzer</h2>
          <p><b>Hoofdstuk 1: Projectpaspoort</b><br />Dit hoofdstuk biedt een overzicht van de projectscope, een uitleg van het zoekproces en de belangrijkste bevindingen en aanbevelingen van het rapport.</p>
          <p><b>Hoofdstuk 2: Ruimtelijke context</b><br />Schets de ruimtelijke context, doormiddel van kaarten, in en rondom de zoekcirkel op verschillende thema’s die relevant zijn voor het realiseren van een MS/MS-station.</p>
          <p><b>Hoofdstuk 3: Kansrijke gebieden</b><br />Op basis van verschillende ruimtelijke en technische criteria worden de kansrijke gebieden per locatie uiteengezet.</p>
          <p><b>Hoofdstuk 4: Advies</b><br />Een advies voor een voorkeurslocatie, op basis van de geanalyseerde locaties.</p>
          <p><b>Bijlagen</b><br />Bijlagen met aanvullende details zoals toelichting en specificaties van de technische installaties. Deze wordt apart verstuurd.</p>
        </div>
      </div>
      <img alt="Zoekcirkel, kansrijke gebieden, voorkeursgebied, gekozen locatie" src="/sjabloon/pijlen.png" style={{ width: 920, marginTop: 14 }} />
    </div>
  ) });

  const pp = { kop: { font: '400 13px "Trebuchet MS", Arial', color: "#5C1F3D", margin: "0 0 0" }, roze: "#F28CBB" };
  const stap = (n: number, titel: string, t: string) => (
    <div style={{ display: "flex", gap: 9, marginBottom: 10 }}>
      <span style={{ flex: "none", width: 15, height: 15, marginTop: 9, borderRadius: 9, background: pp.roze, color: "#fff", font: "700 9px/15px Arial", textAlign: "center" }}>{n}</span>
      <div><div style={{ color: pp.roze }}>{titel}</div>{t}</div>
    </div>
  );
  const maat = (rijen: [string, string][], titel: string) => (
    <table style={{ borderCollapse: "collapse", width: 215 }}><tbody>
      <tr><td colSpan={2} style={{ font: '700 11px "Trebuchet MS", Arial', color: pp.roze, borderBottom: "1px solid #a6a6a6" }}>{titel}</td></tr>
      {rijen.map(([k, w]) => <tr key={k}><td style={{ borderRight: "1px solid #a6a6a6" }}>{k}</td><td style={{ paddingLeft: 6, width: 46 }}>{w}</td></tr>)}
    </tbody></table>
  );
  bladen.push({ kop: "Projectpaspoort", kaal: true, el: (
    <div style={{ position: "absolute", inset: 0, background: "#FDEEF4", padding: "34px 36px", fontSize: 10.5, lineHeight: 1.2, color: "#5a4a52" }}>
      <div style={{ font: '700 20px "Trebuchet MS", Arial', color: "#5C1F3D", marginTop: 14 }}>Projectpaspoort</div>
      <div style={{ margin: "8px 0 12px" }}>
        {[["Projectnaam", rapportnaam], ["Datum", datum], ["Kenmerk Enexis", nummer], ["Gemeente", l.gemeente]].map(([k, w]) => <div key={k}><span style={{ color: pp.roze }}>{k}: </span>{w}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "330px 330px 1fr", gap: 34 }}>
        <div>
          <div style={pp.kop}>Nut &amp; Noodzaak</div>
          <p>Door de energietransitie staat het elektriciteitsnet in het verzorgingsgebied van Enexis Netbeheer steeds meer onder druk. De vraag naar capaciteit groeit sterk door de elektrificatie van industrie en mobiliteit en de toename van duurzame energieopwekking. Als netbeheerder is Enexis wettelijk verplicht klanten tijdig aan te sluiten en een betrouwbaar netwerk te waarborgen. Zonder netuitbreiding dreigt congestie: een tekort aan transportcapaciteit. Hierdoor kunnen nieuwe klanten niet worden aangesloten en bestaande klanten hun capaciteit niet uitbreiden. Ook kunnen spanningsproblemen en congestie de netstabiliteit aantasten, met risico’s voor bedrijven en huishoudens.</p>
          <p>Enexis is voornemens een nieuw {kort} te bouwen.</p>
          <div style={pp.kop}>Beschrijving te realiseren station</div>
          {tvs ? (
            <>
              <p>Voor het plaatsen van de bouwwerken is {perceelOpp}m² grondoppervlak gewenst. Binnen het TVS staat een technische installatie met {type.velden} velden voor de aansluiting van het station en afgaande kabels voor het verzorgingsgebied. Voor dit MS/MS-station is geen transformator noodzakelijk. De middenspanning wordt niet getransformeerd naar een lager spanningsniveau.</p>
              <p>Er staan twee airconditioningsunits op het dak van het TVS. Aan de voorkant van het TVS is ruimte noodzakelijk voor de eerste meters van het kabeltracé. Kabels hebben ruimte nodig om te nivelleren van 1,8 naar 0,8 meter en om gebundeld tot één tracé. Bij volledige benutting is er een kabeltracé met een breedte van 7 meter dat het perceel verlaat wanneer alle kabels dezelfde windrichting uitgaan.</p>
            </>
          ) : <p>Voor het plaatsen van de bouwwerken is {opp(l.kavelB * l.kavelL)}m² grondoppervlak gewenst ({komma(l.kavelL)} × {komma(l.kavelB)} m). Aan de voorkant van het station is ruimte noodzakelijk voor de eerste meters van het kabeltracé.</p>}
          <div style={{ ...pp.kop, margin: "18px 0 8px" }}>Stationsgegevens</div>
          <div style={{ display: "flex", gap: 30, alignItems: "center" }}>
            {sjabloonBeeld ? <img alt="" src="/sjabloon/gebouw.png" style={{ width: 120 }} /> : type.gebouw.trafos ? <span style={{ width: 120 }} /> : <GebouwSchets gebouw={type.gebouw} kleur={GEVELS[0].kleur} breedte={130} />}
            {maat([["Lengte (m)", komma(type.gebouw.l)], ["Breedte (m)", komma(type.gebouw.b)], ...(sjabloonBeeld ? [] : [["Hoogte (m)", komma(type.gebouw.h)] as [string, string]]), ...(type.gebouw.kelder ? [["Diepte (m)", komma(type.gebouw.kelder)] as [string, string]] : []), ["Grondoppervlakte gebouw (m²)", opp(type.gebouw.l * type.gebouw.b)]], "Afmetingen gebouw")}
          </div>
          <div style={{ display: "flex", gap: 30, alignItems: "flex-start", marginTop: 14 }}>
            {sjabloonBeeld ? <img alt="" src="/sjabloon/perceel.png" style={{ width: 120, mixBlendMode: "multiply" }} /> : type.gebouw.trafos ? <span style={{ width: 120 }} /> : <PerceelSchets gebouw={type.gebouw} kavelB={l.kavelB} kavelL={l.kavelL} velden={type.velden} breedte={130} />}
            {maat([["Lengte (m)", komma(l.kavelL)], ["Breedte (m)", komma(l.kavelB)], ["Grondoppervlakte (m²)", perceelOpp]], "Afmetingen perceel")}
          </div>
        </div>
        <div>
          <div style={pp.kop}>Zoekproces</div>
          <p style={{ textAlign: "left" }}>Het zoekgebied wordt stapsgewijs nader geanalyseerd om de beschikbare ruimte inzichtelijke te maken.</p>
          {stap(1, "Uitgesloten ruimte inzichtelijk maken", "Onbruikbare zones worden geïdentificeerd zodat potentiële beschikbare ruimte inzichtelijk gemaakt wordt.")}
          {stap(2, "Kansrijke gebieden inzichtelijk maken", "Kansen binnen de niet uitgesloten locaties inzichtelijk maken.")}
          {stap(3, "Ruimtelijk afwegen tot kansrijke gebieden", "De beschikbare ruimte wordt verder gefilterd door ruimtelijke belangen, zoals omgeving en bevoegd gezag, af te wegen. Zo wordt weerstand beperkt.")}
          {stap(4, "Afwegen per gebied", "Per kansrijk gebied worden relevante kaartregels en omgevingsfactoren, waaronder ecologie, archeologie en landschappelijke inpassing, onderzocht. Hiermee worden aandachtspunten en beleidskaders vastgesteld.")}
          {stap(5, "Advies", "In overleg met het Enexis-projectteam en bevoegd gezag, wordt een definitieve keuze voor de voorkeurslocatie bepaald.")}
          <div style={{ ...pp.kop, margin: "26px 0 4px" }}>Zoekgebied</div>
          <div style={{ border: "2px solid #000", width: 334 }}>{gebied ? <Plaat w={330} h={236} bbox={gebied} zoekgebied={l.zoekgebied} aansluitpunt={l.aansluitpunt} kandidaten={ks} labels={labels} voorkeurId={l.voorkeurId} /> : <div style={{ height: 236, background: "#fff" }} />}</div>
        </div>
        <div>
          <div style={pp.kop}>Aanleiding</div>
          {tekst("aanleiding", "[Aanleiding van het project]")}
          <div style={{ ...pp.kop, marginTop: 12 }}>Conclusie</div>
          {tekst("advies", "[Conclusie]")}
          <div style={{ ...pp.kop, margin: "18px 0 4px" }}>Onderzochte locaties</div>
          <div style={{ border: "2px solid #000", width: 334 }}>{gebied ? <Plaat w={330} h={236} bbox={gebied} zoekgebied={l.zoekgebied} kandidaten={ks} labels={labels} voorkeurId={l.voorkeurId} /> : <div style={{ height: 236, background: "#fff" }} />}</div>
        </div>
      </div>
    </div>
  ) });

  const kaartBlad = (k: KaartDef, kop: string | null, nr: string) => (
    <>
      {kop && <h1>{kop}</h1>}
      <div style={{ border: "2px solid #000", width: 1012 }}>{k.plaat(1008, kop ? 566 : 612)}</div>
      <div className="bij" style={{ display: "flex", flexWrap: "wrap", gap: "2px 16px" }}>
        <span style={{ fontStyle: "normal", fontWeight: 700 }}>{nr}: {k.titel}</span>
        {k.legenda.map((x) => <span key={x.naam}><i style={{ display: "inline-block", width: 9, height: 9, background: x.kleur, marginRight: 4 }} />{x.naam}</span>)}
      </div>
    </>
  );
  if (!kaarten.length) bladen.push({ kop: "Ruimtelijke context", el: <><h1>Ruimtelijke context</h1><p className="leeg">Leg eerst het zoekgebied vast en voer de analyse uit.</p></> });
  kaarten.forEach((k, i) => bladen.push({ kop: i === 0 ? "Ruimtelijke context" : undefined, el: kaartBlad(k, i === 0 ? "Ruimtelijke context" : null, `Kaart ${i + 1}`) }));

  if (gebied && a)
    bladen.push({ kop: "Kansrijke gebieden", el: kaartBlad({
      titel: `kansrijke gebieden en onderzochte locaties. ${getal(Math.round((100 * a.uitgeslotenM2) / a.oppZoekgebiedM2))}% van het zoekgebied is uitgesloten; op ${(a.inpasbaarM2 / 10000).toLocaleString("nl-NL", { maximumFractionDigits: 1 })} ha past het perceel van ${komma(l.kavelL)} × ${komma(l.kavelB)} m`,
      legenda: [{ naam: "Perceel inpasbaar", kleur: "#22c55e" }, { naam: "Onderzochte locatie", kleur: "#E5007D" }, { naam: "Afgevallen locatie", kleur: "#b91c1c" }, ...(voorkeur ? [{ naam: "★ Voorkeurslocatie", kleur: "#00A651" }] : []), ...(ks.some((k) => k.trace) ? [{ naam: "Kabeltracé (indicatief)", kleur: "#7c3aed" }] : [])],
      plaat: (w, h) => <Plaat w={w} h={h} bbox={gebied} rustig overlay={{ src: a.overlay, hoeken: a.hoeken }} zoekgebied={l.zoekgebied} kandidaten={ks} labels={labels} voorkeurId={l.voorkeurId} aansluitpunt={l.aansluitpunt} traces />,
    }, "Kansrijke gebieden", "Kaart") });

  const beeld = (titel: string, el: ReactNode, noot?: string) => <div style={{ marginBottom: 7 }}><div style={{ border: "1px solid #a6a6a6", width: 302, height: 202, overflow: "hidden" }}>{el}</div><div className="bij">{titel}{noot && <span className="leeg"> · {noot}</span>}</div></div>;
  const foto = (src: string) => <img alt="" src={src} style={{ width: 300, height: 200, objectFit: "cover" }} />;
  const locatieBlad = (k: Kandidaat) => {
    const s = sjabloonVan(l, k);
    const sv = l.beelden?.[`${k.id}:streetview`], klic = l.beelden?.[`${k.id}:klic`];
    const blok = (titel: string, items: { id: string; naam: string }[]) => (
      <>
        <h3 style={{ width: 775 }}>{titel}</h3>
        <table className="rij"><tbody>{items.map((x) => <tr key={x.id}><td className="l">{x.naam}</td><td style={{ width: 22 }}><Vink o={s.oordeel(x.id)} /></td><td><Waarde t={s.veld(x.id)} /></td></tr>)}</tbody></table>
      </>
    );
    return (
      <>
        <h1 style={{ marginBottom: 8 }}>Locatie {labels[k.id]} - <span style={{ color: "#595959" }}>{s.veld("typering")}</span></h1>
        <div style={{ color: "#000", marginBottom: 16 }}>{s.veld("adres") || "[Adres]"}<br />{s.veld("kadastraal") || "[Kadastrale gegevens]"}</div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div style={{ width: 690 }}>
            <h3 style={{ width: 775 }}>Constateringen</h3>
            <table className="rij"><tbody>
              {CONSTATERINGEN.map((r) => (
                <tr key={r.naam}><td className="l">{r.naam}</td>
                  {r.delen.map((d, i) => <td key={d.id} colSpan={r.delen.length === 1 ? 2 : 1} style={{ width: r.delen.length === 1 ? 470 : 235, borderLeft: i ? "1px solid #a6a6a6" : undefined }}>{d.label && <span style={{ display: "inline-block", width: 62, marginRight: 8, borderRight: "1px solid #a6a6a6" }}>{d.label}</span>}<Waarde t={s.veld(d.id)} /></td>)}
                </tr>
              ))}
            </tbody></table>
            {blok("Afweegbare omgevingsfactoren", FACTOREN)}
            {blok("Technische afwegingen", TECHNIEK)}
            <div style={{ display: "flex", gap: 40 }}>
              {VRIJ.map((x) => (
                <div key={x.id} style={{ width: 325 }}>
                  <div style={{ font: '700 13px "Trebuchet MS", Arial', borderBottom: "1px solid #a6a6a6", paddingLeft: 8 }}>{x.naam}</div>
                  <div style={{ display: "flex", gap: 8, paddingLeft: 8, minHeight: 86 }}><div style={{ paddingTop: 4 }}><Vink o={s.oordeel(x.id)} /></div><div style={{ borderLeft: "1px solid #595959", padding: "4px 0 0 10px", fontStyle: "italic" }}><Waarde t={s.veld(x.id)} /></div></div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ marginTop: -62 }}>
            {beeld("Indicatieve locatie", <Plaat w={300} h={200} basis="lucht" bbox={rondom(k.punt, 85)} kandidaten={ks} labels={labels} voorkeurId={l.voorkeurId} />)}
            {sv ? beeld("Streetview", foto(sv))
              : gkey ? beeld("Streetview", foto(`https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${k.punt[1]},${k.punt[0]}&fov=90&source=outdoor&key=${gkey}`))
              : beeld("Streetview", <Plaat w={300} h={200} basis="lucht" bbox={rondom(k.punt, 32)} kandidaten={ks} labels={labels} voorkeurId={l.voorkeurId} />, "foto nog toevoegen; luchtfoto van dichtbij")}
            {klic ? beeld("KLIC", foto(klic)) : beeld("KLIC", <Plaat w={300} h={200} basis="geen" lagen={[{ id: "kadaster" }]} bbox={rondom(k.punt, 60)} kandidaten={ks} labels={labels} voorkeurId={l.voorkeurId} />, "KLIC-uitsnede nog toevoegen; kadastrale kaart")}
          </div>
        </div>
      </>
    );
  };
  ks.forEach((k, i) => bladen.push({ kop: `Locatie ${labels[k.id]} - ${sjabloonVan(l, k).veld("typering")}`, sub: true, el: locatieBlad(k) }));

  const sj = ks.map((k) => sjabloonVan(l, k));
  const n = Math.max(1, ks.length);
  bladen.push({ el: (
    <>
      <h1>Overzicht</h1>
      <table className="ov">
        <tbody>
          <tr><td style={{ border: "none" }} />{ks.map((k) => <th key={k.id} colSpan={2} style={k.id === l.voorkeurId ? { background: "#eaf7d0" } : undefined}>Locatie {labels[k.id]}</th>)}</tr>
          <tr><td className="g" colSpan={1 + 2 * n}>Constatering</td></tr>
          <tr style={{ fontSize: ks.length > 4 ? 9.5 : 11 }}><td className="l" style={{ fontSize: 12 }}>Binnenplanse mogelijkheden</td>{sj.map((s, i) => [<td key={`g${i}`}><Waarde t={s.veld("gebruik")} /></td>, <td key={`b${i}`}><Waarde t={s.veld("bouwen")} /></td>])}</tr>
          {[["Grondeigendom", "grondeigendom"], ["Grondgebruik", "grondgebruik"], ["Stikstof", "stikstof2"], ["Overstromingsrisico", "overstroming"]].map(([naam, vid]) => (
            <tr key={vid} style={{ fontSize: ks.length > 4 ? 10 : 11.5 }}><td className="l" style={{ fontSize: 12 }}>{naam}</td>{sj.map((s, i) => <td key={i} colSpan={2}><Waarde t={s.veld(vid) || (vid === "stikstof2" ? s.veld("stikstof1") : "")} /></td>)}</tr>
          ))}
          <tr><td className="g" colSpan={1 + 2 * n}>Afweegbare omgevingsfactoren</td></tr>
          {FACTOREN.map((x) => <tr key={x.id}><td className="l">{x.naam}</td>{sj.map((s, i) => <td key={i} colSpan={2}><Vink o={s.oordeel(x.id)} /></td>)}</tr>)}
          <tr><td className="g" colSpan={1 + 2 * n}>Technische afwegingen</td></tr>
          {[...TECHNIEK, VRIJ[0]].map((x) => <tr key={x.id}><td className="l">{x.naam}</td>{sj.map((s, i) => <td key={i} colSpan={2}><Vink o={s.oordeel(x.id)} /></td>)}</tr>)}
        </tbody>
      </table>
    </>
  ) });

  bladen.push({ kop: "Advies", el: (
    <div style={{ display: "flex", gap: 40 }}>
      <div style={{ flex: 1 }}>
        <h1>Advies</h1>
        <h2 style={{ marginTop: 0 }}>Aanleiding project</h2>{tekst("aanleiding", "[Aanleiding van het project]")}
        <h2>Ruimtelijke inpassing voorkeurslocatie</h2>{tekst("inpassing", "nog invullen")}
        <h2>Aandachtspunten voorkeurslocatie</h2>{tekst("vervolg", "nog invullen")}
        <h2>Conclusie</h2>{tekst("advies", "nog invullen")}
      </div>
      {voorkeur && (
        <div style={{ width: 400, paddingTop: 46 }}>
          <div style={{ border: "1px solid #a6a6a6", height: 262 }}><Plaat w={398} h={260} basis="lucht" bbox={rondom(voorkeur.punt, 70)} kandidaten={ks} labels={labels} voorkeurId={voorkeur.id} traces /></div>
          <div className="bij">Voorkeurslocatie {labels[voorkeur.id]}{voorkeur.adres && `, ${voorkeur.adres}`}</div>
          <div style={{ border: "1px solid #a6a6a6", height: 240, marginTop: 10 }}><Kaart3D statisch kandidaat={voorkeur} stationType={l.stationType} /></div>
          <div className="bij">3D-beeld van het station op schaal; gevels en beplanting zijn indicatief</div>
          {voorkeur.trace && <div className="bij" style={{ fontStyle: "normal", marginTop: 8 }}>Kabeltracé naar {voorkeur.trace.doel}: {getal(voorkeur.trace.lengte)} m ({getal(voorkeur.trace.langsWeg)} m langs de weg, {getal(voorkeur.trace.overig)} m overig terrein, {getal(voorkeur.trace.boring)} m boring). Kostenindicatie € {getal(voorkeur.trace.kosten)} op basis van kengetallen (€ {TRACE.weg}, € {TRACE.overig} en € {TRACE.boring} per meter), exclusief station, engineering en btw.</div>}
        </div>
      )}
    </div>
  ) });

  // inhoudsopgave met de werkelijke paginanummers
  bladen.forEach((b, i) => {
    if (b.kop) inhoud.push(
      <div key={i} style={{ display: "flex", alignItems: "baseline", fontSize: 14, margin: `0 0 9px ${b.sub ? 18 : 0}px` }}>
        <span>{b.kop}</span><span style={{ flex: 1, borderBottom: "1.5px dotted #595959", margin: "0 3px" }} /><span>{i + 1}</span>
      </div>,
    );
  });

  return (
    <main className="sj w-full bg-slate-200 py-6 print:py-0">
      <style>{STIJL}</style>
      <div className="geen-print mx-auto mb-5 flex w-[1122px] items-center justify-between rounded bg-white p-3 text-sm text-slate-800 shadow">
        <span>Rapport in de standaardtemplate van Enexis, {bladen.length} pagina&apos;s liggend A4. Wacht tot de kaarten geladen zijn en kies bij afdrukken &quot;Opslaan als PDF&quot; (marges: geen, achtergrondafbeeldingen aan). Oranje cursief = nog invullen.</span>
        <button className="knop groen ml-4 shrink-0" onClick={() => window.print()}>Afdrukken / PDF</button>
      </div>
      {bladen.map((b, i) => (
        <section key={i} className="blad">
          {b.kaal ? b.el : <div className="in">{b.el}</div>}
          {i > 0 && <div className="voet"><span>{i + 1}</span><img alt="Enexis Netbeheer" src="/sjabloon/logo.png" style={b.kaal ? { mixBlendMode: "multiply" } : undefined} /></div>}
        </section>
      ))}
    </main>
  );
}

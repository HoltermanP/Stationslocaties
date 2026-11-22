"use client";
// Invulling van de standaardtemplate van Enexis: velden per locatie (tab Locaties) en colofon plus adviesteksten (tab Rapport).
import Link from "next/link";
import { CONSTATERINGEN, FACTOREN, KEUZES, SJABLOON_TEKSTEN, TECHNIEK, VRIJ, letterVan, openVelden, sjabloonVan } from "@/lib/sjabloon";
import type { Colofon, Kandidaat, Lqs, Oordeel } from "@/lib/types";

type Bewaar = (w: Partial<Lqs>) => void;
const STIP: Record<Oordeel, string> = { groen: "bg-emerald-500", oranje: "bg-amber-500", rood: "bg-rose-600" };

/** Verkleint een foto tot hooguit 1000 px breed (JPEG), zodat de database klein blijft. */
async function verklein(f: File): Promise<string> {
  const bmp = await createImageBitmap(f);
  const s = Math.min(1, 1000 / bmp.width);
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.8);
}

export function LocatieVelden({ l, k, bewaar }: { l: Lqs; k: Kandidaat; bewaar: Bewaar }) {
  const s = sjabloonVan(l, k);
  const eigen = k.sjabloon ?? { velden: {}, oordelen: {} };
  const zet = (w: Partial<typeof eigen>) => bewaar({ kandidaten: l.kandidaten.map((x) => (x.id === k.id ? { ...x, sjabloon: { ...eigen, ...w } } : x)) });
  const open = openVelden(l, k).length;
  const veld = (id: string, plek = "nog invullen") => (
    <>
      <input className={`w-full rounded border px-1.5 py-0.5 ${s.veld(id) ? "border-slate-200" : "border-amber-400 bg-amber-50"} ${s.automatisch(id) ? "text-slate-500" : ""}`} list={KEUZES[id] ? `keuze-${id}` : undefined}
        title={s.automatisch(id) ? "Automatisch afgeleid; typ om te overschrijven, leegmaken zet de afleiding terug" : undefined}
        placeholder={plek} value={s.veld(id)} onChange={(e) => zet({ velden: { ...eigen.velden, [id]: e.target.value } })} />
    </>
  );
  const oordeel = (id: string) => (
    <span className="inline-flex gap-0.5">
      {(["groen", "oranje", "rood"] as Oordeel[]).map((o) => (
        <button key={o} title={o} onClick={() => zet({ oordelen: { ...eigen.oordelen, [id]: o } })} className={`h-4 w-4 rounded-sm ${s.oordeel(id) === o ? STIP[o] : "bg-slate-200"}`} />
      ))}
    </span>
  );
  const upload = async (soort: "streetview" | "klic", f?: File) => { if (f) bewaar({ beelden: { ...l.beelden, [`${k.id}:${soort}`]: await verklein(f) } }); };
  const wis = (soort: string) => { const b = { ...l.beelden }; delete b[`${k.id}:${soort}`]; bewaar({ beelden: b }); };

  return (
    <details className="mt-2 rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs">
      <summary className="cursor-pointer font-medium text-slate-800">Template Enexis · pagina Locatie {letterVan(l, k)}
        <span className={`ml-2 font-normal ${open ? "text-amber-700" : "text-emerald-700"}`}>{open ? `${open} velden nog invullen` : "volledig ingevuld"}</span>
      </summary>
      <p className="mt-1 text-slate-500">Grijze tekst is automatisch afgeleid uit analyse en openbare bronnen; typ om te overschrijven. De keuzelijsten zijn suggesties, vrije tekst mag.</p>
      <table className="mt-1 w-full">
        <tbody>
          <tr><td className="w-[34%] py-0.5 text-slate-600">Typering in de titel</td><td colSpan={2}>{veld("typering")}</td></tr>
          <tr><td className="py-0.5 text-slate-600">Adres</td><td colSpan={2}>{veld("adres", "[Adres]")}</td></tr>
          <tr><td className="py-0.5 text-slate-600">Kadastrale gegevens</td><td colSpan={2}>{veld("kadastraal", "haal eerst de feiten op (AI-voorstel ophalen)")}</td></tr>
          <tr><td colSpan={3} className="pt-2 font-medium text-pink-700">Constateringen</td></tr>
          {CONSTATERINGEN.map((r) => (
            <tr key={r.naam}><td className="py-0.5 text-slate-600">{r.naam}</td>
              <td colSpan={2}><div className="flex gap-1">{r.delen.map((d) => <div key={d.id} className="min-w-0 flex-1">{veld(d.id, d.label ? `${d.label}: nog invullen` : undefined)}</div>)}</div></td></tr>
          ))}
          {[["Afweegbare omgevingsfactoren", FACTOREN], ["Technische afwegingen", TECHNIEK], ["Vrije tekst", VRIJ]].map(([titel, items]) => (
            <FragmentRijen key={titel as string} titel={titel as string}>
              {(items as { id: string; naam: string }[]).map((x) => <tr key={x.id}><td className="py-0.5 text-slate-600">{x.naam}</td><td className="w-14">{oordeel(x.id)}</td><td>{veld(x.id)}</td></tr>)}
            </FragmentRijen>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {(["streetview", "klic"] as const).map((soort) => (
          <span key={soort}>
            <label className="cursor-pointer underline">{soort === "klic" ? "KLIC-uitsnede" : "Streetview-foto"} {l.beelden?.[`${k.id}:${soort}`] ? "vervangen" : "toevoegen"}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(soort, e.target.files?.[0])} /></label>
            {l.beelden?.[`${k.id}:${soort}`] && <button className="ml-1 text-red-700 underline" onClick={() => wis(soort)}>wissen</button>}
          </span>
        ))}
      </div>
      {Object.entries(KEUZES).map(([id, opties]) => <datalist key={id} id={`keuze-${id}`}>{opties.map((o) => <option key={o} value={o} />)}</datalist>)}
    </details>
  );
}

function FragmentRijen({ titel, children }: { titel: string; children: React.ReactNode }) {
  return <><tr><td colSpan={3} className="pt-2 font-medium text-pink-700">{titel}</td></tr>{children}</>;
}

export function RapportVelden({ l, bewaar, verstuur }: { l: Lqs; bewaar: Bewaar; verstuur: () => Promise<void> }) {
  const c = l.colofon ?? {};
  const zet = (w: Partial<Colofon>) => bewaar({ colofon: { ...c, ...w } });
  const open = l.kandidaten.reduce((n, k) => n + openVelden(l, k).length, 0);
  const col = (id: keyof Colofon, naam: string, plek: string) => (
    <label className="block text-sm">{naam}<input className="veld mt-1" placeholder={plek} value={c[id] ?? ""} onChange={(e) => zet({ [id]: e.target.value })} /></label>
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/lqs/${l.id}/sjabloon`} target="_blank" className="knop groen" onClick={() => void verstuur()}>Rapport in template Enexis (afdrukken / PDF)</Link>
        <span className={`text-xs ${open ? "text-amber-700" : "text-emerald-700"}`}>{l.kandidaten.length ? (open ? `${open} templatevelden nog invullen (tab Locaties)` : "alle templatevelden ingevuld") : "nog geen locaties"}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {col("plaats", "Plaats (omslag)", l.naam)}
        {col("projectnummer", "Projectnummer Enexis", l.code)}
        {col("versie", "Versie", "V1.0")}
        {col("specialist", "Specialist Enexis", l.planoloog || "naam")}
        <div className="col-span-2">{col("email", "Correspondentie", "voor.achternaam@enexis.nl")}</div>
      </div>
      {SJABLOON_TEKSTEN.map((s) => (
        <label key={s.id} className="block text-sm font-medium">{s.titel}{s.id === "aanleiding" || s.id === "advies" ? <span className="font-normal text-slate-500"> · ook op het projectpaspoort</span> : null}
          <textarea className="veld mt-1 font-normal leading-relaxed" rows={4} value={l.teksten[s.id] ?? ""} onChange={(e) => bewaar({ teksten: { ...l.teksten, [s.id]: e.target.value } })} />
        </label>
      ))}
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Lqs } from "@/lib/types";

type Config = { omgeving: "test" | "productie"; geconfigureerd: boolean; ontbreekt: string[] };

/** KLIC bij een LQS: levering-zip inlezen (handmatig) of een oriëntatieverzoek via de Kadaster-koppeling (automatisch). */
export default function KlicPaneel({ l, setL, verstuur }: { l: Lqs; setL: (l: Lqs) => void; verstuur: () => Promise<void> }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [bezig, setBezig] = useState("");
  const [fout, setFout] = useState("");
  const [zeker, setZeker] = useState(false);
  useEffect(() => {
    api<Config>("/api/klic/config").then(setConfig).catch(() => setConfig(null));
  }, []);

  const doe = async (wat: string, f: () => Promise<Lqs>) => {
    setBezig(wat);
    setFout("");
    try {
      await verstuur();
      setL(await f());
    } catch (e) {
      setFout((e as Error).message);
    }
    setBezig("");
    setZeker(false);
  };
  const upload = (f?: File) => {
    if (!f) return;
    void doe("inlezen", async () => {
      const r = await fetch(`/api/lqs/${l.id}/klic`, { method: "POST", headers: { "content-type": "application/zip" }, body: f });
      const d = await r.json();
      if (!r.ok) throw new Error(d.fout ?? `Fout ${r.status}`);
      return d as Lqs;
    });
  };

  const k = l.klic ?? {};
  const a = k.aanvraag;
  const nietGeleverd = (k.netbeheerders ?? []).filter((n) => n.geleverd === false);
  const loopt = !!a && !k.ingelezenOp && !["Afgewezen", "Mislukt"].includes(a.status);

  return (
    <div className="rounded border border-slate-200 p-3 text-sm">
      <div className="font-medium">KLIC – kabels en leidingen van derden</div>
      {k.ingelezenOp ? (
        <div className="mt-1 text-xs text-slate-700">
          Levering {k.meldnummer} ingelezen op {new Date(k.ingelezenOp).toLocaleString("nl-NL")} ({k.bron === "kadaster" ? "via Kadaster-koppeling" : "zip-bestand"}):{" "}
          {(k.themas ?? []).map((t) => `${t.naam.toLowerCase()} (${t.leidingen})`).join(", ") || "geen leidingen in het zoekgebied"}.
          {nietGeleverd.length > 0 && <div className="mt-1 rounded bg-amber-50 px-2 py-1 text-amber-900">Onvolledig: {nietGeleverd.map((n) => n.naam).join(", ")} heeft geen gegevens aangeleverd.</div>}
          <div className="mt-1 text-slate-500">De leidingen staan per thema als kaartlaag hierboven. Voer de analyse opnieuw uit om ze mee te wegen.</div>
        </div>
      ) : (
        <p className="mt-1 text-xs text-slate-600">Nog geen KLIC-levering ingelezen. Het net van Enexis komt als eigen laag; KLIC vult aan met de netten van andere beheerders.</p>
      )}
      {a && (
        <div className="mt-2 rounded bg-slate-50 px-2 py-1 text-xs text-slate-700">
          Aanvraag bij het Kadaster ({a.omgeving === "test" ? "testomgeving" : "productie"}), ingediend {new Date(a.ingediendOp).toLocaleString("nl-NL")}: <span className="font-medium">{a.status}</span>
          {a.melding && <div className="text-amber-800">{a.melding}</div>}
        </div>
      )}
      {fout && <p className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-800">{fout}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className={`knop licht cursor-pointer ${bezig ? "pointer-events-none opacity-50" : ""}`}>{bezig === "inlezen" ? "Inlezen…" : k.ingelezenOp ? "Andere levering inlezen (zip)" : "Levering inlezen (zip)"}
          <input type="file" accept=".zip" className="hidden" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        {loopt ? (
          <button className="knop licht" disabled={!!bezig} onClick={() => doe("status", () => api<Lqs>(`/api/lqs/${l.id}/klic/status`, "POST"))}>{bezig === "status" ? "Ophalen…" : "Status en levering ophalen"}</button>
        ) : zeker ? (
          <>
            <button className="knop" disabled={!!bezig} onClick={() => doe("aanvraag", () => api<Lqs>(`/api/lqs/${l.id}/klic/aanvraag`, "POST", { bevestigd: true }))}>{bezig === "aanvraag" ? "Indienen…" : "Ja, aanvraag indienen"}</button>
            <button className="knop licht" onClick={() => setZeker(false)}>Annuleren</button>
          </>
        ) : (
          <button className="knop licht" disabled={!config?.geconfigureerd || !l.zoekgebied || !!bezig} onClick={() => setZeker(true)}>Oriëntatieverzoek indienen bij Kadaster</button>
        )}
      </div>
      {zeker && <p className="mt-2 text-xs text-amber-800">Je dient een oriëntatieverzoek in voor het hele zoekgebied, in de {config?.omgeving === "test" ? "testomgeving" : "productie-omgeving"} van het Kadaster. In productie is dit een bestelling waarvoor het Kadaster kosten in rekening kan brengen.</p>}
      {config && !config.geconfigureerd && <p className="mt-2 text-xs text-slate-500">De Kadaster-koppeling is nog niet ingesteld (zie README, onderdeel KLIC). Tot die tijd lees je de levering in als zip-bestand.</p>}
    </div>
  );
}

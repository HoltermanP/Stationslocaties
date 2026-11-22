import { AUTO_CRITERIA, HAND_CRITERIA } from "./config";
import type { Kandidaat } from "./types";

/** Gewogen totaalscore 0–100 over alle ingevulde criteria. */
export function totaalScore(k: Kandidaat, gewichten: Record<string, number>) {
  let som = 0, gew = 0, ingevuld = 0;
  for (const c of AUTO_CRITERIA) {
    const s = k.auto[c.id]?.score;
    if (s) { som += s * (gewichten[c.id] ?? c.gewicht); gew += gewichten[c.id] ?? c.gewicht; }
  }
  for (const c of HAND_CRITERIA) {
    const s = k.handmatig[c.id]?.score;
    if (s) { som += s * (gewichten[c.id] ?? c.gewicht); gew += gewichten[c.id] ?? c.gewicht; ingevuld++; }
  }
  // een locatie in uitgesloten gebied kan nooit bovenaan eindigen
  return { geschikt: k.inUitgesloten.length === 0, score: gew ? Math.round((som / gew) * 20) : 0, handIngevuld: ingevuld, handTotaal: HAND_CRITERIA.length };
}

export const ha = (m2: number) => (m2 / 10000).toLocaleString("nl-NL", { maximumFractionDigits: 1 }) + " ha";
export const datum = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }) : "–");
export const dagenTot = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);

/** Rangorde: geschikte locaties eerst, daarna op score. */
export function rangorde(ks: Kandidaat[], gewichten: Record<string, number>) {
  return ks
    .map((k) => ({ k, ...totaalScore(k, gewichten) }))
    .sort((a, b) => Number(b.geschikt) - Number(a.geschikt) || b.score - a.score);
}

// Bewaart de demo-LQS'en uit de draaiende app in demo/demo-data.json.gz, zodat ze met de repository meereizen.
// Een lege database wordt er bij de eerste start mee gevuld (src/lib/db/index.ts).
// Gebruik: start de app en draai `npm run demodata` (optioneel: BASIS=http://localhost:3000 npm run demodata).
import { writeFileSync, mkdirSync } from "node:fs";
import { gzipSync } from "node:zlib";

const basis = process.env.BASIS ?? "http://localhost:3210";
const haal = async (pad) => {
  const r = await fetch(basis + pad);
  if (!r.ok) throw new Error(`${pad}: HTTP ${r.status}`);
  return r.json();
};
const rijen = (await haal("/api/lqs")).filter((r) => r.naam.startsWith("Demo") && !r.gearchiveerd);
const demos = [];
for (const r of rijen.reverse()) {
  const l = await haal(`/api/lqs/${r.id}`);
  const fouten = [...new Set(l.kandidaten.flatMap((k) => k.feiten?.fouten ?? []))];
  if (!l.analyse) throw new Error(`${l.naam}: nog niet doorgerekend`);
  if (fouten.length) throw new Error(`${l.naam}: bronnen ontbraken bij het doorrekenen (${fouten.join(", ")}); reken de demo opnieuw door`);
  demos.push(l);
}
if (!demos.length) throw new Error("Geen demo-LQS'en gevonden");
mkdirSync("demo", { recursive: true });
const gz = gzipSync(Buffer.from(JSON.stringify(demos)), { level: 9 });
writeFileSync("demo/demo-data.json.gz", gz);
console.log(`${demos.length} demo's bewaard in demo/demo-data.json.gz (${(gz.length / 1e6).toFixed(1)} MB):`);
for (const d of demos) console.log(`  ${d.code}  ${d.naam}  (${d.status}, ${d.kandidaten.length} locaties)`);

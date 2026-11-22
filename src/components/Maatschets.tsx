// Maatschetsen van een station zonder transformator (TVS), getekend uit de maten in STATION_TYPEN:
// een isometrie van het gebouw met kelderbak en een bovenaanzicht van het perceel met het gebouw erop.
// Eigen tekenwerk op schaal; de tekeningen van Enexis zelf zijn auteursrechtelijk voorbehouden.
const ROZE = "#E5007D";
const nl = (n: number) => n.toLocaleString("nl-NL", { maximumFractionDigits: 1 });

type Gebouw = { b: number; l: number; h: number; kelder: number | null };

/** Maatlijn met eindstreepjes en het getal ernaast; (dx, dy) schuift het getal van de lijn af. */
function Maat({ a, b, tekst, dx = 0, dy = 0 }: { a: number[]; b: number[]; tekst: string; dx?: number; dy?: number }) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = (-(b[1] - a[1]) / len) * 2.5, ny = ((b[0] - a[0]) / len) * 2.5;
  return (
    <g stroke={ROZE} strokeWidth={0.8} fill="none">
      <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
      {[a, b].map((p, i) => <line key={i} x1={p[0] - nx} y1={p[1] - ny} x2={p[0] + nx} y2={p[1] + ny} />)}
      <text x={(a[0] + b[0]) / 2 + dx} y={(a[1] + b[1]) / 2 + dy} textAnchor="middle" fontSize={8} fill={ROZE} stroke="none" fontFamily="Arial, sans-serif">{tekst}</text>
    </g>
  );
}

export function GebouwSchets({ gebouw, kleur = "#33493c", breedte = 150 }: { gebouw: Gebouw; kleur?: string; breedte?: number }) {
  const { l, b, h } = gebouw, k = gebouw.kelder ?? 0;
  const c = Math.cos(Math.PI / 6), s = 0.5;
  // x langs de lengte (naar rechtsachter), y langs de breedte (naar linksachter), z omhoog
  const ruw = (x: number, y: number, z: number) => [(x - y) * c, -(x + y) * s - z];
  const marge = 20, xmin = -(b + 1.2) * c, xmax = (l + 1.2) * c, ymin = -(l + b) * s - h, ymax = k;
  const f = (breedte - 2 * marge) / (xmax - xmin), hoogte = (ymax - ymin) * f + 2 * marge;
  const P = (x: number, y: number, z: number) => { const [px, py] = ruw(x, y, z); return [marge + (px - xmin) * f, marge + (py - ymin) * f]; };
  const vlak = (pts: number[][], fill: string, extra: object = {}) => <polygon points={pts.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ")} fill={fill} stroke="#3f3f3f" strokeWidth={0.6} strokeLinejoin="round" {...extra} />;
  const deur = (m: number, br: number) => vlak([P(m - br / 2, 0, 0), P(m + br / 2, 0, 0), P(m + br / 2, 0, 2.2), P(m - br / 2, 0, 2.2)], "#ffffff", { fillOpacity: 0.25 });
  return (
    <svg width={breedte} height={hoogte} viewBox={`0 0 ${breedte} ${hoogte}`} role="img" aria-label={`Gebouw ${nl(l)} × ${nl(b)} m, ${nl(h)} m hoog`}>
      {k > 0 && <>
        {vlak([P(0, 0, 0), P(l, 0, 0), P(l, 0, -k), P(0, 0, -k)], "#ececec", { strokeDasharray: "2 2" })}
        {vlak([P(0, 0, 0), P(0, b, 0), P(0, b, -k), P(0, 0, -k)], "#dedede", { strokeDasharray: "2 2" })}
      </>}
      {vlak([P(0, 0, 0), P(l, 0, 0), P(l, 0, h), P(0, 0, h)], kleur)}
      {vlak([P(0, 0, 0), P(0, b, 0), P(0, b, h), P(0, 0, h)], kleur, { fillOpacity: 0.82 })}
      {vlak([P(0, 0, h), P(l, 0, h), P(l, b, h), P(0, b, h)], "#2e3236")}
      {deur(l * 0.22, 1.1)}
      {deur(l * 0.74, 2)}
      <Maat a={P(0, -1.2, 0)} b={P(l, -1.2, 0)} tekst={nl(l)} dx={7} dy={9} />
      <Maat a={P(-1.2, 0, 0)} b={P(-1.2, b, 0)} tekst={nl(b)} dx={-7} dy={9} />
      <Maat a={P(0, b + 1.2, 0)} b={P(0, b + 1.2, h)} tekst={nl(h)} dx={-9} dy={3} />
      {k > 0 && <Maat a={P(l + 1.2, 0, 0)} b={P(l + 1.2, 0, -k)} tekst={nl(k)} dx={9} dy={3} />}
    </svg>
  );
}

/** Bovenaanzicht: perceel met het gebouw achterop (2 m tot de achtergrens), de kabelruimte ligt aan de voorzijde (onder). */
export function PerceelSchets({ gebouw, kavelB, kavelL, velden = 0, breedte = 150 }: { gebouw: Gebouw; kavelB: number; kavelL: number; velden?: number; breedte?: number }) {
  const L = Math.max(kavelB, kavelL), B = Math.min(kavelB, kavelL);
  const marge = 24, f = (breedte - 2 * marge) / L, hoogte = B * f + 2 * marge;
  const gl = Math.min(gebouw.l, L - 1), gb = Math.min(gebouw.b, B - 2.5);
  const x0 = marge + ((L - gl) / 2) * f, y0 = marge + 2 * f, voor = B - 2 - gb;
  return (
    <svg width={breedte} height={hoogte} viewBox={`0 0 ${breedte} ${hoogte}`} role="img" aria-label={`Perceel ${nl(L)} × ${nl(B)} m`}>
      <rect x={marge} y={marge} width={L * f} height={B * f} fill="#fbfbf4" stroke="#a8b400" strokeWidth={1} strokeDasharray="4 3" />
      <rect x={x0} y={y0} width={gl * f} height={gb * f} fill="#d9d9d4" stroke="#6b6b63" strokeWidth={1} />
      {Array.from({ length: velden }, (_, i) => { const w = (gl * f - 8) / velden; return <rect key={i} x={x0 + 4 + i * w + w * 0.15} y={y0 + gb * f * 0.3} width={w * 0.7} height={gb * f * 0.4} fill="#b4b4ac" />; })}
      <Maat a={[marge, hoogte - 8]} b={[marge + L * f, hoogte - 8]} tekst={nl(L)} dy={-3} />
      <Maat a={[breedte - 18, marge]} b={[breedte - 18, marge + B * f]} tekst={nl(B)} dx={10} dy={3} />
      {voor >= 2 && <Maat a={[x0 + gl * f * 0.5, y0 + gb * f]} b={[x0 + gl * f * 0.5, marge + B * f]} tekst={`${nl(voor)} kabelruimte`} dx={-31} dy={3} />}
    </svg>
  );
}

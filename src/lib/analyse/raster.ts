import { deflateSync } from "node:zlib";

export class Raster {
  w: number;
  h: number;
  constructor(public minX: number, public minY: number, public maxX: number, public maxY: number, public cel: number) {
    this.w = Math.ceil((maxX - minX) / cel);
    this.h = Math.ceil((maxY - minY) / cel);
    this.maxX = minX + this.w * cel;
    this.minY = maxY - this.h * cel;
  }
  get n() {
    return this.w * this.h;
  }
  kol(x: number) {
    return Math.floor((x - this.minX) / this.cel);
  }
  rij(y: number) {
    return Math.floor((this.maxY - y) / this.cel);
  }
  x(c: number) {
    return this.minX + (c + 0.5) * this.cel;
  }
  y(r: number) {
    return this.maxY - (r + 0.5) * this.cel;
  }

  /** Vul polygoon (ringen incl. gaten, even-odd) in het masker. */
  polygoon(mask: Uint8Array, ringen: number[][][]) {
    let lo = Infinity, hi = -Infinity;
    for (const ring of ringen) for (const p of ring) { if (p[1] < lo) lo = p[1]; if (p[1] > hi) hi = p[1]; }
    const r0 = Math.max(0, this.rij(hi)), r1 = Math.min(this.h - 1, this.rij(lo));
    const xs: number[] = [];
    for (let r = r0; r <= r1; r++) {
      const y = this.y(r);
      xs.length = 0;
      for (const ring of ringen) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const a = ring[i], b = ring[j];
          if (a[1] > y !== b[1] > y) xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        }
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((xs[k] - this.minX) / this.cel - 0.5));
        const c1 = Math.min(this.w - 1, Math.floor((xs[k + 1] - this.minX) / this.cel - 0.5));
        for (let c = c0; c <= c1; c++) mask[r * this.w + c] = 1;
      }
    }
  }

  lijn(mask: Uint8Array, punten: number[][]) {
    for (let i = 0; i + 1 < punten.length; i++) {
      const a = punten[i], b = punten[i + 1];
      const stappen = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (this.cel / 2)));
      for (let s = 0; s <= stappen; s++) this.punt(mask, [a[0] + ((b[0] - a[0]) * s) / stappen, a[1] + ((b[1] - a[1]) * s) / stappen]);
    }
  }

  punt(mask: Uint8Array, p: number[]) {
    const c = this.kol(p[0]), r = this.rij(p[1]);
    if (c >= 0 && r >= 0 && c < this.w && r < this.h) mask[r * this.w + c] = 1;
  }

  /** Teken willekeurige GeoJSON-geometrie (RD-coördinaten). Geeft true als er iets getekend kon worden. */
  geometrie(mask: Uint8Array, g: { type: string; coordinates?: unknown; geometries?: unknown[] } | null) {
    if (!g) return;
    const c = g.coordinates as never;
    switch (g.type) {
      case "Polygon": this.polygoon(mask, c); this.randen(mask, c); break;
      case "MultiPolygon": for (const p of c as number[][][][]) { this.polygoon(mask, p); this.randen(mask, p); } break;
      case "LineString": this.lijn(mask, c); break;
      case "MultiLineString": for (const l of c as number[][][]) this.lijn(mask, l); break;
      case "Point": this.punt(mask, c); break;
      case "MultiPoint": for (const p of c as number[][]) this.punt(mask, p); break;
      case "GeometryCollection": for (const s of g.geometries ?? []) this.geometrie(mask, s as never); break;
    }
  }

  // Smalle vlakken (sloten, paden) vallen anders tussen de celmiddens door.
  private randen(mask: Uint8Array, ringen: number[][][]) {
    for (const ring of ringen) this.lijn(mask, ring);
  }

  /** Exacte euclidische afstand (m) tot dichtstbijzijnde gezette cel (Felzenszwalb). */
  afstand(mask: Uint8Array): Float32Array {
    const { w, h } = this;
    const INF = 1e12;
    const d = new Float64Array(w * h);
    for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 0 : INF;
    const m = Math.max(w, h);
    const f = new Float64Array(m), uit = new Float64Array(m), z = new Float64Array(m + 1);
    const v = new Int32Array(m);
    const pas = (n: number) => {
      let k = 0;
      v[0] = 0; z[0] = -INF; z[1] = INF;
      for (let q = 1; q < n; q++) {
        let s: number;
        do {
          const p = v[k];
          s = (f[q] + q * q - (f[p] + p * p)) / (2 * q - 2 * p);
        } while (s <= z[k] && --k >= 0);
        k++;
        v[k] = q; z[k] = s; z[k + 1] = INF;
      }
      k = 0;
      for (let q = 0; q < n; q++) {
        while (z[k + 1] < q) k++;
        const p = v[k];
        uit[q] = (q - p) * (q - p) + f[p];
      }
    };
    for (let c = 0; c < w; c++) {
      for (let r = 0; r < h; r++) f[r] = d[r * w + c];
      pas(h);
      for (let r = 0; r < h; r++) d[r * w + c] = uit[r];
    }
    const res = new Float32Array(w * h);
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) f[c] = d[r * w + c];
      pas(w);
      for (let c = 0; c < w; c++) res[r * w + c] = Math.sqrt(uit[c]) * this.cel;
    }
    return res;
  }

  buffer(mask: Uint8Array, meters: number): Uint8Array {
    if (meters <= 0) return mask;
    const d = this.afstand(mask);
    const uit = new Uint8Array(mask.length);
    for (let i = 0; i < uit.length; i++) uit[i] = d[i] <= meters ? 1 : 0;
    return uit;
  }
}

// --- minimale PNG-encoder (RGBA) ---
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc(buf: Buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}
export function png(w: number, h: number, rgba: Uint8Array): string {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let r = 0; r < h; r++) {
    raw[r * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, r * w * 4, w * 4).copy(raw, r * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const out = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]);
  return "data:image/png;base64," + out.toString("base64");
}

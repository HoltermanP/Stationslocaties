// Realistische weergave van het 3D-beeld: dezelfde blokken als het schematische model (stationModel), maar getekend met
// three.js op een eigen canvas boven de kaart: materialen met textuur (baksteen, betontegels, staafmathekwerk, loof), zonlicht met
// slagschaduwen op de luchtfoto, bomen met een kroon en de omliggende bebouwing in hetzelfde licht.
// Maten en plaatsing komen ongewijzigd uit stationModel; alleen de afwerking is anders en blijft indicatief.
import * as maplibregl from "maplibre-gl";
import * as THREE from "three";

type Feature = { properties: Record<string, unknown>; geometry: { type: string; coordinates: number[][][] } };

/** Vaste toevalsreeks, zodat textuur en bomen bij elke weergave gelijk zijn. */
const reeks = (zaad: number) => () => { zaad = (zaad * 1664525 + 1013904223) >>> 0; return zaad / 4294967296; };

function textuur(px: number, py: number, meterB: number, meterH: number, teken: (c: CanvasRenderingContext2D, r: () => number) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = px; canvas.height = py;
  teken(canvas.getContext("2d")!, reeks(px * 31 + py));
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / meterB, 1 / meterH); // uv's zijn in meters
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Egaal vlak met korrel: vlekjes lichter en donkerder dan de basiskleur. */
const korrel = (c: CanvasRenderingContext2D, r: () => number, w: number, h: number, kleur: string, sterkte: number, grof = 2) => {
  c.fillStyle = kleur; c.fillRect(0, 0, w, h);
  for (let i = 0; i < (w * h) / 6; i++) {
    c.fillStyle = r() < 0.5 ? `rgba(0,0,0,${r() * sterkte})` : `rgba(255,255,255,${r() * sterkte})`;
    c.fillRect(r() * w, r() * h, 1 + r() * grof, 1 + r() * grof);
  }
};

const mat = (map: THREE.Texture | null, opties: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ map, roughness: 0.92, metalness: 0, ...opties });

function materialen() {
  const cache = new Map<string, THREE.Material>();
  const eens = (sleutel: string, maak: () => THREE.Material) => { let m = cache.get(sleutel); if (!m) { m = maak(); cache.set(sleutel, m); } return m; };
  const egaal = (kleur: string, sterkte = 0.07, m = 2, opties: THREE.MeshStandardMaterialParameters = {}) =>
    eens(`egaal${kleur}${sterkte}${m}`, () => mat(textuur(256, 256, m, m, (c, r) => korrel(c, r, 256, 256, kleur, sterkte)), opties));
  return {
    cache,
    egaal,
    /** Metselwerk in halfsteensverband, waalformaat (210 × 50 mm, voeg 10 mm) */
    baksteen: (kleur: string) => eens(`steen${kleur}`, () => mat(textuur(440, 240, 0.88, 0.48, (c, r) => {
      c.fillStyle = "#b9b4aa"; c.fillRect(0, 0, 440, 240);
      const basis = new THREE.Color(kleur);
      for (let rij = 0; rij < 8; rij++)
        for (let i = -1; i < 4; i++) {
          const k = basis.clone().offsetHSL((r() - 0.5) * 0.02, (r() - 0.5) * 0.1, (r() - 0.5) * 0.12);
          c.fillStyle = `#${k.getHexString()}`;
          c.fillRect(i * 110 + (rij % 2) * 55 + 2, rij * 30 + 2, 105, 25);
        }
      for (let i = 0; i < 6000; i++) { c.fillStyle = `rgba(0,0,0,${r() * 0.08})`; c.fillRect(r() * 440, r() * 240, 2, 2); }
    }))),
    /** Geschilderde prefab betongevel met een naad per 2,4 m */
    paneel: (kleur: string) => eens(`paneel${kleur}`, () => mat(textuur(480, 256, 2.4, 1.28, (c, r) => {
      korrel(c, r, 480, 256, kleur, 0.05);
      c.fillStyle = "rgba(0,0,0,0.28)"; c.fillRect(0, 0, 3, 256);
      c.fillStyle = "rgba(255,255,255,0.08)"; c.fillRect(3, 0, 2, 256);
    }), { roughness: 0.8 })),
    /** Betontegels 30 × 30 cm */
    tegels: (kleur: string) => eens(`tegels${kleur}`, () => mat(textuur(360, 360, 0.9, 0.9, (c, r) => {
      const basis = new THREE.Color(kleur);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        c.fillStyle = `#${basis.clone().offsetHSL(0, 0, (r() - 0.5) * 0.05).getHexString()}`;
        c.fillRect(i * 120, j * 120, 120, 120);
      }
      for (let i = 0; i < 9000; i++) { c.fillStyle = r() < 0.5 ? `rgba(0,0,0,${r() * 0.07})` : `rgba(255,255,255,${r() * 0.07})`; c.fillRect(r() * 360, r() * 360, 2, 2); }
      c.fillStyle = "rgba(0,0,0,0.3)";
      for (let i = 0; i < 3; i++) { c.fillRect(i * 120, 0, 2, 360); c.fillRect(0, i * 120, 360, 2); }
    }))),
    /** Staafmathekwerk: verticale staven om de 5 cm, dubbele liggers om de 20 cm; de rest is doorzichtig */
    hek: () => eens("hek", () => mat(textuur(64, 64, 0.2, 0.2, (c) => {
      c.clearRect(0, 0, 64, 64);
      c.fillStyle = "#27352e";
      for (let i = 0; i < 4; i++) c.fillRect(i * 16 + 6, 0, 3, 64);
      c.fillRect(0, 29, 64, 4);
    }), { transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.4 })),
    loof: (kleur: string) => eens(`loof${kleur}`, () => mat(textuur(256, 256, 1.2, 1.2, (c, r) => {
      c.fillStyle = kleur; c.fillRect(0, 0, 256, 256);
      const basis = new THREE.Color(kleur);
      for (let i = 0; i < 2600; i++) {
        c.fillStyle = `#${basis.clone().offsetHSL((r() - 0.5) * 0.05, (r() - 0.5) * 0.2, (r() - 0.5) * 0.22).getHexString()}`;
        c.beginPath(); c.ellipse(r() * 256, r() * 256, 2 + r() * 5, 1.5 + r() * 3, r() * Math.PI, 0, 2 * Math.PI); c.fill();
      }
    }), { roughness: 1 })),
  };
}

/**
 * Prisma op een plattegrond: wanden met uv's in meters (omtrek × hoogte) en een bovenvlak. De ring is in lokale meters
 * (x oost, y noord), zonder herhaald eindpunt.
 */
function prisma(ring: number[][], b: number, h: number, wand: THREE.Material, dak: THREE.Material) {
  let opp = 0;
  for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; opp += p[0] * q[1] - q[0] * p[1]; }
  const r = opp < 0 ? [...ring].reverse() : ring; // tegen de klok in, zodat de normalen naar buiten wijzen
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  let langs = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i], q = r[(i + 1) % r.length], len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (len < 1e-6) continue;
    const nx = (q[1] - p[1]) / len, ny = -(q[0] - p[0]) / len, n0 = pos.length / 3;
    pos.push(p[0], p[1], b, q[0], q[1], b, q[0], q[1], h, p[0], p[1], h);
    for (let j = 0; j < 4; j++) nor.push(nx, ny, 0);
    uv.push(langs, b, langs + len, b, langs + len, h, langs, h);
    idx.push(n0, n0 + 1, n0 + 2, n0, n0 + 2, n0 + 3);
    langs += len;
  }
  const nWand = idx.length, t0 = pos.length / 3;
  for (const p of r) { pos.push(p[0], p[1], h); nor.push(0, 0, 1); uv.push(p[0], p[1]); }
  for (const f of THREE.ShapeUtils.triangulateShape(r.map((p) => new THREE.Vector2(p[0], p[1])), [])) idx.push(t0 + f[0], t0 + f[1], t0 + f[2]);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.addGroup(0, nWand, 0);
  g.addGroup(nWand, idx.length - nWand, 1);
  const m = new THREE.Mesh(g, [wand, dak]);
  m.castShadow = m.receiveShadow = true;
  m.frustumCulled = false; // de camera krijgt de projectie van de kaart; three kan het beeldvlak daar niet uit afleiden
  return m;
}

const leeg = (groep: THREE.Group) => {
  for (const kind of [...groep.children]) { groep.remove(kind); kind.traverse((o) => (o as THREE.Mesh).geometry?.dispose()); }
};

export type RealistischeLaag = {
  laag: maplibregl.CustomLayerInterface;
  /** Het canvas met het three-beeld, om samen met de kaart als afbeelding op te slaan */
  doek: () => HTMLCanvasElement | null;
  zetStation: (blokken: Feature[]) => void;
  zetGebouwen: (features: Feature[]) => void;
};

/** kijkrichting: de bearing van het standaardaanzicht, om de zonnestand op af te stemmen */
export function realistischeLaag(id: string, midden: [number, number], kijkrichting = 0): RealistischeLaag {
  const mc = maplibregl.MercatorCoordinate.fromLngLat(midden, 0);
  const s = mc.meterInMercatorCoordinateUnits();
  const lokaal = (c: number[]) => { const p = maplibregl.MercatorCoordinate.fromLngLat([c[0], c[1]], 0); return [(p.x - mc.x) / s, (mc.y - p.y) / s]; };
  const ringVan = (f: Feature) => f.geometry.coordinates[0].slice(0, -1).map(lokaal);

  const M = materialen();
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const station = new THREE.Group(), gebouwen = new THREE.Group();
  scene.add(station, gebouwen);

  // Daglicht uit het zuidoosten, zuiden of zuidwesten (ochtend, middag of namiddag): de stand die in het standaardaanzicht
  // van opzij invalt, zodat de slagschaduwen naast het station vallen en niet erachter. De hemel vult de schaduwkant in.
  const cameraKant = kijkrichting + 180;
  const waarde = (az: number) => { const d = ((az - cameraKant) * Math.PI) / 180; return Math.abs(Math.sin(d)) + 0.8 * Math.cos(d); }; // liever ook licht op de gevel die de camera ziet
  const azimut = ([135, 180, 225].sort((a, b) => waarde(b) - waarde(a))[0] * Math.PI) / 180;
  scene.add(new THREE.HemisphereLight("#e6eefa", "#a39f94", 2.1));
  const zon = new THREE.DirectionalLight("#fff4e0", 3.1);
  zon.position.set(118 * Math.sin(azimut), 118 * Math.cos(azimut), 100);
  zon.castShadow = true;
  zon.shadow.mapSize.set(4096, 4096);
  Object.assign(zon.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 10, far: 400 });
  zon.shadow.camera.updateProjectionMatrix();
  zon.shadow.bias = -0.0004;
  zon.shadow.normalBias = 0.04;
  scene.add(zon, zon.target);

  // de luchtfoto zelf is geen three-object: een onzichtbaar vlak vangt de slagschaduw op
  const grond = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.ShadowMaterial({ opacity: 0.45, depthWrite: false }));
  grond.position.z = 0.03;
  grond.receiveShadow = true;
  grond.frustumCulled = false;
  scene.add(grond);

  let renderer: THREE.WebGLRenderer | null = null;
  let kaart: maplibregl.Map | null = null;
  let doek: HTMLCanvasElement | null = null;
  const ververs = () => { if (renderer) renderer.shadowMap.needsUpdate = true; kaart?.triggerRepaint(); };

  const boom = (x: number, y: number) => {
    const r = reeks(Math.round(x * 13 + y * 7) + 99), g = new THREE.Group();
    const stam = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 3, 10).rotateX(Math.PI / 2), M.egaal("#5a4535", 0.2, 0.5));
    stam.position.set(x, y, 1.5);
    g.add(stam);
    for (let i = 0; i < 7; i++) {
      const straal = 1.2 + r() * 0.9, bol = new THREE.IcosahedronGeometry(straal, 2), p = bol.attributes.position;
      for (let j = 0; j < p.count; j++) { const f = 1 + (Math.sin(p.getX(j) * 5.1 + i) * Math.cos(p.getY(j) * 4.3) * Math.sin(p.getZ(j) * 4.7 + i)) * 0.14; p.setXYZ(j, p.getX(j) * f, p.getY(j) * f, p.getZ(j) * f); }
      bol.computeVertexNormals();
      const kroon = new THREE.Mesh(bol, M.loof(i % 2 ? "#4b7a3e" : "#5c8c49"));
      const hoek = r() * 2 * Math.PI, uit = i === 0 ? 0 : 0.5 + r() * 0.9;
      kroon.position.set(x + Math.cos(hoek) * uit, y + Math.sin(hoek) * uit, 3.4 + r() * 2.6);
      g.add(kroon);
    }
    g.traverse((o) => { o.castShadow = o.receiveShadow = true; o.frustumCulled = false; });
    return g;
  };

  const figuur = (x: number, y: number) => {
    const g = new THREE.Group();
    const benen = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.62, 4, 10).rotateX(Math.PI / 2), M.egaal("#2b3340", 0.1, 0.5));
    benen.position.set(x, y, 0.44);
    const romp = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.42, 4, 10).rotateX(Math.PI / 2), M.egaal("#1d4ed8", 0.08, 0.5));
    romp.position.set(x, y, 1.18);
    const hoofd = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 10), M.egaal("#d9a987", 0.04, 0.5));
    hoofd.position.set(x, y, 1.685);
    g.add(benen, romp, hoofd);
    g.traverse((o) => { o.castShadow = true; o.frustumCulled = false; });
    return g;
  };

  const materiaal = (soort: string, kleur: string): [THREE.Material, THREE.Material] => {
    switch (soort) {
      case "terrein": { const m = M.tegels("#b3afa6"); return [m, m]; }
      case "pad": { const m = M.tegels("#8f8c85"); return [m, m]; }
      case "inrit": { const m = M.egaal("#5d5d5b", 0.14, 1.5); return [m, m]; }
      case "beton": case "plint": { const m = M.egaal(soort === "plint" ? "#4a4e52" : "#bcb9b0", 0.08); return [m, m]; }
      case "dak": { const m = M.egaal("#2e3236", 0.12, 1.5); return [m, m]; }
      case "deur": case "rooster": { const m = M.egaal(kleur, 0.04, 2, { roughness: 0.45, metalness: 0.5 }); return [m, m]; }
      case "paal": { const m = M.egaal("#232b27", 0.05, 1, { roughness: 0.5, metalness: 0.5 }); return [m, m]; }
      case "trafo": { const m = M.egaal(kleur, 0.06, 2, { roughness: 0.55, metalness: 0.45 }); return [m, m]; }
      case "hek": { const m = M.hek(); return [m, m]; }
      case "haag": { const m = M.loof("#3f6a39"); return [m, m]; }
      default: { // gevel: baksteen of geschilderd prefab beton, naar de gekozen afwerking
        const steen = kleur === "#8a5f4a" || kleur === "#8d8a84";
        return [steen ? M.baksteen(kleur) : M.paneel(kleur), M.egaal("#2e3236", 0.12, 1.5)];
      }
    }
  };

  return {
    laag: {
      id,
      type: "custom",
      renderingMode: "2d",
      onAdd(m) {
        kaart = m;
        // eigen doorzichtig canvas boven de kaart: in de gedeelde context van de kaart werken de schaduwen van three niet
        doek = document.createElement("canvas");
        Object.assign(doek.style, { position: "absolute", inset: "0", width: "100%", height: "100%", pointerEvents: "none" });
        m.getCanvasContainer().appendChild(doek);
        renderer = new THREE.WebGLRenderer({ canvas: doek, alpha: true, antialias: true, preserveDrawingBuffer: true });
        renderer.setClearColor(0x000000, 0);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFShadowMap;
        renderer.shadowMap.autoUpdate = false; // het tafereel staat stil: alleen opnieuw na een wijziging
        renderer.shadowMap.needsUpdate = true;
      },
      onRemove() {
        leeg(station); leeg(gebouwen);
        grond.geometry.dispose();
        for (const mm of M.cache.values()) { (mm as THREE.MeshStandardMaterial).map?.dispose(); mm.dispose(); }
        renderer?.dispose();
        doek?.remove();
        renderer = null; kaart = null; doek = null;
      },
      // wordt in hetzelfde beeld als de kaart getekend, met de projectie van de kaart: geen naijlen bij draaien of zoomen
      render(_gl, args) {
        if (!renderer || !kaart || !doek) return;
        const canvas = kaart.getCanvas();
        if (doek.width !== canvas.width || doek.height !== canvas.height) renderer.setSize(canvas.width, canvas.height, false);
        const l = new THREE.Matrix4().makeTranslation(mc.x, mc.y, mc.z).scale(new THREE.Vector3(s, -s, s));
        camera.projectionMatrix = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]).multiply(l);
        camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
        renderer.render(scene, camera);
      },
    },
    doek: () => doek,
    zetStation(blokken) {
      leeg(station);
      for (const f of blokken) {
        const { b, h, kleur, soort } = f.properties as { b: number; h: number; kleur: string; soort: string };
        const ring = ringVan(f), cx = ring.reduce((t, p) => t + p[0], 0) / ring.length, cy = ring.reduce((t, p) => t + p[1], 0) / ring.length;
        if (soort === "kroon1" || soort === "kroon2" || soort === "huid") continue; // horen bij de boom en de schaalfiguur
        if (soort === "stam") { station.add(boom(cx, cy)); continue; }
        if (soort === "jas") { station.add(figuur(cx, cy)); continue; }
        const [wand, dak] = materiaal(soort, kleur);
        const blok = prisma(ring, b, h, wand, dak);
        if (soort === "hek") blok.castShadow = false;
        station.add(blok);
      }
      ververs();
    },
    zetGebouwen(features) {
      leeg(gebouwen);
      const dak = M.egaal("#77756f", 0.1, 3);
      for (const f of features) {
        if (f.geometry.type !== "Polygon") continue;
        const ring = ringVan(f);
        if (ring.length < 3) continue;
        // panden zonder gemeten hoogte blijven lichter, net als in de schematische weergave
        gebouwen.add(prisma(ring, 0, Number(f.properties.h) || 3, M.egaal(f.properties.geschat ? "#eadfbf" : "#d8d4cb", 0.05, 3), dak));
      }
      ververs();
    },
  };
}

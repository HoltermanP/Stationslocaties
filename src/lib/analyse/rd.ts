import proj4 from "proj4";

// Rijksdriehoeksstelsel (EPSG:28992). De zeven towgs84-parameters zijn de gangbare benadering van RDNAPTRANS
// (nauwkeurig tot enkele decimeters); de drie rotaties staan in boogseconden.
const RD =
  "+proj=sterea +lat_0=52.15616055555555 +lon_0=5.38763888888889 +k=0.9999079 +x_0=155000 +y_0=463000 +ellps=bessel +towgs84=565.417,50.3319,465.552,-0.398957,0.343988,-1.8774,4.0725 +units=m +no_defs";

const conv = proj4("WGS84", RD);

export const naarRD = (p: number[]): [number, number] => conv.forward([p[0], p[1]]) as [number, number];
export const naarWGS = (p: number[]): [number, number] => {
  const [x, y] = conv.inverse([p[0], p[1]]);
  return [+x.toFixed(7), +y.toFixed(7)];
};

// Zelfcontrole bij het laden: het nulpunt van het stelsel (Onze Lieve Vrouwetoren, Amersfoort) moet op zijn plek liggen.
// Een verkeerde definitie verschuift alle analyses ongemerkt; dan liever direct een fout.
{
  const [lon, lat] = conv.inverse([155000, 463000]);
  if (Math.abs(lon - 5.387204) > 1e-5 || Math.abs(lat - 52.155172) > 1e-5) throw new Error("RD-omrekening klopt niet: controleer de definitie in rd.ts");
}

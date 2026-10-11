const RETAILERS: Record<string, string> = {
  albert_heijn: "Albert Heijn",
  jumbo: "Jumbo",
  lidl: "Lidl",
  aldi: "Aldi",
  plus: "PLUS",
  dirk: "Dirk",
  hoogvliet: "Hoogvliet",
  vomar: "Vomar",
  dekamarkt: "DekaMarkt",
  spar: "SPAR",
  poiesz: "Poiesz",
  coop: "Coop",
  gewoon_coop: "Gewoon Coop",
  nettorama: "Nettorama",
  ekoplaza: "Ekoplaza",
  boons_markt: "Boon's Markt",
  mcd: "MCD",
};

export function retailerName(id: string | null | undefined): string {
  if (!id) return "supermarkt";
  const key = id.toLowerCase();
  if (RETAILERS[key]) return RETAILERS[key];
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const euroFmt = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });

export function euro(value: number): string {
  return euroFmt.format(value);
}

const whenFmt = new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" });

export function when(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return whenFmt.format(date);
}

export function suggestThreshold(
  offers: { price: number; originalPrice: number | null }[],
): number | null {
  const prices = offers.map((o) => o.price).filter((p) => p > 0);
  if (prices.length === 0) return null;
  const lowest = Math.min(...prices);
  const originals = offers
    .map((o) => o.originalPrice)
    .filter((p): p is number => p != null && p > 0);
  let suggested = lowest;
  if (originals.length) {
    const avgOrig = originals.reduce((a, b) => a + b, 0) / originals.length;
    suggested = Math.min(lowest, Math.round(avgOrig * 0.65 * 100) / 100);
  }
  return Math.round(suggested * 100) / 100;
}

export const SUGGESTED_ITEMS = [
  "Toiletpapier",
  "Wasmiddel",
  "Vaatwastabletten",
  "Keukenpapier",
  "Luiers",
  "Koffiebonen",
  "Cola",
  "Douchegel",
  "Tandpasta",
  "Afwasmiddel",
  "Pasta",
  "Pindakaas",
  "Houdbare melk",
  "Deodorant",
];

export const HOURS_BETWEEN_CHECKS = 20;

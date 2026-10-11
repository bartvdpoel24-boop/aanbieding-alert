export const STORES: { id: string; name: string }[] = [
  { id: "albert_heijn", name: "Albert Heijn" },
  { id: "jumbo", name: "Jumbo" },
  { id: "lidl", name: "Lidl" },
  { id: "aldi", name: "Aldi" },
  { id: "plus", name: "PLUS" },
  { id: "dirk", name: "Dirk" },
  { id: "hoogvliet", name: "Hoogvliet" },
  { id: "vomar", name: "Vomar" },
  { id: "dekamarkt", name: "DekaMarkt" },
  { id: "spar", name: "SPAR" },
  { id: "poiesz", name: "Poiesz" },
  { id: "coop", name: "Coop" },
  { id: "gewoon_coop", name: "Gewoon Coop" },
  { id: "nettorama", name: "Nettorama" },
  { id: "ekoplaza", name: "Ekoplaza" },
  { id: "boons_markt", name: "Boon's Markt" },
  { id: "mcd", name: "MCD" },
];

const RETAILERS: Record<string, string> = Object.fromEntries(STORES.map((store) => [store.id, store.name]));

export const ALL_STORE_IDS = STORES.map((store) => store.id);

export function retailerName(id: string | null | undefined): string {
  if (!id) return "supermarkt";
  const key = id.toLowerCase();
  if (RETAILERS[key]) return RETAILERS[key];
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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

const PACK = /(\d+)\s*(stuks?|st\.|rollen|rolletjes|rol)\b/i;

function packCount(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = PACK.exec(text);
  if (!match) return null;
  const count = Number(match[1]);
  return count > 1 ? count : null;
}

function pieceNoun(name: string, quantity: string | null): string {
  const blob = `${name} ${quantity ?? ""}`.toLowerCase();
  const roll = /\b(?:rollen|rolletjes|rol)\b/.test(blob);
  const piece = /\bstuks?\b/.test(blob);
  if (roll && (/toilet|wc[\s-]?papier|keukenpapier|keukenrol/.test(blob) || !piece)) return "rol";
  return "stuk";
}

export function unitCaption(offer: {
  name: string;
  price: number;
  quantity: string | null;
  unit: string | null;
  unitPrice: number | null;
}): string | null {
  const count = packCount(offer.quantity) ?? packCount(offer.name);
  const noun = pieceNoun(offer.name, offer.quantity);
  if (
    offer.unit === "stuk" &&
    offer.unitPrice != null &&
    offer.unitPrice > 0 &&
    offer.unitPrice < offer.price * 0.98
  ) {
    return `${euro(offer.unitPrice)} per ${noun}`;
  }
  if (count) {
    return `${euro(offer.price / count)} per ${noun}`;
  }
  if (offer.unitPrice != null && offer.unit && offer.unit !== "stuk") {
    return `${euro(offer.unitPrice)} / ${offer.unit}`;
  }
  return null;
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

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

export function suggestUnitThreshold(
  offers: {
    name: string;
    price: number;
    originalPrice: number | null;
    quantity: string | null;
    unit: string | null;
    unitPrice: number | null;
  }[],
): number | null {
  const units = offers
    .map((offer) => {
      const each = unitAmount(offer);
      if (!(each.price > 0)) return null;
      let original = each.price;
      if (offer.originalPrice != null && offer.originalPrice > offer.price && offer.price > 0) {
        original = (offer.originalPrice / offer.price) * each.price;
      }
      return { price: each.price, original };
    })
    .filter((row): row is { price: number; original: number } => row != null);
  if (units.length === 0) return null;
  const lowest = Math.min(...units.map((row) => row.price));
  const avgOrig = units.reduce((sum, row) => sum + row.original, 0) / units.length;
  const suggested = Math.min(lowest, Math.round(avgOrig * 0.65 * 100) / 100);
  return Math.round(suggested * 100) / 100;
}

const PACK = /(\d+)\s*(stuks?|st\.|rollen|rolletjes|rol|tabletten|tablet|capsules|capsule|pods?)\b/i;

function packCount(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = PACK.exec(text);
  if (!match) return null;
  const count = Number(match[1]);
  return count > 1 ? count : null;
}

function pieceNoun(name: string, quantity: string | null): string {
  const blob = `${name} ${quantity ?? ""}`.toLowerCase();
  if (/tablet/.test(blob)) return "tablet";
  if (/capsule/.test(blob)) return "capsule";
  if (/\bpods?\b/.test(blob)) return "pod";
  if (/toilet|wc[\s-]?papier|keukenpapier|keukenrol/.test(blob)) return "rol";
  if (/\b(?:rollen|rolletjes|rol)\b/.test(blob)) return "rol";
  return "stuk";
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function unitAmount(offer: {
  name: string;
  price: number;
  quantity: string | null;
  unit: string | null;
  unitPrice: number | null;
}): { price: number; noun: string; each: boolean } {
  const count = packCount(offer.quantity) ?? packCount(offer.name);
  const noun = pieceNoun(offer.name, offer.quantity);
  if (
    offer.unit === "stuk" &&
    offer.unitPrice != null &&
    offer.unitPrice > 0 &&
    offer.unitPrice < offer.price * 0.98
  ) {
    return { price: round2(offer.unitPrice), noun, each: true };
  }
  if (count) return { price: round2(offer.price / count), noun, each: true };
  return { price: round2(offer.price), noun: "stuk", each: false };
}

export function unitCaption(offer: {
  name: string;
  price: number;
  quantity: string | null;
  unit: string | null;
  unitPrice: number | null;
}): string | null {
  const each = unitAmount(offer);
  if (each.each) return `${euro(each.price)} per ${each.noun}`;
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

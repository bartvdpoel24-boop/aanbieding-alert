import { createServerFn } from "@tanstack/react-start";
import { ALL_STORE_IDS } from "@/lib/money";

const API = "https://www.prijsprofeet.nl/api/v1";
const UA = "AanbiedingAlert/1.0 (prijsalert; contact via app)";
const ALLOWED = new Set(ALL_STORE_IDS);

export type Offer = {
  id: string;
  name: string;
  price: number;
  originalPrice: number | null;
  retailer: string;
  imageUrl: string | null;
  productUrl: string | null;
  quantity: string | null;
  unit: string | null;
  unitPrice: number | null;
  onSale: boolean;
  savingsPercentage: number | null;
  validUntil: string | null;
  brand: string | null;
};

type Raw = Record<string, unknown>;

const cache = new Map<string, { at: number; payload: unknown }>();
const TTL = 10 * 60 * 1000;

async function cachedGet(url: string): Promise<{ ok: true; body: unknown } | { ok: false; error: string }> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL) return { ok: true, body: hit.payload };
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": UA },
    });
    if (!res.ok) return { ok: false, error: `PrijsProfeet antwoordde met ${res.status}.` };
    const body: unknown = await res.json();
    cache.set(url, { at: Date.now(), payload: body });
    return { ok: true, body };
  } catch {
    return { ok: false, error: "De prijzen zijn nu niet bereikbaar. Probeer het zo opnieuw." };
  }
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function mapOffer(raw: unknown): Offer | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Raw;
  const name = str(p.name) ?? str(p.title);
  const price = num(p.price);
  if (!name || price == null || price < 0) return null;
  return {
    id: str(p.product_id) ?? `${name}-${str(p.retailer) ?? "x"}-${price}`,
    name,
    price,
    originalPrice: num(p.original_price),
    retailer: str(p.retailer) ?? "",
    imageUrl: str(p.image_url),
    productUrl: str(p.product_url),
    quantity: str(p.quantity),
    unit: str(p.unit),
    unitPrice: num(p.unit_price),
    onSale: p.is_promotional !== false && p.promotion_status !== "shelf",
    savingsPercentage: num(p.savings_percentage),
    validUntil: str(p.valid_until),
    brand: str(p.brand),
  };
}

function cheapest(offers: Offer[]): Offer[] {
  return [...offers].sort((a, b) => a.price - b.price);
}

export const searchOffers = createServerFn({ method: "GET" })
  .validator((input: { q?: string; retailers?: string[]; dealsOnly?: boolean }) => {
    const q = (input?.q ?? "").trim().slice(0, 80);
    const retailers = Array.isArray(input?.retailers)
      ? input.retailers.filter((id): id is string => typeof id === "string" && id.length > 0).slice(0, 20)
      : [];
    return { q, retailers, dealsOnly: input?.dealsOnly !== false };
  })
  .handler(async ({ data }) => {
    if (data.q.length < 2) return { results: [] as Offer[], error: null as string | null };
    const params = new URLSearchParams({ q: data.q, page_size: "60" });
    if (data.dealsOnly) params.set("promotion_status", "active");
    if (data.retailers.length > 0) params.set("retailer", data.retailers.join(","));
    const res = await cachedGet(`${API}/search?${params.toString()}`);
    if (!res.ok) return { results: [] as Offer[], error: res.error };
    const body = res.body as { results?: unknown[] };
    const allow = data.retailers.length > 0 ? new Set(data.retailers) : null;
    const results = cheapest(
      (body.results ?? [])
        .map(mapOffer)
        .filter((offer): offer is Offer => offer != null && (allow == null || allow.has(offer.retailer))),
    );
    return { results, error: null as string | null };
  });

function pageSizeFor(storeCount: number): number {
  if (storeCount <= 1) return 48;
  if (storeCount <= 4) return 20;
  return 8;
}

export const browseDeals = createServerFn({ method: "GET" })
  .validator((input: { retailers?: string[] }) => {
    const picked = Array.isArray(input?.retailers)
      ? input.retailers.filter((id): id is string => ALLOWED.has(id))
      : [];
    return { retailers: picked.length > 0 ? picked : ALL_STORE_IDS };
  })
  .handler(async ({ data }) => {
    const stores = data.retailers;
    const pageSize = pageSizeFor(stores.length);
    const pages = await Promise.all(
      stores.map(async (retailer) => {
        const params = new URLSearchParams({
          promotion_status: "active",
          is_promotional: "true",
          retailer,
          page_size: String(pageSize),
          sort_by: "extracted_at",
          sort_order: "desc",
        });
        const res = await cachedGet(`${API}/products?${params.toString()}`);
        if (!res.ok) return { offers: [] as Offer[], error: res.error };
        const body = res.body as { products?: unknown[] };
        const offers = (body.products ?? [])
          .map(mapOffer)
          .filter((offer): offer is Offer => offer != null && offer.retailer === retailer);
        offers.sort((a, b) => (b.savingsPercentage ?? 0) - (a.savingsPercentage ?? 0));
        return { offers, error: null as string | null };
      }),
    );

    const buckets = pages.map((page) => page.offers);
    const mixed: Offer[] = [];
    const seen = new Set<string>();
    const cap = 80;
    let progressed = true;
    while (mixed.length < cap && progressed) {
      progressed = false;
      for (const bucket of buckets) {
        while (bucket.length > 0) {
          const next = bucket.shift();
          if (!next || seen.has(next.id)) continue;
          seen.add(next.id);
          mixed.push(next);
          progressed = true;
          break;
        }
        if (mixed.length >= cap) break;
      }
    }

    if (mixed.length === 0) {
      const error = pages.find((page) => page.error)?.error ?? null;
      return { results: [] as Offer[], error };
    }
    return { results: mixed, error: null as string | null };
  });

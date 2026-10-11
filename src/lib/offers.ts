import { createServerFn } from "@tanstack/react-start";

const API = "https://www.prijsprofeet.nl/api/v1";
const UA = "AanbiedingAlert/1.0 (prijsalert; contact via app)";

export type Offer = {
  id: string;
  name: string;
  price: number;
  originalPrice: number | null;
  retailer: string;
  imageUrl: string | null;
  productUrl: string | null;
  quantity: string | null;
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
    savingsPercentage: num(p.savings_percentage),
    validUntil: str(p.valid_until),
    brand: str(p.brand),
  };
}

function cheapest(offers: Offer[]): Offer[] {
  return [...offers].sort((a, b) => a.price - b.price);
}

export const searchOffers = createServerFn({ method: "GET" })
  .validator((input: { q?: string }) => {
    const q = (input?.q ?? "").trim().slice(0, 80);
    return { q };
  })
  .handler(async ({ data }) => {
    if (data.q.length < 2) return { results: [] as Offer[], error: null as string | null };
    const url = `${API}/search?q=${encodeURIComponent(data.q)}&promotion_status=active&page_size=12`;
    const res = await cachedGet(url);
    if (!res.ok) return { results: [] as Offer[], error: res.error };
    const body = res.body as { results?: unknown[] };
    const results = cheapest((body.results ?? []).map(mapOffer).filter((o): o is Offer => o != null));
    return { results, error: null as string | null };
  });

export const fetchTopDeals = createServerFn({ method: "GET" }).handler(async () => {
  const res = await cachedGet(`${API}/deals/top?limit=20`);
  if (!res.ok) return { results: [] as Offer[], error: res.error };
  const body = res.body as {
    top_by_percentage?: { representative_product?: unknown }[];
    top_by_amount?: { representative_product?: unknown }[];
  };
  const rows = [...(body.top_by_percentage ?? []), ...(body.top_by_amount ?? [])];
  const seen = new Set<string>();
  const results: Offer[] = [];
  for (const row of rows) {
    const offer = mapOffer(row.representative_product);
    if (!offer || seen.has(offer.id)) continue;
    seen.add(offer.id);
    results.push(offer);
  }
  results.sort((a, b) => (b.savingsPercentage ?? 0) - (a.savingsPercentage ?? 0));
  return { results, error: null as string | null };
});

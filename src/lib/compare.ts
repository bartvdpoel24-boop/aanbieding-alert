import { createServerFn } from "@tanstack/react-start";
import { euro } from "@/lib/money";

export type ShelfPrice = {
  title: string;
  price: number;
  was: number | null;
  size: string | null;
  unitLabel: string | null;
  url: string | null;
};

export type ComparedProduct = {
  id: string;
  title: string;
  brand: string | null;
  image: string | null;
  size: string | null;
  ean: string | null;
  ah: ShelfPrice | null;
  jumbo: ShelfPrice | null;
};

type AhHit = {
  id: number;
  title: string;
  brand: string | null;
  price: number;
  was: number | null;
  size: string | null;
  image: string | null;
};

type JumboHit = {
  id: string;
  title: string;
  brand: string | null;
  price: number;
  was: number | null;
  size: string | null;
  unitLabel: string | null;
  image: string | null;
  url: string | null;
  ean: string | null;
};

const AH = "https://api.ah.nl";
const UA = "AanbiedingAlert/1.0";

let ahToken: { value: string; until: number } | null = null;

async function ahAuth(): Promise<string | null> {
  if (ahToken && ahToken.until > Date.now()) return ahToken.value;
  try {
    const res = await fetch(`${AH}/mobile-auth/v1/auth/token/anonymous`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-application": "AHWEBSHOP",
        "user-agent": UA,
      },
      body: JSON.stringify({ clientId: "appie" }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { access_token?: string };
    if (!body.access_token) return null;
    ahToken = { value: body.access_token, until: Date.now() + 8 * 60 * 1000 };
    return body.access_token;
  } catch {
    return null;
  }
}

function euros(cents: number): number {
  return Math.round(cents) / 100;
}

function eanFrom(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/(\d{13,14})/);
  if (!match) return null;
  const digits = match[1];
  return digits.length === 14 && digits.startsWith("0") ? digits.slice(1) : digits;
}

async function searchAh(query: string, size: number): Promise<AhHit[]> {
  const token = await ahAuth();
  if (!token) return [];
  const url = new URL(`${AH}/mobile-services/product/search/v2`);
  url.searchParams.set("sortOn", "RELEVANCE");
  url.searchParams.set("page", "0");
  url.searchParams.set("size", String(size));
  url.searchParams.set("query", query.slice(0, 80));
  const res = await fetch(url, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
      "x-application": "AHWEBSHOP",
      "user-agent": UA,
    },
  });
  if (!res.ok) return [];
  const body = (await res.json()) as {
    products?: {
      webshopId?: number;
      title?: string;
      brand?: string;
      currentPrice?: number;
      priceBeforeBonus?: number;
      salesUnitSize?: string;
      images?: { url?: string; width?: number }[];
    }[];
  };
  return (body.products ?? [])
    .filter((row) => typeof row.webshopId === "number" && row.title && typeof row.currentPrice === "number")
    .map((row) => {
      const images = [...(row.images ?? [])].sort((a, b) => (a.width ?? 999) - (b.width ?? 999));
      const was = row.priceBeforeBonus;
      return {
        id: row.webshopId as number,
        title: row.title as string,
        brand: row.brand ?? null,
        price: row.currentPrice as number,
        was: typeof was === "number" && was > (row.currentPrice as number) ? was : null,
        size: row.salesUnitSize ?? null,
        image: images[0]?.url ?? null,
      };
    });
}

async function searchJumbo(query: string): Promise<JumboHit[]> {
  const res = await fetch("https://www.jumbo.com/api/graphql", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      origin: "https://www.jumbo.com",
      "apollographql-client-name": "JUMBO_WEB",
      "apollographql-client-version": "master-v39.2.0-web",
      "user-agent": "Mozilla/5.0",
    },
    body: JSON.stringify({
      operationName: "SearchProductsByKeyword",
      variables: { input: { searchTerms: query.slice(0, 80), searchType: "keyword", offSet: 0 } },
      query: `query SearchProductsByKeyword($input: ProductSearchInput!) {
        searchProducts(input: $input) {
          products {
            id
            title
            brand
            subtitle: packSizeDisplay
            image
            link
            price { price promoPrice pricePerUnit { price unit } }
          }
        }
      }`,
    }),
  });
  if (!res.ok) return [];
  const body = (await res.json()) as {
    data?: {
      searchProducts?: {
        products?: {
          id?: string;
          title?: string;
          brand?: string;
          subtitle?: string;
          image?: string;
          link?: string;
          price?: { price?: number; promoPrice?: number | null; pricePerUnit?: { price?: number; unit?: string } };
        }[];
      };
    };
  };
  return (body.data?.searchProducts?.products ?? [])
    .filter((row) => row.id && row.title && typeof row.price?.price === "number")
    .map((row) => {
      const list = row.price?.price as number;
      const promo = row.price?.promoPrice;
      const current = typeof promo === "number" && promo > 0 && promo < list ? promo : list;
      const per = row.price?.pricePerUnit;
      const unitLabel = per && typeof per.price === "number" && per.unit ? `${euro(per.price / 100)} / ${per.unit}` : null;
      return {
        id: row.id as string,
        title: row.title as string,
        brand: row.brand ?? null,
        price: euros(current),
        was: current < list ? euros(list) : null,
        size: row.subtitle ?? null,
        unitLabel,
        image: row.image ?? null,
        url: row.link ? `https://www.jumbo.com${row.link}` : null,
        ean: eanFrom(row.image),
      };
    });
}

const STOP = new Set(["de", "het", "een", "van", "met", "voor", "per", "en", "op"]);

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((part) => part.length > 1 && !STOP.has(part));
}

function sizeKey(value: string): string | null {
  const match = value.toLowerCase().match(/(\d+(?:[.,]\d+)?)\s*(liter|rollen|rol|stuks|stuk|ml|cl|kg|g|l)\b/);
  if (!match) return null;
  const unit = match[2] === "liter" ? "l" : match[2];
  return `${match[1].replace(",", ".")}${unit}`;
}

function similarity(a: string, b: string): number {
  const left = tokens(a);
  const right = new Set(tokens(b));
  if (left.length === 0 || right.size === 0) return 0;
  const hits = left.filter((part) => right.has(part)).length;
  let score = hits / Math.max(left.length, right.size);
  const aSize = sizeKey(a);
  const bSize = sizeKey(b);
  if (aSize && bSize) score += aSize === bSize ? 0.3 : -0.25;
  return score;
}

function bestJumbo(hits: JumboHit[], title: string): JumboHit | null {
  let best: JumboHit | null = null;
  let score = 0.4;
  for (const hit of hits.slice(0, 8)) {
    const next = similarity(`${title}`, `${hit.title} ${hit.size ?? ""}`);
    if (next > score) {
      best = hit;
      score = next;
    }
  }
  return best;
}

function bestAh(hits: AhHit[], title: string): AhHit | null {
  let best: AhHit | null = null;
  let score = 0.4;
  for (const hit of hits) {
    const next = similarity(title, `${hit.title} ${hit.size ?? ""}`);
    if (next > score) {
      best = hit;
      score = next;
    }
  }
  return best;
}

function fromAh(hit: AhHit): ShelfPrice {
  return {
    title: hit.title,
    price: hit.price,
    was: hit.was,
    size: hit.size,
    unitLabel: null,
    url: `https://www.ah.nl/producten/product/wi${hit.id}`,
  };
}

function fromJumbo(hit: JumboHit): ShelfPrice {
  return {
    title: hit.title,
    price: hit.price,
    was: hit.was,
    size: hit.size,
    unitLabel: hit.unitLabel,
    url: hit.url,
  };
}

function isBarcode(value: string): boolean {
  return /^\d{8,14}$/.test(value);
}

export const compareAssortment = createServerFn({ method: "GET" })
  .validator((input: { q?: string; base?: string }) => {
    const q = (input?.q ?? "").trim().slice(0, 80);
    const base = input?.base === "jumbo" ? "jumbo" : "albert_heijn";
    return { q, base: base as "jumbo" | "albert_heijn" };
  })
  .handler(async ({ data }) => {
    if (data.q.length < 2) return { results: [] as ComparedProduct[], error: null as string | null };
    try {
      if (isBarcode(data.q)) {
        const [jumboHits, ahHits] = await Promise.all([searchJumbo(data.q), searchAh(data.q, 4)]);
        const jumbo = jumboHits[0] ?? null;
        let ah: AhHit | null = ahHits[0] ?? null;
        if (ah == null && jumbo) {
          const named = await searchAh(jumbo.title, 6);
          ah = bestAh(named, `${jumbo.title} ${jumbo.size ?? ""}`);
        }
        if (!jumbo && !ah) return { results: [] as ComparedProduct[], error: null as string | null };
        const row: ComparedProduct = {
          id: jumbo?.id ?? `ah-${ah?.id}`,
          title: (data.base === "jumbo" ? jumbo?.title : ah?.title) ?? jumbo?.title ?? ah?.title ?? data.q,
          brand: jumbo?.brand ?? ah?.brand ?? null,
          image: (data.base === "jumbo" ? jumbo?.image : ah?.image) ?? jumbo?.image ?? ah?.image ?? null,
          size: jumbo?.size ?? ah?.size ?? null,
          ean: jumbo?.ean ?? data.q,
          ah: ah ? fromAh(ah) : null,
          jumbo: jumbo ? fromJumbo(jumbo) : null,
        };
        return { results: [row], error: null as string | null };
      }

      if (data.base === "jumbo") {
        const jumboHits = (await searchJumbo(data.q)).slice(0, 6);
        const rows = await Promise.all(
          jumboHits.map(async (jumbo) => {
            const ah = bestAh(await searchAh(`${jumbo.title} ${jumbo.size ?? ""}`.trim(), 6), `${jumbo.title} ${jumbo.size ?? ""}`);
            return {
              id: jumbo.id,
              title: jumbo.title,
              brand: jumbo.brand,
              image: jumbo.image,
              size: jumbo.size,
              ean: jumbo.ean,
              ah: ah ? fromAh(ah) : null,
              jumbo: fromJumbo(jumbo),
            } satisfies ComparedProduct;
          }),
        );
        return { results: rows, error: null as string | null };
      }

      const ahHits = (await searchAh(data.q, 6)).slice(0, 6);
      const rows = await Promise.all(
        ahHits.map(async (ah) => {
          const jumbo = bestJumbo(await searchJumbo(`${ah.title} ${ah.size ?? ""}`.trim()), `${ah.title} ${ah.size ?? ""}`);
          return {
            id: `ah-${ah.id}`,
            title: ah.title,
            brand: ah.brand,
            image: ah.image,
            size: ah.size,
            ean: jumbo?.ean ?? null,
            ah: fromAh(ah),
            jumbo: jumbo ? fromJumbo(jumbo) : null,
          } satisfies ComparedProduct;
        }),
      );
      return { results: rows, error: null as string | null };
    } catch {
      return { results: [] as ComparedProduct[], error: "De assortimentprijzen zijn nu niet bereikbaar." };
    }
  });

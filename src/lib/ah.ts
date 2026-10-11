import { createServerFn } from "@tanstack/react-start";

export type AhLink = {
  name: string;
  qty: number;
  title: string | null;
  webshopId: number | null;
  url: string | null;
  appUrl: string | null;
};

function wiFrom(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /wi(\d+)/i.exec(value);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function pack(name: string, qty: number, id: number | null, title: string | null): AhLink {
  return {
    name,
    qty,
    title,
    webshopId: id,
    url: id ? `https://www.ah.nl/producten/product/wi${id}` : null,
    appUrl: id ? `appie://producten/product/wi${id}/` : null,
  };
}

async function anonymousToken(): Promise<string | null> {
  try {
    const res = await fetch("https://api.ah.nl/mobile-auth/v1/auth/token/anonymous", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-application": "AHWEBSHOP",
        "user-agent": "AanbiedingAlert/1.0",
      },
      body: JSON.stringify({ clientId: "appie" }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { access_token?: string };
    return typeof body.access_token === "string" ? body.access_token : null;
  } catch {
    return null;
  }
}

async function searchWebshop(token: string, query: string): Promise<{ id: number; title: string } | null> {
  const url = new URL("https://api.ah.nl/mobile-services/product/search/v2");
  url.searchParams.set("sortOn", "RELEVANCE");
  url.searchParams.set("page", "0");
  url.searchParams.set("size", "1");
  url.searchParams.set("query", query.slice(0, 80));
  const res = await fetch(url, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
      "x-application": "AHWEBSHOP",
      "user-agent": "AanbiedingAlert/1.0",
    },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { products?: { webshopId?: number; title?: string }[] };
  const product = body.products?.[0];
  if (!product || typeof product.webshopId !== "number") return null;
  return { id: product.webshopId, title: product.title ?? query };
}

export const resolveAhLinks = createServerFn({ method: "POST" })
  .validator((input: { lines?: { name?: string; qty?: number; productUrl?: string | null; hint?: string | null }[] }) => {
    const rows = Array.isArray(input?.lines) ? input.lines.slice(0, 40) : [];
    return {
      lines: rows
        .map((line) => ({
          name: String(line?.name ?? "").trim().slice(0, 120),
          qty: Math.max(1, Math.min(99, Math.round(Number(line?.qty) || 1))),
          productUrl: typeof line?.productUrl === "string" ? line.productUrl.slice(0, 400) : null,
          hint: typeof line?.hint === "string" ? line.hint.slice(0, 200) : null,
        }))
        .filter((line) => line.name.length > 0),
    };
  })
  .handler(async ({ data }) => {
    const known = data.lines.map((line) => wiFrom(line.productUrl) ?? wiFrom(line.hint));
    const token = known.some((id) => id == null) ? await anonymousToken() : null;
    const links: AhLink[] = [];
    for (let i = 0; i < data.lines.length; i++) {
      const line = data.lines[i];
      const id = known[i];
      if (id) {
        links.push(pack(line.name, line.qty, id, line.name));
        continue;
      }
      if (!token) {
        links.push(pack(line.name, line.qty, null, null));
        continue;
      }
      try {
        const found = await searchWebshop(token, line.name);
        links.push(pack(line.name, line.qty, found?.id ?? null, found?.title ?? null));
      } catch {
        links.push(pack(line.name, line.qty, null, null));
      }
    }
    return { links };
  });

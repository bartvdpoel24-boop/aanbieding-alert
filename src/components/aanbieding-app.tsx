import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftRight,
  Bell,
  BellRing,
  Check,
  ExternalLink,
  House,
  ListChecks,
  LoaderCircle,
  Minus,
  Percent,
  Plus,
  Search,
  ShoppingBasket,
  ScanLine,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { resolveAhLinks, type AhLink } from "@/lib/ah";
import { browseDeals, houseQuotes, searchOffers, type Offer } from "@/lib/offers";
import {
  ALL_STORE_IDS,
  HOURS_BETWEEN_CHECKS,
  STORES,
  SUGGESTED_ITEMS,
  euro,
  retailerName,
  suggestUnitThreshold,
  unitAmount,
  unitCaption,
  when,
} from "@/lib/money";
import { useWatchlist, type CartLine, type StoreQuote, type WatchItem } from "@/lib/watchlist";
import { ScanPanel } from "@/components/scan-panel";

type Tab = "lijst" | "nieuw" | "scan" | "deals" | "mandje" | "info";

const TABS: { id: Tab; label: string; icon: typeof ListChecks }[] = [
  { id: "lijst", label: "Lijst", icon: ListChecks },
  { id: "nieuw", label: "Nieuw", icon: Plus },
  { id: "scan", label: "Scan", icon: ScanLine },
  { id: "deals", label: "Deals", icon: Percent },
  { id: "mandje", label: "Mandje", icon: ShoppingBasket },
  { id: "info", label: "Instellingen", icon: SlidersHorizontal },
];

function isAh(retailer: string | null | undefined) {
  return retailer === "albert_heijn";
}

function offerToCart(offer: Offer) {
  return {
    id: offer.id,
    name: offer.name,
    price: offer.price,
    imageUrl: offer.imageUrl,
    productUrl: offer.productUrl,
    unitLabel: unitCaption(offer),
  };
}

function toQuote(offer: Offer | null): StoreQuote | null {
  if (!offer) return null;
  const each = unitAmount(offer);
  return {
    price: offer.price,
    name: offer.name,
    url: offer.productUrl,
    privateLabel: offer.privateLabel,
    unitLabel: unitCaption(offer),
    unitPrice: each.each ? each.price : null,
  };
}
function notify(body: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    new Notification("AanbiedingAlert", { body });
  } catch {
    /* preview and some mobile browsers block the constructor */
  }
}

function Thumb({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-paper text-primary">
        <ShoppingBasket className="size-5" strokeWidth={1.75} aria-hidden="true" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="size-14 shrink-0 rounded-2xl bg-paper object-contain"
    />
  );
}

export function AanbiedingApp() {
  const items = useWatchlist((s) => s.items);
  const lastGlobalCheck = useWatchlist((s) => s.lastGlobalCheck);
  const hydrated = useWatchlist((s) => s.hydrated);
  const addItem = useWatchlist((s) => s.addItem);
  const removeItem = useWatchlist((s) => s.removeItem);
  const restoreItem = useWatchlist((s) => s.restoreItem);
  const applyCheck = useWatchlist((s) => s.applyCheck);
  const applyQuotes = useWatchlist((s) => s.applyQuotes);
  const setThreshold = useWatchlist((s) => s.setThreshold);
  const setLastGlobalCheck = useWatchlist((s) => s.setLastGlobalCheck);
  const clearAll = useWatchlist((s) => s.clearAll);
  const addToCart = useWatchlist((s) => s.addToCart);
  const cartCount = useWatchlist((s) => s.cart.reduce((sum, line) => sum + line.qty, 0));

  const [tab, setTab] = useState<Tab>("lijst");
  const [draftName, setDraftName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [itemNotes, setItemNotes] = useState<Record<string, string>>({});
  const [allNote, setAllNote] = useState<string | null>(null);
  const booted = useRef(false);

  useEffect(() => {
    const pending = useWatchlist.persist.rehydrate();
    void Promise.resolve(pending).finally(() => {
      if (!useWatchlist.getState().hydrated) useWatchlist.getState().setHydrated();
    });
  }, []);

  useEffect(() => {
    if (!hydrated || booted.current) return;
    booted.current = true;
    const state = useWatchlist.getState();
    const stale =
      !state.lastGlobalCheck ||
      Date.now() - new Date(state.lastGlobalCheck).getTime() > HOURS_BETWEEN_CHECKS * 60 * 60 * 1000;
    if (state.items.length > 0 && stale) void checkAll(true);
  }, [hydrated]);

  const hits = useMemo(
    () =>
      items.filter((item) => {
        const price = item.lastUnitPrice ?? item.lastPrice;
        return item.onSale !== false && price != null && item.threshold > 0 && price <= item.threshold;
      }).length,
    [items],
  );

  async function rememberQuotes(item: WatchItem) {
    const res = await houseQuotes({ data: { q: item.name } });
    if (res.error) return res.error;
    applyQuotes(item.id, {
      jumbo: toQuote(res.jumbo),
      ah: toQuote(res.ah),
      quotesAt: new Date().toISOString(),
    });
    return null;
  }

  async function checkOne(item: WatchItem, silent: boolean) {
    const res = await searchOffers({
      data: { q: item.name, retailers: useWatchlist.getState().retailers, dealsOnly: true },
    });
    const quoteError = await rememberQuotes(item);
    const note = (text: string) => (silent ? null : quoteError ? `${text} ${quoteError}` : text);
    if (res.error) {
      return { status: "error" as const, message: note(res.error) };
    }
    if (res.results.length === 0) {
      applyCheck(item.id, {
        lastPrice: item.lastPrice,
        lastRetailer: item.lastRetailer,
        lastChecked: new Date().toISOString(),
        lastProductUrl: item.lastProductUrl,
        lastName: item.lastName,
        lastImage: item.lastImage,
        lastOriginal: item.lastOriginal,
        lastSavings: item.lastSavings,
        lastUnitLabel: item.lastUnitLabel,
        lastUnitPrice: item.lastUnitPrice,
        lastUnitNoun: item.lastUnitNoun,
        onSale: item.onSale,
      });
      return {
        status: "empty" as const,
        message: note(`${item.name}: geen actieve aanbieding gevonden.`),
      };
    }
    const best = res.results[0];
    const each = unitAmount(best);
    applyCheck(item.id, {
      lastPrice: best.price,
      lastRetailer: best.retailer,
      lastChecked: new Date().toISOString(),
      lastProductUrl: best.productUrl,
      lastName: best.name,
      lastImage: best.imageUrl,
      lastOriginal: best.originalPrice,
      lastSavings: best.savingsPercentage,
      lastUnitLabel: unitCaption(best),
      lastUnitPrice: each.each ? each.price : null,
      lastUnitNoun: each.noun,
      onSale: true,
    });
    const place = retailerName(best.retailer);
    const fresh = useWatchlist.getState().items.find((row) => row.id === item.id) ?? item;
    const noun = each.noun;
    if (fresh.threshold > 0 && each.price <= fresh.threshold) {
      const msg = `${item.name} is ${euro(each.price)} per ${noun} bij ${place}.`;
      notify(msg);
      return { status: "hit" as const, message: note(msg) };
    }
    return {
      status: "miss" as const,
      message: note(
        fresh.threshold > 0
          ? `${item.name}: ${euro(each.price)} per ${noun} bij ${place}. Drempel is ${euro(fresh.threshold)} per ${noun}.`
          : `${item.name}: ${euro(each.price)} per ${noun} bij ${place}. Zet een drempel per ${noun}.`,
      ),
    };
  }

  async function checkAll(silent: boolean) {
    const list = useWatchlist.getState().items;
    if (list.length === 0 || busy) return;
    setBusy("all");
    let found = 0;
    for (let i = 0; i < list.length; i++) {
      setProgress(`${i + 1} van ${list.length}`);
      const result = await checkOne(list[i], true);
      if (result.status === "hit") found += 1;
      if (i < list.length - 1) await new Promise((r) => setTimeout(r, 350));
    }
    const stamp = new Date().toISOString();
    setLastGlobalCheck(stamp);
    setBusy(null);
    setProgress(null);
    const summary = found
      ? `${found} product${found === 1 ? "" : "en"} onder je drempel.`
      : "Niets onder je drempel.";
    if (!silent || found) setAllNote(summary);
  }

  function follow(
    name: string,
    extra?: {
      threshold?: number | null;
      onSale?: boolean;
      retailer?: string | null;
      unitLabel?: string | null;
      unitNoun?: string | null;
      paid?: number | null;
    },
  ) {
    const clean = name.trim();
    const onSale = extra?.onSale !== false;
    const paid = extra?.paid ?? null;
    const threshold = extra?.threshold ?? null;
    if (!clean || !(threshold != null && threshold > 0) || (!onSale && !(paid != null && paid > 0))) {
      toast.error("Vul een product en een drempel per stuk boven nul in.");
      return;
    }
    const exists = useWatchlist.getState().items.some((item) => item.name.toLowerCase() === clean.toLowerCase());
    if (exists) {
      toast("Dit product staat al op je lijst.");
      setTab("lijst");
      return;
    }
    addItem({
      name: clean,
      threshold: Math.round(threshold * 100) / 100,
      onSale,
      lastPrice: onSale ? null : Math.round((paid ?? 0) * 100) / 100,
      lastRetailer: extra?.retailer ?? null,
      lastUnitLabel: extra?.unitLabel ?? null,
      lastUnitNoun: extra?.unitNoun ?? null,
    });
    const noun = extra?.unitNoun || "stuk";
    toast.success(
      onSale
        ? `${clean} staat op je lijst. Drempel ${euro(threshold)} per ${noun}.`
        : `${clean} toegevoegd, ook zonder aanbieding.`,
    );
    setDraftName("");
    setTab("lijst");
  }

  function basket(offer: Offer) {
    if (!isAh(offer.retailer)) return;
    addToCart(offerToCart(offer));
    toast.success(`${offer.name} zit in je AH-mandje.`);
    setTab("mandje");
  }

  function basketPlain(name: string, price: number, unitLabel: string | null) {
    const clean = name.trim();
    const amount = Math.round(price * 100) / 100;
    if (!clean || !(amount > 0)) {
      toast.error("Vul een AH-product en een prijs in.");
      return;
    }
    addToCart({
      id: `ah-${clean.toLowerCase()}`,
      name: clean,
      price: amount,
      imageUrl: null,
      productUrl: null,
      unitLabel,
    });
    toast.success(`${clean} zit in je AH-mandje.`);
    setTab("mandje");
  }

  function drop(item: WatchItem) {
    removeItem(item.id);
    toast(`${item.name} verwijderd`, {
      action: { label: "Ongedaan", onClick: () => restoreItem(item) },
    });
  }

  return (
    <div className="min-h-screen bg-bg text-fg">
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: "var(--color-surface)",
            color: "var(--color-fg)",
            border: "1px solid var(--color-border)",
          },
        }}
      />
      <header className="bg-primary-dark text-on-primary">
        <div className="mx-auto flex max-w-3xl items-end justify-between gap-4 px-5 pt-6 pb-5">
          <div>
            <p className="text-xs font-medium tracking-widest text-on-primary/70 uppercase">Supermarkt</p>
            <h1 className="font-display text-3xl leading-none font-semibold tracking-tight">AanbiedingAlert</h1>
            <p className="mt-2 max-w-sm text-sm text-on-primary/80">Koop alleen als de prijs laag genoeg is.</p>
          </div>
          <div className="pb-1 text-right text-sm">
            <p className="font-display text-2xl leading-none tabular-nums">{hits}</p>
            <p className="text-on-primary/75">{hits === 1 ? "onder drempel" : "onder drempel"}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pt-5 pb-32">
        {tab === "lijst" && (
          <ListPanel
            items={items}
            hydrated={hydrated}
            lastGlobalCheck={lastGlobalCheck}
            busy={busy}
            progress={progress}
            allNote={allNote}
            itemNotes={itemNotes}
            onCheck={async (item) => {
              setBusy(item.id);
              const result = await checkOne(item, false);
              setBusy(null);
              if (result.message) setItemNotes((current) => ({ ...current, [item.id]: result.message as string }));
            }}
            onCheckAll={() => void checkAll(false)}
            onDrop={drop}
            onThreshold={setThreshold}
            onSuggest={(name) => {
              setDraftName(name);
              setTab("nieuw");
            }}
            onBasket={(item) => {
              if (!isAh(item.lastRetailer) || item.lastPrice == null) return;
              addToCart({
                id: item.id,
                name: item.lastName || item.name,
                price: item.lastPrice,
                imageUrl: item.lastImage,
                productUrl: item.lastProductUrl,
                unitLabel: item.lastUnitLabel,
              });
              toast.success(`${item.name} zit in je AH-mandje.`);
              setTab("mandje");
            }}
            onChoose={(item, offer) => {
              const each = unitAmount(offer);
              applyCheck(item.id, {
                lastPrice: offer.price,
                lastRetailer: offer.retailer,
                lastChecked: new Date().toISOString(),
                lastProductUrl: offer.productUrl,
                lastName: offer.name,
                lastImage: offer.imageUrl,
                lastOriginal: offer.originalPrice,
                lastSavings: offer.savingsPercentage,
                lastUnitLabel: unitCaption(offer),
                lastUnitPrice: each.each ? each.price : null,
                lastUnitNoun: each.noun,
                onSale: true,
              });
              toast.success(`${item.name}: ${offer.name} bij ${retailerName(offer.retailer)}.`);
            }}
            onBasketOffer={basket}
          />
        )}
        {tab === "nieuw" && (
          <AddPanel initialName={draftName} onFollow={follow} onBasket={basket} onPlainCart={basketPlain} />
        )}
        {tab === "scan" && (
          <ScanPanel
            onList={(product, price) => {
              addToCart({
                id: `lijst-${product.id}`,
                name: product.title,
                price,
                imageUrl: product.image,
                productUrl: product.ah?.url ?? product.jumbo?.url ?? null,
                unitLabel: product.size,
              });
            }}
          />
        )}
        {tab === "deals" && (
          <DealsPanel
            onFollow={(offer) => {
              const each = unitAmount(offer);
              follow(offer.name, {
                threshold: suggestUnitThreshold([offer]) ?? each.price,
                unitNoun: each.noun,
              });
            }}
            onBasket={basket}
          />
        )}
        {tab === "mandje" && <CartPanel />}
        {tab === "info" && (
          <InfoPanel
            count={items.length}
            onSuggest={(name) => {
              setDraftName(name);
              setTab("nieuw");
            }}
            onClear={() => {
              clearAll();
              toast("Lijst geleegd.");
            }}
          />
        )}
        <footer className="mt-10 text-center text-xs text-muted">
          Prijzen via PrijsProfeet · AH, Jumbo, Lidl, Aldi, PLUS, Dirk en meer · blijft op dit apparaat
        </footer>
      </main>

      <div className="fixed inset-x-3 bottom-4 z-30 mx-auto max-w-md">
        <nav className="flex rounded-full bg-primary-dark p-1 shadow-lg" aria-label="Onderdelen">
          {TABS.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => setTab(item.id)}
                className={
                  "flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-1 text-[11px] leading-none font-medium " +
                  (active ? "bg-on-primary text-primary-dark" : "text-on-primary/80")
                }
              >
                <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
                <span className="max-w-full text-[10px] leading-tight whitespace-nowrap">
                  {item.id === "mandje" && cartCount > 0 ? `Mandje ${cartCount}` : item.label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

function ListPanel({
  items,
  hydrated,
  lastGlobalCheck,
  busy,
  progress,
  allNote,
  itemNotes,
  onCheck,
  onCheckAll,
  onDrop,
  onThreshold,
  onSuggest,
  onBasket,
  onChoose,
  onBasketOffer,
}: {
  items: WatchItem[];
  hydrated: boolean;
  lastGlobalCheck: string | null;
  busy: string | null;
  progress: string | null;
  allNote: string | null;
  itemNotes: Record<string, string>;
  onCheck: (item: WatchItem) => void;
  onCheckAll: () => void;
  onDrop: (item: WatchItem) => void;
  onThreshold: (id: string, value: number) => void;
  onSuggest: (name: string) => void;
  onBasket: (item: WatchItem) => void;
  onChoose: (item: WatchItem, offer: Offer) => void;
  onBasketOffer: (offer: Offer) => void;
}) {
  const retailers = useWatchlist((s) => s.retailers);
  const [alts, setAlts] = useState<Record<string, { loading: boolean; offers: Offer[]; error: string | null }>>({});
  const [altAll, setAltAll] = useState(false);
  const [quoting, setQuoting] = useState<Record<string, boolean>>({});
  const quoteKey = items.map((item) => `${item.id}:${item.quotesAt ?? ""}`).join("|");

  useEffect(() => {
    if (!hydrated) return;
    const stale = useWatchlist.getState().items.filter((item) => {
      if (!item.quotesAt) return true;
      return Date.now() - new Date(item.quotesAt).getTime() > 12 * 60 * 60 * 1000;
    });
    if (stale.length === 0) return;
    let cancel = false;
    void (async () => {
      for (const item of stale) {
        if (cancel) return;
        setQuoting((current) => ({ ...current, [item.id]: true }));
        const res = await houseQuotes({ data: { q: item.name } });
        if (cancel) return;
        if (!res.error) {
          useWatchlist.getState().applyQuotes(item.id, {
            jumbo: toQuote(res.jumbo),
            ah: toQuote(res.ah),
            quotesAt: new Date().toISOString(),
          });
        }
        setQuoting((current) => ({ ...current, [item.id]: false }));
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    })();
    return () => {
      cancel = true;
    };
  }, [hydrated, quoteKey]);

  async function loadAlt(item: WatchItem) {
    setAlts((current) => ({
      ...current,
      [item.id]: { loading: true, offers: current[item.id]?.offers ?? [], error: null },
    }));
    const res = await searchOffers({
      data: { q: item.name, retailers, dealsOnly: true },
    });
    const offers = (res.error ? [] : res.results)
      .filter((offer) => {
        if (item.lastProductUrl && offer.productUrl && offer.productUrl === item.lastProductUrl) return false;
        const sameName = offer.name.toLowerCase() === (item.lastName || item.name).toLowerCase();
        if (sameName && (!item.lastRetailer || offer.retailer === item.lastRetailer)) return false;
        return true;
      })
      .slice(0, 4);
    setAlts((current) => ({
      ...current,
      [item.id]: { loading: false, offers, error: res.error },
    }));
  }

  async function loadAll() {
    if (altAll || items.length === 0) return;
    setAltAll(true);
    for (let i = 0; i < items.length; i++) {
      await loadAlt(items[i]);
      if (i < items.length - 1) await new Promise((resolve) => setTimeout(resolve, 300));
    }
    setAltAll(false);
    toast.success(`Alternatieven gezocht voor ${items.length} product${items.length === 1 ? "" : "en"}.`);
  }

  return (
    <section className="rise">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl">Jouw lijst</h2>
          <p className="text-sm text-muted">
            {lastGlobalCheck ? `Laatste ronde ${when(lastGlobalCheck)}. ` : ""}
            De drempel is de prijs per stuk, bijvoorbeeld per rol of per tablet.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => void loadAll()}
            disabled={!hydrated || items.length === 0 || altAll || busy != null}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-medium disabled:opacity-50"
          >
            {altAll ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowLeftRight className="size-4" />}
            Alternatieven
          </button>
          <button
            type="button"
            onClick={onCheckAll}
            disabled={!hydrated || items.length === 0 || busy != null}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-on-primary disabled:opacity-50"
          >
            {busy === "all" ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />}
            Check alles
          </button>
        </div>
      </div>
      {progress && <p className="mb-3 text-sm text-muted">Prijzen nalopen… {progress}</p>}
      {allNote && <p className="mb-3 text-sm text-primary">{allNote}</p>}

      {!hydrated && <p className="rounded-3xl bg-surface px-5 py-8 text-sm text-muted shadow-sm">Lijst laden…</p>}

      {hydrated && items.length === 0 && (
        <div className="rounded-3xl border border-border bg-surface px-5 py-8 shadow-sm">
          <ShoppingBasket className="size-8 text-primary" strokeWidth={1.5} aria-hidden="true" />
          <h3 className="mt-3 font-display text-xl">Nog niets op de lijst</h3>
          <p className="mt-1 max-w-md text-sm text-muted">
            Zet producten erop die je alleen meeneemt als ze écht in de aanbieding zijn. Tik een suggestie om te beginnen.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {SUGGESTED_ITEMS.slice(0, 8).map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => onSuggest(name)}
                className="min-h-11 rounded-full border border-border bg-paper px-4 text-sm text-fg"
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      )}

      {hydrated && items.length > 0 && (
        <div className="overflow-hidden rounded-3xl border border-border bg-surface shadow-sm">
          <div className="grid grid-cols-3 gap-2 border-b border-border bg-paper px-4 py-2 text-xs font-medium text-muted">
            <span>Laatst gezien</span>
            <span className="inline-flex items-center gap-1">
              <House className="size-3 shrink-0" aria-hidden="true" />
              Huisprijs Jumbo
            </span>
            <span className="inline-flex items-center gap-1">
              <House className="size-3 shrink-0" aria-hidden="true" />
              Huisprijs AH
            </span>
          </div>
          <ul>
          {items.map((item) => {
            const noun = item.lastUnitNoun || "stuk";
            const seen = item.lastUnitPrice ?? item.lastPrice;
            const under = item.onSale !== false && seen != null && item.threshold > 0 && seen <= item.threshold;
            const over = seen != null && item.threshold > 0 && seen > item.threshold;
            const jumboEach = item.jumbo ? (item.jumbo.unitPrice ?? item.jumbo.price) : null;
            const ahEach = item.ah ? (item.ah.unitPrice ?? item.ah.price) : null;
            return (
              <li key={item.id} className="border-b border-border px-4 py-4 last:border-b-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-lg leading-tight">{item.name}</h3>
                    {item.lastName && item.lastName.toLowerCase() !== item.name.toLowerCase() && (
                      <p className="truncate text-xs text-muted">Gevonden: {item.lastName}</p>
                    )}
                  </div>
                  <label className="w-28 shrink-0 text-[11px] text-muted">
                    Drempel per {noun}
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0.01}
                      step={0.01}
                      aria-label={`Drempel per ${noun} voor ${item.name}`}
                      value={item.threshold > 0 ? item.threshold : ""}
                      placeholder="0,30"
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        if (Number.isFinite(next) && next > 0) onThreshold(item.id, next);
                      }}
                      className="mt-1 h-9 w-full rounded-lg border border-border bg-paper px-2 text-sm text-fg tabular-nums"
                    />
                  </label>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <PriceCell
                    price={item.lastPrice}
                    detail={item.lastPrice != null ? retailerName(item.lastRetailer) : "nog geen prijs"}
                    extra={
                      item.lastSavings != null && item.lastSavings > 0 ? `−${Math.round(item.lastSavings)}%` : null
                    }
                    unit={item.lastUnitLabel}
                    under={under}
                  />
                  <PriceCell
                    price={item.jumbo?.price ?? null}
                    detail={
                      item.jumbo
                        ? item.jumbo.privateLabel
                          ? "Huismerk"
                          : item.jumbo.name
                        : quoting[item.id]
                          ? "ophalen…"
                          : "geen actie"
                    }
                    unit={item.jumbo?.unitLabel}
                    href={item.jumbo?.url}
                    under={jumboEach != null && item.threshold > 0 && jumboEach <= item.threshold}
                  />
                  <PriceCell
                    price={item.ah?.price ?? null}
                    detail={
                      item.ah
                        ? item.ah.privateLabel
                          ? "Huismerk"
                          : item.ah.name
                        : quoting[item.id]
                          ? "ophalen…"
                          : "geen actie"
                    }
                    unit={item.ah?.unitLabel}
                    href={item.ah?.url}
                    under={ahEach != null && item.threshold > 0 && ahEach <= item.threshold}
                  />
                </div>
                {over && item.onSale !== false ? (
                  <p className="mt-2 text-xs text-accent">Nog te duur per {noun}</p>
                ) : null}
                {item.onSale === false ? (
                  <p className="mt-2 text-xs text-muted">Geen actie tot er een aanbieding is</p>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onCheck(item)}
                    disabled={busy != null}
                    className="inline-flex h-11 items-center gap-1.5 rounded-full border border-border px-3 text-sm disabled:opacity-50"
                  >
                    {busy === item.id ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />}
                    Check
                  </button>
                  {itemNotes[item.id] && <p className="w-full text-sm text-primary">{itemNotes[item.id]}</p>}
                  <button
                    type="button"
                    onClick={() => void loadAlt(item)}
                    disabled={alts[item.id]?.loading || altAll}
                    className="inline-flex h-11 items-center gap-1.5 rounded-full border border-border px-3 text-sm disabled:opacity-50"
                  >
                    {alts[item.id]?.loading ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <ArrowLeftRight className="size-4" aria-hidden="true" />
                    )}
                    Alternatieven
                  </button>
                  <button
                    type="button"
                    onClick={() => onDrop(item)}
                    className="inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-sm text-muted"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                    Weg
                  </button>
                  {isAh(item.lastRetailer) && item.lastPrice != null && (
                    <button
                      type="button"
                      onClick={() => onBasket(item)}
                      className="inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-primary"
                    >
                      <ShoppingBasket className="size-4" aria-hidden="true" />
                      In mandje
                    </button>
                  )}
                  {item.lastProductUrl && (
                    <a
                      href={item.lastProductUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-11 items-center text-sm font-medium text-primary"
                    >
                      Bij de winkel
                    </a>
                  )}
                </div>
                {alts[item.id] && (
                  <AltList state={alts[item.id]} onChoose={(offer) => onChoose(item, offer)} onBasket={onBasketOffer} />
                )}
              </li>
            );
          })}
          </ul>
        </div>
      )}
    </section>
  );
}

function PriceCell({
  price,
  detail,
  extra,
  unit,
  href,
  under,
}: {
  price: number | null;
  detail: string;
  extra?: string | null;
  unit?: string | null;
  href?: string | null;
  under: boolean;
}) {
  const body = (
    <>
      <p className={"text-sm tabular-nums " + (under ? "font-semibold text-primary" : "text-fg")}>
        {price != null ? euro(price) : "—"}
      </p>
      <p className="line-clamp-2 text-[11px] leading-snug text-muted">
        {detail}
        {extra ? ` · ${extra}` : ""}
      </p>
      {unit && <p className="text-[11px] text-muted tabular-nums">{unit}</p>}
    </>
  );
  if (href && price != null) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="min-w-0">
        {body}
      </a>
    );
  }
  return <div className="min-w-0">{body}</div>;
}

function AltList({
  state,
  onChoose,
  onBasket,
}: {
  state: { loading: boolean; offers: Offer[]; error: string | null };
  onChoose: (offer: Offer) => void;
  onBasket: (offer: Offer) => void;
}) {
  if (state.loading && state.offers.length === 0) {
    return <p className="mt-3 text-sm text-muted">Alternatieven zoeken…</p>;
  }
  if (state.error) return <p className="mt-3 text-sm text-accent">{state.error}</p>;
  if (state.offers.length === 0) {
    return <p className="mt-3 text-sm text-muted">Geen andere aanbieding gevonden bij je winkels.</p>;
  }
  return (
    <ul className="mt-3 overflow-hidden rounded-2xl border border-border bg-paper">
      {state.offers.map((offer) => {
        const each = unitCaption(offer);
        return (
          <li key={offer.id} className="flex items-center gap-3 border-b border-border px-3 py-3 last:border-b-0">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{offer.name}</p>
              <p className="text-xs text-muted">
                {retailerName(offer.retailer)} · {euro(offer.price)}
                {each ? ` · ${each}` : ""}
                {offer.savingsPercentage != null && offer.savingsPercentage > 0
                  ? ` · −${Math.round(offer.savingsPercentage)}%`
                  : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onChoose(offer)}
              className="inline-flex h-10 items-center text-sm font-medium text-primary"
            >
              Kies dit
            </button>
            {isAh(offer.retailer) && (
              <button
                type="button"
                onClick={() => onBasket(offer)}
                className="inline-flex h-10 items-center text-sm font-medium text-primary"
              >
                Mandje
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function AddPanel({
  initialName,
  onFollow,
  onBasket,
  onPlainCart,
}: {
  initialName: string;
  onFollow: (
    name: string,
    extra?: {
      threshold?: number | null;
      onSale?: boolean;
      retailer?: string | null;
      unitLabel?: string | null;
      unitNoun?: string | null;
      paid?: number | null;
    },
  ) => void;
  onBasket: (offer: Offer) => void;
  onPlainCart: (name: string, price: number, unitLabel: string | null) => void;
}) {
  const retailers = useWatchlist((s) => s.retailers);
  const [name, setName] = useState(initialName);
  const [paid, setPaid] = useState("");
  const [threshold, setThreshold] = useState("");
  const [results, setResults] = useState<Offer[]>([]);
  const [searching, setSearching] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [plain, setPlain] = useState(false);
  const [storeId, setStoreId] = useState("albert_heijn");

  const storeChoices = STORES.filter((store) => retailers.includes(store.id));
  const activeStore = storeChoices.some((store) => store.id === storeId) ? storeId : (storeChoices[0]?.id ?? "");
  const typedPrice = Number(paid.replace(",", "."));
  const plainLabel =
    plain && name.trim() && typedPrice > 0
      ? unitCaption({ name, price: typedPrice, quantity: null, unit: null, unitPrice: null })
      : null;
  const typedThreshold = Number(threshold.replace(",", "."));
  const noun = results.map((offer) => unitAmount(offer)).find((each) => each.each)?.noun ?? "stuk";

  useEffect(() => {
    setName(initialName);
  }, [initialName]);

  useEffect(() => {
    if (plain) {
      setResults([]);
      setSearching(false);
      return;
    }
    const q = name.trim();
    if (q.length < 3) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const handle = setTimeout(() => {
      void searchOffers({ data: { q, retailers, dealsOnly: true } })
        .then((res) => {
          setResults(res.results.slice(0, 6));
          if (res.error) setHint(res.error);
          if (!threshold) {
            const suggested = suggestUnitThreshold(res.results);
            if (suggested) setThreshold(suggested.toFixed(2));
          }
        })
        .finally(() => setSearching(false));
    }, 400);
    return () => clearTimeout(handle);
  }, [name, plain, retailers]);

  async function suggest() {
    const q = name.trim();
    if (q.length < 2) {
      toast.error("Vul eerst een productnaam in.");
      return;
    }
    setSuggesting(true);
    const res = await searchOffers({ data: { q, retailers, dealsOnly: true } });
    setSuggesting(false);
    if (res.error) {
      setHint(res.error);
      return;
    }
    if (res.results.length === 0) {
      setHint("Geen actieve aanbieding bij je gekozen supermarkten.");
      return;
    }
    const value = suggestUnitThreshold(res.results);
    if (value == null) return;
    setThreshold(value.toFixed(2));
    const best = res.results[0];
    const each = unitAmount(best);
    setHint(
      `Voorstel ${euro(value)} per ${each.noun}. Nu ${euro(each.price)} per ${each.noun} bij ${retailerName(best.retailer)}.`,
    );
  }

  return (
    <section className="rise">
      <h2 className="font-display text-2xl">Product toevoegen</h2>
      <p className="mt-1 text-sm text-muted">
        Zoek een boodschap en zet de drempel op de prijs per stuk, rol of tablet.
      </p>

      <button
        type="button"
        aria-pressed={plain}
        onClick={() => {
          setPlain((value) => !value);
          setHint(null);
          setResults([]);
        }}
        className={
          "mt-4 inline-flex h-11 items-center rounded-full px-4 text-sm font-medium " +
          (plain ? "bg-primary text-on-primary" : "border border-border bg-surface")
        }
      >
        {plain ? "Zonder aanbieding" : "Alleen aanbiedingen"}
      </button>

      <label className="mt-5 block text-sm font-medium" htmlFor="product-name">
        Productnaam
      </label>
      <input
        id="product-name"
        value={name}
        onChange={(event) => {
          setName(event.target.value);
          setHint(null);
        }}
        placeholder="bijv. toiletpapier, wasmiddel, koffiebonen"
        className="mt-2 h-12 w-full rounded-2xl border border-border bg-surface px-4 text-base"
      />

      {!plain && (
        <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-surface">
          {searching && <p className="px-4 py-3 text-sm text-muted">Aanbiedingen zoeken…</p>}
          {!searching && name.trim().length >= 3 && results.length === 0 && (
            <p className="px-4 py-3 text-sm text-muted">Geen actieve aanbieding bij je gekozen supermarkten.</p>
          )}
          {results.map((offer) => {
            const each = unitCaption(offer);
            return (
              <div key={offer.id} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
                <button
                  type="button"
                  onClick={() => {
                    setName(offer.name);
                    const each = unitAmount(offer);
                    if (!threshold) setThreshold(each.price.toFixed(2));
                  }}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <Thumb src={offer.imageUrl} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{offer.name}</span>
                    <span className="text-xs text-muted">
                      {retailerName(offer.retailer)}
                      {offer.quantity ? ` · ${offer.quantity}` : ""}
                      {each ? ` · ${each}` : ""}
                    </span>
                  </span>
                  <span className="text-sm font-semibold tabular-nums">{euro(offer.price)}</span>
                </button>
                {isAh(offer.retailer) && (
                  <button
                    type="button"
                    onClick={() => onBasket(offer)}
                    className="inline-flex h-11 shrink-0 items-center gap-1 rounded-full px-2 text-sm font-medium text-primary"
                  >
                    <ShoppingBasket className="size-4" />
                    Mandje
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {plain && (
        <label className="mt-4 block text-sm font-medium" htmlFor="plain-store">
          Supermarkt
          <select
            id="plain-store"
            value={activeStore}
            onChange={(event) => setStoreId(event.target.value)}
            className="mt-2 h-12 w-full rounded-2xl border border-border bg-surface px-4 text-base"
          >
            {STORES.filter((store) => retailers.includes(store.id)).map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="mt-4 block text-sm font-medium" htmlFor="unit-threshold">
        Drempel per {noun}
        <input
          id="unit-threshold"
          type="number"
          inputMode="decimal"
          min={0.01}
          step={0.01}
          value={threshold}
          onChange={(event) => setThreshold(event.target.value)}
          placeholder="0,30"
          className="mt-2 h-12 w-full rounded-2xl border border-border bg-surface px-4 text-base tabular-nums"
        />
      </label>
      <p className="mt-2 text-sm text-muted">Seintje als de prijs per {noun} hieronder komt, niet de prijs van de hele verpakking.</p>

      {plain && (
        <div className="mt-4">
          <label className="block text-sm font-medium" htmlFor="paid-price">
            Prijs die je nu betaalt
          </label>
          <input
            id="paid-price"
            type="number"
            inputMode="decimal"
            min={0.01}
            step={0.01}
            value={paid}
            onChange={(event) => setPaid(event.target.value)}
            placeholder="3,50"
            className="mt-2 h-12 w-full rounded-2xl border border-border bg-surface px-4 text-base tabular-nums"
          />
        </div>
      )}

      {!plain && (
        <button
          type="button"
          onClick={() => void suggest()}
          disabled={suggesting}
          className="mt-4 inline-flex h-12 items-center justify-center gap-2 rounded-full border border-border bg-paper px-4 text-sm font-medium disabled:opacity-50"
        >
          {suggesting ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4 text-accent" />}
          Grok stelt een stukprijs voor
        </button>
      )}
      {hint && <p className="mt-3 text-sm text-muted">{hint}</p>}
      {plainLabel && <p className="mt-2 text-sm text-muted tabular-nums">Stukprijs: {plainLabel}</p>}
      {plain && (
        <p className="mt-3 text-sm text-muted">
          Dit product hoeft niet in de aanbieding te zijn. Je krijgt een seintje als de prijs per {noun} onder je drempel komt.
        </p>
      )}

      <button
        type="button"
        onClick={() =>
          onFollow(
            name,
            plain
              ? {
                  onSale: false,
                  retailer: activeStore,
                  unitLabel: plainLabel,
                  paid: typedPrice,
                  threshold: typedThreshold,
                  unitNoun: noun,
                }
              : { threshold: typedThreshold, unitNoun: noun },
          )
        }
        className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-on-primary"
      >
        <Plus className="size-4" />
        Zet op mijn lijst
      </button>
      {plain && isAh(activeStore) && (
        <button
          type="button"
          onClick={() => onPlainCart(name, typedPrice, plainLabel)}
          className="mt-2 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-primary text-sm font-semibold text-primary"
        >
          <ShoppingBasket className="size-4" />
          In het AH-mandje
        </button>
      )}
    </section>
  );
}

function DealsPanel({ onFollow, onBasket }: { onFollow: (offer: Offer) => void; onBasket: (offer: Offer) => void }) {
  const retailers = useWatchlist((s) => s.retailers);
  const retailerKey = retailers.join(",");
  const [offers, setOffers] = useState<Offer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [groceriesOnly, setGroceriesOnly] = useState(true);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    const run =
      query.trim().length >= 2
        ? searchOffers({ data: { q: query.trim(), retailers, dealsOnly: true } })
        : browseDeals({ data: { retailers } });
    void run.then((res) => {
      if (cancel) return;
      const allow = new Set(retailers);
      setOffers(res.results.filter((offer) => allow.has(offer.retailer)));
      setError(res.error);
      setLoading(false);
    });
    return () => {
      cancel = true;
    };
  }, [query, retailerKey, retailers]);

  function submitSearch(next: string) {
    setQuery(next.trim());
  }

  const visible = groceriesOnly ? offers.filter((offer) => offer.price <= 25) : offers;

  return (
    <section className="rise">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl">Aanbiedingen</h2>
          <p className="text-sm text-muted">
            {loading
              ? "Aanbiedingen ophalen bij je winkels…"
              : query.trim().length >= 2
                ? `${visible.length} resultaten`
                : `${visible.length} actuele aanbiedingen, verspreid over je winkels`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setGroceriesOnly((value) => !value)}
          className={
            "h-11 shrink-0 rounded-full px-4 text-sm font-medium " +
            (groceriesOnly ? "bg-primary text-on-primary" : "border border-border bg-surface text-fg")
          }
        >
          {groceriesOnly ? "Boodschappen" : "Alles"}
        </button>
      </div>

      <form
        className="mt-4 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submitSearch(draft);
        }}
      >
        <label className="sr-only" htmlFor="deal-search">
          Zoek aanbiedingen
        </label>
        <input
          id="deal-search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Zoek een aanbieding"
          className="h-12 min-w-0 flex-1 rounded-2xl border border-border bg-surface px-4 text-base"
        />
        <button
          type="submit"
          aria-label="Zoeken"
          className={
            "inline-flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-on-primary " +
            (draft.trim() !== query && draft.trim().length >= 2 ? "ring-2 ring-accent ring-offset-2 ring-offset-bg" : "")
          }
        >
          <Search className="size-5" strokeWidth={1.75} />
        </button>
      </form>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {["Toiletpapier", "Wasmiddel", "Koffie", "Luiers", "Pasta", "Cola"].map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => setDraft(chip)}
            className={
              "h-11 shrink-0 rounded-full border px-4 text-sm " +
              (draft === chip ? "border-primary bg-paper text-primary" : "border-border bg-surface")
            }
          >
            {chip}
          </button>
        ))}
      </div>
      {query.trim().length >= 2 && (
        <p className="mt-2 text-sm text-muted">
          Resultaten voor “{query}”.{" "}
          <button type="button" onClick={() => { setDraft(""); setQuery(""); }} className="font-medium text-primary">
            Wis zoekopdracht
          </button>
        </p>
      )}

      {loading && <p className="mt-6 text-sm text-muted">Aanbiedingen ophalen…</p>}
      {error && !loading && <p className="mt-6 text-sm text-accent">{error}</p>}
      {!loading && !error && visible.length === 0 && (
        <p className="mt-6 text-sm text-muted">
          Niets gevonden bij je gekozen supermarkten. Pas de loep-zoekterm of je instellingen aan.
        </p>
      )}
      {!loading && groceriesOnly && offers.length > visible.length && (
        <p className="mt-3 text-sm text-muted">
          {offers.length - visible.length} duurdere aanbiedingen verborgen. Tik op Alles om ze te zien.
        </p>
      )}

      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {!loading &&
          visible.map((offer) => {
            const each = unitCaption(offer);
            return (
              <li key={offer.id} className="flex gap-3 rounded-3xl border border-border bg-surface p-4 shadow-sm">
                <Thumb src={offer.imageUrl} />
                <div className="min-w-0 flex-1">
                  <h3 className="line-clamp-2 text-sm font-medium leading-snug">{offer.name}</h3>
                  <p className="mt-1 text-xs text-muted">{retailerName(offer.retailer)}</p>
                  <p className="mt-1 text-sm tabular-nums">
                    <span className="font-semibold text-primary">{euro(offer.price)}</span>
                    {offer.originalPrice != null && offer.originalPrice > offer.price && (
                      <span className="ml-2 text-muted line-through">{euro(offer.originalPrice)}</span>
                    )}
                    {offer.savingsPercentage != null && offer.savingsPercentage > 0 && (
                      <span className="ml-2 text-accent">−{Math.round(offer.savingsPercentage)}%</span>
                    )}
                  </p>
                  {each && <p className="text-xs text-muted tabular-nums">{each}</p>}
                  <div className="mt-2 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => onFollow(offer)}
                      className="inline-flex h-10 items-center gap-1 text-sm font-medium text-primary"
                    >
                      <Plus className="size-4" />
                      Volg dit
                    </button>
                    {isAh(offer.retailer) && (
                      <button
                        type="button"
                        onClick={() => onBasket(offer)}
                        className="inline-flex h-10 items-center gap-1 text-sm font-medium text-primary"
                      >
                        <ShoppingBasket className="size-4" />
                        In mandje
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
      </ul>
    </section>
  );
}

function CartPanel() {
  const cart = useWatchlist((s) => s.cart);
  const addToCart = useWatchlist((s) => s.addToCart);
  const setCartQty = useWatchlist((s) => s.setCartQty);
  const removeFromCart = useWatchlist((s) => s.removeFromCart);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [handoff, setHandoff] = useState<AhLink[] | null>(null);
  const [handing, setHanding] = useState(false);
  const total = cart.reduce((sum, line) => sum + line.price * line.qty, 0);

  async function prepareAh() {
    setHanding(true);
    try {
      const res = await resolveAhLinks({
        data: {
          lines: cart.map((line) => ({
            name: line.name,
            qty: line.qty,
            productUrl: line.productUrl,
            hint: line.id,
          })),
        },
      });
      setHandoff(res.links);
      if (res.links.every((line) => !line.url)) {
        toast.error("Geen passend AH-product gevonden.");
      }
    } catch {
      toast.error("Albert Heijn is nu niet bereikbaar.");
    } finally {
      setHanding(false);
    }
  }

  function openAh(mode: "app" | "web") {
    if (!handoff) return;
    const ready = handoff.filter((line) => (mode === "app" ? line.appUrl : line.url));
    if (ready.length === 0) {
      toast.error("Geen AH-product om te openen.");
      return;
    }
    let opened = 0;
    for (const line of ready) {
      const href = mode === "app" ? line.appUrl : line.url;
      if (!href) continue;
      const popup = window.open(href, "_blank", "noopener,noreferrer");
      if (popup) opened += 1;
    }
    if (opened === 0) toast("De browser blokkeerde nieuwe vensters. Tik een product hieronder.");
    else if (opened < ready.length) toast(`${opened} van ${ready.length} geopend.`);
  }

  function addPlain() {
    const clean = name.trim();
    const amount = Number(price.replace(",", "."));
    if (!clean || !(amount > 0)) {
      toast.error("Vul een AH-product en een prijs in.");
      return;
    }
    addToCart({
      id: `ah-${clean.toLowerCase()}`,
      name: clean,
      price: Math.round(amount * 100) / 100,
      imageUrl: null,
      productUrl: null,
      unitLabel: unitCaption({
        name: clean,
        price: amount,
        quantity: null,
        unit: null,
        unitPrice: null,
      }),
    });
    setName("");
    setPrice("");
    toast.success(`${clean} zit in je AH-mandje.`);
  }

  return (
    <section className="rise">
      <h2 className="font-display text-2xl">AH-mandje</h2>
      <p className="mt-1 text-sm text-muted">
        Alleen Albert Heijn. Aanbiedingen en gewone boodschappen, samen in de mand van deze app.
      </p>

      {cart.length === 0 ? (
        <p className="mt-6 rounded-3xl border border-border bg-surface px-5 py-8 text-sm text-muted">
          Nog leeg. Zoek een AH-product bij Deals of Nieuw, of vul hieronder zelf een prijs in.
        </p>
      ) : (
        <ul className="mt-4 overflow-hidden rounded-3xl border border-border bg-surface shadow-sm">
          {cart.map((line) => (
            <CartRow key={line.id} line={line} onQty={setCartQty} onRemove={removeFromCart} />
          ))}
        </ul>
      )}

      {cart.length > 0 && (
        <div className="mt-4">
          <p className="flex items-baseline justify-between font-display text-2xl tabular-nums">
            <span>Totaal</span>
            <span>{euro(total)}</span>
          </p>
          <button
            type="button"
            onClick={() => void prepareAh()}
            disabled={handing}
            className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-on-primary disabled:opacity-50"
          >
            {handing ? <LoaderCircle className="size-4 animate-spin" /> : <ExternalLink className="size-4" />}
            Alles naar AH
          </button>
          {handoff && (
            <div className="mt-4 rounded-3xl border border-border bg-surface p-4">
              <p className="text-sm text-muted">
                De hele mand in één keer. Op je telefoon opent ah.nl de AH-app als die geïnstalleerd is.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openAh("app")}
                  className="inline-flex h-11 items-center rounded-full bg-primary px-4 text-sm font-medium text-on-primary"
                >
                  In de AH-app
                </button>
                <button
                  type="button"
                  onClick={() => openAh("web")}
                  className="inline-flex h-11 items-center rounded-full border border-border px-4 text-sm font-medium"
                >
                  Op ah.nl
                </button>
              </div>
              <ul className="mt-3 space-y-2">
                {handoff.map((line) => (
                  <li key={`${line.name}-${line.webshopId ?? "x"}`} className="text-sm">
                    <span className="tabular-nums">{line.qty}×</span> {line.title && line.title !== line.name ? line.title : line.name}
                    {line.url ? (
                      <span className="mt-1 flex gap-3">
                        <a href={line.appUrl ?? line.url} className="font-medium text-primary">
                          AH-app
                        </a>
                        <a href={line.url} target="_blank" rel="noreferrer" className="font-medium text-primary">
                          ah.nl
                        </a>
                      </span>
                    ) : (
                      <span className="mt-1 block text-muted">Niet gevonden bij AH</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 rounded-3xl border border-border bg-surface p-5 shadow-sm">
        <h3 className="font-display text-xl">Zonder aanbieding</h3>
        <p className="mt-1 text-sm text-muted">Een AH-boodschap die nu niet in de actie is.</p>
        <label className="mt-4 block text-sm font-medium" htmlFor="cart-name">
          Product
        </label>
        <input
          id="cart-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="bijv. halfvolle melk"
          className="mt-2 h-12 w-full rounded-2xl border border-border bg-paper px-4"
        />
        <label className="mt-3 block text-sm font-medium" htmlFor="cart-price">
          Prijs
        </label>
        <input
          id="cart-price"
          type="number"
          inputMode="decimal"
          min={0.01}
          step={0.01}
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          placeholder="1,29"
          className="mt-2 h-12 w-full rounded-2xl border border-border bg-paper px-4 tabular-nums"
        />
        <button
          type="button"
          onClick={addPlain}
          className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-on-primary"
        >
          <Plus className="size-4" />
          In het AH-mandje
        </button>
      </div>
    </section>
  );
}

function CartRow({
  line,
  onQty,
  onRemove,
}: {
  line: CartLine;
  onQty: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <li className="flex gap-3 border-b border-border px-4 py-4 last:border-b-0">
      <Thumb src={line.imageUrl} />
      <div className="min-w-0 flex-1">
        <h3 className="font-display text-lg leading-tight">{line.name}</h3>
        <p className="text-sm tabular-nums">
          {euro(line.price)}
          {line.unitLabel ? <span className="text-muted"> · {line.unitLabel}</span> : null}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            aria-label="Minder"
            onClick={() => onQty(line.id, line.qty - 1)}
            className="inline-flex size-11 items-center justify-center rounded-full border border-border"
          >
            <Minus className="size-4" />
          </button>
          <span className="w-6 text-center tabular-nums">{line.qty}</span>
          <button
            type="button"
            aria-label="Meer"
            onClick={() => onQty(line.id, line.qty + 1)}
            className="inline-flex size-11 items-center justify-center rounded-full border border-border"
          >
            <Plus className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => onRemove(line.id)}
            className="ml-auto inline-flex h-11 items-center text-sm text-muted"
          >
            Weg
          </button>
        </div>
      </div>
      <p className="text-sm font-semibold tabular-nums">{euro(line.price * line.qty)}</p>
    </li>
  );
}

function InfoPanel({
  count,
  onSuggest,
  onClear,
}: {
  count: number;
  onSuggest: (name: string) => void;
  onClear: () => void;
}) {
  const retailers = useWatchlist((s) => s.retailers);
  const toggleRetailer = useWatchlist((s) => s.toggleRetailer);
  const setRetailers = useWatchlist((s) => s.setRetailers);
  const [perm, setPerm] = useState<string>("default");
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (typeof Notification !== "undefined") setPerm(Notification.permission);
  }, []);

  async function enable() {
    if (typeof Notification === "undefined") {
      toast.error("Deze browser ondersteunt geen meldingen.");
      return;
    }
    const next = await Notification.requestPermission();
    setPerm(next);
    toast(next === "granted" ? "Meldingen staan aan." : "Meldingen niet toegestaan.");
  }

  return (
    <section className="rise space-y-4">
      <div className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
        <h2 className="font-display text-2xl">Supermarkten</h2>
        <p className="mt-1 text-sm text-muted">
          Zoeken, checks en deals gebruiken alleen de winkels die aan staan. De rest wordt overgeslagen.
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setRetailers(ALL_STORE_IDS)}
            className="inline-flex h-11 items-center rounded-full border border-border px-4 text-sm"
          >
            Alles
          </button>
          <button
            type="button"
            onClick={() => setRetailers(["albert_heijn"])}
            className="inline-flex h-11 items-center rounded-full border border-border px-4 text-sm"
          >
            Alleen AH
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {STORES.map((store) => {
            const on = retailers.includes(store.id);
            return (
              <button
                key={store.id}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  if (on && retailers.length === 1) {
                    toast("Laat minstens één supermarkt aan.");
                    return;
                  }
                  toggleRetailer(store.id);
                }}
                className={
                  "min-h-11 rounded-full px-4 text-sm " +
                  (on ? "bg-primary text-on-primary" : "border border-border bg-paper text-muted")
                }
              >
                {store.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
        <h2 className="font-display text-2xl">Meldingen</h2>
        <p className="mt-1 text-sm text-muted">
          Een seintje zodra de prijs per stuk onder jouw drempel zakt. De app checkt ook zelf als je hem opent en de vorige ronde meer dan {HOURS_BETWEEN_CHECKS} uur geleden is.
        </p>
        <button
          type="button"
          onClick={() => void enable()}
          className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-on-primary"
        >
          {perm === "granted" ? <BellRing className="size-4" /> : <Bell className="size-4" />}
          {perm === "granted" ? "Meldingen staan aan" : "Meldingen inschakelen"}
        </button>
        {perm === "granted" && (
          <p className="mt-2 flex items-center gap-1 text-sm text-primary">
            <Check className="size-4" /> Klaar. Houd de app af en toe open voor een verse check.
          </p>
        )}
      </div>

      <div className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
        <h2 className="font-display text-2xl">Vaak alleen in de aanbieding</h2>
        <p className="mt-1 text-sm text-muted">Tik om ze toe te voegen.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {SUGGESTED_ITEMS.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => onSuggest(name)}
              className="min-h-11 rounded-full border border-border bg-paper px-4 text-sm"
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
        <h2 className="font-display text-2xl">Over de prijzen</h2>
        <p className="mt-2 text-sm text-muted">
          Aanbiedingen komen van PrijsProfeet: meer dan tien Nederlandse supermarkten, elke nacht ververst. Jouw lijst en drempels blijven in deze browser. Niets wordt op een account opgeslagen.
        </p>
        <a
          href="https://www.prijsprofeet.nl"
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex h-11 items-center text-sm font-medium text-primary"
        >
          prijsprofeet.nl
        </a>
      </div>

      <div className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
        <h2 className="font-display text-xl">Lijst legen</h2>
        <p className="mt-1 text-sm text-muted">{count === 0 ? "De lijst is leeg." : `${count} product${count === 1 ? "" : "en"} op dit apparaat.`}</p>
        {!confirmClear ? (
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            disabled={count === 0}
            className="mt-3 inline-flex h-11 items-center rounded-full border border-border px-4 text-sm text-accent disabled:opacity-50"
          >
            Alles verwijderen
          </button>
        ) : (
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                onClear();
                setConfirmClear(false);
              }}
              className="inline-flex h-11 items-center rounded-full bg-accent px-4 text-sm font-medium text-on-primary"
            >
              Ja, leegmaken
            </button>
            <button
              type="button"
              onClick={() => setConfirmClear(false)}
              className="inline-flex h-11 items-center rounded-full border border-border px-4 text-sm"
            >
              Annuleer
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  BellRing,
  Check,
  ListChecks,
  LoaderCircle,
  Percent,
  Plus,
  Search,
  ShoppingBasket,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { fetchTopDeals, searchOffers, type Offer } from "@/lib/offers";
import { HOURS_BETWEEN_CHECKS, SUGGESTED_ITEMS, euro, retailerName, suggestThreshold, when } from "@/lib/money";
import { useWatchlist, type WatchItem } from "@/lib/watchlist";

type Tab = "lijst" | "nieuw" | "deals" | "info";

const TABS: { id: Tab; label: string; icon: typeof ListChecks }[] = [
  { id: "lijst", label: "Lijst", icon: ListChecks },
  { id: "nieuw", label: "Nieuw", icon: Plus },
  { id: "deals", label: "Deals", icon: Percent },
  { id: "info", label: "Info", icon: SlidersHorizontal },
];

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
  const setThreshold = useWatchlist((s) => s.setThreshold);
  const applyCheck = useWatchlist((s) => s.applyCheck);
  const setLastGlobalCheck = useWatchlist((s) => s.setLastGlobalCheck);
  const clearAll = useWatchlist((s) => s.clearAll);

  const [tab, setTab] = useState<Tab>("lijst");
  const [draftName, setDraftName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
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
    () => items.filter((item) => item.lastPrice != null && item.lastPrice <= item.threshold).length,
    [items],
  );

  async function checkOne(item: WatchItem, silent: boolean) {
    const res = await searchOffers({ data: { q: item.name } });
    if (res.error) {
      if (!silent) toast.error(res.error);
      return "error" as const;
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
      });
      if (!silent) toast(`${item.name}: geen actieve aanbieding gevonden.`);
      return "empty" as const;
    }
    const best = res.results[0];
    applyCheck(item.id, {
      lastPrice: best.price,
      lastRetailer: best.retailer,
      lastChecked: new Date().toISOString(),
      lastProductUrl: best.productUrl,
      lastName: best.name,
      lastImage: best.imageUrl,
      lastOriginal: best.originalPrice,
      lastSavings: best.savingsPercentage,
    });
    const place = retailerName(best.retailer);
    if (best.price <= item.threshold) {
      const msg = `${item.name} is ${euro(best.price)} bij ${place}.`;
      toast.success(msg);
      notify(msg);
      return "hit" as const;
    }
    if (!silent) {
      toast(`${item.name}: laagste prijs ${euro(best.price)} bij ${place}. Drempel is ${euro(item.threshold)}.`);
    }
    return "miss" as const;
  }

  async function checkAll(silent: boolean) {
    const list = useWatchlist.getState().items;
    if (list.length === 0 || busy) return;
    setBusy("all");
    let found = 0;
    for (let i = 0; i < list.length; i++) {
      setProgress(`${i + 1} van ${list.length}`);
      const result = await checkOne(list[i], true);
      if (result === "hit") found += 1;
      if (i < list.length - 1) await new Promise((r) => setTimeout(r, 350));
    }
    const stamp = new Date().toISOString();
    setLastGlobalCheck(stamp);
    setBusy(null);
    setProgress(null);
    if (!silent) {
      toast.success(found ? `${found} product${found === 1 ? "" : "en"} onder je drempel.` : "Niets onder je drempel.");
    } else if (found) {
      toast.success(`${found} product${found === 1 ? "" : "en"} onder je drempel.`);
    }
  }

  function follow(name: string, threshold: number) {
    const clean = name.trim();
    if (!clean || !(threshold > 0)) {
      toast.error("Vul een product en een prijs boven nul in.");
      return;
    }
    const exists = useWatchlist.getState().items.some((item) => item.name.toLowerCase() === clean.toLowerCase());
    if (exists) {
      toast("Dit product staat al op je lijst.");
      setTab("lijst");
      return;
    }
    addItem({ name: clean, threshold: Math.round(threshold * 100) / 100 });
    toast.success(`${clean} staat op je lijst.`);
    setDraftName("");
    setTab("lijst");
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
        {progress && (
          <p className="mb-4 rounded-2xl bg-accent-soft px-4 py-3 text-sm text-fg">
            Prijzen nalopen… {progress}
          </p>
        )}
        {tab === "lijst" && (
          <ListPanel
            items={items}
            hydrated={hydrated}
            lastGlobalCheck={lastGlobalCheck}
            busy={busy}
            onCheck={(item) => {
              setBusy(item.id);
              void checkOne(item, false).finally(() => setBusy(null));
            }}
            onCheckAll={() => void checkAll(false)}
            onDrop={drop}
            onThreshold={setThreshold}
            onSuggest={(name) => {
              setDraftName(name);
              setTab("nieuw");
            }}
          />
        )}
        {tab === "nieuw" && <AddPanel initialName={draftName} onFollow={follow} />}
        {tab === "deals" && <DealsPanel onFollow={(offer) => follow(offer.name, suggestThreshold([offer]) ?? offer.price)} />}
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
                  "flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-xs font-medium " +
                  (active ? "bg-on-primary text-primary-dark" : "text-on-primary/80")
                }
              >
                <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
                {item.label}
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
  onCheck,
  onCheckAll,
  onDrop,
  onThreshold,
  onSuggest,
}: {
  items: WatchItem[];
  hydrated: boolean;
  lastGlobalCheck: string | null;
  busy: string | null;
  onCheck: (item: WatchItem) => void;
  onCheckAll: () => void;
  onDrop: (item: WatchItem) => void;
  onThreshold: (id: string, value: number) => void;
  onSuggest: (name: string) => void;
}) {
  return (
    <section className="rise">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl">Jouw lijst</h2>
          <p className="text-sm text-muted">
            {lastGlobalCheck ? `Laatste ronde ${when(lastGlobalCheck)}` : "Nog niet gecontroleerd"}
          </p>
        </div>
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
        <ul className="overflow-hidden rounded-3xl border border-border bg-surface shadow-sm">
          {items.map((item) => {
            const under = item.lastPrice != null && item.lastPrice <= item.threshold;
            const over = item.lastPrice != null && item.lastPrice > item.threshold;
            return (
              <li key={item.id} className="border-b border-border px-4 py-4 last:border-b-0">
                <div className="flex gap-3">
                  <Thumb src={item.lastImage} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-display text-lg leading-tight">{item.name}</h3>
                      {under && (
                        <span className="shrink-0 rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-on-primary">
                          Koop nu
                        </span>
                      )}
                      {over && (
                        <span className="shrink-0 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
                          Nog te duur
                        </span>
                      )}
                    </div>
                    {item.lastPrice != null ? (
                      <p className="mt-1 text-sm tabular-nums">
                        <span className={under ? "font-semibold text-primary" : "text-fg"}>{euro(item.lastPrice)}</span>
                        <span className="text-muted"> · {retailerName(item.lastRetailer)}</span>
                        {item.lastSavings != null && item.lastSavings > 0 && (
                          <span className="text-accent"> · −{Math.round(item.lastSavings)}%</span>
                        )}
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-muted">Nog geen prijs opgehaald</p>
                    )}
                    {item.lastName && item.lastName.toLowerCase() !== item.name.toLowerCase() && (
                      <p className="truncate text-xs text-muted">Gevonden: {item.lastName}</p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-2 text-xs text-muted">
                        Drempel
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0.01}
                          step={0.01}
                          aria-label={`Drempel voor ${item.name}`}
                          value={item.threshold}
                          onChange={(event) => {
                            const next = Number(event.target.value);
                            if (Number.isFinite(next) && next > 0) onThreshold(item.id, Math.round(next * 100) / 100);
                          }}
                          className="h-11 w-28 rounded-xl border border-border bg-paper px-3 text-sm text-fg tabular-nums"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => onCheck(item)}
                        disabled={busy != null}
                        className="inline-flex h-11 items-center gap-1.5 rounded-full border border-border px-3 text-sm disabled:opacity-50"
                      >
                        {busy === item.id ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />}
                        Check
                      </button>
                      <button
                        type="button"
                        onClick={() => onDrop(item)}
                        className="inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-sm text-muted"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                        Weg
                      </button>
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
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function AddPanel({
  initialName,
  onFollow,
}: {
  initialName: string;
  onFollow: (name: string, threshold: number) => void;
}) {
  const [name, setName] = useState(initialName);
  const [threshold, setThreshold] = useState("");
  const [results, setResults] = useState<Offer[]>([]);
  const [searching, setSearching] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  useEffect(() => {
    setName(initialName);
  }, [initialName]);

  useEffect(() => {
    const q = name.trim();
    if (q.length < 3) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const handle = setTimeout(() => {
      void searchOffers({ data: { q } })
        .then((res) => {
          setResults(res.results.slice(0, 5));
          if (res.error) setHint(res.error);
        })
        .finally(() => setSearching(false));
    }, 400);
    return () => clearTimeout(handle);
  }, [name]);

  async function suggest() {
    const q = name.trim();
    if (q.length < 2) {
      toast.error("Vul eerst een productnaam in.");
      return;
    }
    setSuggesting(true);
    const res = await searchOffers({ data: { q } });
    setSuggesting(false);
    if (res.error) {
      setHint(res.error);
      return;
    }
    if (res.results.length === 0) {
      setHint("Geen actieve aanbieding. Zet zelf een drempel, of probeer een andere naam.");
      return;
    }
    const value = suggestThreshold(res.results);
    if (value == null) return;
    setThreshold(value.toFixed(2));
    const best = res.results[0];
    setHint(
      `Voorstel ${euro(value)}. Laagste aanbieding nu is ${euro(best.price)} bij ${retailerName(best.retailer)}.`,
    );
  }

  return (
    <section className="rise">
      <h2 className="font-display text-2xl">Product toevoegen</h2>
      <p className="mt-1 text-sm text-muted">Zoek een boodschap en kies de prijs waaronder je een seintje wilt.</p>

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

      <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-surface">
        {searching && <p className="px-4 py-3 text-sm text-muted">Aanbiedingen zoeken…</p>}
        {!searching && name.trim().length >= 3 && results.length === 0 && (
          <p className="px-4 py-3 text-sm text-muted">Geen actieve aanbieding voor deze naam.</p>
        )}
        {results.map((offer) => (
          <button
            key={offer.id}
            type="button"
            onClick={() => {
              setName(offer.name);
              if (!threshold) setThreshold((suggestThreshold([offer]) ?? offer.price).toFixed(2));
            }}
            className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left last:border-b-0"
          >
            <Thumb src={offer.imageUrl} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{offer.name}</span>
              <span className="text-xs text-muted">
                {retailerName(offer.retailer)}
                {offer.quantity ? ` · ${offer.quantity}` : ""}
              </span>
            </span>
            <span className="text-sm font-semibold tabular-nums">{euro(offer.price)}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:flex-1">
          <label className="block text-sm font-medium" htmlFor="threshold">
            Maximale prijs
          </label>
          <input
            id="threshold"
            type="number"
            inputMode="decimal"
            min={0.01}
            step={0.01}
            value={threshold}
            onChange={(event) => setThreshold(event.target.value)}
            placeholder="3,50"
            className="mt-2 h-12 w-full rounded-2xl border border-border bg-surface px-4 text-base tabular-nums"
          />
        </div>
        <button
          type="button"
          onClick={() => void suggest()}
          disabled={suggesting}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-border bg-paper px-4 text-sm font-medium disabled:opacity-50"
        >
          {suggesting ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4 text-accent" />}
          Grok stelt een prijs voor
        </button>
      </div>
      {hint && <p className="mt-3 text-sm text-muted">{hint}</p>}

      <button
        type="button"
        onClick={() => onFollow(name, Number(threshold.replace(",", ".")))}
        className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-on-primary"
      >
        <Plus className="size-4" />
        Zet op mijn lijst
      </button>
    </section>
  );
}

function DealsPanel({ onFollow }: { onFollow: (offer: Offer) => void }) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [groceriesOnly, setGroceriesOnly] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    void fetchTopDeals().then((res) => {
      if (cancel) return;
      setOffers(res.results);
      setError(res.error);
      setLoading(false);
    });
    return () => {
      cancel = true;
    };
  }, []);

  async function runSearch(q: string) {
    setQuery(q);
    setLoading(true);
    const res = await searchOffers({ data: { q } });
    setOffers(res.results);
    setError(res.error);
    setLoading(false);
  }

  const visible = groceriesOnly ? offers.filter((offer) => offer.price <= 25) : offers;

  return (
    <section className="rise">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl">Aanbiedingen</h2>
          <p className="text-sm text-muted">Actuele kortingen. Tik om ze te volgen.</p>
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

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {["Toiletpapier", "Wasmiddel", "Koffie", "Luiers", "Pasta", "Cola"].map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => void runSearch(chip)}
            className={
              "h-11 shrink-0 rounded-full border px-4 text-sm " +
              (query === chip ? "border-primary bg-primary text-on-primary" : "border-border bg-surface")
            }
          >
            {chip}
          </button>
        ))}
      </div>

      {loading && <p className="mt-6 text-sm text-muted">Aanbiedingen ophalen…</p>}
      {error && !loading && <p className="mt-6 text-sm text-accent">{error}</p>}
      {!loading && !error && visible.length === 0 && (
        <p className="mt-6 text-sm text-muted">Geen deals in deze selectie. Zet ‘Alles’ aan of kies een product.</p>
      )}

      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {!loading &&
          visible.slice(0, 12).map((offer) => (
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
                <button
                  type="button"
                  onClick={() => onFollow(offer)}
                  className="mt-2 inline-flex h-10 items-center gap-1 text-sm font-medium text-primary"
                >
                  <Plus className="size-4" />
                  Volg dit
                </button>
              </div>
            </li>
          ))}
      </ul>
    </section>
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
        <h2 className="font-display text-2xl">Meldingen</h2>
        <p className="mt-1 text-sm text-muted">
          Een seintje zodra een product onder jouw drempel zakt. De app checkt ook zelf als je hem opent en de vorige ronde meer dan {HOURS_BETWEEN_CHECKS} uur geleden is.
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

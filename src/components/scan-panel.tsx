import { useState } from "react";
import { LoaderCircle, ShoppingBasket } from "lucide-react";
import { compareAssortment, type ComparedProduct, type ShelfPrice } from "@/lib/compare";
import { euro } from "@/lib/money";
import { BarcodeScan } from "@/components/barcode-scan";

function PriceColumn({ label, shelf }: { label: string; shelf: ShelfPrice | null }) {
  if (!shelf) {
    return (
      <div>
        <p className="text-xs text-muted">{label}</p>
        <p className="text-sm text-muted">niet in assortiment</p>
      </div>
    );
  }
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-sm font-semibold tabular-nums text-fg">{euro(shelf.price)}</p>
      {shelf.was != null && <p className="text-xs text-muted line-through tabular-nums">{euro(shelf.was)}</p>}
      <p className="line-clamp-2 text-[11px] text-muted">
        {shelf.size ?? shelf.title}
        {shelf.unitLabel ? ` · ${shelf.unitLabel}` : ""}
      </p>
      {shelf.url && (
        <a href={shelf.url} target="_blank" rel="noreferrer" className="text-xs font-medium text-primary">
          Bekijk
        </a>
      )}
    </div>
  );
}

export function ScanPanel({ onList }: { onList: (product: ComparedProduct, price: number) => void }) {
  const [base, setBase] = useState<"albert_heijn" | "jumbo">("albert_heijn");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ComparedProduct[]>([]);
  const [added, setAdded] = useState<string | null>(null);

  async function run(query: string) {
    const q = query.trim();
    if (q.length < 2) return;
    setLoading(true);
    setError(null);
    setAdded(null);
    const res = await compareAssortment({ data: { q, base } });
    setRows(res.results);
    setError(res.error ?? (res.results.length === 0 ? "Niets gevonden in dit assortiment." : null));
    setLoading(false);
  }

  return (
    <section className="rise">
      <h2 className="font-display text-2xl">Prijzen vergelijken</h2>
      <p className="mt-1 text-sm text-muted">
        Zoek of scan een artikel. De lijst start bij het assortiment van Albert Heijn of Jumbo, met de prijs bij de ander ernaast.
      </p>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          aria-pressed={base === "albert_heijn"}
          onClick={() => setBase("albert_heijn")}
          className={
            "h-11 rounded-full px-4 text-sm font-medium " +
            (base === "albert_heijn" ? "bg-primary text-on-primary" : "border border-border bg-surface")
          }
        >
          AH-assortiment
        </button>
        <button
          type="button"
          aria-pressed={base === "jumbo"}
          onClick={() => setBase("jumbo")}
          className={
            "h-11 rounded-full px-4 text-sm font-medium " +
            (base === "jumbo" ? "bg-primary text-on-primary" : "border border-border bg-surface")
          }
        >
          Jumbo-assortiment
        </button>
      </div>

      <form
        className="mt-4 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void run(draft);
        }}
      >
        <label className="sr-only" htmlFor="compare-search">
          Artikel of barcode
        </label>
        <input
          id="compare-search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Naam of barcode"
          className="h-12 min-w-0 flex-1 rounded-2xl border border-border bg-surface px-4 text-base"
        />
        <button type="submit" className="inline-flex h-12 items-center rounded-2xl border border-border bg-surface px-4 text-sm font-medium">
          Zoek
        </button>
      </form>

      <div className="mt-3">
        <BarcodeScan
          onCode={(code) => {
            setDraft(code);
            void run(code);
          }}
        />
      </div>

      {loading && (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted">
          <LoaderCircle className="size-4 animate-spin" />
          Prijzen ophalen…
        </p>
      )}
      {error && !loading && <p className="mt-4 text-sm text-accent">{error}</p>}

      <ul className="mt-4 space-y-3">
        {rows.map((row) => {
          const price = (base === "jumbo" ? row.jumbo?.price : row.ah?.price) ?? row.ah?.price ?? row.jumbo?.price ?? 0;
          const cheaper =
            row.ah && row.jumbo ? (row.ah.price <= row.jumbo.price ? "ah" : "jumbo") : null;
          return (
            <li key={row.id} className="rounded-3xl border border-border bg-surface p-4 shadow-sm">
              <div className="flex gap-3">
                {row.image ? (
                  <img src={row.image} alt="" className="size-16 shrink-0 rounded-2xl bg-paper object-contain" />
                ) : (
                  <div className="size-16 shrink-0 rounded-2xl bg-paper" />
                )}
                <div className="min-w-0">
                  <h3 className="font-display text-lg leading-tight">{row.title}</h3>
                  <p className="text-xs text-muted">
                    {[row.brand, row.size].filter(Boolean).join(" · ")}
                    {cheaper === "ah" ? " · goedkoper bij AH" : cheaper === "jumbo" ? " · goedkoper bij Jumbo" : ""}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <PriceColumn label="Albert Heijn" shelf={row.ah} />
                <PriceColumn label="Jumbo" shelf={row.jumbo} />
              </div>
              <button
                type="button"
                disabled={!(price > 0)}
                onClick={() => {
                  onList(row, price);
                  setAdded(row.id);
                }}
                className="mt-3 inline-flex h-11 items-center gap-2 rounded-full border border-border px-4 text-sm font-medium disabled:opacity-50"
              >
                <ShoppingBasket className="size-4" aria-hidden="true" />
                Op boodschappenlijst
              </button>
              {added === row.id && <p className="mt-2 text-sm text-primary">Staat op je boodschappenlijst.</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

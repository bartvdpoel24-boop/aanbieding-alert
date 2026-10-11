import { useEffect, useRef, useState } from "react";
import { ScanLine, X } from "lucide-react";

type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue?: string }[]> };

function nativeDetector(): Detector | null {
  const ctor = (globalThis as { BarcodeDetector?: new (opts: { formats: string[] }) => Detector }).BarcodeDetector;
  if (!ctor) return null;
  try {
    return new ctor({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
  } catch {
    return null;
  }
}

export function BarcodeScan({ onCode }: { onCode: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let stop = false;
    const video = videoRef.current;
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" } },
        });
        if (stop) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        const detector = nativeDetector();
        if (detector) {
          while (!stop) {
            const codes = await detector.detect(video);
            const raw = codes.map((code) => (code.rawValue ?? "").replace(/\D/g, "")).find((code) => code.length >= 8);
            if (raw) {
              setOpen(false);
              onCodeRef.current(raw);
              return;
            }
            await new Promise((resolve) => setTimeout(resolve, 280));
          }
          return;
        }
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        const result = await reader.decodeOnceFromVideoElement(video);
        if (!stop) {
          const raw = result.getText().replace(/\D/g, "");
          if (raw.length >= 8) {
            setOpen(false);
            onCodeRef.current(raw);
          }
        }
      } catch {
        if (!stop) setError("Camera niet beschikbaar. Sta toegang toe, of typ de barcode.");
      }
    })();
    return () => {
      stop = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [open]);

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="inline-flex h-12 items-center gap-2 rounded-2xl bg-primary px-4 text-sm font-semibold text-on-primary"
      >
        <ScanLine className="size-4" aria-hidden="true" />
        Scan barcode
      </button>
      {error && <p className="mt-2 text-sm text-accent">{error}</p>}
      {open && (
        <div className="mt-3 overflow-hidden rounded-3xl border border-border bg-primary-dark">
          <div className="flex items-center justify-between px-4 py-3 text-on-primary">
            <p className="text-sm">Richt de camera op de barcode</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex size-11 items-center justify-center rounded-full text-on-primary"
              aria-label="Stop scannen"
            >
              <X className="size-5" />
            </button>
          </div>
          <video ref={videoRef} className="aspect-[3/4] w-full bg-black object-cover sm:aspect-video" playsInline muted />
        </div>
      )}
    </div>
  );
}

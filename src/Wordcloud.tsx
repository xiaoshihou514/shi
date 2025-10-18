import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  forwardRef,
} from "react";
import cloud from "d3-cloud";
import { motion, AnimatePresence } from "framer-motion";
import { proSearchText } from "./PPX";

export type WordItem = { word: string; weight: number };

export interface WordcloudHandle {
  addKeyword: (word: string, weight?: number) => void;
  addKeywords: (words: Array<{ word: string; weight?: number }>) => void;
  clear: () => void;
  getKeywords: () => WordItem[];
}

export interface WordcloudProps {
  city?: string | null;
  maxWords?: number;
  className?: string;
  style?: React.CSSProperties;
}

type PlacedWord = {
  text: string;
  x: number;
  y: number;
  rotate: number;
  size: number;
  fill: string;
};

const defaultContainerStyle: React.CSSProperties = {
  width: "100%",
  height: 300,
  position: "relative",
  overflow: "hidden",
  background: "rgba(255,255,255,0.85)",
};

const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));

function useResizeObserver<T extends HTMLElement>(
  cb: (rect: DOMRectReadOnly) => void,
) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        cb(entry.contentRect);
      }
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [cb]);
  return ref;
}

function hashColor(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h << 5) - h + input.charCodeAt(i);
    h |= 0;
  }
  const hue = Math.abs(h) % 360;
  return `hsl(${hue} 65% 45%)`;
}

function sizeForWeight(weight: number, width: number, height: number): number {
  // Map [1,100] roughly to [10px, min(width,height)/6]
  const maxSize = Math.max(12, Math.min(width, height) / 6);
  const minSize = 10;
  return minSize + (maxSize - minSize) * clamp((weight - 1) / 99, 0, 1);
}

function normalizeKeywords(items: unknown, maxWords: number): WordItem[] {
  const arr = Array.isArray(items) ? items : [];
  const seen = new Set<string>();
  const out: WordItem[] = [];
  for (const it of arr) {
    const raw = (it ?? {}) as Record<string, unknown>;
    const w = typeof raw.word === "string" ? raw.word.trim() : "";
    const weight = typeof raw.weight === "number" ? raw.weight : 1;
    if (!w) continue;
    const key = w.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ word: w, weight: clamp(weight, 1, 100) });
    if (out.length >= maxWords) break;
  }
  return out;
}

function extractJsonArray(text: string): unknown[] {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    /* try bracket slice */
  }
  const first = text.indexOf("[");
  const last = text.lastIndexOf("]");
  if (first !== -1 && last !== -1 && last > first) {
    try {
      const sliced = JSON.parse(text.slice(first, last + 1));
      if (Array.isArray(sliced)) return sliced;
    } catch {
      /* ignore */
    }
  }
  return [];
}

const buildPrompt = (city: string): string =>
  [
    "Return JSON array only. No prose.",
    'Each item: { "word": string, "weight": number (1-100) }.',
    "Focus on historical, cultural, economic facts and distinctive local specialities of the city.",
    "Provide 40-60 salient, non-duplicative items.",
    `City: ${city}`,
  ].join("\n");

const LoadingSkeleton = () => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 16,
      zIndex: 2,
    }}
  >
    <div style={{ position: "relative", width: 92, height: 92 }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          border: "3px solid rgba(124, 92, 255, 0.35)",
          borderTopColor: "#a78bfa",
          borderRightColor: "#38bdf8",
          animation: "wcSpin 1.15s linear infinite",
          boxShadow: "0 0 18px rgba(124, 92, 255, 0.45)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 14,
          borderRadius: "50%",
          background:
            "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.55), rgba(124,92,255,0) 65%)",
          animation: "wcPulse 1.4s ease-in-out infinite",
        }}
      />
    </div>
    <div
      style={{
        fontSize: 12,
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        color: "#cbd5ff",
        opacity: 0.8,
      }}
    >
      Generating keywords…
    </div>
    <style>
      {`
        @keyframes wcSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes wcPulse {
          0%, 100% { transform: scale(0.92); opacity: 0.65; }
          50% { transform: scale(1); opacity: 1; }
        }
      `}
    </style>
  </div>
);

const ErrorView = ({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      display: "grid",
      placeItems: "center",
      color: "#c0392b",
    }}
  >
    <div>
      <div style={{ marginBottom: 8 }}>
        Failed to generate keywords: {message}
      </div>
      <button onClick={onRetry}>Retry</button>
    </div>
  </div>
);

const Wordcloud = forwardRef<WordcloudHandle, WordcloudProps>((props, ref) => {
  const { city = null, maxWords = 60, className = "", style } = props;

  const [keywords, setKeywords] = useState<WordItem[]>([]);
  const [placed, setPlaced] = useState<PlacedWord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rect, setRect] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  const containerRef = useResizeObserver<HTMLDivElement>((r) => {
    setRect({
      width: Math.max(0, Math.floor(r.width)),
      height: Math.max(0, Math.floor(r.height)),
    });
  });

  // Expose imperative API
  useImperativeHandle(
    ref,
    () => ({
      addKeyword: (word: string, weight = 1) => {
        setKeywords((prev) => {
          const exists = new Set(prev.map((w) => w.word.toLowerCase()));
          if (exists.has(word.toLowerCase())) return prev;
          const next = [...prev, { word, weight: clamp(weight, 1, 100) }];
          return next.slice(0, maxWords);
        });
      },
      addKeywords: (words: Array<{ word: string; weight?: number }>) => {
        setKeywords((prev) => {
          const exists = new Set(prev.map((w) => w.word.toLowerCase()));
          const additions: WordItem[] = [];
          for (const w of words) {
            const key = (w.word || "").toLowerCase();
            if (!key || exists.has(key)) continue;
            exists.add(key);
            additions.push({
              word: w.word,
              weight: clamp(w.weight ?? 1, 1, 100),
            });
            if (prev.length + additions.length >= maxWords) break;
          }
          return [...prev, ...additions].slice(0, maxWords);
        });
      },
      clear: () => {
        setKeywords([]);
        setPlaced([]);
      },
      getKeywords: () => [...keywords],
    }),
    [keywords, maxWords],
  );

  const runLayout = useCallback(
    (words: WordItem[], width: number, height: number) => {
      if (width <= 0 || height <= 0 || words.length === 0) {
        setPlaced([]);
        return;
      }
      const layoutWords: cloud.Word[] = words.map((w) => ({
        text: w.word,
        size: sizeForWeight(w.weight, width, height),
      }));

      const layout = cloud()
        .size([width, height])
        .words(layoutWords)
        .padding(2)
        .rotate(() => (Math.random() < 0.15 ? 90 : 0))
        .font("Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif")
        .fontSize((d: cloud.Word) => (typeof d.size === "number" ? d.size : 12))
        .on("end", (out: ReadonlyArray<cloud.Word>) => {
          const cx = Math.floor(width / 2);
          const cy = Math.floor(height / 2);
          const placedOut: PlacedWord[] = out.map((d) => {
            const text = String(d.text ?? "");
            const x = cx + (typeof d.x === "number" ? d.x : 0);
            const y = cy + (typeof d.y === "number" ? d.y : 0);
            const rotate = typeof d.rotate === "number" ? d.rotate : 0;
            const size = typeof d.size === "number" ? d.size : 12;
            return { text, x, y, rotate, size, fill: hashColor(text) };
          });
          setPlaced(placedOut);
        });

      layout.start();
    },
    [],
  );

  // Recompute layout on keywords or size changes
  useEffect(() => {
    runLayout(keywords, rect.width, rect.height);
  }, [keywords, rect.width, rect.height, runLayout]);

  // Fetch keywords from PPX when city changes
  useEffect(() => {
    let cancelled = false;
    if (!city) return;
    setLoading(true);
    setError(null);
    setKeywords([]);

    (async () => {
      try {
        const prompt = buildPrompt(city);
        const { text } = await proSearchText({ prompt, searchType: "pro" });
        const arr = extractJsonArray(text);
        const normalized = normalizeKeywords(arr, maxWords);
        if (cancelled) return;
        // Progressive insert in batches
        const batch = 8;
        const acc: WordItem[] = [];
        for (let i = 0; i < normalized.length; i += batch) {
          acc.push(...normalized.slice(i, i + batch));
          setKeywords([...acc]);
          await new Promise((r) => setTimeout(r, 180));
          if (cancelled) return;
        }
      } catch (e: unknown) {
        if (!cancelled)
          setError(
            (e as { message?: string })?.message ?? "Failed to fetch keywords",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [city, maxWords]);

  const onRetry = useCallback(() => {
    if (!city) return;
    // Trigger effect by setting same city after clearing state
    setKeywords([]);
    setPlaced([]);
    setError(null);
    setLoading(true);
    (async () => {
      try {
        const prompt = buildPrompt(city);
        const { text } = await proSearchText({ prompt, searchType: "pro" });
        const arr = extractJsonArray(text);
        const normalized = normalizeKeywords(arr, maxWords);
        const batch = 8;
        const acc: WordItem[] = [];
        for (let i = 0; i < normalized.length; i += batch) {
          acc.push(...normalized.slice(i, i + batch));
          setKeywords([...acc]);
          await new Promise((r) => setTimeout(r, 180));
        }
      } catch (e: unknown) {
        setError(
          (e as { message?: string })?.message ?? "Failed to fetch keywords",
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [city, maxWords]);

  const svg = useMemo(() => {
    const w = rect.width || 0;
    const h = rect.height || 0;
    return (
      <svg width={w} height={h} role="img" aria-label="Word cloud">
        <AnimatePresence initial={false}>
          {placed.map((word) => (
            <motion.g
              key={word.text}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 220, damping: 20 }}
              style={{ originX: 0.5, originY: 0.5 }}
            >
              <motion.text
                x={word.x}
                y={word.y}
                textAnchor="middle"
                transform={`rotate(${word.rotate}, ${word.x}, ${word.y})`}
                fontSize={word.size}
                fill={word.fill}
                style={{
                  cursor: "default",
                  userSelect: "none",
                  fontWeight: 700,
                }}
                whileHover={{ scale: 1.06 }}
              >
                {word.text}
              </motion.text>
            </motion.g>
          ))}
        </AnimatePresence>
      </svg>
    );
  }, [placed, rect.width, rect.height]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ ...defaultContainerStyle, ...style }}
    >
      {svg}
      {loading && keywords.length === 0 && <LoadingSkeleton />}
      {!loading && error && <ErrorView message={error} onRetry={onRetry} />}
    </div>
  );
});

Wordcloud.displayName = "Wordcloud";

export default Wordcloud;

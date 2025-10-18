import React, { useCallback, useEffect, useRef, useState } from "react";
import { useControl, useMap, Marker, Popup } from "@vis.gl/react-maplibre";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { TripsLayer } from "@deck.gl/geo-layers";
import { ScatterplotLayer, TextLayer, ArcLayer } from "@deck.gl/layers";
import type { Layer } from "@deck.gl/core";
import * as turf from "@turf/turf";
import { normalSearchText } from "./PPX";
import * as maplibregl from "maplibre-gl";

type Point = { lat: number; lon: number };

type JumpCity = {
  name: string;
  reason?: string;
  category?: "historical" | "cultural" | "facts" | string;
};

type JumpDatum = {
  name: string;
  category: string;
  target: [number, number];
  reason?: string;
};

type Props = {
  origin: Point | null;
  cityName: string | null;
  autoZoom?: boolean;
};

const CATEGORY_COLORS: Record<string, [number, number, number]> = {
  historical: [220, 53, 69], // red
  cultural: [13, 110, 253], // blue
  facts: [108, 117, 125], // gray
};

const LOADER_OUTER_STYLE: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(253, 224, 71, 0.85)",
  boxShadow: "0 0 18px rgba(253, 224, 71, 0.9)",
  animation: "jumplines-glow 1.6s ease-in-out infinite",
  pointerEvents: "none",
};

const LOADER_INNER_STYLE: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: "50%",
  border: "3px solid rgba(253, 224, 71, 0.45)",
  borderTopColor: "#fde047",
  animation: "jumplines-spin 0.9s linear infinite",
  boxSizing: "border-box",
};

const POPUP_CONTAINER_STYLE: React.CSSProperties = {
  maxWidth: 260,
  fontSize: 12,
  lineHeight: 1.5,
  background: "rgba(15, 23, 42, 0.92)",
  color: "#e2e8f0",
  borderRadius: 12,
  padding: "12px 14px",
  boxShadow: "0 12px 24px rgba(15, 23, 42, 0.45)",
  border: "1px solid rgba(148, 163, 184, 0.35)",
  backdropFilter: "blur(3px)",
};

const POPUP_TITLE_STYLE: React.CSSProperties = {
  fontWeight: 600,
  fontSize: 13,
  marginBottom: 6,
  color: "#f8fafc",
};

const POPUP_REASON_STYLE: React.CSSProperties = {
  color: "#cbd5f5",
};

export default function Jumplines(props: Props): React.ReactElement | null {
  const { origin, cityName, autoZoom = true } = props;
  const overlay = useControl(() => new MapboxOverlay({ interleaved: true }));
  const { current: mapRef } = useMap();

  const [jumps, setJumps] = useState<JumpDatum[]>([]);
  const [time, setTime] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const [autoZoomActive, setAutoZoomActive] = useState<boolean>(autoZoom);
  const [selected, setSelected] = useState<JumpDatum | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // removed translate overlay/JSON; unified findCityWithPPX provides English output

  const colorByCategory = useCallback(
    (c?: string): [number, number, number] => {
      const key = (c ?? "").toLowerCase();
      return CATEGORY_COLORS[key] ?? CATEGORY_COLORS.facts;
    },
    [],
  );

  // Animation clock (seconds 0..10 loop)
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      setTime(((t - start) / 1000) % 10);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const styleId = "jumplines-loading-animations";
    if (document.getElementById(styleId)) return;
    const styleEl = document.createElement("style");
    styleEl.id = styleId;
    styleEl.textContent = `
            @keyframes jumplines-glow {
                0% { box-shadow: 0 0 6px rgba(253, 224, 71, 0.45); transform: scale(0.95); }
                50% { box-shadow: 0 0 22px rgba(253, 224, 71, 1); transform: scale(1.08); }
                100% { box-shadow: 0 0 6px rgba(253, 224, 71, 0.45); transform: scale(0.95); }
            }
            @keyframes jumplines-spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
    document.head.appendChild(styleEl);
  }, []);

  const pathWithTimestamps = useCallback(
    (src: [number, number], dst: [number, number]) => {
      const gc = turf.greatCircle(turf.point(src), turf.point(dst), {
        npoints: 64,
      });
      const coords = (gc.geometry.coordinates as [number, number][]) ?? [];
      const path = coords;
      const timestamps = coords.map((_, i) => i * 150); // 150ms between points
      return { path, timestamps };
    },
    [],
  );

  const parseCityList = useCallback((text: string): JumpCity[] => {
    const coerce = (arr: unknown[]): JumpCity[] =>
      arr
        .map((x) => {
          const it = (x ?? {}) as Record<string, unknown>;
          const name = typeof it.name === "string" ? it.name : "";
          const reason = typeof it.reason === "string" ? it.reason : undefined;
          const category =
            typeof it.category === "string" ? it.category : undefined;
          return { name, reason, category };
        })
        .filter((x) => x.name);
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return coerce(parsed);
    } catch {
      /* no-op: translation not critical */
    }
    const first = text.indexOf("[");
    const last = text.lastIndexOf("]");
    if (first !== -1 && last !== -1 && last > first) {
      try {
        const parsed = JSON.parse(text.slice(first, last + 1));
        if (Array.isArray(parsed)) return coerce(parsed);
      } catch {
        /* no-op: fallback failed */
      }
    }
    return [];
  }, []);

  const geocodeCity = useCallback(
    async (
      name: string,
      signal?: AbortSignal,
    ): Promise<[number, number] | null> => {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(name)}`;
      const resp = await fetch(url, {
        headers: { Accept: "application/json" },
        signal,
      });
      if (!resp.ok) return null;
      const data = (await resp.json().catch(() => [])) as Array<{
        lat: string;
        lon: string;
      }>;
      const first = data[0];
      if (!first) return null;
      const lat = Number(first.lat);
      const lon = Number(first.lon);
      if (!isFinite(lat) || !isFinite(lon)) return null;
      return [lon, lat];
    },
    [],
  );

  // Fetch PPX-connected cities and geocode them
  useEffect(() => {
    abortRef.current?.abort();
    setJumps([]);
    setSelected(null);
    if (!origin || !cityName) {
      setIsLoading(false);
      abortRef.current = null;
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    let isActive = true;

    (async () => {
      try {
        const baseName = cityName;
        if (controller.signal.aborted) return;

        // Prompt for related cities
        const prompt = [
          `List 5 cities related to ${baseName} via history, culture, or notable facts.`,
          `Return a STRICT JSON array only. Each item must be: {"name": "City, Region, Country", "reason": "Brief 1-2 sentence connection to ${baseName}", "category": "historical"|"cultural"|"facts"}`,
        ].join("\n");
        const { text } = await normalSearchText({ prompt, searchType: "fast" });
        if (controller.signal.aborted) return;
        const list = parseCityList(text);
        if (list.length === 0) return;

        // Geocode destinations with limited concurrency
        const out: JumpDatum[] = [];
        const queue = list.slice(0, 10);
        const concurrency = 4;
        let idx = 0;
        await Promise.all(
          [...Array(concurrency)].map(async () => {
            while (!controller.signal.aborted) {
              const i = idx++;
              if (i >= queue.length) break;
              const item = queue[i]!;
              const pos = await geocodeCity(item.name, controller.signal);
              if (controller.signal.aborted) return;
              if (pos)
                out.push({
                  name: item.name,
                  category: item.category ?? "facts",
                  target: pos,
                  reason: item.reason,
                });
            }
          }),
        );

        if (!controller.signal.aborted) setJumps(out);
      } catch (e) {
        if (!controller.signal.aborted) {
          // Swallow errors; overlay will remain empty
          console.warn("Jumplines failed", e);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
          if (abortRef.current === controller) {
            abortRef.current = null;
          }
        }
      }
    })();

    return () => {
      isActive = false;
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      controller.abort();
    };
  }, [origin, cityName, parseCityList, geocodeCity]);

  // Build layers and apply overlay
  useEffect(() => {
    const layers: Layer[] = [];
    if (!origin || jumps.length === 0) {
      overlay.setProps({ layers });
      return () => overlay.setProps({ layers: [] });
    }

    // Static arcs with subtle transition
    layers.push(
      new ArcLayer<JumpDatum>({
        id: "jump-arcs",
        data: jumps,
        getSourcePosition: () => [origin.lon, origin.lat],
        getTargetPosition: (d: JumpDatum) => d.target,
        getWidth: 2.5,
        getSourceColor: (d: JumpDatum) => colorByCategory(d.category),
        getTargetColor: [255, 255, 255],
        pickable: true,
        autoHighlight: true,
        greatCircle: true,
        getHeight: 0,
        transitions: {
          getWidth: 600,
          getSourceColor: 600,
          getTargetColor: 600,
        },
      }),
    );

    // Animated highlight traveling along arcs using TripsLayer
    const tripsData = jumps.map((j) =>
      pathWithTimestamps([origin.lon, origin.lat], j.target),
    );
    layers.push(
      new TripsLayer({
        id: "jump-trips",
        data: tripsData,
        getPath: (d: { path: [number, number][] }) => d.path,
        getTimestamps: (d: { timestamps: number[] }) => d.timestamps,
        getColor: [255, 255, 255],
        widthMinPixels: 2,
        opacity: 0.9,
        currentTime: time * 1000, // ms
        trailLength: 800, // ms
      }),
    );

    // Pulsing origin marker
    layers.push(
      new ScatterplotLayer<{ position: [number, number] }>({
        id: "jump-origin",
        data: [{ position: [origin.lon, origin.lat] }],
        getPosition: (d: { position: [number, number] }) => d.position,
        getFillColor: [0, 200, 255, 200],
        radiusMinPixels: 3,
        radiusMaxPixels: 50,
        getRadius: () => 6 + 4 * (1 + Math.sin(time * 2)),
        updateTriggers: { getRadius: time },
      }),
    );

    // Pulsing target markers
    layers.push(
      new ScatterplotLayer<JumpDatum>({
        id: "jump-targets",
        data: jumps,
        getPosition: (d: JumpDatum) => d.target,
        getFillColor: (d: JumpDatum) =>
          [...colorByCategory(d.category), 220] as [
            number,
            number,
            number,
            number,
          ],
        radiusMinPixels: 2,
        radiusMaxPixels: 40,
        getRadius: () => 4 + 3 * (1 + Math.sin(time * 2.3)),
        updateTriggers: { getRadius: time },
      }),
    );

    // Labels
    layers.push(
      new TextLayer<JumpDatum>({
        id: "jump-labels",
        data: jumps,
        getPosition: (d: JumpDatum) => d.target,
        getText: (d: JumpDatum) => d.name,
        getSize: 14,
        getColor: [255, 255, 255],
        // place label above the marker to avoid overlap
        getTextAnchor: "middle",
        getAlignmentBaseline: "bottom",
        getPixelOffset: [0, -10],
      }),
    );

    const travelDurationForDistance = (distanceKm: number) => {
      const minDuration = 80;
      const maxDuration = 225;
      const base = Number.isFinite(distanceKm) ? distanceKm : 0;
      const normalized = Math.min(base / 20000, 1);
      return Math.round(minDuration + (maxDuration - minDuration) * normalized);
    };

    const fitAll = () => {
      if (!origin || !jumps.length) return;
      try {
        const bounds = new maplibregl.LngLatBounds(
          [origin.lon, origin.lat],
          [origin.lon, origin.lat],
        );
        let maxDistanceKm = 0;
        for (const j of jumps) {
          const target = j.target as [number, number];
          bounds.extend(target);
          const dist = turf.distance(
            turf.point([origin.lon, origin.lat]),
            turf.point(target),
            { units: "kilometers" },
          );
          if (isFinite(dist)) {
            maxDistanceKm = Math.max(maxDistanceKm, dist);
          }
        }
        const duration = travelDurationForDistance(maxDistanceKm);
        mapRef?.getMap()?.fitBounds(bounds, { padding: 80, duration });
      } catch {
        /* no-op fit */
      }
    };

    // Hover to fly-to target, else refit
    layers.push(
      new ArcLayer<JumpDatum>({
        id: "jump-arcs-hover",
        data: jumps,
        getSourcePosition: () => [origin.lon, origin.lat],
        getTargetPosition: (d: JumpDatum) => d.target,
        getWidth: 0, // invisible interaction layer
        greatCircle: true,
        getHeight: 0,
        pickable: true,
        onHover: (info: { object?: JumpDatum | null }) => {
          const j = info?.object ?? undefined;
          if (!autoZoomActive) return;
          if (j) {
            try {
              const distanceKm = turf.distance(
                turf.point([origin.lon, origin.lat]),
                turf.point(j.target as [number, number]),
                { units: "kilometers" },
              );
              const duration = travelDurationForDistance(distanceKm);
              mapRef?.getMap()?.flyTo({
                center: j.target as [number, number],
                zoom: 5.5,
                duration,
              });
            } catch {
              /* no-op */
            }
          } else {
            fitAll();
          }
        },
      }),
    );

    overlay.setProps({ layers });

    if (autoZoom && autoZoomActive && origin && jumps.length) {
      fitAll();
    }

    return () => overlay.setProps({ layers: [] });
  }, [
    jumps,
    origin,
    time,
    overlay,
    mapRef,
    autoZoom,
    autoZoomActive,
    colorByCategory,
    pathWithTimestamps,
  ]);

  // Stop auto-zooming once the user manually zooms the map
  useEffect(() => {
    const map = mapRef?.getMap();
    if (!map) return;
    const onZoomStart = (e: unknown) => {
      const evt = e as { originalEvent?: unknown };
      if (evt && evt.originalEvent) {
        setAutoZoomActive(false);
      }
    };
    map.on("zoomstart", onZoomStart);
    return () => {
      map.off("zoomstart", onZoomStart);
    };
  }, [mapRef]);

  // Render destination markers; origin marker is owned by Map.tsx
  return (
    <>
      {isLoading && origin && (
        <Marker
          key="jumplines-loading"
          longitude={origin.lon}
          latitude={origin.lat}
          anchor="center"
        >
          <div
            style={LOADER_OUTER_STYLE}
            role="status"
            aria-live="polite"
            aria-label="Finding connected cities"
          >
            <div style={LOADER_INNER_STYLE} />
          </div>
        </Marker>
      )}
      {jumps.map((j) => (
        <Marker
          key={`${j.name}-${j.target[0]}-${j.target[1]}`}
          longitude={j.target[0]}
          latitude={j.target[1]}
          anchor="center"
        >
          <div
            style={{
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: "#f97316",
              border: "2px solid white",
              boxShadow: "0 0 12px rgba(249, 115, 22, 0.8)",
            }}
            onClick={(ev) => {
              ev.stopPropagation();
              setSelected(j);
            }}
            title={j.name}
          />
        </Marker>
      ))}
      {selected && (
        <Popup
          longitude={selected.target[0]}
          latitude={selected.target[1]}
          closeButton
          onClose={() => setSelected(null)}
          anchor="bottom"
        >
          <div
            style={POPUP_CONTAINER_STYLE}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={POPUP_TITLE_STYLE}>{selected.name}</div>
            <div style={POPUP_REASON_STYLE}>
              {selected.reason ?? "Related via historical or cultural ties."}
            </div>
          </div>
        </Popup>
      )}
    </>
  );
}

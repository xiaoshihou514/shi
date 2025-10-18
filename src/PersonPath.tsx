import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Map as MLMap, Popup, Marker} from '@vis.gl/react-maplibre';
import type { Map as MaplibreMap } from 'maplibre-gl';
import {MapboxOverlay} from '@deck.gl/mapbox';
import {PathLayer, ScatterplotLayer, TextLayer} from '@deck.gl/layers';
import type {Layer} from '@deck.gl/core';
import mapStyleRaw from './assets/map_style.json?raw';
import type { StyleSpecification } from 'maplibre-gl';
import {fetchPersonLifePath, type LifeHop} from './PPX';
import './SearchBar.css';
import './Desc.css';

type GeocodedHop = LifeHop & { lat: number; lon: number };

const MAP_STYLE = JSON.parse(mapStyleRaw) as StyleSpecification;

const HOP_DURATION_MS = 1500; // 1.5s per hop

const POPUP_CONTAINER_STYLE: React.CSSProperties = {
    maxWidth: 260,
    fontSize: 12,
    lineHeight: 1.5,
    background: 'rgba(15, 23, 42, 0.92)',
    color: '#e2e8f0',
    borderRadius: 12,
    padding: '12px 14px',
    boxShadow: '0 12px 24px rgba(15, 23, 42, 0.45)',
    border: '1px solid rgba(148, 163, 184, 0.35)',
    backdropFilter: 'blur(3px)'
};

const POPUP_TITLE_STYLE: React.CSSProperties = {
    fontWeight: 600,
    fontSize: 13,
    marginBottom: 6,
    color: '#f8fafc'
};

const POPUP_TEXT_STYLE: React.CSSProperties = {
    color: '#cbd5f5'
};

export default function PersonPath(): React.ReactElement {
    const mapRef = useRef<MaplibreMap | null>(null);
    const overlayRef = useRef<MapboxOverlay | null>(null);
    const rafRef = useRef<number | null>(null);
    const [person, setPerson] = useState<string>('');
    const [busy, setBusy] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [hops, setHops] = useState<GeocodedHop[]>([]);
    const [followCamera, setFollowCamera] = useState<boolean>(true);
    const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

    const [segIndex, setSegIndex] = useState<number>(0);
    const segStartTimeRef = useRef<number>(0);

    const geocodeCache = useRef<Map<string, {lat: number; lon: number}>>(new Map());

    const resetAnimation = useCallback(() => {
        setSegIndex(0);
        segStartTimeRef.current = performance.now();
    }, []);

    const geocodeCity = useCallback(async (name: string, signal?: AbortSignal): Promise<{lat: number; lon: number} | null> => {
        const key = name.trim().toLowerCase();
        const cached = geocodeCache.current.get(key);
        if (cached) return cached;
        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(name)}`;
        const resp = await fetch(url, { headers: { 'Accept': 'application/json' }, signal });
        if (!resp.ok) return null;
        const data = await resp.json().catch(() => []) as Array<{lat: string; lon: string}>;
        const first = data[0];
        if (!first) return null;
        const lat = Number(first.lat);
        const lon = Number(first.lon);
        if (!isFinite(lat) || !isFinite(lon)) return null;
        const val = { lat, lon };
        geocodeCache.current.set(key, val);
        return val;
    }, []);

    const runSearch = useCallback(async (name: string) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        setBusy(true);
        setError(null);
        setSelectedIdx(null);
        try {
            const ctrl = new AbortController();
            const raw = await fetchPersonLifePath(trimmed, ctrl.signal);
            // If no usable hops returned, surface a friendly error
            if (!raw || raw.length <= 2) {
                setError('The person is not very famous, try another one!');
                setHops([]);
                return;
            }
            // Geocode sequentially to keep it simple and cache-friendly
            const out: GeocodedHop[] = [];
            for (const hop of raw) {
                const pos = await geocodeCity(hop.city, ctrl.signal);
                if (!pos) continue;
                out.push({...hop, lat: pos.lat, lon: pos.lon});
            }
            if (out.length < 2) {
                setError('The person is not very famous, try another one!');
                setHops([]);
                return;
            }
            setHops(out);
            resetAnimation();
            setFollowCamera(true);
            // Fly to first city
            try { mapRef.current?.flyTo({ center: [out[0].lon, out[0].lat], zoom: 4.8, duration: 1200 }); } catch { /* no-op */ }
        } catch {
            // Unify failure message to match product expectations
            setError('The person is not very famous, try another one!');
        } finally {
            setBusy(false);
        }
    }, [geocodeCity, resetAnimation]);

    const coords = useMemo(() => hops.map(h => [h.lon, h.lat] as [number, number]), [hops]);

    const currentPosition = useMemo((): [number, number] | null => {
        if (coords.length === 0) return null;
        const i = Math.min(segIndex, Math.max(0, coords.length - 2));
        const start = coords[i];
        const end = coords[i + 1] ?? coords[i];
        const elapsed = performance.now() - segStartTimeRef.current;
        const t = Math.max(0, Math.min(1, elapsed / HOP_DURATION_MS));
        const lon = start[0] + (end[0] - start[0]) * t;
        const lat = start[1] + (end[1] - start[1]) * t;
        return [lon, lat];
    }, [coords, segIndex]);

    const buildLayers = useCallback((): Layer[] => {
        const layers: Layer[] = [];
        if (coords.length >= 2) {
            const i = Math.min(segIndex, Math.max(0, coords.length - 2));
            const start = coords[i];
            const end = coords[i + 1] ?? coords[i];
            const now = performance.now();
            const t = Math.max(0, Math.min(1, (now - segStartTimeRef.current) / HOP_DURATION_MS));
            const curLon = start[0] + (end[0] - start[0]) * t;
            const curLat = start[1] + (end[1] - start[1]) * t;

            // Completed path up to current segment start
            if (i >= 1) {
                layers.push(new PathLayer<{ path: [number, number][] }>({
                    id: 'completed-path',
                    data: [{ path: coords.slice(0, i + 1) }],
                    getPath: (d: { path: [number, number][] }) => d.path,
                    getColor: [124, 92, 255, 200],
                    widthUnits: 'pixels',
                    getWidth: 4,
                    jointRounded: true,
                    capRounded: true,
                }));
            }

            // Current in-progress segment
            layers.push(new PathLayer<{ path: [number, number][] }>({
                id: 'current-segment',
                data: [{ path: [start, [curLon, curLat] as [number, number]] }],
                getPath: (d: { path: [number, number][] }) => d.path,
                getColor: [249, 115, 22, 220],
                widthUnits: 'pixels',
                getWidth: 5,
                jointRounded: true,
                capRounded: true,
            }));

            // Moving marker
            layers.push(new ScatterplotLayer<{ position: [number, number] }>({
                id: 'moving-marker',
                data: [{ position: [curLon, curLat] as [number, number] }],
                getPosition: (d: { position: [number, number] }) => d.position,
                getFillColor: [249, 115, 22, 255],
                radiusUnits: 'pixels',
                getRadius: 8,
            }));
        }

        if (hops.length >= 1) {
            layers.push(new ScatterplotLayer<{ idx: number; position: [number, number] }>({
                id: 'cities',
                data: hops.map((h, idx) => ({ idx, position: [h.lon, h.lat] as [number, number] })),
                getPosition: (d: { position: [number, number] }) => d.position,
                getFillColor: [52, 152, 219, 200],
                radiusUnits: 'pixels',
                getRadius: 5,
                pickable: true,
                autoHighlight: true,
            }));

            // City labels like in Jumplines, highlight the current target city
            const currentTargetIdx = Math.min(segIndex + 1, Math.max(0, hops.length - 1));
            layers.push(new TextLayer<{ idx: number; position: [number, number]; name: string }>({
                id: 'city-labels',
                data: hops.map((h, idx) => ({ idx, position: [h.lon, h.lat] as [number, number], name: h.city })),
                getPosition: (d) => d.position,
                getText: (d) => d.name,
                getSize: 14,
                getColor: (d) => (d.idx === currentTargetIdx ? [255, 255, 255] : [200, 200, 200]),
                getTextAnchor: 'middle',
                getAlignmentBaseline: 'bottom',
                getPixelOffset: [0, -10],
            }));
        }

        return layers;
    }, [coords, hops, segIndex]);

    // Animation loop
    useEffect(() => {
        if (!overlayRef.current) return;
        if (coords.length < 2) return;
        let stopped = false;
        const tick = () => {
            if (stopped) return;
            // Advance segment if needed
            const elapsed = performance.now() - segStartTimeRef.current;
            if (elapsed >= HOP_DURATION_MS) {
                const next = segIndex + 1;
                if (next <= coords.length - 2) {
                    setSegIndex(next);
                    segStartTimeRef.current = performance.now();
                    // Snap camera to start of the next segment to avoid any boundary lag
                    if (followCamera) {
                        try {
                            const startOfNext = coords[next];
                            if (startOfNext) {
                                const z = mapRef.current?.getZoom?.() ?? 4.8;
                                mapRef.current?.jumpTo({ center: startOfNext as [number, number], zoom: z });
                            }
                        } catch { /* no-op */ }
                    }
                }
            }

            const layers = buildLayers();
            overlayRef.current?.setProps({ layers, pickingRadius: 8 });

            // Camera follow
            if (followCamera) {
                const pos = currentPosition;
                if (pos) {
                    try {
                        const z = mapRef.current?.getZoom?.() ?? 4.8;
                        mapRef.current?.jumpTo({ center: pos as [number, number], zoom: z });
                    } catch { /* no-op */ }
                }
            }

            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => {
            stopped = true;
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        };
    }, [coords, segIndex, followCamera, buildLayers, currentPosition]);

    // Initialize deck overlay on map load
    const onMapLoad = useCallback((e: unknown) => {
        try {
            const map = (e as { target?: MaplibreMap }).target ?? null;
            if (!map) return;
            mapRef.current = map;
            overlayRef.current = new MapboxOverlay({ interleaved: true, layers: [] });
            map.addControl(overlayRef.current);
        } catch { /* no-op */ }
    }, []);

    const selectedHop = useMemo(() => {
        if (selectedIdx == null) return null;
        return hops[selectedIdx] ?? null;
    }, [selectedIdx, hops]);

    return (
        <div style={{position: 'relative', width: '100%', height: '100dvh'}}>
            <MLMap
                initialViewState={{ longitude: 10, latitude: 50, zoom: 3.5 }}
                style={{ width: '100%', height: '100%' }}
                mapStyle={MAP_STYLE}
                onLoad={onMapLoad}
                onDragStart={(e: { originalEvent?: unknown }) => {
                    if (e && e.originalEvent) setFollowCamera(false);
                }}
                onZoomStart={(e: { originalEvent?: unknown }) => {
                    if (e && e.originalEvent) setFollowCamera(false);
                }}
                onRotateStart={(e: { originalEvent?: unknown }) => {
                    if (e && e.originalEvent) setFollowCamera(false);
                }}
            >
                {/* DOM markers for reliable click picking */}
                {hops.map((h, idx) => (
                    <Marker key={`${h.city}-${idx}`} longitude={h.lon} latitude={h.lat} anchor="center">
                        <div
                            style={{
                                width: 16,
                                height: 16,
                                borderRadius: '50%',
                                background: '#f97316',
                                border: '2px solid white',
                                boxShadow: '0 0 12px rgba(249, 115, 22, 0.8)',
                                cursor: 'pointer'
                            }}
                            onClick={(ev) => { ev.stopPropagation(); setSelectedIdx(idx); }}
                            title={h.city}
                        />
                    </Marker>
                ))}
                {selectedHop && (
                    <Popup
                        longitude={selectedHop.lon}
                        latitude={selectedHop.lat}
                        closeButton
                        onClose={() => setSelectedIdx(null)}
                        anchor="bottom"
                    >
                        <div style={POPUP_CONTAINER_STYLE} onClick={(e) => e.stopPropagation()}>
                            <div style={POPUP_TITLE_STYLE}>{selectedHop.city}</div>
                            {(selectedHop.startDate || selectedHop.endDate) && (
                                <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>
                                    {(selectedHop.startDate ?? 'Unknown')} – {(selectedHop.endDate ?? 'Unknown')}
                                </div>
                            )}
                            {selectedHop.description && (
                                <div style={POPUP_TEXT_STYLE}>{selectedHop.description}</div>
                            )}
                        </div>
                    </Popup>
                )}
            </MLMap>

            {/* Person input */}
            <div style={{position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 10}}>
                <form onSubmit={(e) => { e.preventDefault(); runSearch(person); }} className="searchbar-form">
                    <div className="searchbar-control-group">
                        <input
                            className="searchbar-input"
                            type="text"
                            placeholder="/ Search"
                            value={person}
                            onChange={(e) => setPerson(e.target.value)}
                            disabled={busy}
                        />
                        <button
                            type="submit"
                            className="searchbar-btn searchbar-btn--primary searchbar-btn--icon"
                            disabled={busy}
                            aria-label="Search"
                            title="Search"
                        >
                            {busy
                                ? <span className="searchbar-spinner" />
                                : (
                                    <svg viewBox="0 0 24 24" aria-hidden="true" className="searchbar-icon">
                                        <path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.71.71l.27.28v.79L20 20.49 21.49 19l-5.99-5zM10 14a4 4 0 1 1 0-8 4 4 0 0 1 0 8z" />
                                    </svg>
                                  )}
                            <span className="visually-hidden">Search</span>
                        </button>
                    </div>
                </form>
                {error && <span className="searchbar-error">{error}</span>}
            </div>

            {/* Resume follow */}
            {!followCamera && hops.length > 0 && (
                <button
                    type="button"
                    onClick={() => setFollowCamera(true)}
                    style={{ position: 'absolute', top: 64, left: '50%', transform: 'translateX(-50%)', zIndex: 10, padding: '6px 12px', borderRadius: 999, border: '1px solid rgba(124, 92, 255, 0.35)', background: 'rgba(12,18,38,0.85)', color: '#f3f5ff', fontSize: '0.75rem', letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}
                >
                    Resume follow
                </button>
            )}

            {/* Empty-state guidance (similar to Desc.tsx) */}
            {hops.length === 0 && (
                <div className="desc-overlay">
                    <div className="desc-panel desc-panel--empty">
                        <div className="desc-empty" aria-live="polite">
                            <div className="desc-empty__icon" role="img" aria-label="Person mode hint">🧭</div>
                            <p className="desc-empty__title">Ready to explore?</p>
                            <p className="desc-empty__text">Type a famous name above, trace their city-to-city life path.</p>
                        </div>
                    </div>
                </div>
            )}

            {/* City popup moved inside MLMap to access map context */}
        </div>
    );
}


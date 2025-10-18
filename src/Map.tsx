// A beautiful, clickable map, propogates user clicks as coord upwards
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Map as MLMap, Marker} from '@vis.gl/react-maplibre';
import type {MapLayerMouseEvent} from 'maplibre-gl';
import type { StyleSpecification } from 'maplibre-gl';
import type { TimelineEvent, TimelineHandle } from './Timeline';
import Desc from './Desc';
import TimelinePanel from './TimelinePanel';
import {proSearchText, findCityWithPPX} from './PPX';
import mapStyleRaw from './assets/map_style.json?raw';
import Jumplines from './Jumplines';

type ClickedCoord = {
    lat: number;
    lon: number;
};

// AAPTxy8BH1VEsoebNVZXo8HurFA-92mMnE3RJ1ZLRoF-uatVuLwCm5wx_yU_DxGrkq_qCiJXVRT-jtuZmY0_03jSRUz9Bgtq8pVwV6LTtplhae7cojeWzZm67Mgp3AhNZpB-SKjWKMGHP6rD79kyutlG6CUdlpU1k8NnETlRBKd9KVf5PABmv25F1bS-0qPSNSMQOlPc2qo_Edtdsn-7CK8QYK97dmTm6yxEX1DJfvjcjII.AT1_8nTjQFQT
const MAP_STYLE = JSON.parse(mapStyleRaw) as StyleSpecification;

// panel UI moved to Desc component


export default function ClickableMap(): React.ReactElement {
    const [clicked, setClicked] = useState<ClickedCoord | null>(null);
    const [cityName, setCityName] = useState<string | null>(null);
    const [cityDetailedName, setCityDetailedName] = useState<string | null>(null);
    const [showDesc, setShowDesc] = useState<boolean>(true);
    const [showTimeline, setShowTimeline] = useState<boolean>(true);
    const abortRef = useRef<AbortController | null>(null);
    const timelineRef = useRef<TimelineHandle | null>(null);
    const [ppxLoading, setPpxLoading] = useState<boolean>(false);
    const [ppxError, setPpxError] = useState<string | null>(null);
    const [jumplineMode, setJumplineMode] = useState<boolean>(false);
    const suppressClickUntilRef = useRef<number>(0);
    // removed translate overlay/JSON; unified findCityWithPPX provides English output


    const reverseGeocode = useCallback(async (lat: number, lon: number) => {
        abortRef.current?.abort();
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        setCityName(null);
        setCityDetailedName(null);
        try {
            const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=en`;
            const resp = await fetch(url, {
                signal: ctrl.signal,
                headers: {'Accept': 'application/json'}
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            // TODO: resp can be { "error": "<error msg>" }
            const data = await resp.json();
            const addr: Record<string, string> | undefined = data?.address;
            const displayName = typeof data?.display_name === 'string' ? data.display_name : null;
            const ppxCity = await findCityWithPPX({ displayName, address: addr ?? null });
            const cityNameVal = ppxCity?.city ?? null;
            const cityDetailedNameVal = ppxCity?.detailedName ?? null;
            if (!ctrl.signal.aborted) {
                setCityName(cityNameVal);
                setCityDetailedName(cityDetailedNameVal);
            }
        } catch (err: unknown) {
            const anyErr = err as { name?: string; message?: string };
            if (anyErr?.name !== 'AbortError') {
                console.error(anyErr.message);
            }
        }
    }, []);

    const exitToIdle = useCallback(() => {
        setJumplineMode(false);
        setClicked(null);
        setCityName(null);
        setCityDetailedName(null);
        setShowDesc(false);
        setShowTimeline(false);
        timelineRef.current?.clearEvents();
        setPpxLoading(false);
        setPpxError(null);
        abortRef.current?.abort();
    }, []);

    const onMapClick = useCallback((e: MapLayerMouseEvent) => {
        if (jumplineMode) { exitToIdle(); return; }
        if (Date.now() < suppressClickUntilRef.current) return;
        const {lng, lat} = e.lngLat ?? {};
        if (typeof lng === 'number' && typeof lat === 'number') {
            setClicked({lat, lon: lng});
            setShowDesc(true);
            setShowTimeline(true);
            reverseGeocode(lat, lng);
        }
    }, [reverseGeocode, jumplineMode, exitToIdle]);

    const onMapDblClick = useCallback((e: MapLayerMouseEvent) => {
        const {lng, lat} = e.lngLat ?? {};
        if (typeof lng !== 'number' || typeof lat !== 'number') return;
        suppressClickUntilRef.current = Date.now() + 350;
        setJumplineMode(true);
        setShowDesc(false);
        setShowTimeline(false);
        const coord = {lat, lon: lng};
        setClicked(coord);
        // still resolve city name so Jumplines can query connections
        reverseGeocode(lat, lng);
    }, [reverseGeocode]);

    const handleCitySelection = useCallback((lat: number, lon: number) => {
        setJumplineMode(false);
        setClicked({lat, lon});
        setShowDesc(true);
        setShowTimeline(true);
        reverseGeocode(lat, lon);
    }, [reverseGeocode]);

    const buildPrompt = useCallback((cityName: string, cityDetailedName: string) => {
        return [
            'You are a concise historian. List ~8 chronological key historical events that are directly tied to the City Name.',
            'Use the City Detailed Name only to restrict the geographic region to make a concise search.',
            'Return JSON array only. Fields must be: id (string), date (YYYY-MM-DD or best-known date), title, description, icon (emoji), color (hex).',
            `City Name: ${cityName}`,
            `City Detailed Name: ${cityDetailedName}`,
        ].join('\n');
    }, []);

    const tryParseEvents = useCallback((text: string): TimelineEvent[] => {
        const toIso = (d: unknown): string => {
            if (typeof d !== 'string' || !d.trim()) return new Date('1900-01-01').toISOString();
            const dt = new Date(d);
            if (isNaN(dt.getTime())) return new Date('1900-01-01').toISOString();
            return dt.toISOString();
        };

        const coerce = (arr: unknown[]): TimelineEvent[] => {
            return arr.map((raw, idx) => {
                const it = (raw ?? {}) as Record<string, unknown>;
                const idVal = it['id'];
                const dateVal = it['date'];
                const titleVal = it['title'];
                const descVal = it['description'];
                const iconVal = it['icon'];
                const colorVal = it['color'];
                return {
                    id: typeof idVal === 'string' ? idVal : String(idx + 1),
                    date: toIso(dateVal),
                    title: typeof titleVal === 'string' ? titleVal : 'Untitled',
                    description: typeof descVal === 'string' ? descVal : '',
                    icon: typeof iconVal === 'string' ? iconVal : '📅',
                    color: typeof colorVal === 'string' ? colorVal : '#3498db',
                };
            });
        };

        try {
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) return coerce(parsed);
        } catch { /* try extraction below */
        }

        const first = text.indexOf('[');
        const last = text.lastIndexOf(']');
        if (first !== -1 && last !== -1 && last > first) {
            const slice = text.slice(first, last + 1);
            try {
                const parsed = JSON.parse(slice);
                if (Array.isArray(parsed)) return coerce(parsed);
            } catch { /* fallthrough */
            }
        }
        return [];
    }, []);

    useEffect(() => {
        if (jumplineMode) {
            timelineRef.current?.clearEvents();
            setPpxLoading(false);
            setPpxError(null);
            return;
        }

        if (!cityName || !cityDetailedName) {
            timelineRef.current?.clearEvents();
            setPpxLoading(false);
            setPpxError(null);
            return;
        }

        setPpxLoading(true);
        setPpxError(null);
        timelineRef.current?.clearEvents();
        setShowTimeline(true);

        (async () => {
            try {
                const prompt = buildPrompt(cityName, cityDetailedName);
                const {text} = await proSearchText({prompt, searchType: 'pro'});
                const events = tryParseEvents(text);
                if (events.length === 0) {
                    setPpxError('No events parsed from model response');
                    return;
                }
                // Add progressively
                for (let i = 0; i < events.length; i++) {
                    timelineRef.current?.addEvent(events[i]);
                    await new Promise(r => setTimeout(r, 250));
                }
            } catch (err: unknown) {
                const anyErr = err as { message?: string };
                setPpxError(anyErr?.message ?? 'Failed to generate timeline');
            } finally {
                setPpxLoading(false);
            }
        })();
    }, [cityName, cityDetailedName, buildPrompt, tryParseEvents, jumplineMode]);

    useEffect(() => {
        const onKey = (ev: KeyboardEvent) => {
            if (ev.key === 'Escape' && jumplineMode) {
                exitToIdle();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [jumplineMode, exitToIdle]);

    return (
        <div style={{position: 'relative', width: '100%', height: '100dvh'}}>
            {showDesc && (
                <Desc
                    clicked={clicked}
                    cityName={cityName}
                    cityDetailedName={cityDetailedName}
                    ppxLoading={ppxLoading}
                    ppxError={ppxError}
                    onClose={() => setShowDesc(false)}
                />
            )}
            {showTimeline && (
                <TimelinePanel
                    clicked={clicked}
                    cityName={cityName}
                    cityDetailedName={cityDetailedName}
                    ppxLoading={ppxLoading}
                    ppxError={ppxError}
                    timelineRef={timelineRef}
                    onClose={() => setShowTimeline(false)}
                />
            )}

            {!showDesc && (
                <button
                    type="button"
                    style={{
                        position: 'absolute',
                        top: 16,
                        left: 16,
                        padding: '6px 12px',
                        borderRadius: 999,
                        border: '1px solid rgba(124, 92, 255, 0.35)',
                        background: 'rgba(12, 18, 38, 0.85)',
                        color: '#f3f5ff',
                        fontSize: '0.75rem',
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                        pointerEvents: 'auto',
                        zIndex: 120
                    }}
                    onClick={() => setShowDesc(true)}
                >
                    Overview
                </button>
            )}

            {!showTimeline && (
                <button
                    type="button"
                    style={{
                        position: 'absolute',
                        top: 16,
                        right: 16,
                        padding: '6px 12px',
                        borderRadius: 999,
                        border: '1px solid rgba(124, 92, 255, 0.35)',
                        background: 'rgba(12, 18, 38, 0.85)',
                        color: '#f3f5ff',
                        fontSize: '0.75rem',
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                        pointerEvents: 'auto',
                        zIndex: 120
                    }}
                    onClick={() => setShowTimeline(true)}
                >
                    Insights
                </button>
            )}

            <MLMap
                initialViewState={{
                    longitude: 10,
                    latitude: 50,
                    zoom: 3.5
                  }}
                  style={{ width: '100%', height: '100%' }}
                  mapStyle={MAP_STYLE}
                onClick={onMapClick}
                onDblClick={onMapDblClick}
            >
                {jumplineMode && clicked && (
                    <Jumplines
                        origin={clicked}
                        cityName={cityName}
                        autoZoom
                    />
                )}
                {clicked && (
                    <Marker longitude={clicked.lon} latitude={clicked.lat} anchor="center">
                        <div
                            style={{
                                width: 16,
                                height: 16,
                                borderRadius: '50%',
                                background: '#f97316',
                                border: '2px solid white',
                                boxShadow: '0 0 12px rgba(249, 115, 22, 0.8)'
                            }}
                            onClick={(ev) => {
                                ev.stopPropagation();
                                if (jumplineMode && clicked) {
                                    handleCitySelection(clicked.lat, clicked.lon);
                                }
                            }}
                        />
                    </Marker>
                )}
            </MLMap>
            {/* translateJson overlay removed: unified findCityWithPPX ensures English output */}
        </div>
    );
}

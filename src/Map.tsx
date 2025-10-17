// A beautiful, clickable map, propogates user clicks as coord upwards
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Map as MLMap, Marker, NavigationControl} from '@vis.gl/react-maplibre';
import type {MapLayerMouseEvent} from 'maplibre-gl';
import Timeline, {type TimelineEvent, type TimelineHandle} from './Timeline';
import {proSearchText} from './PPX';

type ClickedCoord = {
    lat: number;
    lon: number;
};

// AAPTxy8BH1VEsoebNVZXo8HurFA-92mMnE3RJ1ZLRoF-uatVuLwCm5wx_yU_DxGrkq_qCiJXVRT-jtuZmY0_03jSRUz9Bgtq8pVwV6LTtplhae7cojeWzZm67Mgp3AhNZpB-SKjWKMGHP6rD79kyutlG6CUdlpU1k8NnETlRBKd9KVf5PABmv25F1bS-0qPSNSMQOlPc2qo_Edtdsn-7CK8QYK97dmTm6yxEX1DJfvjcjII.AT1_8nTjQFQT
const MAP_STYLE = JSON.parse(await (await fetch("./src/assets/map_style.json")).text());

const formatNumber = (n: number): string => n.toFixed(6);

const panelStyle: React.CSSProperties = {
    position: 'absolute',
    top: 12,
    left: 12,
    zIndex: 1,
    background: 'rgba(255,255,255,0.9)',
    padding: '10px 12px',
    borderRadius: 8,
    boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
    maxWidth: 320,
    fontSize: 14,
    lineHeight: 1.35
};

export default function ClickableMap(): React.ReactElement {
    const [clicked, setClicked] = useState<ClickedCoord | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [address, setAddress] = useState<string | null>(null);
    const [city, setCity] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const timelineRef = useRef<TimelineHandle>(null);
    const [ppxLoading, setPpxLoading] = useState<boolean>(false);
    const [ppxError, setPpxError] = useState<string | null>(null);


    const reverseGeocode = useCallback(async (lat: number, lon: number) => {
        abortRef.current?.abort();
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        setLoading(true);
        setError(null);
        setAddress(null);
        setCity(null);
        try {
            const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=en`;
            const resp = await fetch(url, {
                signal: ctrl.signal,
                headers: {'Accept': 'application/json'}
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            const display: string | undefined = data?.display_name;
            const addr: Record<string, string> | undefined = data?.address;
            const detectedCity = addr?.city || addr?.town || addr?.village || addr?.county || addr?.state || null;
            setAddress(display ?? null);
            setCity(detectedCity);
        } catch (err: unknown) {
            const anyErr = err as { name?: string; message?: string };
            if (anyErr?.name !== 'AbortError') {
                setError(anyErr?.message ?? 'Reverse geocoding failed');
            }
        } finally {
            setLoading(false);
        }
    }, []);

    const onMapClick = useCallback((e: MapLayerMouseEvent) => {
        const {lng, lat} = e.lngLat ?? {};
        if (typeof lng === 'number' && typeof lat === 'number') {
            setClicked({lat, lon: lng});
            reverseGeocode(lat, lng);
        }
    }, [reverseGeocode]);

    const buildPrompt = useCallback((cityName: string) => {
        return [
            'You are a concise historian. For the city below, list ~8 chronological key historical events.',
            'Return JSON array only. Fields must be: id (string), date (YYYY-MM-DD or best-known date), title, description, icon (emoji), color (hex).',
            `City: ${cityName}`,
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
        if (!city) return;
        setPpxLoading(true);
        setPpxError(null);
        // Clear existing events
        timelineRef.current?.clearEvents();

        (async () => {
            try {
                const prompt = buildPrompt(city);
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
    }, [city, buildPrompt, tryParseEvents]);

    return (
        <div style={{position: 'relative', width: '100%', height: '100vh'}}>
            <div style={panelStyle}>
                <div style={{fontWeight: 600, marginBottom: 6}}>Selection</div>
                {clicked ? (
                    <div>
                        <div>Lat: {formatNumber(clicked.lat)}</div>
                        <div>Lon: {formatNumber(clicked.lon)}</div>
                        {loading && <div style={{marginTop: 6}}>Resolving address…</div>}
                        {!loading && error && (
                            <div style={{marginTop: 6, color: '#c0392b'}}>Error: {error}</div>
                        )}
                        {!loading && !error && address && (
                            <div style={{marginTop: 6}}>
                                <div style={{fontWeight: 600}}>Address</div>
                                <div>{address}</div>
                                <div style={{marginTop: 4}}>City: {city ?? 'N/A'}</div>
                            </div>
                        )}
                        {city && (
                            <div style={{marginTop: 10}}>
                                <div style={{fontWeight: 600, marginBottom: 6}}>Timeline for {city}</div>
                                {ppxLoading && <div>Generating timeline…</div>}
                                {!ppxLoading && ppxError && (
                                    <div style={{color: '#c0392b'}}>Error: {ppxError}</div>
                                )}
                                <div style={{
                                    maxHeight: 320,
                                    overflow: 'auto',
                                    borderTop: '1px solid #eee',
                                    marginTop: 6,
                                    paddingTop: 6
                                }}>
                                    <Timeline ref={timelineRef}/>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div>Click anywhere on the map to select coordinates.</div>
                )}
            </div>

            <MLMap
                initialViewState={{
                    longitude: -100,
                    latitude: 40,
                    zoom: 3.5
                }}
                style={{width: 1920, height: 1080}}
                mapStyle={MAP_STYLE}
                onClick={onMapClick}
            >
                <NavigationControl position="top-right"/>
                {clicked && (
                    <Marker longitude={clicked.lon} latitude={clicked.lat} anchor="bottom">
                        <div style={{fontSize: 18}}>📍</div>
                    </Marker>
                )}
            </MLMap>
        </div>
    );
}

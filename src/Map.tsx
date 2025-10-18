// A beautiful, clickable map, propogates user clicks as coord upwards
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Map as MLMap, Marker} from '@vis.gl/react-maplibre';
import type {MapLayerMouseEvent} from 'maplibre-gl';
import type { StyleSpecification } from 'maplibre-gl';
import type { TimelineEvent, TimelineHandle } from './Timeline';
import Desc from './Desc';
import Jumplines from './Jumplines';
import TimelinePanel from './TimelinePanel';
import {proSearchText, translatePOI} from './PPX';
import mapStyleRaw from './assets/map_style.json?raw';

type ClickedCoord = {
    lat: number;
    lon: number;
};

// AAPTxy8BH1VEsoebNVZXo8HurFA-92mMnE3RJ1ZLRoF-uatVuLwCm5wx_yU_DxGrkq_qCiJXVRT-jtuZmY0_03jSRUz9Bgtq8pVwV6LTtplhae7cojeWzZm67Mgp3AhNZpB-SKjWKMGHP6rD79kyutlG6CUdlpU1k8NnETlRBKd9KVf5PABmv25F1bS-0qPSNSMQOlPc2qo_Edtdsn-7CK8QYK97dmTm6yxEX1DJfvjcjII.AT1_8nTjQFQT
const MAP_STYLE = JSON.parse(mapStyleRaw) as StyleSpecification;

// panel UI moved to Desc component

const LOCATION_KEYWORDS = [
    'city',
    'town',
    'village',
    'municipality',
    'district',
    'prefecture',
    'province',
    'state',
    'region',
    'county',
    'island',
    'metropolitan'
];

function deriveLocationScope(displayName?: string | null, address?: Record<string, string>): string | null {
    const segments = typeof displayName === 'string'
        ? displayName.split(',').map(segment => segment.trim()).filter(Boolean)
        : [];

    let scope: string | null = null;

    if (segments.length > 0) {
        const keywordSegment = segments.find(segment => {
            const lower = segment.toLowerCase();
            return LOCATION_KEYWORDS.some(keyword => lower.includes(keyword));
        });
        scope = (keywordSegment ?? segments[0]).trim();
    }

    const addressCandidate = LOCATION_KEYWORDS
        .map(keyword => address?.[keyword])
        .find(value => typeof value === 'string' && value.trim().length > 0);

    if (!scope && addressCandidate) {
        scope = addressCandidate.trim();
    }

    if (scope && /\d/.test(scope) && segments.length > 1) {
        const next = segments.find(segment => !/\d/.test(segment));
        if (next) {
            scope = `${scope}, ${next}`;
        }
    }

    if (!scope && segments.length > 0) {
        scope = segments.slice(0, Math.min(2, segments.length)).join(', ');
    }

    if (!scope && typeof displayName === 'string') {
        scope = displayName.trim();
    }

    if (!scope) return null;

    const limitedSegments = scope.split(',').map(part => part.trim()).filter(Boolean);
    if (limitedSegments.length > 2) {
        scope = limitedSegments.slice(0, 2).join(', ');
    }

    return scope.trim();
}

export default function ClickableMap(): React.ReactElement {
    const [clicked, setClicked] = useState<ClickedCoord | null>(null);
    const [city, setCity] = useState<string | null>(null);
    const [cityEnglish, setCityEnglish] = useState<string | null>(null);
    const [showDesc, setShowDesc] = useState<boolean>(true);
    const [showTimeline, setShowTimeline] = useState<boolean>(true);
    const abortRef = useRef<AbortController | null>(null);
    const timelineRef = useRef<TimelineHandle | null>(null);
    const [ppxLoading, setPpxLoading] = useState<boolean>(false);
    const [ppxError, setPpxError] = useState<string | null>(null);


    const reverseGeocode = useCallback(async (lat: number, lon: number) => {
        abortRef.current?.abort();
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        setCity(null);
        setCityEnglish(null);
        try {
            const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=en`;
            const resp = await fetch(url, {
                signal: ctrl.signal,
                headers: {'Accept': 'application/json'}
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            const addr: Record<string, string> | undefined = data?.address;
            const displayName = typeof data?.display_name === 'string' ? data.display_name : null;
            const detectedCity = addr?.city || addr?.town || addr?.village || addr?.county || addr?.state || null;
            const scopedName = deriveLocationScope(displayName, addr) ?? detectedCity ?? displayName ?? null;
            if (!ctrl.signal.aborted) {
                setCity(scopedName);
                setCityEnglish(scopedName);
            }
        } catch (err: unknown) {
            const anyErr = err as { name?: string; message?: string };
            if (anyErr?.name !== 'AbortError') {
                console.error(anyErr.message);
            }
        }
    }, []);

    useEffect(() => {
        if (!city) {
            setCityEnglish(null);
            return;
        }

        let cancelled = false;
        (async () => {
            try {
                const { text } = await translatePOI(city);
                if (!cancelled) {
                    const translated = text?.trim();
                    setCityEnglish(translated && translated.length > 0 ? translated : city);
                }
            } catch (error) {
                if (!cancelled) {
                    setCityEnglish(city);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [city]);

    const onMapClick = useCallback((e: MapLayerMouseEvent) => {
        const {lng, lat} = e.lngLat ?? {};
        if (typeof lng === 'number' && typeof lat === 'number') {
            setClicked({lat, lon: lng});
            setShowDesc(true);
            setShowTimeline(true);
            reverseGeocode(lat, lng);
        }
    }, [reverseGeocode]);

    const buildPrompt = useCallback((locationName: string) => {
        return [
            'You are a concise historian. For the location below, list ~8 chronological key historical events that are directly tied to it.',
            'Do not broaden the scope beyond the named location unless absolutely necessary.',
            'Return JSON array only. Fields must be: id (string), date (YYYY-MM-DD or best-known date), title, description, icon (emoji), color (hex).',
            `Location: ${locationName}`,
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
        const scopedCity = cityEnglish?.trim() || city?.trim();
        if (!scopedCity) {
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
                const prompt = buildPrompt(scopedCity);
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
    }, [city, cityEnglish, buildPrompt, tryParseEvents]);

    return (
        <div style={{position: 'relative', width: '100%', height: '100dvh'}}>
            {showDesc && (
                <Desc
                    clicked={clicked}
                    city={city}
                    cityEnglish={cityEnglish}
                    ppxLoading={ppxLoading}
                    ppxError={ppxError}
                    onClose={() => setShowDesc(false)}
                />
            )}
            {showTimeline && (
                <TimelinePanel
                    clicked={clicked}
                    city={city}
                    cityEnglish={cityEnglish}
                    ppxLoading={ppxLoading}
                    ppxError={ppxError}
                    timelineRef={timelineRef}
                    onClose={() => setShowTimeline(false)}
                />
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
            >
                {/*{city && clicked && (*/}
                {/*    <Jumplines origin={clicked} cityName={city} autoZoom />*/}
                {/*)}*/}
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
                        />
                    </Marker>
                )}
            </MLMap>
        </div>
    );
}

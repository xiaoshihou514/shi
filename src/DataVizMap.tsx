import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Map as MLMap, useControl} from '@vis.gl/react-maplibre';
import {MapboxOverlay} from '@deck.gl/mapbox';
import {PolygonLayer, TextLayer} from '@deck.gl/layers';
import type {Layer} from '@deck.gl/core';
import type {FeatureCollection, Geometry} from 'geojson';
import type {Map as MaplibreMap, StyleSpecification} from 'maplibre-gl';
import {bbox} from '@turf/turf';
import mapStyleRaw from './assets/map_style.json?raw';
import {COUNTRY_CODES} from './data/countryCodes';
import {proSearchText} from './PPX';

const MAP_STYLE = JSON.parse(mapStyleRaw) as StyleSpecification;

type BoundaryPolygon = {
    code: string;
    name: string;
    coordinates: number[][];
};

type NumericResult = {
    code: string;
    value: number;
};

type IntervalBucket = {
    label: string;
    color: string;
    range: [number, number];
    members: NumericResult[];
};

type ParsedInterval = {
    label?: string;
    color?: string;
    range: [number, number];
};

export default function DataVizMap(): React.ReactElement {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCodes, setSelectedCodes] = useState<Set<string>>(() => new Set());
    const [featureCollectionByCode, setFeatureCollectionByCode] = useState<Record<string, FeatureCollection | undefined>>({});
    const [boundaryDataByCode, setBoundaryDataByCode] = useState<Record<string, BoundaryPolygon[]>>({});
    const [centroidByCode, setCentroidByCode] = useState<Record<string, [number, number] | null>>({});
    const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
    const [errorMap, setErrorMap] = useState<Record<string, string>>({});
    const mapRef = useRef<MaplibreMap | null>(null);
    const selectedRef = useRef<Set<string>>(new Set());

    const [insightQuery, setInsightQuery] = useState('');
    const [insightResult, setInsightResult] = useState<string | null>(null);
    const [insightError, setInsightError] = useState<string | null>(null);
    const [insightLoading, setInsightLoading] = useState(false);
    const insightAbortRef = useRef<AbortController | null>(null);
    const [numericResults, setNumericResults] = useState<NumericResult[]>([]);
    const [intervalBuckets, setIntervalBuckets] = useState<IntervalBucket[]>([]);

    const filteredCodes = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();
        if (!query) return COUNTRY_CODES;
        return COUNTRY_CODES.filter(({code, name}) => {
            const matchCode = code.toLowerCase().includes(query);
            const matchName = name.toLowerCase().includes(query);
            return matchCode || matchName;
        });
    }, [searchTerm]);

    const selectedList = useMemo(() => Array.from(selectedCodes).sort(), [selectedCodes]);

    const countryNameByCode = useMemo(() => {
        const map = new Map<string, string>();
        for (const {code, name} of COUNTRY_CODES) {
            map.set(code, name);
        }
        return map;
    }, []);

    const toggleCode = useCallback((code: string) => {
        setSelectedCodes((prev) => {
            const next = new Set(prev);
            if (next.has(code)) {
                next.delete(code);
                setLoadingMap((prevLoading) => {
                    if (!prevLoading[code]) return prevLoading;
                    const clone = {...prevLoading};
                    delete clone[code];
                    return clone;
                });
                setErrorMap((prevError) => {
                    if (!prevError[code]) return prevError;
                    const clone = {...prevError};
                    delete clone[code];
                    return clone;
                });
                setCentroidByCode((prev) => {
                    if (!(code in prev)) return prev;
                    const clone = {...prev};
                    delete clone[code];
                    return clone;
                });
            } else {
                next.add(code);
            }
            return next;
        });
    }, []);

    const clearSelection = useCallback(() => {
        setSelectedCodes(new Set());
        setLoadingMap({});
        setErrorMap({});
        setCentroidByCode({});
        setNumericResults([]);
        setIntervalBuckets([]);
        setInsightResult(null);
        setInsightError(null);
    }, []);

    useEffect(() => {
        selectedRef.current = new Set(selectedCodes);
    }, [selectedCodes]);

    useEffect(() => {
        return () => {
            insightAbortRef.current?.abort();
        };
    }, []);

    useEffect(() => {
        const controllers: Record<string, AbortController> = {};
        const toFetch = selectedList.filter((code) => !featureCollectionByCode[code] && !loadingMap[code]);

        toFetch.forEach((code) => {
            const ctrl = new AbortController();
            controllers[code] = ctrl;
            setLoadingMap((prev) => ({...prev, [code]: true}));

            (async () => {
                try {
                    const downloadUrl = `/geo/${code}/ADM0`
                    const gjResp = await fetch(downloadUrl);
                    if (!gjResp.ok) throw new Error(`GeoJSON fetch failed (${gjResp.status})`);
                    const data = await gjResp.json() as FeatureCollection<Geometry, Record<string, unknown>>;

                    const processed = extractPolygonsFromFeatureCollection(code, countryNameByCode.get(code) ?? code, data);
                    if (processed.length === 0) {
                        setErrorMap((prev) => ({...prev, [code]: 'Geometry unavailable'}));
                    } else {
                        setErrorMap((prev) => {
                            if (!prev[code]) return prev;
                            const clone = {...prev};
                            delete clone[code];
                            return clone;
                        });
                    }
                    setFeatureCollectionByCode((prev) => ({...prev, [code]: data}));
                    setBoundaryDataByCode((prev) => ({...prev, [code]: processed}));
                    setCentroidByCode((prev) => ({...prev, [code]: computeCentroid(processed)}));

                    if (mapRef.current && selectedRef.current.has(code)) {
                        const [minLng, minLat, maxLng, maxLat] = bbox(data as any);
                        if ([minLng, minLat, maxLng, maxLat].every((n) => Number.isFinite(n))) {
                            mapRef.current.fitBounds([[minLng, minLat], [maxLng, maxLat]], {
                                padding: 48,
                                duration: 900
                            });
                        }
                    }
                } catch (err) {
                    if (!(err instanceof DOMException && err.name === 'AbortError')) {
                        const message = err instanceof Error ? err.message : 'Failed to load boundary';
                        setErrorMap((prev) => ({...prev, [code]: message}));
                    }
                } finally {
                    if (!ctrl.signal.aborted) {
                        setLoadingMap((prev) => {
                            if (!prev[code]) return prev;
                            const clone = {...prev};
                            delete clone[code];
                            return clone;
                        });
                    }
                }
            })();
        });

        return () => {
            Object.values(controllers).forEach((ctrl) => ctrl.abort());
        };
    }, [selectedList, featureCollectionByCode, loadingMap, countryNameByCode]);

    const layers = useMemo<Layer[]>(() => {
        const valueColorByCode = new Map<string, string>();
        const textColorByCode = new Map<string, string>();
        if (numericResults.length > 0) {
            for (const bucket of intervalBuckets) {
                for (const member of bucket.members) {
                    valueColorByCode.set(member.code, bucket.color);
                    textColorByCode.set(member.code, bucket.color);
                }
            }
        }

        const polygonLayers = selectedList.reduce<Layer[]>((acc, code) => {
            const data = boundaryDataByCode[code];
            if (!data || data.length === 0) return acc;
            const fillColorHex = valueColorByCode.get(code);
            const fillColor = fillColorHex ? hexToRgba(fillColorHex, 120) : [59, 130, 246, 80];
            const lineColor = fillColorHex ? hexToRgba(fillColorHex, 220) : [59, 130, 246, 220];
            acc.push(new PolygonLayer<BoundaryPolygon>({
                id: `country-boundary-${code}`,
                data,
                getPolygon: (d) => d.coordinates,
                stroked: true,
                filled: true,
                pickable: true,
                getLineColor: () => lineColor as [number, number, number, number],
                getFillColor: () => fillColor as [number, number, number, number],
                lineWidthUnits: 'pixels',
                lineWidthMinPixels: 1.5,
                autoHighlight: true,
                highlightColor: [255, 255, 255, 160]
            }));
            return acc;
        }, []);

        if (numericResults.length === 0) return polygonLayers;

        const textData = numericResults
            .map(({code, value}) => {
                const position = centroidByCode[code];
                if (!position) return null;
                const color = textColorByCode.get(code) ?? '#38bdf8';
                return {
                    code,
                    value,
                    position,
                    color
                };
            })
            .filter((item): item is {code: string; value: number; position: [number, number]; color: string} => !!item);

        if (textData.length === 0) return polygonLayers;

        const textLayer = new TextLayer<{code: string; value: number; position: [number, number]; color: string}>({
            id: 'country-values',
            data: textData,
            getPosition: (d) => d.position,
            getText: (d) => `${d.code}: ${d.value.toFixed(2)}`,
            getTextAnchor: 'middle',
            getAlignmentBaseline: 'center',
            getColor: (d) => hexToRgba(d.color, 230),
            getSize: 14,
            pickable: false
        });

        return [...polygonLayers, textLayer];
    }, [boundaryDataByCode, selectedList, numericResults, intervalBuckets, centroidByCode]);

    const handleInsightSubmit = useCallback(async (event?: React.FormEvent<HTMLFormElement>) => {
        event?.preventDefault();
        const trimmed = insightQuery.trim();
        if (!trimmed) {
            setInsightError('Enter a topic to query.');
            return;
        }
        if (selectedList.length === 0) {
            setInsightError('Select at least one country first.');
            return;
        }

        insightAbortRef.current?.abort();
        const ctrl = new AbortController();
        insightAbortRef.current = ctrl;

        setInsightLoading(true);
        setInsightError(null);
        setInsightResult(null);
        setNumericResults([]);
        setIntervalBuckets([]);

        const countryLines = selectedList.map((code) => {
            const name = countryNameByCode.get(code) ?? 'Unknown country';
            return `- ${code}: ${name}`;
        }).join('\n');

        const prompt = [
            `Provide numeric ${trimmed} values for the countries below.`,
            'Respond with a JSON object containing two keys: "values" (map ISO alpha-3 code -> double) and "intervals" (array of objects with {"label": string, "range": [min, max], "color": hex}).',
            'Example: {"values": {"USA": 123.4, "CAN": 98.1}, "intervals": [{"label": "Low", "range": [0, 50], "color": "#0ea5e9"}, ...]}. Use your best numeric estimates and leave out commentary.',
            countryLines
        ].join('\n');

        try {
            const {text} = await proSearchText({prompt, searchType: 'pro', signal: ctrl.signal});
            if (!ctrl.signal.aborted) {
                const parsed = parseNumericResponse(text, selectedList);
                if (parsed.values.length === 0) {
                    setInsightError(parsed.error ?? 'No numeric data returned.');
                } else {
                    setNumericResults(parsed.values);
                    if (parsed.intervals && parsed.intervals.length) {
                        setIntervalBuckets(applyParsedIntervals(parsed.values, parsed.intervals));
                    } else {
                        setIntervalBuckets(buildBuckets(parsed.values));
                    }
                }
                setInsightResult(text || '');
            }
        } catch (err) {
            if (!(err instanceof DOMException && err.name === 'AbortError')) {
                const msg = err instanceof Error ? err.message : 'Failed to fetch data.';
                setInsightError(msg);
            }
        } finally {
            if (!ctrl.signal.aborted) {
                setInsightLoading(false);
            }
        }
    }, [insightQuery, selectedList, countryNameByCode]);

    return (
        <div className="altmap-root">
            <MLMap
                mapStyle={MAP_STYLE}
                initialViewState={{
                    longitude: 8,
                    latitude: 34,
                    zoom: 2.6,
                    pitch: 25,
                    bearing: 10
                }}
                style={{width: '100%', height: '100%'}}
                onLoad={(ev) => {
                    try {
                        const map = (ev as unknown as { target?: MaplibreMap | null }).target ?? null;
                        mapRef.current = map;
                    } catch { /* ignore */
                    }
                }}
            >
                <BoundariesOverlay layers={layers}/>
            </MLMap>
            <form className="dataviz-query-bar" onSubmit={handleInsightSubmit}>
                <input
                    type="text"
                    value={insightQuery}
                    onChange={(e) => setInsightQuery(e.target.value)}
                    placeholder="Ask for GDP, population, or other metrics…"
                    aria-label="Data query"
                    disabled={insightLoading}
                />
                <button type="submit" disabled={insightLoading}>Query</button>
            </form>
            <aside className="altmap-hint">
                <div className="altmap-hint__header">
                    <h2>Visualization Sandbox</h2>
                    <p>Select ISO alpha-3 countries to drive prototype layers.</p>
                </div>
                <div className="country-selector">
                    <div className="country-selector__summary">
                        <span>Country Codes</span>
                        <span>{selectedCodes.size} selected</span>
                    </div>
                    <div className="country-selector__controls">
                        <input
                            type="search"
                            className="country-selector__search"
                            placeholder="Search by code or name…"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            aria-label="Filter country codes"
                        />
                        <button
                            type="button"
                            className="country-selector__clear"
                            onClick={clearSelection}
                            disabled={selectedCodes.size === 0}
                        >
                            Clear
                        </button>
                    </div>
                    <div className="country-selector__list" role="listbox" aria-label="Country code selection">
                        {filteredCodes.length === 0 ? (
                            <div className="country-selector__empty">No matches found</div>
                        ) : (
                            filteredCodes.map(({code, name}) => {
                                const checked = selectedCodes.has(code);
                                return (
                                    <label
                                        key={code}
                                        className={`country-selector__item ${checked ? 'is-selected' : ''}`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => toggleCode(code)}
                                            aria-label={`${code} ${name}`}
                                        />
                                        <span className="country-selector__code">{code}</span>
                                        <span className="country-selector__name">{name}</span>
                                    </label>
                                );
                            })
                        )}
                    </div>
                    {selectedList.length > 0 && (
                        <div className="country-selector__status">
                            {selectedList.map((code) => {
                                const isLoading = !!loadingMap[code];
                                const err = errorMap[code];
                                return (
                                    <div
                                        key={`status-${code}`}
                                        className={`country-selector__status-item ${isLoading ? 'is-loading' : ''} ${err ? 'is-error' : ''}`}
                                    >
                                        <span className="country-selector__status-code">{code}</span>
                                        <span className="country-selector__status-text">
                                            {isLoading ? 'Loading...' : err ? err : 'Ready'}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    {intervalBuckets.length > 0 && (
                        <div className="insight-legend">
                            {intervalBuckets.map((bucket) => (
                                <div key={bucket.label} className="insight-legend__item">
                                    <span className="insight-legend__swatch" style={{background: bucket.color}} />
                                    <span className="insight-legend__label">{bucket.label}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    {numericResults.length > 0 && (
                        <div className="insight-table">
                            {numericResults.map(({code, value}) => {
                                const bucket = intervalBuckets.find((b) => b.members.some((m) => m.code === code));
                                const color = bucket?.color ?? '#38bdf8';
                                return (
                                    <div key={`numeric-${code}`} className="insight-table__row">
                                        <span className="insight-table__code">{code}</span>
                                        <span className="insight-table__value">{value.toFixed(2)}</span>
                                        <span className="insight-table__tag" style={{background: color}} />
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    <div className="insight-output">
                        {insightLoading && <div className="insight-output__status">Fetching data…</div>}
                        {insightError && <div className="insight-output__error">{insightError}</div>}
                        {insightResult && !insightLoading && (
                            <pre className="insight-output__content">{insightResult}</pre>
                        )}
                    </div>
                    <p className="altmap-hint__example">
                        Tip: store prototypes in <code>src/experiments/</code> and use the selected set as inputs.
                    </p>
                </div>
            </aside>
        </div>
    );
}

type BoundariesOverlayProps = {
    layers: Layer[];
};

function BoundariesOverlay({layers}: BoundariesOverlayProps): null {
    const overlay = useControl(() => new MapboxOverlay({interleaved: true}));

    useEffect(() => {
        overlay.setProps({
            layers,
        });
        return () => overlay.setProps({layers: []});
    }, [overlay, layers]);

    return null;
}

function extractPolygonsFromFeatureCollection(code: string, name: string, collection: FeatureCollection<Geometry, Record<string, unknown>>): BoundaryPolygon[] {
    const features = Array.isArray(collection?.features) ? collection.features : [];
    const out: BoundaryPolygon[] = [];

    for (const feature of features) {
        const geom = feature?.geometry;
        if (!geom) continue;
        if (geom.type === 'Polygon') {
            const ring = geom.coordinates?.[0];
            if (Array.isArray(ring) && ring.length) {
                out.push({code, name, coordinates: ring as number[][]});
            }
        } else if (geom.type === 'MultiPolygon') {
            for (const polygon of geom.coordinates ?? []) {
                const ring = polygon?.[0];
                if (Array.isArray(ring) && ring.length) {
                    out.push({code, name, coordinates: ring as number[][]});
                }
            }
        }
    }

    return out;
}

function parseNumericResponse(raw: string, expectedCodes: string[]): {values: NumericResult[]; intervals?: ParsedInterval[]; error?: string} {
    const values: NumericResult[] = [];
    const parsedIntervals: ParsedInterval[] = [];
    try {
        const first = raw.indexOf('{');
        const last = raw.lastIndexOf('}');
        const text = first !== -1 && last !== -1 && last > first ? raw.slice(first, last + 1) : raw;
        const parsed = JSON.parse(text) as Record<string, unknown>;

        const valuesNode = parsed && typeof parsed === 'object' && parsed !== null && parsed.values && typeof parsed.values === 'object'
            ? parsed.values as Record<string, unknown>
            : parsed as Record<string, unknown>;

        for (const code of expectedCodes) {
            const rawValue = valuesNode?.[code];
            const num = typeof rawValue === 'number'
                ? rawValue
                : typeof rawValue === 'string'
                    ? Number(rawValue.replace(/[^0-9.\-+eE]/g, ''))
                    : NaN;
            if (Number.isFinite(num)) values.push({code, value: num});
        }
        if (values.length === 0) {
            return {values: [], error: 'Response lacked numeric values for selected codes.'};
        }
        values.sort((a, b) => a.value - b.value);
        const intervalsNode = parsed && typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as Record<string, unknown>).intervals)
            ? (parsed as Record<string, unknown>).intervals as Array<Record<string, unknown>>
            : [];
        for (const entry of intervalsNode) {
            if (!entry || typeof entry !== 'object') continue;
            const record = entry as Record<string, unknown>;
            const rangeRaw = record.range;
            const rawColor = record.color;
            const color = typeof rawColor === 'string' ? rawColor : undefined;
            if (!Array.isArray(rangeRaw) || rangeRaw.length < 2) continue;
            const [rawStart, rawEnd] = rangeRaw;
            const start = typeof rawStart === 'number' ? rawStart : Number(rawStart);
            const end = typeof rawEnd === 'number' ? rawEnd : Number(rawEnd);
            if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
            const label = typeof record.label === 'string' ? record.label : undefined;
            parsedIntervals.push({label, color, range: [start, end] as [number, number]});
        }
        return {values, intervals: parsedIntervals};
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to parse response.';
        return {values: [], intervals: [], error: message};
    }
}

function buildBuckets(values: NumericResult[]): IntervalBucket[] {
    if (values.length === 0) return [];
    const min = values[0]!.value;
    const max = values[values.length - 1]!.value;
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
    if (min === max) {
        return [{
            label: `${min.toFixed(2)}`,
            color: INTERVAL_COLORS[0],
            range: [min, max],
            members: [...values]
        }];
    }

    const bucketCount = Math.min(INTERVAL_COLORS.length, Math.max(3, Math.min(6, values.length)));
    const span = max - min;
    const step = span / bucketCount;
    const buckets: IntervalBucket[] = [];
    for (let i = 0; i < bucketCount; i += 1) {
        const start = min + step * i;
        const end = i === bucketCount - 1 ? max : min + step * (i + 1);
        buckets.push({
            label: `${start.toFixed(2)} – ${end.toFixed(2)}`,
            color: INTERVAL_COLORS[i],
            range: [start, end],
            members: []
        });
    }

    for (const entry of values) {
        const bucket = buckets.find((b, idx) => {
            const upperInclusive = idx === buckets.length - 1;
            return entry.value >= b.range[0] && (upperInclusive ? entry.value <= b.range[1] : entry.value < b.range[1]);
        }) ?? buckets[buckets.length - 1];
        bucket.members.push(entry);
    }

    return buckets.filter((b) => b.members.length > 0);
}

const INTERVAL_COLORS = [
    '#0ea5e9',
    '#38bdf8',
    '#818cf8',
    '#a855f7',
    '#f97316',
    '#ef4444'
];

function applyParsedIntervals(values: NumericResult[], parsedIntervals: ParsedInterval[]): IntervalBucket[] {
    if (!parsedIntervals.length) return buildBuckets(values);
    const intervals: IntervalBucket[] = parsedIntervals
        .map((entry, idx) => {
            const color = typeof entry.color === 'string' && /^#([0-9a-fA-F]{6})$/.test(entry.color)
                ? entry.color
                : INTERVAL_COLORS[idx % INTERVAL_COLORS.length];
            const label = typeof entry.label === 'string'
                ? entry.label
                : `${entry.range[0].toFixed(2)} – ${entry.range[1].toFixed(2)}`;
            const [start, end] = entry.range;
            return {
                label,
                color,
                range: [start, end] as [number, number],
                members: []
            };
        })
        .sort((a, b) => a.range[0] - b.range[0]);

    if (!intervals.length) return buildBuckets(values);

    for (const entry of values) {
        const bucket = intervals.find((b, idx) => {
            const upperInclusive = idx === intervals.length - 1;
            return entry.value >= b.range[0] && (upperInclusive ? entry.value <= b.range[1] : entry.value < b.range[1]);
        }) ?? intervals[intervals.length - 1];
        bucket.members.push(entry);
    }

    return intervals.filter((b) => b.members.length > 0);
}

function computeCentroid(polygons: BoundaryPolygon[]): [number, number] | null {
    let sumLng = 0;
    let sumLat = 0;
    let count = 0;
    for (const polygon of polygons) {
        for (const coord of polygon.coordinates) {
            if (!Array.isArray(coord) || coord.length < 2) continue;
            const [lng, lat] = coord;
            if (Number.isFinite(lng) && Number.isFinite(lat)) {
                sumLng += lng;
                sumLat += lat;
                count += 1;
            }
        }
    }
    if (count === 0) return null;
    return [sumLng / count, sumLat / count];
}

function hexToRgba(hex: string, alpha = 255): [number, number, number, number] {
    const clean = hex.replace('#', '');
    const match = clean.match(/.{1,2}/g);
    if (!match) return [56, 189, 248, alpha];
    const [r, g, b] = match.map((x) => parseInt(x, 16));
    return [r ?? 0, g ?? 0, b ?? 0, alpha];
}

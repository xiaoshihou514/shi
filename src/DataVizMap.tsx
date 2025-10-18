import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Map as MLMap, useControl} from '@vis.gl/react-maplibre';
import {MapboxOverlay} from '@deck.gl/mapbox';
import {PolygonLayer} from '@deck.gl/layers';
import type {Layer} from '@deck.gl/core';
import type {FeatureCollection, Geometry} from 'geojson';
import type {Map as MaplibreMap, StyleSpecification} from 'maplibre-gl';
import {bbox} from '@turf/turf';
import mapStyleRaw from './assets/map_style.json?raw';
import {COUNTRY_CODES} from './data/countryCodes';

const MAP_STYLE = JSON.parse(mapStyleRaw) as StyleSpecification;

type BoundaryPolygon = {
    coordinates: number[][]
};

export default function DataVizMap(): React.ReactElement {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCodes, setSelectedCodes] = useState<Set<string>>(() => new Set());
    const [featureCollectionByCode, setFeatureCollectionByCode] = useState<Record<string, FeatureCollection | undefined>>({});
    const [boundaryDataByCode, setBoundaryDataByCode] = useState<Record<string, BoundaryPolygon[]>>({});
    const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
    const [errorMap, setErrorMap] = useState<Record<string, string>>({});
    const mapRef = useRef<MaplibreMap | null>(null);
    const selectedRef = useRef<Set<string>>(new Set());

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
    }, []);

    useEffect(() => {
        selectedRef.current = new Set(selectedCodes);
    }, [selectedCodes]);

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

                    const processed = extractPolygonsFromFeatureCollection(data);
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
    }, [selectedList, featureCollectionByCode, loadingMap]);

    const layers = useMemo<Layer[]>(() => {
        return selectedList.reduce<Layer[]>((acc, code) => {
            const data = boundaryDataByCode[code];
            if (!data || data.length === 0) return acc;
            acc.push(new PolygonLayer<BoundaryPolygon>({
                id: `country-boundary-${code}`,
                data,
                getPolygon: (d) => d.coordinates,
                stroked: true,
                filled: true,
                pickable: true,
                getLineColor: [59, 130, 246, 220],
                getFillColor: [59, 130, 246, 80],
                lineWidthUnits: 'pixels',
                lineWidthMinPixels: 1.5,
                autoHighlight: true,
                highlightColor: [255, 255, 255, 160]
            }));
            return acc;
        }, []);
    }, [boundaryDataByCode, selectedList]);

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

function extractPolygonsFromFeatureCollection(collection: any): BoundaryPolygon[] {
    const features = collection.features[0].geometry.coordinates
    const out: BoundaryPolygon[] = [];

    for (const feature of features) {
        const coordinates = feature as BoundaryPolygon['coordinates'];
        out.push({coordinates});
    }

    return out;
}


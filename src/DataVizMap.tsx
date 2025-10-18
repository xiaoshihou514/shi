import React, {useCallback, useMemo, useState} from 'react';
import {Map as MLMap} from '@vis.gl/react-maplibre';
import mapStyleRaw from './assets/map_style.json?raw';
import type {StyleSpecification} from 'maplibre-gl';
import {COUNTRY_CODES} from './data/countryCodes';

const MAP_STYLE = JSON.parse(mapStyleRaw) as StyleSpecification;

export default function DataVizMap(): React.ReactElement {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCodes, setSelectedCodes] = useState<Set<string>>(() => new Set());

    const filteredCodes = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();
        if (!query) return COUNTRY_CODES;
        return COUNTRY_CODES.filter(({code, name}) => {
            const matchCode = code.toLowerCase().includes(query);
            const matchName = name.toLowerCase().includes(query);
            return matchCode || matchName;
        });
    }, [searchTerm]);

    const toggleCode = useCallback((code: string) => {
        setSelectedCodes((prev) => {
            const next = new Set(prev);
            if (next.has(code)) {
                next.delete(code);
            } else {
                next.add(code);
            }
            return next;
        });
    }, []);

    const clearSelection = useCallback(() => {
        setSelectedCodes(new Set());
    }, []);

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
            />
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
                    <p className="altmap-hint__example">
                        Tip: store prototypes in <code>src/experiments/</code> and use the selected set as inputs.
                    </p>
                </div>
            </aside>
        </div>
    );
}

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { normalSearchText } from './PPX';
import './Desc.css';

type ClickedCoord = {
    lat: number;
    lon: number;
};

type DescProps = {
    clicked: ClickedCoord | null;
    cityName: string | null;
    cityDetailedName: string | null;
    ppxLoading: boolean;
    ppxError: string | null;
    onClose?: () => void;
};

export default function Desc(props: DescProps): React.ReactElement {
    const { clicked, cityName, cityDetailedName, ppxLoading, ppxError, onClose } = props;

    const [descText, setDescText] = useState<string | null>(null);
    const [descLoading, setDescLoading] = useState<boolean>(false);
    const [descError, setDescError] = useState<string | null>(null);
    const descAbortRef = useRef<AbortController | null>(null);

    const fetchDescription = useCallback(async (targetCity: string, externalCtrl?: AbortController) => {
        const ctrl = externalCtrl ?? new AbortController();
        descAbortRef.current = ctrl;
        setDescLoading(true);
        setDescError(null);
        setDescText(null);
        try {
            const prompt = [
                `Generate a concise HTML snippet about the location ${targetCity}.`,
                'Stay focused on the named location; only broaden the scope when the place itself lacks sufficient historical material.',
                'Use semantic tags only (e.g., <p>, <strong>, <ul>, <li>).',
                'Highlight history, geography, and notable facts in 2-3 brief paragraphs or a short list.',
                'Any references must be inserted inline using <sup><a href="URL">[n]</a></sup> style, matching APA-like numbering. Do not append a separate references section.',
                'Return HTML only without surrounding quotes.'
            ].join(' ');
            const { text } = await normalSearchText({ prompt, searchType: 'fast' });
            if (!ctrl.signal.aborted) setDescText(text.trim());
        } catch (e: unknown) {
            const anyErr = e as { message?: string };
            if (!ctrl.signal.aborted) setDescError(anyErr?.message ?? 'Failed to fetch description');
        } finally {
            if (!ctrl.signal.aborted) setDescLoading(false);
        }
    }, []);

    useEffect(() => {
        // cancel previous
        descAbortRef.current?.abort();
        setDescText(null);
        setDescError(null);
        const normalizedCity = cityDetailedName?.trim() 
        if (!normalizedCity) {
            setDescLoading(false);
            return;
        }
        const ctrl = new AbortController();
        fetchDescription(normalizedCity, ctrl);
        return () => ctrl.abort();
    }, [cityDetailedName, fetchDescription]);

    const onRetry = useCallback(() => {
        const normalizedCity = cityDetailedName?.trim()
        if (!normalizedCity) return;
        descAbortRef.current?.abort();
        const ctrl = new AbortController();
        fetchDescription(normalizedCity, ctrl);
    }, [cityDetailedName, fetchDescription]);

    const formattedLat = clicked ? `${clicked.lat.toFixed(3)}°` : null;
    const formattedLon = clicked ? `${clicked.lon.toFixed(3)}°` : null;
    const isCityKnown = Boolean(cityDetailedName || cityName);
    const displayCity = cityName || 'Locating city…';

    return (
        <div className="desc-overlay">
            {!clicked ? (
                <div className="desc-panel desc-panel--empty">
                    <div className="desc-empty" aria-live="polite">
                        <div className="desc-empty__icon" role="img" aria-label="Map hint">🗺️</div>
                        <p className="desc-empty__title">Ready to explore?</p>
                        <p className="desc-empty__text">Tap a location on the map to unlock a tailored briefing.</p>
                    </div>
                </div>
            ) : (
                <article className="desc-panel desc-panel--full" aria-live="polite">
                    <button
                        type="button"
                        className="desc-close"
                        aria-label="Close description panel"
                        onClick={onClose}
                    >
                        ×
                    </button>
                    <header className="desc-header">
                        <div className="desc-header__badge">Location Snapshot</div>
                        <h2 className="desc-header__title">{displayCity}</h2>
                        <div className="desc-header__meta">
                            {formattedLat && <span className="desc-header__meta-item">Lat {formattedLat}</span>}
                            {formattedLon && <span className="desc-header__meta-item">Lon {formattedLon}</span>}
                        </div>
                        <div className="desc-header__status">
                            {ppxLoading && (
                                <span className="desc-pill desc-pill--loading">Curating timeline…</span>
                            )}
                            {!ppxLoading && ppxError && (
                                <span className="desc-pill desc-pill--error" role="alert">
                                    Timeline unavailable: {ppxError}
                                </span>
                            )}
                        </div>
                    </header>

                    <div className="desc-body">
                        <section className="desc-overview">
                            <div className="desc-overview__header">
                                <h3>City Overview</h3>
                                {isCityKnown && (
                                    <p>A rapid briefing covering history, geography, and standout details.</p>
                                )}
                            </div>
                            <div className="desc-overview__body">
                                {descLoading && (
                                    <div className="desc-skeleton-group" aria-hidden="true">
                                        <span className="desc-skeleton desc-skeleton--wide" />
                                        <span className="desc-skeleton desc-skeleton--medium" />
                                        <span className="desc-skeleton desc-skeleton--short" />
                                    </div>
                                )}

                                {!descLoading && descError && (
                                    <div className="desc-error" role="alert">
                                        <p>We couldn&apos;t fetch the briefing: {descError}</p>
                                        <button type="button" className="desc-button" onClick={onRetry}>
                                            Try again
                                        </button>
                                    </div>
                                )}

                                {!descLoading && !descError && descText && (
                                    <div
                                        className="desc-body__text"
                                        dangerouslySetInnerHTML={{ __html: descText }}
                                    />
                                )}

                                {!descLoading && !descError && !descText && isCityKnown && (
                                    <p className="desc-body__placeholder">
                                        No overview is available right now. Try selecting a nearby city.
                                    </p>
                                )}

                                {!isCityKnown && (
                                    <p className="desc-body__placeholder">
                                        Identifying the nearest metropolitan area…
                                    </p>
                                )}
                            </div>
                        </section>
                    </div>
                </article>
            )}
        </div>
    );
}

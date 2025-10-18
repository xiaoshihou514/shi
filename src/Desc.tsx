import React, { useEffect, useRef, useState, useCallback } from 'react';
import { normalSearchText } from './PPX';
import './Desc.css';

type ClickedCoord = {
    lat: number;
    lon: number;
};

type DescProps = {
    clicked: ClickedCoord | null;
    city: string | null;
    ppxLoading: boolean;
    ppxError: string | null;
};

export default function Desc(props: DescProps): React.ReactElement {
    const { clicked, city, ppxLoading, ppxError } = props;

    const [descText, setDescText] = useState<string | null>(null);
    const [descLoading, setDescLoading] = useState<boolean>(false);
    const [descError, setDescError] = useState<string | null>(null);
    const descAbortRef = useRef<AbortController | null>(null);

    const fetchDescription = useCallback(async (currentCity: string, externalCtrl?: AbortController) => {
        const ctrl = externalCtrl ?? new AbortController();
        descAbortRef.current = ctrl;
        setDescLoading(true);
        setDescError(null);
        setDescText(null);
        try {
            const prompt = [
                `Briefly describe the city of ${currentCity}.`,
                'Focus on history, geography, and notable facts in 2-3 sentences.'
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
        if (!city) {
            setDescLoading(false);
            return;
        }
        const ctrl = new AbortController();
        fetchDescription(city, ctrl);
        return () => ctrl.abort();
    }, [city, fetchDescription]);

    const onRetry = useCallback(() => {
        if (!city) return;
        descAbortRef.current?.abort();
        const ctrl = new AbortController();
        fetchDescription(city, ctrl);
    }, [city, fetchDescription]);

    const formattedLat = clicked ? `${clicked.lat.toFixed(3)}°` : null;
    const formattedLon = clicked ? `${clicked.lon.toFixed(3)}°` : null;
    const isCityKnown = Boolean(city);

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
                    <header className="desc-header">
                        <div className="desc-header__badge">Location Snapshot</div>
                        <h2 className="desc-header__title">{city ?? 'Locating city…'}</h2>
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
                                    <p className="desc-body__text">{descText}</p>
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

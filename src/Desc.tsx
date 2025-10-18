import React, { useEffect, useRef, useState, useCallback } from 'react';
import Timeline, { type TimelineHandle } from './Timeline';
import { normalSearchText } from './PPX';

type ClickedCoord = {
    lat: number;
    lon: number;
};

type DescProps = {
    clicked: ClickedCoord | null;
    city: string | null;
    ppxLoading: boolean;
    ppxError: string | null;
    timelineRef: React.RefObject<TimelineHandle | null>;
};

const panelStyle: React.CSSProperties = {
    position: 'absolute',
    top: 12,
    left: 12,
    zIndex: 1,
    background: 'rgba(255,255,255,0.9)',
    padding: '10px 12px',
    borderRadius: 8,
    boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
    maxWidth: 640,
    fontSize: 14,
    lineHeight: 1.35
};

export default function Desc(props: DescProps): React.ReactElement {
    const { clicked, city, ppxLoading, ppxError, timelineRef } = props;

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
    return (
        <div style={panelStyle}>
            {clicked ? (
                <div>
                    {city && (
                        <div style={{ marginTop: 10 }}>
                            <div style={{ fontWeight: 600, marginBottom: 6 }}>City: {city}</div>
                            {!ppxLoading && ppxError && (
                                <div style={{ color: '#c0392b' }}>Error: {ppxError}</div>
                            )}
                            <div style={{ marginTop: 10 }}>
                                <div style={{ fontWeight: 600, marginBottom: 6 }}>Description</div>
                                {descLoading && <div>Generating description…</div>}
                                {!descLoading && descError && (
                                    <div style={{ color: '#c0392b' }}>
                                        Error: {descError}
                                        <button style={{ marginLeft: 8 }} onClick={onRetry}>Retry</button>
                                    </div>
                                )}
                                {!descLoading && !descError && descText && (
                                    <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{descText}</div>
                                )}
                            </div>
                            <div style={{ maxHeight: 320, overflow: 'auto', borderTop: '1px solid #eee', marginTop: 6, paddingTop: 6 }}>
                                <Timeline ref={timelineRef} />
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div>Click anywhere on the map to select coordinates.</div>
            )}
        </div>
    );
}

import React from 'react';
import Timeline, { type TimelineHandle } from './Timeline';
import './TimelinePanel.css';

type ClickedCoord = {
    lat: number;
    lon: number;
};

type TimelinePanelProps = {
    clicked: ClickedCoord | null;
    cityName: string | null;
    cityDetailedName: string | null;
    ppxLoading: boolean;
    ppxError: string | null;
    timelineRef: React.RefObject<TimelineHandle | null>;
    onClose?: () => void;
};

export default function TimelinePanel(props: TimelinePanelProps): React.ReactElement | null {
    const { clicked, cityName, cityDetailedName, ppxLoading, ppxError, timelineRef, onClose } = props;
    const hasSelection = Boolean(clicked);
    const hasCity = Boolean(cityName || cityDetailedName);
    const displayCity = cityName ?? null;

    if (!hasSelection) {
        return <div></div>; // not null so that the types match
    }

    return (
        <aside className="timeline-overlay">
            <div className="timeline-panel" aria-live="polite">
                <header className="timeline-panel__header">
                    <button
                        type="button"
                        className="timeline-panel__close"
                        aria-label="Close timeline panel"
                        onClick={onClose}
                    >
                        ×
                    </button>
                    <div className="timeline-panel__badge">Historical Timeline</div>
                    <h2 className="timeline-panel__title">
                        {displayCity ? `Key moments in ${displayCity}` : 'Select a city to begin'}
                    </h2>
                    <div className="timeline-panel__status">
                        {ppxLoading && (
                            <span className="timeline-pill timeline-pill--loading">Compiling events…</span>
                        )}
                        {!ppxLoading && ppxError && (
                            <span className="timeline-pill timeline-pill--error" role="alert">
                                {ppxError}
                            </span>
                        )}
                    </div>
                </header>

                <div className="timeline-panel__body">
                    {!hasSelection && (
                        <div className="timeline-panel__placeholder">
                            <div className="timeline-panel__placeholder-icon" role="img" aria-label="Timeline hint">
                                🧭
                            </div>
                            <p className="timeline-panel__placeholder-title">No path plotted yet</p>
                            <p className="timeline-panel__placeholder-text">
                                Tap the map to generate a curated chronological journey for the selected location.
                            </p>
                        </div>
                    )}

                    {hasSelection && (
                        <div className="timeline-panel__timeline">
                            <Timeline ref={timelineRef} className="timeline-compact timeline-panel__timeline-inner" />
                            {!ppxLoading && !ppxError && !hasCity && (
                                <div className="timeline-panel__notice">
                                    Identifying the nearest city; events will populate shortly.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </aside>
    );
}

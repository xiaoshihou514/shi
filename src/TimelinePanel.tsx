import React from 'react';
import Timeline, { type TimelineHandle } from './Timeline';
import './TimelinePanel.css';

type ClickedCoord = {
    lat: number;
    lon: number;
};

type TimelinePanelProps = {
    clicked: ClickedCoord | null;
    city: string | null;
    ppxLoading: boolean;
    ppxError: string | null;
    timelineRef: React.RefObject<TimelineHandle | null>;
};

export default function TimelinePanel(props: TimelinePanelProps): React.ReactElement {
    const { clicked, city, ppxLoading, ppxError, timelineRef } = props;
    const hasSelection = Boolean(clicked);
    const hasCity = Boolean(city);

    if (!hasSelection) {
        return <div></div>;
    }

    return (
        <aside className="timeline-overlay">
            <div className="timeline-panel" aria-live="polite">
                <header className="timeline-panel__header">
                    <div className="timeline-panel__badge">Historical Timeline</div>
                    <h2 className="timeline-panel__title">
                        {city ? `Key moments in ${city}` : 'Select a city to begin'}
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

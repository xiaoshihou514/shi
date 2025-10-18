import React from 'react';
import Timeline, { type TimelineHandle } from './Timeline';
import Wordcloud from './Wordcloud';
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
    const [activeView, setActiveView] = React.useState<'timeline' | 'wordcloud'>('timeline');
    React.useEffect(() => {
        setActiveView('timeline');
    }, [displayCity]);

    if (!hasSelection) {
        return <></>;
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
                    <div className="timeline-panel__view-toggle" role="tablist" aria-label="Insight view">
                        <button
                            type="button"
                            className={`timeline-panel__toggle ${activeView === 'timeline' ? 'is-active' : ''}`}
                            onClick={() => setActiveView('timeline')}
                            role="tab"
                            aria-selected={activeView === 'timeline'}
                        >
                            Timeline
                        </button>
                        <button
                            type="button"
                            className={`timeline-panel__toggle ${activeView === 'wordcloud' ? 'is-active' : ''}`}
                            onClick={() => setActiveView('wordcloud')}
                            role="tab"
                            aria-selected={activeView === 'wordcloud'}
                            disabled={!hasCity}
                        >
                            Word Cloud
                        </button>
                    </div>

                    <div className="timeline-panel__content">
                        {activeView === 'timeline' ? (
                            <div className="timeline-panel__timeline">
                                <Timeline ref={timelineRef} className="timeline-compact timeline-panel__timeline-inner" />
                                {!ppxLoading && !ppxError && !hasCity && (
                                    <div className="timeline-panel__notice">
                                        Identifying the nearest locale; events will populate shortly.
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="timeline-panel__wordcloud">
                                {hasCity ? (
                                    <Wordcloud
                                        city={displayCity}
                                        className="timeline-panel__wordcloud-inner"
                                        style={{ height: '100%', background: 'transparent' }}
                                    />
                                ) : (
                                    <div className="timeline-panel__placeholder">
                                        <div className="timeline-panel__placeholder-icon" role="img" aria-label="Word cloud hint">
                                            ☁️
                                        </div>
                                        <p className="timeline-panel__placeholder-title">Word cloud unavailable</p>
                                        <p className="timeline-panel__placeholder-text">
                                            Choose a location to surface distinctive themes and highlights.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </aside>
    );
}

// A timeline widget, showcasing major events that happened in the area. Best to be streaming, with info gradually filling it up
import { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import type { CSSProperties } from 'react';
import './Timeline.css';

// Event type definitions
export interface TimelineEvent {
    id: string;
    date: string;
    title: string;
    description: string;
    icon?: string;
    color?: string;
}

export interface TimelineProps {
    events?: TimelineEvent[];
    onEventClick?: (event: TimelineEvent) => void;
    className?: string;
}

export interface TimelineHandle {
    addEvent: (event: TimelineEvent) => void;
    clearEvents: () => void;
    getEvents: () => TimelineEvent[];
}

const Timeline = forwardRef<TimelineHandle, TimelineProps>(({
                                                                events: initialEvents = [],
                                                                onEventClick,
                                                                className = ''
                                                            }, ref) => {
    const [events, setEvents] = useState<TimelineEvent[]>(initialEvents);
    const [visibleEvents, setVisibleEvents] = useState<Set<string>>(new Set());
    const [hasEvents, setHasEvents] = useState(false);
    const timelineRef = useRef<HTMLDivElement>(null);
    const observerRef = useRef<IntersectionObserver | null>(null);

    // Expose methods to ref
    useImperativeHandle(ref, () => ({
        addEvent: (event: TimelineEvent) => {
            setEvents(prev => {
                const existingIds = new Set(prev.map(e => e.id));
                if (existingIds.has(event.id)) return prev;

                const newEvents = [...prev, event];
                return newEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            });
        },
        clearEvents: () => {
            setEvents([]);
            setVisibleEvents(new Set());
        },
        getEvents: () => {
            return [...events];
        }
    }));

    // Handle addition of new events
    useEffect(() => {
        setEvents(prev => {
            const existingIds = new Set(prev.map(event => event.id));
            const newEvents = initialEvents.filter(event => !existingIds.has(event.id));

            if (newEvents.length === 0) return prev;

            const updatedEvents = [...prev, ...newEvents];
            return updatedEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        });
    }, [initialEvents]);

    // Track if we have events to show timeline line
    useEffect(() => {
        setHasEvents(events.length > 0);
    }, [events]);

    // Set up Intersection Observer to detect element visibility
    useEffect(() => {
        if (!timelineRef.current) return;

        observerRef.current = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const eventId = entry.target.getAttribute('data-event-id');
                        if (eventId) {
                            setVisibleEvents(prev => new Set(prev).add(eventId));
                        }
                    }
                });
            },
            {
                threshold: 0.1,
                rootMargin: '0px 0px -50px 0px'
            }
        );

        const eventElements = timelineRef.current.querySelectorAll('.timeline-event');
        eventElements.forEach(element => {
            observerRef.current?.observe(element);
        });

        return () => {
            observerRef.current?.disconnect();
        };
    }, [events]);

    // Format date display
    const getDateParts = (dateString: string) => {
        const date = new Date(dateString);
        if (Number.isNaN(date.getTime())) {
            return {
                label: dateString,
                shortLabel: dateString,
                yearLabel: '',
                isoString: undefined as string | undefined
            };
        }

        return {
            label: date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }),
            shortLabel: date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric'
            }),
            yearLabel: String(date.getFullYear()),
            isoString: date.toISOString()
        };
    };

    return (
        <div className={`timeline-container ${className}`} ref={timelineRef}>
            <div className={`timeline ${hasEvents ? 'has-events' : ''}`}>
                {events.map((event) => {
                    const isVisible = visibleEvents.has(event.id);
                    const accentColor = event.color || 'var(--timeline-accent)';
                    const eventStyle = {
                        '--event-accent': accentColor
                    } as CSSProperties;

                    const dateParts = getDateParts(event.date);

                    return (
                        <div
                            key={event.id}
                            data-event-id={event.id}
                            className={`timeline-event ${isVisible ? 'visible' : ''}`}
                            style={eventStyle}
                        >
                            <div className="timeline-event__time" aria-hidden={!dateParts.yearLabel && !dateParts.shortLabel}>
                                {dateParts.yearLabel && (
                                    <span className="timeline-event__time-year">{dateParts.yearLabel}</span>
                                )}
                                <time
                                    className="timeline-event__time-date"
                                    dateTime={dateParts.isoString}
                                    suppressHydrationWarning
                                >
                                    {dateParts.shortLabel}
                                </time>
                            </div>

                            <div className="timeline-event__marker" aria-hidden="true">
                                <span className="timeline-event__node">
                                    <span className="timeline-event__icon">
                                        {event.icon || '✨'}
                                    </span>
                                </span>
                            </div>

                            <div className="timeline-event__content">
                                <div className="timeline-event__content-header">
                                    <time
                                        className="timeline-event__content-date"
                                        dateTime={dateParts.isoString}
                                        suppressHydrationWarning
                                    >
                                        {dateParts.label}
                                    </time>
                                </div>

                                <div className="timeline-event__title">
                                    {event.title}
                                </div>

                                <div className="timeline-event__description">
                                    {event.description}
                                </div>

                                {onEventClick && (
                                    <button
                                        className="timeline-event__cta"
                                        onClick={() => onEventClick(event)}
                                    >
                                        Explore
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}

                {events.length === 0 && (
                    <div className="timeline-empty">
                        <div className="empty-icon">🌌</div>
                        <div className="empty-text">Timeline is being initialized...</div>
                    </div>
                )}
            </div>
        </div>
    );
});

Timeline.displayName = 'Timeline';

export default Timeline;

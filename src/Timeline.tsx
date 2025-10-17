// A timeline widget, showcasing major events that happened in the area. Best to be streaming, with info gradually filling it up
import { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import './Timeline.css';

// 事件类型定义
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
    const timelineRef = useRef<HTMLDivElement>(null);
    const observerRef = useRef<IntersectionObserver | null>(null);

    // 暴露方法给 ref
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

    // 处理新事件的添加
    useEffect(() => {
        setEvents(prev => {
            const existingIds = new Set(prev.map(event => event.id));
            const newEvents = initialEvents.filter(event => !existingIds.has(event.id));

            if (newEvents.length === 0) return prev;

            const updatedEvents = [...prev, ...newEvents];
            return updatedEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        });
    }, [initialEvents]);

    // 设置 Intersection Observer 来检测元素是否可见
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

    // 格式化日期显示
    const formatDate = (dateString: string): string => {
        const date = new Date(dateString);
        return date.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    return (
        <div className={`timeline-container ${className}`} ref={timelineRef}>
            <div className="timeline">
                {events.map((event, index) => {
                    const isVisible = visibleEvents.has(event.id);
                    const isEven = index % 2 === 0;

                    return (
                        <div
                            key={event.id}
                            data-event-id={event.id}
                            className={`timeline-event ${isEven ? 'left' : 'right'} ${
                                isVisible ? 'visible' : ''
                            }`}
                        >
                            <div className="timeline-content">
                                <div
                                    className="timeline-icon"
                                    style={{ backgroundColor: event.color || '#3498db' }}
                                >
                                    {event.icon || '📅'}
                                </div>

                                <div className="timeline-date">
                                    {formatDate(event.date)}
                                </div>

                                <div className="timeline-title">
                                    {event.title}
                                </div>

                                <div className="timeline-description">
                                    {event.description}
                                </div>

                                {onEventClick && (
                                    <button
                                        className="timeline-button"
                                        onClick={() => onEventClick(event)}
                                    >
                                        查看详情
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}

                {events.length === 0 && (
                    <div className="timeline-empty">
                        <div className="empty-icon">⏳</div>
                        <div className="empty-text">等待事件数据...</div>
                    </div>
                )}
            </div>
        </div>
    );
});

Timeline.displayName = 'Timeline';

export default Timeline;

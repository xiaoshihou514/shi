// import './App.css'
// import { Map } from '@vis.gl/react-maplibre'

// function App() {
//   return <Map
//     initialViewState={{
//       longitude: -100,
//       latitude: 40,
//       zoom: 3.5
//     }}
//     style={{width: 600, height: 400}}
//     mapStyle="https://demotiles.maplibre.org/style.json"
//   />;
// }
//
// export default App
import React, { useRef, useEffect } from 'react';
import Timeline, { type TimelineEvent, type TimelineHandle } from './Timeline';

const App: React.FC = () => {
    const timelineRef = useRef<TimelineHandle>(null);

    // 模拟流式数据添加
    useEffect(() => {
        const initialEvents: TimelineEvent[] = [
            {
                id: '1',
                date: '2024-01-15',
                title: '项目启动',
                description: '区域发展项目正式启动',
                icon: '🚀',
                color: '#e74c3c'
            },
            {
                id: '2',
                date: '2024-02-20',
                title: '第一阶段完成',
                description: '成功完成项目的第一阶段目标',
                icon: '✅',
                color: '#2ecc71'
            }
        ];

        // 初始事件
        initialEvents.forEach(event => {
            setTimeout(() => {
                timelineRef.current?.addEvent(event);
            }, 100);
        });

        // 模拟后续流式添加事件
        const additionalEvents: TimelineEvent[] = [
            {
                id: '3',
                date: '2024-03-10',
                title: '技术突破',
                description: '在关键技术领域取得重要突破',
                icon: '💡',
                color: '#9b59b6'
            },
            {
                id: '4',
                date: '2024-04-05',
                title: '社区活动',
                description: '成功举办社区交流活动',
                icon: '👥',
                color: '#f39c12'
            },
            {
                id: '5',
                date: '2024-05-20',
                title: '成果展示',
                description: '向公众展示项目成果',
                icon: '📊',
                color: '#1abc9c'
            }
        ];

        additionalEvents.forEach((event, index) => {
            setTimeout(() => {
                timelineRef.current?.addEvent(event);
            }, 1500 + index * 800);
        });
    }, []);

    const handleEventClick = (event: TimelineEvent) => {
        console.log('点击事件:', event);
        // 处理事件点击逻辑
    };

    const handleClearEvents = () => {
        timelineRef.current?.clearEvents();
    };

    const handleGetEvents = () => {
        const events = timelineRef.current?.getEvents();
        console.log('当前所有事件:', events);
    };

    return (
        <div className="app">
            <h1>区域发展时间线</h1>

            <div style={{ marginBottom: '20px' }}>
                <button onClick={handleClearEvents} style={{ marginRight: '10px' }}>
                    清空时间线
                </button>
                <button onClick={handleGetEvents}>
                    获取所有事件
                </button>
            </div>

            <Timeline
                ref={timelineRef}
                onEventClick={handleEventClick}
                className="custom-timeline"
            />
        </div>
    );
};

export default App;

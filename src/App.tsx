import React from 'react';
import Map from './Map';
import PersonPath from './PersonPath';

const App: React.FC = () => {
    const [mode, setMode] = React.useState<'map' | 'person'>('map');
    const toggleLabel = mode === 'map' ? 'Person mode' : 'Map mode';
    return (
        <div className="app" style={{ position: 'relative', width: '100%', height: '100dvh' }}>
            {mode === 'map' ? <Map /> : <PersonPath />}
            <button
                type="button"
                onClick={() => setMode(mode === 'map' ? 'person' : 'map')}
                style={{
                    position: 'absolute',
                    right: 16,
                    bottom: 16,
                    padding: '8px 14px',
                    borderRadius: 999,
                    border: '1px solid rgba(124, 92, 255, 0.35)',
                    background: 'rgba(12, 18, 38, 0.85)',
                    color: '#f3f5ff',
                    fontSize: '0.8rem',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    zIndex: 200,
                }}
            >
                {toggleLabel}
            </button>
        </div>
    );
};

export default App;

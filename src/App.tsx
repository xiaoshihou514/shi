import React, {useState} from 'react';
import Map from './Map';
import DataVizMap from './DataVizMap.tsx';
import './App.css';

type Mode = 'primary' | 'sandbox';

const App: React.FC = () => {
    const [mode, setMode] = useState<Mode>('primary');
    const isPrimary = mode === 'primary';

    return (
        <div className={`app app-root mode-${mode}`}>
            <main className="app-main" role="main">
                {isPrimary ? <Map /> : <DataVizMap />}
            </main>
            <nav className="app-mode-switch" role="tablist" aria-label="Map visualization mode">
                <span className="app-mode-switch__label">Mode</span>
                <button
                    type="button"
                    role="tab"
                    aria-selected={isPrimary}
                    aria-pressed={isPrimary}
                    className={`mode-toggle ${isPrimary ? 'is-active' : ''}`}
                    onClick={() => setMode('primary')}
                >
                    Primary
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={!isPrimary}
                    aria-pressed={!isPrimary}
                    className={`mode-toggle ${!isPrimary ? 'is-active' : ''}`}
                    onClick={() => setMode('sandbox')}
                >
                    Sandbox
                </button>
            </nav>
        </div>
    );
};

export default App;

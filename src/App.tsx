import React, { useState } from "react";
import Map from "./Map";
import PersonPath from "./PersonPath";
import DataVizMap from "./DataVizMap";
import "./App.css";

type Mode = "primary" | "sandbox" | "person";

const App: React.FC = () => {
  const [mode, setMode] = useState<Mode>("primary");

  return (
    <div className={`app app-root mode-${mode}`}>
      <main className="app-main" role="main">
        {mode === "primary" ? (
          <Map />
        ) : mode === "sandbox" ? (
          <DataVizMap />
        ) : (
          <PersonPath />
        )}
      </main>
      <nav
        className="app-mode-switch"
        role="tablist"
        aria-label="Map visualization mode"
      >
        <span className="app-mode-switch__label">Mode</span>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "primary"}
          aria-pressed={mode === "primary"}
          className={`mode-toggle ${mode === "primary" ? "is-active" : ""}`}
          onClick={() => setMode("primary")}
        >
          Primary
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "sandbox"}
          aria-pressed={mode === "sandbox"}
          className={`mode-toggle ${mode === "sandbox" ? "is-active" : ""}`}
          onClick={() => setMode("sandbox")}
        >
          Sandbox
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "person"}
          aria-pressed={mode === "person"}
          className={`mode-toggle ${mode === "person" ? "is-active" : ""}`}
          onClick={() => setMode("person")}
        >
          Person Path
        </button>
      </nav>
    </div>
  );
};

export default App;

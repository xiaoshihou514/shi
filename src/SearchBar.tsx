import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {normalSearchText} from './PPX';
import './SearchBar.css';

export type SearchBarProps = {
  onLocate: (p: { lat: number; lon: number; name?: string }) => void;
  className?: string;
};

type GeocodeResult = { lat: number; lon: number } | null;

export default function SearchBar(props: SearchBarProps): React.ReactElement {
  const { onLocate, className } = props;

  const [value, setValue] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState<boolean>(false);
  const visibleUntilRef = useRef<number>(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const hoverRef = useRef<boolean>(false);

  const showTemporarily = useCallback((ms: number = 2000) => {
    setVisible(true);
    visibleUntilRef.current = Date.now() + ms;
  }, []);

  useEffect(() => {
    const onMove = () => {
      showTemporarily(2000);
    };
    window.addEventListener('mousemove', onMove);
    const timer = setInterval(() => {
      if (hoverRef.current) return;
      if (document.activeElement === inputRef.current) return;
      setVisible(Date.now() < visibleUntilRef.current);
    }, 150);
    return () => {
      window.removeEventListener('mousemove', onMove);
      clearInterval(timer);
    };
  }, [showTemporarily]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/') {
        e.preventDefault();
        showTemporarily(3000);
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showTemporarily]);

  const geocodeCity = useCallback(async (name: string, signal?: AbortSignal): Promise<GeocodeResult> => {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(name)}`;
    const resp = await fetch(url, { headers: { 'Accept': 'application/json' }, signal });
    if (!resp.ok) return null;
    const data = await resp.json().catch(() => []) as Array<{lat: string; lon: string}>;
    const first = data[0];
    if (!first) return null;
    const lat = Number(first.lat);
    const lon = Number(first.lon);
    if (!isFinite(lat) || !isFinite(lon)) return null;
    return { lat, lon };
  }, []);

  const pickRandomCityViaPPX = useCallback(async (signal?: AbortSignal): Promise<string | null> => {
    const prompt = [
      'Choose one random, globally-recognized city. Return STRICT JSON only: {"name": string}.',
      'Name must be English, concise (City[, Region][, Country]). No commentary.'
    ].join('\n');
    const { text } = await normalSearchText({ prompt, searchType: 'fast', signal });
    const tryParse = (t: string) => {
      try { return JSON.parse(t); } catch { /* ignore parse error */ }
      const a = t.indexOf('{'); const b = t.lastIndexOf('}');
      if (a !== -1 && b !== -1 && b > a) {
        try { return JSON.parse(t.slice(a, b + 1)); } catch { /* ignore parse error */ }
      }
      return null;
    };
    const obj = tryParse(text);
    if (obj && typeof obj === 'object' && (obj as Record<string, unknown>).name && typeof (obj as Record<string, unknown>).name === 'string') {
      const name = String((obj as Record<string, unknown>).name).trim();
      return name.length ? name : null;
    }
    return null;
  }, []);

  const locateByName = useCallback(async (name: string) => {
    setBusy(true);
    setError(null);
    try {
      const ctrl = new AbortController();
      const pos = await geocodeCity(name, ctrl.signal);
      if (!pos) {
        setError('Unable to locate that city');
        return;
      }
      onLocate({ lat: pos.lat, lon: pos.lon, name });
    } catch {
      setError('Search failed');
    } finally {
      setBusy(false);
    }
  }, [geocodeCity, onLocate]);

  const onSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    if (!v) return;
    locateByName(v);
  }, [value, locateByName]);

  const onShuffle = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const ctrl = new AbortController();
      const name = await pickRandomCityViaPPX(ctrl.signal);
      if (!name) {
        setError('No city suggested');
        return;
      }
      setValue(name);
      const pos = await geocodeCity(name, ctrl.signal);
      if (!pos) {
        setError('Unable to locate that city');
        return;
      }
      onLocate({ lat: pos.lat, lon: pos.lon, name });
    } catch {
      setError('Shuffle failed');
    } finally {
      setBusy(false);
    }
  }, [pickRandomCityViaPPX, geocodeCity, onLocate]);

  const wrapClass = useMemo(() => [
    'searchbar-wrap',
    visible ? 'is-visible' : '',
    className ?? ''
  ].filter(Boolean).join(' '), [visible, className]);

  return (
    <div
      className={wrapClass}
      onMouseEnter={() => { hoverRef.current = true; setVisible(true); }}
      onMouseLeave={() => { hoverRef.current = false; }}
    >
      <form onSubmit={onSubmit} className="searchbar-form">
        <div className="searchbar-control-group">
          <button
            type="button"
            className="searchbar-btn searchbar-btn--secondary searchbar-btn--icon"
            onClick={onShuffle}
            disabled={busy}
            aria-label="Random place"
            title="Random place"
          >
            {busy
              ? <span className="searchbar-spinner" />
              : (
                <svg viewBox="0 0 24 24" aria-hidden="true" className="searchbar-icon">
                  <path d="M4 4h3.59l3.7 4.63a3 3 0 0 0 4.62 0L19 4h1v3h-1.6l-2.33 2.91a5 5 0 0 1-7.54 0L6.8 7H4V4zm0 16v-3h2.8l2.73-3.46a5 5 0 0 1 7.54 0L19 17h1v3h-3.59l-3.7-4.63a3 3 0 0 0-4.62 0L6 20H4zm13.24-6.34L21 7h-3.54l-3.06 3.87 2.84 2.79zM3 17h3.54l3.06-3.87-2.84-2.79L3 17z" />
                </svg>
              )}
            <span className="visually-hidden">Random place</span>
          </button>
          <input
            ref={inputRef}
            className="searchbar-input"
            type="text"
            placeholder="/ Search"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={busy}
          />
          <button
            type="submit"
            className="searchbar-btn searchbar-btn--primary searchbar-btn--icon"
            disabled={busy}
            aria-label="Search"
            title="Search"
          >
            {busy
              ? <span className="searchbar-spinner" />
              : (
                <svg viewBox="0 0 24 24" aria-hidden="true" className="searchbar-icon">
                  <path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.71.71l.27.28v.79L20 20.49 21.49 19l-5.99-5zM10 14a4 4 0 1 1 0-8 4 4 0 0 1 0 8z" />
                </svg>
              )}
            <span className="visually-hidden">Search</span>
          </button>
        </div>
      </form>
      {error && <span className="searchbar-error">{error}</span>}
    </div>
  );
}

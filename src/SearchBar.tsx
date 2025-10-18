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
      <form onSubmit={onSubmit} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          ref={inputRef}
          className="searchbar-input"
          type="text"
          placeholder="Search a city… (press / to focus)"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={busy}
        />
        <button type="submit" className="searchbar-btn" disabled={busy}>
          Go
        </button>
      </form>
      <button type="button" className="searchbar-btn" onClick={onShuffle} disabled={busy}>
        {busy ? <span className="searchbar-spinner" /> : 'Shuffle'}
      </button>
      {error && <span className="searchbar-error">{error}</span>}
    </div>
  );
}



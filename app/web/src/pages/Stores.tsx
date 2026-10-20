import { FormEvent, useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { Store } from '../api/types';
import { useBug } from '../context/ConfigContext';

type Status = 'idle' | 'locating' | 'done' | 'denied' | 'unavailable' | 'error';

function StoreList({ stores, testId }: { stores: Store[]; testId: string }) {
  return (
    <ol className="store-list" data-testid={testId}>
      {stores.map((s) => (
        <li key={s.id} className="store" data-testid="store-result" data-store-id={s.id}>
          <h3 className="h3" data-testid="store-name">
            {s.name}
          </h3>
          <p>
            {s.address}, {s.city}
            {s.distanceKm !== undefined && (
              <>
                {' '}
                · <strong data-testid="store-distance" data-km={s.distanceKm}>{s.distanceKm.toFixed(1)} km away</strong>
              </>
            )}
          </p>
          <p className="muted small">{s.hours}</p>
        </li>
      ))}
    </ol>
  );
}

/** Store finder: geolocation for the 3 nearest stores, with a town search when location is unavailable. */
export function Stores() {
  const [status, setStatus] = useState<Status>('idle');
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [nearest, setNearest] = useState<Store[]>([]);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Store[] | null>(null);
  const [error, setError] = useState('');
  // permission-denied-crash: errors from the Geolocation API are ignored, so the spinner never stops.
  const crashOnDenied = useBug('permission-denied-crash');

  useEffect(() => {
    document.title = 'Find a store – PlayLab Shop';
  }, []);

  const locate = () => {
    setError('');
    if (!('geolocation' in navigator)) {
      setStatus('unavailable');
      return;
    }
    setStatus('locating');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPosition(p);
        try {
          const r = await api<{ data: Store[] }>(`/stores/nearest?lat=${p.lat}&lng=${p.lng}&limit=3`);
          setNearest(r.data);
          setStatus('done');
        } catch (err) {
          setError(errorMessage(err));
          setStatus('error');
        }
      },
      (err) => {
        if (crashOnDenied) return;
        setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable');
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 0 },
    );
  };

  const onSearch = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const r = await api<{ data: Store[] }>(`/stores?q=${encodeURIComponent(q.trim())}`);
      setResults(r.data);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="stores-page">
      <h1>Find a store</h1>
      <section aria-labelledby="near-me-heading" className="panel">
        <h2 id="near-me-heading" className="h3">
          Stores near you
        </h2>
        <button type="button" onClick={locate} disabled={status === 'locating'} data-testid="store-locate-button">
          Find stores near me
        </button>
        {status === 'locating' && (
          <p role="status" className="muted" data-testid="store-finder-loading">
            <span className="spinner" aria-hidden="true" /> Finding your location…
          </p>
        )}
        {status === 'denied' && (
          <p className="alert info" role="alert" data-testid="store-finder-denied">
            Location access was denied. Search by town instead.
          </p>
        )}
        {status === 'unavailable' && (
          <p className="alert info" role="alert" data-testid="store-finder-unavailable">
            We couldn't get your location. Search by town instead.
          </p>
        )}
        {position && status === 'done' && (
          <p className="muted small" data-testid="store-finder-position">
            Your location: {position.lat.toFixed(4)}, {position.lng.toFixed(4)}
          </p>
        )}
        {status === 'done' && <StoreList stores={nearest} testId="nearest-stores" />}
      </section>

      <section aria-labelledby="search-stores-heading" className="panel">
        <h2 id="search-stores-heading" className="h3">
          Search by town
        </h2>
        <form role="search" className="inline-form" onSubmit={onSearch} aria-label="Search stores">
          <label htmlFor="store-search">Town or store name</label>
          <input id="store-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} data-testid="store-search-input" />
          <button type="submit" data-testid="store-search-button">
            Search
          </button>
        </form>
        {results && results.length === 0 && <p data-testid="store-search-empty">No stores match “{q}”.</p>}
        {results && results.length > 0 && <StoreList stores={results} testId="store-search-results" />}
      </section>
      {error && (
        <p className="alert error" role="alert" data-testid="store-finder-error">
          {error}
        </p>
      )}
    </div>
  );
}

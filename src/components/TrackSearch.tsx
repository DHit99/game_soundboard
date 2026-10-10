import { useEffect, useRef, useState } from 'react';
import { getTrack, parseTrackUri, searchTracks, toUserMessage, type TrackInfo } from '../spotify/api';
import { formatTime } from '../utils/time';

interface Props {
  onSelect: (track: TrackInfo) => void;
}

export default function TrackSearch({ onSelect }: Readonly<Props>) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TrackInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const q = query.trim();
    setError(null);

    const uri = parseTrackUri(q);
    if (uri) {
      // Pasted link/URI → resolve directly, no search request.
      setBusy(true);
      getTrack(uri)
        .then((t) => setResults([t]))
        .catch((e: unknown) => setError(toUserMessage(e)))
        .finally(() => setBusy(false));
      return;
    }
    if (q.length < 2) {
      setResults([]);
      setBusy(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    const timer = setTimeout(() => {
      setBusy(true);
      searchTracks(q, controller.signal)
        .then((r) => {
          if (!controller.signal.aborted) setResults(r);
        })
        .catch((e: unknown) => {
          if (controller.signal.aborted) return;
          setError(toUserMessage(e));
        })
        .finally(() => {
          if (!controller.signal.aborted) setBusy(false);
        });
    }, 400);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return (
    <div className="search">
      <input
        className="search__input"
        type="search"
        placeholder="Song suchen… (oder Spotify-Link einfügen)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
      />
      {busy && <p className="muted">Suche…</p>}
      {error && <p className="error">{error}</p>}
      <ul className="search__list">
        {results.map((t) => (
          <li key={t.uri}>
            <button className="result" onClick={() => onSelect(t)}>
              {t.image ? <img className="result__img" src={t.image} alt="" /> : <span className="result__img" />}
              <span className="result__text">
                <span className="result__title">{t.name}</span>
                <span className="muted">
                  {t.artists} · {t.album} · {formatTime(t.durationMs)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

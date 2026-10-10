import { useEffect, useState } from 'react';
import { clearSession, completeLoginIfCallback, getConfig, hasSession, startLogin } from './spotify/auth';
import { parseTrackUri, toUserMessage } from './spotify/api';
import { activatePlayer, getPlayer, initPlayer, queuePause, queuePlay, queueResume } from './spotify/player';
import { formatTime, parseTime } from './utils/time';

type AuthState = 'checking' | 'loggedOut' | 'loggedIn';
type PlayerStatus = 'off' | 'connecting' | 'ready' | 'not_ready' | 'error';

// Phase 1/2 test track – replace via the input with a song from your own playlist.
const DEFAULT_TEST_TRACK = 'spotify:track:4cOdK2wGLETKBW3PvgPWqT';

function readConfigError(): string | null {
  try {
    getConfig();
    return null;
  } catch (e) {
    return toUserMessage(e);
  }
}

export default function App() {
  const [configError] = useState(readConfigError);
  const [auth, setAuth] = useState<AuthState>('checking');
  const [playerStatus, setPlayerStatus] = useState<PlayerStatus>('off');
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [activated, setActivated] = useState(false);
  const [playback, setPlayback] = useState<Spotify.PlaybackState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsTap, setNeedsTap] = useState(false);
  const [trackInput, setTrackInput] = useState(DEFAULT_TEST_TRACK);
  const [startInput, setStartInput] = useState('00:42');

  useEffect(() => {
    if (configError) return;
    completeLoginIfCallback()
      .catch((e: unknown) => setError(toUserMessage(e)))
      .finally(() => setAuth(hasSession() ? 'loggedIn' : 'loggedOut'));
  }, [configError]);

  useEffect(() => {
    if (auth !== 'loggedIn') return;
    setPlayerStatus((s) => (s === 'ready' ? s : 'connecting'));
    initPlayer({
      onReady: (id) => {
        setDeviceId(id);
        setPlayerStatus('ready');
      },
      onNotReady: () => setPlayerStatus('not_ready'),
      onStateChanged: (s) => {
        setPlayback(s);
        if (s && !s.paused) setNeedsTap(false);
      },
      onAutoplayFailed: () => setNeedsTap(true),
      onError: (kind, msg) => {
        setError(msg);
        if (kind !== 'playback_error') setPlayerStatus('error');
      },
    }).catch((e: unknown) => {
      setError(toUserMessage(e));
      setPlayerStatus('error');
    });
  }, [auth]);

  const reportError = (e: unknown) => setError(toUserMessage(e));

  const onConnect = () => {
    setError(null);
    startLogin().catch(reportError);
  };

  const onActivate = () => {
    activatePlayer(); // synchronous inside the tap – required by iOS
    setActivated(true);
    setError(null);
  };

  const onPlayTest = () => {
    const uri = parseTrackUri(trackInput);
    if (!uri) return setError('Ungültiger Song. Füge einen Spotify-Track-Link oder eine spotify:track:… URI ein.');
    const positionMs = parseTime(startInput);
    if (positionMs === null) return setError('Startzeit bitte im Format MM:SS eingeben, z. B. 00:42.');
    if (playerStatus !== 'ready' || !deviceId) return setError('Spotify-Player ist noch nicht bereit.');
    if (!activated) onActivate();
    setError(null);
    queuePlay(deviceId, uri, positionMs, reportError);
  };

  const onPause = () => queuePause(reportError);

  const onResume = () => {
    if (needsTap) activatePlayer();
    queueResume(reportError);
  };

  const onRefreshState = () => {
    getPlayer()
      ?.getCurrentState()
      .then(setPlayback)
      .catch(reportError);
  };

  const onLogout = () => {
    clearSession();
    window.location.reload();
  };

  const track = playback?.track_window.current_track ?? null;
  const ready = playerStatus === 'ready' && !!deviceId;

  if (configError) {
    return (
      <main className="app">
        <p className="status status--bad">🔴 {configError}</p>
      </main>
    );
  }

  return (
    <main className="app">
      <header className="header">
        <h1>🏐 Volleyball Soundboard</h1>
        <StatusLine auth={auth} playerStatus={playerStatus} activated={activated} />
      </header>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {auth === 'loggedOut' && (
        <button className="btn btn--primary btn--huge" onClick={onConnect}>
          Mit Spotify verbinden
        </button>
      )}

      {auth === 'loggedIn' && (
        <>
          {!activated && (
            <button className="btn btn--primary btn--huge" onClick={onActivate} disabled={!ready}>
              {ready ? '🔊 Spotify aktivieren' : 'Spotify wird verbunden…'}
            </button>
          )}

          {needsTap && (
            <button className="btn btn--warn btn--huge" onClick={onResume}>
              ▶ Safari hat die Wiedergabe blockiert – hier tippen
            </button>
          )}

          <section className="card">
            <h2>Test (Phase 1/2)</h2>
            <label className="field">
              <span>Song (Spotify-Link oder URI)</span>
              <input
                value={trackInput}
                onChange={(e) => setTrackInput(e.target.value)}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </label>
            <label className="field field--short">
              <span>Startzeit (MM:SS)</span>
              <input
                value={startInput}
                onChange={(e) => setStartInput(e.target.value)}
                inputMode="numeric"
                pattern="\d{1,3}:[0-5]\d"
              />
            </label>
            <div className="row">
              <button className="btn btn--hype" onClick={onPlayTest} disabled={!ready}>
                🔥 TEST SONG
              </button>
              <button className="btn" onClick={onPause} disabled={!ready}>
                ⏸ Pause
              </button>
              <button className="btn" onClick={onResume} disabled={!ready}>
                ▶ Weiter
              </button>
            </div>
            {track && (
              <p className="now-playing">
                {playback?.paused ? '⏸' : '▶'} {track.name} – {track.artists.map((a) => a.name).join(', ')}
              </p>
            )}
          </section>
        </>
      )}

      <details className="debug">
        <summary>Debug</summary>
        <dl>
          <dt>Spotify authenticated</dt>
          <dd>{auth}</dd>
          <dt>Player status</dt>
          <dd>{playerStatus}</dd>
          <dt>Player activated</dt>
          <dd>{String(activated)}</dd>
          <dt>Device ID</dt>
          <dd className="mono">{deviceId ?? '–'}</dd>
          <dt>Current track</dt>
          <dd>{track ? `${track.name} (${track.uri})` : '–'}</dd>
          <dt>Position</dt>
          <dd>{playback ? `${formatTime(playback.position)} / ${formatTime(playback.duration)}` : '–'}</dd>
          <dt>Paused</dt>
          <dd>{playback ? String(playback.paused) : '–'}</dd>
          <dt>Autoplay blocked</dt>
          <dd>{String(needsTap)}</dd>
          <dt>Last error</dt>
          <dd>{error ?? '–'}</dd>
        </dl>
        <div className="row">
          <button className="btn btn--small" onClick={onRefreshState} disabled={!ready}>
            Status aktualisieren
          </button>
          {auth === 'loggedIn' && (
            <button className="btn btn--small" onClick={onLogout}>
              Spotify trennen
            </button>
          )}
        </div>
      </details>
    </main>
  );
}

function StatusLine(props: { auth: AuthState; playerStatus: PlayerStatus; activated: boolean }) {
  const { auth, playerStatus, activated } = props;
  if (auth === 'checking') return <p className="status status--pending">🟡 Prüfe Anmeldung…</p>;
  if (auth === 'loggedOut') return <p className="status status--bad">🔴 Spotify nicht verbunden</p>;
  switch (playerStatus) {
    case 'ready':
      return (
        <p className="status status--ok">
          🟢 Spotify Player bereit · {activated ? 'Soundboard bereit' : 'Spotify aktivieren'}
        </p>
      );
    case 'not_ready':
      return <p className="status status--pending">🟡 Verbindung unterbrochen – verbinde neu…</p>;
    case 'error':
      return <p className="status status--bad">🔴 Spotify-Player Fehler</p>;
    default:
      return <p className="status status--pending">🟡 Spotify wird verbunden…</p>;
  }
}

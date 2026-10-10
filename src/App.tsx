import { useEffect, useState } from 'react';
import Editor from './components/Editor';
import Soundboard from './components/Soundboard';
import { clearSession, completeLoginIfCallback, getConfig, hasSession, startLogin } from './spotify/auth';
import { toUserMessage } from './spotify/api';
import { activatePlayer, getPlayer, initPlayer, queuePause, queuePlay, queueResume } from './spotify/player';
import { loadConfig, saveConfig } from './storage/soundboardStorage';
import type { SoundButton, SoundboardConfig } from './types/soundboard';
import { formatTime } from './utils/time';

type AuthState = 'checking' | 'loggedOut' | 'loggedIn';
type PlayerStatus = 'off' | 'connecting' | 'ready' | 'not_ready' | 'error';

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
  const [board, setBoard] = useState<SoundboardConfig>(loadConfig);
  const [editing, setEditing] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => saveConfig(board), [board]);

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
        if (kind === 'authentication_error' && !hasSession()) setAuth('loggedOut');
      },
    }).catch((e: unknown) => {
      setError(toUserMessage(e));
      setPlayerStatus('error');
    });
  }, [auth]);

  const reportError = (e: unknown) => {
    setError(toUserMessage(e));
    // Session was cleared (invalid/expired refresh token) → show the login button again.
    if (!hasSession()) setAuth('loggedOut');
  };

  const onConnect = () => {
    setError(null);
    startLogin().catch(reportError);
  };

  const onActivate = () => {
    activatePlayer(); // synchronous inside the tap – required by iOS
    setActivated(true);
    setError(null);
  };

  const onPlayButton = (b: SoundButton) => {
    if (!b.spotifyUri) return setError(`„${b.name}“ hat noch keinen Song. Im ⚙️ Editor einstellen.`);
    if (playerStatus !== 'ready' || !deviceId) return setError('Spotify-Player ist noch nicht bereit.');
    if (!activated) onActivate();
    setError(null);
    setActiveId(b.id);
    queuePlay(deviceId, b.spotifyUri, b.startMs, reportError);
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
  const playing = !!playback && !playback.paused;
  const nowPlaying = track
    ? `${playing ? '▶' : '⏸'} ${track.name} – ${track.artists.map((a) => a.name).join(', ')}`
    : 'Kein Song aktiv';

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
        <div>
          <h1>🏐 Volleyball Soundboard</h1>
          <StatusLine auth={auth} playerStatus={playerStatus} activated={activated} />
        </div>
        {auth === 'loggedIn' && !editing && (
          <button className="btn btn--icon" aria-label="Buttons bearbeiten" onClick={() => setEditing(true)}>
            ⚙️
          </button>
        )}
      </header>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {auth === 'loggedOut' && (
        <>
          <button className="btn btn--primary btn--huge" onClick={onConnect}>
            Mit Spotify verbinden
          </button>
          <p className="muted">Verbinde jetzt deinen Bluetooth-Lautsprecher mit dem iPad.</p>
        </>
      )}

      {auth === 'loggedIn' && editing && (
        <Editor
          config={board}
          onChange={setBoard}
          onTest={onPlayButton}
          canTest={ready}
          onClose={() => setEditing(false)}
        />
      )}

      {auth === 'loggedIn' && !editing && (
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

          <Soundboard
            buttons={board.buttons}
            activeId={activeId}
            paused={!playing}
            disabled={!ready}
            onPlay={onPlayButton}
          />

          <div className="transport">
            <button className="btn btn--stop" onClick={playing ? onPause : onResume} disabled={!ready || !track}>
              {playing ? '⏹ STOP' : '▶ WEITER'}
            </button>
            <p className="now-playing">{nowPlaying}</p>
          </div>
        </>
      )}

      {!editing && (
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
      )}
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

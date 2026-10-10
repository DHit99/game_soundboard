// Spotify Web Playback SDK wrapper + a "last command wins" playback queue.
// Docs: https://developer.spotify.com/documentation/web-playback-sdk/reference
import { getAccessToken } from './auth';
import { playTrack, toUserMessage } from './api';

const SDK_URL = 'https://sdk.scdn.co/spotify-player.js';
export const PLAYER_NAME = 'Volleyball Soundboard';

export type PlayerErrorKind =
  | 'initialization_error'
  | 'authentication_error'
  | 'account_error'
  | 'playback_error';

export interface PlayerEvents {
  onReady: (deviceId: string) => void;
  onNotReady: (deviceId: string) => void;
  onStateChanged: (state: Spotify.PlaybackState | null) => void;
  onAutoplayFailed: () => void;
  onError: (kind: PlayerErrorKind, userMessage: string) => void;
}

const ERROR_TEXT: Record<PlayerErrorKind, string> = {
  initialization_error:
    'Dieser Browser kann den Spotify-Player nicht starten (DRM/EME nicht verfügbar). Nutze Safari ohne Privatmodus.',
  authentication_error: 'Spotify-Anmeldung für den Player fehlgeschlagen. Bitte neu verbinden.',
  account_error: 'Spotify Premium wird benötigt. Prüfe, ob du mit deinem Premium-Account angemeldet bist.',
  playback_error: 'Spotify konnte den Song nicht abspielen (evtl. in deinem Land nicht verfügbar).',
};

let sdkPromise: Promise<void> | null = null;

function loadSdk(): Promise<void> {
  sdkPromise ??= new Promise<void>((resolve, reject) => {
    if (window.Spotify) return resolve();
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.onerror = () => {
      sdkPromise = null;
      reject(new Error('Spotify-Player konnte nicht geladen werden. Prüfe die Internetverbindung.'));
    };
    document.body.appendChild(script);
  });
  return sdkPromise;
}

let player: Spotify.Player | null = null;

/** Creates and connects the singleton player (safe under React StrictMode double effects). */
export async function initPlayer(events: PlayerEvents): Promise<Spotify.Player> {
  if (player) return player;
  await loadSdk();
  if (player) return player;

  const p = new window.Spotify!.Player({
    name: PLAYER_NAME,
    volume: 1,
    getOAuthToken: (cb) => {
      getAccessToken()
        .then(cb)
        .catch((e: unknown) => events.onError('authentication_error', toUserMessage(e)));
    },
  });

  p.addListener('ready', ({ device_id }) => events.onReady(device_id));
  p.addListener('not_ready', ({ device_id }) => events.onNotReady(device_id));
  p.addListener('player_state_changed', (s) => events.onStateChanged(s));
  p.addListener('autoplay_failed', () => {
    console.error('Spotify SDK: autoplay_failed');
    events.onAutoplayFailed();
  });
  (Object.keys(ERROR_TEXT) as PlayerErrorKind[]).forEach((kind) => {
    p.addListener(kind, ({ message }) => {
      console.error(`Spotify SDK ${kind}:`, message);
      events.onError(kind, ERROR_TEXT[kind]);
    });
  });

  player = p;
  const ok = await p.connect();
  if (!ok) {
    console.error('Spotify SDK: connect() returned false');
    events.onError('initialization_error', 'Verbindung zum Spotify-Player fehlgeschlagen. Seite neu laden.');
  }
  return p;
}

export function getPlayer(): Spotify.Player | null {
  return player;
}

/**
 * Must be called synchronously inside a tap/click handler (iOS autoplay rules),
 * i.e. before any `await` in that handler.
 */
export function activatePlayer(): void {
  player?.activateElement().catch((e: unknown) => console.error('activateElement failed', e));
}

// --- Playback queue ---------------------------------------------------------
// At most one command is in flight. A new command replaces any command still waiting,
// so tapping A then B quickly can never end with A's position applied to B.

type Command = () => Promise<void>;
let pending: { run: Command; onError: (e: unknown) => void } | null = null;
let running = false;

function enqueue(run: Command, onError: (e: unknown) => void): void {
  pending = { run, onError };
  if (!running) void drain();
}

async function drain(): Promise<void> {
  running = true;
  while (pending) {
    const cmd = pending;
    pending = null;
    try {
      await cmd.run();
    } catch (e) {
      // Errors of a superseded command are irrelevant to the user.
      if (!pending) cmd.onError(e);
    }
  }
  running = false;
}

export function queuePlay(deviceId: string, uri: string, positionMs: number, onError: (e: unknown) => void): void {
  enqueue(() => playTrack(deviceId, uri, positionMs), onError);
}

export function queuePause(onError: (e: unknown) => void): void {
  enqueue(async () => {
    await player?.pause();
  }, onError);
}

export function queueResume(onError: (e: unknown) => void): void {
  enqueue(async () => {
    await player?.resume();
  }, onError);
}

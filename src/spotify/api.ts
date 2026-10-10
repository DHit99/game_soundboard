import { AuthError, getAccessToken } from './auth';

const API = 'https://api.spotify.com/v1';

export class SpotifyApiError extends Error {
  readonly status: number;
  constructor(status: number, userMessage: string) {
    super(userMessage);
    this.status = status;
  }
}

interface SpotifyErrorBody {
  error?: { status?: number; message?: string; reason?: string };
}

function userMessageFor(status: number, body: SpotifyErrorBody, retryAfter: string | null): string {
  const reason = body.error?.reason;
  const msg = body.error?.message?.toLowerCase() ?? '';
  switch (status) {
    case 400:
      if (msg.includes('uri')) return 'Die Spotify-Track-URI ist ungültig. Bitte den Song neu auswählen.';
      return 'Spotify hat die Anfrage nicht verstanden.';
    case 401:
      return 'Spotify-Anmeldung abgelaufen. Bitte neu verbinden.';
    case 403:
      if (reason === 'PREMIUM_REQUIRED')
        return 'Spotify hat die Wiedergabe abgelehnt. Prüfe, ob dein Spotify Premium-Account verwendet wird.';
      return 'Spotify hat die Wiedergabe abgelehnt. Prüfe Premium und ob dein Account in der Spotify-App unter „User Management“ eingetragen ist.';
    case 404:
      return 'Spotify-Player nicht gefunden. Tippe auf „Spotify aktivieren“ und versuche es erneut.';
    case 429:
      return `Zu viele Anfragen an Spotify. Bitte ${retryAfter ? `${retryAfter} Sekunden` : 'kurz'} warten.`;
    default:
      if (status >= 500) return 'Spotify ist gerade nicht erreichbar. Bitte gleich nochmal versuchen.';
      return 'Unerwarteter Fehler bei Spotify.';
  }
}

async function apiFetch(path: string, init: RequestInit, allowAuthRetry = true): Promise<Response> {
  const token = await getAccessToken();
  let res: Response;
  try {
    res = await fetch(API + path, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('Spotify API network error', path, e);
    throw new SpotifyApiError(0, 'Keine Verbindung zu Spotify. Prüfe WLAN/Mobilfunk.');
  }

  if (res.status === 401 && allowAuthRetry) {
    await getAccessToken(true);
    return apiFetch(path, init, false);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as SpotifyErrorBody;
    console.error('Spotify API error', res.status, path, body.error?.reason, body.error?.message);
    throw new SpotifyApiError(res.status, userMessageFor(res.status, body, res.headers.get('Retry-After')));
  }
  return res;
}

export async function transferPlayback(deviceId: string): Promise<void> {
  await apiFetch('/me/player', {
    method: 'PUT',
    body: JSON.stringify({ device_ids: [deviceId], play: false }),
  });
}

/**
 * Starts `uri` at `positionMs` on our SDK device in ONE request (uris + position_ms),
 * so no separate seek can race with a later track.
 */
export async function playTrack(deviceId: string, uri: string, positionMs: number): Promise<void> {
  const send = () =>
    apiFetch(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
      method: 'PUT',
      body: JSON.stringify({ uris: [uri], position_ms: Math.max(0, Math.round(positionMs)) }),
    });
  try {
    await send();
  } catch (e) {
    // Freshly connected SDK devices are sometimes unknown to the Connect backend until a transfer.
    if (e instanceof SpotifyApiError && e.status === 404) {
      await transferPlayback(deviceId);
      await send();
      return;
    }
    throw e;
  }
}

/** Accepts spotify:track:ID or https://open.spotify.com/(intl-xx/)track/ID?si=… */
export function parseTrackUri(input: string): string | null {
  const s = input.trim();
  const m =
    s.match(/^spotify:track:([A-Za-z0-9]{22})$/) ??
    s.match(/^https?:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?track\/([A-Za-z0-9]{22})(?:[/?#].*)?$/i);
  return m ? `spotify:track:${m[1]}` : null;
}

export function toUserMessage(e: unknown): string {
  if (e instanceof SpotifyApiError || e instanceof AuthError) return e.message;
  console.error('Unexpected error', e);
  return 'Unerwarteter Fehler. Details in der Konsole.';
}

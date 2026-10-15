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
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
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

async function startPlayback(deviceId: string, body: object): Promise<void> {
  const send = () =>
    apiFetch(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
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

/**
 * Starts `uri` at `positionMs` on our SDK device in ONE request (uris + position_ms),
 * so no separate seek can race with a later track.
 */
export async function playTrack(deviceId: string, uri: string, positionMs: number): Promise<void> {
  await startPlayback(deviceId, { uris: [uri], position_ms: Math.max(0, Math.round(positionMs)) });
}

/** Plays a playlist from track index `offset`, then applies the shuffle mode to that context. */
export async function playPlaylist(deviceId: string, uri: string, offset: number, shuffle: boolean): Promise<void> {
  await startPlayback(deviceId, { context_uri: uri, offset: { position: offset } });
  const q = new URLSearchParams({ state: String(shuffle), device_id: deviceId });
  await apiFetch(`/me/player/shuffle?${q}`, { method: 'PUT' });
}

export interface TrackInfo {
  uri: string;
  name: string;
  artists: string;
  album: string;
  image: string;
  durationMs: number;
}

interface ApiTrack {
  uri: string;
  name: string;
  duration_ms: number;
  artists: { name: string }[];
  album: { name: string; images: { url: string; width: number | null }[] };
}

function toTrackInfo(t: ApiTrack): TrackInfo {
  // Smallest image that is still sharp on a button (Spotify returns 640/300/64).
  const images = [...t.album.images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  const image = images.find((i) => (i.width ?? 0) >= 300) ?? images.at(-1);
  return {
    uri: t.uri,
    name: t.name,
    artists: t.artists.map((a) => a.name).join(', '),
    album: t.album.name,
    image: image?.url ?? '',
    durationMs: t.duration_ms,
  };
}

/** GET /search – no extra scope needed. Development Mode caps `limit` at 10. */
export async function searchTracks(query: string, signal?: AbortSignal): Promise<TrackInfo[]> {
  const q = new URLSearchParams({ q: query, type: 'track', limit: '10' });
  const res = await apiFetch(`/search?${q}`, { method: 'GET', signal });
  const json = (await res.json()) as { tracks?: { items?: ApiTrack[] } };
  return (json.tracks?.items ?? []).map(toTrackInfo);
}

/** GET /tracks/{id} – resolves a pasted link/URI to name, artist, cover, duration. */
export async function getTrack(uri: string): Promise<TrackInfo> {
  const id = uri.split(':')[2];
  const res = await apiFetch(`/tracks/${encodeURIComponent(id)}`, { method: 'GET' });
  return toTrackInfo((await res.json()) as ApiTrack);
}

/** Accepts spotify:track:ID or https://open.spotify.com/(intl-xx/)track/ID?si=… */
export function parseTrackUri(input: string): string | null {
  const s = input.trim();
  const m =
    s.match(/^spotify:track:([A-Za-z0-9]{22})$/) ??
    s.match(/^https?:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?track\/([A-Za-z0-9]{22})(?:[/?#].*)?$/i);
  return m ? `spotify:track:${m[1]}` : null;
}

export interface PlaylistInfo {
  uri: string;
  name: string;
  trackCount: number | null;
}

/**
 * GET /playlists/{id}. Since Feb 2026 `items` is only returned for the user's own playlists,
 * so trackCount may be null. Playlist images are not stored: their URLs expire within a day.
 */
export async function getPlaylist(uri: string): Promise<PlaylistInfo> {
  const id = uri.split(':')[2];
  const q = new URLSearchParams({ fields: 'uri,name,items(total)' });
  try {
    const res = await apiFetch(`/playlists/${encodeURIComponent(id)}?${q}`, { method: 'GET' });
    const json = (await res.json()) as { name?: string; items?: { total?: number } };
    return { uri, name: json.name ?? 'Playlist', trackCount: json.items?.total ?? null };
  } catch (e) {
    if (e instanceof SpotifyApiError && (e.status === 403 || e.status === 404)) {
      throw new SpotifyApiError(e.status, 'Playlist nicht gefunden oder für diese App nicht lesbar.');
    }
    throw e;
  }
}

/** Accepts spotify:playlist:ID or https://open.spotify.com/(intl-xx/)playlist/ID?si=… */
export function parsePlaylistUri(input: string): string | null {
  const s = input.trim();
  const m =
    s.match(/^spotify:playlist:([A-Za-z0-9]{22})$/) ??
    s.match(/^https?:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?playlist\/([A-Za-z0-9]{22})(?:[/?#].*)?$/i);
  return m ? `spotify:playlist:${m[1]}` : null;
}

export function toUserMessage(e: unknown): string {
  if (e instanceof SpotifyApiError || e instanceof AuthError) return e.message;
  console.error('Unexpected error', e);
  return 'Unerwarteter Fehler. Details in der Konsole.';
}

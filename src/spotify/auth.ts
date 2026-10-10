// Spotify OAuth 2.0 Authorization Code with PKCE – no backend, no client secret.
// Docs: https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow

const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

// streaming + user-read-email + user-read-private: required by the Web Playback SDK (Spotify how-to).
// user-modify-playback-state: PUT /me/player/play (start track at position_ms).
export const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-modify-playback-state',
];

const K_VERIFIER = 'vsb.pkce_verifier';
const K_STATE = 'vsb.pkce_state';
const K_REFRESH = 'vsb.refresh_token';

export class AuthError extends Error {
  readonly reloginRequired: boolean;
  constructor(message: string, reloginRequired = false) {
    super(message);
    this.reloginRequired = reloginRequired;
  }
}

export function getConfig(): { clientId: string; redirectUri: string } {
  const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID?.trim();
  const redirectUri = import.meta.env.VITE_SPOTIFY_REDIRECT_URI?.trim();
  if (!clientId || !redirectUri) {
    throw new AuthError(
      'Konfiguration fehlt: VITE_SPOTIFY_CLIENT_ID und VITE_SPOTIFY_REDIRECT_URI müssen gesetzt sein (siehe README).',
    );
  }
  return { clientId, redirectUri };
}

// 64-char alphabet => byte & 63 has no modulo bias. All chars are valid for code_verifier.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function randomString(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (const b of bytes) out += ALPHABET[b & 63];
  return out;
}

async function codeChallengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export async function startLogin(): Promise<void> {
  const { clientId, redirectUri } = getConfig();
  const verifier = randomString(64);
  const state = randomString(32);
  // localStorage (not sessionStorage): survives if iOS returns from Spotify in a different tab.
  localStorage.setItem(K_VERIFIER, verifier);
  localStorage.setItem(K_STATE, state);

  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SCOPES.join(' '),
    redirect_uri: redirectUri,
    state,
    code_challenge_method: 'S256',
    code_challenge: await codeChallengeFor(verifier),
  }).toString();
  window.location.assign(url.toString());
}

let accessToken: string | null = null;
let expiresAt = 0;
let refreshPromise: Promise<string> | null = null;

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

async function tokenRequest(body: URLSearchParams): Promise<string> {
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch (e) {
    console.error('Token request network error', e);
    throw new AuthError('Keine Verbindung zu Spotify. Prüfe die Internetverbindung.');
  }

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string; error_description?: string };
    console.error('Token request failed', res.status, err.error, err.error_description);
    if (err.error === 'invalid_grant' || err.error === 'invalid_client') {
      clearSession();
      throw new AuthError('Spotify-Anmeldung ist abgelaufen oder ungültig. Bitte neu verbinden.', true);
    }
    throw new AuthError('Spotify-Anmeldung fehlgeschlagen. Bitte erneut versuchen.');
  }

  const json = (await res.json()) as TokenResponse;
  accessToken = json.access_token;
  expiresAt = Date.now() + json.expires_in * 1000;
  // Refresh tokens may rotate; keep the old one if none is returned.
  if (json.refresh_token) localStorage.setItem(K_REFRESH, json.refresh_token);
  return json.access_token;
}

let callbackPromise: Promise<boolean> | null = null;

/** Returns true if this page load was the OAuth callback and login succeeded. Idempotent. */
export function completeLoginIfCallback(): Promise<boolean> {
  callbackPromise ??= handleCallback();
  return callbackPromise;
}

async function handleCallback(): Promise<boolean> {
  const { clientId, redirectUri } = getConfig();
  if (window.location.pathname !== new URL(redirectUri).pathname) return false;

  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const error = params.get('error');
  const returnedState = params.get('state');
  const expectedState = localStorage.getItem(K_STATE);
  const verifier = localStorage.getItem(K_VERIFIER);

  // Remove code/state from the address bar and history right away.
  window.history.replaceState(null, '', '/');
  localStorage.removeItem(K_STATE);
  localStorage.removeItem(K_VERIFIER);

  if (error) {
    console.error('Spotify authorize error', error);
    throw new AuthError(
      error === 'access_denied'
        ? 'Spotify-Zugriff wurde abgelehnt. Bitte erneut verbinden und zustimmen.'
        : 'Spotify-Anmeldung fehlgeschlagen. Bitte erneut versuchen.',
    );
  }
  if (!code) return false;
  if (!returnedState || !expectedState || returnedState !== expectedState || !verifier) {
    console.error('OAuth state mismatch or missing verifier');
    throw new AuthError('Anmeldung konnte nicht überprüft werden (state). Bitte erneut verbinden.');
  }

  await tokenRequest(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: verifier,
    }),
  );
  return true;
}

export function hasSession(): boolean {
  return accessToken !== null || localStorage.getItem(K_REFRESH) !== null;
}

/** Valid access token; refreshes transparently. Concurrent callers share one refresh. */
export async function getAccessToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && accessToken && Date.now() < expiresAt - 60_000) return accessToken;
  refreshPromise ??= refresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function refresh(): Promise<string> {
  const refreshToken = localStorage.getItem(K_REFRESH);
  if (!refreshToken) throw new AuthError('Nicht mit Spotify verbunden.', true);
  const { clientId } = getConfig();
  return tokenRequest(
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    }),
  );
}

export function clearSession(): void {
  accessToken = null;
  expiresAt = 0;
  localStorage.removeItem(K_REFRESH);
}

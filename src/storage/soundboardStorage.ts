import type { PlaylistRef, SoundButton, SoundTab, SoundboardConfig, Track } from '../types/soundboard';

const K_CONFIG = 'vsb.soundboard';

export const MAX_TABS = 8;
export const MAX_BUTTONS = 24;
export const MAX_TRACKS = 20;

const TRACK_URI = /^spotify:track:[A-Za-z0-9]{22}$/;
const PLAYLIST_URI = /^spotify:playlist:[A-Za-z0-9]{22}$/;

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export const blankButton = (id: string, name: string, emoji: string, color: string): SoundButton => ({
  id,
  name,
  emoji,
  color,
  mode: 'tracks',
  tracks: [],
  playlist: null,
});

export function isConfigured(b: SoundButton): boolean {
  return b.mode === 'playlist' ? b.playlist !== null : b.tracks.length > 0;
}

export function defaultConfig(): SoundboardConfig {
  return {
    version: 2,
    tabs: [
      {
        id: 'main',
        name: 'Soundboard',
        buttons: [
          blankButton('hype', 'Hype', '🔥', '#ff6b35'),
          blankButton('punkt', 'Punkt', '🎉', '#1ed760'),
          blankButton('letsgo', "Let's Go", '💥', '#ffd60a'),
          blankButton('einlauf', 'Einlauf', '🚀', '#4cc9f0'),
          blankButton('applaus', 'Applaus', '👏', '#b5179e'),
          blankButton('fun', 'Fun', '😂', '#f72585'),
        ],
      },
    ],
  };
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';

function sanitizeTrack(t: Record<string, unknown>): Track | null {
  if (!isStr(t.uri) || !TRACK_URI.test(t.uri)) return null;
  return {
    uri: t.uri,
    name: isStr(t.name) ? t.name.slice(0, 200) : '',
    artists: isStr(t.artists) ? t.artists.slice(0, 200) : '',
    image: isStr(t.image) && t.image.startsWith('https://i.scdn.co/') ? t.image : '',
    durationMs: isNum(t.durationMs) && t.durationMs > 0 ? Math.round(t.durationMs) : null,
    startMs: isNum(t.startMs) && t.startMs >= 0 ? Math.round(t.startMs) : 0,
    endMs: isNum(t.endMs) && t.endMs > 0 ? Math.round(t.endMs) : null,
  };
}

/** Version 1 stored a single song directly on the button. */
function legacyTrack(b: Record<string, unknown>): Record<string, unknown> {
  return {
    uri: b.spotifyUri,
    name: b.trackName,
    artists: b.artistName,
    image: b.albumImage,
    durationMs: b.durationMs,
    startMs: b.startMs,
    endMs: b.endMs,
  };
}

function sanitizePlaylist(p: unknown): PlaylistRef | null {
  if (!isObj(p) || !isStr(p.uri) || !PLAYLIST_URI.test(p.uri)) return null;
  return {
    uri: p.uri,
    name: isStr(p.name) ? p.name.slice(0, 200) : 'Playlist',
    trackCount: isNum(p.trackCount) && p.trackCount > 0 ? Math.round(p.trackCount) : null,
    shuffle: p.shuffle !== false,
  };
}

function sanitizeButton(raw: unknown, index: number): SoundButton | null {
  if (!isObj(raw)) return null;
  const b = raw;
  if (!isStr(b.name)) return null;
  const rawTracks = Array.isArray(b.tracks) ? b.tracks : [legacyTrack(b)];
  const tracks: Track[] = [];
  for (const t of rawTracks) {
    const track = isObj(t) ? sanitizeTrack(t) : null;
    if (track && !tracks.some((x) => x.uri === track.uri)) tracks.push(track);
  }
  return {
    id: isStr(b.id) && b.id ? b.id.slice(0, 64) : `btn-${index}-${Date.now()}`,
    name: b.name.slice(0, 40),
    emoji: isStr(b.emoji) ? b.emoji.slice(0, 8) : '🎵',
    color: isStr(b.color) && /^#[0-9a-fA-F]{6}$/.test(b.color) ? b.color : '#2b3445',
    mode: b.mode === 'playlist' ? 'playlist' : 'tracks',
    tracks: tracks.slice(0, MAX_TRACKS),
    playlist: sanitizePlaylist(b.playlist),
  };
}

function sanitizeTab(raw: unknown, index: number): SoundTab | null {
  if (!isObj(raw) || !Array.isArray(raw.buttons)) return null;
  const buttons = raw.buttons
    .map((b, i) => sanitizeButton(b, i))
    .filter((b): b is SoundButton => b !== null)
    .slice(0, MAX_BUTTONS);
  if (buttons.length === 0) return null;
  return {
    id: isStr(raw.id) && raw.id ? raw.id.slice(0, 64) : `tab-${index}-${Date.now()}`,
    name: isStr(raw.name) && raw.name.trim() ? raw.name.slice(0, 30) : `Tab ${index + 1}`,
    buttons,
  };
}

/** Validates untrusted JSON (localStorage or imported file), migrating version 1. Throws a user-readable Error. */
export function parseConfig(raw: unknown): SoundboardConfig {
  if (!isObj(raw) || !(Array.isArray(raw.tabs) || Array.isArray(raw.buttons))) {
    throw new Error('Die Datei ist kein gültiges Soundboard (erwartet { "tabs": [...] }).');
  }
  const rawTabs = Array.isArray(raw.tabs) ? raw.tabs : [{ id: 'main', name: 'Soundboard', buttons: raw.buttons }];
  const tabs = rawTabs
    .map((t, i) => sanitizeTab(t, i))
    .filter((t): t is SoundTab => t !== null)
    .slice(0, MAX_TABS);
  if (tabs.length === 0) throw new Error('Das Soundboard enthält keine gültigen Buttons.');
  return { version: 2, tabs };
}

export function loadConfig(): SoundboardConfig {
  try {
    const raw = localStorage.getItem(K_CONFIG);
    if (!raw) return defaultConfig();
    return parseConfig(JSON.parse(raw));
  } catch (e) {
    console.error('Soundboard config unreadable, using defaults', e);
    return defaultConfig();
  }
}

export function saveConfig(config: SoundboardConfig): void {
  localStorage.setItem(K_CONFIG, JSON.stringify(config));
}

export function exportConfig(config: SoundboardConfig): void {
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'soundboard.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function importConfigFile(file: File): Promise<SoundboardConfig> {
  if (file.size > 1_000_000) throw new Error('Die Datei ist zu groß (max. 1 MB).');
  let json: unknown;
  try {
    json = JSON.parse(await file.text());
  } catch {
    throw new Error('Die Datei enthält kein gültiges JSON.');
  }
  return parseConfig(json);
}

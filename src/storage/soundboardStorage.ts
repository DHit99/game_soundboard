import type { SoundButton, SoundboardConfig } from '../types/soundboard';

const K_CONFIG = 'vsb.soundboard';

const blank = (id: string, name: string, emoji: string, color: string): SoundButton => ({
  id,
  name,
  emoji,
  color,
  spotifyUri: null,
  trackName: '',
  artistName: '',
  albumImage: '',
  durationMs: null,
  startMs: 0,
  endMs: null,
});

export function defaultConfig(): SoundboardConfig {
  return {
    version: 1,
    buttons: [
      blank('hype', 'Hype', '🔥', '#ff6b35'),
      blank('punkt', 'Punkt', '🎉', '#1ed760'),
      blank('letsgo', "Let's Go", '💥', '#ffd60a'),
      blank('einlauf', 'Einlauf', '🚀', '#4cc9f0'),
      blank('applaus', 'Applaus', '👏', '#b5179e'),
      blank('fun', 'Fun', '😂', '#f72585'),
    ],
  };
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function sanitizeButton(raw: unknown, index: number): SoundButton | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  if (!isStr(b.name)) return null;
  const uri = isStr(b.spotifyUri) && /^spotify:track:[A-Za-z0-9]{22}$/.test(b.spotifyUri) ? b.spotifyUri : null;
  const image = isStr(b.albumImage) && b.albumImage.startsWith('https://i.scdn.co/') ? b.albumImage : '';
  return {
    id: isStr(b.id) && b.id ? b.id : `btn-${index}-${Date.now()}`,
    name: b.name.slice(0, 40),
    emoji: isStr(b.emoji) ? b.emoji.slice(0, 8) : '🎵',
    color: isStr(b.color) && /^#[0-9a-fA-F]{6}$/.test(b.color) ? b.color : '#2b3445',
    spotifyUri: uri,
    trackName: isStr(b.trackName) ? b.trackName.slice(0, 200) : '',
    artistName: isStr(b.artistName) ? b.artistName.slice(0, 200) : '',
    albumImage: image,
    durationMs: isNum(b.durationMs) && b.durationMs > 0 ? Math.round(b.durationMs) : null,
    startMs: isNum(b.startMs) && b.startMs >= 0 ? Math.round(b.startMs) : 0,
    endMs: isNum(b.endMs) && b.endMs > 0 ? Math.round(b.endMs) : null,
  };
}

/** Validates untrusted JSON (localStorage or imported file). Throws a user-readable Error. */
export function parseConfig(raw: unknown): SoundboardConfig {
  const obj = raw as { buttons?: unknown } | null;
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.buttons)) {
    throw new Error('Die Datei ist kein gültiges Soundboard (erwartet { "buttons": [...] }).');
  }
  const buttons = obj.buttons
    .map((raw, i) => sanitizeButton(raw, i))
    .filter((b): b is SoundButton => b !== null)
    .slice(0, 24);
  if (buttons.length === 0) throw new Error('Das Soundboard enthält keine gültigen Buttons.');
  return { version: 1, buttons };
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

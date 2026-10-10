export interface SoundButton {
  id: string;
  name: string;
  emoji: string;
  color: string;
  /** null = not configured yet */
  spotifyUri: string | null;
  trackName: string;
  artistName: string;
  albumImage: string;
  /** null = unknown (e.g. URI entered manually) */
  durationMs: number | null;
  startMs: number;
  /** Reserved for version 2 – not used yet. */
  endMs: number | null;
}

export interface SoundboardConfig {
  version: 1;
  buttons: SoundButton[];
}

export interface Track {
  uri: string;
  name: string;
  artists: string;
  image: string;
  /** null = unknown (e.g. URI entered manually) */
  durationMs: number | null;
  startMs: number;
  /** Reserved – not used yet. */
  endMs: number | null;
}

export interface PlaylistRef {
  uri: string;
  name: string;
  /** null = Spotify did not reveal the size (playlist not owned by the user) */
  trackCount: number | null;
  shuffle: boolean;
}

export type ButtonMode = 'tracks' | 'playlist';

export interface SoundButton {
  id: string;
  name: string;
  emoji: string;
  color: string;
  mode: ButtonMode;
  /** Rotated randomly on each tap when more than one. */
  tracks: Track[];
  playlist: PlaylistRef | null;
}

export interface SoundTab {
  id: string;
  name: string;
  buttons: SoundButton[];
}

export interface SoundboardConfig {
  version: 2;
  tabs: SoundTab[];
}

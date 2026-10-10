/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SPOTIFY_CLIENT_ID?: string;
  readonly VITE_SPOTIFY_REDIRECT_URI?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Minimal typings for https://sdk.scdn.co/spotify-player.js (only what we use).
declare namespace Spotify {
  interface Error {
    message: string;
  }

  interface Track {
    uri: string;
    id: string | null;
    name: string;
    duration_ms: number;
    album: { name: string; images: { url: string }[] };
    artists: { name: string; uri: string }[];
  }

  interface PlaybackState {
    paused: boolean;
    position: number;
    duration: number;
    track_window: { current_track: Track | null };
  }

  interface PlayerInit {
    name: string;
    getOAuthToken: (cb: (token: string) => void) => void;
    volume?: number;
    enableMediaSession?: boolean;
  }

  interface ReadyEvent {
    device_id: string;
  }

  class Player {
    constructor(options: PlayerInit);
    connect(): Promise<boolean>;
    disconnect(): void;
    activateElement(): Promise<void>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    togglePlay(): Promise<void>;
    getCurrentState(): Promise<PlaybackState | null>;
    addListener(event: 'ready' | 'not_ready', cb: (e: ReadyEvent) => void): boolean;
    addListener(event: 'player_state_changed', cb: (state: PlaybackState | null) => void): boolean;
    addListener(event: 'autoplay_failed', cb: () => void): boolean;
    addListener(
      event: 'initialization_error' | 'authentication_error' | 'account_error' | 'playback_error',
      cb: (e: Error) => void,
    ): boolean;
  }
}

interface Window {
  onSpotifyWebPlaybackSDKReady?: () => void;
  Spotify?: typeof Spotify;
}

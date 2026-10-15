import { useRef, useState } from 'react';
import { getPlaylist, parsePlaylistUri, toUserMessage, type TrackInfo } from '../spotify/api';
import {
  blankButton,
  defaultConfig,
  exportConfig,
  importConfigFile,
  isConfigured,
  MAX_BUTTONS,
  MAX_TABS,
  MAX_TRACKS,
  newId,
} from '../storage/soundboardStorage';
import type { PlaylistRef, SoundButton, SoundTab, SoundboardConfig, Track } from '../types/soundboard';
import { formatTime, parseTime } from '../utils/time';
import { TabBar } from './Soundboard';
import TrackSearch from './TrackSearch';

const COLORS = ['#ff6b35', '#1ed760', '#ffd60a', '#4cc9f0', '#b5179e', '#f72585', '#ff4d4f', '#8d99ae'];
const EMOJIS = ['🔥', '🎉', '💥', '🚀', '👏', '😂', '🏐', '⚡', '🎺', '🥁', '💪', '🎯', '👑', '🤡', '😱', '🫡'];
const PLAYER_TEMPLATE_SIZE = 6;

interface Props {
  config: SoundboardConfig;
  onChange: (config: SoundboardConfig) => void;
  tabId: string;
  onSelectTab: (id: string) => void;
  onTest: (button: SoundButton, track?: Track) => void;
  canTest: boolean;
  onClose: () => void;
}

export default function Editor({ config, onChange, tabId, onSelectTab, onTest, canTest, onClose }: Readonly<Props>) {
  const tab = config.tabs.find((t) => t.id === tabId) ?? config.tabs[0];
  const [selectedId, setSelectedId] = useState<string | null>(tab.buttons[0]?.id ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const selected = tab.buttons.find((b) => b.id === selectedId) ?? tab.buttons[0] ?? null;

  const setTabs = (tabs: SoundTab[]) => onChange({ ...config, tabs });
  const updateTab = (patch: Partial<SoundTab>) =>
    setTabs(config.tabs.map((t) => (t.id === tab.id ? { ...t, ...patch } : t)));
  const setButtons = (buttons: SoundButton[]) => updateTab({ buttons });

  const update = (patch: Partial<SoundButton>) => {
    if (!selected) return;
    setButtons(tab.buttons.map((b) => (b.id === selected.id ? { ...b, ...patch } : b)));
  };

  const selectTab = (id: string) => {
    onSelectTab(id);
    setSelectedId(null);
  };

  const addTab = (players: boolean) => {
    if (config.tabs.length >= MAX_TABS) return;
    const buttons = players
      ? Array.from({ length: PLAYER_TEMPLATE_SIZE }, (_, i) =>
          blankButton(newId('btn'), `Spielerin ${i + 1}`, '🏐', COLORS[i % COLORS.length]),
        )
      : [blankButton(newId('btn'), 'Neu', '🎵', COLORS[0])];
    const t: SoundTab = { id: newId('tab'), name: players ? 'Spielerinnen' : 'Neuer Tab', buttons };
    setTabs([...config.tabs, t]);
    selectTab(t.id);
  };

  const removeTab = () => {
    if (config.tabs.length <= 1) return;
    if (!window.confirm(`Tab „${tab.name}“ mit ${tab.buttons.length} Buttons löschen?`)) return;
    const rest = config.tabs.filter((t) => t.id !== tab.id);
    setTabs(rest);
    selectTab(rest[0].id);
  };

  const moveTab = (dir: -1 | 1) => {
    const i = config.tabs.indexOf(tab);
    const j = i + dir;
    if (j < 0 || j >= config.tabs.length) return;
    const next = [...config.tabs];
    [next[i], next[j]] = [next[j], next[i]];
    setTabs(next);
  };

  const addButton = () => {
    if (tab.buttons.length >= MAX_BUTTONS) return;
    const b = blankButton(newId('btn'), 'Neu', '🎵', COLORS[tab.buttons.length % COLORS.length]);
    setButtons([...tab.buttons, b]);
    setSelectedId(b.id);
  };

  const removeButton = () => {
    if (!selected || tab.buttons.length <= 1) return;
    if (!window.confirm(`Button „${selected.name}“ löschen?`)) return;
    const rest = tab.buttons.filter((b) => b.id !== selected.id);
    setButtons(rest);
    setSelectedId(rest[0]?.id ?? null);
  };

  const move = (dir: -1 | 1) => {
    if (!selected) return;
    const i = tab.buttons.indexOf(selected);
    const j = i + dir;
    if (j < 0 || j >= tab.buttons.length) return;
    const next = [...tab.buttons];
    [next[i], next[j]] = [next[j], next[i]];
    setButtons(next);
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const imported = await importConfigFile(file);
      onChange(imported);
      selectTab(imported.tabs[0].id);
      const buttons = imported.tabs.reduce((n, t) => n + t.buttons.length, 0);
      setMessage(`${imported.tabs.length} Tabs mit ${buttons} Buttons importiert.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Import fehlgeschlagen.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onReset = () => {
    if (!window.confirm('Soundboard auf die 6 Standard-Buttons zurücksetzen? Alle Tabs und Songs gehen verloren.')) return;
    const d = defaultConfig();
    onChange(d);
    selectTab(d.tabs[0].id);
    setMessage('Zurückgesetzt.');
  };

  return (
    <section className="editor">
      <div className="editor__bar">
        <h2>⚙️ Buttons bearbeiten</h2>
        <button className="btn btn--primary" onClick={onClose}>
          ✓ Fertig
        </button>
      </div>

      <div className="editor__tabs">
        <TabBar tabs={config.tabs} tabId={tab.id} onSelect={selectTab} />
        <div className="row">
          <button className="btn btn--small" onClick={() => addTab(false)} disabled={config.tabs.length >= MAX_TABS}>
            + Tab
          </button>
          <button className="btn btn--small" onClick={() => addTab(true)} disabled={config.tabs.length >= MAX_TABS}>
            + Spielerinnen-Tab
          </button>
        </div>
        <div className="row row--center">
          <label className="field field--grow">
            <span>Tab-Name</span>
            <input value={tab.name} maxLength={30} onChange={(e) => updateTab({ name: e.target.value })} />
          </label>
          <button className="btn btn--small" onClick={() => moveTab(-1)} aria-label="Tab nach links">
            ←
          </button>
          <button className="btn btn--small" onClick={() => moveTab(1)} aria-label="Tab nach rechts">
            →
          </button>
          <button className="btn btn--small btn--danger" onClick={removeTab} disabled={config.tabs.length <= 1}>
            🗑 Tab löschen
          </button>
        </div>
      </div>

      <div className="editor__layout">
        <aside className="editor__list">
          {tab.buttons.map((b) => (
            <button
              key={b.id}
              className={`chip${b.id === selected?.id ? ' chip--active' : ''}`}
              style={{ '--pad': b.color } as React.CSSProperties}
              onClick={() => setSelectedId(b.id)}
            >
              <span>{b.emoji}</span> {b.name}
              {isConfigured(b) ? '' : ' ·  ⚠︎'}
            </button>
          ))}
          <button className="btn btn--small" onClick={addButton} disabled={tab.buttons.length >= MAX_BUTTONS}>
            + Button
          </button>

          <div className="editor__tools">
            <button className="btn btn--small" onClick={() => exportConfig(config)}>
              ⬇ Export JSON
            </button>
            <button className="btn btn--small" onClick={() => fileRef.current?.click()}>
              ⬆ Import JSON
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => void onImport(e.target.files?.[0])}
            />
            <button className="btn btn--small btn--danger" onClick={onReset}>
              Reset
            </button>
            {message && <p className="muted">{message}</p>}
          </div>
        </aside>

        {selected && (
          <ButtonForm
            key={selected.id}
            button={selected}
            canDelete={tab.buttons.length > 1}
            canTest={canTest}
            onUpdate={update}
            onDelete={removeButton}
            onMove={move}
            onTest={(track) => onTest(selected, track)}
          />
        )}
      </div>
    </section>
  );
}

interface FormProps {
  button: SoundButton;
  canDelete: boolean;
  canTest: boolean;
  onUpdate: (patch: Partial<SoundButton>) => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
  onTest: (track?: Track) => void;
}

function ButtonForm({ button, canDelete, canTest, onUpdate, onDelete, onMove, onTest }: Readonly<FormProps>) {
  const [trackMessage, setTrackMessage] = useState<string | null>(null);

  const updateTrack = (uri: string, patch: Partial<Track>) =>
    onUpdate({ tracks: button.tracks.map((t) => (t.uri === uri ? { ...t, ...patch } : t)) });

  const onAddTrack = (t: TrackInfo) => {
    if (button.tracks.some((x) => x.uri === t.uri)) return setTrackMessage(`„${t.name}“ ist schon drin.`);
    if (button.tracks.length >= MAX_TRACKS) return setTrackMessage(`Maximal ${MAX_TRACKS} Songs pro Button.`);
    const track: Track = {
      uri: t.uri,
      name: t.name,
      artists: t.artists,
      image: t.image,
      durationMs: t.durationMs,
      startMs: 0,
      endMs: null,
    };
    onUpdate({ tracks: [...button.tracks, track] });
    setTrackMessage(`„${t.name}“ hinzugefügt.`);
  };

  return (
    <div className="editor__form">
      <div className="row">
        <label className="field field--grow">
          <span>Name</span>
          <input value={button.name} maxLength={40} onChange={(e) => onUpdate({ name: e.target.value })} />
        </label>
        <label className="field field--short">
          <span>Emoji</span>
          <input value={button.emoji} maxLength={8} onChange={(e) => onUpdate({ emoji: e.target.value })} />
        </label>
      </div>
      <div className="swatches">
        {EMOJIS.map((e) => (
          <button key={e} className="swatch" onClick={() => onUpdate({ emoji: e })}>
            {e}
          </button>
        ))}
      </div>
      <div className="swatches">
        {COLORS.map((c) => (
          <button
            key={c}
            className={`swatch swatch--color${button.color === c ? ' swatch--active' : ''}`}
            style={{ background: c }}
            aria-label={c}
            onClick={() => onUpdate({ color: c })}
          />
        ))}
      </div>

      <div className="row">
        <button
          className={`btn btn--small${button.mode === 'tracks' ? ' btn--primary' : ''}`}
          aria-pressed={button.mode === 'tracks'}
          onClick={() => onUpdate({ mode: 'tracks' })}
        >
          🎵 Songs
        </button>
        <button
          className={`btn btn--small${button.mode === 'playlist' ? ' btn--primary' : ''}`}
          aria-pressed={button.mode === 'playlist'}
          onClick={() => onUpdate({ mode: 'playlist' })}
        >
          📃 Playlist
        </button>
      </div>

      {button.mode === 'tracks' ? (
        <>
          <h3>
            Songs ({button.tracks.length}/{MAX_TRACKS})
          </h3>
          {button.tracks.length === 0 && <p className="muted">Noch kein Song gewählt.</p>}
          {button.tracks.length > 1 && (
            <p className="muted">🔀 Bei jedem Tippen kommt zufällig ein anderer Song – erst wenn alle dran waren, wiederholt sich einer.</p>
          )}
          {button.tracks.map((t) => (
            <TrackRow
              key={t.uri}
              track={t}
              canTest={canTest}
              onUpdate={(patch) => updateTrack(t.uri, patch)}
              onRemove={() => onUpdate({ tracks: button.tracks.filter((x) => x.uri !== t.uri) })}
              onTest={() => onTest(t)}
            />
          ))}
          <h3>Song hinzufügen</h3>
          {trackMessage && <p className="muted">{trackMessage}</p>}
          <TrackSearch onSelect={onAddTrack} />
          <p className="muted">Endzeit wird in Version 2 ergänzt.</p>
        </>
      ) : (
        <PlaylistPicker
          playlist={button.playlist}
          canTest={canTest}
          onChange={(playlist) => onUpdate({ playlist })}
          onTest={() => onTest()}
        />
      )}

      <div className="row editor__actions">
        <button className="btn btn--small" onClick={() => onMove(-1)}>
          ← Nach vorne
        </button>
        <button className="btn btn--small" onClick={() => onMove(1)}>
          Nach hinten →
        </button>
        <button className="btn btn--small btn--danger" onClick={onDelete} disabled={!canDelete}>
          🗑 Löschen
        </button>
      </div>
    </div>
  );
}

interface TrackRowProps {
  track: Track;
  canTest: boolean;
  onUpdate: (patch: Partial<Track>) => void;
  onRemove: () => void;
  onTest: () => void;
}

function TrackRow({ track, canTest, onUpdate, onRemove, onTest }: Readonly<TrackRowProps>) {
  const [startText, setStartText] = useState(formatTime(track.startMs));
  const [startError, setStartError] = useState<string | null>(null);

  const onStartChange = (text: string) => {
    setStartText(text);
    const ms = parseTime(text);
    if (ms === null) return setStartError('Format MM:SS, z. B. 00:42');
    if (track.durationMs !== null && ms >= track.durationMs) {
      return setStartError(`Song ist nur ${formatTime(track.durationMs)} lang`);
    }
    setStartError(null);
    onUpdate({ startMs: ms });
  };

  return (
    <div className="track-row">
      <div className="track">
        {track.image ? <img className="track__img" src={track.image} alt="" /> : <span className="track__img" />}
        <div className="track__text">
          <strong>{track.name}</strong>
          <span className="muted">
            {track.artists}
            {track.durationMs !== null ? ` · ${formatTime(track.durationMs)}` : ''}
          </span>
        </div>
      </div>
      <div className="row row--center">
        <label className="field field--short">
          <span>Start MM:SS</span>
          <input
            value={startText}
            onChange={(e) => onStartChange(e.target.value)}
            inputMode="numeric"
            placeholder="00:42"
            aria-invalid={startError !== null}
          />
        </label>
        <button className="btn btn--small" onClick={onTest} disabled={!canTest || startError !== null}>
          ▶ Test
        </button>
        <button className="btn btn--small btn--danger" onClick={onRemove} aria-label={`${track.name} entfernen`}>
          ✕
        </button>
      </div>
      {startError && <p className="error">{startError}</p>}
    </div>
  );
}

interface PlaylistPickerProps {
  playlist: PlaylistRef | null;
  canTest: boolean;
  onChange: (playlist: PlaylistRef) => void;
  onTest: () => void;
}

function PlaylistPicker({ playlist, canTest, onChange, onTest }: Readonly<PlaylistPickerProps>) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const onApply = async () => {
    const uri = parsePlaylistUri(input);
    if (!uri) return setError('Bitte einen Spotify-Playlist-Link einfügen (Teilen → Link kopieren).');
    const shuffle = playlist?.shuffle ?? true;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const info = await getPlaylist(uri);
      onChange({ uri, name: info.name, trackCount: info.trackCount, shuffle });
    } catch (e) {
      // Metadata can be restricted while playback of the same playlist still works.
      onChange({ uri, name: 'Spotify-Playlist', trackCount: null, shuffle });
      setNote(`${toUserMessage(e)} Abspielen klappt evtl. trotzdem – bitte testen.`);
    } finally {
      setBusy(false);
      setInput('');
    }
  };

  return (
    <>
      <h3>Playlist</h3>
      {playlist ? (
        <div className="track">
          <span className="track__img track__img--icon">📃</span>
          <div className="track__text">
            <strong>{playlist.name}</strong>
            <span className="muted">
              {playlist.trackCount !== null ? `${playlist.trackCount} Songs` : 'Songanzahl unbekannt'}
            </span>
          </div>
        </div>
      ) : (
        <p className="muted">Noch keine Playlist gewählt.</p>
      )}

      <div className="row row--center">
        <label className="field field--grow">
          <span>Playlist-Link</span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="https://open.spotify.com/playlist/…"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
        <button className="btn btn--small" onClick={() => void onApply()} disabled={busy || !input.trim()}>
          {busy ? 'Lade…' : 'Übernehmen'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {note && <p className="muted">{note}</p>}
      <p className="muted">Am besten eigene Playlists verwenden – bei fremden gibt Spotify weniger Infos heraus.</p>

      {playlist && (
        <>
          <label className="check">
            <input
              type="checkbox"
              checked={playlist.shuffle}
              onChange={(e) => onChange({ ...playlist, shuffle: e.target.checked })}
            />
            <span>🔀 Zufällige Reihenfolge</span>
          </label>
          {playlist.shuffle && playlist.trackCount === null && (
            <p className="muted">Ohne bekannte Songanzahl startet die Playlist immer mit dem ersten Song.</p>
          )}
          <div className="row">
            <button className="btn" onClick={onTest} disabled={!canTest}>
              ▶ Test
            </button>
          </div>
        </>
      )}
    </>
  );
}

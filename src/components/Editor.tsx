import { useRef, useState } from 'react';
import type { TrackInfo } from '../spotify/api';
import { defaultConfig, exportConfig, importConfigFile } from '../storage/soundboardStorage';
import type { SoundButton, SoundboardConfig } from '../types/soundboard';
import { formatTime, parseTime } from '../utils/time';
import TrackSearch from './TrackSearch';

const COLORS = ['#ff6b35', '#1ed760', '#ffd60a', '#4cc9f0', '#b5179e', '#f72585', '#ff4d4f', '#8d99ae'];
const EMOJIS = ['🔥', '🎉', '💥', '🚀', '👏', '😂', '🏐', '⚡', '🎺', '🥁', '💪', '🎯', '👑', '🤡', '😱', '🫡'];
const MAX_BUTTONS = 12;

interface Props {
  config: SoundboardConfig;
  onChange: (config: SoundboardConfig) => void;
  onTest: (button: SoundButton) => void;
  canTest: boolean;
  onClose: () => void;
}

export default function Editor({ config, onChange, onTest, canTest, onClose }: Readonly<Props>) {
  const [selectedId, setSelectedId] = useState(config.buttons[0]?.id ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const selected = config.buttons.find((b) => b.id === selectedId) ?? null;

  const update = (patch: Partial<SoundButton>) => {
    if (!selected) return;
    onChange({ ...config, buttons: config.buttons.map((b) => (b.id === selected.id ? { ...b, ...patch } : b)) });
  };

  const addButton = () => {
    if (config.buttons.length >= MAX_BUTTONS) return;
    const b: SoundButton = {
      id: `btn-${Date.now()}`,
      name: 'Neu',
      emoji: '🎵',
      color: COLORS[config.buttons.length % COLORS.length],
      spotifyUri: null,
      trackName: '',
      artistName: '',
      albumImage: '',
      durationMs: null,
      startMs: 0,
      endMs: null,
    };
    onChange({ ...config, buttons: [...config.buttons, b] });
    setSelectedId(b.id);
  };

  const removeButton = () => {
    if (!selected || config.buttons.length <= 1) return;
    if (!window.confirm(`Button „${selected.name}“ löschen?`)) return;
    const rest = config.buttons.filter((b) => b.id !== selected.id);
    onChange({ ...config, buttons: rest });
    setSelectedId(rest[0]?.id ?? null);
  };

  const move = (dir: -1 | 1) => {
    if (!selected) return;
    const i = config.buttons.indexOf(selected);
    const j = i + dir;
    if (j < 0 || j >= config.buttons.length) return;
    const next = [...config.buttons];
    [next[i], next[j]] = [next[j], next[i]];
    onChange({ ...config, buttons: next });
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const imported = await importConfigFile(file);
      onChange(imported);
      setSelectedId(imported.buttons[0].id);
      setMessage(`${imported.buttons.length} Buttons importiert.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Import fehlgeschlagen.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onReset = () => {
    if (!window.confirm('Soundboard auf die 6 Standard-Buttons zurücksetzen? Alle Songs gehen verloren.')) return;
    const d = defaultConfig();
    onChange(d);
    setSelectedId(d.buttons[0].id);
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

      <div className="editor__layout">
        <aside className="editor__list">
          {config.buttons.map((b) => (
            <button
              key={b.id}
              className={`chip${b.id === selectedId ? ' chip--active' : ''}`}
              style={{ '--pad': b.color } as React.CSSProperties}
              onClick={() => setSelectedId(b.id)}
            >
              <span>{b.emoji}</span> {b.name}
              {b.spotifyUri ? '' : ' ·  ⚠︎'}
            </button>
          ))}
          <button className="btn btn--small" onClick={addButton} disabled={config.buttons.length >= MAX_BUTTONS}>
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
            canDelete={config.buttons.length > 1}
            canTest={canTest}
            onUpdate={update}
            onDelete={removeButton}
            onMove={move}
            onTest={() => onTest(selected)}
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
  onTest: () => void;
}

function ButtonForm({ button, canDelete, canTest, onUpdate, onDelete, onMove, onTest }: Readonly<FormProps>) {
  const [startText, setStartText] = useState(formatTime(button.startMs));
  const [startError, setStartError] = useState<string | null>(null);

  const onStartChange = (text: string) => {
    setStartText(text);
    const ms = parseTime(text);
    if (ms === null) return setStartError('Format MM:SS, z. B. 00:42');
    if (button.durationMs !== null && ms >= button.durationMs) {
      return setStartError(`Song ist nur ${formatTime(button.durationMs)} lang`);
    }
    setStartError(null);
    onUpdate({ startMs: ms });
  };

  const onSelectTrack = (t: TrackInfo) => {
    const startMs = button.startMs < t.durationMs ? button.startMs : 0;
    onUpdate({
      spotifyUri: t.uri,
      trackName: t.name,
      artistName: t.artists,
      albumImage: t.image,
      durationMs: t.durationMs,
      startMs,
    });
    setStartText(formatTime(startMs));
    setStartError(null);
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

      <h3>Song</h3>
      {button.spotifyUri ? (
        <div className="track">
          {button.albumImage && <img className="track__img" src={button.albumImage} alt="" />}
          <div className="track__text">
            <strong>{button.trackName}</strong>
            <span className="muted">
              {button.artistName}
              {button.durationMs !== null ? ` · ${formatTime(button.durationMs)}` : ''}
            </span>
          </div>
        </div>
      ) : (
        <p className="muted">Noch kein Song gewählt.</p>
      )}
      <TrackSearch onSelect={onSelectTrack} />

      <h3>Startzeit</h3>
      <div className="row row--center">
        <label className="field field--short">
          <span>MM:SS</span>
          <input
            value={startText}
            onChange={(e) => onStartChange(e.target.value)}
            inputMode="numeric"
            placeholder="00:42"
            aria-invalid={startError !== null}
          />
        </label>
        <button className="btn" onClick={onTest} disabled={!canTest || !button.spotifyUri || startError !== null}>
          ▶ Test
        </button>
      </div>
      {startError && <p className="error">{startError}</p>}
      <p className="muted">Endzeit wird in Version 2 ergänzt.</p>

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

import type { SoundButton } from '../types/soundboard';
import { formatTime } from '../utils/time';

interface Props {
  buttons: SoundButton[];
  activeId: string | null;
  paused: boolean;
  disabled: boolean;
  onPlay: (button: SoundButton) => void;
}

export default function Soundboard({ buttons, activeId, paused, disabled, onPlay }: Readonly<Props>) {
  return (
    <div className="board">
      {buttons.map((b) => {
        const configured = b.spotifyUri !== null;
        const active = b.id === activeId;
        let icon = '';
        if (active) icon = paused ? '⏸ ' : '▶ ';
        return (
          <button
            key={b.id}
            className={`pad${active ? ' pad--active' : ''}${configured ? '' : ' pad--empty'}`}
            style={{ '--pad': b.color } as React.CSSProperties}
            disabled={disabled || !configured}
            onClick={() => onPlay(b)}
          >
            <span className="pad__emoji">{b.emoji}</span>
            <span className="pad__name">{b.name}</span>
            <span className="pad__meta">
              {configured ? (
                <>
                  {icon}
                  {formatTime(b.startMs)} · {b.trackName}
                </>
              ) : (
                'Kein Song – im ⚙️ Editor einstellen'
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

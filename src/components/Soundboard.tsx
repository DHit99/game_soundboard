import { isConfigured } from '../storage/soundboardStorage';
import type { SoundButton, SoundTab } from '../types/soundboard';
import { formatTime } from '../utils/time';

interface Props {
  tabs: SoundTab[];
  tabId: string;
  onSelectTab: (id: string) => void;
  activeId: string | null;
  paused: boolean;
  disabled: boolean;
  onPlay: (button: SoundButton) => void;
}

function describe(b: SoundButton): string {
  if (b.mode === 'playlist') return b.playlist ? `📃 ${b.playlist.name}${b.playlist.shuffle ? ' · 🔀' : ''}` : '';
  if (b.tracks.length > 1) return `🔀 ${b.tracks.length} Songs`;
  const t = b.tracks[0];
  return t ? `${formatTime(t.startMs)} · ${t.name}` : '';
}

export default function Soundboard({ tabs, tabId, onSelectTab, activeId, paused, disabled, onPlay }: Readonly<Props>) {
  const tab = tabs.find((t) => t.id === tabId) ?? tabs[0];
  return (
    <>
      {tabs.length > 1 && <TabBar tabs={tabs} tabId={tab.id} onSelect={onSelectTab} />}
      <div className="board">
        {tab.buttons.map((b) => {
          const configured = isConfigured(b);
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
                    {describe(b)}
                  </>
                ) : (
                  'Keine Musik – im ⚙️ Editor einstellen'
                )}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

export function TabBar(props: Readonly<{ tabs: SoundTab[]; tabId: string; onSelect: (id: string) => void }>) {
  return (
    <div className="tabs" role="tablist">
      {props.tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={t.id === props.tabId}
          className={`tab${t.id === props.tabId ? ' tab--active' : ''}`}
          onClick={() => props.onSelect(t.id)}
        >
          {t.name}
        </button>
      ))}
    </div>
  );
}

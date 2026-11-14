import type { ViewMode } from "../../lib/url";
import type { Epoch } from "../../types";
import { GlassButton, GlassPanel, Icon, Segmented } from "../glass";
import s from "./PlaybackBar.module.css";

interface PlaybackBarProps {
  epochs: Epoch[];
  index: number;
  sequence: number[];
  playing: boolean;
  canPlay: boolean;
  mode: ViewMode;
  status: string | null;
  customizeOpen: boolean;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (i: number) => void;
  onMode: (m: ViewMode) => void;
  onCustomize: () => void;
}

export function PlaybackBar(p: PlaybackBarProps) {
  const ready = p.epochs.length > 0;
  const multi = p.epochs.length > 1;
  return (
    <GlassPanel pill className={s.bar} role="toolbar" aria-label="Playback">
      <div className={s.transport}>
        <PlayButton playing={p.playing} disabled={!p.canPlay} onToggle={p.onToggle} needsTarget={!ready} />
        <GlassButton variant="ghost" icon="prev" label="Previous epoch" onClick={p.onPrev} disabled={!multi} title={titleFor(ready, multi)} />
        <GlassButton variant="ghost" icon="next" label="Next epoch" onClick={p.onNext} disabled={!multi} title={titleFor(ready, multi)} />
      </div>
      <EpochTimeline epochs={p.epochs} index={p.index} sequence={p.sequence} onSeek={p.onSeek} />
      <ModeSwitch mode={p.mode} multi={multi} ready={ready} onMode={p.onMode} />
      <GlassButton
        className={s.customize}
        icon="sliders"
        label="Customize"
        aria-expanded={p.customizeOpen}
        aria-controls="drawer"
        onClick={p.onCustomize}
      />
      <StatusLine text={p.status} />
    </GlassPanel>
  );
}

function titleFor(ready: boolean, multi: boolean) {
  if (!ready) return "Pick a target first";
  if (!multi) return "Only one pass so far";
  return undefined;
}

function PlayButton({ playing, disabled, onToggle, needsTarget }: { playing: boolean; disabled: boolean; onToggle: () => void; needsTarget: boolean }) {
  return (
    <GlassButton
      variant="primary"
      className={s.play}
      onClick={onToggle}
      disabled={disabled}
      aria-label={playing ? "Pause" : "Play"}
      title={disabled ? (needsTarget ? "Pick a target first" : "Needs two or more passes") : "Play or pause (Space)"}
    >
      <Icon name={playing ? "pause" : "play"} />
      <span className={s.playLabel}>{playing ? "Pause" : "Play"}</span>
    </GlassButton>
  );
}

/** Dated ticks, one per epoch. The active tick carries a crescent. */
function EpochTimeline({ epochs, index, sequence, onSeek }: { epochs: Epoch[]; index: number; sequence: number[]; onSeek: (i: number) => void }) {
  const placeholder = epochs.length === 0;
  const ticks = placeholder ? [0, 1, 2, 3] : epochs.map((e) => e.i);
  return (
    <nav className={s.timeline} aria-label="Epochs">
      <ol className={s.track}>
        {ticks.map((i) => {
          const e = epochs[i];
          const active = !placeholder && i === index;
          return (
            <li key={i}>
              <button
                type="button"
                className={s.tick}
                aria-current={active}
                data-out={!placeholder && !sequence.includes(i)}
                disabled={placeholder}
                title={placeholder ? "Pick a target first" : undefined}
                aria-label={e ? `Epoch ${i + 1}, ${e.label}` : `Epoch ${i + 1}`}
                onClick={() => onSeek(i)}
              >
                <span className={s.dot}>{active && <Crescent />}</span>
                <span className={`${s.date} mono`}>{e ? e.label : `E${i + 1}`}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function Crescent() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="7" fill="none" stroke="var(--accent)" strokeWidth="1.25" />
      <path d="M12.5 4.2a6.2 6.2 0 1 0 0 11.6 5 5 0 0 1 0-11.6z" fill="var(--accent)" />
    </svg>
  );
}

function ModeSwitch({ mode, multi, ready, onMode }: { mode: ViewMode; multi: boolean; ready: boolean; onMode: (m: ViewMode) => void }) {
  const why = ready ? "Needs two or more passes" : "Pick a target first";
  return (
    <Segmented
      className={s.modes}
      label="View mode"
      value={mode}
      onChange={onMode}
      options={[
        { value: "all", label: "Play all", disabled: !ready, title: ready ? undefined : why },
        { value: "blink", label: "Blink", disabled: !multi, title: multi ? "Flip between the first and last pass (B)" : why },
        { value: "diff", label: "Difference", disabled: !multi, title: multi ? "Each pass minus the first (D)" : why },
        { value: "inspect", label: "Investigate", disabled: !ready, title: ready ? "Open details for the current pass" : why },
      ]}
    />
  );
}

function StatusLine({ text }: { text: string | null }) {
  return (
    <p className={`${s.status} mono`} role="status" title={text ?? undefined} style={{ margin: 0 }}>
      {text}
    </p>
  );
}

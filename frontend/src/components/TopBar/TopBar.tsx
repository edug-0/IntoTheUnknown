import { useId, useState, type FormEvent } from "react";
import { Chip, GlassButton, GlassPanel, Icon } from "../glass";
import { parseCoords } from "../../lib/format";
import { matchPresetName, PRESETS, type Preset } from "../../lib/targets";
import { APP_NAME } from "../../lib/brand";
import s from "./TopBar.module.css";

interface TopBarProps {
  activeTarget: string | null;
  onPreset: (p: Preset) => void;
  onCoords: (ra: number, dec: number) => void;
  onShare: () => void;
  shareDisabled: boolean;
  onShortcuts: () => void;
  shortcutsOpen: boolean;
}

export function TopBar(props: TopBarProps) {
  return (
    <GlassPanel pill className={s.bar} role="banner">
      <h1 className={s.name}>{APP_NAME}</h1>
      <TargetSearch onPreset={props.onPreset} onCoords={props.onCoords} />
      <TargetChips active={props.activeTarget} onPick={props.onPreset} />
      <div className={s.end}>
        <GlassButton
          variant="ghost"
          icon="help"
          label="Keyboard shortcuts"
          aria-expanded={props.shortcutsOpen}
          aria-controls="shortcuts"
          onClick={props.onShortcuts}
        />
        <ShareButton onShare={props.onShare} disabled={props.shareDisabled} />
      </div>
    </GlassPanel>
  );
}

function TargetSearch({ onPreset, onCoords }: Pick<TopBarProps, "onPreset" | "onCoords">) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const preset = matchPresetName(text);
    if (preset) {
      setError(null);
      onPreset(preset);
      return;
    }
    const c = parseCoords(text);
    if (c) {
      setError(null);
      onCoords(c.ra, c.dec);
      return;
    }
    setError(
      text.trim()
        ? "Enter RA, Dec such as 269.446, 4.768 or 17:57:47 +04:46:06. Name search covers the five test targets for now."
        : "Type a target name or RA, Dec.",
    );
  };

  return (
    <form className={s.search} onSubmit={submit} role="search">
      <label className={s.field}>
        <Icon name="search" size={16} />
        <span className="sr-only">Target name or RA, Dec</span>
        <input
          className={s.input}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError(null);
          }}
          placeholder="Name or RA, Dec"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? id : undefined}
        />
      </label>
      <GlassButton type="submit">Go</GlassButton>
      {error && (
        <p id={id} role="alert" className={s.error}>
          {error}
        </p>
      )}
    </form>
  );
}

function TargetChips({ active, onPick }: { active: string | null; onPick: (p: Preset) => void }) {
  return (
    <div className={s.chips} role="group" aria-label="Test targets">
      {PRESETS.map((p) => (
        <Chip key={p.id} pressed={active === p.id} onClick={() => onPick(p)} title={p.name}>
          {p.short}
        </Chip>
      ))}
    </div>
  );
}

function ShareButton({ onShare, disabled }: { onShare: () => void; disabled: boolean }) {
  return (
    <GlassButton icon="share" onClick={onShare} disabled={disabled} title={disabled ? "Pick a target first" : "Copy a link to this view"}>
      <span className={s.shareLabel}>Share</span>
    </GlassButton>
  );
}

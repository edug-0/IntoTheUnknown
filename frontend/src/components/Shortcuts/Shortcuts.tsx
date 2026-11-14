import { GlassPanel } from "../glass";
import s from "./Shortcuts.module.css";

const KEYS: [string, string][] = [
  ["Space", "Play or pause"],
  ["← →", "Previous or next pass"],
  ["B", "Blink first and last"],
  ["D", "Difference"],
  ["C", "Customize"],
  ["Esc", "Close panel"],
  ["?", "These shortcuts"],
];

/** Flat strong glass: no blur of its own, so it never stacks on the top bar's blur. */
export function Shortcuts() {
  return (
    <GlassPanel strong flat id="shortcuts" className={s.pop} role="dialog" aria-label="Keyboard shortcuts">
      <h2 className={`micro ${s.title}`}>Keyboard</h2>
      <dl className={s.list}>
        {KEYS.map(([k, v]) => (
          <div key={k} style={{ display: "contents" }}>
            <dt>
              <kbd className="mono">{k}</kbd>
            </dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </GlassPanel>
  );
}

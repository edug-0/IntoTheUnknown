import { Icon } from "../glass";
import { glassPanelClass } from "../glass/classes";
import s from "./CustomizeTab.module.css";

/** Vertical tab on the stage's right edge. Shown only while the drawer is closed (desktop). */
export function CustomizeTab({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      className={`${glassPanelClass} ${s.tab}`}
      aria-expanded={false}
      aria-controls="drawer"
      onClick={onOpen}
      title="Customize (C)"
    >
      <Icon name="sliders" size={16} />
      <span className={s.label}>Customize</span>
    </button>
  );
}

import { formatDec, formatRa } from "../../lib/format";
import type { RaDec } from "../../lib/sky";
import { PRESETS, type Preset } from "../../lib/targets";
import { AllSkyMap } from "../AllSkyMap/AllSkyMap";
import { GlassPanel } from "../glass";
import s from "./ObjectCard.module.css";

/** Stellarium-style object panel: what you are looking at, where it is on the whole sky, catalogue values. */
export function ObjectCard({ target, position }: { target: Preset | null; position: RaDec }) {
  return (
    <GlassPanel className={s.card} aria-label="Target" data-fade>
      <p className="micro">{target ? (target.kind === "motion" ? "Moving target" : "Variable target") : "Position"}</p>
      <h2 className={`display ${s.name}`}>{target?.name ?? "Custom position"}</h2>
      {target && <p className={s.what}>{target.what}</p>}

      <dl className={s.facts}>
        <div className={s.row}>
          <dt className="micro">RA</dt>
          <dd className="mono">{formatRa(position.ra)}</dd>
        </div>
        <div className={s.row}>
          <dt className="micro">Dec</dt>
          <dd className="mono">{formatDec(position.dec)}</dd>
        </div>
        {target?.facts.map((f) => (
          <div key={f.label} className={s.row}>
            <dt className="micro">{f.label}</dt>
            <dd className="mono">{f.value}</dd>
          </div>
        ))}
      </dl>

      {target && (
        <p className={s.watch}>
          <span className={s.watchDot} aria-hidden="true" />
          {target.watch}
        </p>
      )}

      <div className={s.inset} aria-label="Where this is on the whole sky">
        <AllSkyMap targets={PRESETS} activeId={target?.id ?? null} marker={target ? null : position} compact />
      </div>
      {target && <p className={s.source}>Catalogue values: Gaia DR3 unless marked (lit.)</p>}
    </GlassPanel>
  );
}

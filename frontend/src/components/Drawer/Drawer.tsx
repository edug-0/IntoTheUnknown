import { useEffect, useRef } from "react";
import type { LoadedView } from "../../data/source";
import { mjdToDate } from "../../lib/format";
import { SPEEDS, type Overlays, type Panel, type StretchKind } from "../../lib/url";
import { BAND_OPTIONS, FOV_OPTIONS, type Band, type FovArcmin } from "../../types";
import { GlassButton, GlassPanel, Segmented, Tabs } from "../glass";
import { NOT_AVAILABLE } from "../glass/classes";
import s from "./Drawer.module.css";

export interface CustomizeValues {
  fov: FovArcmin;
  speed: number;
  stretch: StretchKind;
  band: Band;
  invert: boolean;
  overlays: Overlays;
}

interface DrawerProps {
  panel: Panel;
  onPanel: (p: Panel) => void;
  onClose: () => void;
  values: CustomizeValues;
  onChange: (v: Partial<CustomizeValues>) => void;
  onReset: () => void;
  view: LoadedView | null;
  index: number;
  /** Which overlays have data behind them. */
  available: { gaia: boolean; flags: boolean; grid: boolean };
}

export const DRAWER_ID = "drawer";

export function Drawer(p: DrawerProps) {
  const tabsRef = useRef<HTMLDivElement>(null);

  // Move focus into the drawer when it opens so keyboard users land on the tabs.
  useEffect(() => {
    tabsRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus({ preventScroll: true });
  }, []);

  const panelId = `drawer-panel-${p.panel}`;
  return (
    <GlassPanel strong id={DRAWER_ID} className={s.drawer} role="dialog" aria-modal="false" aria-label="View options and details">
      <div className={s.head} ref={tabsRef}>
        <Tabs
          label="Drawer"
          value={p.panel}
          onChange={p.onPanel}
          tabs={[
            { value: "customize", label: "Customize", panelId },
            { value: "details", label: "Details", panelId },
          ]}
        />
        <GlassButton variant="ghost" icon="close" label="Close (Esc)" onClick={p.onClose} />
      </div>
      <div className={s.body} id={panelId} role="tabpanel" aria-labelledby={`tab-${p.panel}`}>
        {p.panel === "customize" ? <CustomizePanel {...p} /> : <DetailsPanel view={p.view} index={p.index} />}
      </div>
    </GlassPanel>
  );
}

function Switch({ label, pressed, disabled, onToggle }: { label: string; pressed: boolean; disabled?: boolean; onToggle: () => void }) {
  return (
    <div className={s.rowInline}>
      <span id={`sw-${label}`}>{label}</span>
      <span className={s.switchHit}>
        <button
          type="button"
          className={s.switch}
          aria-pressed={pressed && !disabled}
          aria-labelledby={`sw-${label}`}
          disabled={disabled}
          title={disabled ? NOT_AVAILABLE : undefined}
          onClick={onToggle}
        />
      </span>
    </div>
  );
}

function CustomizePanel({ values: v, onChange, onReset, available }: DrawerProps) {
  return (
    <>
      <fieldset className={s.section}>
        <legend className="micro">View</legend>
        <div className={s.row}>
          <span id="fov-label">Field of view</span>
          <Segmented
            label="Field of view in arcminutes"
            value={String(v.fov)}
            onChange={(x) => onChange({ fov: Number(x) as FovArcmin })}
            options={FOV_OPTIONS.map((f) => ({ value: String(f), label: <span className="mono">{f}′</span> }))}
          />
        </div>
        <div className={s.row}>
          <span>Speed (passes per second)</span>
          <Segmented
            label="Playback speed in passes per second"
            value={String(v.speed)}
            onChange={(x) => onChange({ speed: Number(x) })}
            options={SPEEDS.map((x) => ({ value: String(x), label: <span className="mono">{x}</span> }))}
          />
        </div>
      </fieldset>

      <fieldset className={s.section}>
        <legend className="micro">Image</legend>
        <div className={s.row}>
          <span>Stretch</span>
          <Segmented
            label="Brightness stretch"
            value={v.stretch}
            onChange={(x) => onChange({ stretch: x })}
            options={[
              { value: "asinh", label: "Asinh", title: "Shows faint and bright stars together" },
              { value: "linear", label: "Linear" },
            ]}
          />
        </div>
        <label className={s.row}>
          <span>Band</span>
          <select className={`${s.select} mono`} value={v.band} onChange={(e) => onChange({ band: e.target.value as Band })}>
            {BAND_OPTIONS.map((b) => (
              <option key={b} value={b}>
                {b === "auto" ? "Auto" : b === "all" ? "All bands" : b}
              </option>
            ))}
          </select>
        </label>
        <Switch label="Invert" pressed={v.invert} onToggle={() => onChange({ invert: !v.invert })} />
      </fieldset>

      <fieldset className={s.section}>
        <legend className="micro">Overlays</legend>
        <Switch
          label="Gaia positions"
          pressed={v.overlays.gaia}
          disabled={!available.gaia}
          onToggle={() => onChange({ overlays: { ...v.overlays, gaia: !v.overlays.gaia } })}
        />
        <Switch
          label="Flagged pixels"
          pressed={v.overlays.flags}
          disabled={!available.flags}
          onToggle={() => onChange({ overlays: { ...v.overlays, flags: !v.overlays.flags } })}
        />
        <Switch
          label="RA, Dec grid"
          pressed={v.overlays.grid}
          disabled={!available.grid}
          onToggle={() => onChange({ overlays: { ...v.overlays, grid: !v.overlays.grid } })}
        />
      </fieldset>

      <div className={s.foot}>
        <p className={s.hint}>Saved in the share link</p>
        <GlassButton onClick={onReset}>Reset</GlassButton>
      </div>
    </>
  );
}

function DetailsPanel({ view, index }: { view: LoadedView | null; index: number }) {
  if (!view || view.manifest.epochs.length === 0) {
    return <p className={s.hint}>Load a target to see details for each pass.</p>;
  }
  const m = view.manifest;
  const e = m.epochs[index] ?? m.epochs[0];
  const flagged = Object.entries(e.flagged_px);
  const flaggedTotal = flagged.reduce((a, [, n]) => a + n, 0);
  return (
    <>
      <section className={s.section} aria-labelledby="d-epoch">
        <h3 id="d-epoch" className={`micro ${s.sectionTitle}`}>
          This pass
        </h3>
        <dl className={s.kv}>
          <dt className="micro">Epoch</dt>
          <dd className="mono">
            {String(e.i + 1).padStart(2, "0")} / {String(m.epochs.length).padStart(2, "0")}
          </dd>
          <dt className="micro">Date</dt>
          <dd className="mono">{mjdToDate(e.t_mean_mjd)}</dd>
          <dt className="micro">Frames</dt>
          <dd className="mono">{e.n_frames}</dd>
          <dt className="micro">Detector</dt>
          <dd className="mono">{e.detectors.map((d) => `D${d}`).join(" ")}</dd>
          <dt className="micro">Wavelength</dt>
          <dd className="mono">
            λ {e.lambda_um[0].toFixed(2)}–{e.lambda_um[1].toFixed(2)} µm
          </dd>
          <dt className="micro">Flagged px</dt>
          <dd className="mono" title={flagged.map(([k, n]) => `${k} ${n}`).join(", ") || undefined}>
            <span className={flaggedTotal ? s.flagCount : undefined}>{flaggedTotal}</span>
            {flagged.length > 0 && ` (${flagged.map(([k, n]) => `${k} ${n}`).join(", ")})`}
          </dd>
          <dt className="micro">Release</dt>
          <dd className="mono">{m.catalog.collections.join(" + ")}</dd>
        </dl>
      </section>
      <section className={s.section} aria-labelledby="d-gaia">
        <h3 id="d-gaia" className={`micro ${s.sectionTitle}`}>
          Gaia match
        </h3>
        <div className={s.slot}>Coming soon: where Gaia says each star should be on this date.</div>
      </section>
      <section className={s.section} aria-labelledby="d-lc">
        <h3 id="d-lc" className={`micro ${s.sectionTitle}`}>
          Light curve
        </h3>
        <div className={s.slot}>Coming soon</div>
      </section>
      <section className={s.section} aria-labelledby="d-spec">
        <h3 id="d-spec" className={`micro ${s.sectionTitle}`}>
          Spectrum
        </h3>
        <div className={s.slot}>Coming soon</div>
      </section>
    </>
  );
}

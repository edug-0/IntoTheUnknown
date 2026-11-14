import { useEffect, useRef } from "react";
import type { LoadedView } from "../../data/source";
import type { ViewState as LoadState } from "../../hooks/useView";
import { formatDec, formatRa, pad2 } from "../../lib/format";
import { renderDifference, renderEpoch, tokenRgb } from "../../lib/stretch";
import { PRESETS, type Preset } from "../../lib/targets";
import type { Overlays, StretchKind, ViewMode } from "../../lib/url";
import type { GaiaResult } from "../../types";
import { GlassButton, GlassPanel } from "../glass";
import { glassPanelClass } from "../glass/classes";
import s from "./SkyStage.module.css";

interface SkyStageProps {
  load: LoadState;
  targetName: string | null;
  ra: number | null;
  dec: number | null;
  index: number;
  mode: ViewMode;
  stretch: StretchKind;
  invert: boolean;
  overlays: Overlays;
  /** Gaia predictions for this view. Null until the backend serves /gaia. */
  gaia: GaiaResult | null;
  onRetry: () => void;
  onPreset: (p: Preset) => void;
}

export function SkyStage(props: SkyStageProps) {
  const { load } = props;
  return (
    <section className={s.stage} aria-label="Sky image">
      {load.kind === "idle" && <EmptyState onPreset={props.onPreset} />}
      {load.kind === "loading" && <LoadingFrame {...props} />}
      {load.kind === "error" && <ErrorCard code={load.code} message={load.message} onRetry={props.onRetry} />}
      {load.kind === "ready" &&
        (load.view.manifest.epochs.length === 0 ? (
          <NoCoverage onRetry={props.onRetry} />
        ) : (
          <FrameView {...props} view={load.view} />
        ))}
      <ContextInset />
    </section>
  );
}

function EmptyState({ onPreset }: { onPreset: (p: Preset) => void }) {
  return (
    <div className={s.empty}>
      <h2>Pick a target to begin</h2>
      <p>Start with one of the five test objects, or type a name or RA, Dec above.</p>
      <div className={s.presetGrid}>
        {PRESETS.map((p) => (
          <button key={p.id} type="button" className={`${glassPanelClass} ${s.presetButton}`} onClick={() => onPreset(p)}>
            <span className={s.presetName}>{p.name}</span>
            <span className="micro">{p.kind === "motion" ? "Moves" : "Changes brightness"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Hud({ props, epochText, children }: { props: SkyStageProps; epochText: string; children?: React.ReactNode }) {
  return (
    <div className={`${s.hud} mono`}>
      <span>
        <span className={s.hudStrong}>{props.targetName ?? "Custom position"}</span>
        <span className={s.hudSep} aria-hidden="true">
          ·
        </span>
        {epochText}
        {children}
      </span>
      {props.ra !== null && props.dec !== null && (
        <span aria-label={`Right ascension ${formatRa(props.ra)}, declination ${formatDec(props.dec)}`}>
          RA <span className={s.hudStrong}>{formatRa(props.ra)}</span>&nbsp; DEC{" "}
          <span className={s.hudStrong}>{formatDec(props.dec)}</span>
        </span>
      )}
    </div>
  );
}

function LoadingFrame(props: SkyStageProps) {
  const p = props.load.kind === "loading" ? props.load.progress : null;
  const line = p
    ? `${p.stage.toUpperCase()}${p.done !== undefined && p.total ? ` ${p.done} / ${p.total}` : ""}`
    : "LOADING";
  return (
    <div className={s.column}>
      <Hud props={props} epochText="EPOCH -- / --" />
      <div className={s.frame} role="status" aria-live="polite" aria-label={`Loading the sky image: ${line.toLowerCase()}`}>
        <div className={s.skeleton} />
        <span className={`${s.progress} mono`}>{line}</span>
      </div>
      <div className={s.caption} />
    </div>
  );
}

function ErrorCard({ code, message, onRetry }: { code: string; message: string; onRetry: () => void }) {
  return (
    <GlassPanel strong className={s.card} role="alert">
      <h2>This view did not load</h2>
      <p>{message}</p>
      <code className={`${s.code} mono`}>{code}</code>
      <GlassButton icon="retry" onClick={onRetry}>
        Retry
      </GlassButton>
    </GlassPanel>
  );
}

function NoCoverage({ onRetry }: { onRetry: () => void }) {
  return (
    <GlassPanel strong className={s.card} role="status">
      <h2>No SPHEREx passes here yet</h2>
      <p>SPHEREx has not imaged this spot in the releases we searched. Try another position, or check again after the next data release.</p>
      <GlassButton icon="retry" onClick={onRetry}>
        Check again
      </GlassButton>
    </GlassPanel>
  );
}

function FrameView(props: SkyStageProps & { view: LoadedView }) {
  const { view, index, mode } = props;
  const m = view.manifest;
  const n = m.epochs.length;
  const epoch = m.epochs[index] ?? m.epochs[0];
  const diff = mode === "diff" && n > 1;
  const epochText = diff ? `EPOCH ${pad2(epoch.i + 1)} − 01` : `EPOCH ${pad2(epoch.i + 1)} / ${pad2(n)}`;

  return (
    <div className={s.column}>
      <Hud props={props} epochText={epochText} />
      <div className={s.frame}>
        <FrameCanvas {...props} />
        <OverlayLayer
          nx={m.grid.nx}
          ny={m.grid.ny}
          mask={props.overlays.flags ? (view.masks[index] ?? null) : null}
          gaia={props.overlays.gaia ? props.gaia : null}
          epochIndex={index}
        />
        <Crosshair />
      </div>
      <div className={`${s.caption} mono`}>
        <span>{epoch.label}</span>
        {diff ? (
          <span className={s.legend} aria-label="Difference colors: silver is where something was, amber is where it is now">
            <span>
              <span className={s.swatchNeg} />
              WAS
            </span>
            <span>
              <span className={s.swatchPos} />
              NOW
            </span>
          </span>
        ) : n === 1 ? (
          <span>One pass so far, nothing to compare yet</span>
        ) : (
          <span>
            {m.grid.pix_arcsec.toFixed(2)}″/PX · {m.query.fov_arcmin}′ FOV
          </span>
        )}
      </div>
    </div>
  );
}

function FrameCanvas({ view, index, mode, stretch, invert }: SkyStageProps & { view: LoadedView }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { manifest: m, images } = view;
  const { nx, ny } = m.grid;

  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const out = ctx.createImageData(nx, ny);
    const cur = images[index] ?? images[0];
    if (mode === "diff" && images.length > 1 && index > 0) {
      renderDifference(out.data, images[0], cur, m.epochs[index].phot_scale / m.epochs[0].phot_scale, nx, ny, {
        neg: tokenRgb("--text-1"),
        pos: tokenRgb("--mover"),
      });
    } else {
      renderEpoch(out.data, cur, nx, ny, m.stretch, stretch, invert);
    }
    ctx.putImageData(out, 0, 0);
  }, [images, index, mode, stretch, invert, nx, ny, m]);

  const e = m.epochs[index] ?? m.epochs[0];
  return (
    <canvas
      ref={ref}
      className={s.canvas}
      width={nx}
      height={ny}
      role="img"
      aria-label={`SPHEREx image, epoch ${e.i + 1} of ${m.epochs.length}, ${e.label}${mode === "diff" ? ", difference from epoch 1" : ""}`}
    />
  );
}

/** Thin ring with a clear centre so it never hides the target. */
function Crosshair() {
  return (
    <svg className={s.overlay} viewBox="0 0 100 100" aria-hidden="true">
      <g fill="none" stroke="var(--text-1)" strokeOpacity="0.7" strokeWidth="0.35" vectorEffect="non-scaling-stroke">
        <circle cx="50" cy="50" r="7" />
        <path d="M50 38v6M50 56v6M38 50h6M56 50h6" />
      </g>
    </svg>
  );
}

interface OverlayProps {
  nx: number;
  ny: number;
  mask: Uint8Array | null;
  gaia: GaiaResult | null;
  epochIndex: number;
}

/** Flag boxes, Gaia rings and the motion trail. Each draws only when its data exists. */
function OverlayLayer({ nx, ny, mask, gaia, epochIndex }: OverlayProps) {
  if (!mask && !gaia) return null;
  const flagged: [number, number][] = [];
  if (mask) {
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) if (mask[(ny - 1 - y) * nx + x]) flagged.push([x, y]);
  }
  return (
    <svg className={s.overlay} viewBox={`0 0 ${nx} ${ny}`} aria-hidden="true">
      {flagged.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x + 0.1} y={y + 0.1} width={0.8} height={0.8} fill="none" stroke="var(--flag)" strokeWidth={0.12} />
      ))}
      {gaia?.stars.map((st) => {
        const p = st.track_px[epochIndex];
        if (!p) return null;
        const [x, y] = [p[0] + 0.5, ny - p[1] - 0.5];
        return (
          <g key={st.source_id}>
            <polyline
              points={st.track_px.map(([tx, ty]) => `${tx + 0.5},${ny - ty - 0.5}`).join(" ")}
              fill="none"
              stroke="var(--mover)"
              strokeWidth={0.15}
            />
            <circle cx={x} cy={y} r={1.6} fill="none" stroke={st.matched[epochIndex] ? "var(--match)" : "var(--mover)"} strokeWidth={0.18} />
          </g>
        );
      })}
    </svg>
  );
}

function ContextInset() {
  return (
    <aside className={s.inset} aria-label="Sky context">
      <span>
        <span className="micro">Sky context</span>
        <br />
        Coming soon
      </span>
    </aside>
  );
}

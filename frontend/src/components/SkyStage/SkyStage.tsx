import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { LoadedView } from "../../data/source";
import type { ViewState as LoadState } from "../../hooks/useView";
import { formatDec, formatRa } from "../../lib/format";
import { renderDifference, renderEpoch, tokenRgb } from "../../lib/stretch";
import { PRESETS, type Preset } from "../../lib/targets";
import type { Overlays, StretchKind, ViewMode } from "../../lib/url";
import type { FovArcmin, GaiaResult } from "../../types";
import { AllSkyMap } from "../AllSkyMap/AllSkyMap";
import { GlassButton, GlassPanel } from "../glass";
import { buildGrid } from "./grid";
import s from "./SkyStage.module.css";

interface SkyStageProps {
  load: LoadState;
  target: Preset | null;
  ra: number | null;
  dec: number | null;
  fov: FovArcmin;
  index: number;
  mode: ViewMode;
  stretch: StretchKind;
  invert: boolean;
  overlays: Overlays;
  /** Gaia predictions for this view. Null until the backend serves /gaia. */
  gaia: GaiaResult | null;
  /** Show the leader-line label beside the frame (hidden when the object card covers it). */
  showLabel: boolean;
  onRetry: () => void;
  onPreset: (p: Preset) => void;
}

export function SkyStage(props: SkyStageProps) {
  const { load } = props;
  if (load.kind === "idle") return <Home onPreset={props.onPreset} />;
  return (
    <section className={s.stage} aria-label="Sky view">
      {load.kind === "loading" && (
        <Eyepiece {...props} view={null}>
          <Loading load={load} />
        </Eyepiece>
      )}
      {load.kind === "error" && <ErrorCard code={load.code} message={load.message} onRetry={props.onRetry} />}
      {load.kind === "ready" &&
        (load.view.manifest.epochs.length === 0 ? <NoCoverage onRetry={props.onRetry} /> : <Eyepiece {...props} view={load.view} />)}
    </section>
  );
}

/** First visit: the whole sky with the five targets where they really are. */
function Home({ onPreset }: { onPreset: (p: Preset) => void }) {
  return (
    <section className={s.home} aria-labelledby="home-title">
      <div className={s.homeText}>
        <p className="micro">SPHEREx · the whole sky every six months</p>
        <h2 id="home-title" className={`display ${s.homeTitle}`}>
          Pick a target to begin
        </h2>
        <p className={s.homeSub}>Choose one of five test objects on the map, or search by name or RA, Dec. Then press Play and watch for the dot that moves.</p>
      </div>
      <div className={s.homeMap}>
        <AllSkyMap targets={PRESETS} activeId={null} onPick={onPreset} />
      </div>
    </section>
  );
}

function useBox<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [box, setBox] = useState<{ left: number; top: number; side: number; vw: number; vh: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const next = { left: Math.round(r.left), top: Math.round(r.top), side: Math.round(r.width), vw: window.innerWidth, vh: window.innerHeight };
      setBox((prev) =>
        prev && prev.left === next.left && prev.top === next.top && prev.side === next.side && prev.vw === next.vw && prev.vh === next.vh
          ? prev
          : next,
      );
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(document.body);
    window.addEventListener("resize", measure);
    // Stage padding animates when panels open; measure again once it settles.
    const t = window.setInterval(measure, 400);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.clearInterval(t);
    };
  }, []);
  return [ref, box] as const;
}

/** The eyepiece: frame, viewfinder ticks, compass, RA/Dec grid across the sky, and the target label. */
function Eyepiece(props: SkyStageProps & { view: LoadedView | null; children?: ReactNode }) {
  const { view, ra, dec, index, mode } = props;
  const [frameRef, box] = useBox<HTMLDivElement>();
  const m = view?.manifest;
  const fovDeg = m ? (m.grid.nx * m.grid.pix_arcsec) / 3600 : props.fov / 60;
  const fovArcmin = fovDeg * 60;
  const diff = mode === "diff" && (m?.epochs.length ?? 0) > 1;

  const outer = useMemo(
    () => (box && ra !== null && dec !== null ? buildGrid(ra, dec, fovDeg, box, box.vw, box.vh) : null),
    [box, ra, dec, fovDeg],
  );
  const inner = useMemo(
    () =>
      box && ra !== null && dec !== null && props.overlays.grid
        ? buildGrid(ra, dec, fovDeg, { left: 0, top: 0, side: box.side }, box.side, box.side)
        : null,
    [box, ra, dec, fovDeg, props.overlays.grid],
  );

  const ticks = Math.max(1, Math.round(fovArcmin));
  // Room between the frame and the tool rail on the right (rail 52px + gutters).
  const labelRoom = box ? box.vw - (box.left + box.side) - 64 - 84 : 0;
  const showLabel = props.showLabel && labelRoom > 160 && box !== null;

  return (
    <>
      {box && outer && (
        <svg className={s.sky} width={box.vw} height={box.vh} aria-hidden="true">
          <defs>
            <mask id="frame-hole">
              <rect width={box.vw} height={box.vh} fill="white" />
              <rect x={box.left - 1} y={box.top - 1} width={box.side + 2} height={box.side + 2} fill="black" />
            </mask>
          </defs>
          <g mask="url(#frame-hole)">
            {outer.lines.map((l, i) => (
              <path key={i} d={l.d} className={s.gridLine} />
            ))}
          </g>
          {outer.decLabels.map((l) => (
            <text key={l.text} x={box.left - 18} y={l.y} className={`${s.gridLabel} mono`} textAnchor="end" dominantBaseline="middle">
              {l.text}
            </text>
          ))}
          {outer.raLabels.map((l) => (
            <text key={l.text} x={l.x} y={box.top + box.side + 26} className={`${s.gridLabel} mono`} textAnchor="middle">
              {l.text}
            </text>
          ))}
          <Viewfinder left={box.left} top={box.top} side={box.side} ticks={ticks} />
          {showLabel && <Leader left={box.left} top={box.top} side={box.side} />}
        </svg>
      )}

      <div className={s.column}>
        <div className={`${s.topRow} mono`}>
          <ScaleBar side={box?.side ?? 0} fovArcmin={fovArcmin} />
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
          ) : m && m.epochs.length === 1 ? (
            <span>ONE PASS SO FAR · NOTHING TO COMPARE YET</span>
          ) : (
            <Compass />
          )}
        </div>
        <div ref={frameRef} className={s.frame}>
          {view ? (
            <>
              <FrameCanvas view={view} index={index} mode={mode} stretch={props.stretch} invert={props.invert} />
              <OverlayLayer
                nx={view.manifest.grid.nx}
                ny={view.manifest.grid.ny}
                mask={props.overlays.flags ? (view.masks[index] ?? null) : null}
                gaia={props.overlays.gaia ? props.gaia : null}
                epochIndex={index}
              />
              {inner && box && (
                <svg className={s.overlay} viewBox={`0 0 ${box.side} ${box.side}`} aria-hidden="true">
                  {inner.lines.map((l, i) => (
                    <path key={i} d={l.d} className={s.gridOnImage} />
                  ))}
                </svg>
              )}
              <Crosshair />
            </>
          ) : (
            props.children
          )}
        </div>
        <div className={s.bottomRow} />
      </div>

      {showLabel && box && (
        <TargetLabel
          left={box.left + box.side + 64}
          top={box.top + 34}
          maxWidth={Math.min(280, labelRoom)}
          name={props.target?.name ?? "Custom position"}
          ra={ra}
          dec={dec}
          sub={props.target?.watch ?? null}
          fixture={view?.label ?? null}
        />
      )}
    </>
  );
}

function Viewfinder({ left, top, side, ticks }: { left: number; top: number; side: number; ticks: number }) {
  const g = 10; // gap between frame and brackets
  const arm = Math.min(28, side / 8);
  const L = left - g;
  const T = top - g;
  const R = left + side + g;
  const B = top + side + g;
  const step = side / ticks;
  const tickPath = Array.from({ length: ticks + 1 }, (_, i) => {
    const p = i * step;
    const len = i % 5 === 0 ? 6 : 3;
    return `M${left + p},${top - 1}v${-len}M${left + p},${top + side + 1}v${len}M${left - 1},${top + p}h${-len}M${left + side + 1},${top + p}h${len}`;
  }).join("");
  return (
    <g>
      <path d={tickPath} className={s.ticks} />
      <path
        d={`M${L},${T + arm}V${T}H${L + arm}M${R - arm},${T}H${R}V${T + arm}M${R},${B - arm}V${B}H${R - arm}M${L + arm},${B}H${L}V${B - arm}`}
        className={s.brackets}
      />
    </g>
  );
}

function Leader({ left, top, side }: { left: number; top: number; side: number }) {
  const cx = left + side / 2;
  const cy = top + side / 2;
  const r = side * 0.07;
  const sx = cx + r * 0.72;
  const sy = cy - r * 0.72;
  const ex = left + side + 40;
  const ey = top + 48;
  return (
    <g className={s.leader}>
      <path d={`M${sx},${sy}L${ex},${ey}H${ex + 18}`} />
      <circle cx={ex + 18} cy={ey} r={2} />
    </g>
  );
}

function TargetLabel(p: { left: number; top: number; maxWidth: number; name: string; ra: number | null; dec: number | null; sub: string | null; fixture: string | null }) {
  return (
    <div className={s.targetLabel} style={{ left: p.left, top: p.top, maxWidth: p.maxWidth }}>
      <span className={`display ${s.targetName}`}>{p.name}</span>
      {p.ra !== null && p.dec !== null && (
        <span className={`mono ${s.targetCoords}`}>
          <span>
            RA <b>{formatRa(p.ra)}</b>
          </span>
          <span>
            DEC <b>{formatDec(p.dec)}</b>
          </span>
        </span>
      )}
      {p.sub && <span className={s.targetSub}>{p.sub}</span>}
      {p.fixture && <span className={`mono ${s.sourceTag}`}>{p.fixture}</span>}
    </div>
  );
}

function ScaleBar({ side, fovArcmin }: { side: number; fovArcmin: number }) {
  const px = side / fovArcmin;
  if (!px) return <span />;
  return (
    <span className={s.scale}>
      <span className={s.scaleBar} style={{ width: px }} />1′
    </span>
  );
}

function Compass() {
  return (
    <span className={s.compass} aria-label="North is up, east is left">
      <svg width="40" height="28" viewBox="0 0 40 28" aria-hidden="true">
        <path d="M30 24V6M30 6l-3 4M30 6l3 4M30 24H12M12 24l4-3M12 24l4 3" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
      <span className={s.compassN}>N</span>
      <span className={s.compassE}>E</span>
    </span>
  );
}

function Loading({ load }: { load: Extract<LoadState, { kind: "loading" }> }) {
  const p = load.progress;
  const line = p ? `${p.stage.toUpperCase()}${p.done !== undefined && p.total ? ` ${p.done} / ${p.total}` : ""}` : "LOADING";
  return (
    <div className={s.loading} role="status" aria-live="polite" aria-label={`Loading the sky image: ${line.toLowerCase()}`}>
      <div className={s.skeleton} />
      <span className={`${s.progress} mono`}>{line}</span>
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

interface CanvasProps {
  view: LoadedView;
  index: number;
  mode: ViewMode;
  stretch: StretchKind;
  invert: boolean;
}

function FrameCanvas({ view, index, mode, stretch, invert }: CanvasProps) {
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
      <g fill="none" stroke="var(--text-1)" strokeOpacity="0.7" strokeWidth="0.35">
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

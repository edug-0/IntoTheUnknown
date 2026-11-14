import { BAND_OPTIONS, FOV_OPTIONS, type Band, type FovArcmin } from "../types";

export type ViewMode = "all" | "blink" | "diff" | "inspect";
export type Panel = "customize" | "details";
export type StretchKind = "asinh" | "linear";

export interface Overlays {
  gaia: boolean;
  flags: boolean;
  grid: boolean;
}

/** Everything the share link carries. The URL is the state. */
export interface ViewState {
  ra: number | null;
  dec: number | null;
  fov: FovArcmin;
  band: Band;
  /** Preset id when the view came from a target chip. */
  target: string | null;
  mode: ViewMode;
  /** Zero-based epoch index (written 1-based in the URL). */
  epoch: number;
  panel: Panel | null;
  speed: number;
  stretch: StretchKind;
  invert: boolean;
  overlays: Overlays;
}

export const DEFAULTS: Omit<ViewState, "ra" | "dec" | "target"> = {
  fov: 6,
  band: "auto",
  mode: "all",
  epoch: 0,
  panel: null,
  speed: 2,
  stretch: "asinh",
  invert: false,
  overlays: { gaia: true, flags: false, grid: false },
};

export const SPEEDS = [0.5, 1, 2, 4, 8] as const;
const MODES: ViewMode[] = ["all", "blink", "diff", "inspect"];
const PANELS: Panel[] = ["customize", "details"];

function num(v: string | null): number | null {
  if (v === null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function parseUrl(search: string): ViewState {
  const p = new URLSearchParams(search);
  const ra = num(p.get("ra"));
  const dec = num(p.get("dec"));
  const fov = num(p.get("fov"));
  const band = p.get("band");
  const mode = p.get("mode");
  const panel = p.get("panel");
  const speed = num(p.get("speed"));
  const epoch = num(p.get("epoch"));
  const ov = p.get("ov");
  const hasCoords = ra !== null && dec !== null && ra >= 0 && ra < 360 && dec >= -90 && dec <= 90;
  return {
    ra: hasCoords ? ra : null,
    dec: hasCoords ? dec : null,
    target: hasCoords ? p.get("target") : null,
    fov: FOV_OPTIONS.includes(fov as FovArcmin) ? (fov as FovArcmin) : DEFAULTS.fov,
    band: BAND_OPTIONS.includes(band as Band) ? (band as Band) : DEFAULTS.band,
    mode: MODES.includes(mode as ViewMode) ? (mode as ViewMode) : DEFAULTS.mode,
    panel: PANELS.includes(panel as Panel) ? (panel as Panel) : null,
    epoch: epoch !== null && epoch >= 1 ? Math.floor(epoch) - 1 : 0,
    speed: SPEEDS.includes(speed as (typeof SPEEDS)[number]) ? (speed as number) : DEFAULTS.speed,
    stretch: p.get("stretch") === "linear" ? "linear" : "asinh",
    invert: p.get("invert") === "1",
    overlays:
      ov === null
        ? DEFAULTS.overlays
        : { gaia: ov.includes("g"), flags: ov.includes("f"), grid: ov.includes("r") },
  };
}

export function toSearch(s: ViewState): string {
  const p = new URLSearchParams(window.location.search);
  const set = (k: string, v: string | null) => (v === null ? p.delete(k) : p.set(k, v));
  set("ra", s.ra === null ? null : s.ra.toFixed(5));
  set("dec", s.dec === null ? null : s.dec.toFixed(5));
  set("fov", String(s.fov));
  set("target", s.target);
  set("band", s.band === DEFAULTS.band ? null : s.band);
  set("mode", s.mode === DEFAULTS.mode ? null : s.mode);
  set("epoch", s.epoch === 0 ? null : String(s.epoch + 1));
  set("panel", s.panel);
  set("speed", s.speed === DEFAULTS.speed ? null : String(s.speed));
  set("stretch", s.stretch === DEFAULTS.stretch ? null : s.stretch);
  set("invert", s.invert ? "1" : null);
  const ov = (s.overlays.gaia ? "g" : "") + (s.overlays.flags ? "f" : "") + (s.overlays.grid ? "r" : "");
  const ovDefault = (DEFAULTS.overlays.gaia ? "g" : "") + (DEFAULTS.overlays.flags ? "f" : "") + (DEFAULTS.overlays.grid ? "r" : "");
  set("ov", ov === ovDefault ? null : ov || "-");
  const out = p.toString();
  return out ? `?${out}` : "";
}

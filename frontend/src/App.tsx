import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "./components/AppShell/AppShell";
import { Drawer, type CustomizeValues } from "./components/Drawer/Drawer";
import { ObjectCard } from "./components/ObjectCard/ObjectCard";
import { SkyBackdrop } from "./components/SkyBackdrop/SkyBackdrop";
import { Toolbar } from "./components/Toolbar/Toolbar";
import { PlaybackBar } from "./components/PlaybackBar/PlaybackBar";
import { Shortcuts } from "./components/Shortcuts/Shortcuts";
import { SkyStage } from "./components/SkyStage/SkyStage";
import { StepGuide } from "./components/StepGuide/StepGuide";
import { Toast } from "./components/Toast/Toast";
import { TopBar } from "./components/TopBar/TopBar";
import type { ViewQuery, ViewSource } from "./data/source";
import { useIdle } from "./hooks/useIdle";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { usePlayback } from "./hooks/usePlayback";
import { useView } from "./hooks/useView";
import { DATA_CREDIT } from "./lib/brand";
import { readFlag, writeFlag } from "./lib/storage";
import { findPreset, type Preset } from "./lib/targets";
import { DEFAULTS, parseUrl, toSearch, type Panel, type ViewMode, type ViewState } from "./lib/url";

const GUIDE_KEY = "spherex-blink.guide-dismissed";
const DRAWER_W = 340;
const GUTTER = 16;
const RAIL_W = 52;
const CARD_W = 272;

function isTyping(el: EventTarget | null) {
  const t = el as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}

/** Elements that already use Space or arrows themselves. */
function ownsKeys(el: EventTarget | null) {
  const t = el as HTMLElement | null;
  if (!t) return false;
  return t.tagName === "BUTTON" || ["radio", "tab", "slider"].includes(t.getAttribute("role") ?? "");
}

export default function App({ source }: { source: ViewSource }) {
  const [url, setUrl] = useState<ViewState>(() => parseUrl(window.location.search));
  const [attempt, setAttempt] = useState(0);
  const [guideHidden, setGuideHidden] = useState(() => readFlag(GUIDE_KEY));
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const mobile = useMediaQuery("(max-width: 768px)");
  const wide = useMediaQuery("(min-width: 1101px)");

  const update = useCallback((patch: Partial<ViewState>) => setUrl((u) => ({ ...u, ...patch })), []);

  const query = useMemo<ViewQuery | null>(
    () =>
      url.ra === null || url.dec === null
        ? null
        : { ra: url.ra, dec: url.dec, fov_arcmin: url.fov, band: url.band, mode: "stack", presetId: url.target },
    [url.ra, url.dec, url.fov, url.band, url.target],
  );
  const load = useView(source, query, attempt);
  const view = load.kind === "ready" ? load.view : null;
  const epochs = view?.manifest.epochs ?? [];

  const pb = usePlayback(view?.viewId ?? "none", epochs.length, url.mode, url.speed, url.epoch);

  // The URL is the state. The epoch is written while paused so links point at a still frame.
  useEffect(() => {
    const next = toSearch({ ...url, epoch: pb.playing ? url.epoch : pb.index });
    try {
      window.history.replaceState(null, "", next || window.location.pathname);
    } catch {
      // Some embedded contexts block history writes; the app still works.
    }
  }, [url, pb.index, pb.playing]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const preset = findPreset(url.target);
  const drawerOpen = url.panel !== null;
  const idle = useIdle(pb.playing && !drawerOpen && !shortcutsOpen && !reducedMotion);

  const pickPreset = (p: Preset) => update({ ra: p.ra, dec: p.dec, fov: p.fov, band: p.band, target: p.id, epoch: 0 });
  const pickCoords = (ra: number, dec: number) => update({ ra, dec, target: null, epoch: 0 });
  const goHome = () => update({ ra: null, dec: null, target: null, epoch: 0, panel: null, mode: "all" });
  const toggleOverlay = (k: keyof ViewState["overlays"]) => update({ overlays: { ...url.overlays, [k]: !url.overlays[k] } });
  const fullscreen = () => {
    try {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen();
    } catch {
      // Fullscreen is blocked in some embeds.
    }
  };
  const openPanel = (panel: Panel | null) => update({ panel, mode: panel === null && url.mode === "inspect" ? "all" : url.mode });
  const setMode = (mode: ViewMode) => update({ mode, panel: mode === "inspect" ? "details" : url.panel });

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setToast("Link copied");
    } catch {
      setToast("Copy failed. Copy the address bar instead.");
    }
  };

  const customize: CustomizeValues = {
    fov: url.fov,
    speed: url.speed,
    stretch: url.stretch,
    band: url.band,
    invert: url.invert,
    overlays: url.overlays,
  };
  const resetCustomize = () =>
    update({
      fov: preset?.fov ?? DEFAULTS.fov,
      band: preset?.band ?? DEFAULTS.band,
      speed: DEFAULTS.speed,
      stretch: DEFAULTS.stretch,
      invert: DEFAULTS.invert,
      overlays: DEFAULTS.overlays,
    });

  const available = {
    gaia: false, // Needs GET /api/views/{id}/gaia.
    flags: !!view && view.masks.some((m) => m !== null),
    grid: !!view,
  };
  const overlays = {
    gaia: url.overlays.gaia && available.gaia,
    flags: url.overlays.flags && available.flags,
    grid: url.overlays.grid && available.grid,
  };

  // Keyboard shortcuts. Ignored while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      const k = e.key;
      if (k === "Escape") {
        if (shortcutsOpen) setShortcutsOpen(false);
        else if (drawerOpen) openPanel(null);
        return;
      }
      if (k === "?") return setShortcutsOpen((o) => !o);
      if ((k === " " || k === "ArrowLeft" || k === "ArrowRight") && ownsKeys(e.target)) return;
      if (k === " ") {
        e.preventDefault();
        pb.toggle();
      } else if (k === "ArrowLeft") {
        e.preventDefault();
        pb.prev();
      } else if (k === "ArrowRight") {
        e.preventDefault();
        pb.next();
      } else if ((k === "b" || k === "B") && epochs.length > 1) {
        setMode(url.mode === "blink" ? "all" : "blink");
      } else if ((k === "d" || k === "D") && epochs.length > 1) {
        setMode(url.mode === "diff" ? "all" : "diff");
      } else if (k === "c" || k === "C") {
        openPanel(url.panel === "customize" ? null : "customize");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const guideDone: [boolean, boolean, boolean] = [load.kind !== "idle", pb.played, pb.loops > 0];
  const showGuide = !guideHidden && !(mobile && drawerOpen);

  const status = view
    ? [
        view.label ?? null,
        view.manifest.catalog.collections.join(" + "),
        `${epochs.length} ${epochs.length === 1 ? "EPOCH" : "EPOCHS"}`,
        view.fromCache ? "FROM CACHE" : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : DATA_CREDIT;

  const inView = load.kind !== "idle";
  const showCard = inView && wide && url.ra !== null && url.dec !== null;
  const stageRight = mobile ? GUTTER : drawerOpen ? DRAWER_W + GUTTER * 2 : RAIL_W + GUTTER * 2;
  const stageLeft = showCard ? CARD_W + GUTTER * 2 : GUTTER;

  return (
    <AppShell
      idle={idle}
      stageLeft={stageLeft}
      stageRight={stageRight}
      backdrop={<SkyBackdrop dim={inView} />}
      hideBottom={mobile && drawerOpen}
      bottomReserve={mobile && drawerOpen ? Math.min(window.innerHeight * 0.55, 460) : 0}
      top={
        <>
          <TopBar
            activeTarget={url.target}
            onHome={goHome}
            onPreset={pickPreset}
            onCoords={pickCoords}
            onShare={share}
            shareDisabled={!query}
            onShortcuts={() => setShortcutsOpen((o) => !o)}
            shortcutsOpen={shortcutsOpen}
          />
          {showGuide && (
            <StepGuide
              done={guideDone}
              onDismiss={() => {
                setGuideHidden(true);
                writeFlag(GUIDE_KEY, true);
              }}
            />
          )}
        </>
      }
      stage={
        <SkyStage
          load={load}
          target={preset ?? null}
          ra={url.ra}
          dec={url.dec}
          fov={url.fov}
          showLabel={!drawerOpen}
          index={pb.index}
          mode={url.mode}
          stretch={url.stretch}
          invert={url.invert}
          overlays={overlays}
          gaia={null}
          onRetry={() => setAttempt((a) => a + 1)}
          onPreset={pickPreset}
        />
      }
      bottom={
        <PlaybackBar
          epochs={epochs}
          index={pb.index}
          sequence={pb.sequence}
          playing={pb.playing}
          canPlay={pb.canPlay}
          mode={url.mode}
          status={status}
          customizeOpen={url.panel === "customize"}
          onToggle={pb.toggle}
          onPrev={pb.prev}
          onNext={pb.next}
          onSeek={pb.seek}
          onMode={setMode}
          onCustomize={() => openPanel(url.panel === "customize" ? null : "customize")}
        />
      }
      overlays={
        <>
          {showCard && url.ra !== null && url.dec !== null && <ObjectCard target={preset ?? null} position={{ ra: url.ra, dec: url.dec }} />}
          {!mobile && (
            <Toolbar
              groups={[
                [
                  { id: "customize", label: "Customize", icon: "sliders", expanded: url.panel === "customize", shortcut: "C", onClick: () => openPanel(url.panel === "customize" ? null : "customize") },
                  { id: "details", label: "Details", icon: "info", expanded: url.panel === "details", onClick: () => openPanel(url.panel === "details" ? null : "details") },
                ],
                [
                  { id: "grid", label: "RA, Dec grid on the image", icon: "grid", pressed: overlays.grid, disabled: !available.grid, onClick: () => toggleOverlay("grid") },
                  { id: "gaia", label: "Gaia positions", icon: "gaia", pressed: overlays.gaia, disabled: !available.gaia, onClick: () => toggleOverlay("gaia") },
                  { id: "flags", label: "Flagged pixels", icon: "flag", pressed: overlays.flags, disabled: !available.flags, onClick: () => toggleOverlay("flags") },
                  { id: "invert", label: "Invert", icon: "invert", pressed: url.invert, disabled: !view, onClick: () => update({ invert: !url.invert }) },
                ],
                [
                  { id: "home", label: "Whole sky", icon: "globe", onClick: goHome },
                  { id: "fullscreen", label: "Full screen", icon: "fullscreen", onClick: fullscreen },
                ],
              ]}
            />
          )}
          {drawerOpen && url.panel && (
            <Drawer
              panel={url.panel}
              onPanel={(p) => openPanel(p)}
              onClose={() => openPanel(null)}
              values={customize}
              onChange={(v) => update(v)}
              onReset={resetCustomize}
              view={view}
              index={pb.index}
              available={available}
            />
          )}
          {shortcutsOpen && <Shortcuts />}
          <Toast message={toast} />
        </>
      }
    />
  );
}

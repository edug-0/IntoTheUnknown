import type { Band, FovArcmin } from "../types";

export interface Preset {
  id: string;
  name: string;
  /** Short label for the chip row. */
  short: string;
  kind: "motion" | "variability";
  ra: number;
  dec: number;
  fov: FovArcmin;
  band: Band;
}

// Centring positions from docs/PLAN.md section 6 (propagated to 2026.0). Bands use the plan's
// preset where it is a valid request band; otherwise "auto". Replace with GET /api/targets when it ships.
export const PRESETS: readonly Preset[] = [
  { id: "barnard", name: "Barnard's Star", short: "Barnard", kind: "motion", ra: 269.44627, dec: 4.7682, fov: 6, band: "B1-B2" },
  { id: "eps-ind-b", name: "Epsilon Indi B", short: "ε Indi B", kind: "motion", ra: 331.09665, dec: -56.80066, fov: 6, band: "auto" },
  { id: "wise-0855", name: "WISE 0855-0714", short: "WISE 0855", kind: "motion", ra: 133.7599, dec: -7.2422, fov: 6, band: "B6" },
  { id: "rw-aur", name: "RW Aurigae", short: "RW Aur", kind: "variability", ra: 76.95608, dec: 30.40113, fov: 6, band: "auto" },
  { id: "r-dra", name: "R Draconis", short: "R Dra", kind: "variability", ra: 248.16723, dec: 66.75502, fov: 6, band: "auto" },
];

export function findPreset(id: string | null | undefined): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}

/** Match free text against preset names, case and punctuation insensitive. */
export function matchPresetName(text: string): Preset | undefined {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9ε]/g, "").replace("epsilon", "ε").replace("eps", "ε");
  const q = norm(text);
  if (!q) return undefined;
  return PRESETS.find((p) => norm(p.name) === q || norm(p.short) === q || norm(p.id) === q);
}

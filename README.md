# SPHEREx Blink

A web tool for the NASA Space Apps 2026 **Planet X and SPHEREx** challenge. Enter a sky position and it plays
SPHEREx images of that patch as a short animation, so moving and changing objects stand out.

## Run it

```bash
python3 server.py          # Python 3.8+, standard library only
# open http://localhost:8000
```

`server.py` serves the page and forwards requests to IRSA, VizieR and CDS, so the browser never runs into
cross-origin (CORS) blocks. It also caches downloaded cutouts in `./cache`. Opening `index.html` directly
works too, but then the browser may block archive requests, and the app switches to its simulated sky.

## What it does

| Challenge ask | How the tool handles it |
|---|---|
| Enter RA/Dec, play images like a video | RA/Dec in degrees or sexagesimal, or a name resolved by CDS Sesame. Play, pause, step and fps controls; ← → and space keys. |
| Test targets | One-click presets for Barnard's Star, ε Indi B, WISE 0855, RW Aur and R Dra, with proper motion and parallax. |
| Easy to update with new releases | Queries IRSA's TAP tables `spherex.plane`/`spherex.artifact`, which cover every ingested release, so new weekly data appears automatically. When one exposure exists in several releases, the newest wins (`CONFIG.RELEASE_RANK`). |
| Use the 102 bands / stack per detector | Choose any of the 6 detector arrays; each frame is a sky-subtracted median or mean of its exposures. A 3-color mode maps D1–2 to blue, D3–4 to green and D5–6 to red, so cold brown dwarfs look red. |
| Spectra on the fly | Aperture photometry in every exposure, plotted against the per-pixel wavelength from each file's `WCS-WAVE` table, colored by season. Click anywhere to measure there. |
| Add or subtract images | Frames per season, per visit or per exposure. Difference mode shows each frame minus the first frame, the mean, or the previous frame. A mover appears as a red/blue pair. |
| Choose field of view | 2′ to 30′. Shows the download estimate before fetching. |
| Overlay other telescopes | Gaia DR3 stars, moved to each frame's date using their proper motions. Aladin Lite context tab with AllWISE, 2MASS, DSS and Pan-STARRS. |
| Coordinates in the URL | Example: `?ra=133.79513&dec=-7.24515&pmra=-8123.7&pmdec=673.2&plx=439&epoch=2010.33&fov=4`. Add `&embed=1` for a bare player to embed in an iframe. |
| Metadata and contamination flags | The Exposures tab lists date, detector, wavelength, release, masked fraction and FLAGS status, with links to the cutout and full file. |

The target's predicted path, including parallax, is drawn as a dashed track with a marker at each frame's date.
The Light curve tab normalizes each detector, so variable stars stand out.

## How it works

1. **Search.** An ADQL query to `https://irsa.ipac.caltech.edu/TAP/sync` finds every spectral image whose footprint
   contains the point. This follows the IRSA SPHEREx cutouts tutorial.
2. **Pick.** Exposures are grouped into survey seasons (gaps of more than 45 days). The tool keeps up to N per detector per season.
3. **Cutouts.** It requests `<file URL>?center=<ra>,<dec>d&size=<deg>` from IRSA's cutout service, gunzipping if needed.
4. **Parse.** A small built-in FITS reader handles IMAGE, ZODI, FLAGS and the WCS-WAVE binary table. The zodiacal model is subtracted.
5. **Reproject.** Each cutout is resampled through its TAN-SIP WCS onto one shared north-up grid at 6.15″/pixel.
   SPHEREx rolls between visits, so this step lets frames line up.
6. **Combine, stretch and display** in the browser. Everything after the download runs client-side.

## Status

- The **live path has been tested only against a mock archive.** The mock serves FITS files built from the documented
  SPHEREx format: rotated TAN-SIP WCS, ZODI, tile-compressed FLAGS, WCS-WAVE, and duplicate releases. In that test, star
  positions landed within 0.4 px on average, wavelengths matched exactly, and older release versions were dropped.
  The build machine couldn't reach IRSA, so **the first thing to do is load a preset with `server.py` running.**
- Two assumptions to check against real files:
  - **Detector offset of a cutout.** The wavelength lookup reads it from the alternate WCS `A` keywords
    (`CRPIX1A`/`CRVAL1A`). If those are missing, it uses the detector band centre and labels the wavelength source as such.
  - **FLAGS extension.** It is tile-compressed in full files and is reported as such. If cutouts carry it uncompressed,
    the flagged fraction is shown. To blank pixels, set the bits in `FLAG_MASK_BITS` once the bit meanings are confirmed
    from the Explanatory Supplement.
- **Simulated mode** is a synthetic sky. It uses each target's real proper motion and parallax, a model spectrum, and an
  asteroid crossing one season. It's clearly labelled, and it's useful for demoing offline.

## Files

- `index.html` — the whole app: HTML, CSS and JavaScript with no build step. The `CONFIG` block at the top holds endpoints and tunables.
- `server.py` — static server plus archive proxy and cutout cache.
- `tests/` — the mock IRSA server and the Playwright end-to-end test used during development.

Data: NASA/IPAC Infrared Science Archive (SPHEREx), ESA Gaia DR3 via CDS VizieR, CDS Sesame and Aladin Lite.

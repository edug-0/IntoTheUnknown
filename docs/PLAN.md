# Wanderer: SPHEREx blink comparator (hackathon plan)

NASA Space Apps 2026 · "Planet X and SPHEREx" · local "Best Use of Azure"
Written Sat 2026-11-14. **This is the plan only. Nothing is built yet.** Open for team review.
Markers: **✓** = checked today against a live source. **(lit.)** = from literature or memory; confirm before quoting it in the pitch.

---

## 1. Current state (checked 2026-11-14)

| Topic | Brief said | Checked today | Consequence |
|---|---|---|---|
| Releases | dr1, dr1_deep, qr3, qr3_deep; QR2 superseded; DR1 due Nov 2026 | ✓ DR1 is out (Nov 2026). A 5th collection exists: `spherex_dr1_cube` (All-Sky Cube) and must be excluded from frame queries. QR2 can no longer be searched (download only until Feb 2027). QR1 is retired. **DR1 = Surveys 1–2. QR3 = Surveys 3–4**, released weekly since Sep 2026. | Select collections with a regex that drops `_cube`. Query the union of dr1 and qr3. |
| Epochs per patch | 3–4 passes | Survey 4 has only just started, so **most positions have 2–3 epochs now**. Positions near the ecliptic poles have many more (R Dra is at ecliptic latitude β≈+81°). | Design for a minimum of 2 epochs. The UI must handle a position with only 1. |
| Pixels / detectors | ~6″ | ✓ 6.15″/px, 2040×2040, 6 detectors | — |
| Bands | B1–B6 edges | ✓ Same edges. R = 39 / 41 / 41 / 35 / 112 / 128 | — |
| FITS layout | IMAGE, FLAGS, VARIANCE, ZODI, EPSF, WCS-WAVE | ✓ FLAGS is an int32 `CompImageHDU`. ZODI is **not** subtracted in Level 2 images (it is subtracted in the cube). EPSF holds 441 rows of 33×33 PSFs at 5× oversampling. WCS-WAVE is accurate to about 1 nm (fine for display). | Subtract ZODI ourselves. |
| Flags | 12 named bits | ✓ There are **22 bits**. Names and descriptions are stored in the FLAGS header as `MSKNnn`/`MSKDnn`, so **parse them at runtime and don't hard-code bit numbers**. SOURCE (bit 21) marks real sources and must **not** be masked. The tutorial's good-pixel rule is flags ∈ {0, SOURCE, OVERFLOW}. | §5 mask policy |
| Query | query_sia + TAP join | ✓ Exact code confirmed (§11). TAP queries took **20–37 s** in the tutorials. The SIA index lags about a day. | Use SIA on the user path. Use TAP for the watcher and as a fallback. |
| Cutouts | URL pattern, 10 workers | ✓ URL `…?center=<ra>,<dec>d&size=<deg>`. Timing confirmed (0.22 vs 2.26 min), **but the parallel run lost 16 of 84 cutouts and the tutorial has no retry logic**. Each cutout also carries the full EPSF table unmodified (about **3.8 MB per cutout**, by our arithmetic). | Add retries and a fallback (§11). Use band presets to keep fetch counts down. |
| **IRSA right now** | — | **SIA and TAP returned HTTP 502 for this whole session.** IRSA's static pages are up. | **Build the golden cache as soon as IRSA responds (§2 "Start here")** |
| CORS | assume none | IRSA could not be tested because of the 502s. The **AWS mirror `nasa-irsa-spherex` (us-east-1) is up**: anonymous access, `Access-Control-Allow-Origin: *`, and **the same path layout as IRSA's `ibe/data/spherex/…`** ✓ (e.g. `dr1/level2/2025W17_4B/l2b-v27-2026-196/1/level2_…_spx_l2b-v27-2026-196.fits`, 65 MB). | The backend still proxies everything. S3 becomes the fallback source for pixels. |
| Target coordinates | from SIMBAD | SIMBAD/CDS returns 404 today, so astrometry came from the **Gaia DR3 TAP, which works** ✓. **J2000 coordinates are arcminutes off for the movers.** Barnard's Star has moved about 4.6′ north since J2000 (1.7′ since Gaia's 2016 epoch). WISE 0855 is about 2′ west of its designation coordinates. | Propagate to the observation epoch. Never centre a view on J2000 coordinates. |
| Expected shift | "a couple of px" | With the ~1-year baseline available today: Barnard's 1.7 px, WISE 0855 1.3 px, ε Ind B 0.76 px. On top of that, a parallax wobble of up to ~2ϖ (0.18 px or less) between 6-month epochs (§5.6). | Use blink, a difference image, and measured centroids. |
| CDN | Front Door vs classic | ✓ Classic Azure CDN (Microsoft) accepts **no new profiles since Aug 15 2025** and retires Sep 30 2027. Front Door classic also accepts no new profiles. **Front Door Standard costs $35/month, billed hourly.** | Serve from Blob directly first. Add Front Door Standard on Sunday only if there's time (§4). |
| Azure for Students | — | ✓ $100 credit for 12 months. Always free: Container Apps 180k vCPU-s + 360k GiB-s + 2M requests per month; Functions 1M requests; Cosmos 1000 RU/s + 25 GB; SWA free; **ACR Standard free for 12 months**. ✓ Flex Consumption is the recommended Functions plan; students get **15 cores per region**; `WEBSITE_TIME_ZONE` is **not supported** (use UTC cron). Region policy: not stated in the docs we read, so check it with the CLI. Azure OpenAI is mentioned, but no free amount is listed and availability is unverified. | §8 runbook |
| Local tools | — | python 3.13, node, gh and uv are installed. **az, func, swa and docker are missing.** | Install them or use Azure Cloud Shell. Build images in GitHub Actions. |
| Not verified | — | The Space Apps challenge and resources tabs render with JavaScript, so we got no content. The submission form fields are unread. WiseView refused connections. We captured only the first words of the exact SPHEREx acknowledgement. Cutout `size` units are implied to be degrees by the tutorial. | One person opens these in a browser at H0 (§7). |

---

## 2. The project in plain English

**What we're building.** A website where you type a sky position, or pick one of 5 famous objects, and see that patch of sky as SPHEREx saw it on each of its passes, played like a GIF.
- Things that **move** jump between frames: nearby stars and brown dwarfs.
- Things that **vary** flicker: young stars and pulsating giants.

There's a second axis, wavelength. Each pass contains frames at up to 102 infrared "colours", so you can also scrub through colour and watch, for example, a brown dwarf vanish in a methane band.

**Why it's needed.**
- WISE/NEOWISE, the data behind WiseView and the Backyard Worlds brown-dwarf discoveries, stopped observing in Aug 2024 (lit.).
- SPHEREx is the active infrared all-sky survey now, but its data is 65 MB multi-extension FITS files, queried through Python.
- No tool lets a non-expert answer "did anything move here?" in one click.

**Who uses it.**
- Citizen scientists first.
- Teachers and students, who can see proper motion and parallax in real data.
- Astronomers who want a quick look before downloading anything.

**What we can realistically ship in 30 h.**
- **MVP:** flipbook, per-epoch stacking, difference mode, shareable URL. All 5 targets are served from a pre-computed cache. Arbitrary positions work live whenever IRSA is up.
- **Hook:** the Gaia "should be here" overlay. A mover Gaia can't explain is a candidate.
- **Stretch:** light curves, then brown-dwarf colour mode.

**Planet X geometry (a good science point for the pitch, from our own analysis).** SPHEREx always observes about 90° from the Sun. That means consecutive 6-month visits see the sky from opposite sides of Earth's orbit, so parallax is maximal.
- A Planet X at distance D AU jumps by about **2/D radians** between consecutive surveys: roughly 14′ at 500 AU. That's larger than a typical cutout, so it would show up as an object present in one epoch and missing in the next, not as a smooth mover.
- Comparing epochs **one year apart** (same side of the orbit) cancels the parallax, leaving only orbital motion: about 2′/yr at 500 AU.
- So our blink finds nearby stars and brown dwarfs. A Planet X search needs a "same-side, wide-FOV" mode (stretch). A Planet-Nine-like body is probably below SPHEREx's single-epoch depth anyway, and the pitch should say so honestly.

### Start here (first 3 hours, in this order)
1. **Golden-capture loop (data owner, immediately).** IRSA's query APIs are down. Write `scripts/precache.py --retry-every 10m`. As soon as IRSA answers, it saves the frame lists and cutouts for all 5 targets. While waiting, develop the pipeline against one real 65 MB file from the S3 mirror.
2. **Freeze the contracts (everyone, 45 min).** Write the `manifest.json` schema and endpoint shapes (§4.3) as Pydantic models plus TypeScript types. The frontend then builds against a mock manifest, so 5 people can work in parallel.
3. **Azure preflight (Azure owner).** Install az. Read the allowed-regions policy. Create the resource group, storage, Container Apps environment and SWA. Test whether the tenant allows an app registration for GitHub OIDC. This surfaces policy blockers in hour 1, not hour 11.
4. **Barnard's Star spike (data and science owners, in a notebook).** The riskiest unknown is the data itself: is a stacked epoch clean, is the star's core saturated or flagged, and does the ~1.7 px hop show? Answer that before writing much backend.

---

## 3. Product

**Name ideas:**
- **Wanderer** (recommended; "planet" comes from the Greek for "wanderer")
- BlinkX
- Driftwatch
- SpectraFlip

**One-line pitch:** "Type any spot on the sky and watch it move in 102 infrared colours. Wanderer blinks NASA's newest all-sky survey, predicts where every Gaia star should be, and flags the movers nobody can explain."

**How it beats WiseView.** WiseView itself was unreachable today, so this comparison uses only facts on our side.

| | WiseView (unWISE/NEOWISE) | Wanderer (SPHEREx) |
|---|---|---|
| Data freshness | Frozen; NEOWISE ended in 2024 (lit.) | Live mission with weekly ingest; **updates itself** |
| Colours | 2 bands (W1/W2) | 102 channels: per-pixel spectrum, methane colour mode |
| Explaining motion | — | Gaia DR3 prediction per epoch, **including parallax**, with "explained" vs "unexplained" badges |
| Variability | — | Light-curve panel |
| Sharing | URL | URL plus an embeddable iframe and a "report candidate" board |

**Where we're weaker:**
- Pixels are 6.15″ vs 2.75″ for unWISE.
- The baseline is ~1 yr, against 14 for WISE.
- SPHEREx is shallower at 4.6 µm.

So we position Wanderer as a complement: every view gets an **"Open in WiseView" link-out**.

---

## 4. Architecture

### 4.1 Diagram
```
                 ┌──────────────────────────── Azure ─────────────────────────────┐
 Browser ──────► │ Static Web Apps (Free): React app + /golden/* baked snapshots  │
   │             │                                                                │
   │ POST/GET    │ Container Apps (Consumption): FastAPI "api"                    │
   └──/api/*───► │   query (SIA→TAP) · fetch cutouts (IRSA→S3 fallback)           │──► IRSA SIA/TAP/cutouts
   │             │   stack · diff · render · Gaia · photometry · jobs             │──► AWS S3 nasa-irsa-spherex
   │             │        │ writes (managed identity)                             │──► Gaia DR3 TAP (ESA; MAST fallback)
   │             │        ▼                                                       │
   └─frames────► │ Blob Storage  frames/ (public read): q/ pointers, r/ renders,  │
     (optional   │               meta/catalog.json   state/ (private): jobs       │
     Front Door  │        ▲                                                       │
     Std edge)   │ Functions (Flex, Python): timer 06:00 UTC + HTTP "run-now"     │──► IRSA list_collections + TAP MAX(t)
                 │   diff catalog → POST api /internal/refresh                    │
                 │ Cosmos DB (free tier): candidate reports                       │
                 │ Application Insights: requests, IRSA dependencies, cache hits  │
                 └────────────────────────────────────────────────────────────────┘
```

### 4.2 Azure resources: each one solves a named problem
| Resource | Problem it solves | Tier |
|---|---|---|
| Static Web Apps (Free) | Global, zero-ops hosting for the UI. It also carries **golden snapshots of the 5 targets**, so judging works even when the API, IRSA or Blob is down. | MVP |
| Container Apps (+ ACR) | Heavy scientific Python (astropy, reproject) on scale-to-zero compute that holds long jobs. Min replicas set to 1 only during judging. | MVP |
| Blob Storage | **Speed.** The first render of a view takes 30–60 s; a repeat load from Blob takes under 1 s. Also stores job state and catalog state. | MVP |
| Functions (Flex Consumption) | **Freshness.** A daily catalog diff re-renders cached views when SPHEREx adds data. An HTTP "run-now" trigger lets us demo it live. | MVP |
| Application Insights | **Observability.** p50/p95 latency, IRSA dependency failures and cache-hit ratio. These are the numbers on the Azure slide. | MVP |
| Cosmos DB (free tier) | **Discovery.** A queryable board of community candidate reports. Only wired up if Tier 3 "Report" ships; it takes 5 minutes to create. | T3 |
| Front Door Standard (optional) | Edge caching of immutable frames near viewers, plus a single domain. **Sunday only**, and delete it after local judging ($35/month). | T2 |
| Managed identity | Removes storage secrets. It's a feature, not a resource. | MVP |
| ~~Durable Functions~~ | **Cut.** A ThreadPool already gives a 10× speedup, so this would be decorative. | — |
| ~~Azure OpenAI~~ | **Cut first.** Use deterministic template captions from measured numbers instead (§5.9). Revisit only if everything else is done and the subscription allows it. | — |

### 4.3 Backend endpoints

All responses are JSON. Example values are illustrative.

```
GET  /api/health      → {"ok":true,"version":"0.3.0","irsa":"up|degraded|down","catalog_version":"c20261114-4-61350"}
GET  /api/targets     → [{"id":"barnard","name":"Barnard's Star","kind":"motion","ra":269.448503,"dec":4.739420,
                          "ref_epoch":2016.0,"pmra":-801.55,"pmdec":10362.39,"plx":546.98,"fov_arcmin":6,"band":"B1-B2"}]
POST /api/views       ← {"ra":269.4463,"dec":4.7682,"fov_arcmin":6,"band":"auto|B1..B6|B1-B2|B1-B3|all","mode":"stack|frames"}
                      → 200 {"view_id":"<qk>","status":"ready","manifest_url":"<FRAMES_BASE>/r/<rk>/manifest.json"}
                      → 202 {"view_id":"<qk>","status":"queued","status_url":"/api/views/<qk>"}
GET  /api/views/{id}  → {"status":"queued|query|fetch|stack|render|ready|error","progress":{"done":41,"total":96},
                         "manifest_url":"…","error":{"code":"IRSA_DOWN","message":"…"}}
GET  /api/views/{id}/gaia        → {"epochs_mjd":[…],"stars":[{"source_id":…,"g":8.19,"pmra":…,"pmdec":…,"plx":…,
                                     "track_px":[[x,y],…],"matched":[true,true,true]}],"unexplained":[{"x":…,"y":…,"shift_px":1.3}]}
GET  /api/views/{id}/spectrum?x=&y=&epoch=   → {"points":[{"lambda_um":…,"bw_um":…,"flux_mjysr":…,"err":…,"t_mjd":…,"detector":…,"flagged":false}]}
GET  /api/views/{id}/lightcurve?x=&y=&r_px=2 → {"points":[{"t_mjd":…,"lambda_um":…,"flux_ujy":…,"err":…,"flagged":false}],
                                                "comparison":{"n_stars":6,"rms_frac":0.03}}
POST /api/candidates  ← {"view_id","ra","dec","epochs":[0,2],"evidence":["…/e0.png","…/e2.png"],"notes","handle"} → 201 {"id"}
GET  /api/candidates?near=ra,dec&radius_deg=1 → [...]
GET  /api/status      → {"catalog":{"collections":[…],"latest_frame_mjd":…,"checked_at":…}}
POST /internal/refresh  (X-Refresh-Key) ← {"reason":"catalog_change","catalog_version":"…"} → 202 {"queued":7}
```

**Manifest** (static file in Blob, immutable):
```json
{"schema":1,"render_key":"…","source":"irsa|s3|golden","pipeline_version":1,"created_at":"…",
 "query":{"ra":…,"dec":…,"fov_arcmin":6,"band":"B1-B2"},
 "grid":{"nx":59,"ny":59,"pix_arcsec":6.15,"wcs":{"CTYPE1":"RA---TAN","CRVAL1":…,"CDELT1":-0.001708,"…":"…"}},
 "catalog":{"version":"…","collections":["spherex_dr1","spherex_qr3"]},
 "stretch":{"kind":"asinh","vmin":…,"vmax":…,"beta":…},
 "epochs":[{"i":0,"label":"2025-09","t_start":"…","t_end":"…","t_mean_mjd":…,"n_frames":34,"detectors":[1,2],
            "lambda_um":[0.75,1.62],"channels":30,"flagged_px":{"HOT":3,"PERSIST":12},
            "astrom_resid_px":0.07,"phot_scale":1.00,"image":"e0.f32","mask":"e0.mask.u8","png":"e0.png"}],
 "frames":[{"obs":"level2_2025W36_1B_0012_1D1","t_mjd":…,"detector":1,"lambda_um":0.912,"epoch":0,"collection":"spherex_dr1"}],
 "extras":{"gaia":"gaia.json","lightcurve":null,"cube":null}}
```

- **Images are shipped as raw little-endian float32**, one `.f32` per epoch. A 59×59 image is about 14 KB.
- The **client** does the stretch, blink, difference and flag overlay on a canvas, so the sliders are instant.
- PNGs exist for sharing, previews and GIF export.
- Arrays follow FITS orientation (row 0 = south), so the client flips them vertically. Grid orientation is north up, east left.

### 4.4 Cache keys (two levels)
- **Query key** `qk = sha256("q1|{ra:.4f}|{dec:+.4f}|{fov}|{band}")[:20]`.
  - The `.4f` precision is 0.36″ (0.06 px).
  - FOV must be one of {2, 4, 6, 10, 15}′; band must be one of the enum values.
  - The pointer `frames/q/{qk}.json` holds `{render_key, catalog_version}` with `Cache-Control: max-age=60`.
- **Render key** `rk = sha256(pipeline_version | qk | sorted(frame_ids))[:24]`.
  - The folder `frames/r/{rk}/` is **immutable**: `max-age=31536000, immutable`.
  - The manifest is written last, then the pointer is swapped, so readers never see a half-written render.
- **Effect:**
  - New SPHEREx frames produce a new frame set, hence a new `rk`, a fresh render and a pointer swap.
  - Old renders stay valid, so candidate evidence links never break. `&r=<rk>` in a URL pins an exact render.
- **Stale-while-revalidate:** if the pointer's `catalog_version` is older than `meta/catalog.json`, serve the cached view and queue a refresh.
- **Golden layer:** the same manifests and arrays for the 5 targets are baked into `web/public/golden/<id>/`. Presets load from there first, which needs zero backend.

### 4.5 How a new release is picked up with zero code changes
1. **Watcher (daily, 06:00 UTC):**
   - Get `list_collections(servicetype='SIA', filter='spherex')` and keep names matching `^spherex_(dr|qr)\d+(_deep)?$`.
   - Run TAP `SELECT MAX(time_bounds_lower) FROM spherex.plane`.
   - Compare both with `meta/catalog.json`.
2. **If anything changed:** write a new `catalog_version`, then `POST /internal/refresh`.
3. **API:** for the pinned views (the 5 targets plus the top-N most requested), re-query frames. Where the frame set changed, re-render and swap the pointer.
4. **Overlapping releases** (e.g. a future DR2 reprocessing QR3 data): dedupe by frame stem (`level2_<obs>_<det>`). Prefer DR over QR, then the higher number, then the later processing date (this also handles `l2b_retry-*` directories).
5. **UI badge:** "Data: spherex_dr1 + spherex_qr3 · checked 06:00 UTC today."

---

## 5. Image processing

### 5.1 Frame selection
- **Band presets** keep fetch counts down. Each cutout is about 4 MB, and a mid-latitude position has roughly 100–450 frames.
- Defaults:
  - Barnard's Star: `B1-B2`
  - ε Ind B: `B2-B3`
  - WISE 0855: `B6` (4.42–5.0 µm)
  - Variables: per band
- `all` mode is capped at 2 frames per channel per epoch.
- Request cutouts with `size = FOV + 1′` margin so reprojection fills the edges.

### 5.2 Epoch grouping
- Sort frames by `t_mjd`. Start a new epoch when the gap exceeds **20 days**.
- Split any cluster longer than **40 days** into ~30-day bins. Polar targets like R Dra are observed almost continuously, so this matters there.
- Label each epoch by its mean date.

### 5.3 Per-frame cleaning
1. `IMAGE − ZODI`.
2. Mask using the `MSKN*` names: **mask everything except** {SOURCE, OVERFLOW, NONLINEAR, FULLSAMPLE, HALO, BLOOM}. HALO and BLOOM are shown in the flag overlay but not masked, because masking them would erase bright stars' wings.
3. Subtract the residual sky: the sigma-clipped median of the unmasked pixels.
4. Record the wavelength at the target pixel with `WCS(hdr, fobj=hdul, key="W")` and `sip=None`. A 60-px cutout spans only about half a channel of the linear variable filter, so each cutout is effectively monochromatic at λ(target).
5. **Tune the mask on the 5 targets.** Check that OUTLIER and TRANSIENT don't eat the movers: the target pixel must be unmasked in more than 50% of frames.

### 5.4 Common grid and alignment
- One TAN grid per view: centred on the query, 6.15″/px, N×N with N odd, north up.
- `reproject_interp` each frame's image, variance and mask (mask is bad where the reprojected value exceeds 0.25), using the frame's full WCS including SIP.
- **Alignment check:** take centroids of Gaia-matched, non-high-PM field stars in each epoch stack and compare them with predictions.
  - If the mean offset exceeds 0.15 px, re-reproject with corrected CRPIX.
  - Show `astrom_resid_px` in the metadata panel.

### 5.5 Stacking (handles the wavelength-per-pixel issue)
- **Channel-matched stack.**
  - Assign each frame to a channel bin: (detector, k), with k = floor(17·ln(λ/λ_lo)/ln(λ_hi/λ_lo)), log-spaced because R is roughly constant.
  - Within each epoch, take an inverse-variance mean per channel.
  - Average the channels **common to all epochs** with equal weight.
  - Result: every epoch has the **same effective bandpass**, so a blink compares like with like even though the source fell at different wavelengths on each visit.
  - If no channel is common to all epochs, fall back to the union and set `bandpass_matched=false` in the manifest.
- **Photometric scale:** compute `phot_scale` = the median ratio of field-star fluxes relative to epoch 0. Apply it for blink and difference; it should be about 1.00 ± 0.05, otherwise warn. This doesn't hide the target's own variability, because the normalisation uses field stars.
- **Fallback (cut checkpoint H6):** an unmatched inverse-variance mean.

### 5.6 Stretch
- Pool the finite pixels of all epoch stacks.
- sky = sigma-clipped median; σ = MAD × 1.4826.
- vmin = sky − 2σ; vmax = 99.7th percentile; β = 3σ.
- y = asinh((x − vmin)/β) / asinh((vmax − vmin)/β), clipped to [0, 1].
- The **same (vmin, vmax, β) applies to every epoch**. The client sliders move all epochs together ("locked stretch").

### 5.7 Difference mode
- D = S_B − phot_scale · S_A, displayed with a diverging colormap at ±kσ_D.
- A moving star shows up as a **dipole**: negative where it was, positive where it is now. A variable shows a **monopole**.
- Channel matching keeps PSF-mismatch rings small.
- A UI hint explains how to read dipoles and warns about asteroids near the ecliptic.

### 5.8 Gaia proper-motion propagation
- **Query** the Gaia DR3 TAP (ESA, verified working; MAST as fallback):
  `SELECT source_id, ra, dec, pmra, pmdec, parallax, radial_velocity, phot_g_mean_mag FROM gaiadr3.gaia_source WHERE 1=CONTAINS(POINT(ra,dec), CIRCLE(ra0,dec0,r)) AND phot_g_mean_mag < 20.5`
  with r = FOV·√2/2 + 2′, so fast movers that wander in are caught. Cache the result per view.
- **For each epoch time t** (the mean MJD of that epoch's frames), with Δt = t − J2016.0 (TCB):
  1. **Space motion:** δ(t) = δ₀ + μ_δ·Δt and α(t) = α₀ + μ_α*·Δt / cos δ₀. In code, use astropy `apply_space_motion`, which also includes perspective acceleration (~0.01 px for Barnard's: negligible, but it costs nothing).
  2. **Parallax:** use Earth's barycentric position (X, Y, Z) in AU from `get_body_barycentric('earth', t)`. SPHEREx's low-orbit offset from Earth is under 5e-5 AU, so ignore it.
     - Δα* = ϖ (X sin α − Y cos α)
     - Δδ  = ϖ (X cos α sin δ + Y sin α sin δ − Z cos δ)
  3. **No aberration or light deflection.** The SPHEREx WCS is tied to Gaia astrometric positions, so these are absorbed. Pitfall: `transform_to(GCRS)` adds about 20″ of aberration, which would put every prediction about 3 px off.
  4. Convert to pixels with `grid_wcs.world_to_pixel`. Draw markers per epoch, plus a motion arrow from the first to the last epoch with a ×N toggle.
- **Edge cases:**
  - Parallax ≤ 0 or missing: use proper motion only.
  - 2-parameter Gaia solutions (no proper motion): treat as static.
- **Why parallax shows up here:** SPHEREx's 90° viewing geometry means 6-month pairs differ by up to 2ϖ (Barnard's: 1.09″ = 0.18 px). One-year pairs cancel it.
- **Explained vs unexplained:**
  - Detect sources in each epoch stack with `sep` at 5σ.
  - Associate them across epochs with Hungarian matching (the ByteTrack instinct, but with 2–3 epochs nothing learned is needed).
  - A detection within **1.0 px** of a Gaia track counts as explained.
  - **A source with consistent motion of 0.5 px or more and no Gaia track becomes a candidate.** Two epochs require a dipole with S/N > 10; three epochs require linear motion.
  - Always link out to SIMBAD and IRSA MOST (for asteroids). We never claim a discovery.

### 5.9 Light curve, spectrum, colour mode, captions
- **Light curve (T2):**
  - Forced aperture photometry on **every frame** at the propagated position: r = 2 px, annulus 4–7 px, after zodi subtraction.
  - Convert MJy/sr to µJy using the nominal pixel solid angle. The DR1 `solid_angle_pixel_map` product exists if there's time.
  - Plot flux against time, coloured by λ.
  - The same photometry on 3–6 field stars gives a "calibration floor" band.
  - Points with flagged pixels in the aperture are drawn hollow.
- **Spectrum on click (T2):** read the clicked grid pixel from each reprojected frame in the chosen epoch, giving (λ, flux, error) points. `all` mode, or the cube extra, is needed for full 0.75–5 µm coverage.
- **Brown-dwarf colour mode (T3):**
  - R = 4.42–5.0 µm, G = 3.83–4.41 µm, B = 3.15–3.45 µm (the CH₄ band).
  - Cold T and Y dwarfs (ε Ind B, WISE 0855) should look red. Barnard's (M4) should look neutral. That's a built-in test of the mode itself.
- **Captions:** deterministic templates, e.g. *"Moved 10.2″ (1.66 px) N between 2025-09 and 2026-09 · Gaia predicts 10.4″ · match."* If Azure OpenAI is ever added, every number in its output must appear in the input JSON; otherwise fall back to the template.

---

## 6. Validation targets

Gaia DR3 values are ✓, queried today. Shifts are computed at 6.15″/px.

| Target | Gaia DR3 at J2016.0 | μα*, μδ (mas/yr) | ϖ (mas) | \|μ\| ″/yr, PA | Shift over 6 mo / 1 yr | 2ϖ wobble | β | Preset |
|---|---|---|---|---|---|---|---|---|
| Barnard's Star | 4472832130942575872 · 269.448503, +4.739420 · G 8.19 | −801.6, +10362.4 | 547.0 | 10.39, 356° (N) | 0.85 / **1.69 px** | 0.18 px | +28° | B1-B2 |
| ε Indi B | 6412596012146801152 · 331.076453, −56.793812 · G 18.03 | +3982.0, −2466.8 | 270.7 | 4.68, 122° (ESE) | 0.38 / **0.76 px** | 0.09 px | −42° | B2-B3 |
| WISE 0855−0714 | **not in Gaia** ✓ (no source with \|μ\| > 1″/yr within 3′) | ≈ −8120, +680 (lit.) | ≈ 439 (lit.) | ≈ 8.15, 275° (W) | 0.66 / **1.33 px** | 0.14 px | −24° | B6 |
| RW Aurigae | A 156430822114424576 · 76.956081, +30.401205 · G 12.18; B (1.4″, unresolved) G 13.04 | +2.6, −27.4 | 6.4 | 0.03 (static) | ~0 | — | +7.5° | per band |
| R Draconis | 1648328016354496384 · 248.167378, +66.755007 · G 6.37 | −20.6, +6.1 | 1.25 | 0.02 (static) | ~0 | — | +81° | per band |

**Centring positions for the target picker** (propagated to 2026.0 using proper motion only; recompute per epoch in code):

| Target | RA | Dec | Note |
|---|---|---|---|
| Barnard's Star | 269.44627 | +4.76820 | |
| ε Ind B | 331.09665 | −56.80066 | |
| WISE 0855 | ≈133.7599 | ≈−7.2422 | Assumes the designation epoch is ≈2010.5. Replace with SIMBAD's value when it's back, and use FOV ≥ 6′ until then. |
| RW Aur | 76.95608 | +30.40113 | |
| R Dra | 248.16723 | +66.75502 | |

**What "working" looks like:**
- **Barnard's Star:**
  - Blinking the first and last epochs shows a ~1.7 px hop north.
  - The measured centroid shift is within **±0.2 px** of the Gaia + parallax prediction.
  - The difference image shows a clean N–S dipole.
  - Gaia markers land on the star at every epoch (residual under 0.3 px).
  - Risk: the core is bright (J≈5 (lit.)) and may be OVERFLOW/NONLINEAR, so centroid on the PSF wings with flagged pixels down-weighted.
- **ε Ind B:**
  - The shift is visible at 8× zoom or more, and the dipole appears in the difference image.
  - The centroid is within ±0.2 px of prediction.
  - ε Ind A is very bright and about 6.7′ away (lit.), so keep FOV ≤ 6′ and watch for GHOST/HALO flags.
- **WISE 0855:**
  - A ≥5σ detection in **B6 epoch stacks** in at least 2 epochs, with the shift within ±0.4 px of prediction, plus an **"unexplained mover (no Gaia match)"** badge. That's exactly how it would be discovered.
  - Rough estimate (lit.): about 17.2 AB at 4.5 µm, giving S/N of about 3 per channel and about 10 in a B6 stack.
  - **If it isn't detected, say so in the README.** It's still a valid result.
- **RW Aur:**
  - A classical T Tauri binary with irregular variability; deep optical dimmings happen while the 3–5 µm excess can rise (lit.).
  - Working = per-epoch fluxes per band with error bars, plus a reported change relative to the field-star scatter. **No predicted direction.**
  - It sits near the ecliptic, so expect high zodi and possible asteroid residuals. Use them as the "artefacts that aren't discoveries" teaching moment.
- **R Dra:**
  - A Mira with P ≈ 245.6 d (lit.). Phase advances about 0.74 cycle per 6 months, so the visits sample quite different phases.
  - It's near the pole (β≈+81°), so expect many visits.
  - Working = a light curve whose amplitude is far above the comparison scatter (> 20%), with phases consistent with the period.
  - It's very bright, so check OVERFLOW on the core and prefer the longer-λ channels.

**`scripts/validate.py`:**
- Takes the actual epoch MJDs from each manifest.
- Computes predicted pixel positions.
- Measures centroids (`photutils` centroid_2dg) and aperture fluxes.
- Writes `validation.md`, the table for the README and the pitch.
- **Pitch numbers come only from this file.**

---

## 7. Timeline (30 h; H0 = kickoff)

The example clock assumes H0 = Sat 12:00, so H30 = Sun 18:00, leaving about 6 h of buffer before the Sun 23:59 deadline. If H0 is later, eat into the buffer, not the MVP gate.

**Five role tracks; assign people later.** One teammate is setting up CLAUDE.md, skills and agents. Put §4.3 (contracts), §11 (layout) and §12 (checks) into CLAUDE.md so every agent session shares them.
- **A, Data/science:** query, fetch, stacking, alignment, photometry. Suits your Python, data and CV background.
- **B, Backend:** FastAPI, jobs, Blob cache, golden export, telemetry.
- **C, Frontend:** React flipbook, controls, URL state, overlays, charts.
- **D, Azure/DevOps:** resources, CI/CD, watcher, App Insights, Front Door, Cosmos.
- **E, Science QA and story:** Gaia logic with A, validation, README, citations, video, pitch, submission form.

| Hours | A | B | C | D | E |
|---|---|---|---|---|---|
| H0–1 | Golden-capture retry loop | **Contracts:** Pydantic models + TS types + mock manifest (with C) | Vite + React + TS scaffold against the mock | Install az; region policy; RG, storage, ACR; OIDC test | Open the challenge page, resources tab and submission form in a browser; `targets.json` |
| H1–3 | Notebook spike: Barnard's star from an S3 full frame → cutout → clean → 2 epochs (real data once IRSA answers); benchmark IRSA cutouts against S3 range reads | FastAPI skeleton, `/targets`, job model with a fake renderer, Blob cache class, Dockerfile | Flipbook canvas (nearest-neighbour scaling, play/pause/speed/blink), URL state | Container Apps environment + app, SWA connected to GitHub, App Insights, api.yml CI | Gaia query + propagation module with unit tests (Barnard's) |
| **H3 check** | IRSA still down? Keep developing on S3 files; capture loop keeps retrying | | | Policy blocker? Switch region or fall back (§9) | |
| H3–6 | Epoch grouping, channel-matched stack, shared stretch | Wire the real pipeline into jobs; manifest writer; S3 fallback | Metadata panel, FOV selector, target picker, progress UI | First real API deploy via CI; SWA live on the mock | Expected-position table; README skeleton; citations |
| **H6 check** | No clean stack → ship the unmatched mean (§5.5) | | | | |
| H6–9 | Flag mask from `MSKN*`, difference mode, alignment check | Golden export + precache of the 5 targets → Blob and `web/public/golden`; `/gaia` | Difference UI, blink A/B, share/embed URL, golden loader | Watcher Function (timer + run-now) deployed; OpenTelemetry in the API | Run validation on targets as they land |
| H9–12 | Integration fixes on Azure | Integration | Mobile layout, error states | min-replicas, CORS, cache headers | QA of all 5 targets on the live URL |
| **H12 MVP gate** | Public URL works; all 5 targets load **with the API stopped** (golden); a live arbitrary position works when IRSA is up. If not: **stop all Tier 2 work** and everyone works on the MVP. | | | | |
| H12–13 | Break; retro; lock the Tier 2 order | | | | |
| H13–18 | **Gaia overlay** (P1) with E; then light-curve photometry (P2) | `/lightcurve`, `/spectrum`; popular-views list | Gaia markers and arrows, explained/unexplained badges; light-curve chart; flag overlay (P3) | Cosmos (if T3 is likely); App Insights workbook; **H16: decide on Front Door** | Validate Gaia matches; draft the pitch and video script |
| **H18 check** | Gaia not done → light curve becomes a table; drop spectrum-click | | | | |
| H18–24 | **Staggered sleep** (A+C sleep H18–23; B+D+E sleep H19–24). Whoever is awake re-runs precache and the watcher. | | | | |
| H24–27 | T3 only if each item fits in about 1 h: brown-dwarf colour mode → Report button → auto-flag | Bug fixes | Polish; "Open in WiseView" link | Front Door (if chosen); min-replicas = 1 | Bug-bash on phone and desktop |
| **H27 feature freeze** | Fixes only | | | | |
| H27–29 | Final precache + validation run | Final deploy | Screenshots | Cost check | Record the 30 s video; README; submission text |
| H29–30 | — | — | — | — | **Submit**, then test every link in an incognito window |

**Cut order, first to go:**
1. Azure OpenAI
2. Durable Functions
3. Auto-flag movers
4. Report button and Cosmos
5. Spectrum on click
6. Front Door
7. Light-curve polish
8. Flag overlay

**Never cut:** the golden snapshots, the 5 targets, the shared URL, and the README citations.

---

## 8. Azure setup runbook

Commands are Bash. They run in Git Bash or in **Azure Cloud Shell**, which has az preinstalled and is quickest. Verify flags with `-h` as you go.

```bash
# 0. Tools (Windows) — or skip and use Cloud Shell
winget install -e --id Microsoft.AzureCLI
npm i -g azure-functions-core-tools@4 @azure/static-web-apps-cli
az login
az extension add -n containerapp --upgrade
az extension add -n application-insights --upgrade
for ns in Microsoft.App Microsoft.OperationalInsights Microsoft.Insights Microsoft.Web Microsoft.Storage \
          Microsoft.ContainerRegistry Microsoft.DocumentDB Microsoft.Cdn; do az provider register -n $ns; done

# 1. Region preflight — Azure for Students may carry an "allowed locations" policy
az policy assignment list --query "[].{name:displayName, params:parameters}" -o json
az functionapp list-flexconsumption-locations -o table
# Pick LOC: prefer westus2/westus3 (nearest IRSA in Pasadena) if allowed and Flex-capable.
# SWA Free must also be in an SWA region (e.g. westus2/centralus/eastus2) that the policy allows.

LOC=westus2; RG=rg-planetx; SUF=$RANDOM
SA=stplanetx$SUF; ACR=acrplanetx$SUF; LAW=log-planetx; AI=appi-planetx
ENV=cae-planetx; API=ca-planetx-api; FUNC=func-planetx-$SUF; COSMOS=cosmos-planetx-$SUF; SWA=swa-planetx
az group create -n $RG -l $LOC

# 2. Observability first (everything reports into it)
az monitor log-analytics workspace create -g $RG -n $LAW -l $LOC
LAW_ID=$(az monitor log-analytics workspace show -g $RG -n $LAW --query customerId -o tsv)
LAW_KEY=$(az monitor log-analytics workspace get-shared-keys -g $RG -n $LAW --query primarySharedKey -o tsv)
az monitor app-insights component create -g $RG -a $AI -l $LOC --workspace $LAW
AI_CONN=$(az monitor app-insights component show -g $RG -a $AI --query connectionString -o tsv)

# 3. Storage: frames (public read) + state (private)
az storage account create -g $RG -n $SA -l $LOC --sku Standard_LRS --kind StorageV2 \
  --min-tls-version TLS1_2 --allow-blob-public-access true
az storage container create --account-name $SA -n frames --public-access blob --auth-mode key
az storage container create --account-name $SA -n state  --public-access off  --auth-mode key
az storage cors add --account-name $SA --services b --methods GET HEAD OPTIONS \
  --origins '*' --allowed-headers '*' --exposed-headers '*' --max-age 3600
SA_ID=$(az storage account show -g $RG -n $SA --query id -o tsv)

# 4. Registry (student offer: 1 Standard registry free for 12 months)
az acr create -g $RG -n $ACR --sku Standard
ACR_ID=$(az acr show -n $ACR --query id -o tsv)

# 5. Cosmos DB — start early (5–10 min). Free tier must be chosen at creation; one per subscription.
az cosmosdb create -g $RG -n $COSMOS --enable-free-tier true \
  --locations regionName=$LOC failoverPriority=0 isZoneRedundant=False --no-wait

# 6. Container Apps env + API (after CI has pushed the first image; app listens on 8000)
az containerapp env create -g $RG -n $ENV -l $LOC --logs-workspace-id $LAW_ID --logs-workspace-key $LAW_KEY
az containerapp create -g $RG -n $API --environment $ENV \
  --image $ACR.azurecr.io/planetx-api:bootstrap --registry-server $ACR.azurecr.io --registry-identity system \
  --target-port 8000 --ingress external --cpu 1.0 --memory 2.0Gi --min-replicas 0 --max-replicas 1 --system-assigned
#   (if the --registry-identity create fails: create with a public placeholder image, assign AcrPull, then
#    `az containerapp registry set -g $RG -n $API --server $ACR.azurecr.io --identity system`)
PRINCIPAL=$(az containerapp show -g $RG -n $API --query identity.principalId -o tsv)
az role assignment create --assignee $PRINCIPAL --role "Storage Blob Data Contributor" --scope $SA_ID
az role assignment create --assignee $PRINCIPAL --role AcrPull --scope $ACR_ID
REFRESH_KEY=$(openssl rand -hex 24)
az containerapp secret set -g $RG -n $API --secrets appi-conn="$AI_CONN" refresh-key="$REFRESH_KEY"
API_URL=https://$(az containerapp show -g $RG -n $API --query properties.configuration.ingress.fqdn -o tsv)

# 7. Static Web App (Free) wired to GitHub — creates the deploy workflow + token secret
az staticwebapp create -g $RG -n $SWA -l westus2 --sku Free \
  --source https://github.com/<org>/<repo> --branch main \
  --app-location web --output-location dist --login-with-github
SWA_HOST=$(az staticwebapp show -g $RG -n $SWA --query defaultHostname -o tsv)
az containerapp update -g $RG -n $API --set-env-vars \
  STORAGE_ACCOUNT_URL=https://$SA.blob.core.windows.net FRAMES_CONTAINER=frames STATE_CONTAINER=state \
  FRAMES_PUBLIC_BASE=https://$SA.blob.core.windows.net/frames \
  APPLICATIONINSIGHTS_CONNECTION_STRING=secretref:appi-conn REFRESH_KEY=secretref:refresh-key \
  ALLOWED_ORIGINS=https://$SWA_HOST,http://localhost:5173 IRSA_MAX_WORKERS=10 IRSA_TIMEOUT_S=120 PIPELINE_VERSION=1

# 8. Watcher Function (Flex Consumption, Python 3.12)
az functionapp create -g $RG -n $FUNC --storage-account $SA --flexconsumption-location $LOC \
  --runtime python --runtime-version 3.12 --app-insights $AI
az functionapp identity assign -g $RG -n $FUNC
FPRIN=$(az functionapp identity show -g $RG -n $FUNC --query principalId -o tsv)
az role assignment create --assignee $FPRIN --role "Storage Blob Data Contributor" --scope $SA_ID
az functionapp config appsettings set -g $RG -n $FUNC --settings \
  API_BASE=$API_URL REFRESH_KEY=$REFRESH_KEY STORAGE_ACCOUNT_URL=https://$SA.blob.core.windows.net
(cd watcher && func azure functionapp publish $FUNC)
#   Fallback if Flex is unavailable in LOC: same code as a Container Apps Job
#   az containerapp job create -g $RG -n job-watcher --environment $ENV --trigger-type Schedule \
#     --cron-expression "0 6 * * *" --image $ACR.azurecr.io/planetx-api:<sha> --command python -m app.watch ...

# 9. Cosmos containers (when step 5 finishes)
az cosmosdb sql database create -g $RG -a $COSMOS -n planetx --throughput 400
az cosmosdb sql container create -g $RG -a $COSMOS -d planetx -n candidates --partition-key-path /hpx5
COSMOS_KEY=$(az cosmosdb keys list -g $RG -n $COSMOS --query primaryMasterKey -o tsv)
az containerapp secret set -g $RG -n $API --secrets cosmos-key="$COSMOS_KEY"
az containerapp update -g $RG -n $API --set-env-vars \
  COSMOS_ENDPOINT=https://$COSMOS.documents.azure.com:443/ COSMOS_KEY=secretref:cosmos-key COSMOS_DB=planetx

# 10. (Optional, Sunday) Front Door Standard in front of the frames container — delete after local judging
az afd profile create -g $RG --profile-name afd-planetx --sku Standard_AzureFrontDoor
az afd endpoint create -g $RG --profile-name afd-planetx --endpoint-name frames-$SUF --enabled-state Enabled
az afd origin-group create -g $RG --profile-name afd-planetx --origin-group-name blob \
  --probe-request-type HEAD --probe-protocol Https --probe-interval-in-seconds 240 --probe-path /frames/meta/catalog.json \
  --sample-size 4 --successful-samples-required 3 --additional-latency-in-milliseconds 50
az afd origin create -g $RG --profile-name afd-planetx --origin-group-name blob --origin-name sa \
  --host-name $SA.blob.core.windows.net --origin-host-header $SA.blob.core.windows.net \
  --http-port 80 --https-port 443 --priority 1 --weight 1000 --enabled-state Enabled
az afd route create -g $RG --profile-name afd-planetx --endpoint-name frames-$SUF --route-name frames \
  --origin-group blob --supported-protocols Https --https-redirect Enabled --forwarding-protocol HttpsOnly \
  --link-to-default-domain Enabled --patterns-to-match "/*" --enable-caching true --query-string-caching-behavior IgnoreQueryString
# then set VITE_FRAMES_BASE=https://<afd-endpoint-host>/frames and redeploy web

# Judging days: no cold starts
az containerapp update -g $RG -n $API --min-replicas 1      # set back to 0 afterwards
```

**GitHub OIDC for CI** (do this at H0–1). If the student tenant blocks app registration, use **plan B**: CI pushes a public image to GHCR, and a laptop or Cloud Shell runs `az containerapp update --image ghcr.io/<org>/planetx-api:<sha>`. That needs no Azure secrets in GitHub and no local Docker.
```bash
APP_ID=$(az ad app create --display-name gh-planetx --query appId -o tsv); az ad sp create --id $APP_ID
az ad app federated-credential create --id $APP_ID --parameters '{"name":"gh-main","issuer":"https://token.actions.githubusercontent.com","subject":"repo:<org>/<repo>:ref:refs/heads/main","audiences":["api://AzureADTokenExchange"]}'
az role assignment create --assignee $APP_ID --role Contributor --scope $(az group show -n $RG --query id -o tsv)
gh secret set AZURE_CLIENT_ID -b $APP_ID
gh secret set AZURE_TENANT_ID -b $(az account show --query tenantId -o tsv)
gh secret set AZURE_SUBSCRIPTION_ID -b $(az account show --query id -o tsv)
```
`.github/workflows/api.yml`:
```yaml
name: api
on: { push: { branches: [main], paths: ["api/**"] }, workflow_dispatch: {} }
permissions: { id-token: write, contents: read }
jobs:
  deploy:
    runs-on: ubuntu-latest
    env: { ACR: acrplanetxNNNN, RG: rg-planetx, APP: ca-planetx-api }
    steps:
      - uses: actions/checkout@v4
      - uses: azure/login@v2
        with: { client-id: "${{ secrets.AZURE_CLIENT_ID }}", tenant-id: "${{ secrets.AZURE_TENANT_ID }}", subscription-id: "${{ secrets.AZURE_SUBSCRIPTION_ID }}" }
      - run: az acr login -n $ACR
      - uses: docker/setup-buildx-action@v3
      - uses: docker/build-push-action@v6
        with: { context: api, push: true, tags: "${{ env.ACR }}.azurecr.io/planetx-api:${{ github.sha }}" }
      - run: az containerapp update -g $RG -n $APP --image $ACR.azurecr.io/planetx-api:${{ github.sha }}
```
For the web app, SWA generates its own workflow. Add `env: { VITE_API_BASE: https://<api-fqdn>, VITE_FRAMES_BASE: https://<sa>.blob.core.windows.net/frames }` to its deploy step.

**Environment variables:**
- **API:** `STORAGE_ACCOUNT_URL`, `FRAMES_CONTAINER`, `STATE_CONTAINER`, `FRAMES_PUBLIC_BASE`, `APPLICATIONINSIGHTS_CONNECTION_STRING`, `REFRESH_KEY`, `ALLOWED_ORIGINS`, `IRSA_MAX_WORKERS`, `IRSA_TIMEOUT_S`, `PIPELINE_VERSION`, `COSMOS_ENDPOINT`, `COSMOS_KEY`, `COSMOS_DB`
- **Watcher:** `API_BASE`, `REFRESH_KEY`, `STORAGE_ACCOUNT_URL`, plus `AzureWebJobsStorage` and App Insights, which Flex sets automatically.
- **Web** (build time): `VITE_API_BASE`, `VITE_FRAMES_BASE`

**Cost against the $100 credit.** Container Apps rates are from memory, so confirm them in the pricing calculator.

| Item | Weekend | Through Dec 31 |
|---|---|---|
| SWA Free, Functions Flex, Cosmos free tier, App Insights (< 5 GB) | $0 | $0 |
| Container Apps, 1 vCPU / 2 GiB, min-replicas = 1 only on judging days | ~$0–2 | ~$5–20 (about $20/month if left at min=1) |
| ACR Standard | $0 (free for 12 months) | $0 |
| Blob (< 5 GB) | < $0.10 | < $1 |
| Front Door Standard ($35/month, billed hourly) | ~$2–3 | **~$55 if left on**, so delete after local judging |
| **Total** | **< $10** | **~$10–30** (Front Door deleted) |

Set a cost alert in Cost Management, or watch the Sponsorships portal.

---

## 9. Risk register

| # | Risk | L / I | Mitigation | Owner |
|---|---|---|---|---|
| 1 | **IRSA outage or latency.** It's 502 today; TAP takes 20–37 s. | High / High | Golden capture loop from H0. Three layers: golden (SWA) → Blob cache → live. Retries with backoff. Fall back from SIA to TAP. Pixels fall back to S3 (`fsspec` + `.section` range reads). A circuit breaker sets `irsa:"down"` and the UI says "IRSA is down — showing cached data". Serve stale data while revalidating. | A, B |
| 2 | No way to find frames while IRSA is down. S3 has no positional index. | Med / High | Only new positions are affected. The 5 targets come from golden data. Explain in the UI. Check S3 `index.html` for an inventory. | A |
| 3 | CORS | Low / Med | The backend proxies all IRSA traffic. Blob CORS is set. FastAPI `ALLOWED_ORIGINS`. | B, D |
| 4 | Too few epochs (1 epoch, or QR3 not ingested yet) | Med / Med | Detect it and offer the wavelength flipbook instead. Explain "motion needs ≥ 2 epochs". | C |
| 5 | Misaligned frames (WCS/SIP) | Med / High | Reproject with the full WCS. Measure the Gaia field-star residual and correct if it exceeds 0.15 px. Show the residual. | A |
| 6 | Bright-star saturation (Barnard's, R Dra, ε Ind A nearby) | Med / Med | Mask policy keeps OVERFLOW/NONLINEAR. Centroid on the wings. Hollow light-curve points. Prefer longer λ for photometry. | A, E |
| 7 | Centring on J2000 coordinates misses the mover | High / High | Propagate preset positions to the epoch. Default FOV 6′. Unit test on Barnard's. | E |
| 8 | WISE 0855 too faint | Med / Med | B6 stacks. Report honestly in the README. | A, E |
| 9 | False "candidates" (asteroids near the ecliptic, ghosts, cosmic rays) | High / Med | Require a ≥3-epoch linear track or a dipole with S/N > 10. Exclude GHOST/STREAK pixels. Link to MOST and SIMBAD. Never use the word "discovery". | A, E |
| 10 | Cutouts are heavy (~4 MB each because of EPSF); "all" mode means 400+ frames | High / Med | Band presets, a frame cap, and the S3 path, which skips EPSF. A global concurrency limit of 10 to stay polite to IRSA. | A, B |
| 11 | Azure region policy or quota | Med / High | Check the policy at H0. Flex not available → Container Apps Job. ACR Tasks blocked → build in GitHub Actions. App registration blocked → GHCR plan B. | D |
| 12 | Cold starts (image ~700 MB; astropy import) | High / Med | Golden presets need no API. min-replicas = 1 on judging days. A slim image. Lazy imports. | B, D |
| 13 | SIMBAD/CDS down (seen today); Aladin Lite is served from CDS | Med / Low | No runtime SIMBAD dependency (Gaia-derived presets). The resolver is optional. Bundle Aladin Lite from npm if used. | C, E |
| 14 | Gaia TAP down | Low / Med | Cache Gaia results per view (golden includes `gaia.json`). MAST as fallback. Hide the overlay gracefully. | B |
| 15 | Budget overrun | Low / Med | Front Door only for the weekend; min-replicas back to 0; cost alert. | D |
| 16 | 5-person merge chaos | Med / Med | Contracts frozen at H1. Mock manifest. Each track owns a folder. Short-lived PRs. | All |

---

## 10. Demo and submission

**30-second video script.** Label any AI-generated media according to Space Apps rules.
- **0–3 s:** Title card: "Wanderer — watch the infrared sky move."
- **3–10 s:** Pick **Barnard's Star** and blink the 2025 and 2026 epochs. The star hops north and the Gaia arrow lands on it. Caption with the measured vs predicted numbers from `validation.md`.
- **10–16 s:** **WISE 0855**, B6 stack. A faint dot moves and gets the badge **"unexplained mover — no Gaia match"**. Caption: "this is how the coldest known brown dwarf would be found."
- **16–22 s:** **R Dra** light-curve panel. The Mira brightens and fades between visits.
- **22–27 s:** Paste any RA/Dec. Frames stream in with a progress bar. Copy the share link.
- **27–30 s:** "Updates itself when SPHEREx releases data · built on Azure", then the URL and a QR code.

**2-minute pitch:**
- **0:00 Hook:** brown dwarfs were found by blinking WISE; WISE is over. SPHEREx maps the whole sky every 6 months in 102 colours, but nobody can just look at it.
- **0:15 Live demo:** Barnard's Star plus the Gaia overlay.
- **0:45 Discovery logic:** WISE 0855 as the unexplained mover; R Dra.
- **1:05 Azure slide.**
- **1:30 Science rigour:** channel-matched stacks, parallax-aware Gaia predictions, measured-vs-predicted table, honest limits.
- **1:50 Close:** "Type any coordinates. Watch the sky move."

**Azure slide** ("every service solves a problem"; numbers come from App Insights, never invented):
- **Speed:** Blob render cache (+ Front Door edge). First view N s → cached N ms; hit ratio N%.
- **Freshness:** Functions timer diffs the SPHEREx catalogue and re-renders automatically; "data as of" badge; live "run-now" demo.
- **Resilience:** golden snapshots on SWA, S3 fallback for pixels, managed identity (no storage secrets).
- **Discovery:** Cosmos DB candidate board.
- **Observability:** App Insights workbook with p95 latency, IRSA failures and cache hits. KQL: `requests | summarize percentile(duration,95) by name` and `requests | where name has "/api/views" | summarize hit=countif(tostring(customDimensions["cache.hit"])=="true"), n=count()`.

**README outline:**
1. What and why, plus the live URL
2. How to use (URL parameters, embed)
3. The 5 validation targets with measured results (`validation.md`)
4. Method: stacking, stretch, difference, Gaia + parallax
5. Architecture and Azure services
6. Limitations: 6.15″ pixels, ~1-yr baseline, saturation, WISE 0855 depth
7. Run locally and deploy
8. Data citations and acknowledgements
9. AI-tools disclosure (Claude Code, Cursor)
10. Team
11. License

**Citations:**
- **SPHEREx:** copy the acknowledgement **verbatim** from https://irsa.ipac.caltech.edu/data/SPHEREx/docs/overview_dr1.html. It begins "This publication makes use of data products from the Spectro-Photometer for the History of the Universe…"; only the start was captured today. DOIs: DR1 Spectral Images **10.26131/IRSA678**, DR1 All-Sky Cube **10.26131/IRSA679**, QR3 **10.26131/IRSA662**. Papers: Bock et al. 2026 (mission), Akeson et al. 2026 (pipeline), Korngut et al. 2026 (instrument), Crill et al. 2025 (simulator).
- **IRSA:** the standard NASA/IPAC IRSA acknowledgement (confirm the wording on the IRSA site).
- **Gaia DR3:** Gaia Collaboration, Vallenari et al. 2023, A&A 674, A1, plus the standard ESA/Gaia/DPAC acknowledgement.
- **SIMBAD:** Wenger et al. 2000.
- **Software:** Astropy (2013/2018/2022), astroquery (Ginsburg et al. 2019), reproject, photutils, sep (Barbary 2016), and Aladin Lite if used.

**Submission checklist.** Confirm every item on the actual form; the page wasn't readable today.
- [ ] Team registered at the local event, with challenge "Planet X and SPHEREx" selected
- [ ] Title and high-level summary
- [ ] Demo: 30 s video (or the slide limit on the form)
- [ ] Final project link: live URL plus public GitHub repo
- [ ] Detailed description, NASA data used (SPHEREx via IRSA), partner data (ESA Gaia), references
- [ ] AI-use disclosure
- [ ] All links tested in incognito and on a phone; the 5 targets work with the API stopped
- [ ] Submitted before **Sun Nov 15, 23:59 local**

---

## 11. Repo layout and code skeletons

```
/                      README.md · PLAN.md · CLAUDE.md
api/                   FastAPI → Container Apps
  Dockerfile  requirements.txt
  app/main.py          routes (§4.3), CORS, OpenTelemetry (configure_azure_monitor)
  app/models.py        Pydantic: ViewRequest, ViewStatus, Manifest, Epoch, Frame   ← contract, H1
  app/spherex/{query,fetch,flags,stack,render,photometry}.py
  app/gaia.py · app/cache.py · app/jobs.py · app/watch.py (Container Apps Job fallback)
  tests/               test_keys.py · test_dedupe.py · test_gaia_barnard.py · test_epochs.py
web/                   Vite + React + TS → Static Web Apps
  src/types.ts (mirror of models.py) · src/api.ts · src/lib/{stretch,url,golden}.ts
  src/components/{Flipbook,Controls,TargetPicker,MetadataPanel,GaiaOverlay,DiffView,LightCurve}.tsx
  public/golden/<target>/…        staticwebapp.config.json
watcher/               Azure Functions (Flex, Python v2): function_app.py · host.json · requirements.txt
scripts/               precache.py (retry loop + golden export) · validate.py · targets.json
.github/workflows/     api.yml · <swa-generated>.yml
```
`api/requirements.txt`: fastapi, uvicorn[standard], numpy, scipy, astropy, astroquery, reproject, photutils, sep, pillow, s3fs, fsspec, requests, pydantic, azure-storage-blob, azure-identity, azure-cosmos, azure-monitor-opentelemetry. Base image: `python:3.12-slim`, `CMD uvicorn app.main:app --host 0.0.0.0 --port 8000`.

**`api/app/spherex/query.py`: SIA/TAP query**
```python
import re
import astropy.units as u
from astropy.coordinates import SkyCoord
from astroquery.ipac.irsa import Irsa

COLL_RE = re.compile(r"^spherex_(dr|qr)(\d+)(_deep)?$")            # drops spherex_dr1_cube etc.
PROC_RE = re.compile(r"-(\d{4})-(\d{3})\.fits$")                    # processing year-doy in filename

def priority(coll: str) -> tuple[int, int]:
    kind, num, _ = COLL_RE.match(coll).groups()
    return (1 if kind == "dr" else 0, int(num))                     # DR beats QR, newer beats older

def discover_collections() -> list[str]:
    tbl = Irsa.list_collections(servicetype="SIA", filter="spherex")
    names = [str(n) for n in tbl["collection"]]                     # confirm column name on first run
    return sorted((n for n in names if COLL_RE.match(n)), key=priority, reverse=True)

def _stem(url: str) -> str:                                         # level2_<obs>_<n>D<det>
    return url.rsplit("/", 1)[1].split("_spx_")[0]

def dedupe(rows: list[dict]) -> list[dict]:
    best: dict[str, dict] = {}
    for r in rows:
        k = _stem(r["url"])
        rank = (priority(r["collection"]), PROC_RE.search(r["url"]).groups() if PROC_RE.search(r["url"]) else ())
        if k not in best or rank > best[k]["_rank"]:
            best[k] = {**r, "obs": k, "_rank": rank}
    return sorted(best.values(), key=lambda r: r["t_mjd"])

def query_frames_sia(ra: float, dec: float, collections: list[str]) -> list[dict]:
    t = Irsa.query_sia(pos=(SkyCoord(ra, dec, unit="deg"), 1 * u.arcsec), collection=collections)
    return dedupe([{"collection": str(r["obs_collection"]), "url": str(r["access_url"]),
                    "t_mjd": float(r["t_min"]), "band": str(r["energy_bandpassname"])} for r in t])

TAP_SQL = """
SELECT 'https://irsa.ipac.caltech.edu/' || a.uri AS url, p.time_bounds_lower AS t_mjd,
       p.energy_bandpassname AS band
FROM spherex.artifact a JOIN spherex.plane p ON a.planeid = p.planeid
WHERE 1 = CONTAINS(POINT('ICRS', {ra}, {dec}), p.poly)
ORDER BY p.time_bounds_lower"""

def query_frames_tap(ra: float, dec: float) -> list[dict]:          # fresher than SIA (no ~1-day lag), slower
    t = Irsa.query_tap(TAP_SQL.format(ra=ra, dec=dec)).to_table()
    rows = [{"url": str(r["url"]), "t_mjd": float(r["t_mjd"]), "band": str(r["band"])} for r in t]
    for r in rows:                                                  # .../ibe/data/spherex/<rel>/level2/...
        r["collection"] = "spherex_" + r["url"].split("/spherex/", 1)[1].split("/", 1)[0]
    return dedupe([r for r in rows if COLL_RE.match(r["collection"])])
```

**`api/app/spherex/fetch.py`: parallel cutout fetcher, with retries and S3 fallback**
```python
import concurrent.futures as cf, http.client, time, urllib.error
import numpy as np
import astropy.units as u
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.utils.data import conf
from astropy.wcs import WCS

conf.remote_timeout = 120
RETRYABLE_HTTP = {429, 500, 502, 503, 504}
TRANSIENT = (TimeoutError, ConnectionError, urllib.error.URLError,
             http.client.IncompleteRead, http.client.RemoteDisconnected)
PIX_ARCSEC = 6.15

def _extract(hdul, ra, dec, window=None) -> dict:
    """Pull science arrays + metadata. window=(y0,y1,x0,x1) when reading a full frame from S3."""
    sl = (slice(window[0], window[1]), slice(window[2], window[3])) if window else (slice(None),) * 2
    get = (lambda name: hdul[name].section[sl]) if window else (lambda name: hdul[name].data)
    hdr = hdul["IMAGE"].header
    wcs = WCS(hdr)
    x, y = wcs.world_to_pixel(SkyCoord(ra, dec, unit="deg"))
    swcs = WCS(hdr, fobj=hdul, key="W"); swcs.sip = None            # spectral WCS (lookup table)
    lam, bw = swcs.pixel_to_world(x, y)
    fh = hdul["FLAGS"].header
    out_wcs = wcs.slice(sl) if window else wcs
    return {"image": (get("IMAGE") - get("ZODI")).astype("f4"),     # zodi is NOT pre-subtracted
            "var": np.asarray(get("VARIANCE"), dtype="f4"),
            "flags": np.asarray(get("FLAGS"), dtype="i4"),
            "flag_names": {fh[k]: int(k[4:]) for k in fh["MSKN*"]},  # bit numbers from header, never hard-coded
            "wcs_header": out_wcs.to_header(relax=True), "detector": int(hdr.get("DETECTOR", 0)),
            "lam_um": float(lam.to_value(u.um)), "bw_um": float(bw.to_value(u.um)),
            "version": hdul[0].header.get("VERSION", "")}

def fetch_irsa(frame, ra, dec, size_deg, retries=3):
    url = f"{frame['url']}?center={ra},{dec}d&size={size_deg}"
    for attempt in range(retries):
        try:
            with fits.open(url, cache=False, memmap=False) as hdul:
                return {**frame, **_extract(hdul, ra, dec), "source": "irsa"}
        except urllib.error.HTTPError as e:
            if e.code not in RETRYABLE_HTTP:
                return None
        except TRANSIENT:
            pass
        time.sleep(2 * (attempt + 1))
    return None

def fetch_s3(frame, ra, dec, size_deg):
    """Same file on the AWS mirror (identical path layout, verified); range-reads only the window."""
    key = frame["url"].split("/ibe/data/spherex/", 1)[1]
    try:
        with fits.open(f"s3://nasa-irsa-spherex/{key}", use_fsspec=True,
                       fsspec_kwargs={"anon": True, "default_block_size": 256 * 1024}) as hdul:
            x, y = WCS(hdul["IMAGE"].header).world_to_pixel(SkyCoord(ra, dec, unit="deg"))
            h = int(np.ceil(size_deg * 3600 / PIX_ARCSEC / 2)) + 2
            y0, x0 = max(int(y) - h, 0), max(int(x) - h, 0)
            return {**frame, **_extract(hdul, ra, dec, (y0, int(y) + h + 1, x0, int(x) + h + 1)), "source": "s3"}
    except Exception:
        return None

def fetch_all(frames, ra, dec, size_deg, workers=10, on_progress=None) -> list[dict]:
    def one(f):
        return fetch_irsa(f, ra, dec, size_deg) or fetch_s3(f, ra, dec, size_deg)
    out, done = [], 0
    with cf.ThreadPoolExecutor(max_workers=workers) as ex:
        for fut in cf.as_completed([ex.submit(one, f) for f in frames]):
            done += 1
            if (r := fut.result()) is not None:
                out.append(r)
            if on_progress:
                on_progress(done, len(frames))
    return sorted(out, key=lambda r: r["t_mjd"])
```

**`api/app/spherex/stack.py`: epoch stacker**
```python
import numpy as np
from astropy.stats import sigma_clipped_stats
from astropy.wcs import WCS
from reproject import reproject_interp

PIX_ARCSEC = 6.15
BANDS = {1: (0.75, 1.09), 2: (1.10, 1.62), 3: (1.63, 2.41), 4: (2.42, 3.82), 5: (3.83, 4.41), 6: (4.42, 5.00)}
KEEP = {"SOURCE", "OVERFLOW", "NONLINEAR", "FULLSAMPLE", "HALO", "BLOOM"}   # not masked for imaging (tune)

def group_epochs(frames, gap_days=20.0, max_len_days=40.0) -> list[list[dict]]:
    epochs, cur = [], []
    for f in sorted(frames, key=lambda f: f["t_mjd"]):
        if cur and (f["t_mjd"] - cur[-1]["t_mjd"] > gap_days or f["t_mjd"] - cur[0]["t_mjd"] > max_len_days):
            epochs.append(cur); cur = []
        cur.append(f)
    return epochs + ([cur] if cur else [])

def common_grid(ra, dec, fov_arcmin) -> tuple[WCS, tuple[int, int]]:
    n = int(np.ceil(fov_arcmin * 60 / PIX_ARCSEC)) | 1
    w = WCS(naxis=2)
    w.wcs.ctype = ["RA---TAN", "DEC--TAN"]; w.wcs.crval = [ra, dec]
    w.wcs.crpix = [(n + 1) / 2, (n + 1) / 2]; w.wcs.cdelt = [-PIX_ARCSEC / 3600, PIX_ARCSEC / 3600]
    return w, (n, n)

def channel_of(f) -> tuple[int, int]:
    lo, hi = BANDS[f["detector"]]
    return f["detector"], int(np.clip(np.log(f["lam_um"] / lo) / np.log(hi / lo) * 17, 0, 16))

def to_grid(f, w, shape):
    bits = sum(1 << b for name, b in f["flag_names"].items() if name not in KEEP)
    img = np.where((f["flags"] & bits) != 0, np.nan, f["image"])
    _, sky, _ = sigma_clipped_stats(img, sigma=3)
    src = WCS(f["wcs_header"])
    im, _ = reproject_interp((img - sky, src), w, shape_out=shape)
    var, _ = reproject_interp((f["var"], src), w, shape_out=shape)
    return im, var

def stack_epochs(epochs, w, shape):
    """Channel-matched: inverse-variance mean per channel, then equal-weight mean over channels common to all epochs."""
    per = []
    for ep in epochs:
        chans: dict = {}
        for f in ep:
            chans.setdefault(channel_of(f), []).append(to_grid(f, w, shape))
        per.append(chans)
    keys = [set(c) for c in per]
    common = set.intersection(*keys)
    matched = bool(common)
    use = common or set.union(*keys)
    stacks = []
    for chans in per:
        layers = []
        for k in sorted(use & chans.keys()):
            ims = np.array([im for im, _ in chans[k]])
            wts = np.array([1.0 / v for _, v in chans[k]])
            ok = np.isfinite(ims) & np.isfinite(wts) & (wts > 0)
            num = np.where(ok, ims * wts, 0).sum(0); den = np.where(ok, wts, 0).sum(0)
            layers.append(np.where(den > 0, num / np.where(den > 0, den, 1), np.nan))
        stacks.append(np.nanmean(layers, axis=0) if layers else np.full(shape, np.nan))
    return stacks, {"channels": sorted(use), "bandpass_matched": matched}

def shared_asinh(stacks, beta_sigma=3.0, hi_pct=99.7) -> dict:
    pool = np.concatenate([s[np.isfinite(s)] for s in stacks])
    _, sky, sig = sigma_clipped_stats(pool, sigma=3)
    return {"kind": "asinh", "vmin": float(sky - 2 * sig), "vmax": float(np.percentile(pool, hi_pct)),
            "beta": float(beta_sigma * sig)}                       # applied identically to every epoch
```

**`api/app/cache.py`: Blob cache layer**
```python
import hashlib, json
from azure.core.exceptions import ResourceNotFoundError
from azure.identity import DefaultAzureCredential
from azure.storage.blob import BlobServiceClient, ContentSettings

IMMUTABLE, SHORT = "public, max-age=31536000, immutable", "public, max-age=60"

def query_key(ra: float, dec: float, fov_arcmin: float, band: str) -> str:
    return hashlib.sha256(f"q1|{ra:.4f}|{dec:+.4f}|{fov_arcmin:g}|{band}".encode()).hexdigest()[:20]

def render_key(pipeline_version: int, qk: str, frame_ids: list[str]) -> str:
    payload = f"{pipeline_version}|{qk}|" + "\n".join(sorted(frame_ids))
    return hashlib.sha256(payload.encode()).hexdigest()[:24]

class FrameCache:
    def __init__(self, account_url: str, container: str = "frames"):
        self.c = BlobServiceClient(account_url, credential=DefaultAzureCredential()).get_container_client(container)

    def _put(self, path: str, data: bytes, ctype: str, cache: str) -> None:
        self.c.upload_blob(path, data, overwrite=True,
                           content_settings=ContentSettings(content_type=ctype, cache_control=cache))

    def get_json(self, path: str) -> dict | None:
        try:
            return json.loads(self.c.download_blob(path).readall())
        except ResourceNotFoundError:
            return None

    def lookup(self, qk: str) -> dict | None:                       # → {"render_key", "catalog_version"} or None
        return self.get_json(f"q/{qk}.json")

    def put_render(self, rk: str, manifest: dict, files: dict[str, tuple[bytes, str]]) -> None:
        for name, (data, ctype) in files.items():                   # e0.f32, e0.png, e0.mask.u8, gaia.json …
            self._put(f"r/{rk}/{name}", data, ctype, IMMUTABLE)
        self._put(f"r/{rk}/manifest.json", json.dumps(manifest).encode(), "application/json", IMMUTABLE)  # last

    def point(self, qk: str, rk: str, catalog_version: str) -> None: # atomic swap after the render is complete
        self._put(f"q/{qk}.json", json.dumps({"render_key": rk, "catalog_version": catalog_version}).encode(),
                  "application/json", SHORT)
```

**`watcher/function_app.py`: timer Function (Python v2 model)**
```python
import datetime as dt, json, logging, os, re
import azure.functions as func
import requests
from astroquery.ipac.irsa import Irsa
from azure.identity import DefaultAzureCredential
from azure.storage.blob import BlobClient, ContentSettings

app = func.FunctionApp()
COLL_RE = re.compile(r"^spherex_(dr|qr)(\d+)(_deep)?$")

def _catalog_blob() -> BlobClient:
    return BlobClient(os.environ["STORAGE_ACCOUNT_URL"], "frames", "meta/catalog.json",
                      credential=DefaultAzureCredential())

def check_catalog() -> dict:
    names = sorted(n for n in map(str, Irsa.list_collections(servicetype="SIA", filter="spherex")["collection"])
                   if COLL_RE.match(n))
    latest = float(Irsa.query_tap("SELECT MAX(time_bounds_lower) AS t FROM spherex.plane").to_table()["t"][0])
    blob = _catalog_blob()
    try:
        old = json.loads(blob.download_blob().readall())
    except Exception:
        old = {}
    changed = names != old.get("collections") or latest > old.get("latest_frame_mjd", 0)
    new = {"collections": names, "latest_frame_mjd": latest,
           "checked_at": dt.datetime.now(dt.UTC).isoformat(timespec="seconds"),
           "catalog_version": f"c{dt.date.today():%Y%m%d}-{len(names)}-{int(latest)}" if changed
                              else old.get("catalog_version")}
    blob.upload_blob(json.dumps(new), overwrite=True,               # also feeds the "data as of" badge
                     content_settings=ContentSettings(content_type="application/json", cache_control="public, max-age=60"))
    if changed:
        r = requests.post(f"{os.environ['API_BASE']}/internal/refresh", timeout=30,
                          headers={"X-Refresh-Key": os.environ["REFRESH_KEY"]},
                          json={"reason": "catalog_change", "catalog_version": new["catalog_version"]})
        logging.info("refresh → %s %s", r.status_code, r.text[:200])
    return {**new, "changed": changed}

@app.timer_trigger(schedule="0 0 6 * * *", arg_name="timer", run_on_startup=False, use_monitor=False)  # 06:00 UTC
def new_data_watcher(timer: func.TimerRequest) -> None:
    logging.info("watcher: %s", check_catalog())

@app.route(route="run-now", methods=["POST"], auth_level=func.AuthLevel.FUNCTION)                     # demo button
def run_now(req: func.HttpRequest) -> func.HttpResponse:
    return func.HttpResponse(json.dumps(check_catalog()), mimetype="application/json")
```
`watcher/requirements.txt`: azure-functions, astroquery, requests, azure-storage-blob, azure-identity

**`api/app/gaia.py`: propagation core**, used by both the overlay and validation:
```python
import astropy.units as u
import numpy as np
from astropy.coordinates import SkyCoord, Distance, get_body_barycentric
from astropy.time import Time

GAIA_EPOCH = Time(2016.0, format="jyear", scale="tcb")

def predict_radec(ra, dec, pmra, pmdec, plx, rv, t: Time) -> tuple[float, float]:
    """Astrometric position seen from Earth at t: space motion + parallax, NO aberration (matches SPHEREx WCS)."""
    if not (plx and plx > 0):                                       # pm-only fallback
        c = SkyCoord(ra * u.deg, dec * u.deg, pm_ra_cosdec=(pmra or 0) * u.mas / u.yr,
                     pm_dec=(pmdec or 0) * u.mas / u.yr, obstime=GAIA_EPOCH, frame="icrs")
        s = c.apply_space_motion(new_obstime=t)
        return s.ra.deg, s.dec.deg
    c = SkyCoord(ra * u.deg, dec * u.deg, distance=Distance(parallax=plx * u.mas),
                 pm_ra_cosdec=pmra * u.mas / u.yr, pm_dec=pmdec * u.mas / u.yr,
                 radial_velocity=(0 if rv is None or np.isnan(rv) else rv) * u.km / u.s,
                 obstime=GAIA_EPOCH, frame="icrs")
    bary = c.apply_space_motion(new_obstime=t).cartesian.without_differentials()
    geo = SkyCoord(bary - get_body_barycentric("earth", t), frame="icrs")   # parallax via vector subtraction
    return geo.ra.deg, geo.dec.deg
```

---

## 12. End-to-end verification

1. **Unit tests** (`pytest api/tests`):
   - Key determinism.
   - Dedupe: DR beats QR, and a `retry` reprocessing beats the original.
   - Epoch grouping on synthetic MJDs.
   - `predict_radec` for Barnard's at 2026.0 reproduces about (269.44627, +4.76820) to within 1″ before parallax, and the parallax term is ≤ 0.55″.
2. **Data spike** (notebook): Barnard's Star from 2 real epochs shows a hop of about 1.7 px that matches the prediction.
3. **`scripts/validate.py`** on all 5 golden manifests writes `validation.md` and passes the §6 criteria (or records an honest miss for WISE 0855).
4. **Live smoke test:**
   - `curl $API/api/health`
   - `POST /api/views` for a new position returns 202; polling reaches `ready`; the second identical POST returns 200 (cache hit).
   - The App Insights query shows `cache.hit=true`.
5. **Resilience:**
   - Scale the API to 0 or stop it, then load `?target=barnard` etc.; all 5 render from `/golden`.
   - Turn on a forced IRSA failure flag (`IRSA_FORCE_DOWN=1`) and check that frames still come from S3.
6. **Freshness:** `POST …/api/run-now?code=<fn-key>` rewrites `meta/catalog.json` (`checked_at` updates) and the UI badge changes.
7. **Browser check** (Playwright): open each of the 5 target URLs plus one shared custom URL on desktop and phone widths; play, blink, toggle difference mode and the Gaia overlay; no console errors.

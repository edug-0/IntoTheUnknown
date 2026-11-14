"""Gaia DR3 cone query and position propagation (PLAN §5.8).

Positions are astrometric, as seen from Earth at epoch t: space motion plus parallax,
with no aberration or light deflection. The SPHEREx WCS is tied to Gaia, so those are
already absorbed; `transform_to(GCRS)` would add ~20" of aberration (about 3 px).
"""

from __future__ import annotations

import csv
import io
import logging
import math
import os
import time
import warnings
from dataclasses import dataclass

import astropy.units as u
import numpy as np
import requests
from astropy.coordinates import (
    Distance,
    SkyCoord,
    UnitSphericalRepresentation,
    get_body_barycentric,
)
from astropy.time import Time
from erfa import ErfaWarning

log = logging.getLogger(__name__)

GAIA_EPOCH = Time(2016.0, format="jyear", scale="tcb")

# --- Propagation ---------------------------------------------------------------------


def _as_float(x) -> np.ndarray:
    """None, masked or missing values become NaN."""
    if isinstance(x, np.ma.MaskedArray):
        return x.astype(float).filled(np.nan)
    return np.asarray(x, dtype=float)


def predict_radec_many(
    ra, dec, pmra, pmdec, plx, rv, t: Time, ref_epoch: Time = GAIA_EPOCH
) -> tuple[np.ndarray, np.ndarray]:
    """Vectorised `predict_radec`: arrays of stars (deg, mas/yr, mas, km/s), one epoch.

    - pmra or pmdec missing/non-finite: 2-parameter solution, returned unchanged.
    - parallax missing, non-finite or <= 0: proper motion only.
    - rv missing or non-finite: 0.
    """
    if not t.isscalar:
        raise ValueError("t must be a single Time")
    ra, dec, pmra, pmdec, plx, rv = np.broadcast_arrays(
        *(_as_float(v) for v in (ra, dec, pmra, pmdec, plx, rv))
    )
    out_ra, out_dec = ra.astype(float), dec.astype(float)  # copies; static by default

    has_pm = np.isfinite(pmra) & np.isfinite(pmdec)
    has_plx = has_pm & np.isfinite(plx) & (plx > 0)
    pm_only = has_pm & ~has_plx

    with warnings.catch_warnings():
        # With no (or a tiny) parallax ERFA substitutes a large distance and warns
        # "distance overridden". That is the behaviour we want, so keep logs quiet.
        warnings.simplefilter("ignore", ErfaWarning)
        if pm_only.any():
            m = pm_only
            out_ra[m], out_dec[m] = _pm_only(
                ra[m], dec[m], pmra[m], pmdec[m], t, ref_epoch
            )
        if has_plx.any():
            m = has_plx
            out_ra[m], out_dec[m] = _with_parallax(
                ra[m], dec[m], pmra[m], pmdec[m], plx[m], rv[m], t, ref_epoch
            )
    return out_ra, out_dec


def _pm_only(ra, dec, pmra, pmdec, t, ref_epoch):
    c = SkyCoord(
        ra=ra * u.deg,
        dec=dec * u.deg,
        pm_ra_cosdec=pmra * u.mas / u.yr,
        pm_dec=pmdec * u.mas / u.yr,
        obstime=ref_epoch,
        frame="icrs",
    )
    s = c.apply_space_motion(new_obstime=t)
    return s.ra.deg, s.dec.deg


def _with_parallax(ra, dec, pmra, pmdec, plx, rv, t, ref_epoch):
    c = SkyCoord(
        ra=ra * u.deg,
        dec=dec * u.deg,
        distance=Distance(parallax=plx * u.mas),
        pm_ra_cosdec=pmra * u.mas / u.yr,
        pm_dec=pmdec * u.mas / u.yr,
        radial_velocity=np.where(np.isfinite(rv), rv, 0.0) * u.km / u.s,
        obstime=ref_epoch,
        frame="icrs",
    )
    bary = c.apply_space_motion(new_obstime=t).cartesian.without_differentials()
    # Parallax by vector subtraction: star minus Earth, both barycentric (no GCRS).
    earth = get_body_barycentric("earth", t)
    geo = (bary - earth).represent_as(UnitSphericalRepresentation)
    return geo.lon.deg, geo.lat.deg


def predict_radec(
    ra, dec, pmra, pmdec, plx, rv, t: Time, ref_epoch: Time = GAIA_EPOCH
) -> tuple[float, float]:
    """Astrometric (ra, dec) in deg of one star at epoch t. See `predict_radec_many`."""
    r, d = predict_radec_many(ra, dec, pmra, pmdec, plx, rv, t, ref_epoch)
    return float(r), float(d)


def propagate_catalog(cat: np.ndarray, t: Time) -> tuple[np.ndarray, np.ndarray]:
    """Propagate every row of a `query_gaia_cone` result to epoch t."""
    return predict_radec_many(
        cat["ra"],
        cat["dec"],
        cat["pmra"],
        cat["pmdec"],
        cat["parallax"],
        cat["radial_velocity"],
        t,
    )


# --- Cone query ----------------------------------------------------------------------

# PLAN §5.8 query. POINT/CIRCLE carry 'ICRS' because ARI's ADQL parser requires it
# (ESA accepts both forms).
GAIA_COLUMNS = (
    "source_id",
    "ra",
    "dec",
    "pmra",
    "pmdec",
    "parallax",
    "radial_velocity",
    "phot_g_mean_mag",
)
GAIA_DTYPE = np.dtype([("source_id", "i8")] + [(c, "f8") for c in GAIA_COLUMNS[1:]])
GAIA_CONE_ADQL = (
    "SELECT " + ", ".join(GAIA_COLUMNS) + " FROM gaiadr3.gaia_source "
    "WHERE 1=CONTAINS(POINT('ICRS',ra,dec), "
    "CIRCLE('ICRS',{ra:.8f},{dec:.8f},{r:.8f})) AND phot_g_mean_mag < 20.5"
)

# Tried in order. Both serve gaiadr3.gaia_source with identical columns and values.
GAIA_TAP_ENDPOINTS = (
    ("ESA", "https://gea.esac.esa.int/tap-server/tap/sync"),
    ("ARI", "https://gaia.ari.uni-heidelberg.de/tap/sync"),
)
# Both servers truncate silently at MAXREC, so we ask for one more row than we accept.
GAIA_MAX_ROWS = 50_000
MAX_RADIUS_DEG = 1.0


class GaiaUnavailable(RuntimeError):
    """The Gaia query could not return a complete result."""


class _EndpointError(Exception):
    """One endpoint failed; try the next."""


def cone_radius_deg(fov_arcmin: float) -> float:
    """Query radius covering the view's corners plus 2' for fast movers (PLAN §5.8)."""
    return (fov_arcmin * math.sqrt(2) / 2 + 2) / 60


def _timeout(timeout_s: float | None) -> float:
    if timeout_s is None:
        timeout_s = float(os.environ.get("GAIA_TIMEOUT_S", "30"))
    if not timeout_s > 0:
        raise ValueError(f"timeout must be > 0, got {timeout_s}")
    return timeout_s


def _tap_sync(url: str, adql: str, timeout_s: float) -> str:
    """POST one sync query, with a wall-clock bound on the whole download."""
    deadline = time.monotonic() + timeout_s
    data = {
        "REQUEST": "doQuery",
        "LANG": "ADQL",
        "FORMAT": "csv",
        "MAXREC": str(GAIA_MAX_ROWS + 1),
        "QUERY": adql,
    }
    with requests.post(url, data=data, timeout=timeout_s, stream=True) as r:
        if r.status_code != 200:
            raise _EndpointError(f"HTTP {r.status_code}: {r.text[:300].strip()}")
        chunks = []
        for chunk in r.iter_content(chunk_size=1 << 16):
            chunks.append(chunk)
            if time.monotonic() > deadline:
                raise _EndpointError(f"response not complete within {timeout_s:g}s")
    return b"".join(chunks).decode("utf-8")


def _parse_csv(text: str) -> np.ndarray:
    rows = csv.reader(io.StringIO(text))
    header = next(rows, None)
    if header is None or tuple(h.strip() for h in header) != GAIA_COLUMNS:
        raise _EndpointError(f"unexpected header: {text[:200].strip()!r}")
    out = []
    for n, row in enumerate(rows, start=2):
        if not row:
            continue
        if len(row) != len(GAIA_COLUMNS):
            raise _EndpointError(f"line {n}: expected {len(GAIA_COLUMNS)} fields")
        try:
            out.append(
                (int(row[0]),) + tuple(float(v) if v else np.nan for v in row[1:])
            )
        except ValueError as e:
            raise _EndpointError(f"line {n}: {e}") from e
    return np.array(out, dtype=GAIA_DTYPE)


def query_gaia_cone(
    ra: float, dec: float, radius_deg: float, timeout_s: float | None = None
) -> np.ndarray:
    """Gaia DR3 sources with G < 20.5 within radius_deg of (ra, dec), at J2016.0.

    Returns a structured array (`GAIA_DTYPE`), NaN where Gaia has no value. Tries ESA,
    then ARI; each gets `timeout_s` (env `GAIA_TIMEOUT_S`, default 30 s), so the worst
    case is about twice that. Raises `GaiaUnavailable` if no complete result comes back.
    """
    ra, dec, radius_deg = float(ra) % 360.0, float(dec), float(radius_deg)
    if not (
        math.isfinite(ra) and -90 <= dec <= 90 and 0 < radius_deg <= MAX_RADIUS_DEG
    ):
        raise ValueError(f"bad cone: ra={ra}, dec={dec}, radius_deg={radius_deg}")
    timeout_s = _timeout(timeout_s)
    adql = GAIA_CONE_ADQL.format(ra=ra, dec=dec, r=radius_deg)

    errors = []
    for name, url in GAIA_TAP_ENDPOINTS:
        t0 = time.monotonic()
        try:
            cat = _parse_csv(_tap_sync(url, adql, timeout_s))
        except (requests.RequestException, _EndpointError, UnicodeDecodeError) as e:
            errors.append(f"{name}: {type(e).__name__}: {e}")
            log.warning(
                "Gaia %s failed after %.1fs: %s", name, time.monotonic() - t0, e
            )
            continue
        if len(cat) > GAIA_MAX_ROWS:
            raise GaiaUnavailable(
                f"more than {GAIA_MAX_ROWS} Gaia sources in r={radius_deg:.3f} deg; "
                "use a smaller field of view"
            )
        log.info("Gaia %s: %d rows in %.1fs", name, len(cat), time.monotonic() - t0)
        return cat
    raise GaiaUnavailable(
        "Gaia DR3 query failed on every endpoint: " + "; ".join(errors)
    )


# --- Presets -------------------------------------------------------------------------


@dataclass(frozen=True)
class PresetAstrometry:
    ra: float  # deg, at ref_epoch
    dec: float
    pmra: float  # mas/yr, pm_ra * cos(dec)
    pmdec: float
    parallax: float  # mas
    radial_velocity: float  # km/s, NaN if unknown
    ref_epoch: float = 2016.0  # Julian year, TCB
    source_id: int | None = None  # Gaia DR3, None if not in Gaia


# APPROXIMATE: WISE 0855-0714 is not in Gaia. Its designation position, at an assumed
# epoch of ~2010.5, with literature pm and parallax. Gives ~(133.7599, -7.2422) at
# 2026.0 (docs/TARGETS.md). Replace with a measured position when SIMBAD is back.
_WISE0855 = SkyCoord("08h55m10.831s", "-07d14m42.53s", frame="icrs")

# Gaia DR3 at J2016.0 (docs/TARGETS.md), full precision from the ESA TAP on 2026-11-14.
PRESETS: dict[str, PresetAstrometry] = {
    "barnard": PresetAstrometry(
        ra=269.448502525,
        dec=4.739420051,
        pmra=-801.551,
        pmdec=10362.394,
        parallax=546.976,
        radial_velocity=-110.468,
        source_id=4472832130942575872,
    ),
    "eps_ind_b": PresetAstrometry(
        ra=331.076452597,
        dec=-56.793812062,
        pmra=3981.977,
        pmdec=-2466.832,
        parallax=270.658,
        radial_velocity=np.nan,
        source_id=6412596012146801152,
    ),
    "wise0855": PresetAstrometry(
        ra=float(_WISE0855.ra.deg),
        dec=float(_WISE0855.dec.deg),
        pmra=-8120.0,
        pmdec=680.0,
        parallax=439.0,
        radial_velocity=np.nan,
        ref_epoch=2010.5,
    ),
    "rw_aur": PresetAstrometry(
        ra=76.956081196,
        dec=30.401204589,
        pmra=2.641,
        pmdec=-27.398,
        parallax=6.406,
        radial_velocity=-20.937,
        source_id=156430822114424576,
    ),
    "r_dra": PresetAstrometry(
        ra=248.167378367,
        dec=66.755006745,
        pmra=-20.643,
        pmdec=6.149,
        parallax=1.251,
        radial_velocity=np.nan,
        source_id=1648328016354496384,
    ),
}


def preset_centre(target_id: str, t: Time) -> tuple[float, float]:
    """(ra, dec) in deg of a preset target at epoch t, parallax included."""
    if target_id not in PRESETS:
        raise KeyError(f"unknown target {target_id!r}; known: {sorted(PRESETS)}")
    p = PRESETS[target_id]
    ref = Time(p.ref_epoch, format="jyear", scale="tcb")
    return predict_radec(
        p.ra, p.dec, p.pmra, p.pmdec, p.parallax, p.radial_velocity, t, ref
    )

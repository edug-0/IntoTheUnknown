"""Offline checks for the skeletons (PLAN §12.1). No network. Seed for backend/tests/.

Needs: numpy astropy astroquery reproject
Run:   python docs/skeletons/check.py
Cache-key checks moved to backend/tests/test_keys.py with backend/app/cache/blob.py (issue #12).
"""

import astropy.units as u
from astropy.coordinates import SkyCoord
from astropy.time import Time
from gaia import predict_radec
from query import dedupe

# Dedupe: DR beats QR even when QR was processed later; within a release the later processing date wins.
URL = "https://irsa.ipac.caltech.edu/ibe/data/spherex/{0}/level2/2025W17_4B/{1}/1/level2_2025W17_4B_0001_1D1_spx_{1}.fits"


def row(rel, proc):
    return {"collection": f"spherex_{rel}", "url": URL.format(rel, proc), "t_mjd": 1.0}


out = dedupe([row("qr3", "l2b-v27-2026-300"), row("dr1", "l2b-v27-2026-100"), row("dr1", "l2b-v27-2026-196")])
assert len(out) == 1 and out[0]["collection"] == "spherex_dr1" and "2026-196" in out[0]["url"], out

# Gaia propagation, Barnard's Star at 2026.0: proper motion alone lands within 1 arcsec of the preset position,
# and the parallax term is non-zero but no larger than the parallax itself (547 mas).
t = Time(2026.0, format="jyear", scale="tcb")
barnard = (269.448503, 4.739420, -801.55, 10362.39)
pm_only = SkyCoord(*predict_radec(*barnard, None, None, t), unit="deg")
full = SkyCoord(*predict_radec(*barnard, 546.98, None, t), unit="deg")
assert pm_only.separation(SkyCoord(269.44627, 4.76820, unit="deg")) < 1 * u.arcsec
assert 0.05 * u.arcsec < full.separation(pm_only) <= 0.55 * u.arcsec, full.separation(pm_only).arcsec

print("skeleton checks passed")

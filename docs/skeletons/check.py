"""Offline checks for the skeletons (PLAN §12.1). No network. Seed for backend/tests/.

Needs: numpy astropy astroquery reproject azure-storage-blob azure-identity
Run:   python docs/skeletons/check.py
"""

from cache import query_key, render_key
from query import dedupe
from stack import channel_of, group_epochs

# Cache keys: deterministic, independent of frame order, sensitive to position and pipeline version.
qk = query_key(269.4463, 4.7682, 6, "B1-B2")
assert qk == query_key(269.44630001, 4.76820001, 6.0, "B1-B2")
assert qk != query_key(269.4464, 4.7682, 6, "B1-B2")
assert render_key(1, qk, ["b", "a"]) == render_key(1, qk, ["a", "b"]) != render_key(2, qk, ["a", "b"])

# Dedupe: DR beats QR even when QR was processed later; within a release the later processing date wins.
URL = "https://irsa.ipac.caltech.edu/ibe/data/spherex/{0}/level2/2025W17_4B/{1}/1/level2_2025W17_4B_0001_1D1_spx_{1}.fits"


def row(rel, proc):
    return {"collection": f"spherex_{rel}", "url": URL.format(rel, proc), "t_mjd": 1.0}


out = dedupe([row("qr3", "l2b-v27-2026-300"), row("dr1", "l2b-v27-2026-100"), row("dr1", "l2b-v27-2026-196")])
assert len(out) == 1 and out[0]["collection"] == "spherex_dr1" and "2026-196" in out[0]["url"], out

# Epochs: split on a gap over 20 days, and once a cluster spans more than 40 days.
epochs = group_epochs([{"t_mjd": t} for t in (0, 5, 10, 200, 205, 400, 415, 430, 445)])
assert [len(e) for e in epochs] == [3, 2, 3, 1], epochs

# Channels: 17 log-spaced bins per detector, clipped at the band edges.
assert channel_of({"detector": 1, "lam_um": 0.75}) == (1, 0)
assert channel_of({"detector": 1, "lam_um": 1.09}) == (1, 16)

# Gaia propagation checks moved to backend/tests/test_gaia_barnard.py with gaia.py (#8).

print("skeleton checks passed")

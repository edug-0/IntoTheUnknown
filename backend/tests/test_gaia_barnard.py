"""Offline tests for app.processing.gaia, ported from docs/skeletons/check.py.

No network: IERS downloads are off and every HTTP call is mocked.
"""

import time

import numpy as np
import pytest
import requests
from astropy.coordinates import SkyCoord
from astropy.time import Time
from astropy.utils import iers
from astropy.utils.data import conf as data_conf

from app.processing import gaia

T2026 = Time(2026.0, format="jyear", scale="tcb")
BARNARD = (269.448503, 4.739420, -801.55, 10362.39)  # Gaia DR3 at J2016.0, TARGETS.md
BARNARD_PLX = 546.98


@pytest.fixture(autouse=True, scope="module")
def _offline():
    with (
        iers.conf.set_temp("auto_download", False),
        data_conf.set_temp("allow_internet", False),
    ):
        yield


def sep_arcsec(a, b) -> float:
    return SkyCoord(*a, unit="deg").separation(SkyCoord(*b, unit="deg")).arcsec


# --- Propagation ---------------------------------------------------------------------


def test_barnard_2026_by_proper_motion_alone():
    got = gaia.predict_radec(*BARNARD, None, None, T2026)
    assert sep_arcsec(got, (269.44627, 4.76820)) < 1.0


def test_barnard_parallax_term_nonzero_and_bounded():
    pm_only = gaia.predict_radec(*BARNARD, None, None, T2026)
    full = gaia.predict_radec(*BARNARD, BARNARD_PLX, None, T2026)
    assert 0.05 < sep_arcsec(full, pm_only) <= 0.55


@pytest.mark.parametrize("plx", [None, np.nan, 0.0, -1.2])
def test_bad_parallax_means_proper_motion_only(plx):
    expected = gaia.predict_radec(*BARNARD, None, None, T2026)
    assert gaia.predict_radec(*BARNARD, plx, 10.0, T2026) == expected


@pytest.mark.filterwarnings("error")
def test_tiny_parallax_is_quiet_and_matches_pm_only():
    tiny = gaia.predict_radec(10.0, 20.0, 5.0, 5.0, 1e-6, np.nan, T2026)
    pm_only = gaia.predict_radec(10.0, 20.0, 5.0, 5.0, None, None, T2026)
    assert sep_arcsec(tiny, pm_only) < 1e-3


@pytest.mark.parametrize("pmra, pmdec", [(np.nan, np.nan), (None, None), (np.nan, 5.0)])
def test_missing_proper_motion_is_static(pmra, pmdec):
    got = gaia.predict_radec(10.0, 20.0, pmra, pmdec, 1.5, np.nan, T2026)
    assert got == (10.0, 20.0)


def test_nan_radial_velocity_is_zero():
    nan_rv = gaia.predict_radec(*BARNARD, BARNARD_PLX, np.nan, T2026)
    zero_rv = gaia.predict_radec(*BARNARD, BARNARD_PLX, 0.0, T2026)
    assert nan_rv == zero_rv


def test_vectorised_matches_scalar():
    stars = [
        (*BARNARD, BARNARD_PLX, -110.47),  # parallax + rv
        (*BARNARD, None, None),  # pm only
        (10.0, 20.0, np.nan, np.nan, np.nan, np.nan),  # 2-parameter: static
        (331.076453, -56.793812, 3982.0, -2466.8, 270.7, np.nan),  # parallax, no rv
        (359.9999, 0.0, 50.0, 0.0, -0.5, 10.0),  # negative parallax, crosses RA 0
    ]
    cols = [np.array([s[i] for s in stars], dtype=float) for i in range(6)]
    ra, dec = gaia.predict_radec_many(*cols, T2026)
    for i, star in enumerate(stars):
        r1, d1 = gaia.predict_radec(*star, T2026)
        assert ra[i] == pytest.approx(r1, abs=1e-10)
        assert dec[i] == pytest.approx(d1, abs=1e-10)
    assert ra[4] < 1.0  # wrapped into [0, 360)


# --- Presets -------------------------------------------------------------------------

# docs/TARGETS.md centring table at 2026.0 (pm only; preset_centre adds <= 0.55").
TARGETS_2026 = {
    "barnard": (269.44627, 4.76820),
    "eps_ind_b": (331.09665, -56.80066),
    "rw_aur": (76.95608, 30.40113),
    "r_dra": (248.16723, 66.75502),
}


def test_presets_cover_all_five_targets():
    assert set(gaia.PRESETS) == set(TARGETS_2026) | {"wise0855"}


@pytest.mark.parametrize("target, expected", TARGETS_2026.items())
def test_preset_centre_matches_targets_md(target, expected):
    assert sep_arcsec(gaia.preset_centre(target, T2026), expected) < 1.0


def test_preset_centre_wise0855_approximate():
    assert sep_arcsec(gaia.preset_centre("wise0855", T2026), (133.7599, -7.2422)) < 5.0


def test_preset_centre_moves_with_epoch():
    a = gaia.preset_centre("barnard", Time(2025.5, format="jyear", scale="tcb"))
    b = gaia.preset_centre("barnard", Time(2026.5, format="jyear", scale="tcb"))
    assert 9.5 < sep_arcsec(a, b) < 11.5  # ~10.4"/yr, +-0.55" parallax


def test_preset_centre_unknown_target():
    with pytest.raises(KeyError):
        gaia.preset_centre("planet_x", T2026)


def test_cone_radius():
    assert gaia.cone_radius_deg(6) == pytest.approx((6 * 2**0.5 / 2 + 2) / 60)


# --- Cone query (mocked HTTP) --------------------------------------------------------

HEADER = "source_id,ra,dec,pmra,pmdec,parallax,radial_velocity,phot_g_mean_mag\n"
CSV_OK = (
    HEADER
    + "4472832130942575872,269.4485025,4.7394201,-801.55,10362.39,546.98,-110.47,8.19\n"
    + "4472808869388202880,269.3849161,4.6956692,-4.537,-5.644,0.310,,20.18\n"
    + "4472811824325764992,269.3704051,4.7068290,,,,,20.41\n"
)


class FakeResponse:
    def __init__(self, body: str, status: int = 200, delay_s: float = 0.0):
        self.status_code = status
        self.text = body
        self._body = body.encode()
        self._delay_s = delay_s

    def iter_content(self, chunk_size=1):
        for i in range(0, len(self._body), 64):
            time.sleep(self._delay_s)
            yield self._body[i : i + 64]

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def fake_post(monkeypatch, *outcomes):
    """Each call to requests.post consumes the next outcome (response or exception)."""
    calls = []

    def post(url, **kwargs):
        calls.append((url, kwargs))
        out = outcomes[len(calls) - 1]
        if isinstance(out, Exception):
            raise out
        return out

    monkeypatch.setattr(gaia.requests, "post", post)
    return calls


def test_query_parses_csv_with_nan_for_missing(monkeypatch):
    monkeypatch.setenv("GAIA_TIMEOUT_S", "7")
    calls = fake_post(monkeypatch, FakeResponse(CSV_OK))
    cat = gaia.query_gaia_cone(269.44627, 4.76820, 0.1)

    assert len(calls) == 1 and calls[0][0] == gaia.GAIA_TAP_ENDPOINTS[0][1]
    assert calls[0][1]["timeout"] == 7.0
    adql = calls[0][1]["data"]["QUERY"]
    assert "FROM gaiadr3.gaia_source" in adql and "phot_g_mean_mag < 20.5" in adql
    assert "CIRCLE('ICRS',269.44627000,4.76820000,0.10000000)" in adql

    assert cat.dtype == gaia.GAIA_DTYPE and len(cat) == 3
    assert cat["source_id"][0] == 4472832130942575872
    assert np.isnan(cat["radial_velocity"][1])
    assert np.isnan(cat["pmra"][2]) and np.isnan(cat["parallax"][2])

    ra, dec = gaia.propagate_catalog(cat, T2026)
    assert sep_arcsec((ra[0], dec[0]), gaia.preset_centre("barnard", T2026)) < 0.01
    assert (ra[2], dec[2]) == (cat["ra"][2], cat["dec"][2])  # 2-parameter: static


def test_query_falls_back_to_ari(monkeypatch):
    calls = fake_post(
        monkeypatch, requests.ConnectionError("reset"), FakeResponse(CSV_OK)
    )
    cat = gaia.query_gaia_cone(269.44627, 4.76820, 0.1, timeout_s=5)
    assert [c[0] for c in calls] == [url for _, url in gaia.GAIA_TAP_ENDPOINTS]
    assert len(cat) == 3


@pytest.mark.parametrize("exc", [requests.Timeout, requests.ConnectionError])
def test_query_network_failure_raises_gaia_unavailable(monkeypatch, exc):
    fake_post(monkeypatch, exc("boom"), exc("boom"))
    with pytest.raises(gaia.GaiaUnavailable, match="ESA.*ARI"):
        gaia.query_gaia_cone(269.44627, 4.76820, 0.1, timeout_s=5)


def test_query_never_returns_garbage(monkeypatch):
    bad_row = HEADER + "4472832130942575872,269.44,4.73\n"
    fake_post(
        monkeypatch, FakeResponse(bad_row), FakeResponse("<html>oops</html>", 503)
    )
    with pytest.raises(gaia.GaiaUnavailable, match="HTTP 503"):
        gaia.query_gaia_cone(269.44627, 4.76820, 0.1, timeout_s=5)


def test_query_slow_download_hits_wall_clock_timeout(monkeypatch):
    slow = FakeResponse(CSV_OK, delay_s=0.03)  # 5 chunks, ~0.15 s
    fake_post(monkeypatch, slow, slow)
    with pytest.raises(gaia.GaiaUnavailable, match="not complete within"):
        gaia.query_gaia_cone(269.44627, 4.76820, 0.1, timeout_s=0.05)


def test_query_truncated_result_raises(monkeypatch):
    monkeypatch.setattr(gaia, "GAIA_MAX_ROWS", 2)
    calls = fake_post(monkeypatch, FakeResponse(CSV_OK))
    with pytest.raises(gaia.GaiaUnavailable, match="smaller field of view"):
        gaia.query_gaia_cone(269.44627, 4.76820, 0.1, timeout_s=5)
    assert calls[0][1]["data"]["MAXREC"] == "3"


@pytest.mark.parametrize("ra, dec, r", [(10, 95, 0.1), (np.nan, 0, 0.1), (10, 0, 0)])
def test_query_rejects_bad_cone(ra, dec, r):
    with pytest.raises(ValueError):
        gaia.query_gaia_cone(ra, dec, r, timeout_s=5)

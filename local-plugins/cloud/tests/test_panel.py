"""
Panel methods. All sub-second by contract, so these run against a fake Http
and a temp profile dir with no server anywhere.
"""

import datetime

import pytest
from conftest import FakeCtx, FakeResponse, FakeSession

import cloud.panel as panel_module
from cloud.constants import (
    HEARTBEAT_STALE_S,
    PUSH_KEY,
    TERMINAL_SURFACE_S,
    ConnectionStatus,
    ErrorKind,
    PanelDataKey,
    PollStatusValue,
    PushStatus,
)
from cloud.engine import CloudProfile, Http, ProfileStore
from cloud.models import iso, utc_now
from cloud.panel import CloudPanel

API_URL = "https://api.example.com"
AUTH_URL = "https://auth.example.com/cas/api"

PAIRING_PAYLOAD = {
    "device_code": "dev-1",
    "user_code": "WDJB-MJHT",
    "verification_uri": "https://cloud.example.com/activate",
    "verification_uri_complete": (
        "https://cloud.example.com/activate?code=WDJB-MJHT"
    ),
    "expires_in": 600,
    "interval": 5,
}


@pytest.fixture(name="http")
def fixture_http(monkeypatch):
    """Every ``Http()`` the panel builds answers from this queue."""
    session = FakeSession()
    monkeypatch.setattr(
        panel_module, "Http", lambda: Http(session=session), raising=True
    )
    return session


class CountingDataset:
    """Records how many times something asked it for a count."""

    def __init__(self, name, size):
        self.name = name
        self.size = size
        self.counted = 0

    def __len__(self):
        self.counted += 1
        return self.size


def connection(ctx):
    return ctx.panel_data(PanelDataKey.CONNECTION.value)


def push(ctx):
    return ctx.panel_data(PanelDataKey.PUSH.value)


def save_profile(**kwargs):
    ProfileStore().save(
        CloudProfile(api_url=API_URL, auth_url=AUTH_URL, **kwargs)
    )


def stored_push(status, age_seconds=0, **extra):
    stamp = utc_now() - datetime.timedelta(seconds=age_seconds)
    return {
        "status": status.value,
        "updated_at": iso(stamp),
        "local_dataset": "local-dataset",
        "done": 4,
        "total": 10,
        **extra,
    }


# --- on_load --------------------------------------------------------------


def test_on_load_reports_connected_only_with_a_key(profile_dir):
    save_profile(api_key="kid|raw", key_scope="onboarding")
    ctx = FakeCtx()

    CloudPanel().on_load(ctx)
    assert connection(ctx)["status"] == ConnectionStatus.CONNECTED.value
    assert connection(ctx)["key_scope"] == "onboarding"

    save_profile()
    ctx = FakeCtx()
    CloudPanel().on_load(ctx)

    assert connection(ctx)["status"] == ConnectionStatus.DISCONNECTED.value
    assert connection(ctx)["api_url"] == API_URL
    assert connection(ctx)["auth_url"] == AUTH_URL


def test_on_load_url_precedence(profile_dir, monkeypatch):
    save_profile()
    ctx = FakeCtx()

    CloudPanel().on_load(ctx)
    assert connection(ctx)["api_url"] == API_URL

    monkeypatch.setenv("FIFTYONE_CLOUD_API_URL", "https://api.override/")
    ctx = FakeCtx()
    CloudPanel().on_load(ctx)

    assert connection(ctx)["api_url"] == "https://api.override"
    assert connection(ctx)["auth_url"] == AUTH_URL


def test_on_load_stale_running_becomes_failed(profile_dir):
    ctx = FakeCtx()
    ctx.store_.values[PUSH_KEY] = stored_push(
        PushStatus.RUNNING, age_seconds=HEARTBEAT_STALE_S + 5
    )

    CloudPanel().on_load(ctx)

    assert push(ctx)["status"] == PushStatus.FAILED.value
    assert push(ctx)["error"]["kind"] == ErrorKind.UNKNOWN.value
    assert "stopped reporting progress" in push(ctx)["error"]["message"]


def test_on_load_fresh_running_is_passed_through(profile_dir):
    ctx = FakeCtx()
    ctx.store_.values[PUSH_KEY] = stored_push(PushStatus.RUNNING, 5)

    CloudPanel().on_load(ctx)

    assert push(ctx)["status"] == PushStatus.RUNNING.value
    assert push(ctx)["done"] == 4


def test_on_load_recent_terminal_is_passed_through(profile_dir):
    ctx = FakeCtx()
    ctx.store_.values[PUSH_KEY] = stored_push(
        PushStatus.DONE,
        age_seconds=TERMINAL_SURFACE_S - 10,
        outcome={"dataset": "cloud-ds", "accepted": 4, "rejected_count": 1},
    )

    CloudPanel().on_load(ctx)

    assert push(ctx)["status"] == PushStatus.DONE.value
    assert push(ctx)["outcome"]["dataset"] == "cloud-ds"


def test_on_load_old_terminal_resets_to_idle(profile_dir):
    ctx = FakeCtx()
    ctx.store_.values[PUSH_KEY] = stored_push(
        PushStatus.DONE, age_seconds=TERMINAL_SURFACE_S + 10
    )

    CloudPanel().on_load(ctx)

    assert push(ctx)["status"] == PushStatus.IDLE.value
    assert push(ctx)["done"] == 0


def test_on_load_tolerates_a_corrupt_store_value(profile_dir):
    for value in ({"status": "nonsense"}, {"status": "running"}, "junk", 7):
        ctx = FakeCtx()
        ctx.store_.values[PUSH_KEY] = value

        CloudPanel().on_load(ctx)

        assert push(ctx)["status"] == PushStatus.IDLE.value


def test_on_load_tolerates_a_snapshot_from_another_plugin_version(
    profile_dir,
):
    """Only this plugin writes the store, so a snapshot that will not
    rebuild means version drift — which must cost a reset, not a broken
    panel."""
    drifted = [
        # a nested object short a field
        stored_push(PushStatus.DONE, preview={"samples": 1}),
        # a counter that stopped being a number
        stored_push(PushStatus.DONE, done="lots"),
        # an outcome whose numbers are strings
        stored_push(PushStatus.DONE, outcome={"samples": "many"}),
    ]

    for value in drifted:
        ctx = FakeCtx()
        ctx.store_.values[PUSH_KEY] = value

        CloudPanel().on_load(ctx)

        assert push(ctx)["status"] == PushStatus.IDLE.value


def test_render_counts_are_not_recomputed_per_call(profile_dir):
    """``render`` runs after every panel method, including each pairing
    poll; a count over a filtered view is a full aggregation."""
    panel = CloudPanel()
    ctx = FakeCtx()
    ctx.dataset = CountingDataset(name="local-dataset", size=7)

    panel.render(ctx)
    panel.render(ctx)
    panel.render(ctx)

    assert ctx.dataset.counted == 1


def test_render_recounts_when_the_view_changes(profile_dir):
    panel = CloudPanel()
    ctx = FakeCtx()
    ctx.dataset = CountingDataset(name="local-dataset", size=7)
    ctx.view = [object()] * 3
    ctx.has_custom_view = True

    ctx.request_params = {"filters": {"a": 1}}
    panel.render(ctx)
    ctx.request_params = {"filters": {"a": 2}}
    panel.render(ctx)

    assert ctx.dataset.counted == 2


def test_on_load_invalidates_the_count_cache(profile_dir):
    panel = CloudPanel()
    ctx = FakeCtx()
    ctx.dataset = CountingDataset(name="local-dataset", size=7)

    panel.render(ctx)
    panel.on_load(ctx)
    panel.render(ctx)

    # Reopening the panel is the one moment worth paying for fresh counts.
    assert ctx.dataset.counted == 2


# --- pairing --------------------------------------------------------------


def test_start_pairing_returns_the_device_code_but_never_stores_it(
    profile_dir, http
):
    http.replies = [FakeResponse(200, PAIRING_PAYLOAD)]
    ctx = FakeCtx(params={"api_url": API_URL, "auth_url": AUTH_URL})

    result = CloudPanel().start_pairing(ctx)

    assert result["device_code"] == "dev-1"
    assert connection(ctx)["status"] == ConnectionStatus.PAIRING.value
    assert connection(ctx)["pairing"]["user_code"] == "WDJB-MJHT"
    assert "device_code" not in connection(ctx)["pairing"]
    assert all(
        "dev-1" not in str(value) for _, value in ctx.panel.writes
    ), "panel data is workspace-persisted and echoed on every event"


def test_start_pairing_saves_a_keyless_profile_with_the_urls(
    profile_dir, http
):
    http.replies = [FakeResponse(200, PAIRING_PAYLOAD)]
    ctx = FakeCtx(params={"api_url": API_URL + "/", "auth_url": AUTH_URL})

    CloudPanel().start_pairing(ctx)

    profile = ProfileStore().load()
    assert profile.api_url == API_URL
    assert profile.auth_url == AUTH_URL
    assert profile.api_key is None


def test_start_pairing_reports_a_transport_fault_as_a_connection_error(
    profile_dir, http
):
    http.replies = [FakeResponse(502, None)]
    ctx = FakeCtx(params={"api_url": API_URL, "auth_url": AUTH_URL})

    assert CloudPanel().start_pairing(ctx) == {}
    assert connection(ctx)["status"] == ConnectionStatus.DISCONNECTED.value
    assert connection(ctx)["error"]["kind"] == ErrorKind.UNAVAILABLE.value
    assert connection(ctx)["api_url"] == API_URL


@pytest.mark.parametrize(
    "code,expected",
    [
        ("authorization_pending", PollStatusValue.PENDING),
        ("slow_down", PollStatusValue.SLOW_DOWN),
        ("expired_token", PollStatusValue.EXPIRED),
        ("access_denied", PollStatusValue.DENIED),
    ],
)
def test_poll_pairing_maps_each_rfc_code(profile_dir, http, code, expected):
    save_profile()
    http.replies = [FakeResponse(400, {"error": code})]
    ctx = FakeCtx(params={"device_code": "dev-1"})

    assert CloudPanel().poll_pairing(ctx)["status"] == expected.value


def test_poll_pairing_surfaces_a_terminal_code_on_the_connection(
    profile_dir, http
):
    save_profile()
    http.replies = [FakeResponse(400, {"error": "access_denied"})]
    ctx = FakeCtx(params={"device_code": "dev-1"})

    CloudPanel().poll_pairing(ctx)

    assert connection(ctx)["error"]["kind"] == ErrorKind.PAIRING_DENIED.value


def test_poll_pairing_issued_saves_the_key_and_connects(profile_dir, http):
    save_profile()
    http.replies = [
        FakeResponse(
            200,
            {"api_key": "kid|raw", "scope": "onboarding", "expires_in": 3600},
        )
    ]
    ctx = FakeCtx(params={"device_code": "dev-1"})

    result = CloudPanel().poll_pairing(ctx)

    assert result["status"] == PollStatusValue.ISSUED.value
    profile = ProfileStore().load()
    assert profile.api_key == "kid|raw"
    assert profile.key_expires_at is not None
    assert connection(ctx)["status"] == ConnectionStatus.CONNECTED.value
    assert connection(ctx)["key_scope"] == "onboarding"


def test_poll_pairing_reports_faults_as_statuses_not_exceptions(
    profile_dir, http
):
    save_profile()
    http.replies = [FakeResponse(400, {"error": "who_knows"})]
    ctx = FakeCtx(params={"device_code": "dev-1"})

    assert (
        CloudPanel().poll_pairing(ctx)["status"]
        == PollStatusValue.REFUSED.value
    )

    http.replies = [FakeResponse(503, None)]
    ctx = FakeCtx(params={"device_code": "dev-1"})

    assert (
        CloudPanel().poll_pairing(ctx)["status"]
        == PollStatusValue.UNAVAILABLE.value
    )


def test_cancel_pairing_keeps_the_urls(profile_dir):
    save_profile()
    ctx = FakeCtx()

    assert CloudPanel().cancel_pairing(ctx) == {}
    assert connection(ctx)["status"] == ConnectionStatus.DISCONNECTED.value
    assert connection(ctx)["api_url"] == API_URL
    assert "pairing" not in connection(ctx)


# --- connection / push ----------------------------------------------------


def test_disconnect_keeps_the_urls_and_never_clears_the_profile(
    profile_dir, monkeypatch
):
    save_profile(api_key="kid|raw", key_scope="onboarding")
    monkeypatch.setattr(
        ProfileStore,
        "clear",
        lambda self: pytest.fail("clear() would take the URLs with it"),
    )
    ctx = FakeCtx()

    CloudPanel().disconnect(ctx)

    profile = ProfileStore().load()
    assert profile.api_key is None
    assert profile.api_url == API_URL
    assert profile.auth_url == AUTH_URL
    assert connection(ctx)["status"] == ConnectionStatus.DISCONNECTED.value
    assert connection(ctx)["api_url"] == API_URL


def test_disconnect_resets_push_to_idle(profile_dir):
    save_profile(api_key="kid|raw")
    ctx = FakeCtx()
    ctx.store_.values[PUSH_KEY] = stored_push(PushStatus.DONE)

    CloudPanel().disconnect(ctx)

    assert push(ctx)["status"] == PushStatus.IDLE.value


def test_reset_push_deletes_the_store_key(profile_dir):
    ctx = FakeCtx()
    ctx.store_.values[PUSH_KEY] = stored_push(PushStatus.DONE)

    CloudPanel().reset_push(ctx)

    assert PUSH_KEY not in ctx.store_.values
    assert push(ctx)["status"] == PushStatus.IDLE.value


# --- render ---------------------------------------------------------------


def test_render_exposes_every_panel_method_and_the_dataset_context():
    panel = CloudPanel()
    ctx = FakeCtx()
    ctx.dataset.samples = [object()] * 7
    ctx.view = [object()] * 3
    ctx.has_custom_view = True

    view = panel.render(ctx).view.to_json()

    for method in (
        "start_pairing",
        "poll_pairing",
        "cancel_pairing",
        "disconnect",
        "reset_push",
    ):
        assert view[method].endswith(f"#{method}")

    assert view["component"] == "CloudPanelView"
    assert view["composite_view"] is True
    assert view["local_dataset"] == "local-dataset"
    assert view["dataset_count"] == 7
    assert view["view_count"] == 3
    assert view["has_view"] is True


def test_render_skips_the_view_count_without_a_view():
    ctx = FakeCtx()
    ctx.dataset.samples = [object()] * 7
    ctx.view = None

    view = CloudPanel().render(ctx).view.to_json()

    assert view["has_view"] is False
    assert view["view_count"] == 7

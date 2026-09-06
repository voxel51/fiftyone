"""
``push_to_cloud``: the sequencing contract.

Every assertion here is about *what was emitted, in what order* — the panel
is a state machine and the operator is its only producer, so a missing or
out-of-order snapshot is a stuck UI.
"""

import datetime

import pytest
from conftest import FakeCtx, FakeSample

import cloud.operators as operators_module
from cloud.constants import (
    ALREADY_RUNNING_MESSAGE,
    PANEL_NAME,
    PUSH_KEY,
    REJECTED_PREVIEW_LIMIT,
    RUNNING_GUARD_S,
    STORE_NAME,
    ConnectionStatus,
    ErrorKind,
    PanelDataKey,
    PushStatus,
)
from cloud.engine import (
    CloudProfile,
    CloudUnavailableError,
    KeyRefusedError,
    ProfileStore,
    PushEvent,
    PushOutcome,
    PushStage,
    PushState,
    RefusedError,
    RejectedSample,
    SessionExpiredError,
)
from cloud.engine.session import BatchLimits
from cloud.models import iso, utc_now
from cloud.operators import CloudPushSubscription, OpenCloudPanel, PushToCloud
from cloud.plan_cache import PLAN_CACHE

API_URL = "https://api.example.com"
AUTH_URL = "https://auth.example.com/cas/api"


@pytest.fixture(name="paired", autouse=True)
def fixture_paired(profile_dir):
    ProfileStore().save(
        CloudProfile(api_url=API_URL, auth_url=AUTH_URL, api_key="kid|raw")
    )
    PLAN_CACHE.clear()
    yield
    PLAN_CACHE.clear()


@pytest.fixture(name="media")
def fixture_media(tmp_path):
    """Two real files plus one path that isn't there, so the plan has a
    missing entry without any mocking of the filesystem."""
    files = []
    for index in range(2):
        path = tmp_path / f"image-{index}.jpg"
        path.write_bytes(b"x" * (10 + index))
        files.append(str(path))
    return files + [str(tmp_path / "gone.jpg")]


def ctx_for(media, **params):
    ctx = FakeCtx(
        params={
            "target": "dataset",
            "dataset_name": "cloud-ds",
            "panel_id": "panel-1",
            **params,
        }
    )
    ctx.dataset.samples = [FakeSample(filepath=path) for path in media]
    return ctx


def pushes(requests):
    """The push snapshots a run yielded, in order."""
    return [
        request.params["data"][PanelDataKey.PUSH.value]
        for request in requests
        if PanelDataKey.PUSH.value in request.params["data"]
    ]


def statuses(requests):
    return [snapshot["status"] for snapshot in pushes(requests)]


def outcome_with(**overrides):
    defaults = dict(
        dataset="cloud-ds",
        session_id="sess-1",
        uploaded=2,
        skipped_uploads=0,
        missing_files=1,
        accepted=2,
        rejected=[],
        samples=2,
        shortfall=0,
    )
    defaults.update(overrides)
    return PushOutcome(**defaults)


def fake_run_push(outcome=None, events=(), error=None):
    calls = []

    def run_push(profile, dataset_name, samples, http, **kwargs):
        calls.append({"dataset_name": dataset_name, **kwargs})
        for event in events:
            kwargs["on_progress"](event)
        if error is not None:
            raise error
        return outcome or outcome_with()

    run_push.calls = calls
    return run_push


def stored_push(status, age_seconds=0):
    return {
        "status": status.value,
        "updated_at": iso(utc_now() - datetime.timedelta(seconds=age_seconds)),
        "local_dataset": "local-dataset",
    }


# --- preview mode ---------------------------------------------------------


def test_preview_emits_planning_before_it_scans(media, monkeypatch):
    scanned = []
    real_plan = operators_module.build_push_plan

    def spy(samples):
        scanned.append(True)
        return real_plan(samples)

    monkeypatch.setattr(operators_module, "build_push_plan", spy)
    ctx = ctx_for(media, mode="preview")

    generator = PushToCloud().execute(ctx)
    first = next(generator)

    assert (
        first.params["data"][PanelDataKey.PUSH.value]["status"]
        == PushStatus.PLANNING.value
    )
    # The scan is seconds to minutes; the spinner has to be on screen first.
    assert scanned == []

    list(generator)
    assert scanned == [True]


def test_preview_emits_counts_and_a_plan_token(media):
    ctx = ctx_for(media, mode="preview")

    snapshots = pushes(list(PushToCloud().execute(ctx)))

    assert [item["status"] for item in snapshots] == [
        PushStatus.PLANNING.value,
        PushStatus.PREVIEW.value,
    ]
    preview = snapshots[-1]["preview"]
    assert preview == {
        "samples": 2,
        "files": 2,
        "total_bytes": 21,
        "missing": 1,
    }
    token = snapshots[-1]["plan_token"]
    assert PLAN_CACHE.take(token, "local-dataset", "dataset") is not None


def test_preview_reports_resumable_when_a_state_file_exists(
    media, monkeypatch
):
    seen = {}

    class FakeStateStore:
        def __init__(self, api_url, dataset_name):
            seen["dataset_name"] = dataset_name

        def load(self):
            return PushState(
                session_id="s",
                prefix="p/",
                store_root="gs://b",
                limits=BatchLimits(1, 1),
                uploaded_keys=["media/image-0.jpg"],
            )

    monkeypatch.setattr(operators_module, "PushStateStore", FakeStateStore)
    ctx = ctx_for(media, mode="preview")

    snapshots = pushes(list(PushToCloud().execute(ctx)))

    # Resume state is keyed on the *cloud* name the user typed, not the
    # local one.
    assert seen["dataset_name"] == "cloud-ds"
    assert snapshots[-1]["resumable"] == {"uploaded": 1, "total": 2}


def test_preview_omits_resumable_when_no_state_file_exists(media):
    ctx = ctx_for(media, mode="preview")

    snapshots = pushes(list(PushToCloud().execute(ctx)))

    # Absent, not zeroed — the App branches on presence.
    assert "resumable" not in snapshots[-1]


# --- push mode ------------------------------------------------------------


def test_push_reuses_the_cached_plan(media, monkeypatch):
    ctx = ctx_for(media, mode="preview")
    token = pushes(list(PushToCloud().execute(ctx)))[-1]["plan_token"]

    run_push = fake_run_push()
    monkeypatch.setattr(operators_module, "run_push", run_push)
    monkeypatch.setattr(
        operators_module,
        "build_push_plan",
        lambda samples: pytest.fail("the cached plan should have been used"),
    )

    ctx = ctx_for(media, mode="push", plan_token=token)
    result = statuses(list(PushToCloud().execute(ctx)))

    assert PushStatus.PLANNING.value not in result
    assert run_push.calls[0]["plan"] is not None


def test_push_rebuilds_and_re_emits_planning_on_a_cache_miss(
    media, monkeypatch
):
    monkeypatch.setattr(operators_module, "run_push", fake_run_push())
    ctx = ctx_for(media, mode="push", plan_token="expired-token")

    result = statuses(list(PushToCloud().execute(ctx)))

    assert result[0] == PushStatus.PLANNING.value
    assert result[-1] == PushStatus.DONE.value


def test_push_emits_a_zero_running_snapshot_before_any_file_completes(
    media, monkeypatch
):
    monkeypatch.setattr(operators_module, "run_push", fake_run_push())
    ctx = ctx_for(media, mode="push")

    snapshots = pushes(list(PushToCloud().execute(ctx)))
    running = [
        item
        for item in snapshots
        if item["status"] == PushStatus.RUNNING.value
    ]

    assert running[0]["done"] == 0
    assert running[0]["total"] == 2
    assert running[0]["stage"] == PushStage.UPLOADING.value


def test_push_streams_a_stage_change_past_the_throttle(media, monkeypatch):
    """Same-stage ticks inside 250 ms coalesce by design; a stage change
    never may, or the label lags the bar."""
    monkeypatch.setattr(
        operators_module,
        "run_push",
        fake_run_push(
            events=[
                PushEvent(PushStage.UPLOADING, 1, 2, "a"),
                PushEvent(PushStage.INGESTING, 1, 1, "b"),
                PushEvent(PushStage.CLOSING, 0, 1, ""),
            ]
        ),
    )
    ctx = ctx_for(media, mode="push")

    stages = [
        item.get("stage")
        for item in pushes(list(PushToCloud().execute(ctx)))
        if item["status"] == PushStatus.RUNNING.value
    ]

    assert stages[0] == PushStage.UPLOADING.value
    assert stages[-2:] == [
        PushStage.INGESTING.value,
        PushStage.CLOSING.value,
    ]


def test_push_refuses_while_a_fresh_running_snapshot_exists(
    media, monkeypatch
):
    monkeypatch.setattr(
        operators_module,
        "run_push",
        lambda *a, **k: pytest.fail("no second worker may start"),
    )
    ctx = ctx_for(media, mode="push")
    ctx.store_.values[PUSH_KEY] = stored_push(PushStatus.RUNNING, 1)

    snapshots = pushes(list(PushToCloud().execute(ctx)))

    assert snapshots[-1]["status"] == PushStatus.FAILED.value
    assert snapshots[-1]["error"]["kind"] == ErrorKind.REFUSED.value
    assert snapshots[-1]["error"]["message"] == ALREADY_RUNNING_MESSAGE


def test_push_proceeds_when_the_running_snapshot_is_stale(media, monkeypatch):
    monkeypatch.setattr(operators_module, "run_push", fake_run_push())
    ctx = ctx_for(media, mode="push")
    ctx.store_.values[PUSH_KEY] = stored_push(
        PushStatus.RUNNING, RUNNING_GUARD_S + 5
    )

    assert (
        statuses(list(PushToCloud().execute(ctx)))[-1] == PushStatus.DONE.value
    )


def test_push_terminal_snapshot_reaches_both_channels(media, monkeypatch):
    monkeypatch.setattr(operators_module, "run_push", fake_run_push())
    ctx = ctx_for(media, mode="push")

    panel_terminal = pushes(list(PushToCloud().execute(ctx)))[-1]

    assert panel_terminal["status"] == PushStatus.DONE.value
    assert ctx.store_.values[PUSH_KEY] == panel_terminal


def test_push_caps_the_rejected_list_but_not_the_count(media, monkeypatch):
    rejected = [RejectedSample(index=i, reason="bad") for i in range(50)]
    monkeypatch.setattr(
        operators_module,
        "run_push",
        fake_run_push(outcome=outcome_with(rejected=rejected)),
    )
    ctx = ctx_for(media, mode="push")

    outcome = pushes(list(PushToCloud().execute(ctx)))[-1]["outcome"]

    assert outcome["rejected_count"] == 50
    assert len(outcome["rejected"]) == REJECTED_PREVIEW_LIMIT


@pytest.mark.parametrize(
    "error,kind",
    [
        (CloudUnavailableError("down"), ErrorKind.UNAVAILABLE),
        (RefusedError("nope"), ErrorKind.REFUSED),
        (SessionExpiredError("stale"), ErrorKind.SESSION_EXPIRED),
        (KeyRefusedError("bad key"), ErrorKind.KEY_REFUSED),
        (ValueError("who knows"), ErrorKind.UNKNOWN),
    ],
)
def test_push_failure_maps_the_error_kind(media, monkeypatch, error, kind):
    monkeypatch.setattr(
        operators_module, "run_push", fake_run_push(error=error)
    )
    ctx = ctx_for(media, mode="push")

    terminal = pushes(list(PushToCloud().execute(ctx)))[-1]

    assert terminal["status"] == PushStatus.FAILED.value
    assert terminal["error"]["kind"] == kind.value


def test_push_honors_the_fresh_flag(media, monkeypatch):
    run_push = fake_run_push()
    monkeypatch.setattr(operators_module, "run_push", run_push)
    ctx = ctx_for(media, mode="push", fresh=True)

    list(PushToCloud().execute(ctx))

    assert run_push.calls[0]["fresh"] is True


# --- both modes -----------------------------------------------------------


@pytest.mark.parametrize("mode", ["preview", "push"])
def test_unpaired_emits_not_paired_and_disconnects_the_connection(media, mode):
    ProfileStore().save(CloudProfile(api_url=API_URL, auth_url=AUTH_URL))
    ctx = ctx_for(media, mode=mode)

    requests = list(PushToCloud().execute(ctx))

    terminal = pushes(requests)[-1]
    assert terminal["status"] == PushStatus.FAILED.value
    assert terminal["error"]["kind"] == ErrorKind.NOT_PAIRED.value

    connection = [
        request.params["data"][PanelDataKey.CONNECTION.value]
        for request in requests
        if PanelDataKey.CONNECTION.value in request.params["data"]
    ][-1]
    # The panel must drop to Connect rather than show a dead upload form.
    assert connection["status"] == ConnectionStatus.DISCONNECTED.value
    assert connection["api_url"] == API_URL


@pytest.mark.parametrize(
    "params",
    [
        {"mode": "obliterate"},
        {"target": "everything"},
        {"mode": None, "target": None},
    ],
)
def test_an_unrecognized_param_previews_rather_than_raising(media, params):
    """This operator is the sole producer of every push status, so a decode
    that threw would leave the panel stuck on whatever card it was on."""
    ctx = ctx_for(media, **params)

    result = statuses(list(PushToCloud().execute(ctx)))

    assert result == [PushStatus.PLANNING.value, PushStatus.PREVIEW.value]


def test_target_view_pushes_the_view_and_target_dataset_the_dataset(media):
    ctx = ctx_for(media, mode="preview", target="view")
    ctx.view = [FakeSample(filepath=media[0])]

    snapshots = pushes(list(PushToCloud().execute(ctx)))
    assert snapshots[-1]["preview"]["samples"] == 1

    ctx = ctx_for(media, mode="preview", target="dataset")
    ctx.view = [FakeSample(filepath=media[0])]

    snapshots = pushes(list(PushToCloud().execute(ctx)))
    assert snapshots[-1]["preview"]["samples"] == 2


def test_every_snapshot_reaches_the_callers_panel(media, monkeypatch):
    monkeypatch.setattr(operators_module, "run_push", fake_run_push())
    ctx = ctx_for(media, mode="push", panel_id="panel-7")

    requests = list(PushToCloud().execute(ctx))

    assert {request.params["panel_id"] for request in requests} == {"panel-7"}


# --- the other two operators ---------------------------------------------


def test_subscription_operator_binds_the_cloud_push_store():
    config = CloudPushSubscription().subscription_config

    assert config.store_name == STORE_NAME
    assert config.unlisted is True


def test_open_cloud_panel_opens_the_panel():
    operator = OpenCloudPanel()
    ctx = FakeCtx()

    operator.execute(ctx)

    assert ctx.ops.calls[0].params["name"] == PANEL_NAME

    placement = operator.resolve_placement(ctx)
    assert placement.view.prompt is False

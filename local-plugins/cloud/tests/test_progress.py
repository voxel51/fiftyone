"""
The two progress channels. The invariants here are the ones that broke the
first design: a terminal snapshot must never be throttled away, and the
durable channel must not depend on the request thread being alive.
"""

import threading

from conftest import FakeCtx, FakeStore
from cloud.constants import PUSH_KEY, TERMINAL_TTL_S, PushStatus
from cloud.engine import PushEvent, PushStage
from cloud.models import (
    ErrorInfo,
    ErrorKind,
    done_push,
    failed_push,
    idle_push,
    running_push,
)
from cloud.progress import (
    CompositeSink,
    PanelDataSink,
    PushWorker,
    StoreSink,
    Throttle,
)


class Clock:
    def __init__(self):
        self.now = 0.0

    def __call__(self):
        return self.now


class FakeOutcome:
    dataset = "cloud-ds"
    samples = 3
    uploaded = 3
    skipped_uploads = 0
    missing_files = 0
    accepted = 3
    rejected = []
    shortfall = 0


def tick(stage=PushStage.UPLOADING, done=1, total=10):
    return running_push("local", "cloud-ds", stage, done, total)


# --- Throttle -------------------------------------------------------------


def test_throttle_suppresses_within_the_interval():
    clock = Clock()
    throttle = Throttle(
        1.0, key=lambda snapshot: (snapshot.status,), clock=clock
    )

    assert throttle.allow(tick()) is True
    clock.now = 0.5
    assert throttle.allow(tick(done=2)) is False


def test_throttle_always_passes_a_key_change():
    clock = Clock()
    throttle = Throttle(
        1.0,
        key=lambda snapshot: (snapshot.status, snapshot.stage),
        clock=clock,
    )
    throttle.allow(tick())

    clock.now = 0.1

    assert throttle.allow(tick(stage=PushStage.INGESTING)) is True


def test_throttle_always_passes_a_terminal_snapshot():
    clock = Clock()
    throttle = Throttle(
        1000.0, key=lambda snapshot: (snapshot.status,), clock=clock
    )
    throttle.allow(tick())

    clock.now = 0.01
    terminal = done_push("local", "cloud-ds", FakeOutcome())

    assert throttle.allow(terminal) is True


# --- PanelDataSink --------------------------------------------------------


def test_panel_sink_yields_a_complete_push_object():
    ctx = FakeCtx()
    sink = PanelDataSink(ctx, "panel-9")

    requests = list(sink.emit(tick()))

    assert len(requests) == 1
    data = requests[0].params["data"]
    assert list(data) == ["push"]
    assert data["push"]["status"] == PushStatus.RUNNING.value
    assert data["push"]["done"] == 1
    assert data["push"]["total"] == 10


def test_panel_sink_addresses_the_callers_panel_id():
    ctx = FakeCtx(panel_id="not-this-one")
    sink = PanelDataSink(ctx, "panel-9")

    requests = list(sink.emit(tick()))

    assert requests[0].params["panel_id"] == "panel-9"


def test_panel_sink_drops_a_throttled_snapshot():
    ctx = FakeCtx()
    sink = PanelDataSink(ctx, "panel-9")

    list(sink.emit(tick(done=1)))
    dropped = list(sink.emit(tick(done=2)))

    assert dropped == []


# --- StoreSink ------------------------------------------------------------


def test_store_sink_writes_under_the_push_key():
    store = FakeStore()

    StoreSink(store).emit(tick())

    assert store.values[PUSH_KEY]["status"] == PushStatus.RUNNING.value


def test_store_sink_sets_the_ttl_only_on_terminal_snapshots():
    store = FakeStore()
    sink = StoreSink(store)

    sink.emit(tick())
    assert store.ttls[PUSH_KEY] is None

    sink.emit(done_push("local", "cloud-ds", FakeOutcome()))
    assert store.ttls[PUSH_KEY] == TERMINAL_TTL_S


def test_store_sink_yields_nothing():
    store = FakeStore()

    assert list(StoreSink(store).emit(tick())) == []


def test_store_sink_writes_without_being_drained():
    """The worker calls ``emit`` bare from ``on_progress``; a generator-based
    sink would silently never run."""
    store = FakeStore()

    StoreSink(store).emit(tick())

    assert PUSH_KEY in store.values


def test_store_sink_swallows_store_faults():
    store = FakeStore(fault=RuntimeError("mongo is having a day"))

    assert list(StoreSink(store).emit(tick())) == []


def test_store_sink_is_safe_under_concurrent_emit():
    store = FakeStore()
    sink = StoreSink(store)
    barrier = threading.Barrier(8)

    def emit(index):
        barrier.wait()
        sink.emit(tick(done=index))

    threads = [threading.Thread(target=emit, args=(i,)) for i in range(8)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert store.values[PUSH_KEY]["status"] == PushStatus.RUNNING.value
    # The status throttle admits one of the eight; the point is that no
    # write interleaved into a half-formed value.
    assert all(
        set(write) >= {"status", "updated_at"} for write in store.writes
    )


# --- CompositeSink --------------------------------------------------------


def test_composite_sink_reaches_every_sink_and_concatenates():
    ctx = FakeCtx()
    store = FakeStore()
    composite = CompositeSink([PanelDataSink(ctx, "p"), StoreSink(store)])

    requests = list(composite.emit(idle_push("local")))

    assert len(requests) == 1
    assert PUSH_KEY in store.values


# --- PushWorker -----------------------------------------------------------


def worker_for(run, store=None):
    store = store or FakeStore()
    return (
        PushWorker(
            run=run,
            store_sink=StoreSink(store),
            local_dataset="local",
            dataset_name="cloud-ds",
        ),
        store,
    )


def test_worker_writes_the_terminal_snapshot_before_publishing_its_result():
    seen = {}

    def run(on_progress):
        return FakeOutcome()

    worker, store = worker_for(run)
    worker.start()
    list(worker.drain(PanelDataSink(FakeCtx(), "p")))

    seen["store"] = store.values[PUSH_KEY]
    outcome, error = worker.result()

    assert error is None
    assert outcome is not None
    assert seen["store"]["status"] == PushStatus.DONE.value
    assert store.ttls[PUSH_KEY] == TERMINAL_TTL_S
    # Panel data gets this very object, so the two channels cannot disagree
    # about the final frame.
    assert worker.snapshot().status is PushStatus.DONE


def test_drain_yields_a_patch_per_event_and_stops_when_the_worker_ends():
    def run(on_progress):
        on_progress(PushEvent(PushStage.UPLOADING, 1, 2, "a"))
        on_progress(PushEvent(PushStage.INGESTING, 1, 1, "b"))
        return FakeOutcome()

    worker, _ = worker_for(run)
    worker.start()

    requests = list(worker.drain(PanelDataSink(FakeCtx(), "p")))

    stages = [
        request.params["data"]["push"].get("stage") for request in requests
    ]
    assert stages == [PushStage.UPLOADING.value, PushStage.INGESTING.value]


def test_drain_survives_a_worker_that_raises():
    def run(on_progress):
        raise RuntimeError("boom")

    worker, store = worker_for(run)
    worker.start()

    assert list(worker.drain(PanelDataSink(FakeCtx(), "p"))) == []

    outcome, error = worker.result()
    assert outcome is None
    assert isinstance(error, RuntimeError)
    assert store.values[PUSH_KEY]["status"] == PushStatus.FAILED.value


def test_worker_maps_an_engine_error_onto_its_kind():
    from cloud.engine import CloudUnavailableError

    def run(on_progress):
        raise CloudUnavailableError("the edge is down")

    worker, store = worker_for(run)
    worker.start()
    list(worker.drain(PanelDataSink(FakeCtx(), "p")))

    assert (
        store.values[PUSH_KEY]["error"]["kind"] == ErrorKind.UNAVAILABLE.value
    )


def test_failed_push_carries_its_error():
    snapshot = failed_push(
        "local", "cloud-ds", ErrorInfo(ErrorKind.REFUSED, "nope")
    )

    assert snapshot.status.is_terminal
    assert snapshot.error.message == "nope"

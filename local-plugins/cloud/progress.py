"""
Two progress channels over one event stream, each owned by the thread that
can actually guarantee it.

``PanelDataSink`` is the live channel and belongs to the generator's drain
loop on the request thread: it yields ``patch_panel_data`` invocation
requests, so it can only be driven from inside the generator, and it dies
with the request stream. ``StoreSink`` is the durable channel and belongs to
the upload worker: it is called from ``on_progress`` on worker threads,
takes its own lock, and writes the terminal snapshot itself before the
worker sets its result slot. Nothing durable depends on ``GeneratorExit``,
whose timing under Starlette's threadpool iteration is GC-dependent.

Every ``emit`` does its work eagerly and returns an iterator over whatever
the caller still has to yield. A generator-function ``emit`` would defer a
store write until somebody drained it, and the worker never drains.
"""

import abc
import logging
import queue
import threading
import time
from typing import Any, Callable, Iterator, List, Optional, Tuple

from .constants import (
    PANEL_THROTTLE_S,
    PUSH_KEY,
    QUEUE_POLL_S,
    STORE_THROTTLE_S,
    TERMINAL_TTL_S,
    PanelDataKey,
)
from .models import (
    PushData,
    done_push,
    error_from,
    failed_push,
    push_from_event,
    to_payload,
)

logger = logging.getLogger(__name__)


class Throttle:
    """Rate-limits a stream of snapshots, with mandatory escapes.

    A snapshot passes when the interval has elapsed, when its key (the
    fields the caller says are structural) differs from the last one that
    passed, or when it is terminal. Not thread-safe on its own — callers
    that share one across threads hold their own lock.
    """

    def __init__(
        self,
        interval: float,
        key: Callable[[PushData], Tuple[Any, ...]],
        clock: Callable[[], float] = time.monotonic,
    ):
        self._interval = interval
        self._key = key
        self._clock = clock
        self._last_at: Optional[float] = None
        self._last_key: Optional[Tuple[Any, ...]] = None

    def allow(self, snapshot: PushData) -> bool:
        """True when this snapshot should be emitted; records it as emitted
        when so."""
        key = self._key(snapshot)
        now = self._clock()

        elapsed = (
            self._last_at is None or now - self._last_at >= self._interval
        )
        if elapsed or key != self._last_key or snapshot.status.is_terminal:
            self._last_at = now
            self._last_key = key
            return True

        return False


class ProgressSink(abc.ABC):
    """Somewhere a push snapshot goes.

    ``emit`` returns an iterator of invocation requests so a sink that has
    to reach the App can hand work back to the generator; sinks that write
    server-side yield nothing. Callers always drain the iterator — a bare
    call does nothing for a generator-backed sink.
    """

    @abc.abstractmethod
    def emit(self, snapshot: PushData) -> Iterator[Any]:
        """Consumes one complete snapshot."""


class PanelDataSink(ProgressSink):
    """Request-thread only. Yields one ``ctx.ops.patch_panel_data`` request
    per admitted snapshot, addressed to the caller's ``panel_id``.

    Throttled at ``PANEL_THROTTLE_S`` keyed on ``(status, stage)``, so a
    stage change or a terminal snapshot always gets through.
    """

    def __init__(self, ctx: Any, panel_id: str):
        self._ctx = ctx
        self._panel_id = panel_id
        self._throttle = Throttle(
            PANEL_THROTTLE_S,
            key=lambda snapshot: (snapshot.status, snapshot.stage),
        )

    def emit(self, snapshot: PushData) -> Iterator[Any]:
        """Yields ``ctx.ops.patch_panel_data({PanelDataKey.PUSH: payload},
        panel_id=...)`` when the throttle admits the snapshot."""
        if not self._throttle.allow(snapshot):
            return iter(())

        request = self._ctx.ops.patch_panel_data(
            {PanelDataKey.PUSH.value: to_payload(snapshot)},
            panel_id=self._panel_id,
        )
        return iter((request,))


class StoreSink(ProgressSink):
    """Worker-owned and thread-safe. Writes the snapshot to the
    ``cloud_push`` execution store under ``PUSH_KEY``; yields nothing.

    Throttled at ``STORE_THROTTLE_S`` keyed on ``status`` alone (the store
    is the recovery channel, not the animation), behind its own lock because
    ``on_progress`` fires on several upload threads. Terminal snapshots are
    written with ``ttl=TERMINAL_TTL_S``; everything else without a TTL.

    Store faults are swallowed and logged: losing the durable channel must
    never abort a push that is otherwise fine.
    """

    def __init__(self, store: Any):
        self._store = store
        self._lock = threading.Lock()
        self._throttle = Throttle(
            STORE_THROTTLE_S, key=lambda snapshot: (snapshot.status,)
        )

    def emit(self, snapshot: PushData) -> Iterator[Any]:
        """Writes through the lock when the throttle admits; yields nothing."""
        with self._lock:
            if not self._throttle.allow(snapshot):
                return iter(())

            ttl = TERMINAL_TTL_S if snapshot.status.is_terminal else None
            try:
                self._store.set(PUSH_KEY, to_payload(snapshot), ttl=ttl)
            except Exception:  # noqa: BLE001 - recovery is best-effort
                logger.warning(
                    "cloud push: could not record progress in the execution "
                    "store; the upload continues",
                    exc_info=True,
                )

        return iter(())


class CompositeSink(ProgressSink):
    """Fans one snapshot out to several sinks in order, concatenating
    whatever they yield. Used for the snapshots the request thread owns
    (planning, preview, the initial running tick, the terminal one)."""

    def __init__(self, sinks: List[ProgressSink]):
        self._sinks = list(sinks)

    def emit(self, snapshot: PushData) -> Iterator[Any]:
        requests: List[Any] = []
        for sink in self._sinks:
            requests.extend(sink.emit(snapshot))
        return iter(requests)


class PushWorker:
    """Runs ``run_push`` off the request thread and bridges its progress.

    ``on_progress`` — already invoked on the upload workers — writes to the
    ``StoreSink`` directly and then puts the raw ``PushEvent`` on a queue
    the generator drains at ``QUEUE_POLL_S``. The worker writes its own
    terminal snapshot to the store before publishing its result, so a
    request stream that vanished still leaves a correct final state.

    The thread is a daemon and is never cancelled: the state file flushes
    every 20 uploads, so a re-run resumes whether it finished or died with
    the server.
    """

    def __init__(
        self,
        run: Callable[[Callable[[Any], None]], Any],
        store_sink: StoreSink,
        local_dataset: str,
        dataset_name: str,
    ):
        self._run = run
        self._store_sink = store_sink
        self._local_dataset = local_dataset
        self._dataset_name = dataset_name
        self._events: "queue.Queue[Any]" = queue.Queue()
        self._thread: Optional[threading.Thread] = None
        self._outcome: Optional[Any] = None
        self._error: Optional[BaseException] = None
        self._snapshot: Optional[PushData] = None

    def start(self) -> None:
        """Spawns the daemon thread."""
        self._thread = threading.Thread(
            target=self.__work, name="cloud-push", daemon=True
        )
        self._thread.start()

    def __work(self) -> None:
        try:
            outcome = self._run(self.__on_progress)
        except BaseException as error:  # noqa: BLE001 - reported, not raised
            snapshot = failed_push(
                self._local_dataset, self._dataset_name, error_from(error)
            )
            self.__publish(snapshot, outcome=None, error=error)
            return

        snapshot = done_push(self._local_dataset, self._dataset_name, outcome)
        self.__publish(snapshot, outcome=outcome, error=None)

    def __publish(
        self,
        snapshot: PushData,
        outcome: Optional[Any],
        error: Optional[BaseException],
    ) -> None:
        """Durable state first, then the result slot.

        The order is the contract: whoever observes a finished worker must
        be looking at a store that already agrees with it.
        """
        list(self._store_sink.emit(snapshot))
        self._snapshot = snapshot
        self._outcome = outcome
        self._error = error

    def __on_progress(self, event: Any) -> None:
        """Runs on the pusher's upload threads."""
        list(
            self._store_sink.emit(
                push_from_event(event, self._local_dataset, self._dataset_name)
            )
        )
        self._events.put(event)

    def drain(self, panel_sink: ProgressSink) -> Iterator[Any]:
        """Generator-side loop, on the request thread.

        Polls the queue at ``QUEUE_POLL_S``; for each event, builds the
        running snapshot and yields whatever ``panel_sink`` yields. The sink
        is passed in rather than held, because it is request-scoped and the
        worker is not.
        Exits when the worker thread is finished and the queue is drained.
        Does not itself write the terminal snapshot — the caller reads
        :meth:`result` and emits it.
        """
        while True:
            try:
                event = self._events.get(timeout=QUEUE_POLL_S)
            except queue.Empty:
                if self._thread is None or not self._thread.is_alive():
                    break
                continue
            yield from panel_sink.emit(
                push_from_event(event, self._local_dataset, self._dataset_name)
            )

        while True:
            try:
                event = self._events.get_nowait()
            except queue.Empty:
                return
            yield from panel_sink.emit(
                push_from_event(event, self._local_dataset, self._dataset_name)
            )

    def result(self) -> Tuple[Optional[Any], Optional[BaseException]]:
        """The worker's ``(PushOutcome, exception)`` slot, exactly one of
        which is set once the thread has finished."""
        return self._outcome, self._error

    def snapshot(self) -> Optional[PushData]:
        """The terminal snapshot the worker wrote to the store.

        The operator emits this exact object to panel data, so the live and
        durable channels cannot disagree about the final frame — rebuilding
        it on the request thread would re-stamp ``updated_at``.
        """
        return self._snapshot

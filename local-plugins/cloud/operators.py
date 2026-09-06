"""
The operators behind the panel.

``PushToCloud`` owns everything slow: it plans, it previews, and it pushes.
It is a generator so its first snapshot streams to the browser before the
dataset scan begins, and it is unlisted because the panel is the only
caller. ``CloudPushSubscription`` re-exposes the ``cloud_push`` store over
SSE so a reopened panel picks up an upload the request stream no longer
covers. ``OpenCloudPanel`` is the one listed operator: the grid button.

There is no ``cloud_login`` operator any more — the CLI's ``login`` covers
the headless case and never went through it.
"""

from dataclasses import dataclass
from typing import Any, Iterator, Optional

import fiftyone.operators as foo
import fiftyone.operators.types as types

from .constants import (
    ALREADY_RUNNING_MESSAGE,
    NOT_PAIRED_MESSAGE,
    OPEN_PANEL_OPERATOR_NAME,
    PANEL_NAME,
    PUSH_KEY,
    PUSH_OPERATOR_NAME,
    STORE_NAME,
    SUBSCRIPTION_OPERATOR_NAME,
    ErrorKind,
    PanelDataKey,
    ParamKey,
    PushMode,
    PushTarget,
)
from .engine import (
    CloudError,
    Http,
    ProfileStore,
    PushStage,
    PushStateStore,
    build_push_plan,
    run_push,
)
from .models import (
    ErrorInfo,
    PreviewInfo,
    ResumableInfo,
    connection_from_profile,
    error_from,
    failed_push,
    is_running_guarded,
    planning_push,
    preview_push,
    resolve_urls,
    running_push,
    to_payload,
)
from .plan_cache import PLAN_CACHE
from .progress import CompositeSink, PanelDataSink, PushWorker, StoreSink


@dataclass(frozen=True)
class _Sinks:
    """The two progress channels plus their fan-out.

    Held together rather than rebuilt per call so the worker and the request
    thread share one ``StoreSink`` — and therefore one throttle, so a
    request-thread snapshot and a worker snapshot cannot both write the
    store in the same tick.
    """

    panel: PanelDataSink
    store: StoreSink
    both: CompositeSink


@dataclass(frozen=True)
class _Request:
    """One decoded invocation. Everything both modes need to know."""

    mode: PushMode
    target: PushTarget
    local_dataset: str
    dataset_name: str
    fresh: bool
    plan_token: Optional[str]
    panel_id: Optional[str]


class PushToCloud(foo.Operator):
    """``@voxel51/cloud/push_to_cloud`` — unlisted, generator.

    Every ``push`` status has exactly one producer: this operator, on its
    request thread or on its worker thread. Nothing else writes
    ``data.push`` or the store key except ``CloudPanel.on_load`` and
    ``reset_push``.
    """

    @property
    def config(self) -> foo.OperatorConfig:
        return foo.OperatorConfig(
            name=PUSH_OPERATOR_NAME,
            label="Upload to FiftyOne Cloud",
            unlisted=True,
            execute_as_generator=True,
        )

    def execute(self, ctx) -> Iterator[Any]:
        """Resolves the shared preconditions, then dispatches on ``mode``.

        Both modes first require a paired profile; without one they emit a
        FAILED push *and* a DISCONNECTED connection, so the panel drops
        straight to the Connect screen instead of showing a dead upload
        form.
        """
        request = _decode(ctx)
        sinks = _build_sinks(ctx, request.panel_id)

        profile = ProfileStore().load()
        if profile is None or not profile.api_key:
            yield from sinks.both.emit(
                failed_push(
                    request.local_dataset,
                    request.dataset_name,
                    ErrorInfo(
                        kind=ErrorKind.NOT_PAIRED, message=NOT_PAIRED_MESSAGE
                    ),
                )
            )
            api_url, auth_url = resolve_urls(profile)
            yield ctx.ops.patch_panel_data(
                {
                    PanelDataKey.CONNECTION.value: to_payload(
                        connection_from_profile(profile, api_url, auth_url)
                    )
                },
                panel_id=request.panel_id,
            )
            return

        if request.mode is PushMode.PREVIEW:
            yield from self._preview(ctx, request, sinks, profile)
        else:
            yield from self._push(ctx, request, sinks, profile)

    def _preview(self, ctx, request, sinks, profile) -> Iterator[Any]:
        """``mode="preview"`` — plan, price it, park the plan."""
        samples = self._samples(ctx, request.target)

        # Yielded before the scan starts: the scan is seconds to minutes and
        # this is the only thing that puts a spinner on screen first.
        yield from sinks.both.emit(
            planning_push(request.local_dataset, _count(samples))
        )

        try:
            plan = build_push_plan(samples)
            state = PushStateStore(
                profile.api_url, request.dataset_name
            ).load()
        except (CloudError, OSError) as error:
            yield from sinks.both.emit(
                failed_push(
                    request.local_dataset,
                    request.dataset_name,
                    error_from(error),
                )
            )
            return

        resumable = None
        if state is not None:
            resumable = ResumableInfo(
                uploaded=len(state.uploaded_keys), total=len(plan.media)
            )

        token = PLAN_CACHE.put(
            plan, request.local_dataset, request.target.value
        )
        yield from sinks.both.emit(
            preview_push(
                local_dataset=request.local_dataset,
                dataset_name=request.dataset_name,
                plan_token=token,
                preview=PreviewInfo(
                    samples=len(plan.sample_docs),
                    files=len(plan.media),
                    total_bytes=plan.summary.total_bytes,
                    missing=len(plan.missing),
                ),
                resumable=resumable,
            )
        )

    def _push(self, ctx, request, sinks, profile) -> Iterator[Any]:
        """``mode="push"`` — run the upload on a worker and bridge it."""
        store = ctx.store(STORE_NAME)
        if is_running_guarded(store.get(PUSH_KEY)):
            yield from sinks.both.emit(
                failed_push(
                    request.local_dataset,
                    request.dataset_name,
                    ErrorInfo(
                        kind=ErrorKind.REFUSED,
                        message=ALREADY_RUNNING_MESSAGE,
                    ),
                )
            )
            return

        plan = PLAN_CACHE.take(
            request.plan_token, request.local_dataset, request.target.value
        )
        if plan is None:
            # An expired or restarted-server token costs a rebuild, not an
            # error; the preview the user approved is still what happens.
            samples = self._samples(ctx, request.target)
            yield from sinks.both.emit(
                planning_push(request.local_dataset, _count(samples))
            )
            try:
                plan = build_push_plan(samples)
            except (CloudError, OSError) as error:
                yield from sinks.both.emit(
                    failed_push(
                        request.local_dataset,
                        request.dataset_name,
                        error_from(error),
                    )
                )
                return

        # ``Pusher`` says nothing until the first file completes, so without
        # this the bar has no zero and the panel looks hung.
        #
        # Emitted *before* the worker starts, which is what makes the shared
        # StoreSink safe: this is the request thread's last store write, so
        # it can never land on top of the worker's terminal one. A trivially
        # short push — an empty plan, or a failure at session open — would
        # otherwise leave the store stuck on ``running`` forever, and the
        # next ``on_load`` would report a finished upload as stalled.
        yield from sinks.both.emit(
            running_push(
                local_dataset=request.local_dataset,
                dataset_name=request.dataset_name,
                stage=PushStage.UPLOADING,
                done=0,
                total=len(plan.media),
            )
        )

        worker = PushWorker(
            run=lambda on_progress: run_push(
                profile,
                request.dataset_name,
                (),
                Http(),
                on_progress=on_progress,
                fresh=request.fresh,
                plan=plan,
            ),
            store_sink=sinks.store,
            local_dataset=request.local_dataset,
            dataset_name=request.dataset_name,
        )
        worker.start()

        # Panel data only from here: the worker owns the store.
        yield from worker.drain(sinks.panel)

        terminal = worker.snapshot()
        if terminal is not None:
            yield from sinks.panel.emit(terminal)

    def _samples(self, ctx, target: PushTarget) -> Any:
        """``ctx.view`` for ``target="view"``, else ``ctx.dataset``."""
        if target is PushTarget.VIEW:
            return ctx.view
        return ctx.dataset


class CloudPushSubscription(foo.SseOperator):
    """``@voxel51/cloud/cloud_push_subscription``.

    The recovery channel. The App's ``/operators/subscribe-execution-store``
    endpoint drives this; its initial sync replays the current key, so a
    panel opened mid-upload sees the latest snapshot without polling.
    """

    @property
    def subscription_config(self) -> foo.SseOperatorConfig:
        return foo.SseOperatorConfig(
            name=SUBSCRIPTION_OPERATOR_NAME,
            label="Cloud push subscription",
            store_name=STORE_NAME,
        )


class OpenCloudPanel(foo.Operator):
    """``@voxel51/cloud/open_cloud_panel`` — the only listed operator."""

    @property
    def config(self) -> foo.OperatorConfig:
        return foo.OperatorConfig(
            name=OPEN_PANEL_OPERATOR_NAME, label="FiftyOne Cloud"
        )

    def resolve_placement(self, ctx) -> types.Placement:
        return types.Placement(
            types.Places.SAMPLES_GRID_SECONDARY_ACTIONS,
            types.Button(
                label="FiftyOne Cloud",
                icon="cloud_upload",
                prompt=False,
            ),
        )

    def execute(self, ctx) -> None:
        ctx.ops.open_panel(PANEL_NAME)


def _decode(ctx) -> _Request:
    """Panel-method and operator params both arrive at the top level of
    ``ctx.params``.

    Never raises. This operator is the sole producer of every ``push``
    status, so a decode that threw would leave the panel showing whatever
    card it was on with nothing to move it off; the safe reading of an
    unrecognized value is the one that only ever previews.
    """
    local_dataset = getattr(ctx.dataset, "name", "") or ""
    return _Request(
        mode=_enum(
            PushMode, ctx.params.get(ParamKey.MODE.value), PushMode.PREVIEW
        ),
        target=_enum(
            PushTarget,
            ctx.params.get(ParamKey.TARGET.value),
            PushTarget.DATASET,
        ),
        local_dataset=local_dataset,
        dataset_name=(
            ctx.params.get(ParamKey.DATASET_NAME.value) or local_dataset
        ),
        fresh=bool(ctx.params.get(ParamKey.FRESH.value, False)),
        plan_token=ctx.params.get(ParamKey.PLAN_TOKEN.value),
        panel_id=ctx.params.get(ParamKey.PANEL_ID.value),
    )


def _enum(enum_class, value, fallback):
    """The enum member for ``value``, or ``fallback`` when it is absent or
    not one the plugin knows."""
    if value is None:
        return fallback
    try:
        return enum_class(value)
    except ValueError:
        return fallback


def _build_sinks(ctx, panel_id: Optional[str]) -> _Sinks:
    panel = PanelDataSink(ctx, panel_id)
    store = StoreSink(ctx.store(STORE_NAME))
    return _Sinks(panel=panel, store=store, both=CompositeSink([panel, store]))


def _count(samples) -> int:
    if samples is None:
        return 0
    return len(samples)

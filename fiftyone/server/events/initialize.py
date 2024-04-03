"""
FiftyOne Server events initialization.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import asyncio
from dataclasses import dataclass
import typing as t

import fiftyone.core.dataset as fod
import fiftyone.core.state as fos
from fiftyone.core.session.events import (
    AppInitializer,
    ListenPayload,
    StateUpdate,
)
import fiftyone.core.utils as fou

from fiftyone.server.events import dispatch_event
from fiftyone.server.events.state import (
    Listener,
    get_listeners,
    get_requests,
    get_state,
    increment_app_count,
)


@dataclass
class InitializedListener:
    is_app: bool
    request_listeners: t.Set[t.Tuple[str, Listener]]
    state: fos.StateDescription


async def initialize_listener(payload: ListenPayload):
    coroutine, is_app, state = await fou.run_sync_task(
        _initialize_listener_sync, payload
    )
    if coroutine:
        await coroutine

    request_listeners: t.Set[t.Tuple[str, Listener]] = set()
    for event_name in payload.events:
        listener = Listener(
            queue=asyncio.LifoQueue(maxsize=1000),
            subscription=payload.subscription,
        )
        get_listeners()[event_name].add(listener)
        request_listeners.add((event_name, listener))

    get_requests()[payload.subscription] = request_listeners

    return InitializedListener(is_app, request_listeners, state)


def _initialize_listener_sync(payload: ListenPayload) -> InitializedListener:
    if isinstance(payload.initializer, AppInitializer):
        return (
            _handle_app_initializer(payload.subscription, payload.initializer),
            True,
            get_state(),
        )

    return (
        dispatch_event(payload.subscription, StateUpdate(payload.initializer)),
        False,
        payload.initializer,
    )


def _handle_app_initializer(subscription: str, initializer: AppInitializer):
    increment_app_count()
    state = get_state()
    current = state.dataset.name if state.dataset is not None else None

    update = False
    dataset_change = False
    if initializer.dataset and initializer.dataset != current:
        update = True
        dataset_change = True
        _handle_dataset(state, initializer)
    else:
        update = _handle_saved_view(state, initializer.view)
        update = _handle_workspace(state, initializer.workspace) or update

    if not update:
        return None

    if dataset_change:
        state.color_scheme = fos.build_color_scheme(
            None, state.dataset, state.config
        )

    return dispatch_event(subscription, StateUpdate(state))


def _handle_dataset(state: fos.StateDescription, initializer: AppInitializer):
    try:
        state.dataset = fod.load_dataset(initializer.dataset)
        state.selected = []
        state.selected_labels = []
        state.view = None
        state.spaces = None

    except:
        state.dataset = None
        state.selected = []
        state.selected_labels = []
        state.view = None
        state.spaces = None
        return

    if initializer.view:
        try:
            doc = state.dataset._get_saved_view_doc(
                initializer.view, slug=True
            )
            state.view = state.dataset.load_saved_view(doc.name)
            state.view_name = doc.name
        except:
            pass

    if initializer.workspace:
        try:
            doc = state.dataset._get_workspace_doc(
                initializer.workspace, slug=True
            )
            state.spaces = state.dataset.load_workspace(doc.name)
        except Exception:

            pass


def _handle_saved_view(
    state: fos.StateDescription, slug: t.Optional[str] = None
):
    current_saved_view_slug = (
        fou.to_slug(state.view.name)
        if state.view is not None and state.view.name
        else None
    )

    if current_saved_view_slug == slug:
        return False

    try:
        if slug:
            doc = state.dataset._get_saved_view_doc(slug, slug=True)
            state.view = state.dataset.load_saved_view(doc.name)
            state.view_name = doc.name
        state.selected = []
        state.selected_labels = []
    except:
        pass

    return True


def _handle_workspace(
    state: fos.StateDescription, slug: t.Optional[str] = None
):
    current_workspace_slug = (
        fou.to_slug(state.spaces.name)
        if state.spaces is not None and state.spaces.name
        else None
    )

    print(current_workspace_slug, slug)

    if current_workspace_slug == slug:
        return False

    try:
        if slug:
            doc = state.dataset._get_workspace_doc(slug, slug=True)
            state.spaces = state.dataset.load_workspace(doc.name)
    except:
        pass

    return True

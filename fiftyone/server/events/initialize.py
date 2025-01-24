"""
FiftyOne Server events initialization.

| Copyright 2017-2025, Voxel51, Inc.
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
    """Initialize a state listener.

    Args:
        payload: a :class:`fiftyone.core.session.events.ListenPayload`

    Returns:
        an :class:`InitializedListener`
    """
    coroutine, is_app, state = await fou.run_sync_task(
        initialize_listener_sync, payload
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


def initialize_listener_sync(payload: ListenPayload):
    """Synchronously initializer a listener

    Args:
        payload: a :class:`fiftyone.core.session.events.ListenPayload`
    """
    if isinstance(payload.initializer, AppInitializer):
        return (
            handle_app_initializer(payload.subscription, payload.initializer),
            True,
            get_state(),
        )

    state = payload.initializer
    return (
        dispatch_event(payload.subscription, StateUpdate(payload.initializer)),
        False,
        state,
    )


def handle_app_initializer(subscription: str, initializer: AppInitializer):
    """Handle an App initialization request

    Args:
        subscription: a subscription id
        initializer: an app initializer

    Returns:
        ``None`` or a coroutine
    """
    increment_app_count()
    state = get_state()
    current = state.dataset.name if state.dataset is not None else None

    update = False
    dataset_change = False
    if initializer.dataset and initializer.dataset != current:
        update = True
        dataset_change = True
        handle_dataset_change(state, initializer)
    elif state.dataset is not None:
        update = handle_group_id(state, initializer.group_id)
        update = handle_group_slice(state, initializer.group_slice)
        update = handle_sample_id(state, initializer.sample_id)
        update = handle_saved_view(state, initializer.view) or update
        update = handle_workspace(state, initializer.workspace) or update

    if not update:
        return None

    if dataset_change:
        state.color_scheme = fos.build_color_scheme(
            None, state.dataset, state.config
        )

    return dispatch_event(subscription, StateUpdate(state))


def handle_dataset_change(
    state: fos.StateDescription, initializer: AppInitializer
):
    """Handle a dataset change request.

    Args:
        state: the state description
        initializer: an app initializer
    """
    try:
        state.dataset = fod.load_dataset(initializer.dataset)
        state.group_id = None
        state.group_slice = state.dataset.group_slice
        state.sample_id = None
        state.selected = []
        state.selected_labels = []
        state.spaces = None
        state.view = None
    except:
        state.dataset = None
        state.group_id = None
        state.group_slice = None
        state.sample_id = None
        state.selected = []
        state.selected_labels = []
        state.spaces = None
        state.view = None
        return

    if initializer.group_id:
        state.group_id = initializer.group_id

    if initializer.sample_id:
        state.sample_id = initializer.sample_id

    if initializer.view:
        try:
            doc = state.dataset._get_saved_view_doc(
                initializer.view, slug=True
            )
            state.view = state.dataset.load_saved_view(doc.name)
        except:
            pass

    if initializer.workspace:
        try:
            doc = state.dataset._get_workspace_doc(
                initializer.workspace, slug=True
            )
            state.spaces = state.dataset.load_workspace(doc.name)
        except:
            pass


def handle_group_slice(
    state: fos.StateDescription, group_slice: t.Optional[str] = None
):
    """Handle a group slice.

    Args:
        state: the state description
        group_slice (None): an optional group slice

    Returns:
        True/False indicating if a state update event should be dispatched
    """
    collection = state.view if state.view is not None else state.dataset
    if state.group_slice != group_slice:
        if group_slice is not None and collection.group_slices:
            state.group_slice = group_slice
            return True

    return False


def handle_group_id(
    state: fos.StateDescription, group_id: t.Optional[str] = None
):
    """Handle a group id.

    Args:
        state: the state description
        group_id (None): an optional group ID

    Returns:
        True/False indicating if a state update event should be dispatched
    """
    if state.group_id != group_id:
        if group_id is not None:
            state.group_id = group_id
            return True

    return False


def handle_sample_id(
    state: fos.StateDescription, sample_id: t.Optional[str] = None
):
    """Handle a sample id.

    Args:
        state: the state description
        sample_id (None): an optional sample ID


    Returns:
        True/False indicating if a state update event should be dispatched
    """
    if state.sample_id != sample_id:
        if sample_id is not None:
            state.sample_id = sample_id
            return True

    return False


def handle_saved_view(
    state: fos.StateDescription, slug: t.Optional[str] = None
):
    """Handle a saved view slug.

    Args:
        state: the state description
        slug (None): an optional slug


    Returns:
        True/False indicating if a state update event should be dispatched
    """
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
        state.selected = []
        state.selected_labels = []
    except:
        pass

    return True


def handle_workspace(
    state: fos.StateDescription, slug: t.Optional[str] = None
):
    """Handle a workspace slug request.

    Args:
        state: the state description
        slug (None): an optional slug


    Returns:
        True/False indicating if a state update event should be dispatched
    """
    current_workspace_slug = (
        fou.to_slug(state.spaces.name)
        if state.spaces is not None and state.spaces.name
        else None
    )

    if current_workspace_slug == slug:
        return False

    try:
        if slug:
            doc = state.dataset._get_workspace_doc(slug, slug=True)
            state.spaces = state.dataset.load_workspace(doc.name)
    except:
        pass

    return True

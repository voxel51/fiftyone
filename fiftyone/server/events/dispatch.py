"""
FiftyOne Server events dispatching.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import typing as t
from dataclasses import asdict
from datetime import datetime

import fiftyone.core.context as focx
import fiftyone.core.odm as foo
from fiftyone.core.session.events import (
    CaptureNotebookCell,
    DeactivateNotebookCell,
    EventType,
    ReactivateNotebookCell,
    Refresh,
    SelectLabels,
    SelectSamples,
    SetColorScheme,
    SetFieldVisibilityStage,
    SetGroupSlice,
    SetSpaces,
    StateUpdate,
    add_screenshot,
)
from fiftyone.server.events.state import get_listeners, get_state, set_state


async def dispatch_event(
    subscription: t.Optional[str], event: EventType
) -> None:
    """Dispatch an event to all listeners registered for the server process

    Args:
        subscription: the calling subscription id
        event: the event
    """
    state = get_state()
    if isinstance(event, CaptureNotebookCell) and focx.is_databricks_context():
        add_screenshot(event)
        return

    if isinstance(event, SelectLabels):
        state.selected_labels = event.labels

    if isinstance(event, SelectSamples):
        state.selected = event.sample_ids

    if isinstance(event, SetColorScheme):
        state.color_scheme = foo.ColorScheme.from_dict(
            asdict(event.color_scheme)
        )

    if isinstance(event, SetSpaces):
        state.spaces = foo.Space.from_dict(event.spaces)

    if isinstance(event, SetFieldVisibilityStage):
        state.field_visibility_stage = event.stage

    if isinstance(event, SetGroupSlice):
        state.group_slice = event.slice

    if isinstance(event, (StateUpdate, Refresh)):
        set_state(event.state)

    if isinstance(event, ReactivateNotebookCell):
        await dispatch_event(subscription, DeactivateNotebookCell())

    for listener in get_listeners()[event.get_event_name()]:
        if listener.subscription == subscription:
            continue

        listener.queue.put_nowait((datetime.now(), event))

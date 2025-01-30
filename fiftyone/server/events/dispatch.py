"""
FiftyOne Server events dispatching.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from dataclasses import asdict
from datetime import datetime
import typing as t

import fiftyone.core.context as focx
import fiftyone.core.odm as foo
from fiftyone.core.session.events import (
    add_screenshot,
    CaptureNotebookCell,
    DeactivateNotebookCell,
    ReactivateNotebookCell,
    EventType,
    Refresh,
    SelectLabels,
    SelectSamples,
    SetColorScheme,
    SetGroupSlice,
    SetSample,
    SetSpaces,
    StateUpdate,
    SetFieldVisibilityStage,
)

from fiftyone.server.events.state import get_listeners, get_state, set_state


async def dispatch_event(
    subscription: t.Optional[str], event: EventType
) -> None:
    """Dispatch an event to all listeners registered for the server process

    Args:
        subscription: the calling subscription id
        event: the event

    Returns:
        the dispatched event
    """
    state = get_state()
    if isinstance(event, CaptureNotebookCell) and focx.is_databricks_context():
        add_screenshot(event)
        return event

    if isinstance(event, SelectLabels):
        state.selected_labels = event.labels

    if isinstance(event, SelectSamples):
        state.selected = event.sample_ids

    if isinstance(event, SetColorScheme):
        state.color_scheme = foo.ColorScheme.from_dict(
            asdict(event.color_scheme)
        )

    if isinstance(event, SetSample):
        state.group_id = event.group_id
        state.sample_id = event.sample_id

    if isinstance(event, SetSpaces):
        state.spaces = foo.Space.from_dict(event.spaces)

    if isinstance(event, SetFieldVisibilityStage):
        state.field_visibility_stage = event.stage

    if isinstance(event, SetGroupSlice):
        state.group_slice = event.slice or state.dataset.default_group_slice

    if isinstance(event, (StateUpdate, Refresh)):
        set_state(event.state)

    if isinstance(event, ReactivateNotebookCell):
        await dispatch_event(subscription, DeactivateNotebookCell())

    for listener in get_listeners()[event.get_event_name()]:
        if listener.subscription == subscription:
            continue

        listener.queue.put_nowait((datetime.now(), event))

    return event

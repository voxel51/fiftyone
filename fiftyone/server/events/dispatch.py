"""
FiftyOne Server events dispatching.

| Copyright 2017-2026, Voxel51, Inc.
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
    AppCountUpdate,
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
    SetLabelSelectionStyle,
    SetSampleSelectionStyle,
    SetSpaces,
    StateUpdate,
    SetFieldVisibilityStage,
)

from fiftyone.server.events.state import (
    get_app_count,
    get_listeners,
    get_state,
    set_state,
)


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
        state.selected_samples = event.samples

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

    if isinstance(event, SetSampleSelectionStyle):
        state.sample_selection_style = event.style

    if isinstance(event, SetLabelSelectionStyle):
        state.label_selection_style = event.style

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


def dispatch_app_count() -> None:
    """Dispatch the current App count to all listeners registered for the
    server process.

    Listener queues are last-in first-out, so a listener with an unread count
    could otherwise receive the newest count before an older one. Only the
    latest count matters, so any unread count is replaced.
    """
    event = AppCountUpdate(count=get_app_count())
    for listener in get_listeners()[event.get_event_name()]:
        while not listener.queue.empty():
            listener.queue.get_nowait()

        listener.queue.put_nowait((datetime.now(), event))

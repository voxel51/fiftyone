"""
FiftyOne Server events polling.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import asyncio
from dataclasses import asdict
from datetime import datetime
import time
import typing as t

from starlette.requests import Request

from fiftyone.core.session.events import (
    DeactivateNotebookCell,
    dict_factory,
    EventType,
    ListenPayload,
    StateUpdate,
)

from fiftyone.server.events.dispatch import dispatch_app_count
from fiftyone.server.events.initialize import (
    initialize_listener,
    is_app_listener,
)
from fiftyone.server.events.state import (
    Listener,
    decrement_app_count,
    get_listeners,
    get_requests,
    increment_app_count,
)

# a polling App cannot report that it left, so it counts as connected only
# while it keeps polling; generous because browsers throttle the timers of
# hidden tabs to about once a minute
_POLLING_LEASE_SECONDS = 90
_POLLING_SWEEP_SECONDS = 10

_polling_listener: t.Optional[t.Tuple[str, t.Set[t.Tuple[str, Listener]]]] = (
    None
)
_polling_leases: t.Dict[str, float] = {}
_polling_sweep: t.Optional[asyncio.Task] = None


async def dispatch_polling_event_listener(
    _: Request, payload: ListenPayload
) -> t.Dict:
    """Polling event listener interface

    Note:

        The polling event listener is a singleton, and is only a fallback for
        Google's Colaboratory connections

    Args:
        request: the event source request
        payload: the initialization payload

    Returns:
        A server sent event source
    """
    global _polling_listener
    sub = None

    if _polling_listener is not None:
        sub, _ = _polling_listener

    new_lease = is_app_listener(payload) and _renew_polling_lease(
        payload.subscription
    )

    if (
        sub != payload.subscription
        and payload.subscription not in get_listeners()
    ):
        try:
            data = await initialize_listener(payload)
        except BaseException:
            if new_lease:
                _end_polling_lease(payload.subscription)

            raise

        _polling_listener = (payload.subscription, data.request_listeners)

        return {
            "events": [
                {
                    "event": StateUpdate.get_event_name(),
                    "data": asdict(
                        StateUpdate(state=data.state),
                        dict_factory=dict_factory,
                    ),
                }
            ]
        }

    events: t.List[t.Tuple[datetime, EventType]] = []
    disconnect = False
    for _, listener in get_requests()[payload.subscription]:
        while listener.queue.qsize():
            event_tuple = listener.queue.get_nowait()
            if isinstance(event_tuple[1], DeactivateNotebookCell):
                disconnect = True

            events.append(event_tuple)

    if disconnect:
        # the App is gone; if its cell is reactivated, it polls again under
        # the same subscription and must initialize as a new client
        for event_name, listener in get_requests().pop(payload.subscription):
            get_listeners()[event_name].discard(listener)

        if sub == payload.subscription:
            _polling_listener = None

        _end_polling_lease(payload.subscription)

    events = sorted(events, key=lambda event: event[0])
    return {
        "events": [
            {
                "event": e.get_event_name(),
                "data": asdict(e, dict_factory=dict_factory),
            }
            for (_, e) in events
        ],
    }


def _renew_polling_lease(subscription: str) -> bool:
    """Renews a polling App's lease, counting the App if the lease is new.

    Args:
        subscription: the subscription of the App

    Returns:
        whether the lease is new
    """
    new = subscription not in _polling_leases
    _polling_leases[subscription] = time.monotonic()
    if new:
        increment_app_count(subscription)
        dispatch_app_count()
        _start_polling_sweep()

    return new


def _end_polling_lease(subscription: str) -> None:
    if _polling_leases.pop(subscription, None) is None:
        return

    decrement_app_count(subscription)
    dispatch_app_count()


def _expire_polling_leases(now: float) -> None:
    for subscription, renewed in list(_polling_leases.items()):
        if now - renewed > _POLLING_LEASE_SECONDS:
            _end_polling_lease(subscription)


def _start_polling_sweep() -> None:
    global _polling_sweep
    if _polling_sweep is None or _polling_sweep.done():
        _polling_sweep = asyncio.get_running_loop().create_task(
            _sweep_polling_leases()
        )


async def _sweep_polling_leases() -> None:
    while _polling_leases:
        await asyncio.sleep(_POLLING_SWEEP_SECONDS)
        _expire_polling_leases(time.monotonic())

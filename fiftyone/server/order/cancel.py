"""
FiftyOne Server order requests that stop reading when they are abandoned.

Order queries run on worker threads, where cancelling the awaiting coroutine
leaves the database operation running. Each request tags its queries with a
comment instead, and an abandoned request kills the operations carrying it.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import asyncio
import logging
import uuid

import fiftyone.core.odm as foo
from fiftyone.core.utils import run_sync_task

from fiftyone.server.order.backend import ORDER_MAX_TIME_MS, Budget, Cancelled

logger = logging.getLogger(__name__)

#: how often an abandoned request kills its operations until they stop
POLL_SECONDS = 0.25

_COMMENT_PREFIX = "fiftyone.order."
_DISCONNECT = "fiftyone.order.disconnect"

_killers = set()


async def run_bounded(request, fn, *args, max_time_ms=ORDER_MAX_TIME_MS):
    """Runs ``fn(*args, budget)`` on a worker thread under a fresh
    :class:`fiftyone.server.order.backend.Budget`.

    When ``request`` disconnects or the awaiting task is cancelled, the
    budget is marked cancelled, so ``fn`` runs no further queries, and the
    operations it has in flight are killed.

    Args:
        request: the ``starlette.requests.Request`` being served, or None
        fn: a synchronous callable whose last argument is the budget
        *args: the other arguments of ``fn``
        max_time_ms (ORDER_MAX_TIME_MS): the time limit of each query

    Returns:
        the return value of ``fn``

    Raises:
        Cancelled: if the request disconnected
    """
    budget = Budget(
        max_time_ms=max_time_ms,
        comment=_COMMENT_PREFIX + uuid.uuid4().hex,
    )
    task = asyncio.ensure_future(run_sync_task(fn, *args, budget))
    disconnect = _watch(request)
    try:
        if disconnect is not None:
            await asyncio.wait(
                {task, disconnect}, return_when=asyncio.FIRST_COMPLETED
            )
            if not task.done() and _succeeded(disconnect):
                raise Cancelled("the request was abandoned")

        # shielded: cancelling the worker's task would end it before the
        # operations it started are killed
        return await asyncio.shield(task)
    except (asyncio.CancelledError, Cancelled):
        budget.cancelled = True
        killer = asyncio.ensure_future(_kill_until_done(budget.comment, task))
        _killers.add(killer)
        killer.add_done_callback(_killers.discard)
        raise
    finally:
        _unwatch(request)


def kill_operations(comment: str) -> int:
    """Kills the database operations tagged with ``comment``.

    Returns:
        the number of operations killed
    """
    admin = foo.get_db_client().admin
    ops = admin.aggregate(
        [
            {"$currentOp": {"localOps": True}},
            {
                "$match": {
                    "$or": [
                        {"command.comment": comment},
                        {"cursor.originatingCommand.comment": comment},
                    ]
                }
            },
            {"$project": {"opid": 1}},
        ]
    )
    killed = 0
    for op in ops:
        try:
            admin.command("killOp", op=op["opid"])
            killed += 1
        except Exception as err:
            logger.debug("Failed to kill operation %s: %s", op["opid"], err)

    return killed


async def _kill_until_done(comment: str, task: asyncio.Future) -> None:
    """Kills until the worker finishes, which also catches a query that
    started after the first kill."""
    while not task.done():
        try:
            # not the sync task executor, whose workers may all be busy
            # with the queries being killed
            await asyncio.to_thread(kill_operations, comment)
        except Exception as err:
            logger.debug("Failed to kill operations %s: %s", comment, err)

        await asyncio.wait({task}, timeout=POLL_SECONDS)

    if not task.cancelled():
        task.exception()


def _watch(request):
    """A future that completes when the client of an HTTP request goes
    away, shared by the request's resolvers.

    ``Request.is_disconnected()`` cannot be used: behind a
    ``BaseHTTPMiddleware`` its receive always yields, so its immediate
    cancellation never reads the disconnect.
    """
    scope = getattr(request, "scope", None)
    if scope is None or scope.get("type") != "http":
        return None

    watch = request.scope.get(_DISCONNECT)
    if watch is None:
        watch = {
            "future": asyncio.ensure_future(_disconnected(request.receive)),
            "users": 0,
        }
        request.scope[_DISCONNECT] = watch

    watch["users"] += 1
    return watch["future"]


def _unwatch(request) -> None:
    watch = getattr(request, "scope", {}).get(_DISCONNECT)
    if watch is None:
        return

    watch["users"] -= 1
    if watch["users"] == 0:
        watch["future"].cancel()
        del request.scope[_DISCONNECT]


def _succeeded(future) -> bool:
    return future.done() and not future.cancelled() and not future.exception()


async def _disconnected(receive) -> None:
    while (await receive())["type"] != "http.disconnect":
        pass

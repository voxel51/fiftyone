"""
FiftyOne Server events tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import asyncio
import unittest
from unittest import mock

import fiftyone as fo
import fiftyone.core.state as fos

import fiftyone.core.session.events as fose

import fiftyone.server.events.dispatch as fosd
import fiftyone.server.events.listener as fosl
import fiftyone.server.events.initialize as fosi
import fiftyone.server.events.state as foss

from decorators import drop_datasets


class ServerEventsTests(unittest.TestCase):
    @drop_datasets
    def test_handle_dataset_changes(self):
        one: fo.Dataset = fo.Dataset("one")
        two: fo.Dataset = fo.Dataset("two")

        state = fos.StateDescription(dataset=one)
        fosi.handle_dataset_change(
            state, fosi.AppInitializer(dataset=two.name)
        )

        self.assertEqual(state.dataset.name, two.name)

        my_view = "myview"
        state = fos.StateDescription(dataset=one)
        two.save_view(my_view, two.limit(1))
        fosi.handle_dataset_change(
            state, fosi.AppInitializer(dataset=two.name, view=my_view)
        )
        self.assertEqual(state.dataset.name, two.name)
        self.assertEqual(state.view.name, my_view)

        my_workspace = fo.Space(children=[])
        state = fos.StateDescription(dataset=one)
        two.save_workspace("myworkspace", my_workspace)
        fosi.handle_dataset_change(
            state,
            fosi.AppInitializer(dataset=two.name, workspace=my_workspace.name),
        )
        self.assertEqual(state.dataset.name, two.name)
        self.assertEqual(state.spaces.name, my_workspace.name)

    @drop_datasets
    def test_handle_saved_view_changes(self):
        my_dataset: fo.Dataset = fo.Dataset("mydataset")
        my_view = my_dataset.limit(1)
        my_dataset.save_view("myview", my_view)

        state = fos.StateDescription(dataset=my_dataset)
        fosi.handle_saved_view(state, slug=my_view.name)
        self.assertEqual(state.view.name, my_view.name)

        my_other_view = my_dataset.limit(2)
        my_dataset.save_view("myotherview", my_other_view)
        state = fos.StateDescription(dataset=my_dataset, view=my_other_view)
        fosi.handle_saved_view(state, slug=my_view.name)
        self.assertEqual(state.view.name, my_view.name)

    @drop_datasets
    def test_handle_workspace_changes(self):
        my_dataset: fo.Dataset = fo.Dataset("mydataset")
        my_workspace = fo.Space(children=[])
        my_dataset.save_workspace("myworkspace", my_workspace)

        state = fos.StateDescription(dataset=my_dataset)
        fosi.handle_workspace(state, slug=my_workspace.name)
        self.assertEqual(state.spaces.name, my_workspace.name)

        my_other_workspace = fo.Space(children=[])
        my_dataset.save_workspace("myotherworkspace", my_other_workspace)
        state = fos.StateDescription(
            dataset=my_dataset, spaces=my_other_workspace
        )
        fosi.handle_workspace(state, slug=my_workspace.name)
        self.assertEqual(state.spaces.name, my_workspace.name)

    def test_set_state(self):
        state = fos.StateDescription()
        foss.set_state(state)
        self.assertEqual(state, foss.get_state())


class TestServerEvents(unittest.IsolatedAsyncioTestCase):
    async def test_dispatch_state_update(self):
        state = fos.StateDescription()
        await fosd.dispatch_event(None, fose.StateUpdate(state))
        self.assertEqual(state, foss.get_state())


class TestListenerDisconnect(unittest.IsolatedAsyncioTestCase):
    async def test_listener_disconnect(self):
        foss.increment_app_count()
        self.assertIsInstance(
            await fosl.disconnect(True, set()), fose.CloseSession
        )


_APP_EVENTS = [fose.AppCountUpdate.get_event_name()]


def _payload(subscription, initializer=None):
    return fose.ListenPayload(
        events=_APP_EVENTS,
        initializer=initializer or fose.AppInitializer(),
        subscription=subscription,
    )


def _read_counts(subscription):
    counts = []
    for listener in foss.get_listeners()[fose.AppCountUpdate.get_event_name()]:
        if listener.subscription == subscription:
            while not listener.queue.empty():
                counts.append(listener.queue.get_nowait()[1].count)

    return counts


class _Connection:
    """An event stream connection, opened and closed like a request."""

    def __init__(self, subscription, initializer=None):
        self.checked = asyncio.Event()
        self.closed = False
        self._events = fosl.add_event_listener(
            self, _payload(subscription, initializer=initializer)
        )

    async def is_disconnected(self):
        self.checked.set()
        return self.closed

    async def open(self):
        # an App's stream starts with its initial state
        await self._events.__anext__()

    async def stream(self):
        async for _ in self._events:
            pass

    async def close(self):
        self.closed = True
        await self.stream()


class TestAppCount(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        foss.set_state(fos.StateDescription())
        self._reset()

    def tearDown(self):
        self._reset()

    def _reset(self):
        foss._app_connections.clear()
        foss.get_listeners().clear()
        foss.get_requests().clear()

    def test_reconnect_counts_once(self):
        foss.increment_app_count("a")
        foss.increment_app_count("b")

        # "b" reconnects before its previous connection is seen to close
        foss.increment_app_count("b")
        self.assertEqual(foss.get_app_count(), 2)

        foss.decrement_app_count("b")
        self.assertEqual(foss.get_app_count(), 2)

        foss.decrement_app_count("b")
        self.assertEqual(foss.get_app_count(), 1)

        foss.decrement_app_count("b")
        self.assertEqual(foss.get_app_count(), 1)

    async def test_connect_and_disconnect_dispatch_count(self):
        a = _Connection("a")
        await a.open()
        self.assertEqual(_read_counts("a"), [1])

        b = _Connection("b")
        await b.open()
        self.assertEqual(_read_counts("a"), [2])
        self.assertEqual(_read_counts("b"), [2])

        await b.close()
        self.assertEqual(_read_counts("a"), [1])
        self.assertEqual(_read_counts("b"), [])

    async def test_reconnect_dispatches_unchanged_count(self):
        await _Connection("a").open()
        stale = _Connection("b")
        await stale.open()
        _read_counts("a")

        # both of "b"'s connections hear the count, though it has not
        # changed
        await _Connection("b").open()
        self.assertEqual(_read_counts("a"), [2])
        self.assertEqual(_read_counts("b"), [2, 2])

        await stale.close()
        self.assertEqual(_read_counts("a"), [2])

    async def test_unread_count_is_replaced(self):
        await _Connection("a").open()
        b = _Connection("b")
        await b.open()
        await b.close()

        # queues are last-in first-out, so a stale count must not linger
        # behind the latest one
        self.assertEqual(_read_counts("a"), [1])

    async def test_session_clients_are_not_counted(self):
        await _Connection("a").open()
        session = _Connection("session", initializer=fos.StateDescription())
        streaming = asyncio.create_task(session.stream())
        await session.checked.wait()

        self.assertEqual(foss.get_app_count(), 1)

        session.closed = True
        await streaming

    async def test_connecting_app_keeps_the_session_open(self):
        await _Connection("a").open()

        ready = asyncio.Event()
        initialize = fosl.initialize_listener

        async def slow_initialize(payload):
            await ready.wait()
            return await initialize(payload)

        with mock.patch.object(fosl, "initialize_listener", slow_initialize):
            opening = asyncio.create_task(_Connection("b").open())
            await asyncio.sleep(0)

            # "a" leaves while "b" is still loading
            closed = await fosl.disconnect(True, foss.get_requests()["a"], "a")
            self.assertIsNone(closed)

            ready.set()
            await opening

        self.assertEqual(_read_counts("b"), [1])

    async def test_failed_initialization_is_not_counted(self):
        await _Connection("a").open()
        _read_counts("a")

        async def failing_initialize(_):
            raise RuntimeError("initialization failed")

        with mock.patch.object(
            fosl, "initialize_listener", failing_initialize
        ):
            with self.assertRaises(RuntimeError):
                await _Connection("b").open()

        self.assertEqual(foss.get_app_count(), 1)
        self.assertEqual(_read_counts("a"), [1])

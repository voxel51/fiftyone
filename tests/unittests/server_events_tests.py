"""
FiftyOne Server events tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

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


def _app_payload(subscription):
    return fose.ListenPayload(
        events=[fose.AppCountUpdate.get_event_name()],
        initializer=fose.AppInitializer(),
        subscription=subscription,
    )


def _read_counts(subscription):
    counts = []
    for listener in foss.get_listeners()[fose.AppCountUpdate.get_event_name()]:
        if listener.subscription == subscription:
            while not listener.queue.empty():
                counts.append(listener.queue.get_nowait()[1].count)

    return counts


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
        await fosi.initialize_listener(_app_payload("a"))
        self.assertEqual(_read_counts("a"), [1])

        b = await fosi.initialize_listener(_app_payload("b"))
        self.assertEqual(_read_counts("a"), [2])
        self.assertEqual(_read_counts("b"), [2])

        await fosl.disconnect(True, b.request_listeners, "b")
        self.assertEqual(_read_counts("a"), [1])
        self.assertEqual(_read_counts("b"), [])

    async def test_reconnect_dispatches_unchanged_count(self):
        await fosi.initialize_listener(_app_payload("a"))
        stale = await fosi.initialize_listener(_app_payload("b"))
        _read_counts("a")

        # both of "b"'s connections hear the count, though it has not
        # changed
        await fosi.initialize_listener(_app_payload("b"))
        self.assertEqual(_read_counts("a"), [2])
        self.assertEqual(_read_counts("b"), [2, 2])

        await fosl.disconnect(True, stale.request_listeners, "b")
        self.assertEqual(_read_counts("a"), [2])

    async def test_unread_count_is_replaced(self):
        await fosi.initialize_listener(_app_payload("a"))
        b = await fosi.initialize_listener(_app_payload("b"))
        await fosl.disconnect(True, b.request_listeners, "b")

        # queues are last-in first-out, so a stale count must not linger
        # behind the latest one
        self.assertEqual(_read_counts("a"), [1])

    async def test_session_clients_are_not_counted(self):
        await fosi.initialize_listener(_app_payload("a"))
        await fosi.initialize_listener(
            fose.ListenPayload(
                events=[fose.AppCountUpdate.get_event_name()],
                initializer=fos.StateDescription(),
                subscription="session",
            )
        )

        self.assertEqual(foss.get_app_count(), 1)

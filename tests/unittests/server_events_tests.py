"""
FiftyOne Server events tests.

| Copyright 2017-2025, Voxel51, Inc.
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

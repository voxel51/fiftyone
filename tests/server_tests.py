"""
ServerService tests

To run a single test, modify the main code to:

```
singletest = unittest.TestSuite()
singletest.addTest(TESTCASE("<TEST METHOD NAME>"))
unittest.TextTestRunner().run(singletest)
```

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import json
import time
import unittest

from retrying import retry
import socketio

import fiftyone as fo
from fiftyone.constants import SERVER_ADDR
import fiftyone.core.client as foc
import fiftyone.core.odm as foo
import fiftyone.core.service as fos
from fiftyone.core.session import Session
from fiftyone.core.state import StateDescription


class TestClient(foc.BaseClient):
    """TestClient receiver to check results of events"""

    def __init__(self):
        super(TestClient, self).__init__("/state", StateDescription)


def _serialize(state):
    return StateDescription.from_dict(state.serialize()).serialize()


class ServerServiceTests(unittest.TestCase):
    """Tests for ServerService"""

    dataset = fo.Dataset("test")
    sample1 = fo.Sample(filepath="test_one.png")
    sample2 = fo.Sample(filepath="test_two.png")
    session = Session(remote=True)
    sio_client = socketio.Client()
    sio_client.eio.start_background_task = foc._start_background_task
    client = TestClient()
    sio_client.register_namespace(client)
    foc._connect(sio_client, SERVER_ADDR % 5151)
    _tmp = None

    @classmethod
    def setUpClass(cls):
        cls.dataset.add_sample(cls.sample1)
        cls.dataset.add_sample(cls.sample2)

    def tearDown(self):
        self._tmp = None

    def test_connect(self):
        self.assertIs(self.session._hc_client.connected, True)
        self.assertIs(self.client.connected, True)

    def test_update(self):
        self.session.dataset = self.dataset
        session = _serialize(self.session.state)
        time.sleep(0.2)
        client = self.client.data.serialize()
        self.assertEqual(session, client)

    def test_get_current_state(self):
        self.session.view = self.dataset.view().limit(1)
        session = _serialize(self.session.state)

        def callback(state_dict):
            self._tmp = state_dict

        self.client.emit("get_current_state", "", callback=callback)
        time.sleep(0.2)
        client = self._tmp
        self.assertEqual(session, client)

    def test_selection(self):
        self.client.emit("add_selection", self.sample1.id)
        time.sleep(0.2)
        self.assertIs(len(self.session.selected), 1)
        self.assertEqual(self.session.selected[0], self.sample1.id)
        self.client.emit("remove_selection", self.sample1.id)
        time.sleep(0.2)
        self.assertIs(len(self.session.selected), 0)

    def test_page(self):
        pass

    def test_lengths(self):
        pass

    def test_get_distributions(self):
        pass


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)

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
import os
import time
import unittest
import urllib

from retrying import retry
import socketio

import eta.core.utils as etau

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


WAIT = 0.2


class ServerServiceTests(unittest.TestCase):
    """Tests for ServerService"""

    image_url = "https://user-images.githubusercontent.com/3719547/74191434-8fe4f500-4c21-11ea-8d73-555edfce0854.png"
    test_one = os.path.abspath("./test_one.png")
    test_two = os.path.abspath("./test_two.png")
    dataset = fo.Dataset("test")
    sample1 = fo.Sample(filepath=test_one)
    sample2 = fo.Sample(filepath=test_two)
    session = Session(remote=True)
    sio_client = socketio.Client()
    sio_client.eio.start_background_task = foc._start_background_task
    client = TestClient()
    sio_client.register_namespace(client)
    foc._connect(sio_client, SERVER_ADDR % 5151)
    _tmp = None

    @classmethod
    def setUpClass(cls):
        urllib.request.urlretrieve(cls.image_url, cls.test_one)
        etau.copy_file(cls.test_one, cls.test_two)
        cls.dataset.add_sample(cls.sample1)
        cls.dataset.add_sample(cls.sample2)
        cls.sample1["scalar"] = 1
        cls.sample1["label"] = fo.Classification(label="test")
        cls.sample1.tags.append("tag")
        cls.sample1.save()

    @classmethod
    def tearDownClass(cls):
        etau.delete_file(cls.test_one)
        etau.delete_file(cls.test_two)

    def tearDown(self):
        self.session.dataset = None
        self._tmp = None

    def test_connect(self):
        self.assertIs(self.session._hc_client.connected, True)
        self.assertIs(self.client.connected, True)

    def test_update(self):
        self.session.dataset = self.dataset
        session = _serialize(self.session.state)
        time.sleep(WAIT)
        client = self.client.data.serialize()
        self.assertEqual(session, client)

    def test_get_current_state(self):
        self.session.view = self.dataset.view().limit(1)
        session = _serialize(self.session.state)

        def callback(state_dict):
            self._tmp = state_dict

        self.client.emit("get_current_state", "", callback=callback)
        time.sleep(WAIT)
        client = self._tmp
        self.assertEqual(session, client)

    def test_selection(self):
        self.client.emit("add_selection", self.sample1.id)
        time.sleep(WAIT)
        self.assertIs(len(self.session.selected), 1)
        self.assertEqual(self.session.selected[0], self.sample1.id)
        self.client.emit("remove_selection", self.sample1.id)
        time.sleep(WAIT)
        self.assertIs(len(self.session.selected), 0)

    def test_page(self):
        self.session.dataset = self.dataset
        time.sleep(WAIT)

        def callback(result):
            self._tmp = result

        self.client.emit("page", 1, callback=callback)
        time.sleep(WAIT)
        client = self._tmp
        self.assertIs(len(client["results"]), 2)

    def test_lengths(self):
        self.session.dataset = self.dataset
        labels = self.dataset.view().get_label_fields()
        tags = self.dataset.view().get_tags()

        def callback(data):
            self._tmp = data

        self.client.emit("lengths", "", callback=callback)
        time.sleep(WAIT)
        client = self._tmp

        def sort(l):
            return sorted(l, key=lambda f: f["_id"]["field"])

        self.assertEqual(sort(client["labels"]), sort(labels))
        self.assertEqual(client["tags"], tags)

    def test_get_distributions(self):
        self.session.dataset = self.dataset
        self.sample1.save()

        def callback(data):
            self._tmp = data

        self.client.emit("get_distributions", "tags", callback=callback)
        time.sleep(WAIT)
        client = self._tmp
        self.assertIs(len(client), 1)
        self.assertEqual(client[0]["data"], [{"key": "tag", "count": 1}])

        self.client.emit("get_distributions", "labels", callback=callback)
        time.sleep(WAIT)
        client = self._tmp
        self.assertIs(len(client), 1)
        self.assertEqual(client[0]["data"], [{"key": "test", "count": 1}])

        self.client.emit("get_distributions", "scalars", callback=callback)
        time.sleep(WAIT)
        client = self._tmp
        self.assertIs(len(client), 1)
        self.assertEqual(client[0]["data"], [{"key": "null", "count": 2}])


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)

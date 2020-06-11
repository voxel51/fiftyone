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


class ServerServiceTests(unittest.TestCase):
    """Tests for ServerService"""

    dataset = fo.Dataset("test")
    sample1 = fo.Sample(filepath="test_one.png")
    sample2 = fo.Sample(filepath="test_two.png")
    session = Session(remote=True)
    sio_receiver = socketio.Client()
    sio_receiver.eio.start_background_task = foc._start_background_task
    receiver = TestClient()
    sio_receiver.register_namespace(receiver)
    foc._connect(sio_receiver, SERVER_ADDR % 5151)

    @classmethod
    def setUpClass(cls):
        cls.dataset.add_sample(cls.sample1)
        cls.dataset.add_sample(cls.sample2)

    def tearDown(self):
        global receiver_result
        receiver_result = None

    def test_connect(self):
        self.assertIs(self.session._hc_client.connected, True)
        self.assertIs(self.receiver.connected, True)

    def test_update(self):
        self.session.dataset = self.dataset
        session = StateDescription.from_dict(
            self.session.state.serialize()
        ).serialize()
        time.sleep(0.5)
        receiver = StateDescription.from_dict(
            self.receiver.data.serialize()
        ).serialize()
        self.assertEqual(session, receiver)


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)

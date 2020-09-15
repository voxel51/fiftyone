"""
ServerService tests.

To run a single test, modify the main code to::

    singletest = unittest.TestSuite()
    singletest.addTest(TESTCASE("<TEST METHOD NAME>"))
    unittest.TextTestRunner().run(singletest)

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import json
import os
import time
import unittest
import urllib

import socketio

import eta.core.utils as etau

import fiftyone as fo
from fiftyone.constants import SERVER_ADDR
import fiftyone.core.client as foc
from fiftyone.core.session import (
    Session,
    _server_services,
    _subscribed_sessions,
)
from fiftyone.core.state import StateDescriptionWithDerivables


class AppClient(foc.BaseClient):
    """AppClient simulates the Application"""

    def __init__(self):
        self.response = None
        super(AppClient, self).__init__(
            "/state", StateDescriptionWithDerivables
        )

    def on_update(self, data):
        super(AppClient, self).on_update(data)
        self.response = True


def _serialize(state):
    return StateDescriptionWithDerivables.from_dict(
        state.serialize()
    ).serialize()


def _normalize_session(session):
    # convert from OrderedDict to dict, recursively
    session = json.loads(json.dumps(session))
    if isinstance(session.get("view", {}).get("view"), str):
        session["view"]["view"] = json.loads(session["view"]["view"])
    return session


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
    client = AppClient()
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
        cls.sample1["floats"] = [
            0.5,
            float("nan"),
            float("inf"),
            float("-inf"),
        ]
        cls.sample1.save()

    @classmethod
    def tearDownClass(cls):
        etau.delete_file(cls.test_one)
        etau.delete_file(cls.test_two)

    def step_connect(self):
        self.assertIs(self.session._hc_client.connected, True)
        self.assertIs(self.client.connected, True)

    def step_update(self):
        self.session.dataset = self.dataset
        self.wait_for_response()
        session = _serialize(self.session.state)
        client = self.client.data.serialize()
        self.assertEqual(
            _normalize_session(session), _normalize_session(client)
        )

    def step_get_current_state(self):
        self.maxDiff = None
        self.session.view = self.dataset.limit(1)
        self.wait_for_response()
        session = _serialize(self.session.state)
        self.client.emit(
            "get_current_state", "", callback=self.client_callback
        )
        client = self.wait_for_response()
        self.assertEqual(
            _normalize_session(session), _normalize_session(client)
        )
        self.assertEqual(
            sorted(client["tags"]), sorted(self.dataset.get_tags()),
        )
        self.assertEqual(client["view_count"], len(self.session.view))
        self.assertNotEqual(client["view_count"], len(self.dataset))

    def step_selection(self):
        self.client.emit("add_selection", self.sample1.id)
        self.wait_for_response(session=True)
        self.assertIs(len(self.session.selected), 1)
        self.assertEqual(self.session.selected[0], self.sample1.id)

        self.client.emit("remove_selection", self.sample1.id)
        self.wait_for_response(session=True)
        self.assertIs(len(self.session.selected), 0)

    def step_page(self):
        self.session.dataset = self.dataset
        self.wait_for_response()
        self.client.emit("page", 1, callback=self.client_callback)
        client = self.wait_for_response()
        results = client["results"]
        self.assertIs(len(results), 2)
        # this will raise an error if special floats exist that are not JSON
        # compliant
        json.dumps(results, allow_nan=False)

    def step_get_distributions(self):
        self.session.dataset = self.dataset
        self.wait_for_response()

        self.client.emit(
            "get_distributions", "tags", callback=self.client_callback
        )
        client = self.wait_for_response()
        self.assertIs(len(client), 1)
        self.assertEqual(client[0]["data"], [{"key": "tag", "count": 1}])

        self.client.emit(
            "get_distributions", "labels", callback=self.client_callback
        )
        client = self.wait_for_response()
        self.assertIs(len(client), 1)
        self.assertEqual(client[0]["data"], [{"key": "test", "count": 1}])

        self.client.emit(
            "get_distributions", "scalars", callback=self.client_callback
        )
        client = self.wait_for_response()
        self.assertIs(len(client), 1)
        self.assertEqual(client[0]["data"], [{"key": "null", "count": 2}])

    def step_sessions(self):
        other_session = Session(remote=True)
        other_session.dataset = self.dataset
        self.wait_for_response(session=True)
        self.assertEqual(str(self.session.dataset), str(other_session.dataset))
        other_session.view = self.dataset.limit(1)
        self.wait_for_response(session=True)
        self.assertEqual(str(self.session.view), str(other_session.view))

    def step_server_services(self):
        port = 5252
        session_one = Session(port=port, remote=True)
        session_two = Session(port=port, remote=True)
        self.assertEqual(len(_subscribed_sessions[port]), 2)
        self.assertEqual(len(_subscribed_sessions), 2)
        self.assertEqual(len(_server_services), 2)
        session_two.__del__()
        self.assertEqual(len(_subscribed_sessions[port]), 1)
        self.assertEqual(len(_subscribed_sessions), 2)
        self.assertEqual(len(_server_services), 2)
        session_one.__del__()
        self.assertEqual(len(_subscribed_sessions[port]), 0)
        self.assertEqual(len(_server_services), 1)

    def test_steps(self):
        for name, step in self.steps():
            try:
                step()
                self.session.dataset = None
                self.wait_for_response()
            except Exception as e:
                self.fail("{} failed ({}: {})".format(step, type(e), e))

    def wait_for_response(self, timeout=3, session=False):
        start_time = time.time()
        while time.time() < start_time + timeout:
            if session:
                if self.session._hc_client.updated:
                    self.session._hc_client.updated = False
                    return
            elif self.client.response:
                response = self.client.response
                self.client.response = None

                return response
            time.sleep(0.2)

        raise RuntimeError("No response after %f" % timeout)

    def client_callback(self, data):
        self.client.response = data

    def steps(self):
        for name in dir(self):
            if name.startswith("step_"):
                yield name, getattr(self, name)


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)

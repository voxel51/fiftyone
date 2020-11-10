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
import asyncio
import json
import os
import time
import unittest
import urllib

from bson import ObjectId
import numpy as np
from tornado.testing import AsyncHTTPTestCase
from tornado.websocket import websocket_connect

import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone as fo
from fiftyone.server.json_util import FiftyOneJSONEncoder
import fiftyone.server.main as fosm


class TestCase(AsyncHTTPTestCase):
    def get_app(self):
        return fosm.Application()

    def fetch_and_parse(self, path):
        response = self.fetch(path)
        return etas.load_json(response.body)


class RouteTests(TestCase):
    def test_fiftyone(self):
        response = self.fetch_and_parse("/fiftyone")
        self.assertEqual(response, fosm.FiftyOneHandler.get_response())

    def test_stages(self):
        response = self.fetch_and_parse("/stages")
        self.assertEqual(response, fosm.StagesHandler.get_response())

    def test_filepath(self):
        data = {"hello": "world"}
        with etau.TempDir() as tmp:
            path = os.path.join(tmp, "data.json")
            etas.write_json(data, path)
            response = self.fetch_and_parse("/filepath%s" % path)

        self.assertEqual(response, data)


class StateTests(TestCase):

    image_url = "https://user-images.githubusercontent.com/3719547/74191434-8fe4f500-4c21-11ea-8d73-555edfce0854.png"
    test_one = os.path.abspath("./test_one.png")
    test_two = os.path.abspath("./test_two.png")
    dataset = fo.Dataset("test")
    sample1 = fo.Sample(filepath=test_one)
    sample2 = fo.Sample(filepath=test_two)

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

    def setUp(self):
        super().setUp()
        self.__app_client = websocket_connect(self.get_http_port())
        self.send(self.app, "as_app", {})
        self.__session_client = websocket_connect(self.get_http_port())

    @property
    def app(self):
        return self.__app_client

    @property
    def session(self):
        return self.__session_client

    def get_socket_path(self):
        return "ws://localhost:%d/state" % self.get_http_port()

    def send(self, client, event, message={}):
        client.write_message(FiftyOneJSONEncoder.dumps(message))
        self.wait()

    def on(self, client, event):
        message = client.read_message()
        self.wait()
        message = FiftyOneJSONEncoder.loads(message)
        self.assertEqual(message.pop("type"), event)
        return message

    def test_page(self):
        print("hello")


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)

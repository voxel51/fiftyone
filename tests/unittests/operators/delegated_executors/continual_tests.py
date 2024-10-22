"""
FiftyOne continual delegated executor related tests.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest
import os
from unittest import mock

from fiftyone.operators.delegated_executors.continual import ContinualExecutor


class ContinualExecutorTests(unittest.TestCase):
    def setUp(self):
        self.executor = ContinualExecutor()

    def test_validate(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertRaises(
                RuntimeError,
                self.executor.validate,
            )

        with mock.patch.dict(
            os.environ,
            {
                "FIFTYONE_INTERNAL_SERVICE": "true",
            },
            clear=True,
        ):
            self.assertRaises(
                RuntimeError,
                self.executor.validate,
            )

        with mock.patch.dict(
            os.environ,
            {
                "FIFTYONE_INTERNAL_SERVICE": "true",
                "FIFTYONE_ENCRYPTION_KEY": "blah",
            },
            clear=True,
        ):
            self.assertRaises(RuntimeError, self.executor.validate)

        with mock.patch.dict(
            os.environ,
            {
                "FIFTYONE_INTERNAL_SERVICE": "true",
                "FIFTYONE_ENCRYPTION_KEY": "secret",
                "FIFTYONE_API_KEY": "secret2",
            },
            clear=True,
        ):
            self.executor.validate()

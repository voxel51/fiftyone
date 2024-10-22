"""
FiftyOne continual delegated executor related unit tests.
| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest
import tempfile
import os
from unittest import mock
from datetime import datetime

import fiftyone as fo
import fiftyone.operators.delegated_executors as food
import fiftyone.core.storage as fos


class ContinualExecutorTests(unittest.IsolatedAsyncioTestCase):
    def test_logging_enabled(self):
        with tempfile.TemporaryDirectory() as run_link_path:
            fo.config.delegated_operation_run_link_path = run_link_path
            doc_id = "test"
            executor = food.ContinualExecutor(interval=0)
            run_link = executor.create_run_link(doc_id)
            self.assertIsNotNone(executor.file_handler)
            self.assertIsNotNone(executor.temp_dir)
            self.assertIsNotNone(executor.log_path)
            self.assertTrue(fos.exists(executor.log_path))
            executor.flush_logs(run_link)
            now = datetime.utcnow()
            expected_run_link = fos.join(
                fo.config.delegated_operation_run_link_path,
                "do_logs",
                str(now.year),
                str(now.month),
                str(now.day),
                str(doc_id) + ".log",
            )
            self.assertEqual(expected_run_link, run_link)
            self.assertTrue(fos.exists(expected_run_link))

    def test_logging_disabled(self):
        fo.config.delegated_operation_run_link_path = None
        doc_id = "test"
        executor = food.ContinualExecutor(interval=0)
        run_link = executor.create_run_link(doc_id)
        executor.flush_logs(run_link)
        self.assertIsNone(executor.file_handler)
        self.assertIsNone(executor.temp_dir)
        self.assertIsNone(executor.log_path)
        self.assertIsNone(run_link)

    def test_validate(self):
        executor = food.ContinualExecutor(interval=0)
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertRaises(
                RuntimeError,
                executor.validate,
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
                executor.validate,
            )

        with mock.patch.dict(
            os.environ,
            {
                "FIFTYONE_INTERNAL_SERVICE": "true",
                "FIFTYONE_ENCRYPTION_KEY": "blah",
            },
            clear=True,
        ):
            self.assertRaises(RuntimeError, executor.validate)

        with mock.patch.dict(
            os.environ,
            {
                "FIFTYONE_INTERNAL_SERVICE": "true",
                "FIFTYONE_ENCRYPTION_KEY": "secret",
                "FIFTYONE_API_KEY": "secret2",
            },
            clear=True,
        ):
            executor.validate()

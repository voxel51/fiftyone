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
from unittest.mock import patch
from datetime import datetime

import fiftyone as fo
import fiftyone.operators.delegated_executors as foodx
import fiftyone.operators.executor as foe
import fiftyone.core.storage as fos
from fiftyone.operators.orchestrator import OrchestratorService
from fiftyone.operators.delegated import DelegatedOperationService
from fiftyone.operators.executor import ExecutionResult


class MockOperator:
    def __init__(self):
        self.id = "test"


class ContinualExecutorTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.do_svc = DelegatedOperationService()
        self.orch_svc = OrchestratorService()
        self.executor = foodx.ContinualExecutor(self.do_svc, self.orch_svc)

    def test_logging_enabled(self):
        with tempfile.TemporaryDirectory() as run_link_path:
            doc_id = "test"
            executor = foodx.ContinualExecutor(
                self.do_svc, self.orch_svc, run_link_path=run_link_path
            )
            run_link = executor.create_run_link(doc_id)
            self.assertIsNotNone(executor.file_handler)
            self.assertIsNotNone(executor.temp_dir)
            self.assertIsNotNone(executor.log_path)
            self.assertTrue(fos.exists(executor.log_path))
            executor.flush_logs(run_link)
            now = datetime.utcnow()
            expected_run_link = fos.join(
                run_link_path,
                "do_logs",
                str(now.year),
                str(now.month),
                str(now.day),
                str(doc_id) + ".log",
            )
            self.assertEqual(expected_run_link, run_link)
            self.assertTrue(fos.exists(expected_run_link))

    def test_logging_disabled(self):
        doc_id = "test"
        run_link = self.executor.create_run_link(doc_id)
        self.executor.flush_logs(run_link)
        self.assertIsNone(self.executor.file_handler)
        self.assertIsNone(self.executor.temp_dir)
        self.assertIsNone(self.executor.log_path)
        self.assertIsNone(run_link)

    @patch.object(
        DelegatedOperationService,
        "list_operations",
    )
    @patch.object(
        DelegatedOperationService,
        "execute_operation",
    )
    def test_execute(self, mock_execute_operation, mock_list_operations):
        mock_results = ExecutionResult()
        mock_operator = MockOperator()
        mock_list_operations.return_value = [mock_operator]
        mock_execute_operation.return_value = mock_results
        self.executor.execute()
        mock_list_operations.assert_called_once_with(
            run_state=foe.ExecutionRunState.QUEUED,
            paging=mock.ANY,
            delegation_target=self.executor.instance_id,
        )
        mock_execute_operation.assert_called_once_with(
            mock_operator, log=True, run_link=None
        )

    @patch.object(
        OrchestratorService,
        "register",
        return_value=None,
    )
    def test_register(self, mock_register):
        self.executor.register()
        mock_register.assert_called_once_with(
            instance_id=self.executor.instance_id,
            description=self.executor.instance_desc,
        )

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
            self.executor.validate()
